import { Router } from "express";
import { google } from "googleapis";
import { pool } from "@workspace/db";

export const sheetsExportRouter = Router();

// ── 格式化金額 ────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined): string {
  if (v == null) return "0";
  return Number(v).toFixed(0);
}

// ── 取得財務備份資料 ──────────────────────────────────────────────────────────
async function fetchBillingRows(from?: string, to?: string) {
  const params: string[] = [];
  const conditions: string[] = ["status IN ('delivered','completed')"];

  if (from) { params.push(from); conditions.push(`DATE(created_at) >= $${params.length}`); }
  if (to)   { params.push(to);   conditions.push(`DATE(created_at) <= $${params.length}`); }

  const sql = `
    SELECT
      id,
      COALESCE(order_no, id::text)          AS order_no,
      DATE(created_at AT TIME ZONE 'Asia/Taipei') AS trip_date,
      COALESCE(customer_name, '')           AS customer_name,
      COALESCE(total_fee, 0)                AS client_bill,
      COALESCE(driver_pay, 0)               AS driver_payout,
      COALESCE(profit_amount, total_fee - COALESCE(driver_pay,0), 0) AS profit,
      COALESCE(vehicle_type, '')            AS vehicle_type,
      COALESCE(status, '')                  AS status
    FROM orders
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 2000
  `;
  const { rows } = await pool.query(sql, params);
  return rows as {
    id: number; order_no: string; trip_date: string;
    customer_name: string; client_bill: number; driver_payout: number;
    profit: number; vehicle_type: string; status: string;
  }[];
}

// ── 取得 Google Sheets 服務 ──────────────────────────────────────────────────
function getSheetsService() {
  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!raw) throw new Error("未設定 GOOGLE_SHEETS_CREDENTIALS 環境變數（貼入 service account JSON 字串）");
  let creds: object;
  try { creds = JSON.parse(raw); } catch { throw new Error("GOOGLE_SHEETS_CREDENTIALS 格式錯誤，需為合法 JSON"); }
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  return google.sheets({ version: "v4", auth });
}

// ── 確認工作表標題列存在 ─────────────────────────────────────────────────────
const HEADERS = ["日期", "訂單號", "客戶名稱", "客戶應付(元)", "司機應得(元)", "平台利潤(元)", "車型", "狀態", "匯出時間"];

async function ensureHeader(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, sheetTitle: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const sheetList = meta.data.sheets ?? [];

  let sheetId: number | null = null;
  for (const s of sheetList) {
    if (s.properties?.title === sheetTitle) { sheetId = s.properties.sheetId!; break; }
  }

  if (sheetId === null) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
    });
    sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  }

  const firstRow = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetTitle}!A1:I1` });
  const existing = firstRow.data.values?.[0];
  if (!existing || existing.length < HEADERS.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
    // 加粗標題列
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
            cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.2, green: 0.44, blue: 0.78 }, horizontalAlignment: "CENTER" } },
            fields: "userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)",
          },
        }],
      },
    });
  }
}

// ── GET /api/sheets-export/preview ───────────────────────────────────────────
// 預覽要匯出的資料（不寫入 Sheets）
sheetsExportRouter.get("/sheets-export/preview", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const rows = await fetchBillingRows(from, to);
    const totalClientBill = rows.reduce((s, r) => s + Number(r.client_bill), 0);
    const totalDriverPay  = rows.reduce((s, r) => s + Number(r.driver_payout), 0);
    const totalProfit     = rows.reduce((s, r) => s + Number(r.profit), 0);
    res.json({
      ok: true,
      count: rows.length,
      summary: { totalClientBill, totalDriverPay, totalProfit },
      rows: rows.slice(0, 20),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/sheets-export/backup ───────────────────────────────────────────
// 匯出到 Google Sheets
sheetsExportRouter.post("/sheets-export/backup", async (req, res) => {
  try {
    const { from, to, sheetId, sheetTitle = "財務備份" } = req.body as {
      from?: string; to?: string; sheetId?: string; sheetTitle?: string;
    };

    const spreadsheetId = sheetId || process.env.GOOGLE_BACKUP_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(400).json({ ok: false, error: "請提供 Google Spreadsheet ID（或設定 GOOGLE_BACKUP_SHEET_ID 環境變數）" });
    }

    const rows = await fetchBillingRows(from, to);
    if (rows.length === 0) {
      return res.json({ ok: true, inserted: 0, message: "此日期區間無符合條件的訂單" });
    }

    const sheets = getSheetsService();
    await ensureHeader(sheets, spreadsheetId, sheetTitle);

    const exportTime = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
    const values = rows.map(r => [
      String(r.trip_date),
      r.order_no,
      r.customer_name,
      fmt(r.client_bill),
      fmt(r.driver_payout),
      fmt(r.profit),
      r.vehicle_type,
      r.status,
      exportTime,
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A2`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    console.log(`[SheetsExport] 匯出 ${rows.length} 筆財務資料 → Sheet: ${sheetTitle}`);
    res.json({ ok: true, inserted: rows.length, sheetTitle, spreadsheetId });
  } catch (err: any) {
    console.error("[SheetsExport] error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/sheets-export/config-status ─────────────────────────────────────
// 確認 env 是否已設定（不洩漏實際內容）
sheetsExportRouter.get("/sheets-export/config-status", (_req, res) => {
  const hasCreds  = !!process.env.GOOGLE_SHEETS_CREDENTIALS;
  const hasSheetId = !!process.env.GOOGLE_BACKUP_SHEET_ID;
  res.json({
    ok: true,
    hasCredentials: hasCreds,
    hasDefaultSheetId: hasSheetId,
    defaultSheetId: hasSheetId ? process.env.GOOGLE_BACKUP_SHEET_ID : null,
  });
});
