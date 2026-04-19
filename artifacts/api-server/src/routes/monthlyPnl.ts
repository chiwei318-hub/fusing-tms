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

// ─── 富詠收支明細帳 → P&L 對照 ────────────────────────────────────────────────
const GSHEET_EXPENSE_MAP: Record<string, string> = {
  "油費儲值": "fuel",
  "水電費":   "utilities",
  "交際費":   "entertainment",
  "記帳費":   "labor",
  "電信費":   "telecom",
  "FB廣告費": "facebook_ads",
  "租金支出": "rent",
};

// 罰單：只計「公司費用」（排除代付款/代收代付）
function isFineCompanyExpense(note: string): boolean {
  const n = String(note ?? "").trim();
  return n === "" || n.toLowerCase().includes("公司費用");
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

    // 預設 filter_month 用月報的民國年月（e.g., "115.3"）
    const targetMonth = filter_month ?? `${reportRow.roc_year}.${reportRow.month}`;

    // ── 下載 Google 試算表 ──────────────────────────────────────────────────
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const resp = await fetch(exportUrl, { redirect: "follow" });
    if (!resp.ok) {
      return res.status(400).json({ error: `無法下載試算表（HTTP ${resp.status}），請確認試算表已設為「任何人可檢視」` });
    }
    const buf = Buffer.from(await resp.arrayBuffer());

    // ── 解析 XLSX ──────────────────────────────────────────────────────────
    const wb   = XLSX.read(buf, { type: "buffer" });
    const wsn  = wb.SheetNames[0];
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wsn], { header: 1, defval: "" });

    // 過濾目標月份（月份欄支援數字或字串格式）
    const matchMonth = (v: any) => {
      const s = String(v).trim();
      // 115.3 或 115.03 或純數字 115.3
      const [yr, mo] = targetMonth.split(".");
      const moNum    = parseInt(mo);
      return s === targetMonth || s === `${yr}.${String(moNum).padStart(2,"0")}` ||
             parseFloat(s) === parseFloat(targetMonth);
    };

    const monthRows = rows.slice(2).filter(r => matchMonth(r[1]));
    if (!monthRows.length) {
      return res.json({ ok: false, error: `找不到「${targetMonth}」月份的資料，試算表內月份列表：${[...new Set(rows.slice(2).map(r=>String(r[1]).trim()).filter(Boolean))].join(", ")}` });
    }

    // 輔助：在客戶清單裡尋找描述中包含的客戶名稱
    const findCustomer = (desc: string): string => {
      for (const c of customers) {
        if (c !== "其他" && desc.includes(c)) return c;
      }
      return "其他";
    };

    // 輔助：在司機清單裡尋找描述中包含的司機名稱（忽略括號內別名）
    const driverAliases = Object.fromEntries(
      drivers.map(d => [d.replace(/\(.*?\)/g, "").trim(), d])
    );
    const findDriver = (desc: string): string => {
      for (const [alias, full] of Object.entries(driverAliases)) {
        if (desc.includes(alias)) return full;
      }
      // 沒在清單裡的外包，直接用描述裡「支付」後到「月」前的文字
      const m = desc.match(/^支付(.+?)(?:\d+月|運費|$)/);
      return m ? m[1].trim() : desc.replace(/^支付/, "").trim();
    };

    const stats = { income: 0, driver: 0, expense: 0, fine: 0, skipped: 0 };

    // 先歸零各項目（避免疊加到舊資料）
    for (const c of customers) data.transport_income[c] = 0;
    for (const k of Object.keys(data.expenses ?? {})) data.expenses[k] = 0;
    data.parking_income = 0;
    data.misc_income    = 0;
    for (const d of drivers) {
      for (const c of customers) {
        if (data.driver_costs[d]) data.driver_costs[d][c] = 0;
      }
    }

    for (const r of monthRows) {
      const cat  = String(r[2] ?? "").trim();
      const desc = String(r[4] ?? "").trim();
      const inc  = parseFloat(String(r[5] ?? "0").replace(/,/g, "")) || 0;
      const exp  = parseFloat(String(r[6] ?? "0").replace(/,/g, "")) || 0;
      const note = String(r[8] ?? "").trim();

      if (cat === "運費收入" && inc > 0) {
        const cust = findCustomer(desc);
        data.transport_income[cust] = (data.transport_income[cust] ?? 0) + inc;
        stats.income++;

      } else if (cat === "支付外包" && exp > 0) {
        const drv = findDriver(desc);
        if (!data.driver_costs[drv]) data.driver_costs[drv] = {};
        // 總額填入「其他」欄（無法從明細帳拆分到客戶）
        data.driver_costs[drv]["其他"] = (data.driver_costs[drv]["其他"] ?? 0) + exp;
        // 若不在預設司機清單，加入 drivers
        if (!data.drivers.includes(drv)) data.drivers.push(drv);
        stats.driver++;

      } else if (GSHEET_EXPENSE_MAP[cat] && exp > 0) {
        const key = GSHEET_EXPENSE_MAP[cat];
        data.expenses[key] = (data.expenses[key] ?? 0) + exp;
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

    const totalFilled = stats.income + stats.driver + stats.expense + stats.fine;

    await db.execute(sql`
      UPDATE monthly_pnl_reports
      SET data = ${JSON.stringify(data)}::jsonb, updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({
      ok:          true,
      target_month: targetMonth,
      rows_scanned: monthRows.length,
      filled:      totalFilled,
      breakdown: {
        運費收入:  stats.income,
        司機運費:  stats.driver,
        費用:     stats.expense,
        罰單:     stats.fine,
        忽略:     stats.skipped,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
