/**
 * shopeeScheduleSync.ts
 *
 * POST /api/shopee-schedule/sync-locations
 *   — 立即同步蝦皮班表試算表中的門市地址進 location_history
 *   — 同步執行，回傳完整結果（非 setImmediate 非同步）
 *
 * GET /api/shopee-schedule/sync-locations/status
 *   — 查詢最近一次同步結果（from DB）
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { syncShopeeLocations } from "../lib/syncShopeeLocations";

export const shopeeScheduleSyncRouter = Router();

// ── 建立狀態記錄表（幂等） ──────────────────────────────────────────────────
export async function ensureSyncStatusTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopee_location_sync_log (
      id           SERIAL PRIMARY KEY,
      synced_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      trigger      TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'scheduled'
      inserted     INTEGER NOT NULL DEFAULT 0,
      updated      INTEGER NOT NULL DEFAULT 0,
      total        INTEGER NOT NULL DEFAULT 0,
      sheet_count  INTEGER NOT NULL DEFAULT 0,
      address_count INTEGER NOT NULL DEFAULT 0,
      duration_ms  INTEGER NOT NULL DEFAULT 0,
      error        TEXT
    )
  `);
}

// ── POST /api/shopee-schedule/sync-locations ────────────────────────────────
shopeeScheduleSyncRouter.post("/shopee-schedule/sync-locations", async (req, res) => {
  try {
    const result = await syncShopeeLocations();

    await pool.query(
      `INSERT INTO shopee_location_sync_log
         (trigger, inserted, updated, total, sheet_count, address_count, duration_ms)
       VALUES ('manual', $1, $2, $3, $4, $5, $6)`,
      [result.inserted, result.updated, result.total,
       result.sheetCount, result.addressCount, result.durationMs],
    );

    res.json({
      ok: true,
      inserted: result.inserted,
      updated: result.updated,
      total: result.total,
      sheetCount: result.sheetCount,
      addressCount: result.addressCount,
      durationMs: result.durationMs,
      message: `✅ 同步完成 — 新增 ${result.inserted} 筆地址，更新 ${result.updated} 筆，共掃描 ${result.sheetCount} 個分頁`,
    });
  } catch (err: any) {
    await pool.query(
      `INSERT INTO shopee_location_sync_log (trigger, error) VALUES ('manual', $1)`,
      [err.message.slice(0, 500)],
    ).catch(() => {});
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/shopee-schedule/sync-locations/status ─────────────────────────
shopeeScheduleSyncRouter.get("/shopee-schedule/sync-locations/status", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shopee_location_sync_log ORDER BY synced_at DESC LIMIT 10`,
    );
    const next06 = (() => {
      const now = new Date();
      const tw = new Date(now.toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }) + "Z");
      tw.setHours(6, 0, 0, 0);
      if (tw <= now) tw.setDate(tw.getDate() + 1);
      return tw.toISOString();
    })();
    res.json({
      ok: true,
      schedule: "每天 06:00 台灣時間自動執行",
      next_run_at: next06,
      sync_mode: "讀取所有分頁（含地址欄位）— 非僅 Raw_ 分頁",
      recent_logs: rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
