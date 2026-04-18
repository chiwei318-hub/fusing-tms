/**
 * shopeeDrivers.ts — 蝦皮司機名單管理
 *
 * GET    /api/shopee-drivers           列出全部
 * POST   /api/shopee-drivers           新增
 * POST   /api/shopee-drivers/bulk      批次匯入（ON CONFLICT 更新）
 * PATCH  /api/shopee-drivers/:id       更新
 * DELETE /api/shopee-drivers/:id       刪除
 * GET    /api/shopee-drivers/lookup    以工號查詢
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const shopeeDriversRouter = Router();

// ── 建立 / 升級資料表 ───────────────────────────────────────────────────────
export async function ensureShopeeDriversTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_drivers (
      id            SERIAL PRIMARY KEY,
      shopee_id     TEXT NOT NULL UNIQUE,
      name          TEXT,
      vehicle_plate TEXT,
      vehicle_type  TEXT,
      fleet_name    TEXT,
      notes         TEXT,
      is_own_driver BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 升級欄位（舊版沒有這些）
  const addCols = [
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS id_number TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS birthday  TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS address   TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS phone     TEXT`,
    `ALTER TABLE shopee_drivers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  ];
  for (const sql of addCols) {
    await pool.query(sql).catch(() => {});
  }
}

// ── GET /api/shopee-drivers ─────────────────────────────────────────────────
shopeeDriversRouter.get("/shopee-drivers", async (req, res) => {
  const { q } = req.query as Record<string, string>;
  let where = "";
  const vals: string[] = [];
  if (q) {
    vals.push(`%${q}%`);
    where = `WHERE shopee_id ILIKE $1 OR name ILIKE $1 OR fleet_name ILIKE $1 OR phone ILIKE $1`;
  }
  const { rows } = await pool.query(
    `SELECT id, shopee_id, name, vehicle_plate, vehicle_type, fleet_name,
            id_number, birthday, address, phone, notes, is_own_driver, created_at, updated_at
     FROM shopee_drivers ${where}
     ORDER BY shopee_id`,
    vals
  );
  res.json({ ok: true, drivers: rows, total: rows.length });
});

// ── GET /api/shopee-drivers/lookup?ids=14681,14774 ─────────────────────────
shopeeDriversRouter.get("/shopee-drivers/lookup", async (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, map: {} });
  const { rows } = await pool.query(
    `SELECT shopee_id, name, vehicle_plate, vehicle_type, fleet_name, phone
     FROM shopee_drivers WHERE shopee_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, typeof rows[0]> = {};
  for (const r of rows) map[r.shopee_id] = r;
  res.json({ ok: true, map });
});

// ── POST /api/shopee-drivers ────────────────────────────────────────────────
shopeeDriversRouter.post("/shopee-drivers", async (req, res) => {
  const {
    shopee_id, name = null, vehicle_plate = null, vehicle_type = null,
    fleet_name = null, notes = null, is_own_driver = true,
    id_number = null, birthday = null, address = null, phone = null,
  } = req.body ?? {};
  if (!shopee_id) return res.status(400).json({ error: "shopee_id（工號）為必填" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO shopee_drivers
         (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
          id_number, birthday, address, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (shopee_id) DO UPDATE SET
         name=$2, vehicle_plate=$3, vehicle_type=$4, fleet_name=$5,
         notes=$6, is_own_driver=$7, id_number=$8, birthday=$9,
         address=$10, phone=$11, updated_at=NOW()
       RETURNING *`,
      [shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
       id_number, birthday, address, phone]
    );
    res.status(201).json({ ok: true, driver: rows[0] });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ── POST /api/shopee-drivers/bulk ───────────────────────────────────────────
shopeeDriversRouter.post("/shopee-drivers/bulk", async (req, res) => {
  const drivers: any[] = req.body?.drivers ?? [];
  if (!Array.isArray(drivers) || !drivers.length)
    return res.status(400).json({ error: "drivers 陣列為必填" });

  let inserted = 0, updated = 0, errors = 0;
  for (const d of drivers) {
    if (!d.shopee_id) continue;
    try {
      const result = await pool.query(
        `INSERT INTO shopee_drivers
           (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver,
            id_number, birthday, address, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (shopee_id) DO UPDATE SET
           name=EXCLUDED.name, vehicle_plate=EXCLUDED.vehicle_plate,
           vehicle_type=EXCLUDED.vehicle_type, fleet_name=EXCLUDED.fleet_name,
           notes=EXCLUDED.notes, is_own_driver=EXCLUDED.is_own_driver,
           id_number=EXCLUDED.id_number, birthday=EXCLUDED.birthday,
           address=EXCLUDED.address, phone=EXCLUDED.phone, updated_at=NOW()
         RETURNING (xmax = 0) AS was_inserted`,
        [
          String(d.shopee_id),
          d.name ?? null, d.vehicle_plate ?? null, d.vehicle_type ?? null,
          d.fleet_name ?? null, d.notes ?? null,
          d.is_own_driver !== false,
          d.id_number ?? null, d.birthday ?? null,
          d.address ?? null, d.phone ?? null,
        ]
      );
      if (result.rows[0]?.was_inserted) inserted++; else updated++;
    } catch { errors++; }
  }
  res.json({ ok: true, inserted, updated, errors, total: drivers.length });
});

// ── PATCH /api/shopee-drivers/:id ──────────────────────────────────────────
shopeeDriversRouter.patch("/shopee-drivers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = [
    "shopee_id", "name", "vehicle_plate", "vehicle_type", "fleet_name",
    "notes", "is_own_driver", "id_number", "birthday", "address", "phone",
  ];
  const updates = ["updated_at = NOW()"];
  const vals: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { vals.push(req.body[f]); updates.push(`${f} = $${vals.length}`); }
  }
  if (vals.length === 0) return res.status(400).json({ error: "沒有要更新的欄位" });
  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE shopee_drivers SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: "找不到此司機" });
    res.json({ ok: true, driver: rows[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── DELETE /api/shopee-drivers/:id ─────────────────────────────────────────
shopeeDriversRouter.delete("/shopee-drivers/:id", async (req, res) => {
  await pool.query("DELETE FROM shopee_drivers WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});
