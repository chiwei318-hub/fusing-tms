/**
 * platformFleets.ts
 * 平台管理端 — 加盟車行管理（黃老闆專用）
 *
 * GET    /api/platform/fleets              列出所有加盟車行
 * GET    /api/platform/fleets/:id          取得車行詳情
 * POST   /api/platform/fleets              建立加盟車行
 * PATCH  /api/platform/fleets/:id          更新車行設定（含抽成比例）
 * DELETE /api/platform/fleets/:id          停用車行
 * GET    /api/platform/fleets/:id/drivers  列出車行旗下司機
 * GET    /api/platform/fleets/:id/salary   車行旗下薪資總覽
 * GET    /api/platform/fleets/:id/stats    車行績效統計
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { createHash, randomBytes } from "crypto";

export const platformFleetsRouter = Router();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

// ── LIST ─────────────────────────────────────────────────────────────────────
platformFleetsRouter.get("/platform/fleets", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      f.*,
      COUNT(DISTINCT d.id)::int                          AS driver_count,
      COUNT(DISTINCT CASE WHEN d.status='available' THEN d.id END)::int AS available_drivers,
      COALESCE(
        (SELECT SUM(driver_payout) FROM driver_salary_records
         WHERE franchisee_id = f.id
           AND period_year = EXTRACT(YEAR FROM NOW())
           AND period_month = EXTRACT(MONTH FROM NOW())), 0
      )::numeric                                         AS this_month_payout
    FROM franchisees f
    LEFT JOIN drivers d ON d.franchisee_id = f.id
    GROUP BY f.id
    ORDER BY f.code
  `);
  res.json({ ok: true, fleets: rows });
});

// ── GET ONE ──────────────────────────────────────────────────────────────────
platformFleetsRouter.get("/platform/fleets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT f.*,
       COUNT(DISTINCT d.id)::int AS driver_count
     FROM franchisees f
     LEFT JOIN drivers d ON d.franchisee_id = f.id
     WHERE f.id = $1 GROUP BY f.id`,
    [id]
  );
  if (!rows[0]) return res.status(404).json({ error: "車行不存在" });
  res.json({ ok: true, fleet: rows[0] });
});

// ── CREATE ───────────────────────────────────────────────────────────────────
platformFleetsRouter.post("/platform/fleets", async (req, res) => {
  const {
    name,
    owner_name,
    phone,
    email = null,
    address = null,
    username,
    password,
    platform_commission_rate = 10,
    commission_rate = 70,
    contact_person = null,
    zone_name = null,
    notes = null,
  } = req.body ?? {};

  if (!name || !username || !password) {
    return res.status(400).json({ error: "name、username、password 為必填" });
  }

  // Generate fleet code (FM001, FM002 ...)
  const codeRow = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 3) AS INT)), 0) + 1 AS next_num
     FROM franchisees WHERE code ~ '^FM[0-9]+$'`
  );
  const code = `FM${String(codeRow.rows[0].next_num).padStart(3, "0")}`;

  const passwordHash = hashPassword(password);

  const { rows } = await pool.query(
    `INSERT INTO franchisees
       (code, name, owner_name, phone, email, address, username, password_hash,
        platform_commission_rate, commission_rate, contact_person,
        zone_name, notes, status, joined_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',NOW(),NOW(),NOW())
     RETURNING *`,
    [code, name, owner_name, phone, email, address, username, passwordHash,
     platform_commission_rate, commission_rate, contact_person, zone_name, notes]
  );
  res.status(201).json({ ok: true, fleet: rows[0] });
});

// ── UPDATE ───────────────────────────────────────────────────────────────────
platformFleetsRouter.patch("/platform/fleets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = [
    "name", "owner_name", "phone", "email", "address",
    "platform_commission_rate", "commission_rate", "status",
    "contact_person", "zone_name", "notes",
  ];

  const updates: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];

  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }

  // Handle password change
  if (req.body.password) {
    vals.push(hashPassword(req.body.password));
    updates.push(`password_hash = $${vals.length}`);
  }

  if (vals.length === 0) return res.status(400).json({ error: "無可更新欄位" });

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE franchisees SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "車行不存在" });
  res.json({ ok: true, fleet: rows[0] });
});

// ── DELETE ───────────────────────────────────────────────────────────────────
platformFleetsRouter.delete("/platform/fleets/:id", async (req, res) => {
  await pool.query(
    `UPDATE franchisees SET status='suspended', updated_at=NOW() WHERE id=$1`,
    [Number(req.params.id)]
  );
  res.json({ ok: true });
});

// ── FLEET DRIVERS LIST ────────────────────────────────────────────────────────
platformFleetsRouter.get("/platform/fleets/:id/drivers", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, phone, vehicle_type, license_plate, status,
            commission_rate, latitude, longitude, last_location_at
     FROM drivers WHERE franchisee_id = $1 ORDER BY name`,
    [Number(req.params.id)]
  );
  res.json({ ok: true, drivers: rows });
});

// ── SALARY OVERVIEW ───────────────────────────────────────────────────────────
platformFleetsRouter.get("/platform/fleets/:id/salary", async (req, res) => {
  const id = Number(req.params.id);
  const year  = Number(req.query.year  ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);

  const { rows } = await pool.query(
    `SELECT s.*, d.name AS driver_name, d.phone AS driver_phone
     FROM driver_salary_records s
     JOIN drivers d ON d.id = s.driver_id
     WHERE s.franchisee_id = $1 AND s.period_year = $2 AND s.period_month = $3
     ORDER BY d.name`,
    [id, year, month]
  );
  const totals = await pool.query(
    `SELECT
       SUM(gross_amount)::numeric   AS total_gross,
       SUM(driver_payout)::numeric  AS total_driver_payout,
       SUM(fleet_income)::numeric   AS total_fleet_income,
       SUM(platform_fee)::numeric   AS total_platform_fee,
       COUNT(*)::int                AS driver_count
     FROM driver_salary_records
     WHERE franchisee_id = $1 AND period_year = $2 AND period_month = $3`,
    [id, year, month]
  );
  res.json({ ok: true, records: rows, totals: totals.rows[0] });
});

// ── FLEET STATS ───────────────────────────────────────────────────────────────
platformFleetsRouter.get("/platform/fleets/:id/stats", async (req, res) => {
  const id = Number(req.params.id);
  const drivers = await pool.query(
    `SELECT
       COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE status='available')           AS available,
       COUNT(*) FILTER (WHERE status='busy')                AS busy,
       COUNT(*) FILTER (WHERE status='offline')             AS offline
     FROM drivers WHERE franchisee_id = $1`,
    [id]
  );
  const leaves = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status='pending') AS pending_leaves
     FROM driver_leaves WHERE franchisee_id = $1`,
    [id]
  );
  res.json({
    ok: true,
    drivers: drivers.rows[0],
    leaves: leaves.rows[0],
  });
});
