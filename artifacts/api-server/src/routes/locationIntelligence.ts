/**
 * locationIntelligence.ts
 * 地點智慧系統 — 利用歷史訂單資料提供地址自動完成、智慧報價、司機熟悉度分析
 */
import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── GET /api/locations/autocomplete ──────────────────────────────────────────
// 輸入關鍵字，從歷史訂單取得地址建議 + 平均報價 + 最近使用時間
router.get("/autocomplete", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const type = String(req.query.type ?? "both"); // pickup | delivery | both
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;
  const limit = Math.min(Number(req.query.limit ?? 8), 20);

  if (q.length < 1) return res.json([]);

  const pattern = `%${q}%`;
  const customerFilter = customerId ? `AND customer_id = $2` : "";
  const params: any[] = [pattern];
  if (customerId) params.push(customerId);

  let addressCol: string;
  if (type === "pickup") {
    addressCol = "pickup_address";
  } else if (type === "delivery") {
    addressCol = "delivery_address";
  } else {
    // Both — union pickup + delivery
    const { rows } = await pool.query(
      `SELECT address, SUM(cnt) AS frequency,
              ROUND(AVG(avg_price)::numeric, 0) AS avg_price,
              MAX(last_used) AS last_used
       FROM (
         SELECT pickup_address AS address, COUNT(*) AS cnt,
                AVG(CASE WHEN total_fee > 0 THEN total_fee END) AS avg_price,
                MAX(created_at) AS last_used
         FROM orders
         WHERE pickup_address ILIKE $1 AND pickup_address <> '' ${customerId ? "AND customer_id = $2" : ""}
         GROUP BY pickup_address
         UNION ALL
         SELECT delivery_address AS address, COUNT(*) AS cnt,
                AVG(CASE WHEN total_fee > 0 THEN total_fee END) AS avg_price,
                MAX(created_at) AS last_used
         FROM orders
         WHERE delivery_address ILIKE $1 AND delivery_address <> '' ${customerId ? "AND customer_id = $2" : ""}
         GROUP BY delivery_address
       ) sub
       GROUP BY address
       ORDER BY frequency DESC, last_used DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    return res.json(rows);
  }

  const { rows } = await pool.query(
    `SELECT ${addressCol} AS address, COUNT(*) AS frequency,
            ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
            MAX(created_at) AS last_used
     FROM orders
     WHERE ${addressCol} ILIKE $1 AND ${addressCol} <> '' ${customerFilter}
     GROUP BY ${addressCol}
     ORDER BY frequency DESC, last_used DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/popular ───────────────────────────────────────────────
// 最熱門地點排行（可分 pickup / delivery）
router.get("/popular", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const { rows } = await pool.query(
    `SELECT address, type, frequency, avg_price, driver_count, last_used
     FROM (
       SELECT pickup_address AS address, 'pickup' AS type,
              COUNT(*) AS frequency,
              ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
              COUNT(DISTINCT driver_id) AS driver_count,
              MAX(created_at) AS last_used
       FROM orders WHERE pickup_address <> ''
       GROUP BY pickup_address
       UNION ALL
       SELECT delivery_address AS address, 'delivery' AS type,
              COUNT(*) AS frequency,
              ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
              COUNT(DISTINCT driver_id) AS driver_count,
              MAX(created_at) AS last_used
       FROM orders WHERE delivery_address <> ''
       GROUP BY delivery_address
     ) sub
     ORDER BY frequency DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/route-stats ───────────────────────────────────────────
// 常跑路線統計（pickup→delivery 配對頻次）
router.get("/route-stats", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const { rows } = await pool.query(
    `SELECT pickup_address, delivery_address,
            COUNT(*) AS trip_count,
            ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
            MIN(CASE WHEN total_fee > 0 THEN total_fee END) AS min_price,
            MAX(CASE WHEN total_fee > 0 THEN total_fee END) AS max_price,
            COUNT(DISTINCT driver_id) AS driver_count,
            MAX(created_at) AS last_trip
     FROM orders
     WHERE pickup_address <> '' AND delivery_address <> ''
     GROUP BY pickup_address, delivery_address
     HAVING COUNT(*) >= 1
     ORDER BY trip_count DESC, last_trip DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/suggest-price ─────────────────────────────────────────
// 智慧報價：同路線的平均、最低、最高報價
router.get("/suggest-price", async (req, res) => {
  const pickup   = String(req.query.pickup ?? "").trim();
  const delivery = String(req.query.delivery ?? "").trim();
  if (!pickup || !delivery) return res.json(null);

  const { rows } = await pool.query(
    `SELECT
       ROUND(AVG(total_fee)::numeric, 0)    AS avg_price,
       MIN(total_fee)                        AS min_price,
       MAX(total_fee)                        AS max_price,
       COUNT(*)                              AS sample_count,
       MAX(created_at)                       AS last_trip
     FROM orders
     WHERE pickup_address ILIKE $1
       AND delivery_address ILIKE $2
       AND total_fee > 0`,
    [`%${pickup}%`, `%${delivery}%`],
  );
  const row = rows[0];
  if (!row || !row.avg_price) return res.json(null);
  res.json(row);
});

// ─── GET /api/locations/driver-familiarity ────────────────────────────────────
// 哪些司機跑過這個地點（最適合派這趟）
router.get("/driver-familiarity", async (req, res) => {
  const address = String(req.query.address ?? "").trim();
  if (!address) return res.json([]);
  const limit = Math.min(Number(req.query.limit ?? 5), 20);

  const { rows } = await pool.query(
    `SELECT d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone,
            COUNT(*) AS trip_count,
            ROUND(AVG(o.total_fee)::numeric, 0) AS avg_price,
            MAX(o.created_at) AS last_trip
     FROM orders o
     JOIN drivers d ON d.id = o.driver_id
     WHERE d.is_active = true
       AND (o.pickup_address ILIKE $1 OR o.delivery_address ILIKE $1)
     GROUP BY d.id, d.name, d.phone
     ORDER BY trip_count DESC, last_trip DESC
     LIMIT $2`,
    [`%${address}%`, limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/customer-history ──────────────────────────────────────
// 特定客戶的歷史地點（一鍵帶入）
router.get("/customer-history", async (req, res) => {
  const customerId   = req.query.customer_id ? Number(req.query.customer_id) : null;
  const customerPhone = req.query.phone ? String(req.query.phone).trim() : null;
  if (!customerId && !customerPhone) return res.json([]);

  const conditions = customerId
    ? `customer_id = $1`
    : `customer_phone = $1`;
  const param = customerId ?? customerPhone;

  const { rows } = await pool.query(
    `SELECT
       pickup_address, delivery_address,
       cargo_name, cargo_description,
       COUNT(*) AS trip_count,
       ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
       MAX(created_at) AS last_trip
     FROM orders
     WHERE ${conditions}
       AND pickup_address <> '' AND delivery_address <> ''
     GROUP BY pickup_address, delivery_address, cargo_name, cargo_description
     ORDER BY MAX(created_at) DESC
     LIMIT 10`,
    [param],
  );
  res.json(rows);
});

// ─── GET /api/locations/address-detail ───────────────────────────────────────
// 單一地址的完整分析（for 下單表單的 tooltip）
router.get("/address-detail", async (req, res) => {
  const address = String(req.query.address ?? "").trim();
  if (!address) return res.json(null);

  const [statsRes, driversRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS trip_count,
              ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
              COUNT(DISTINCT driver_id) AS driver_count,
              MAX(created_at) AS last_trip
       FROM orders
       WHERE (pickup_address ILIKE $1 OR delivery_address ILIKE $1)`,
      [`%${address}%`],
    ),
    pool.query(
      `SELECT d.id, d.name, COUNT(*) AS trips
       FROM orders o JOIN drivers d ON d.id = o.driver_id
       WHERE d.is_active = true
         AND (o.pickup_address ILIKE $1 OR o.delivery_address ILIKE $1)
       GROUP BY d.id, d.name ORDER BY trips DESC LIMIT 3`,
      [`%${address}%`],
    ),
  ]);
  res.json({ stats: statsRes.rows[0], familiar_drivers: driversRes.rows });
});

export default router;
