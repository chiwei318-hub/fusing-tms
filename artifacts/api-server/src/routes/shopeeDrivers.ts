/**
 * shopeeDrivers.ts — 蝦皮司機工號管理
 *
 * GET    /api/shopee-drivers           列出全部
 * POST   /api/shopee-drivers           新增
 * PATCH  /api/shopee-drivers/:id       更新
 * DELETE /api/shopee-drivers/:id       刪除
 * GET    /api/shopee-drivers/lookup    以工號查詢
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const shopeeDriversRouter = Router();

// Ensure table exists with all needed columns
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
  // Add updated_at if missing (older schema)
  await pool.query(`
    ALTER TABLE shopee_drivers
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `).catch(() => {});
}

// GET /api/shopee-drivers
shopeeDriversRouter.get("/shopee-drivers", async (req, res) => {
  const { q } = req.query as Record<string, string>;
  let where = "";
  const vals: string[] = [];
  if (q) {
    vals.push(`%${q}%`);
    where = `WHERE shopee_id ILIKE $1 OR name ILIKE $1 OR fleet_name ILIKE $1`;
  }
  const { rows } = await pool.query(
    `SELECT id, shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver, created_at, updated_at
     FROM shopee_drivers ${where}
     ORDER BY shopee_id`,
    vals
  );
  res.json({ ok: true, drivers: rows, total: rows.length });
});

// GET /api/shopee-drivers/lookup?ids=14681,14774
shopeeDriversRouter.get("/shopee-drivers/lookup", async (req, res) => {
  const ids = String(req.query.ids ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, map: {} });
  const { rows } = await pool.query(
    `SELECT shopee_id, name, vehicle_plate, vehicle_type, fleet_name
     FROM shopee_drivers WHERE shopee_id = ANY($1)`,
    [ids]
  );
  const map: Record<string, { name: string; vehicle_plate: string; vehicle_type: string; fleet_name: string }> = {};
  for (const r of rows) {
    map[r.shopee_id] = { name: r.name, vehicle_plate: r.vehicle_plate, vehicle_type: r.vehicle_type, fleet_name: r.fleet_name };
  }
  res.json({ ok: true, map });
});

// POST /api/shopee-drivers
shopeeDriversRouter.post("/shopee-drivers", async (req, res) => {
  const { shopee_id, name = null, vehicle_plate = null, vehicle_type = null, fleet_name = null, notes = null, is_own_driver = true } = req.body ?? {};
  if (!shopee_id) return res.status(400).json({ error: "shopee_id（工號）為必填" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO shopee_drivers (shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (shopee_id) DO UPDATE
         SET name=$2, vehicle_plate=$3, vehicle_type=$4, fleet_name=$5, notes=$6, is_own_driver=$7, updated_at=NOW()
       RETURNING *`,
      [shopee_id, name, vehicle_plate, vehicle_type, fleet_name, notes, is_own_driver]
    );
    res.status(201).json({ ok: true, driver: rows[0] });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/shopee-drivers/:id
shopeeDriversRouter.patch("/shopee-drivers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["shopee_id", "name", "vehicle_plate", "vehicle_type", "fleet_name", "notes", "is_own_driver"];
  const updates = ["updated_at = NOW()"];
  const vals: unknown[] = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
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
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/shopee-drivers/:id
shopeeDriversRouter.delete("/shopee-drivers/:id", async (req, res) => {
  await pool.query("DELETE FROM shopee_drivers WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});
