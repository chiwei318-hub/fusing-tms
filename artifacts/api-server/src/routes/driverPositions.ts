/**
 * driverPositions.ts
 * GPS 即時位置上報與查詢
 *
 * POST /api/drivers/position       司機上報自己的位置
 * GET  /api/drivers/positions      平台查詢所有司機位置（30 分鐘內）
 * GET  /api/drivers/positions/:id  查詢單一司機位置
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const driverPositionsRouter = Router();

export async function ensureDriverPositionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_positions (
      driver_id   INTEGER PRIMARY KEY,
      driver_name TEXT,
      lat         NUMERIC(10, 7) NOT NULL,
      lng         NUMERIC(10, 7) NOT NULL,
      accuracy    NUMERIC,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureDriverPositionsTable().catch(console.error);

// ── POST /drivers/position ────────────────────────────────────────────────────
driverPositionsRouter.post("/drivers/position", async (req, res) => {
  try {
    const { driver_id, driver_name, lat, lng, accuracy } = req.body;
    if (!driver_id || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "需要 driver_id, lat, lng" });
    }
    if (lat < 21 || lat > 26 || lng < 119 || lng > 123) {
      return res.status(400).json({ error: "座標超出台灣範圍" });
    }
    await pool.query(
      `INSERT INTO driver_positions (driver_id, driver_name, lat, lng, accuracy, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET
         driver_name = EXCLUDED.driver_name,
         lat         = EXCLUDED.lat,
         lng         = EXCLUDED.lng,
         accuracy    = EXCLUDED.accuracy,
         updated_at  = NOW()`,
      [driver_id, driver_name ?? null, lat, lng, accuracy ?? null],
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /drivers/positions ────────────────────────────────────────────────────
driverPositionsRouter.get("/drivers/positions", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        driver_id   AS "driverId",
        driver_name AS "driverName",
        CAST(lat AS FLOAT) AS lat,
        CAST(lng AS FLOAT) AS lng,
        accuracy,
        updated_at  AS "updatedAt"
      FROM driver_positions
      WHERE updated_at > NOW() - INTERVAL '30 minutes'
      ORDER BY updated_at DESC
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /drivers/positions/:id ────────────────────────────────────────────────
driverPositionsRouter.get("/drivers/positions/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        driver_id   AS "driverId",
        driver_name AS "driverName",
        CAST(lat AS FLOAT) AS lat,
        CAST(lng AS FLOAT) AS lng,
        accuracy,
        updated_at  AS "updatedAt"
       FROM driver_positions WHERE driver_id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: "找不到司機位置" });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
