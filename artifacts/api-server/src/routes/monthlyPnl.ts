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
 *   GET    /monthly-pnl/:id/template      — 下載 Excel 範本（含現有資料）
 *   POST   /monthly-pnl/:id/import        — 上傳 Excel 匯入數字
 */
import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// ─── 費用科目名稱 → JSON key 對照 ──────────────────────────────────────────────
const EXPENSE_KEY_MAP: Record<string, string> = {
  "租金支出": "rent", "油資": "fuel", "郵電費": "telecom",
  "FB廣告費": "facebook_ads", "水電費": "utilities", "交際費": "entertainment",
  "勞務費": "labor", "修繕保養": "maintenance", "罰單": "fines",
};
const ADJ_KEY_MAP: Record<string, string> = {
  "前月收入本月發票": "prev_month_invoice",
  "本月收入次月發票": "next_month_invoice",
  "扣除費用": "deductions",
  "罰單(調節)": "adj_fines",
};

// ─── 從報表資料產生二維陣列 ────────────────────────────────────────────────────
function buildSheet1(data: any, customers: string[], drivers: string[]): any[][] {
  const cols = customers;
  const rows: any[][] = [];
  const v = (rec: any, c: string) => (rec?.[c] ?? 0) || 0;

  rows.push(["科目", ...cols]);
  rows.push(["[收入]", ...cols.map(() => "")]);
  rows.push(["運輸收入", ...cols.map(c => v(data.transport_income, c))]);
  rows.push(["靠行收入", ...cols.map(c => c === "其他" ? (data.parking_income || 0) : "")]);
  rows.push(["油資價差", ...cols.map(c => c === "其他" ? (data.fuel_price_diff || 0) : "")]);
  rows.push(["其他收入", ...cols.map(c => c === "其他" ? (data.misc_income || 0) : "")]);
  rows.push(["", ...cols.map(() => "")]);
  rows.push(["[運費成本]", ...cols.map(() => "")]);
  for (const d of drivers) {
    rows.push([d, ...cols.map(c => v(data.driver_costs?.[d], c))]);
  }
  rows.push(["", ...cols.map(() => "")]);
  rows.push(["[營業費用]（填在「其他」欄）", ...cols.map(() => "")]);
  for (const [label, key] of Object.entries(EXPENSE_KEY_MAP)) {
    rows.push([label, ...cols.map(c => c === "其他" ? (data.expenses?.[key] || 0) : "")]);
  }
  rows.push(["", ...cols.map(() => "")]);
  rows.push(["[其他費用]（可按客戶分配）", ...cols.map(() => "")]);
  rows.push(["其他費用", ...cols.map(c => v(data.other_expenses_per_customer, c))]);
  rows.push(["", ...cols.map(() => "")]);
  rows.push(["營所稅", ...cols.map(c => c === "其他" ? (data.income_tax || 0) : "")]);
  return rows;
}

function buildSheet2(data: any, customers: string[]): any[][] {
  const cols = customers;
  const adj  = data.revenue_adj ?? {};
  const v    = (rec: any, c: string) => (rec?.[c] ?? 0) || 0;

  const rows: any[][] = [];
  rows.push(["科目", ...cols]);
  rows.push(["前月收入本月發票", ...cols.map(c => v(adj.prev_month_invoice, c))]);
  rows.push(["本月收入次月發票", ...cols.map(c => v(adj.next_month_invoice, c))]);
  rows.push(["扣除費用", ...cols.map(c => v(adj.deductions, c))]);
  rows.push(["代收代付", ...cols.map(c => c === "其他" ? (adj.agency_receipts || 0) : "")]);
  rows.push(["罰單(調節)", ...cols.map(c => v(adj.adj_fines, c))]);
  return rows;
}

// ─── GET /monthly-pnl/:id/template — 下載 Excel 範本 ─────────────────────────
monthlyPnlRouter.get("/:id/template", async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const rpt = await db.execute(sql`SELECT roc_year, month, data FROM monthly_pnl_reports WHERE id = ${id}`);
    if (!rpt.rows.length) return res.status(404).json({ error: "月報不存在" });

    const row      = rpt.rows[0] as any;
    const data     = row.data as any;
    const customers: string[] = data.customers ?? DEFAULT_CUSTOMERS;
    const drivers:   string[] = data.drivers   ?? DEFAULT_DRIVERS;
    const rocYear  = row.roc_year;
    const month    = row.month;

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(buildSheet1(data, customers, drivers));
    // 設定合理欄寬
    ws1["!cols"] = [{ wch: 24 }, ...customers.map(() => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, ws1, "損益表");

    const ws2 = XLSX.utils.aoa_to_sheet(buildSheet2(data, customers));
    ws2["!cols"] = [{ wch: 24 }, ...customers.map(() => ({ wch: 12 }))];
    XLSX.utils.book_append_sheet(wb, ws2, "銷貨收入調節表");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const filename = encodeURIComponent(`${rocYear}年${month}月損益表.xlsx`);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /monthly-pnl/:id/import — 上傳 Excel 匯入 ─────────────────────────
monthlyPnlRouter.post("/:id/import", upload.single("file"), async (req: any, res) => {
  try {
    const id  = parseInt(req.params.id);
    const rpt = await db.execute(sql`SELECT data FROM monthly_pnl_reports WHERE id = ${id}`);
    if (!rpt.rows.length) return res.status(404).json({ error: "月報不存在" });
    if (!req.file) return res.status(400).json({ error: "請上傳 .xlsx 或 .csv 檔案" });

    const data: any      = JSON.parse(JSON.stringify((rpt.rows[0] as any).data));
    const customers: string[] = data.customers ?? DEFAULT_CUSTOMERS;
    const drivers:   string[] = data.drivers   ?? DEFAULT_DRIVERS;

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const stats = { filled: 0, skipped: 0 };

    // ── 解析「損益表」Sheet ──────────────────────────────────────────────────
    const ws1name = wb.SheetNames.find(n => n.includes("損益表") && !n.includes("調節")) ?? wb.SheetNames[0];
    if (ws1name) {
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[ws1name], { header: 1, defval: "" });
      // 第一行抓客戶欄位對照
      const headers: string[] = (rows[0] ?? []).map((h: any) => String(h).trim());
      const colMap: Record<string, number> = {};
      headers.forEach((h, i) => { if (i > 0 && customers.includes(h)) colMap[h] = i; });

      let section = "";
      for (let ri = 1; ri < rows.length; ri++) {
        const row  = rows[ri] ?? [];
        const label = String(row[0] ?? "").trim();
        if (!label) continue;

        // 偵測 section marker
        if (label.startsWith("[")) { section = label; continue; }

        const getVal = (c: string) => {
          const idx = colMap[c];
          if (idx == null) return null;
          const raw = row[idx];
          if (raw === "" || raw == null) return null;
          const n = parseFloat(String(raw).replace(/,/g, ""));
          return isNaN(n) ? null : n;
        };

        if (label === "運輸收入") {
          for (const c of customers) {
            const v = getVal(c);
            if (v != null) { data.transport_income[c] = v; stats.filled++; }
          }
        } else if (label === "靠行收入") {
          const v = getVal("其他");
          if (v != null) { data.parking_income = v; stats.filled++; }
        } else if (label === "油資價差") {
          const v = getVal("其他");
          if (v != null) { data.fuel_price_diff = v; stats.filled++; }
        } else if (label === "其他收入") {
          const v = getVal("其他");
          if (v != null) { data.misc_income = v; stats.filled++; }
        } else if (drivers.includes(label)) {
          if (!data.driver_costs[label]) data.driver_costs[label] = {};
          for (const c of customers) {
            const v = getVal(c);
            if (v != null) { data.driver_costs[label][c] = v; stats.filled++; }
          }
        } else if (EXPENSE_KEY_MAP[label]) {
          const v = getVal("其他");
          if (v != null) { data.expenses[EXPENSE_KEY_MAP[label]] = v; stats.filled++; }
        } else if (label === "其他費用") {
          for (const c of customers) {
            const v = getVal(c);
            if (v != null) { data.other_expenses_per_customer[c] = v; stats.filled++; }
          }
        } else if (label === "營所稅") {
          const v = getVal("其他");
          if (v != null) { data.income_tax = v; stats.filled++; }
        } else {
          stats.skipped++;
        }
      }
    }

    // ── 解析「銷貨收入調節表」Sheet ─────────────────────────────────────────
    const ws2name = wb.SheetNames.find(n => n.includes("調節"));
    if (ws2name) {
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[ws2name], { header: 1, defval: "" });
      const headers: string[] = (rows[0] ?? []).map((h: any) => String(h).trim());
      const colMap: Record<string, number> = {};
      headers.forEach((h, i) => { if (i > 0 && customers.includes(h)) colMap[h] = i; });

      if (!data.revenue_adj) data.revenue_adj = { prev_month_invoice: {}, next_month_invoice: {}, deductions: {}, agency_receipts: 0, adj_fines: {} };

      for (let ri = 1; ri < rows.length; ri++) {
        const row   = rows[ri] ?? [];
        const label = String(row[0] ?? "").trim();
        if (!label || label.startsWith("[")) continue;

        const getVal = (c: string) => {
          const idx = colMap[c];
          if (idx == null) return null;
          const raw = row[idx];
          if (raw === "" || raw == null) return null;
          const n = parseFloat(String(raw).replace(/,/g, ""));
          return isNaN(n) ? null : n;
        };

        if (ADJ_KEY_MAP[label]) {
          const key = ADJ_KEY_MAP[label];
          for (const c of customers) {
            const v = getVal(c);
            if (v != null) { data.revenue_adj[key][c] = v; stats.filled++; }
          }
        } else if (label === "代收代付") {
          const v = getVal("其他");
          if (v != null) { data.revenue_adj.agency_receipts = v; stats.filled++; }
        }
      }
    }

    // ── 寫回 DB ──────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE monthly_pnl_reports
      SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ ok: true, filled: stats.filled, skipped: stats.skipped });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── 從 Google 試算表 URL 解析 Sheet ID ──────────────────────────────────────
function extractGSheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ─── 格式 1：收支明細帳（舊格式）費用類別對照 ────────────────────────────────
const CASHFLOW_EXPENSE_MAP: Record<string, string> = {
  "油費儲值": "fuel",  "水電費": "utilities",   "交際費": "entertainment",
  "記帳費":   "labor", "電信費": "telecom",      "FB廣告費": "facebook_ads",
  "租金支出": "rent",
};
function isFineCompanyExpense(note: string): boolean {
  const n = String(note ?? "").trim();
  return n === "" || n.includes("公司費用");
}

// ─── 格式 2：運費淨利明細表 供應商 → 司機名稱 對照 ──────────────────────────
const VENDOR_DRIVER_MAP: Record<string, string> = {
  "泰通交通股份有限公司": "泰立",
  "泰通":                "泰立",
  "泰立交通有限公司":     "泰立",
  "蝦皮車隊":            "蝦皮",
  "吳育昇":              "吳昱陞",
};

// ─── 通用：建立司機別名查詢表（忽略括號內容）─────────────────────────────────
function buildDriverAliases(drivers: string[]) {
  return Object.fromEntries(drivers.map(d => [d.replace(/\(.*?\)/g, "").trim(), d]));
}

// ─── 通用：清空可重填欄位 ─────────────────────────────────────────────────────
function resetData(data: any, customers: string[], drivers: string[]) {
  for (const c of customers) data.transport_income[c] = 0;
  for (const k of Object.keys(data.expenses ?? {})) data.expenses[k] = 0;
  data.parking_income = 0;
  data.misc_income    = 0;
  for (const d of drivers) {
    if (data.driver_costs[d]) {
      for (const c of customers) data.driver_costs[d][c] = 0;
    }
  }
}

// ─── 通用：確保司機存在於 data.drivers + data.driver_costs ────────────────────
function ensureDriver(data: any, drv: string) {
  if (!data.drivers.includes(drv)) data.drivers.push(drv);
  if (!data.driver_costs[drv]) data.driver_costs[drv] = {};
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 1：收支明細帳 解析（月份 + 類別欄）
// ═══════════════════════════════════════════════════════════════════════════════
function parseCashflowFormat(
  wb: XLSX.WorkBook,
  data: any,
  customers: string[],
  drivers: string[],
  targetMonth: string,   // e.g. "115.3"
) {
  const wsn   = wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wsn], { header: 1, defval: "" });
  const driverAliases = buildDriverAliases(drivers);

  const [yr, mo]  = targetMonth.split(".");
  const moNum     = parseInt(mo);
  const matchMonth = (v: any) => {
    const s = String(v).trim();
    return s === targetMonth ||
           s === `${yr}.${String(moNum).padStart(2, "0")}` ||
           parseFloat(s) === parseFloat(targetMonth);
  };

  const monthRows = rows.slice(2).filter(r => matchMonth(r[1]));
  if (!monthRows.length) {
    const avail = [...new Set(rows.slice(2).map((r: any) => String(r[1]).trim()).filter(Boolean))].join(", ");
    throw new Error(`找不到「${targetMonth}」月份的資料，試算表內月份：${avail}`);
  }

  resetData(data, customers, drivers);
  const stats = { income: 0, driver: 0, expense: 0, fine: 0, skipped: 0 };

  const findCustomer = (desc: string) => customers.find(c => c !== "其他" && desc.includes(c)) ?? "其他";
  const findDriver   = (desc: string) => {
    for (const [alias, full] of Object.entries(driverAliases)) {
      if (desc.includes(alias)) return full as string;
    }
    const m = desc.match(/^支付(.+?)(?:\d+月|運費|$)/);
    return m ? m[1].trim() : desc.replace(/^支付/, "").trim();
  };

  for (const r of monthRows) {
    const cat  = String(r[2] ?? "").trim();
    const desc = String(r[4] ?? "").trim();
    const inc  = parseFloat(String(r[5] ?? "0").replace(/,/g, "")) || 0;
    const exp  = parseFloat(String(r[6] ?? "0").replace(/,/g, "")) || 0;
    const note = String(r[8] ?? "").trim();

    if (cat === "運費收入" && inc > 0) {
      const c = findCustomer(desc);
      data.transport_income[c] = (data.transport_income[c] ?? 0) + inc;
      stats.income++;
    } else if (cat === "支付外包" && exp > 0) {
      const drv = findDriver(desc);
      ensureDriver(data, drv);
      data.driver_costs[drv]["其他"] = (data.driver_costs[drv]["其他"] ?? 0) + exp;
      stats.driver++;
    } else if (CASHFLOW_EXPENSE_MAP[cat] && exp > 0) {
      data.expenses[CASHFLOW_EXPENSE_MAP[cat]] = (data.expenses[CASHFLOW_EXPENSE_MAP[cat]] ?? 0) + exp;
      stats.expense++;
    } else if (cat === "罰單" && exp > 0 && isFineCompanyExpense(note)) {
      data.expenses["fines"] = (data.expenses["fines"] ?? 0) + exp;
      stats.fine++;
    } else if (cat === "靠行收入" && inc > 0) {
      data.parking_income = (data.parking_income ?? 0) + inc;
    } else {
      stats.skipped++;
    }
  }

  return { format: "收支明細帳", rows_scanned: monthRows.length, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 2：運費淨利明細表 解析（逐筆訂單 + 應付帳款）
// ═══════════════════════════════════════════════════════════════════════════════
function parseDetailedFormat(
  wb: XLSX.WorkBook,
  data: any,
  customers: string[],
  drivers: string[],
  rocYear: number,
  month: number,
) {
  const driverAliases = buildDriverAliases(drivers);
  const stats = { income: 0, driver: 0, expense: 0, skipped: 0 };

  resetData(data, customers, drivers);

  // ── 運費收入：從「運費淨利明細表 *」工作表 ────────────────────────────────
  const detailSheetName = wb.SheetNames.find(n => n.includes("運費淨利明細表"));
  if (detailSheetName) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[detailSheetName], { header: 1, defval: "" });
    const monthRows = rows.slice(3).filter(r => {
      const v = r[1];
      return v === month || parseInt(String(v)) === month;
    });

    for (const r of monthRows) {
      const custRaw = String(r[2] ?? "").trim();
      const amt     = parseFloat(String(r[11] ?? "0").replace(/,/g, "")) || 0;
      if (!custRaw || !amt) continue;

      // 比對客戶清單（含部分比對）
      const matched = customers.find(c => c !== "其他" && (custRaw === c || custRaw.includes(c))) ?? "其他";
      data.transport_income[matched] = (data.transport_income[matched] ?? 0) + amt;
      stats.income++;
    }
  }

  // ── 司機外包費用：從「應付帳款」工作表 ───────────────────────────────────
  const apSheetName = wb.SheetNames.find(n => n === "應付帳款");
  if (apSheetName) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[apSheetName], { header: 1, defval: "" });

    // 找到目標月份的 section header（e.g., "115.03月應付" 或 "115.3月應付"）
    const monthPadded = `${rocYear}.${String(month).padStart(2, "0")}月`;
    const monthShort  = `${rocYear}.${month}月`;

    let inSection = false;
    for (const r of rows) {
      const col0 = String(r[0] ?? "").trim();
      const col1 = String(r[1] ?? "").trim();
      const col2 = r[2];
      const note = String(r[3] ?? "").trim();

      // 偵測 section header（如 "115.03月應付(01)"）
      if (col0.includes(monthPadded) || col0.includes(monthShort)) {
        inSection = true;
        continue;
      }
      // 下一個 section 結束
      if (inSection && col0.match(/^\d{3}\.\d{1,2}月應付/) && !col0.includes(monthPadded) && !col0.includes(monthShort)) {
        inSection = false;
      }

      if (!inSection) continue;
      if (!col1 || !col2) continue;

      // 跳過「累計」行
      if (note.includes("累計") || String(col2).includes("累計")) continue;

      const amt = parseFloat(String(col2).replace(/,/g, "")) || 0;
      if (!amt || amt <= 0) continue;

      const vendorName = col1;
      // 供應商 → 司機名稱對照
      let drvName = VENDOR_DRIVER_MAP[vendorName] ?? null;
      if (!drvName) {
        // 嘗試對照司機別名
        for (const [alias, full] of Object.entries(driverAliases)) {
          if (vendorName.includes(alias)) { drvName = full as string; break; }
        }
      }
      if (!drvName) drvName = vendorName; // 無匹配，直接用原名

      // 會計事務所 → 記帳費
      if (vendorName.includes("會計事務所") || vendorName.includes("記帳")) {
        data.expenses["labor"] = (data.expenses["labor"] ?? 0) + amt;
        stats.expense++;
        continue;
      }

      ensureDriver(data, drvName);
      data.driver_costs[drvName]["其他"] = (data.driver_costs[drvName]["其他"] ?? 0) + amt;
      stats.driver++;
    }
  }

  const totalRows = (stats.income + stats.driver + stats.expense);
  return { format: "運費淨利明細表", rows_scanned: totalRows, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 3：進銷項發票明細 解析（按雙月期工作表，依日期過濾）
// ═══════════════════════════════════════════════════════════════════════════════

/** 解析工作表名稱，取得年度 / 月份範圍 / 類型（進項或銷項）*/
function parseInvoiceSheetPeriod(name: string) {
  // 支援 "115.3-4進項發票", "115.1.-2銷項發票 ", "114.11-12銷項發票" 等格式
  const m = name.trim().match(/^(\d{3})\.(\d{1,2})[-.]?(\d{1,2})?([進銷]項)/);
  if (!m) return null;
  return {
    year:  parseInt(m[1]),
    start: parseInt(m[2]),
    end:   m[3] ? parseInt(m[3]) : parseInt(m[2]),
    type:  m[4] as "進項" | "銷項",
  };
}

/** 費用品名 → P&L 費用欄位對照 */
const INVOICE_EXPENSE_MAP: Array<[string, string]> = [
  ["油",    "fuel"],
  ["保養",  "vehicle_maintenance"],
  ["輪胎",  "vehicle_maintenance"],
  ["零件",  "vehicle_maintenance"],
  ["保修",  "vehicle_maintenance"],
  ["停車",  "misc_expense"],
  ["電話",  "telecom"],
  ["網路",  "telecom"],
  ["記帳",  "labor"],
  ["餐費",  "entertainment"],
  ["禮品",  "entertainment"],
  ["交際",  "entertainment"],
  ["廣告",  "facebook_ads"],
  ["水電",  "utilities"],
  ["租金",  "rent"],
  ["Etag",  "toll"],
  ["通行",  "toll"],
];

/** 進銷項發票格式解析 */
function parseInvoiceFormat(
  wb: XLSX.WorkBook,
  data: any,
  customers: string[],
  rocYear: number,
  month: number,
) {
  // 日期過濾器（支援 "115.03." 或 "115.3."）
  const monthPad = String(month).padStart(2, "0");
  const isTargetDate = (v: any) => {
    const s = String(v ?? "").trim();
    return s.startsWith(`${rocYear}.${monthPad}.`) || s.startsWith(`${rocYear}.${month}.`);
  };

  // 找到目標年月覆蓋的工作表
  const findSheets = (type: "進項" | "銷項") =>
    wb.SheetNames.filter(n => {
      const p = parseInvoiceSheetPeriod(n);
      return p && p.year === rocYear && p.start <= month && p.end >= month && p.type === type;
    });

  // 跳過互開或純金融往來的賣方 / 買方
  const SKIP_PARTIES  = ["合迪"];
  // 跳過這些品名（融資、車貸互開）
  const SKIP_ITEMS    = ["車貸", "佣金", "本金", "利息", "手續費", "貸款"];
  const isSkipParty   = (s: string) => SKIP_PARTIES.some(p => s.includes(p));
  const isSkipItem    = (s: string) => SKIP_ITEMS.some(k => s.includes(k));

  // 客戶名稱比對（全名 → 短名）
  const matchCustomer = (fullName: string) =>
    customers.find(c => c !== "其他" && fullName.includes(c)) ?? "其他";

  // 重置收入和費用（保留司機成本不清空，司機數據需另用格式2匯入）
  for (const c of customers) data.transport_income[c] = 0;
  for (const k of Object.keys(data.expenses ?? {})) data.expenses[k] = 0;
  data.parking_income = 0;
  data.misc_income    = 0;

  const stats = { income: 0, expense: 0, skipped: 0 };

  // ── 銷項：運費收入 ──────────────────────────────────────────────────────────
  for (const sheetName of findSheets("銷項")) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    for (const r of rows.slice(4)) {
      if (!isTargetDate(r[1])) continue;
      const buyer = String(r[3] ?? "").trim();
      const item  = String(r[5] ?? "").trim();
      const amt   = parseFloat(String(r[6] ?? "0").replace(/,/g, "")) || 0;
      if (!amt || !buyer) continue;
      if (isSkipParty(buyer) || isSkipItem(item)) continue;

      if (item.includes("運費")) {
        const cust = matchCustomer(buyer);
        data.transport_income[cust] = (data.transport_income[cust] ?? 0) + amt;
        stats.income++;
      } else if (item.includes("租金")) {
        data.parking_income = (data.parking_income ?? 0) + amt;
        stats.income++;
      }
      // 其他品名暫不匯入（靠行、佣金等非主要業務）
    }
  }

  // ── 進項：費用 ──────────────────────────────────────────────────────────────
  for (const sheetName of findSheets("進項")) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
    for (const r of rows.slice(4)) {
      if (!isTargetDate(r[1])) continue;
      const seller = String(r[3] ?? "").trim();
      const item   = String(r[5] ?? "").trim();
      const amt    = parseFloat(String(r[6] ?? "0").replace(/,/g, "")) || 0;
      if (!amt || !seller) continue;
      if (isSkipParty(seller)) continue;  // 跳過合迪（車貸互開+代付油費）
      if (isSkipItem(item))    continue;  // 跳過本金/利息等

      // 罰單（賣方名含「罰款」或品名含「罰款」）
      if (seller.includes("罰款") || item.includes("罰款") || item.includes("罰單")) {
        data.expenses["fines"] = (data.expenses["fines"] ?? 0) + amt;
        stats.expense++;
        continue;
      }

      // 依品名關鍵字映射費用
      let mapped = false;
      for (const [keyword, key] of INVOICE_EXPENSE_MAP) {
        if (item.includes(keyword)) {
          data.expenses[key] = (data.expenses[key] ?? 0) + amt;
          stats.expense++;
          mapped = true;
          break;
        }
      }
      if (!mapped) stats.skipped++;
    }
  }

  const rows_scanned = stats.income + stats.expense + stats.skipped;
  return { format: "進銷項發票", rows_scanned, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 4：零用金收支表 解析（Excel 序列號日期，疊加模式）
// ═══════════════════════════════════════════════════════════════════════════════

/** Excel 序列號 → ROC 年/月/日 */
function excelSerialToRoc(serial: number): { year: number; month: number; day: number } | null {
  if (!serial || typeof serial !== "number") return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return {
    year:  d.getUTCFullYear() - 1911,
    month: d.getUTCMonth() + 1,
    day:   d.getUTCDate(),
  };
}

/** 零用金說明 → P&L 費用欄位對照 */
const PETTY_CASH_MAP: Array<[RegExp, string]> = [
  [/油費|機油|加油/,             "fuel"],
  [/保養|驗車|校正|洗車|輪胎/,  "vehicle_maintenance"],
  [/餐費|餐/,                    "entertainment"],
  [/土地公|貢品|開工|水果|金香/, "entertainment"],
  [/郵資|快遞|寄件/,             "postage"],
  [/停車/,                       "misc_expense"],
  [/五金|文具|碳粉/,             "misc_expense"],
  [/手機|電話|網路/,             "telecom"],
  [/瓦斯|水電/,                  "utilities"],
  [/廣告/,                       "facebook_ads"],
];

/** 零用金格式解析（疊加到現有費用，不重置）*/
function parsePettyCashFormat(
  wb: XLSX.WorkBook,
  data: any,
  rocYear: number,
  month: number,
) {
  const sheetName = wb.SheetNames.find(n => n.includes("零用金")) ?? wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

  const stats = { expense: 0, skipped: 0 };

  // 先把此來源的零用金費用歸零（用 tag 追蹤，避免重複匯入疊加）
  if (!data._petty_cash_imported) data._petty_cash_imported = {};
  // 把上次零用金匯入的費用從 expenses 扣除
  for (const [key, amt] of Object.entries(data._petty_cash_imported as Record<string, number>)) {
    if (data.expenses[key]) data.expenses[key] = Math.max(0, data.expenses[key] - amt);
  }
  data._petty_cash_imported = {};

  for (const r of rows.slice(5)) {
    const dt  = excelSerialToRoc(r[0] as number);
    if (!dt || dt.year !== rocYear || dt.month !== month) continue;

    const desc    = String(r[2] ?? "").trim();
    const expense = parseFloat(String(r[4] ?? "0").replace(/,/g, "")) || 0;

    if (!desc || !expense) continue;
    // 跳過非支出項目（存入、代付司機等）
    if (desc.includes("存入") || desc.includes("補充")) continue;
    if (desc.includes("代付司機")) continue;

    let mapped = false;
    for (const [re, key] of PETTY_CASH_MAP) {
      if (re.test(desc)) {
        data.expenses[key]                  = (data.expenses[key]       ?? 0) + expense;
        data._petty_cash_imported[key]      = (data._petty_cash_imported[key] ?? 0) + expense;
        stats.expense++;
        mapped = true;
        break;
      }
    }
    if (!mapped) {
      // 歸入雜項費用
      data.expenses["misc_expense"]              = (data.expenses["misc_expense"]              ?? 0) + expense;
      data._petty_cash_imported["misc_expense"]  = (data._petty_cash_imported["misc_expense"] ?? 0) + expense;
      stats.skipped++;
    }
  }

  return { format: "零用金收支表", rows_scanned: stats.expense + stats.skipped, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 5：單月運費淨利明細表 解析（工作表名如 "115.3月"，含外車欄）
//   — 從逐筆訂單同時推導收入（小計）與司機外包費（派外車10%欄）
// ═══════════════════════════════════════════════════════════════════════════════
function parseSingleMonthDetailFormat(
  wb: XLSX.WorkBook,
  data: any,
  customers: string[],
  drivers: string[],
  month: number,
) {
  // 找到名稱含「月」的工作表（如 "115.3月"）
  const sheetName = wb.SheetNames.find(n => /\d+月/.test(n)) ?? wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
  const driverAliases = buildDriverAliases(drivers);

  resetData(data, customers, drivers);
  const stats = { income: 0, driver: 0, skipped: 0 };

  for (const r of rows.slice(3)) {
    const billingMonth = parseInt(String(r[1] ?? "").trim());
    if (billingMonth !== month) continue; // 只取目標帳款月份

    const custRaw    = String(r[2]  ?? "").trim();
    const subtotal   = parseFloat(String(r[11] ?? "0").replace(/,/g, "")) || 0;
    const driverCost = parseFloat(String(r[12] ?? "0").replace(/,/g, "")) || 0;
    const driverRaw  = String(r[14] ?? "").trim();

    if (!custRaw || !subtotal) continue;

    // ── 運費收入 ────────────────────────────────────────────────────────────
    const matched = customers.find(c => c !== "其他" && (custRaw === c || custRaw.includes(c))) ?? "其他";
    data.transport_income[matched] = (data.transport_income[matched] ?? 0) + subtotal;
    stats.income++;

    // ── 司機外包費 ──────────────────────────────────────────────────────────
    if (driverRaw && driverCost > 0) {
      // 先用 VENDOR_DRIVER_MAP 對照，再用別名，最後直接用原名
      let drvName = VENDOR_DRIVER_MAP[driverRaw] ?? null;
      if (!drvName) {
        for (const [alias, full] of Object.entries(driverAliases)) {
          if (driverRaw.includes(alias)) { drvName = full as string; break; }
        }
      }
      if (!drvName) drvName = driverRaw;

      ensureDriver(data, drvName);
      // 按客戶拆分（每筆訂單知道對應客戶）
      if (!data.driver_costs[drvName][matched]) data.driver_costs[drvName][matched] = 0;
      data.driver_costs[drvName][matched] = (data.driver_costs[drvName][matched] ?? 0) + driverCost;
      stats.driver++;
    }
  }

  return { format: "單月運費淨利明細表", rows_scanned: stats.income + stats.driver, stats };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 6：油卡消費明細 解析（車隊加油卡交易記錄）
//   — 日期格式 "2026-01-01 044313"，按月過濾，加總售價小計 → fuel 費用
//   — 疊加模式（保留其他費用，oil 欄位用 _fuel_card_imported 追蹤冪等）
// ═══════════════════════════════════════════════════════════════════════════════
function parseFuelCardFormat(
  wb: XLSX.WorkBook,
  data: any,
  rocYear: number,
  month: number,
) {
  const sheetName = wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

  // 解析 "2026-01-01 044313" → { year(ROC), month, day }
  const parseCardDate = (s: any) => {
    const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { year: parseInt(m[1]) - 1911, month: parseInt(m[2]) };
  };

  // 冪等：先扣除上次油卡匯入的金額
  if (!data._fuel_card_imported) data._fuel_card_imported = 0;
  data.expenses["fuel"] = Math.max(0, (data.expenses["fuel"] ?? 0) - data._fuel_card_imported);
  data._fuel_card_imported = 0;

  let totalFuel = 0;
  let totalLiters = 0;
  let count = 0;
  const byPlate: Record<string, number> = {};

  for (const r of rows.slice(1)) {
    const dt  = parseCardDate(r[3]);
    if (!dt || dt.year !== rocYear || dt.month !== month) continue;

    const plate = String(r[2] ?? "").trim();
    const amt   = parseFloat(String(r[11] ?? "0").replace(/,/g, "")) || 0;
    const liters= parseFloat(String(r[6]  ?? "0").replace(/,/g, "")) || 0;
    if (!amt) continue;

    totalFuel   += amt;
    totalLiters += liters;
    count++;
    if (plate) byPlate[plate] = (byPlate[plate] ?? 0) + amt;
  }

  // 加總到 fuel 費用
  data.expenses["fuel"]       = (data.expenses["fuel"] ?? 0) + totalFuel;
  data._fuel_card_imported    = totalFuel;

  return {
    format: "油卡消費明細",
    rows_scanned: count,
    stats: { income: 0, expense: count, skipped: 0 },
    extra: { totalFuel, totalLiters: Math.round(totalLiters * 10) / 10, byPlate },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 7：外車運費對帳單（每司機一份，含總計）
//   — Row0: 富詠運輸有限公司
//   — Row1: YYYY年MM月 外車運費
//   — Row2: 客戶 :XXX … 匯款日期:ROC.M.D
//   — 資料列：col0 = 日期 (115.MM.DD)，col9 = 小計
//   — 疊加模式：只更新該司機的 driver_costs 欄（不影響其他司機）
// ═══════════════════════════════════════════════════════════════════════════════
function parseDriverSlipFormat(
  wb: XLSX.WorkBook,
  data: any,
  drivers: string[],
  rocYear: number,
  month: number,
): { format: string; rows_scanned: number; stats: any; extra?: any } | null {
  const sheetName = wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

  // 格式驗證
  const r0 = String(rows[0]?.[0] ?? "");
  const r1 = String(rows[1]?.[0] ?? "");
  const r2 = String(rows[2]?.[0] ?? "");
  if (!r0.includes("富詠") || !r1.includes("外車運費") || !r2.includes("客戶")) return null;

  // 解析月份（"2026年01月 外車運費" or 年月 from sheet name）
  let slipYear = rocYear, slipMonth = month;
  const ym = r1.match(/(\d{4})年(\d{1,2})月/);
  if (ym) { slipYear = parseInt(ym[1]) - 1911; slipMonth = parseInt(ym[2]); }

  if (slipYear !== rocYear || slipMonth !== month) return null; // 月份不符，略過

  // 解析司機名稱
  const driverRaw = r2.replace(/^客戶\s*[:：]\s*/, "").split(/\s+/)[0].trim();
  const driverAliases = buildDriverAliases(drivers);
  let drvName: string | null = VENDOR_DRIVER_MAP[driverRaw] ?? null;
  if (!drvName) {
    for (const [alias, full] of Object.entries(driverAliases)) {
      if (driverRaw.includes(alias as string)) { drvName = full as string; break; }
    }
  }
  if (!drvName) drvName = driverRaw; // 未知司機，原名保留

  // 加總有日期的資料列小計（col9）
  let total = 0;
  let count = 0;
  const dateRe = /^\d{3}\.\d{2}\.\d{2}/;
  for (const r of rows.slice(4)) {
    const dateCell = String(r[0] ?? "").trim();
    if (!dateRe.test(dateCell)) continue;
    const amt = parseFloat(String(r[9] ?? "0").replace(/,/g, "")) || 0;
    if (amt) { total += amt; count++; }
  }

  // 對帳單為最終付款憑證 → 覆蓋該司機的現有金額（冪等）
  if (!data._slip_imported) data._slip_imported = {};
  // 清除該司機原有所有費用項目，以對帳單為準
  data.driver_costs[drvName] = { 對帳單: total };
  data._slip_imported[drvName] = total;

  return {
    format: "外車運費對帳單",
    rows_scanned: count,
    stats: { income: 0, driver: count, expense: 0, skipped: 0 },
    extra: { driver: drvName, total },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 格式 8：運費請款單（富詠向客戶收費的月結發票）
//   — Row0: 富詠運輸有限公司
//   — Row1: YYYY年MM月 運費請款單
//   — Row2: 客戶 :XXX（收費對象）
//   — 金額欄：找 "XX月貨款" 列 col1 或 "本月總計" 列的括號數字
//   — 疊加覆蓋：以請款單為準更新 transport_income（冪等）
// ═══════════════════════════════════════════════════════════════════════════════
function parseFreightInvoiceFormat(
  wb: XLSX.WorkBook,
  data: any,
  customers: string[],
  rocYear: number,
  month: number,
): { format: string; rows_scanned: number; stats: any; extra?: any } | null {
  const sheetName = wb.SheetNames[0];
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });

  const r0 = String(rows[0]?.[0] ?? "");
  const r1 = String(rows[1]?.[0] ?? "");
  const r2 = String(rows[2]?.[0] ?? "");
  if (!r0.includes("富詠") || !r1.includes("運費請款單") || !r2.includes("客戶")) return null;

  // 確認月份
  const ym = r1.match(/(\d{4})年(\d{1,2})月/);
  if (!ym) return null;
  const slipYear = parseInt(ym[1]) - 1911, slipMonth = parseInt(ym[2]);
  if (slipYear !== rocYear || slipMonth !== month) return null;

  // 解析客戶名稱 → 標準化
  const custRaw = r2.replace(/^客戶\s*[:：]\s*/, "").split(/\s+/)[0].trim();
  // 嘗試對應到已知客戶（移除「股份有限公司」等後綴）
  const custKey = customers.find(c => custRaw.includes(c) || c.includes(custRaw))
    ?? custRaw.replace(/股份有限公司|有限公司|公司/g, "").trim();

  // 找「月貨款」總金額（row[0] 含 "月貨款"，金額在 row[1]）
  let invoiceTotal = 0;
  for (const r of rows) {
    const label = String(r[0] ?? "");
    if (/\d月貨款/.test(label) || label.includes("本月貨款")) {
      const v = parseFloat(String(r[1] ?? "").replace(/,/g, "")) || 0;
      if (v > 0) { invoiceTotal = v; break; }
    }
  }
  // fallback：找「本月總計」括號內數字
  if (!invoiceTotal) {
    for (const r of rows) {
      const cell = String(r[7] ?? "");
      const m = cell.match(/本月總計.*?\(([0-9,]+)\)/);
      if (m) { invoiceTotal = parseFloat(m[1].replace(/,/g, "")) || 0; break; }
    }
  }
  if (!invoiceTotal) return null;

  // 冪等追蹤
  if (!data._invoice_imported) data._invoice_imported = {};
  data.transport_income[custKey] = invoiceTotal;
  data._invoice_imported[custKey] = invoiceTotal;

  return {
    format: "運費請款單",
    rows_scanned: rows.length,
    stats: { income: 1, driver: 0, expense: 0, skipped: 0 },
    extra: { customer: custKey, invoiceTotal },
  };
}

// ─── 輔助：從 Google Drive 資料夾頁面抓取試算表 ID ───────────────────────────
async function fetchFolderFileIds(folderId: string): Promise<string[]> {
  const html = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  }).then(r => r.text()).catch(() => "");
  const ids = new Set<string>();
  for (const m of html.matchAll(/"([A-Za-z0-9_-]{25,})"(?:[^}]*?"mimeType":"application\/vnd\.google-apps\.spreadsheet")?/g)) {
    const candidate = m[1];
    if (candidate.length >= 25 && candidate !== folderId) ids.add(candidate);
  }
  // 補撈 /file/d/ 格式
  for (const m of html.matchAll(/\/spreadsheets\/d\/([A-Za-z0-9_-]{25,})/g)) ids.add(m[1]);
  return Array.from(ids);
}

// ─── POST /monthly-pnl/:id/import-gsheet — 從 Google 試算表匯入 ──────────────
monthlyPnlRouter.post("/:id/import-gsheet", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { url, filter_month } = req.body as { url: string; filter_month?: string };

    if (!url) return res.status(400).json({ error: "請提供 Google 試算表網址" });

    const sheetId = extractGSheetId(url);
    if (!sheetId) return res.status(400).json({ error: "無法解析 Google 試算表 ID，請確認網址格式" });

    // ── 從 DB 取得月報 ──────────────────────────────────────────────────────
    const rpt = await db.execute(sql`SELECT data, roc_year, month FROM monthly_pnl_reports WHERE id = ${id}`);
    if (!rpt.rows.length) return res.status(404).json({ error: "月報不存在" });

    const reportRow  = rpt.rows[0] as any;
    const data: any  = JSON.parse(JSON.stringify(reportRow.data));
    const customers: string[] = data.customers ?? DEFAULT_CUSTOMERS;
    const drivers:   string[] = data.drivers   ?? DEFAULT_DRIVERS;
    const rocYear   = reportRow.roc_year as number;
    const month     = reportRow.month    as number;
    const targetMonth = filter_month ?? `${rocYear}.${month}`;

    // ── 下載 Google 試算表 ──────────────────────────────────────────────────
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const resp = await fetch(exportUrl, { redirect: "follow" });
    if (!resp.ok) {
      return res.status(400).json({
        error: `無法下載試算表（HTTP ${resp.status}），請確認試算表已設為「任何人可檢視」`,
      });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const wb  = XLSX.read(buf, { type: "buffer" });

    // ── 自動偵測格式並解析 ─────────────────────────────────────────────────
    // 格式2：含「運費淨利明細表」工作表（逐筆訂單 + 應付帳款）
    // 格式3：含「進項發票」或「銷項發票」工作表（稅務發票明細）
    // 格式4：含「零用金」工作表（零用金收支表，疊加模式）
    // 格式1：其他（收支明細帳，月份+類別欄）
    const isDetailedFmt   = wb.SheetNames.some(n => n.includes("運費淨利明細表"));
    const isInvoiceFmt    = wb.SheetNames.some(n => n.includes("進項發票") || n.includes("銷項發票"));
    const isPettyCashFmt  = wb.SheetNames.some(n => n.includes("零用金"));
    // 格式5：工作表名稱形如 "115.3月" 且第4列有「帳款月份」欄位
    const isSingleMonthFmt = !isDetailedFmt && !isInvoiceFmt && !isPettyCashFmt &&
      wb.SheetNames.some(n => /^\d{3}\.\d+月/.test(n.trim())) &&
      (() => {
        const sn = wb.SheetNames.find(n => /\d+月/.test(n)) ?? wb.SheetNames[0];
        const hdr: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" })[2] ?? [];
        return hdr.some((h: any) => String(h).includes("帳款月份"));
      })();
    // 格式6：油卡消費明細（含「前台登入之虛擬帳號」+「車牌號碼」欄）
    const isFuelCardFmt = !isDetailedFmt && !isInvoiceFmt && !isPettyCashFmt && !isSingleMonthFmt &&
      (() => {
        const hdr: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" })[0] ?? [];
        return hdr.some((h: any) => String(h).includes("虛擬帳號") || String(h).includes("車牌號碼"));
      })();
    let result: { format: string; rows_scanned: number; stats: any; extra?: any };

    if (isDetailedFmt) {
      result = parseDetailedFormat(wb, data, customers, drivers, rocYear, month);
    } else if (isInvoiceFmt) {
      // 格式3 只更新收入與費用，不覆蓋司機成本（需另用格式1或2匯入）
      result = parseInvoiceFormat(wb, data, customers, rocYear, month);
    } else if (isPettyCashFmt) {
      // 格式4 疊加至現有費用（可在格式2/3之後匯入，記帳仍冪等）
      result = parsePettyCashFormat(wb, data, rocYear, month);
    } else if (isSingleMonthFmt) {
      // 格式5：單月逐筆訂單，同時推導收入 + 司機外包費（按客戶拆分）
      result = parseSingleMonthDetailFormat(wb, data, customers, drivers, month);
    } else if (isFuelCardFmt) {
      // 格式6：油卡消費明細，疊加 fuel 費用（冪等）
      result = parseFuelCardFormat(wb, data, rocYear, month);
    } else {
      // 嘗試格式8：運費請款單（向客戶收費）
      const invoiceResult = parseFreightInvoiceFormat(wb, data, customers, rocYear, month);
      if (invoiceResult) {
        result = invoiceResult;
      } else {
        // 嘗試格式7：外車運費對帳單（司機付款）
        const slipResult = parseDriverSlipFormat(wb, data, drivers, rocYear, month);
        if (slipResult) {
          result = slipResult;
        } else {
          result = parseCashflowFormat(wb, data, customers, drivers, targetMonth);
        }
      }
    }

    // ── 寫回 DB ──────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE monthly_pnl_reports
      SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      WHERE id = ${id}
    `);

    const s = result.stats;
    const filled = (s.income ?? 0) + (s.driver ?? 0) + (s.expense ?? 0) + (s.fine ?? 0);
    const importResult: any = {
      ok:           true,
      format:       result.format,
      target_month: targetMonth,
      rows_scanned: result.rows_scanned,
      filled,
      breakdown: {
        運費收入: s.income ?? 0,
        司機運費: s.driver ?? 0,
        費用:    (s.expense ?? 0) + (s.fine ?? 0),
        忽略:    s.skipped ?? 0,
      },
    };
    if (result.extra) importResult.detail = result.extra;
    res.json(importResult);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /monthly-pnl/:id/import-gfolder — 從 Google Drive 資料夾批次匯入 ──
monthlyPnlRouter.post("/:id/import-gfolder", async (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: "請提供 Google Drive 資料夾網址" });

    // 解析資料夾 ID
    const folderMatch = url.match(/\/folders\/([A-Za-z0-9_-]{15,})/);
    if (!folderMatch) return res.status(400).json({ error: "無法解析資料夾 ID" });
    const folderId = folderMatch[1];

    // 取得月報
    const rpt = await db.execute(sql`SELECT data, roc_year, month FROM monthly_pnl_reports WHERE id = ${id}`);
    if (!rpt.rows.length) return res.status(404).json({ error: "月報不存在" });
    const reportRow = rpt.rows[0] as any;
    const data: any = JSON.parse(JSON.stringify(reportRow.data));
    const customers: string[] = data.customers ?? DEFAULT_CUSTOMERS;
    const drivers:   string[] = data.drivers   ?? DEFAULT_DRIVERS;
    const rocYear = reportRow.roc_year as number;
    const month   = reportRow.month    as number;

    // 抓資料夾檔案清單
    const fileIds = await fetchFolderFileIds(folderId);
    const results: any[] = [];
    let errors: string[] = [];

    for (const fileId of fileIds) {
      try {
        const exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
        const resp = await fetch(exportUrl, { redirect: "follow" });
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        // 簡單驗證是否為有效 XLSX（magic bytes 50 4B 03 04）
        if (buf[0] !== 0x50 || buf[1] !== 0x4B) continue;

        const wb = XLSX.read(buf, { type: "buffer" });

        // 嘗試各格式
        const invoiceRes = parseFreightInvoiceFormat(wb, data, customers, rocYear, month);
        if (invoiceRes) {
          results.push({ fileId: fileId.slice(0, 12) + "…", format: "運費請款單", ...invoiceRes.extra });
        } else {
          const slipResult = parseDriverSlipFormat(wb, data, drivers, rocYear, month);
          if (slipResult) {
            results.push({ fileId: fileId.slice(0, 12) + "…", format: "外車運費對帳單", ...slipResult.extra });
          } else {
            const hdr: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" })[0] ?? [];
            if (hdr.some((h: any) => String(h).includes("虛擬帳號") || String(h).includes("車牌號碼"))) {
              const fuel = parseFuelCardFormat(wb, data, rocYear, month);
              results.push({ fileId: fileId.slice(0, 12) + "…", format: fuel.format, ...fuel.extra });
            }
          }
        }
      } catch { /* 忽略無法解析的檔案 */ }
    }

    // 寫回 DB
    await db.execute(sql`
      UPDATE monthly_pnl_reports
      SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({
      ok: true,
      folder_id: folderId,
      target_month: `${rocYear}.${month}`,
      files_found: fileIds.length,
      files_imported: results.length,
      results,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
