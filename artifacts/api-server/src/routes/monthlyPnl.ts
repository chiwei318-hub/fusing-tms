/**
 * monthlyPnl.ts — 富詠運輸月度損益表
 *
 * 端點：
 *   GET    /monthly-pnl                    — 列出所有月報
 *   POST   /monthly-pnl                    — 建立新月報（auto-generate from orders）
 *   GET    /monthly-pnl/:id                — 取得單筆月報
 *   PATCH  /monthly-pnl/:id               — 更新月報（全量覆寫 data）
 *   DELETE /monthly-pnl/:id               — 刪除月報
 *   POST   /monthly-pnl/:id/autofill      — 從訂單自動填入運輸收入
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const monthlyPnlRouter = Router();

// ─── 預設客戶清單（照銷貨收入調節表欄位順序）─────────────────────────────────
export const DEFAULT_CUSTOMERS = [
  "天賜爾", "貝克休斯", "佳禾", "佶慶", "協新", "和成", "昆言",
  "東友", "迎輝", "保綱", "新鑫", "嘉敬", "福星高", "聚創",
  "聯發", "薇薾登", "鑫詮", "其他",
];

// ─── 預設司機清單（運費成本欄位）─────────────────────────────────────────────
const DEFAULT_DRIVERS = [
  "黃成裕(小鳥)", "泰立", "甘秉弘", "吳昱陞", "鄧澤民", "楊忠祥",
];

// ─── 預設營業費用項目 ─────────────────────────────────────────────────────────
const DEFAULT_EXPENSE_KEYS = [
  "rent",          // 租金支出
  "fuel",          // 油資
  "telecom",       // 郵電費
  "facebook_ads",  // FB廣告費
  "utilities",     // 水電費
  "entertainment", // 交際費
  "labor",         // 勞務費
  "maintenance",   // 修繕保養
  "fines",         // 罰單
];

// ─── DB Migration ──────────────────────────────────────────────────────────────
(async () => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS monthly_pnl_reports (
        id         SERIAL PRIMARY KEY,
        roc_year   INTEGER NOT NULL,
        month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        status     TEXT    NOT NULL DEFAULT 'draft',
        data       JSONB   NOT NULL DEFAULT '{}',
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (roc_year, month)
      )
    `);
    console.log("[MonthlyPnL] monthly_pnl_reports 表已確認");
  } catch (e) {
    console.warn("[MonthlyPnL] migration warn:", String(e).slice(0, 200));
  }
})();

// ─── 建立空白月報資料 ────────────────────────────────────────────────────────
function emptyPnlData(customers: string[], drivers: string[]) {
  const zeroCust = Object.fromEntries(customers.map(c => [c, 0]));

  return {
    customers,
    drivers,

    // ── 收入 ──
    transport_income: { ...zeroCust },   // 運輸收入（各客戶）
    parking_income:   0,                 // 靠行收入（其他欄）
    fuel_price_diff:  0,                 // 油資價差（其他欄）
    misc_income:      0,                 // 其他收入（其他欄）

    // ── 銷貨收入調節表專用 ──
    revenue_adj: {
      prev_month_invoice:  { ...zeroCust },  // 2月收入3月發票
      next_month_invoice:  { ...zeroCust },  // 3月收入4月發票
      deductions:          { ...zeroCust },  // 扣除費用
      agency_receipts:     0,                // 代收代付
      adj_fines:           { ...zeroCust },  // 罰單（調節表）
    },

    // ── 運費成本（各司機 × 各客戶）──
    driver_costs: Object.fromEntries(
      drivers.map(d => [d, { ...zeroCust }])
    ),

    // ── 營業費用（其他欄，逐項）──
    expenses: Object.fromEntries(
      DEFAULT_EXPENSE_KEYS.map(k => [k, 0])
    ),

    // ── 其他費用（可按客戶分配）──
    other_expenses_per_customer: { ...zeroCust },

    // ── 稅 ──
    income_tax: 0,
  };
}

// ─── GET /monthly-pnl ─────────────────────────────────────────────────────────
monthlyPnlRouter.get("/", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, roc_year, month, status, notes, created_at, updated_at
      FROM monthly_pnl_reports
      ORDER BY roc_year DESC, month DESC
    `);
    res.json({ ok: true, reports: rows.rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /monthly-pnl — 新建月報 ─────────────────────────────────────────────
monthlyPnlRouter.post("/", async (req, res) => {
  try {
    const { roc_year, month, customers, drivers } = req.body;
    if (!roc_year || !month) return res.status(400).json({ error: "roc_year / month 必填" });

    const custList = customers ?? DEFAULT_CUSTOMERS;
    const drvList  = drivers  ?? DEFAULT_DRIVERS;
    const data     = emptyPnlData(custList, drvList);

    const result = await db.execute(sql`
      INSERT INTO monthly_pnl_reports (roc_year, month, data)
      VALUES (${roc_year}, ${month}, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (roc_year, month) DO UPDATE
        SET updated_at = NOW()
      RETURNING id, roc_year, month, status
    `);
    res.status(201).json({ ok: true, report: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── GET /monthly-pnl/:id ─────────────────────────────────────────────────────
monthlyPnlRouter.get("/:id", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, roc_year, month, status, data, notes, created_at, updated_at
      FROM monthly_pnl_reports
      WHERE id = ${parseInt(req.params.id)}
    `);
    if (!rows.rows.length) return res.status(404).json({ error: "月報不存在" });
    res.json({ ok: true, report: rows.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PATCH /monthly-pnl/:id — 更新月報資料 ───────────────────────────────────
monthlyPnlRouter.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { data, status, notes } = req.body;

    if (data !== undefined) {
      await db.execute(sql`
        UPDATE monthly_pnl_reports
        SET data       = ${JSON.stringify(data)}::jsonb,
            updated_at = NOW()
        WHERE id = ${id}
      `);
    }
    if (status !== undefined) {
      await db.execute(sql`
        UPDATE monthly_pnl_reports SET status = ${status}, updated_at = NOW() WHERE id = ${id}
      `);
    }
    if (notes !== undefined) {
      await db.execute(sql`
        UPDATE monthly_pnl_reports SET notes = ${notes}, updated_at = NOW() WHERE id = ${id}
      `);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── DELETE /monthly-pnl/:id ──────────────────────────────────────────────────
monthlyPnlRouter.delete("/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM monthly_pnl_reports WHERE id = ${parseInt(req.params.id)}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /monthly-pnl/:id/autofill — 從訂單自動填入運輸收入 ──────────────────
monthlyPnlRouter.post("/:id/autofill", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // 取得月報基本資訊
    const rpt = await db.execute(sql`
      SELECT roc_year, month, data FROM monthly_pnl_reports WHERE id = ${id}
    `);
    if (!rpt.rows.length) return res.status(404).json({ error: "月報不存在" });
    const report    = rpt.rows[0] as any;
    const rocYear   = report.roc_year as number;
    const month     = report.month    as number;
    const gregorian = rocYear + 1911;

    // 建立月份日期範圍
    const dateFrom = `${gregorian}-${String(month).padStart(2,"0")}-01`;
    const dateTo   = `${gregorian}-${String(month).padStart(2,"0")}-31`;

    // 查詢訂單，按客戶名稱加總運費（delivery_date 是 text 型別，直接字串比較）
    const orderRows = await db.execute(sql.raw(`
      SELECT
        COALESCE(NULLIF(TRIM(customer_name), ''), '其他') AS customer_name,
        SUM(COALESCE(CAST(total_fee AS numeric), 0))      AS total
      FROM orders
      WHERE status IN ('delivered', 'assigned', 'in_transit')
        AND (
          (delivery_date IS NOT NULL AND delivery_date >= '${dateFrom}' AND delivery_date <= '${dateTo}')
          OR
          (delivery_date IS NULL AND created_at::date >= '${dateFrom}'::date AND created_at::date <= '${dateTo}'::date)
        )
      GROUP BY TRIM(customer_name)
      ORDER BY total DESC
    `));

    const data = report.data as any;
    const customers: string[] = data.customers ?? DEFAULT_CUSTOMERS;

    // 先歸零，再填入
    const transportIncome: Record<string, number> = Object.fromEntries(customers.map(c => [c, 0]));
    let otherTotal = 0;

    for (const r of orderRows.rows as any[]) {
      const name  = r.customer_name as string;
      const total = parseFloat(r.total ?? "0");
      if (customers.includes(name)) {
        transportIncome[name] = total;
      } else {
        otherTotal += total;
      }
    }
    // 不在客戶清單的累加到「其他」
    if (customers.includes("其他")) transportIncome["其他"] += otherTotal;

    const newData = { ...data, transport_income: transportIncome };
    await db.execute(sql`
      UPDATE monthly_pnl_reports
      SET data = ${JSON.stringify(newData)}::jsonb, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({
      ok: true,
      transport_income: transportIncome,
      orders_found: (orderRows.rows as any[]).length,
      period: `${gregorian}年${month}月`,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
