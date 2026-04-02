/**
 * sheetSync.ts — Google Sheets 自動同步設定
 *
 * GET    /api/sheet-sync              列出所有同步設定
 * POST   /api/sheet-sync              新增同步設定
 * PATCH  /api/sheet-sync/:id          更新設定
 * DELETE /api/sheet-sync/:id          刪除設定
 * POST   /api/sheet-sync/:id/run      手動立即觸發一次同步
 * GET    /api/sheet-sync/:id/logs     取得最近同步記錄
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { runSheetSync } from "../lib/sheetSyncScheduler";

export const sheetSyncRouter = Router();

// ── Ensure table exists ────────────────────────────────────────────────────
export async function ensureSheetSyncTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sheet_sync_configs (
      id                SERIAL PRIMARY KEY,
      name              TEXT NOT NULL,
      sheet_url         TEXT NOT NULL,
      interval_minutes  INTEGER NOT NULL DEFAULT 60,
      customer_name     TEXT NOT NULL DEFAULT '蝦皮電商配送',
      pickup_address    TEXT NOT NULL DEFAULT '（依路線倉庫）',
      cargo_description TEXT NOT NULL DEFAULT '電商門市配送',
      is_active         BOOLEAN NOT NULL DEFAULT true,
      last_sync_at      TIMESTAMPTZ,
      last_sync_result  JSONB,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sheet_sync_logs (
      id          SERIAL PRIMARY KEY,
      config_id   INTEGER NOT NULL REFERENCES sheet_sync_configs(id) ON DELETE CASCADE,
      synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      inserted    INTEGER NOT NULL DEFAULT 0,
      duplicates  INTEGER NOT NULL DEFAULT 0,
      errors      INTEGER NOT NULL DEFAULT 0,
      warnings    INTEGER NOT NULL DEFAULT 0,
      detail      JSONB
    )
  `);
}

// ── Helper: normalise Google Sheets URL → CSV export URL ──────────────────
function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── GET /api/sheet-sync ────────────────────────────────────────────────────
sheetSyncRouter.get("/sheet-sync", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, sheet_url, interval_minutes, customer_name, pickup_address,
            cargo_description, is_active, last_sync_at, last_sync_result, created_at
     FROM sheet_sync_configs ORDER BY id`
  );
  res.json({ ok: true, configs: rows });
});

// ── POST /api/sheet-sync ───────────────────────────────────────────────────
sheetSyncRouter.post("/sheet-sync", async (req, res) => {
  const {
    name,
    sheet_url,
    interval_minutes = 60,
    customer_name = "蝦皮電商配送",
    pickup_address = "（依路線倉庫）",
    cargo_description = "電商門市配送",
    is_active = true,
  } = req.body ?? {};

  if (!name || !sheet_url) {
    return res.status(400).json({ error: "name 和 sheet_url 為必填" });
  }

  const { rows } = await pool.query(
    `INSERT INTO sheet_sync_configs
       (name, sheet_url, interval_minutes, customer_name, pickup_address, cargo_description, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, sheet_url, interval_minutes, customer_name, pickup_address, cargo_description, is_active]
  );
  res.status(201).json({ ok: true, config: rows[0] });
});

// ── PATCH /api/sheet-sync/:id ──────────────────────────────────────────────
sheetSyncRouter.patch("/sheet-sync/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["name", "sheet_url", "interval_minutes", "customer_name",
                  "pickup_address", "cargo_description", "is_active"];
  const updates: string[] = ["updated_at = NOW()"];
  const vals: unknown[] = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      vals.push(req.body[f]);
      updates.push(`${f} = $${vals.length}`);
    }
  }
  if (vals.length === 0) return res.status(400).json({ error: "沒有要更新的欄位" });

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE sheet_sync_configs SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });
  res.json({ ok: true, config: rows[0] });
});

// ── DELETE /api/sheet-sync/:id ─────────────────────────────────────────────
sheetSyncRouter.delete("/sheet-sync/:id", async (req, res) => {
  await pool.query("DELETE FROM sheet_sync_configs WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ── POST /api/sheet-sync/:id/run — manual trigger ─────────────────────────
sheetSyncRouter.post("/sheet-sync/:id/run", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    "SELECT * FROM sheet_sync_configs WHERE id = $1",
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });

  const cfg = rows[0];
  const csvUrl = toCsvUrl(cfg.sheet_url);
  const result = await runSheetSync(cfg, csvUrl);
  res.json({ ok: true, result });
});

// ── GET /api/sheet-sync/:id/logs ──────────────────────────────────────────
sheetSyncRouter.get("/sheet-sync/:id/logs", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, synced_at, inserted, duplicates, errors, warnings, detail
     FROM sheet_sync_logs WHERE config_id = $1 ORDER BY synced_at DESC LIMIT 30`,
    [id]
  );
  res.json({ ok: true, logs: rows });
});
