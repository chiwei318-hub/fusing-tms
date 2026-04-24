/**
 * taxPayroll.ts — 稅務合規薪資引擎
 *
 * Week 1  司機薪資計算（Shopee 外包司機 + 富詠自有司機）
 * Week 2  車隊應付帳款
 * Week 3  平台收支總覽 + 營業稅
 * Week 4  扣繳憑單 + 年度報表
 *
 * 法規依據：
 *   扣繳稅款  月累計跑單費 > NT$20,010 → 全額 × 10%（執行業務所得 9A）
 *   二代健保  單次給付 > NT$24,000     → 給付額 × 2.11%
 *   車隊扣繳  應付款 × 10%（公司戶）或 1.9%（有統編）
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const taxPayrollRouter = Router();

// ── 稅務常數 ──────────────────────────────────────────────────────────────────
const WITHHOLDING_THRESHOLD = 20_010;   // 月累計超過此金額 → 扣繳 10%
const WITHHOLDING_RATE      = 0.10;
const NHI_THRESHOLD         = 24_000;   // 單次給付超過此金額 → 二代健保 2.11%
const NHI_RATE              = 0.0211;

function calcDriverTax(gross: number): {
  withholdingTax: number;
  nhiSupplement:  number;
  netPay:         number;
} {
  const withholdingTax = gross > WITHHOLDING_THRESHOLD
    ? Math.round(gross * WITHHOLDING_RATE)
    : 0;
  const nhiSupplement = gross > NHI_THRESHOLD
    ? Math.round(gross * NHI_RATE)
    : 0;
  return { withholdingTax, nhiSupplement, netPay: gross - withholdingTax - nhiSupplement };
}

function calcFleetTax(gross: number, hasTaxId: boolean): {
  withholdingTax: number;
  nhiSupplement:  number;
  netPayable:     number;
} {
  const rate           = hasTaxId ? 0.019 : 0.10;
  const withholdingTax = Math.round(gross * rate);
  const nhiSupplement  = gross > NHI_THRESHOLD ? Math.round(gross * NHI_RATE) : 0;
  return { withholdingTax, nhiSupplement, netPayable: gross - withholdingTax - nhiSupplement };
}

// ── 建立全部財務資料表（Week 1~4） ────────────────────────────────────────────
export async function ensureTaxPayrollTables() {
  // ── Week 1：司機薪資單（Shopee 外包司機） ───────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS driver_payroll (
      id               SERIAL PRIMARY KEY,
      driver_shopee_id VARCHAR(50)    NOT NULL,
      driver_name      VARCHAR(100),
      period           CHAR(7)        NOT NULL,          -- YYYY-MM
      total_trips      INTEGER        NOT NULL DEFAULT 0,
      gross_pay        NUMERIC(12,2)  NOT NULL DEFAULT 0,
      withholding_tax  NUMERIC(12,2)  NOT NULL DEFAULT 0,
      nhi_supplement   NUMERIC(12,2)  NOT NULL DEFAULT 0,
      net_pay          NUMERIC(12,2)  NOT NULL DEFAULT 0,
      paid_at          TIMESTAMPTZ,
      payment_ref      VARCHAR(100),
      note             TEXT,
      locked           BOOLEAN        NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      UNIQUE(driver_shopee_id, period)
    )
  `);

  // ── Week 2：車隊應付帳款 ──────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fleet_payables (
      id               SERIAL PRIMARY KEY,
      fleet_id         INTEGER        NOT NULL,
      fleet_name       VARCHAR(100),
      period           CHAR(7)        NOT NULL,
      total_trips      INTEGER        NOT NULL DEFAULT 0,
      gross_amount     NUMERIC(12,2)  NOT NULL DEFAULT 0,
      withholding_tax  NUMERIC(12,2)  NOT NULL DEFAULT 0,
      nhi_supplement   NUMERIC(12,2)  NOT NULL DEFAULT 0,
      net_payable      NUMERIC(12,2)  NOT NULL DEFAULT 0,
      has_tax_id       BOOLEAN        NOT NULL DEFAULT false,
      paid_at          TIMESTAMPTZ,
      payment_ref      VARCHAR(100),
      note             TEXT,
      locked           BOOLEAN        NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      UNIQUE(fleet_id, period)
    )
  `);

  // ── Week 3：平台收支總表 ──────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_ledger (
      id                 SERIAL PRIMARY KEY,
      period             CHAR(7)        NOT NULL UNIQUE,
      total_revenue      NUMERIC(14,2)  NOT NULL DEFAULT 0,
      total_cost         NUMERIC(14,2)  NOT NULL DEFAULT 0,
      vat_output         NUMERIC(14,2)  NOT NULL DEFAULT 0,   -- 銷項稅額（5%）
      vat_input          NUMERIC(14,2)  NOT NULL DEFAULT 0,   -- 進項稅額（可抵減）
      vat_payable        NUMERIC(14,2)  NOT NULL DEFAULT 0,   -- 應繳 = 銷項 - 進項
      net_profit         NUMERIC(14,2)  NOT NULL DEFAULT 0,
      income_tax_payable NUMERIC(14,2)  NOT NULL DEFAULT 0,   -- 淨利 × 20%
      note               TEXT,
      locked             BOOLEAN        NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    )
  `);

  // ── Week 4：扣繳憑單（年度） ─────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS withholding_certificates (
      id               SERIAL PRIMARY KEY,
      payee_id         VARCHAR(100)   NOT NULL,
      payee_type       VARCHAR(10)    NOT NULL CHECK(payee_type IN ('driver','fleet')),
      payee_name       VARCHAR(100),
      year             INTEGER        NOT NULL,
      total_paid       NUMERIC(14,2)  NOT NULL DEFAULT 0,
      total_withheld   NUMERIC(14,2)  NOT NULL DEFAULT 0,
      certificate_no   VARCHAR(50),
      issued_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      UNIQUE(payee_id, payee_type, year)
    )
  `);

  console.log("[TaxPayroll] tables ensured (driver_payroll / fleet_payables / platform_ledger / withholding_certificates)");
}

ensureTaxPayrollTables().catch(e => console.error("[TaxPayroll] init error:", e));

// ═══════════════════════════════════════════════════════════════════════════════
// WEEK 1 — 司機薪資計算
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /tax/driver-payroll/preview ───────────────────────────────────────────
// 預覽本期試算（不寫入）— MUST be before /:shopeeId/:period
taxPayrollRouter.get("/driver-payroll/preview", async (req, res) => {
  try {
    const { period } = req.query as Record<string, string>;
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    const rows = await db.execute(sql`
      SELECT
        o.shopee_driver_id                                         AS shopee_id,
        sd.name                                                    AS driver_name,
        COUNT(*)                                                   AS total_trips,
        COALESCE(SUM(COALESCE(pr.driver_pay_rate, pr.rate_per_trip, 0)), 0) AS gross_pay
      FROM orders o
      JOIN  shopee_drivers      sd ON sd.shopee_id = o.shopee_driver_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix   = o.route_prefix
      WHERE o.route_id IS NOT NULL
        AND o.shopee_driver_id IS NOT NULL
        AND TO_CHAR(o.created_at, 'YYYY-MM') = ${period}
      GROUP BY o.shopee_driver_id, sd.name
      ORDER BY gross_pay DESC
    `);

    const preview = (rows.rows as any[]).map(r => {
      const gross = Number(r.gross_pay);
      const { withholdingTax, nhiSupplement, netPay } = calcDriverTax(gross);
      return {
        shopee_id:          r.shopee_id,
        driver_name:        r.driver_name,
        total_trips:        Number(r.total_trips),
        gross_pay:          gross,
        withholding_tax:    withholdingTax,
        nhi_supplement:     nhiSupplement,
        net_pay:            netPay,
        withholding_applies: gross > WITHHOLDING_THRESHOLD,
        nhi_applies:         gross > NHI_THRESHOLD,
      };
    });

    const total = preview.reduce((a, d) => ({
      trips:       a.trips       + d.total_trips,
      gross:       a.gross       + d.gross_pay,
      withholding: a.withholding + d.withholding_tax,
      nhi:         a.nhi         + d.nhi_supplement,
      net:         a.net         + d.net_pay,
    }), { trips: 0, gross: 0, withholding: 0, nhi: 0, net: 0 });

    return res.json({ ok: true, period, preview, total, driver_count: preview.length });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /tax/driver-payroll ────────────────────────────────────────────────────
// 查詢已產生的薪資單列表
taxPayrollRouter.get("/driver-payroll", async (req, res) => {
  try {
    const { period } = req.query as Record<string, string>;
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    const rows = await db.execute(sql`
      SELECT * FROM driver_payroll
      WHERE period = ${period}
      ORDER BY gross_pay DESC
    `);

    const summary = await db.execute(sql`
      SELECT
        COUNT(*)                                       AS driver_count,
        COALESCE(SUM(gross_pay), 0)                    AS total_gross,
        COALESCE(SUM(withholding_tax), 0)              AS total_withholding,
        COALESCE(SUM(nhi_supplement), 0)               AS total_nhi,
        COALESCE(SUM(net_pay), 0)                      AS total_net,
        COUNT(*) FILTER (WHERE locked  = true)         AS locked_count,
        COUNT(*) FILTER (WHERE paid_at IS NOT NULL)    AS paid_count
      FROM driver_payroll
      WHERE period = ${period}
    `);

    return res.json({ ok: true, period, payroll: rows.rows, summary: summary.rows[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /tax/driver-payroll/generate ─────────────────────────────────────────
// 自動計算並寫入本期薪資單（ON CONFLICT 跳過已鎖定）
taxPayrollRouter.post("/driver-payroll/generate", async (req, res) => {
  try {
    const { period, overwrite = false } = req.body as { period: string; overwrite?: boolean };
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    if (!overwrite) {
      const locked = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM driver_payroll
        WHERE period = ${period} AND locked = true
      `);
      if (Number((locked.rows[0] as any).cnt) > 0)
        return res.status(409).json({
          ok: false,
          error: "本期有已鎖定薪資單，請先解鎖或帶 overwrite:true",
        });
    }

    const earnings = await db.execute(sql`
      SELECT
        o.shopee_driver_id                                         AS shopee_id,
        sd.name                                                    AS driver_name,
        COUNT(*)                                                   AS total_trips,
        COALESCE(SUM(COALESCE(pr.driver_pay_rate, pr.rate_per_trip, 0)), 0) AS gross_pay
      FROM orders o
      JOIN  shopee_drivers      sd ON sd.shopee_id = o.shopee_driver_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix   = o.route_prefix
      WHERE o.route_id IS NOT NULL
        AND o.shopee_driver_id IS NOT NULL
        AND TO_CHAR(o.created_at, 'YYYY-MM') = ${period}
      GROUP BY o.shopee_driver_id, sd.name
      HAVING COALESCE(SUM(COALESCE(pr.driver_pay_rate, pr.rate_per_trip, 0)), 0) > 0
      ORDER BY gross_pay DESC
    `);

    let generated = 0;
    const details: any[] = [];

    for (const row of earnings.rows as any[]) {
      const gross = Number(row.gross_pay);
      const { withholdingTax, nhiSupplement, netPay } = calcDriverTax(gross);

      await db.execute(sql`
        INSERT INTO driver_payroll
          (driver_shopee_id, driver_name, period,
           total_trips, gross_pay, withholding_tax, nhi_supplement, net_pay)
        VALUES
          (${row.shopee_id}, ${row.driver_name}, ${period},
           ${Number(row.total_trips)}, ${gross}, ${withholdingTax}, ${nhiSupplement}, ${netPay})
        ON CONFLICT (driver_shopee_id, period) DO UPDATE SET
          driver_name     = EXCLUDED.driver_name,
          total_trips     = EXCLUDED.total_trips,
          gross_pay       = EXCLUDED.gross_pay,
          withholding_tax = EXCLUDED.withholding_tax,
          nhi_supplement  = EXCLUDED.nhi_supplement,
          net_pay         = EXCLUDED.net_pay,
          updated_at      = NOW()
        WHERE driver_payroll.locked = false
      `);

      generated++;
      details.push({
        shopee_id:   row.shopee_id,
        driver_name: row.driver_name,
        trips:       Number(row.total_trips),
        gross:       gross,
        withholding: withholdingTax,
        nhi:         nhiSupplement,
        net:         netPay,
      });
    }

    const total = details.reduce((a, d) => ({
      trips:       a.trips       + d.trips,
      gross:       a.gross       + d.gross,
      withholding: a.withholding + d.withholding,
      nhi:         a.nhi         + d.nhi,
      net:         a.net         + d.net,
    }), { trips: 0, gross: 0, withholding: 0, nhi: 0, net: 0 });

    return res.json({ ok: true, period, generated, summary: total, details });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /tax/driver-payroll/:shopeeId/:period ─────────────────────────────────
// 單一司機薪資單明細（含逐筆趟次）
taxPayrollRouter.get("/driver-payroll/:shopeeId/:period", async (req, res) => {
  try {
    const { shopeeId, period } = req.params;
    if (!/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 格式錯誤（YYYY-MM）" });

    const [payroll, trips] = await Promise.all([
      db.execute(sql`
        SELECT * FROM driver_payroll
        WHERE driver_shopee_id = ${shopeeId} AND period = ${period}
      `),
      db.execute(sql`
        SELECT
          o.id, o.route_id, o.route_prefix AS prefix,
          pr.route_od, pr.service_type,
          COALESCE(pr.driver_pay_rate, pr.rate_per_trip, 0) AS pay_per_trip,
          o.driver_payment_status, o.created_at
        FROM orders o
        LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
        WHERE o.shopee_driver_id = ${shopeeId}
          AND o.route_id IS NOT NULL
          AND TO_CHAR(o.created_at, 'YYYY-MM') = ${period}
        ORDER BY o.created_at
      `),
    ]);

    return res.json({
      ok:      true,
      payroll: (payroll.rows as any[])[0] ?? null,
      trips:   trips.rows,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /tax/driver-payroll/:id/lock ────────────────────────────────────────
taxPayrollRouter.patch("/driver-payroll/:id/lock", async (req, res) => {
  try {
    const { locked } = req.body as { locked: boolean };
    const r = await db.execute(sql`
      UPDATE driver_payroll
      SET locked = ${!!locked}, updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!(r.rows as any[]).length)
      return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, payroll: (r.rows as any[])[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /tax/driver-payroll/:id/pay ─────────────────────────────────────────
// 標記已付款，自動鎖定薪資單
taxPayrollRouter.patch("/driver-payroll/:id/pay", async (req, res) => {
  try {
    const { paidAt, paymentRef } = req.body as { paidAt?: string; paymentRef?: string };
    const r = await db.execute(sql`
      UPDATE driver_payroll
      SET paid_at     = ${paidAt ? new Date(paidAt) : new Date()},
          payment_ref = ${paymentRef ?? null},
          locked      = true,
          updated_at  = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!(r.rows as any[]).length)
      return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, payroll: (r.rows as any[])[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEEK 2 — 車隊應付帳款（stub，下期實作）
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /tax/fleet-payables ────────────────────────────────────────────────────
taxPayrollRouter.get("/fleet-payables", async (req, res) => {
  try {
    const { period } = req.query as Record<string, string>;
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    const rows = await db.execute(sql`
      SELECT * FROM fleet_payables WHERE period = ${period} ORDER BY gross_amount DESC
    `);
    const summary = await db.execute(sql`
      SELECT
        COUNT(*) AS fleet_count,
        COALESCE(SUM(gross_amount),    0) AS total_gross,
        COALESCE(SUM(withholding_tax), 0) AS total_withholding,
        COALESCE(SUM(net_payable),     0) AS total_net,
        COUNT(*) FILTER (WHERE paid_at IS NOT NULL) AS paid_count
      FROM fleet_payables WHERE period = ${period}
    `);
    return res.json({ ok: true, period, payables: rows.rows, summary: summary.rows[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /tax/fleet-payables/calculate ────────────────────────────────────────
// 自動計算本期車隊應付款
taxPayrollRouter.post("/fleet-payables/calculate", async (req, res) => {
  try {
    const { period } = req.body as { period: string };
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    // 從 fusingao 車隊結算資料計算
    const fleetData = await db.execute(sql`
      SELECT
        f.id AS fleet_id, f.fleet_name,
        COALESCE(f.has_tax_id, false) AS has_tax_id,
        COUNT(o.id) AS total_trips,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip, 0)), 0) AS gross_amount
      FROM fusingao_fleets f
      LEFT JOIN fleet_drivers fd ON fd.fleet_id = f.id
      LEFT JOIN orders o ON o.shopee_driver_id = fd.employee_id
        AND o.route_id IS NOT NULL
        AND TO_CHAR(o.created_at, 'YYYY-MM') = ${period}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = o.route_prefix
      WHERE f.is_active = true
      GROUP BY f.id, f.fleet_name, f.has_tax_id
      HAVING COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip, 0)), 0) > 0
    `);

    let generated = 0;
    const details: any[] = [];

    for (const row of fleetData.rows as any[]) {
      const gross         = Number(row.gross_amount);
      const hasTaxId      = Boolean(row.has_tax_id);
      const { withholdingTax, nhiSupplement, netPayable } = calcFleetTax(gross, hasTaxId);

      await db.execute(sql`
        INSERT INTO fleet_payables
          (fleet_id, fleet_name, period, total_trips, gross_amount,
           withholding_tax, nhi_supplement, net_payable, has_tax_id)
        VALUES
          (${row.fleet_id}, ${row.fleet_name}, ${period}, ${Number(row.total_trips)},
           ${gross}, ${withholdingTax}, ${nhiSupplement}, ${netPayable}, ${hasTaxId})
        ON CONFLICT (fleet_id, period) DO UPDATE SET
          fleet_name      = EXCLUDED.fleet_name,
          total_trips     = EXCLUDED.total_trips,
          gross_amount    = EXCLUDED.gross_amount,
          withholding_tax = EXCLUDED.withholding_tax,
          nhi_supplement  = EXCLUDED.nhi_supplement,
          net_payable     = EXCLUDED.net_payable,
          has_tax_id      = EXCLUDED.has_tax_id,
          updated_at      = NOW()
        WHERE fleet_payables.locked = false
      `);

      generated++;
      details.push({
        fleet_id:    row.fleet_id,
        fleet_name:  row.fleet_name,
        trips:       Number(row.total_trips),
        gross:       gross,
        withholding: withholdingTax,
        nhi:         nhiSupplement,
        net:         netPayable,
        has_tax_id:  hasTaxId,
      });
    }

    return res.json({ ok: true, period, generated, details });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── PATCH /tax/fleet-payables/:id/pay ─────────────────────────────────────────
taxPayrollRouter.patch("/fleet-payables/:id/pay", async (req, res) => {
  try {
    const { paidAt, paymentRef } = req.body as { paidAt?: string; paymentRef?: string };
    const r = await db.execute(sql`
      UPDATE fleet_payables
      SET paid_at     = ${paidAt ? new Date(paidAt) : new Date()},
          payment_ref = ${paymentRef ?? null},
          locked      = true,
          updated_at  = NOW()
      WHERE id = ${Number(req.params.id)} RETURNING *
    `);
    if (!(r.rows as any[]).length)
      return res.status(404).json({ ok: false, error: "Not found" });
    return res.json({ ok: true, payable: (r.rows as any[])[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEEK 3 — 平台收支總覽 + 營業稅（stub）
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /tax/ledger/summary ────────────────────────────────────────────────────
taxPayrollRouter.get("/ledger/summary", async (req, res) => {
  try {
    const { period } = req.query as Record<string, string>;
    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    // 嘗試讀現有鎖定帳本
    const saved = await db.execute(sql`
      SELECT * FROM platform_ledger WHERE period = ${period}
    `);

    // 即時試算（不存檔）
    const live = await db.execute(sql`
      SELECT
        COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS total_revenue,
        COUNT(*) FILTER (WHERE status = 'delivered')                    AS order_count
      FROM orders
      WHERE TO_CHAR(created_at, 'YYYY-MM') = ${period}
    `);

    const revenue    = Number((live.rows[0] as any)?.total_revenue ?? 0);
    const vatOutput  = Math.round(revenue / 1.05 * 0.05);   // 銷項稅額
    const netRevenue = revenue - vatOutput;

    return res.json({
      ok: true,
      period,
      saved:   (saved.rows as any[])[0] ?? null,
      live: {
        total_revenue: revenue,
        order_count:   Number((live.rows[0] as any)?.order_count ?? 0),
        vat_output:    vatOutput,
        net_revenue:   netRevenue,
        note:          "進項稅額需對應成本發票，請手動輸入後執行 POST /tax/ledger/close",
      },
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /tax/ledger/vat ────────────────────────────────────────────────────────
// 雙月營業稅申報試算
taxPayrollRouter.get("/ledger/vat", async (req, res) => {
  try {
    const { bimonth } = req.query as Record<string, string>;  // e.g. "2025-01" = Jan+Feb
    if (!bimonth || !/^\d{4}-\d{2}$/.test(bimonth))
      return res.status(400).json({ ok: false, error: "bimonth 必填（YYYY-MM，代表雙月起月）" });

    const [y, m]    = bimonth.split("-").map(Number);
    const month1    = `${y}-${String(m).padStart(2, "0")}`;
    const month2    = `${y}-${String(m + 1).padStart(2, "0")}`;

    const rev = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS revenue
      FROM orders
      WHERE TO_CHAR(created_at, 'YYYY-MM') IN (${month1}, ${month2})
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

    const months = (rev.rows as any[]).reduce((acc: any, r: any) => {
      acc[r.month] = Number(r.revenue);
      return acc;
    }, {});

    const totalRevenue = (months[month1] ?? 0) + (months[month2] ?? 0);
    const vatOutput    = Math.round(totalRevenue / 1.05 * 0.05);

    const saved = await db.execute(sql`
      SELECT SUM(vat_input) AS total_vat_input
      FROM platform_ledger
      WHERE period IN (${month1}, ${month2})
    `);
    const vatInput   = Number((saved.rows[0] as any)?.total_vat_input ?? 0);
    const vatPayable = Math.max(0, vatOutput - vatInput);

    return res.json({
      ok:           true,
      bi_period:    `${month1} ~ ${month2}`,
      total_revenue: totalRevenue,
      vat_output:   vatOutput,
      vat_input:    vatInput,
      vat_payable:  vatPayable,
      note:          vatInput === 0 ? "尚未登錄進項發票，請手動更新 platform_ledger.vat_input" : undefined,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /tax/ledger/close ────────────────────────────────────────────────────
// 鎖定月帳（含手動輸入進項稅額）
taxPayrollRouter.post("/ledger/close", async (req, res) => {
  try {
    const {
      period, vatInput = 0,
      totalCost = 0, note,
    } = req.body as { period: string; vatInput?: number; totalCost?: number; note?: string };

    if (!period || !/^\d{4}-\d{2}$/.test(period))
      return res.status(400).json({ ok: false, error: "period 必填（YYYY-MM）" });

    const rev = await db.execute(sql`
      SELECT COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS revenue
      FROM orders WHERE TO_CHAR(created_at, 'YYYY-MM') = ${period}
    `);

    const revenue          = Number((rev.rows[0] as any)?.revenue ?? 0);
    const vatOutput        = Math.round(revenue / 1.05 * 0.05);
    const vatPayable       = Math.max(0, vatOutput - Number(vatInput));
    const netProfit        = revenue - Number(totalCost);
    const incomeTaxPayable = Math.round(Math.max(0, netProfit) * 0.20);

    const r = await db.execute(sql`
      INSERT INTO platform_ledger
        (period, total_revenue, total_cost, vat_output, vat_input, vat_payable,
         net_profit, income_tax_payable, note, locked)
      VALUES
        (${period}, ${revenue}, ${Number(totalCost)}, ${vatOutput}, ${Number(vatInput)},
         ${vatPayable}, ${netProfit}, ${incomeTaxPayable}, ${note ?? null}, true)
      ON CONFLICT (period) DO UPDATE SET
        total_revenue      = EXCLUDED.total_revenue,
        total_cost         = EXCLUDED.total_cost,
        vat_output         = EXCLUDED.vat_output,
        vat_input          = EXCLUDED.vat_input,
        vat_payable        = EXCLUDED.vat_payable,
        net_profit         = EXCLUDED.net_profit,
        income_tax_payable = EXCLUDED.income_tax_payable,
        note               = EXCLUDED.note,
        locked             = true,
        updated_at         = NOW()
      RETURNING *
    `);

    return res.json({ ok: true, ledger: (r.rows as any[])[0] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WEEK 4 — 扣繳憑單 + 年度報表（stub）
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /tax/withholding ───────────────────────────────────────────────────────
taxPayrollRouter.get("/withholding", async (req, res) => {
  try {
    const { year, payeeType } = req.query as Record<string, string>;
    if (!year) return res.status(400).json({ ok: false, error: "year 必填" });

    let q = sql`SELECT * FROM withholding_certificates WHERE year = ${Number(year)}`;
    const rows = await db.execute(q);
    return res.json({ ok: true, year: Number(year), certificates: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── POST /tax/withholding/generate ───────────────────────────────────────────
// 依年度 driver_payroll + fleet_payables 彙總產生扣繳憑單
taxPayrollRouter.post("/withholding/generate", async (req, res) => {
  try {
    const { year } = req.body as { year: number };
    if (!year) return res.status(400).json({ ok: false, error: "year 必填" });

    // 司機扣繳彙總
    const drivers = await db.execute(sql`
      SELECT
        driver_shopee_id AS payee_id,
        MAX(driver_name) AS payee_name,
        SUM(gross_pay)   AS total_paid,
        SUM(withholding_tax + nhi_supplement) AS total_withheld
      FROM driver_payroll
      WHERE period LIKE ${`${year}-%`}
      GROUP BY driver_shopee_id
      HAVING SUM(gross_pay) > 0
    `);

    // 車隊扣繳彙總
    const fleets = await db.execute(sql`
      SELECT
        fleet_id::TEXT   AS payee_id,
        MAX(fleet_name)  AS payee_name,
        SUM(gross_amount) AS total_paid,
        SUM(withholding_tax + nhi_supplement) AS total_withheld
      FROM fleet_payables
      WHERE period LIKE ${`${year}-%`}
      GROUP BY fleet_id
      HAVING SUM(gross_amount) > 0
    `);

    let generated = 0;
    for (const [rows, type] of [[drivers.rows, "driver"], [fleets.rows, "fleet"]] as [any[], string][]) {
      for (const r of rows) {
        await db.execute(sql`
          INSERT INTO withholding_certificates
            (payee_id, payee_type, payee_name, year, total_paid, total_withheld)
          VALUES
            (${r.payee_id}, ${type}, ${r.payee_name}, ${Number(year)},
             ${Number(r.total_paid)}, ${Number(r.total_withheld)})
          ON CONFLICT (payee_id, payee_type, year) DO UPDATE SET
            payee_name     = EXCLUDED.payee_name,
            total_paid     = EXCLUDED.total_paid,
            total_withheld = EXCLUDED.total_withheld,
            issued_at      = NULL
        `);
        generated++;
      }
    }

    return res.json({ ok: true, year, generated });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /tax/income-estimate ──────────────────────────────────────────────────
// 年度營所稅預估
taxPayrollRouter.get("/income-estimate", async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query as Record<string, string>;

    const monthly = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered'), 0) AS revenue
      FROM orders
      WHERE EXTRACT(YEAR FROM created_at) = ${Number(year)}
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month
    `);

    const totalRevenue = (monthly.rows as any[])
      .reduce((s: number, r: any) => s + Number(r.revenue), 0);

    const savedCosts = await db.execute(sql`
      SELECT COALESCE(SUM(total_cost), 0) AS total_cost,
             COALESCE(SUM(income_tax_payable), 0) AS saved_tax
      FROM platform_ledger
      WHERE period LIKE ${`${year}-%`}
    `);

    const totalCost        = Number((savedCosts.rows[0] as any)?.total_cost ?? 0);
    const netProfit        = totalRevenue - totalCost;
    const incomeTaxPayable = Math.round(Math.max(0, netProfit) * 0.20);

    return res.json({
      ok: true,
      year: Number(year),
      total_revenue:      totalRevenue,
      total_cost:         totalCost,
      net_profit:         netProfit,
      income_tax_payable: incomeTaxPayable,
      effective_rate:     totalRevenue > 0 ? +(incomeTaxPayable / totalRevenue * 100).toFixed(2) : 0,
      monthly_breakdown:  monthly.rows,
      note:               totalCost === 0 ? "尚未登錄成本，請執行 POST /tax/ledger/close 補登" : undefined,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
