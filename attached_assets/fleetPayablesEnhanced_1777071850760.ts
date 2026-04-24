/**
 * fleetPayablesEnhanced.ts
 * 路徑：artifacts/api-server/src/routes/fleetPayablesEnhanced.ts
 *
 * 強化版車隊應付款：
 *   - 自動抓 fusingao_fleets + route_prefix_rates 計算應付
 *   - 扣繳 / 二代健保自動計算
 *   - 標記付款 + 付款紀錄
 *
 * 電子發票：
 *   - POST /invoices/issue  → 開立發票（串接政府電子發票 API）
 *   - GET  /invoices        → 查詢發票清單
 *   - POST /invoices/:id/void → 作廢
 */

import { Router, Request, Response } from "express";
import { Pool } from "pg";

// ── 稅務常數 ─────────────────────────────────────────────────
const TAX = {
  VAT_RATE:            0.05,    // 營業稅 5%
  WITHHOLDING_CORP:    0.10,    // 公司戶扣繳 10%
  WITHHOLDING_BIZ:     0.019,   // 有統編非公司 1.9%
  NHI_RATE:            0.0211,  // 二代健保 2.11%
  NHI_THRESHOLD:       24000,   // 二代健保門檻
  WITHHOLDING_THRESHOLD: 20010, // 司機扣繳門檻（月）
};

export function createFleetPayablesRouter(pool: Pool) {
  const router = Router();

  // ── 建表 ────────────────────────────────────────────────────
  async function ensureTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_payables (
        id               SERIAL PRIMARY KEY,
        fleet_id         INTEGER NOT NULL,
        fleet_name       TEXT,
        period           TEXT NOT NULL,
        gross_amount     NUMERIC(12,2) DEFAULT 0,
        withholding_tax  NUMERIC(12,2) DEFAULT 0,
        nhi_supplement   NUMERIC(12,2) DEFAULT 0,
        net_payable      NUMERIC(12,2) DEFAULT 0,
        trip_count       INTEGER DEFAULT 0,
        status           TEXT DEFAULT 'pending',
        paid_at          TIMESTAMPTZ,
        payment_ref      TEXT,
        bank_name        TEXT,
        bank_account     TEXT,
        note             TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(fleet_id, period)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id               SERIAL PRIMARY KEY,
        order_id         INTEGER,
        order_no         TEXT,
        customer_name    TEXT,
        customer_tax_id  TEXT,
        amount           NUMERIC(12,2),
        tax_amount       NUMERIC(12,2),
        total_amount     NUMERIC(12,2),
        invoice_no       TEXT UNIQUE,
        invoice_date     DATE DEFAULT CURRENT_DATE,
        status           TEXT DEFAULT 'issued',
        void_reason      TEXT,
        voided_at        TIMESTAMPTZ,
        carrier_type     TEXT DEFAULT 'B2C',
        carrier_id       TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }
  ensureTables().catch(console.error);

  // ════════════════════════════════════════════════════════════
  // 車隊應付款 API
  // ════════════════════════════════════════════════════════════

  // POST /fleet-payables/calculate — 計算本期應付
  router.post("/calculate", async (req: Request, res: Response) => {
    const { period } = req.body as { period: string };
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: "period 格式需為 YYYY-MM" });
    }

    const [year, month] = period.split("-").map(Number);
    const startDate = `${period}-01`;
    const endDate   = new Date(year, month, 0).toISOString().slice(0, 10);

    // 查詢每個車隊本期趟次與金額
    const { rows: fleetData } = await pool.query(`
      SELECT
        f.id                                          AS fleet_id,
        f.fleet_name,
        f.commission_rate,
        f.bank_name,
        f.bank_account,
        COALESCE(f.has_tax_id, false)                AS has_tax_id,
        COUNT(o.id)::int                             AS trip_count,
        SUM(
          COALESCE(f.rate_override, pr.rate_per_trip, 0)
          * (1 - COALESCE(f.commission_rate, 15) / 100.0)
        )                                            AS gross_amount
      FROM fusingao_fleets f
      LEFT JOIN orders o
        ON o.fusingao_fleet_id = f.id
        AND o.created_at BETWEEN $1 AND $2
        AND o.status NOT IN ('cancelled')
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = o.route_prefix
      GROUP BY f.id, f.fleet_name, f.commission_rate,
               f.bank_name, f.bank_account, f.has_tax_id
      HAVING COUNT(o.id) > 0
    `, [startDate, endDate]);

    let upserted = 0;
    for (const row of fleetData) {
      const gross        = parseFloat(row.gross_amount) || 0;
      const hasTaxId     = row.has_tax_id;

      // 扣繳率：有統編 1.9%，公司戶 10%
      const withholdingRate = hasTaxId
        ? TAX.WITHHOLDING_BIZ
        : TAX.WITHHOLDING_CORP;
      const withholding_tax = Math.round(gross * withholdingRate * 100) / 100;

      // 二代健保：單次超過 24,000
      const nhi_supplement = gross > TAX.NHI_THRESHOLD
        ? Math.round(gross * TAX.NHI_RATE * 100) / 100
        : 0;

      const net_payable = Math.round(
        (gross - withholding_tax - nhi_supplement) * 100
      ) / 100;

      await pool.query(`
        INSERT INTO fleet_payables
          (fleet_id, fleet_name, period, gross_amount, withholding_tax,
           nhi_supplement, net_payable, trip_count, bank_name, bank_account,
           status, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',NOW())
        ON CONFLICT (fleet_id, period)
        DO UPDATE SET
          gross_amount    = EXCLUDED.gross_amount,
          withholding_tax = EXCLUDED.withholding_tax,
          nhi_supplement  = EXCLUDED.nhi_supplement,
          net_payable     = EXCLUDED.net_payable,
          trip_count      = EXCLUDED.trip_count,
          updated_at      = NOW()
        WHERE fleet_payables.status = 'pending'
      `, [
        row.fleet_id, row.fleet_name, period,
        gross, withholding_tax, nhi_supplement, net_payable,
        row.trip_count, row.bank_name, row.bank_account,
      ]);
      upserted++;
    }

    res.json({ success: true, count: upserted, period });
  });

  // GET /fleet-payables — 查詢清單
  router.get("/", async (req: Request, res: Response) => {
    const { period, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (period) { params.push(period); conditions.push(`period = $${params.length}`); }
    if (status)  { params.push(status); conditions.push(`status = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM fleet_payables ${where} ORDER BY period DESC, fleet_name`,
      params
    );
    res.json(rows);
  });

  // PATCH /fleet-payables/:id/pay — 標記已付
  router.patch("/:id/pay", async (req: Request, res: Response) => {
    const { paidAt, paymentRef, note } = req.body;
    const { rows } = await pool.query(`
      UPDATE fleet_payables
      SET status      = 'paid',
          paid_at     = $1,
          payment_ref = $2,
          note        = $3,
          updated_at  = NOW()
      WHERE id = $4
      RETURNING *
    `, [paidAt ?? new Date().toISOString(), paymentRef ?? null, note ?? null, req.params.id]);

    if (!rows.length) return res.status(404).json({ error: "找不到記錄" });
    res.json(rows[0]);
  });

  return router;
}

// ════════════════════════════════════════════════════════════
// 電子發票 API
// ════════════════════════════════════════════════════════════

export function createInvoiceRouter(pool: Pool) {
  const router = Router();

  // GET /invoices — 查詢發票清單
  router.get("/", async (req: Request, res: Response) => {
    const { status, from, to, order_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status)   { params.push(status);   conditions.push(`status = $${params.length}`); }
    if (order_id) { params.push(order_id); conditions.push(`order_id = $${params.length}`); }
    if (from)     { params.push(from);     conditions.push(`invoice_date >= $${params.length}::date`); }
    if (to)       { params.push(to);       conditions.push(`invoice_date <= $${params.length}::date`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM invoices ${where} ORDER BY invoice_date DESC, id DESC LIMIT 200`,
      params
    );
    res.json(rows);
  });

  // POST /invoices/issue — 開立發票
  router.post("/issue", async (req: Request, res: Response) => {
    const {
      order_id,
      order_no,
      customer_name,
      customer_tax_id,
      amount,           // 未稅金額
      carrier_type = "B2C",  // B2B / B2C
      carrier_id,       // 手機條碼 / 統一編號
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "金額必須大於 0" });
    }

    const tax_amount   = Math.round(amount * TAX.VAT_RATE * 100) / 100;
    const total_amount = Math.round((amount + tax_amount) * 100) / 100;

    // 產生發票號碼（實際串接財政部 API 時替換此段）
    // 格式：AB-12345678（英文2碼 + 數字8碼）
    const invoice_no = await generateInvoiceNo(pool);

    // 寫入 DB
    const { rows } = await pool.query(`
      INSERT INTO invoices
        (order_id, order_no, customer_name, customer_tax_id,
         amount, tax_amount, total_amount, invoice_no,
         invoice_date, status, carrier_type, carrier_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,'issued',$9,$10)
      RETURNING *
    `, [
      order_id ?? null, order_no ?? null,
      customer_name ?? null, customer_tax_id ?? null,
      amount, tax_amount, total_amount, invoice_no,
      carrier_type, carrier_id ?? null,
    ]);

    // 同步更新 orders 的 invoice_no / invoice_date
    if (order_id) {
      await pool.query(`
        UPDATE orders SET
          invoice_no   = $1,
          invoice_date = CURRENT_DATE
        WHERE id = $2
      `, [invoice_no, order_id]);
    }

    res.json(rows[0]);
  });

  // POST /invoices/:id/void — 作廢發票
  router.post("/:id/void", async (req: Request, res: Response) => {
    const { reason } = req.body;
    const { rows } = await pool.query(`
      UPDATE invoices
      SET status      = 'void',
          void_reason = $1,
          voided_at   = NOW()
      WHERE id = $2
      RETURNING *
    `, [reason ?? "作廢", req.params.id]);

    if (!rows.length) return res.status(404).json({ error: "找不到發票" });

    // 清除 orders 上的 invoice_no
    if (rows[0].order_id) {
      await pool.query(`
        UPDATE orders SET invoice_no = NULL, invoice_date = NULL
        WHERE id = $1
      `, [rows[0].order_id]);
    }

    res.json(rows[0]);
  });

  // GET /invoices/summary — 營業稅申報彙總（雙月）
  router.get("/summary", async (req: Request, res: Response) => {
    const { bimonth } = req.query; // 格式：2026-03（奇數月開始）
    if (!bimonth) return res.status(400).json({ error: "需要 bimonth 參數" });

    const [year, month] = String(bimonth).split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth  = month + 1;
    const endDate   = new Date(year, endMonth, 0).toISOString().slice(0, 10);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int               AS invoice_count,
        SUM(amount)                 AS sales_amount,
        SUM(tax_amount)             AS output_tax,
        SUM(CASE WHEN status='void' THEN tax_amount ELSE 0 END) AS void_tax
      FROM invoices
      WHERE invoice_date BETWEEN $1 AND $2
        AND status != 'void'
    `, [startDate, endDate]);

    res.json({
      period:    `${bimonth} ~ ${year}-${String(endMonth).padStart(2, "0")}`,
      ...rows[0],
      net_output_tax: parseFloat(rows[0].output_tax ?? 0) - parseFloat(rows[0].void_tax ?? 0),
    });
  });

  return router;
}

// ── 發票號碼產生器 ───────────────────────────────────────────
async function generateInvoiceNo(pool: Pool): Promise<string> {
  // 字母前綴（月份決定）
  const PREFIXES = ["AB","CD","EF","GH","IJ","KL","MN","OP","QR","ST","UV","WX"];
  const prefix = PREFIXES[new Date().getMonth()];

  // 流水號（DB 自動遞增）
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM invoices
    WHERE invoice_date >= date_trunc('month', CURRENT_DATE)
  `);
  const seq = String(rows[0].cnt + 1).padStart(8, "0");
  return `${prefix}-${seq}`;
}
