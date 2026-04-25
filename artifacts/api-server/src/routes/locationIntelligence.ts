/**
 * locationIntelligence.ts
 * 地點智慧系統 API — 使用 location_history / customer_addresses 資料表
 * + 向後兼容：autocomplete/suggest-price/driver-familiarity/route-stats/popular
 *   繼續查 orders 表（確保即時資料）
 */
import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── GET /api/locations/search ─────────────────────────────────────────────────
// 地址自動完成（優先查 location_history 表）
router.get("/search", async (req, res) => {
  const q        = String(req.query.q ?? "").trim();
  const type     = String(req.query.type ?? "both");
  const limit    = Math.min(Number(req.query.limit ?? 8), 20);
  if (!q) return res.json([]);

  const typeFilter = type === "pickup" || type === "delivery"
    ? `AND (lh.location_type = '${type}' OR lh.location_type = 'both')`
    : "";

  const { rows } = await pool.query(
    `SELECT
       lh.address,
       lh.city,
       lh.district,
       lh.place_name,
       lh.place_type,
       lh.visit_count,
       lh.lat,
       lh.lng,
       lh.location_type,
       lh.notes,
       lh.last_visited_at
     FROM location_history lh
     WHERE lh.address ILIKE $1 ${typeFilter}
     ORDER BY lh.visit_count DESC, lh.last_visited_at DESC
     LIMIT $2`,
    [`%${q}%`, limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/autocomplete ──────────────────────────────────────────
// 向後兼容版（查 orders 表，返回含 avg_price）
router.get("/autocomplete", async (req, res) => {
  const q          = String(req.query.q ?? "").trim();
  const type       = String(req.query.type ?? "both");
  const customerId = req.query.customer_id ? Number(req.query.customer_id) : null;
  const limit      = Math.min(Number(req.query.limit ?? 8), 20);
  if (q.length < 1) return res.json([]);

  const pattern        = `%${q}%`;
  const customerFilter = customerId ? `AND customer_id = $2` : "";
  const params: any[]  = [pattern];
  if (customerId) params.push(customerId);

  if (type !== "pickup" && type !== "delivery") {
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

  const col = type === "pickup" ? "pickup_address" : "delivery_address";
  const { rows } = await pool.query(
    `SELECT ${col} AS address, COUNT(*) AS frequency,
            ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
            MAX(created_at) AS last_used
     FROM orders
     WHERE ${col} ILIKE $1 AND ${col} <> '' ${customerFilter}
     GROUP BY ${col}
     ORDER BY frequency DESC, last_used DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/frequent ──────────────────────────────────────────────
// 最常用地點排行（from location_history）
router.get("/frequent", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const type  = req.query.type ? String(req.query.type) : null;

  const typeWhere = type ? `AND (location_type = $2 OR location_type = 'both')` : "";
  const params: any[] = [limit];
  if (type) params.unshift(type); // becomes $1

  const { rows } = await pool.query(
    `SELECT
       id, address, city, district, place_name, place_type, location_type,
       visit_count, last_visited_at, first_visited_at,
       lat, lng, notes,
       jsonb_array_length(COALESCE(customer_ids,'[]'::jsonb)) AS customer_count,
       jsonb_array_length(COALESCE(driver_ids,'[]'::jsonb))   AS driver_count
     FROM location_history
     WHERE address <> '' ${typeWhere}
     ORDER BY visit_count DESC, last_visited_at DESC
     LIMIT $${params.length}`,
    type ? [type, limit] : [limit],
  );
  res.json(rows);
});

// ─── GET /api/locations/popular ───────────────────────────────────────────────
// 熱門地點（從 orders 表即時聚合）
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

// ─── GET /api/locations/customer/:customerId ───────────────────────────────────
// 特定客戶的常用地址
router.get("/customer/:customerId", async (req, res) => {
  const customerId = Number(req.params.customerId);
  if (!customerId) return res.status(400).json({ error: "Invalid customer ID" });

  const { rows } = await pool.query(
    `SELECT
       ca.id, ca.address, ca.label, ca.use_count, ca.last_used_at, ca.is_favorite,
       lh.place_name, lh.lat, lh.lng, lh.notes, lh.place_type, lh.visit_count
     FROM customer_addresses ca
     LEFT JOIN location_history lh ON lh.address = ca.address
     WHERE ca.customer_id = $1
     ORDER BY ca.is_favorite DESC, ca.use_count DESC, ca.last_used_at DESC`,
    [customerId],
  );
  res.json(rows);
});

// ─── PATCH /api/locations/customer/:customerId/favorite ───────────────────────
// 設定/取消收藏
router.patch("/customer/:customerId/favorite", async (req, res) => {
  const customerId = Number(req.params.customerId);
  const { address, is_favorite } = req.body;
  if (!customerId || !address) return res.status(400).json({ error: "Missing fields" });

  await pool.query(
    `UPDATE customer_addresses SET is_favorite = $1 WHERE customer_id = $2 AND address = $3`,
    [!!is_favorite, customerId, address],
  );
  res.json({ ok: true });
});

// ─── GET /api/locations/stats ─────────────────────────────────────────────────
// 地點統計總覽
router.get("/stats", async (req, res) => {
  const [totRes, newRes, topRes, cityRes] = await Promise.all([
    // 總地點數
    pool.query(`SELECT COUNT(*) AS total FROM location_history`),
    // 本月新增地點
    pool.query(`
      SELECT COUNT(*) AS new_this_month
      FROM location_history
      WHERE first_visited_at >= date_trunc('month', NOW())
    `),
    // 最常用前 10 名
    pool.query(`
      SELECT address, place_name, visit_count, location_type, lat, lng
      FROM location_history
      ORDER BY visit_count DESC LIMIT 10
    `),
    // 各縣市分佈
    pool.query(`
      SELECT COALESCE(city, '未知') AS city, COUNT(*) AS count
      FROM location_history
      WHERE address <> ''
      GROUP BY city ORDER BY count DESC LIMIT 20
    `),
  ]);
  res.json({
    total:          Number(totRes.rows[0].total),
    new_this_month: Number(newRes.rows[0].new_this_month),
    top10:          topRes.rows,
    city_dist:      cityRes.rows,
  });
});

// ─── POST /api/locations/import ───────────────────────────────────────────────
// 批次匯入歷史地點（JSON body: [{ address, place_name, place_type, notes, city }]）
router.post("/import", async (req, res) => {
  const items: Array<{
    address: string; place_name?: string; place_type?: string;
    notes?: string; city?: string; district?: string;
    lat?: number; lng?: number;
  }> = Array.isArray(req.body) ? req.body : [];

  if (!items.length) return res.status(400).json({ error: "No items provided" });

  let inserted = 0;
  let updated  = 0;
  for (const item of items) {
    if (!item.address?.trim()) continue;
    const r = await pool.query(
      `INSERT INTO location_history
         (address, city, district, place_name, place_type, notes, lat, lng,
          location_type, visit_count, first_visited_at, last_visited_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'both',1,NOW(),NOW())
       ON CONFLICT (address) DO UPDATE SET
         place_name = COALESCE(EXCLUDED.place_name, location_history.place_name),
         place_type = COALESCE(EXCLUDED.place_type, location_history.place_type),
         notes      = COALESCE(EXCLUDED.notes, location_history.notes),
         lat        = COALESCE(EXCLUDED.lat, location_history.lat),
         lng        = COALESCE(EXCLUDED.lng, location_history.lng),
         updated_at = NOW()
       RETURNING (xmax = 0) AS is_new`,
      [item.address.trim(), item.city ?? null, item.district ?? null,
       item.place_name ?? null, item.place_type ?? null,
       item.notes ?? null, item.lat ?? null, item.lng ?? null],
    );
    if (r.rows[0]?.is_new) inserted++; else updated++;
  }
  res.json({ inserted, updated, total: inserted + updated });
});

// ─── PATCH /api/locations/:id ─────────────────────────────────────────────────
// 更新地點商業資訊
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { place_name, place_type, notes, lat, lng } = req.body;
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const { rows } = await pool.query(
    `UPDATE location_history SET
       place_name = COALESCE($2, place_name),
       place_type = COALESCE($3, place_type),
       notes      = COALESCE($4, notes),
       lat        = COALESCE($5, lat),
       lng        = COALESCE($6, lng),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, place_name ?? null, place_type ?? null, notes ?? null,
     lat ?? null, lng ?? null],
  );
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// ─── GET /api/locations/route-stats ───────────────────────────────────────────
// 常跑路線統計（from orders）
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
router.get("/suggest-price", async (req, res) => {
  const pickup   = String(req.query.pickup ?? "").trim();
  const delivery = String(req.query.delivery ?? "").trim();
  if (!pickup || !delivery) return res.json(null);

  const { rows } = await pool.query(
    `SELECT
       ROUND(AVG(total_fee)::numeric, 0) AS avg_price,
       MIN(total_fee)                    AS min_price,
       MAX(total_fee)                    AS max_price,
       COUNT(*)                          AS sample_count,
       MAX(created_at)                   AS last_trip
     FROM orders
     WHERE pickup_address ILIKE $1 AND delivery_address ILIKE $2 AND total_fee > 0`,
    [`%${pickup}%`, `%${delivery}%`],
  );
  const row = rows[0];
  if (!row || !row.avg_price) return res.json(null);
  res.json(row);
});

// ─── GET /api/locations/driver-familiarity ────────────────────────────────────
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
router.get("/customer-history", async (req, res) => {
  const customerId    = req.query.customer_id ? Number(req.query.customer_id) : null;
  const customerPhone = req.query.phone ? String(req.query.phone).trim() : null;
  if (!customerId && !customerPhone) return res.json([]);

  const conditions = customerId ? `customer_id = $1` : `customer_phone = $1`;
  const param      = customerId ?? customerPhone;

  const { rows } = await pool.query(
    `SELECT pickup_address, delivery_address, cargo_name, cargo_description,
            COUNT(*) AS trip_count,
            ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
            MAX(created_at) AS last_trip
     FROM orders
     WHERE ${conditions} AND pickup_address <> '' AND delivery_address <> ''
     GROUP BY pickup_address, delivery_address, cargo_name, cargo_description
     ORDER BY MAX(created_at) DESC LIMIT 10`,
    [param],
  );
  res.json(rows);
});

// ─── GET /api/locations/address-detail ───────────────────────────────────────
router.get("/address-detail", async (req, res) => {
  const address = String(req.query.address ?? "").trim();
  if (!address) return res.json(null);

  const [lhRes, statsRes, driversRes] = await Promise.all([
    pool.query(`SELECT * FROM location_history WHERE address ILIKE $1 LIMIT 1`, [`%${address}%`]),
    pool.query(
      `SELECT COUNT(*) AS trip_count,
              ROUND(AVG(CASE WHEN total_fee > 0 THEN total_fee END)::numeric, 0) AS avg_price,
              COUNT(DISTINCT driver_id) AS driver_count,
              MAX(created_at) AS last_trip
       FROM orders WHERE (pickup_address ILIKE $1 OR delivery_address ILIKE $1)`,
      [`%${address}%`],
    ),
    pool.query(
      `SELECT d.id, d.name, COUNT(*) AS trips
       FROM orders o JOIN drivers d ON d.id = o.driver_id
       WHERE d.is_active = true AND (o.pickup_address ILIKE $1 OR o.delivery_address ILIKE $1)
       GROUP BY d.id, d.name ORDER BY trips DESC LIMIT 3`,
      [`%${address}%`],
    ),
  ]);
  res.json({
    location:        lhRes.rows[0] ?? null,
    stats:           statsRes.rows[0],
    familiar_drivers: driversRes.rows,
  });
});

export default router;
