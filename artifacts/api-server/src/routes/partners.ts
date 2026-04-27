/**
 * 模組 1：廠商檔案自動化
 * GET/POST/PATCH/DELETE /api/partners
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const partnersRouter = Router();

// ── 建表 ─────────────────────────────────────────────────────────────────────

export async function ensurePartnersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id            SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      contact_name     TEXT,
      contact_phone    TEXT,
      email            TEXT,
      tax_id           TEXT,
      base_price       NUMERIC(10,2) DEFAULT 800,
      km_rate          NUMERIC(8,2)  DEFAULT 25,
      profit_margin    NUMERIC(5,2)  DEFAULT 15,
      contract_type    TEXT DEFAULT 'standard',
      tier             TEXT DEFAULT 'standard',
      park_fee         NUMERIC(8,0)  DEFAULT 300,
      mountain_fee     NUMERIC(8,0)  DEFAULT 500,
      special_zone_fee NUMERIC(8,0)  DEFAULT 500,
      remote_fee       NUMERIC(8,0)  DEFAULT 1000,
      is_active        BOOLEAN DEFAULT TRUE,
      bank_name        TEXT,
      bank_account     TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // 初次啟動時從 partner_contract_config 匯入舊資料
  await pool.query(`
    INSERT INTO partners (name, base_price, km_rate, profit_margin, notes, is_active)
    SELECT partner_name,
           base_price::numeric,
           rate_per_km::numeric,
           (profit_margin::numeric * 100),
           notes,
           active
    FROM partner_contract_config
    WHERE NOT EXISTS (SELECT 1 FROM partners LIMIT 1)
    ON CONFLICT DO NOTHING
  `).catch(() => { /* 若 partner_contract_config 不存在則跳過 */ });
  // 補欄位（冪等，舊資料庫升級用）
  await pool.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS tier             TEXT         NOT NULL DEFAULT 'standard'`);
  await pool.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS park_fee         NUMERIC(8,0) NOT NULL DEFAULT 300`);
  await pool.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS mountain_fee     NUMERIC(8,0) NOT NULL DEFAULT 500`);
  await pool.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS special_zone_fee NUMERIC(8,0) NOT NULL DEFAULT 500`);
  await pool.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS remote_fee       NUMERIC(8,0) NOT NULL DEFAULT 1000`);
  console.log("[Partners] table ensured");
}

// ── GET /api/partners ─────────────────────────────────────────────────────────

partnersRouter.get("/partners", async (req, res) => {
  try {
    const active = req.query.active;
    let q = `SELECT * FROM partners`;
    const params: unknown[] = [];
    if (active === "true")  { q += ` WHERE is_active = true`; }
    if (active === "false") { q += ` WHERE is_active = false`; }
    q += ` ORDER BY id DESC`;
    const { rows } = await pool.query(q, params);
    res.json({ ok: true, partners: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/partners ────────────────────────────────────────────────────────

partnersRouter.post("/partners", async (req, res) => {
  try {
    const {
      name, contact_name, contact_phone, email, tax_id,
      base_price = 800, km_rate = 25, profit_margin = 15,
      contract_type = "standard", is_active = true,
      bank_name, bank_account, notes,
    } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name 為必填" });

    const { rows } = await pool.query(`
      INSERT INTO partners
        (name, contact_name, contact_phone, email, tax_id,
         base_price, km_rate, profit_margin, contract_type, is_active,
         bank_name, bank_account, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [name, contact_name, contact_phone, email, tax_id,
        base_price, km_rate, profit_margin, contract_type, is_active,
        bank_name, bank_account, notes]);

    res.json({ ok: true, partner: rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/partners/:id ───────────────────────────────────────────────────

partnersRouter.patch("/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields: Record<string, unknown> = { ...req.body };
    delete fields.id;
    delete fields.created_at;
    fields.updated_at = "NOW()";

    const setClause = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v], i) =>
        v === "NOW()" ? `${k} = NOW()` : `${k} = $${i + 2}`
      )
      .join(", ");

    const values = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== "NOW()")
      .map(([, v]) => v);

    await pool.query(
      `UPDATE partners SET ${setClause} WHERE id = $1`,
      [id, ...values]
    );
    const { rows } = await pool.query(`SELECT * FROM partners WHERE id = $1`, [id]);
    res.json({ ok: true, partner: rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /api/partners/:id ─────────────────────────────────────────────────

partnersRouter.delete("/partners/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM partners WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
