/**
 * rateSync.ts — Shopee 費率試算表自動同步
 *
 * GET    /api/rate-sync              列出所有同步設定
 * POST   /api/rate-sync              新增同步設定
 * PATCH  /api/rate-sync/:id          更新設定
 * DELETE /api/rate-sync/:id          刪除設定
 * POST   /api/rate-sync/:id/run      手動觸發一次同步
 * GET    /api/rate-sync/:id/logs     取得最近同步記錄
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { runRateSync } from "../lib/rateSyncScheduler";

export const rateSyncRouter = Router();

function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

rateSyncRouter.get("/rate-sync", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, sheet_url, interval_minutes, import_mode, effective_month,
            is_active, last_sync_at, last_sync_result, created_at
     FROM rate_sync_configs ORDER BY id`
  );
  res.json({ ok: true, configs: rows });
});

rateSyncRouter.post("/rate-sync", async (req, res) => {
  const {
    name, sheet_url,
    interval_minutes = 60,
    import_mode = "merge",
    effective_month = null,
    is_active = true,
  } = req.body ?? {};
  if (!name || !sheet_url) {
    return res.status(400).json({ error: "name 和 sheet_url 為必填" });
  }
  const { rows } = await pool.query(
    `INSERT INTO rate_sync_configs
       (name, sheet_url, interval_minutes, import_mode, effective_month, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, sheet_url, interval_minutes, import_mode, effective_month, is_active]
  );
  res.status(201).json({ ok: true, config: rows[0] });
});

rateSyncRouter.patch("/rate-sync/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = ["name", "sheet_url", "interval_minutes", "import_mode", "effective_month", "is_active"];
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
    `UPDATE rate_sync_configs SET ${updates.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });
  res.json({ ok: true, config: rows[0] });
});

rateSyncRouter.delete("/rate-sync/:id", async (req, res) => {
  await pool.query("DELETE FROM rate_sync_configs WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

rateSyncRouter.post("/rate-sync/:id/run", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query("SELECT * FROM rate_sync_configs WHERE id = $1", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "找不到此設定" });
  const cfg = rows[0];
  try {
    const result = await runRateSync(cfg, toCsvUrl(cfg.sheet_url));
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

rateSyncRouter.get("/rate-sync/:id/logs", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, synced_at, inserted, updated, errors, warnings, detail
     FROM rate_sync_logs WHERE config_id = $1 ORDER BY synced_at DESC LIMIT 30`,
    [id]
  );
  res.json({ ok: true, logs: rows });
});
