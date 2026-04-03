/**
 * penaltySync.ts — Shopee 罰款 Google Sheet 自動同步
 * 從公開的 Google Spreadsheet 抓取 CSV 並匯入 shopee_penalties
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const penaltySyncRouter = Router();

// ── DB bootstrap ─────────────────────────────────────────────────────────────
export async function ensurePenaltySyncTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS penalty_sync_configs (
      id              SERIAL PRIMARY KEY,
      name            TEXT NOT NULL,
      sheet_url       TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      last_sync_at    TIMESTAMPTZ,
      last_sync_result JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS penalty_sync_logs (
      id              SERIAL PRIMARY KEY,
      config_id       INTEGER NOT NULL REFERENCES penalty_sync_configs(id) ON DELETE CASCADE,
      synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      inserted        INTEGER DEFAULT 0,
      duplicates      INTEGER DEFAULT 0,
      errors          INTEGER DEFAULT 0,
      detail          JSONB
    );
  `);
}

// ── Helper: Google Sheets URL → CSV export URL ───────────────────────────────
function toCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const sheetId = m[1];
  // Extract gid from either ?gid= or #gid=
  const gidM = raw.match(/[?#&]gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function normDate(raw: string): string {
  // "2026/2/2" → "2026-02-02"
  const m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return raw;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function normAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

interface PenaltyRow {
  incident_date: string | null;
  soc: string | null;
  store_name: string | null;
  violation_type: string | null;
  fleet_name: string | null;
  driver_code: string | null;
  fine_amount: number | null;
  fine_month: string | null;
  deduction_month: string | null;
  notes: string | null;
}

function parsePenaltyCsv(text: string): { rows: PenaltyRow[]; warnings: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];
  const rows: PenaltyRow[] = [];

  // Find header row — the one that starts with "案件發生日期"
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells[0]?.includes("案件發生日期") || cells[0]?.includes("incident")) {
      hdrIdx = i;
      break;
    }
  }

  if (hdrIdx < 0) {
    warnings.push("找不到標題列（需含「案件發生日期」）");
    return { rows, warnings };
  }

  const headers = parseCsvLine(lines[hdrIdx]).map((h) => h.toLowerCase());

  const col = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h.includes(k)));

  const iDate     = col(["案件發生日期", "incident"]);
  const iSoc      = col(["soc"]);
  const iStore    = col(["門市"]);
  const iViolation= col(["規範", "violation", "類型"]);
  const iFleet    = col(["車隊名稱"]);
  const iDriver   = col(["司機工號", "driver"]);
  const iAmount   = col(["罰款金額", "fine_amount", "amount"]);
  const iMonth    = col(["罰款月份"]);
  const iDeduct   = col(["扣款月份"]);
  const iNotes    = col(["說明", "note"]);

  for (let i = hdrIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => !c)) continue;

    const incident_date = iDate >= 0 && cells[iDate] ? normDate(cells[iDate]) : null;
    const fine_amount   = iAmount >= 0 ? normAmount(cells[iAmount] || "") : null;

    if (!incident_date && !fine_amount) continue; // skip summary/blank rows

    rows.push({
      incident_date,
      soc:           iSoc >= 0 ? (cells[iSoc] || null)       : null,
      store_name:    iStore >= 0 ? (cells[iStore] || null)    : null,
      violation_type:iViolation >= 0 ? (cells[iViolation] || null) : null,
      fleet_name:    iFleet >= 0 ? (cells[iFleet] || null)   : null,
      driver_code:   iDriver >= 0 ? (cells[iDriver] || null)  : null,
      fine_amount,
      fine_month:    iMonth >= 0 ? (cells[iMonth] || null)    : null,
      deduction_month: iDeduct >= 0 ? (cells[iDeduct] || null): null,
      notes:         iNotes >= 0 ? (cells[iNotes] || null)    : null,
    });
  }

  return { rows, warnings };
}

// ── Core sync logic ──────────────────────────────────────────────────────────
export async function runPenaltySync(cfgId: number, csvUrl: string, cfgName: string) {
  const fetchRes = await fetch(csvUrl);
  if (!fetchRes.ok) throw new Error(`無法取得試算表 (HTTP ${fetchRes.status})`);
  const text = await fetchRes.text();
  if (text.trim().startsWith("<!DOCTYPE")) {
    throw new Error("無法取得 CSV，請確認試算表已設為「知道連結的人可查看」");
  }

  const { rows, warnings } = parsePenaltyCsv(text);
  let inserted = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      // Dedup check: same incident_date + soc + store_name + driver_code + fine_amount
      const dup = await pool.query(
        `SELECT id FROM shopee_penalties
         WHERE incident_date = $1
           AND COALESCE(soc,'') = COALESCE($2,'')
           AND COALESCE(store_name,'') = COALESCE($3,'')
           AND COALESCE(driver_code,'') = COALESCE($4,'')
           AND COALESCE(fine_amount,0) = COALESCE($5,0)
         LIMIT 1`,
        [row.incident_date, row.soc, row.store_name, row.driver_code, row.fine_amount]
      );

      if (dup.rows.length > 0) {
        duplicates++;
        continue;
      }

      await pool.query(
        `INSERT INTO shopee_penalties
          (incident_date, soc, store_name, violation_type, fleet_name, driver_code,
           fine_amount, fine_month, deduction_month, notes, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sheet_sync')`,
        [
          row.incident_date, row.soc, row.store_name, row.violation_type,
          row.fleet_name, row.driver_code, row.fine_amount,
          row.fine_month, row.deduction_month, row.notes,
        ]
      );
      inserted++;
    } catch (e: any) {
      errors.push(e.message?.slice(0, 100));
    }
  }

  const result = { inserted, duplicates, errors: errors.length, warnings: warnings.length, warnings_detail: warnings };

  // Update last_sync
  await pool.query(
    `UPDATE penalty_sync_configs
     SET last_sync_at = NOW(), last_sync_result = $2, updated_at = NOW()
     WHERE id = $1`,
    [cfgId, result]
  );

  // Log entry
  await pool.query(
    `INSERT INTO penalty_sync_logs (config_id, inserted, duplicates, errors, detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [cfgId, inserted, duplicates, errors.length, result]
  );

  console.log(`[PenaltySync] "${cfgName}" synced — inserted:${inserted} dup:${duplicates} err:${errors.length}`);
  return result;
}

// ── Scheduler ────────────────────────────────────────────────────────────────
export function startPenaltySyncScheduler() {
  const CHECK_INTERVAL_MS = 60 * 1000;

  async function tick() {
    try {
      const { rows: configs } = await pool.query(
        `SELECT id, name, sheet_url, interval_minutes, last_sync_at
         FROM penalty_sync_configs WHERE is_active = true`
      );
      for (const cfg of configs) {
        const now = Date.now();
        const lastSync = cfg.last_sync_at ? new Date(cfg.last_sync_at).getTime() : 0;
        if (now - lastSync >= cfg.interval_minutes * 60 * 1000) {
          const csvUrl = toCsvUrl(cfg.sheet_url);
          runPenaltySync(cfg.id, csvUrl, cfg.name).catch((err) => {
            console.error(`[PenaltySync] "${cfg.name}" failed:`, err.message);
            pool.query(
              `UPDATE penalty_sync_configs SET last_sync_at=NOW(), last_sync_result=$2, updated_at=NOW() WHERE id=$1`,
              [cfg.id, { error: String(err.message).slice(0, 300) }]
            ).catch(() => {});
          });
        }
      }
    } catch (err) {
      console.error("[PenaltySync] scheduler tick failed:", err);
    }
  }

  setTimeout(tick, 45_000);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[PenaltySync] scheduler started, checking every 60s");
}

// ── API routes ───────────────────────────────────────────────────────────────
penaltySyncRouter.get("/penalty-sync", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM penalty_sync_configs ORDER BY id"
    );
    res.json({ ok: true, configs: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

penaltySyncRouter.post("/penalty-sync", async (req, res) => {
  try {
    const { name, sheet_url, interval_minutes = 60 } = req.body;
    if (!name || !sheet_url) {
      return res.status(400).json({ ok: false, error: "name 和 sheet_url 為必填" });
    }
    const { rows } = await pool.query(
      `INSERT INTO penalty_sync_configs (name, sheet_url, interval_minutes)
       VALUES ($1,$2,$3) RETURNING *`,
      [name, sheet_url, interval_minutes]
    );
    res.json({ ok: true, config: rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

penaltySyncRouter.patch("/penalty-sync/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, sheet_url, interval_minutes, is_active } = req.body;
    const updates: string[] = [];
    const vals: any[] = [];
    if (name !== undefined)             { vals.push(name);             updates.push(`name=$${vals.length}`); }
    if (sheet_url !== undefined)        { vals.push(sheet_url);        updates.push(`sheet_url=$${vals.length}`); }
    if (interval_minutes !== undefined) { vals.push(interval_minutes); updates.push(`interval_minutes=$${vals.length}`); }
    if (is_active !== undefined)        { vals.push(is_active);        updates.push(`is_active=$${vals.length}`); }
    if (!updates.length) return res.json({ ok: true });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE penalty_sync_configs SET ${updates.join(",")}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    res.json({ ok: true, config: rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

penaltySyncRouter.delete("/penalty-sync/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM penalty_sync_configs WHERE id=$1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

penaltySyncRouter.post("/penalty-sync/:id/run", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM penalty_sync_configs WHERE id=$1", [Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "找不到設定" });
    const cfg = rows[0];
    const csvUrl = toCsvUrl(cfg.sheet_url);
    const result = await runPenaltySync(cfg.id, csvUrl, cfg.name);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

penaltySyncRouter.get("/penalty-sync/:id/logs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM penalty_sync_logs WHERE config_id=$1 ORDER BY synced_at DESC LIMIT 20`,
      [Number(req.params.id)]
    );
    res.json({ ok: true, logs: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
