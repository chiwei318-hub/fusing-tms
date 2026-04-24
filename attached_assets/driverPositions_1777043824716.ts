/**
 * driverPositions.ts
 * 路徑：artifacts/api-server/src/routes/driverPositions.ts
 *
 * GPS 即時位置上報與查詢
 *
 * DB Table: driver_positions
 *   driver_id     INTEGER
 *   driver_name   TEXT
 *   lat           NUMERIC
 *   lng           NUMERIC
 *   accuracy      NUMERIC   (公尺，選填)
 *   updated_at    TIMESTAMPTZ DEFAULT now()
 *   PRIMARY KEY (driver_id)   ← upsert on conflict
 *
 * API:
 *   POST /api/drivers/position        司機上報自己的位置（JWT 驗證）
 *   GET  /api/drivers/positions       平台查詢所有司機位置（admin）
 *   GET  /api/drivers/positions/:id   查詢單一司機位置
 */

import { Router, Request, Response } from "express";
import { Pool } from "pg";

export function createDriverPositionsRouter(pool: Pool) {
  const router = Router();

  // ── 建表（啟動時自動執行）────────────────────────────────
  async function ensureDriverPositionsTable() {
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

  // ── POST /api/drivers/position ───────────────────────────
  // 司機 APP 定期（建議每 15~30 秒）呼叫，更新自己的 GPS 座標
  router.post("/position", async (req: Request, res: Response) => {
    const { driver_id, driver_name, lat, lng, accuracy } = req.body;

    if (!driver_id || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "需要 driver_id, lat, lng" });
    }

    // 台灣範圍驗證（約略）
    if (lat < 21 || lat > 26 || lng < 119 || lng > 123) {
      return res.status(400).json({ error: "座標超出台灣範圍" });
    }

    await pool.query(
      `INSERT INTO driver_positions (driver_id, driver_name, lat, lng, accuracy, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (driver_id)
       DO UPDATE SET
         driver_name = EXCLUDED.driver_name,
         lat         = EXCLUDED.lat,
         lng         = EXCLUDED.lng,
         accuracy    = EXCLUDED.accuracy,
         updated_at  = NOW()`,
      [driver_id, driver_name ?? null, lat, lng, accuracy ?? null]
    );

    res.json({ success: true });
  });

  // ── GET /api/drivers/positions ───────────────────────────
  // 回傳所有司機最新位置（30 分鐘內有更新的）
  router.get("/positions", async (_req: Request, res: Response) => {
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
  });

  // ── GET /api/drivers/positions/:id ──────────────────────
  router.get("/positions/:id", async (req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT
        driver_id   AS "driverId",
        driver_name AS "driverName",
        CAST(lat AS FLOAT) AS lat,
        CAST(lng AS FLOAT) AS lng,
        accuracy,
        updated_at  AS "updatedAt"
       FROM driver_positions
       WHERE driver_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "找不到司機位置" });
    res.json(rows[0]);
  });

  return router;
}
