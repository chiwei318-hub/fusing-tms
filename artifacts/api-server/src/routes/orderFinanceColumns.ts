/**
 * orderFinanceColumns.ts
 * 路徑：artifacts/api-server/src/routes/orderFinanceColumns.ts
 *
 * 職責：
 *   1. ensureOrderFinanceColumns() — 冪等建立 orders 表的 11 個財務欄位
 *   2. calcOrderFinance()          — 純函式，計算各財務欄位值（在 POST/PUT 路由呼叫）
 *
 * 11 欄位總覽：
 *   cost_amount      司機實領      = rate_per_trip
 *   profit_amount    平台毛利      = total_fee - cost - vat
 *   vat_amount       銷項稅        = total_fee / 1.05 × 5%
 *   withholding_tax  扣繳稅        薪資結算時處理（訂單層維持 0）
 *   tax_category     課稅類別      taxable / zero_rated / exempt
 *   is_tax_exempt    免稅旗標      離島、醫療等特殊情境
 *   invoice_no       發票號碼
 *   invoice_date     發票日期
 *   fleet_payout     車隊實領      = rate × (1 - commission%)
 *   fleet_paid_at    車隊付款時間
 *   monthly_bill_id  月帳單歸戶    FK → monthly_bills
 */

import { pool } from "@workspace/db";

// ── DDL ───────────────────────────────────────────────────────────────────────

export async function ensureOrderFinanceColumns(): Promise<void> {
  const cols: string[] = [
    // 成本與毛利
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_amount      NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_amount    NUMERIC(10,2) DEFAULT 0`,

    // 稅務
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount       NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_tax  NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_category     TEXT DEFAULT 'taxable'`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_tax_exempt    BOOLEAN DEFAULT FALSE`,

    // 發票
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_no       TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date     DATE`,

    // 車隊結算
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_payout     NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_paid_at    TIMESTAMPTZ`,

    // 月帳單歸戶（FK → monthly_bills）
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS monthly_bill_id  INTEGER`,
  ];

  for (const stmt of cols) {
    try {
      await pool.query(stmt);
    } catch {
      // 欄位已存在，忽略
    }
  }

  console.log("[OrderFinance] orders 財務欄位確認完成（11 欄）");
}

// ── 計算公式（純函式，無副作用）─────────────────────────────────────────────

export interface OrderFinanceParams {
  total_fee:        number;       // 客戶含稅總額
  rate_per_trip:    number;       // 司機跑單費（來自 route_prefix_rates）
  commission_rate?: number;       // 平台抽成 %（預設 15）
  is_tax_exempt?:   boolean;      // 是否免稅
  tax_category?:    string;       // taxable / zero_rated / exempt
}

export interface OrderFinanceResult {
  vat_amount:      number;
  cost_amount:     number;
  fleet_payout:    number;
  withholding_tax: number;  // 訂單層維持 0；月薪資結算時處理
  profit_amount:   number;
}

export function calcOrderFinance(params: OrderFinanceParams): OrderFinanceResult {
  const {
    total_fee,
    rate_per_trip,
    commission_rate = 15,
    is_tax_exempt   = false,
    tax_category    = "taxable",
  } = params;

  // 銷項稅（含稅反推）
  const vat_amount =
    is_tax_exempt || tax_category !== "taxable"
      ? 0
      : Math.round((total_fee / 1.05) * 0.05 * 100) / 100;

  // 司機實領（成本）
  const cost_amount = rate_per_trip;

  // 車隊實領（扣平台抽成）
  const fleet_payout =
    Math.round(rate_per_trip * (1 - commission_rate / 100) * 100) / 100;

  // 扣繳 — 訂單層不扣，在薪資結算模組（taxPayroll）處理
  const withholding_tax = 0;

  // 平台毛利
  const profit_amount =
    Math.round((total_fee - cost_amount - vat_amount) * 100) / 100;

  return { vat_amount, cost_amount, fleet_payout, withholding_tax, profit_amount };
}
