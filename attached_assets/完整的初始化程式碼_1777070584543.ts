/**
 * orderFinanceColumns.ts
 * 路徑：artifacts/api-server/src/routes/orderFinanceColumns.ts
 *
 * 在你現有路由的初始化區塊（ensureXxx 函式）裡呼叫 ensureOrderFinanceColumns()
 * 冪等設計：重啟不報錯，欄位已存在直接跳過
 *
 * 建議加在 financeSettlement.ts 或 orders.ts 的初始化區塊
 */

import { db, sql } from "@workspace/db";

export async function ensureOrderFinanceColumns() {
  const cols = [
    // ── 成本與毛利 ──────────────────────────────────────
    // 司機實際領取金額（來自 route_prefix_rates.rate_per_trip）
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_amount       NUMERIC(10,2) DEFAULT 0`,

    // 平台毛利 = total_fee - cost_amount - vat_amount
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_amount     NUMERIC(10,2) DEFAULT 0`,

    // ── 稅務 ─────────────────────────────────────────────
    // 銷項營業稅 = total_fee / 1.05 × 0.05
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount        NUMERIC(10,2) DEFAULT 0`,

    // 扣繳稅款（付給司機/車隊時預扣）
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_tax   NUMERIC(10,2) DEFAULT 0`,

    // 課稅類別：taxable（應稅）/ zero_rated（零稅率）/ exempt（免稅）
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_category      TEXT DEFAULT 'taxable'`,

    -- 免稅旗標（離島、醫療等特殊情境）
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_tax_exempt     BOOLEAN DEFAULT FALSE`,

    // ── 發票 ─────────────────────────────────────────────
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_no        TEXT`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date      DATE`,

    // ── 車隊結算 ──────────────────────────────────────────
    // 車隊實領 = rate_per_trip × (1 - commission_rate/100)
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_payout      NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fleet_paid_at     TIMESTAMPTZ`,

    // ── 月帳單歸戶 ────────────────────────────────────────
    // 關聯 monthly_bills.id，月結客戶使用
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS monthly_bill_id   INTEGER`,
  ];

  for (const stmt of cols) {
    try {
      await db.execute(sql.raw(stmt));
    } catch {
      // 欄位已存在，忽略
    }
  }

  console.log("[OrderFinance] orders 財務欄位確認完成（11 欄）");
}

// ══════════════════════════════════════════════════════════════
// 計算公式（在 financeSettlement.ts 裡呼叫）
// ══════════════════════════════════════════════════════════════

/**
 * 根據訂單資料計算各財務欄位
 * 在 POST /orders 或 PUT /orders/:id 時呼叫，自動填入
 */
export function calcOrderFinance(params: {
  total_fee: number;          // 客戶含稅總額
  rate_per_trip: number;      // 司機跑單費（來自 prefix_rates）
  commission_rate?: number;   // 平台抽成%（預設15）
  is_tax_exempt?: boolean;    // 是否免稅
  tax_category?: string;
}) {
  const {
    total_fee,
    rate_per_trip,
    commission_rate = 15,
    is_tax_exempt = false,
    tax_category = "taxable",
  } = params;

  // 營業稅（含稅總額反推）
  const vat_amount = is_tax_exempt || tax_category !== "taxable"
    ? 0
    : Math.round((total_fee / 1.05) * 0.05 * 100) / 100;

  // 司機實領（成本）
  const cost_amount = rate_per_trip;

  // 車隊實領（扣平台抽成）
  const fleet_payout = Math.round(rate_per_trip * (1 - commission_rate / 100) * 100) / 100;

  // 扣繳（司機單次 >= 24,000 才扣；月累計邏輯在 payroll 模組處理）
  const withholding_tax = 0; // 訂單層不扣，在薪資結算時處理

  // 平台毛利
  const profit_amount = Math.round(
    (total_fee - cost_amount - vat_amount) * 100
  ) / 100;

  return {
    vat_amount,
    cost_amount,
    fleet_payout,
    withholding_tax,
    profit_amount,
  };
}

// ══════════════════════════════════════════════════════════════
// 使用範例（貼到 orders.ts 的 POST/PUT 路由裡）
// ══════════════════════════════════════════════════════════════
/*
import { calcOrderFinance } from "./orderFinanceColumns";

// 在建立/更新訂單時自動計算財務欄位：
const finance = calcOrderFinance({
  total_fee:      body.total_fee,
  rate_per_trip:  prefixRate.rate_per_trip,
  commission_rate: fleetCommissionRate ?? 15,
  is_tax_exempt:  body.is_tax_exempt,
});

await db.execute(sql`
  UPDATE orders SET
    cost_amount    = ${finance.cost_amount},
    profit_amount  = ${finance.profit_amount},
    vat_amount     = ${finance.vat_amount},
    fleet_payout   = ${finance.fleet_payout}
  WHERE id = ${orderId}
`);
*/
