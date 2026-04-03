/**
 * shopeeBillingImport.ts — 蝦皮月結對帳 Excel 匯入
 *
 * POST /api/shopee/billing-import   → 解析 Excel，preview or save
 * GET  /api/shopee/settlements       → 已匯入的對帳清單
 * GET  /api/shopee/settlements/:id   → 單筆對帳明細
 * DELETE /api/shopee/settlements/:id → 刪除
 */

import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const shopeeBillingRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── 確保資料表存在 ──────────────────────────────────────────────────────────
export async function ensureShopeeSettlementTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shopee_settlements (
      id            SERIAL PRIMARY KEY,
      period_year   INTEGER NOT NULL,
      period_month  INTEGER NOT NULL,
      fleet_name    TEXT,
      sheet_source  TEXT,
      gross_total   NUMERIC(12,2) DEFAULT 0,
      commission    NUMERIC(12,2) DEFAULT 0,
      net_total     NUMERIC(12,2) DEFAULT 0,
      tax_amount    NUMERIC(12,2) DEFAULT 0,
      billing_total NUMERIC(12,2) DEFAULT 0,
      penalty_total NUMERIC(12,2) DEFAULT 0,
      subsidy_total NUMERIC(12,2) DEFAULT 0,
      summary_json  JSONB,
      imported_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shopee_settlement_rows (
      id              SERIAL PRIMARY KEY,
      settlement_id   INTEGER REFERENCES shopee_settlements(id) ON DELETE CASCADE,
      row_type        TEXT NOT NULL,  -- 'store','ndd','whndd','penalty','subsidy','recruit','topup'
      fleet_name      TEXT,
      warehouse       TEXT,
      area            TEXT,
      route_no        TEXT,
      truck_size      TEXT,
      driver_id       TEXT,
      total_trips     INTEGER DEFAULT 0,
      total_amount    NUMERIC(12,2) DEFAULT 0,
      daily_data      JSONB,   -- { "2026-01-01": 2810, ... }
      penalty_date    DATE,
      penalty_reason  TEXT,
      shop_name       TEXT,
      deduct_month    TEXT,
      note            TEXT,
      created_at      TIMESTAMP DEFAULT NOW()
    )
  `);
}

// ── Helper: parse date value from ExcelJS cell ─────────────────────────────
function cellDate(v: ExcelJS.CellValue): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}/)) return v.substring(0, 10);
  return null;
}

function cellNum(v: ExcelJS.CellValue): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(/,/g, "")) || 0;
  if (v && typeof v === "object" && "result" in v) return Number((v as any).result) || 0;
  return 0;
}

function cellStr(v: ExcelJS.CellValue): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    if ("text" in v) return String((v as any).text).trim();
    if ("richText" in v) {
      return ((v as any).richText as Array<{ text: string }>)
        .map((rt) => rt.text)
        .join("")
        .trim();
    }
    if ("result" in v) return String((v as any).result).trim();
    if ("formula" in v && "result" in v) return String((v as any).result ?? "").trim();
  }
  return String(v).trim();
}

// ── 解析路線矩陣工作表（店配車 / NDD / WHNDD）─────────────────────────────
interface RouteRow {
  fleet: string;
  warehouse: string;
  area: string;
  route_no: string;
  truck_size: string;
  driver_id: string;
  total_trips: number;
  total_amount: number;
  daily: Record<string, number>;
}

function parseRouteSheet(ws: ExcelJS.Worksheet, type: string): RouteRow[] {
  const rows: RouteRow[] = [];
  if (!ws) return rows;

  // Find header row (contains "執行車隊" or "所屬車隊")
  let headerRowNum = -1;
  let dateStartCol = 7;
  const dateCols: Record<number, string> = {};

  ws.eachRow((row, rowNum) => {
    const c1 = cellStr(row.getCell(1).value);
    if (c1 === "執行車隊" || c1 === "所屬車隊" || c1 === "車隊名稱") {
      headerRowNum = rowNum;
      // Map date columns
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col >= 7) {
          const d = cellDate(cell.value);
          if (d) dateCols[col] = d;
        }
      });
    }
  });

  if (headerRowNum < 0) return rows;

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowNum) return;
    const fleet = cellStr(row.getCell(1).value);
    if (!fleet || fleet === "執行車隊" || fleet === "所屬車隊") return;
    const warehouse  = cellStr(row.getCell(2).value);
    const area       = cellStr(row.getCell(3).value);
    const route_no   = cellStr(row.getCell(4).value);
    const truck_size = cellStr(row.getCell(5).value);
    const driver_id  = cellStr(row.getCell(6).value).replace(/,/g, "");

    const daily: Record<string, number> = {};
    let total_amount = 0;
    let total_trips  = 0;

    Object.entries(dateCols).forEach(([colStr, date]) => {
      const col = Number(colStr);
      const amt = cellNum(row.getCell(col).value);
      if (amt > 0) {
        daily[date] = amt;
        total_amount += amt;
        total_trips++;
      }
    });

    rows.push({ fleet, warehouse, area, route_no, truck_size, driver_id, total_trips, total_amount, daily });
  });

  return rows;
}

// ── 解析罰款工作表 ─────────────────────────────────────────────────────────
interface PenaltyRow {
  date: string;
  soc: string;
  shop_name: string;
  reason: string;
  fleet: string;
  driver_id: string;
  amount: number;
  penalty_month: string;
  deduct_month: string;
  note: string;
}

function parsePenaltySheet(ws: ExcelJS.Worksheet): PenaltyRow[] {
  const rows: PenaltyRow[] = [];
  if (!ws) return rows;

  // Header row 2, data from row 3
  ws.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const v1 = row.getCell(1).value;
    if (!v1) return;
    const d = cellDate(v1);
    if (!d) return;
    rows.push({
      date:          d,
      soc:           cellStr(row.getCell(2).value),
      shop_name:     cellStr(row.getCell(3).value),
      reason:        cellStr(row.getCell(4).value),
      fleet:         cellStr(row.getCell(5).value),
      driver_id:     cellStr(row.getCell(6).value),
      amount:        cellNum(row.getCell(7).value),
      penalty_month: cellStr(row.getCell(8).value),
      deduct_month:  cellStr(row.getCell(9).value),
      note:          cellStr(row.getCell(10).value),
    });
  });

  return rows;
}

// ── 解析補助工作表（交通罰單補助）─────────────────────────────────────────
interface SubsidyRow {
  date: string;
  fleet: string;
  business_date: string;
  shop_name: string;
  location: string;
  reason: string;
  amount: number;
  plate: string;
}

function parseSubsidySheet(ws: ExcelJS.Worksheet): SubsidyRow[] {
  const rows: SubsidyRow[] = [];
  if (!ws) return rows;

  ws.eachRow((row, rowNum) => {
    if (rowNum < 2) return;
    const v1 = row.getCell(1).value;
    if (!v1) return;
    const d = cellDate(v1);
    if (!d) return;
    rows.push({
      date:          d,
      fleet:         cellStr(row.getCell(2).value),
      business_date: cellDate(row.getCell(3).value) ?? "",
      shop_name:     cellStr(row.getCell(4).value),
      location:      cellStr(row.getCell(5).value),
      reason:        cellStr(row.getCell(6).value),
      amount:        cellNum(row.getCell(7).value),
      plate:         cellStr(row.getCell(8).value),
    });
  });

  return rows;
}

// ── 解析請款總表取得主要金額 ───────────────────────────────────────────────
interface SummaryInfo {
  fleet_name: string;
  period_start: string;
  period_end: string;
  tax_free_total: number;
  tax_amount: number;
  billing_total: number;
  commission_rate: number;
  items: Array<{ name: string; gross: number; commission: number; net: number }>;
}

function parseSummarySheet(ws: ExcelJS.Worksheet): SummaryInfo {
  const info: SummaryInfo = {
    fleet_name: "", period_start: "", period_end: "",
    tax_free_total: 0, tax_amount: 0, billing_total: 0,
    commission_rate: 0.07, items: [],
  };
  if (!ws) return info;

  // Row 1: fleet name, Row 6: period, Row 7: 未稅金額, Row 9: 請款金額
  info.fleet_name    = cellStr(ws.getRow(1).getCell(6).value) || cellStr(ws.getRow(1).getCell(1).value);
  info.period_start  = cellDate(ws.getRow(6).getCell(7).value) ?? "";
  info.period_end    = cellDate(ws.getRow(6).getCell(9).value) ?? "";
  info.tax_free_total = cellNum(ws.getRow(7).getCell(7).value);
  info.tax_amount     = cellNum(ws.getRow(8).getCell(7).value);
  info.billing_total  = cellNum(ws.getRow(9).getCell(7).value);

  // Row 12-17: line items (項目 | 趟次總金額 | 福星高 | 實際金額)
  const itemNames = ["店配車", "NDD", "WHNDD", "上收", "招募獎金", "交通罰單補助"];
  for (let r = 12; r <= 20; r++) {
    const row   = ws.getRow(r);
    const name  = cellStr(row.getCell(6).value) || cellStr(row.getCell(1).value);
    const gross = cellNum(row.getCell(7).value) || cellNum(row.getCell(2).value);
    const comm  = cellNum(row.getCell(8).value) || cellNum(row.getCell(3).value);
    const net   = cellNum(row.getCell(9).value) || cellNum(row.getCell(4).value);
    if (name && itemNames.includes(name)) {
      info.items.push({ name, gross, commission: comm, net });
    }
  }

  return info;
}

// ── POST /api/shopee/billing-import ───────────────────────────────────────
shopeeBillingRouter.post(
  "/shopee/billing-import",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "請上傳 Excel 檔案" });

      const { action = "preview" } = req.body as { action?: string };

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);

      const sheetNames = wb.worksheets.map((w) => w.name);

      // Pick best version of each sheet (prefer "03." prefix, fallback to plain)
      const getSheet = (name: string) =>
        wb.getWorksheet(`03.${name}`) ??
        wb.getWorksheet(`02.${name}`) ??
        wb.getWorksheet(name);

      const storeRows   = parseRouteSheet(getSheet("店配車")!,  "store");
      const nddRows     = parseRouteSheet(getSheet("NDD")!,     "ndd");
      const whnddRows   = parseRouteSheet(getSheet("WHNDD")!,   "whndd");
      const penaltyRows = parsePenaltySheet(
        wb.getWorksheet("03.(-)作業運輸罰款") ??
        wb.getWorksheet("(-)作業運輸罰款") ??
        wb.getWorksheet("02.(-)作業運輸罰款")!
      );
      const subsidyRows = parseSubsidySheet(
        wb.getWorksheet("03.(+)交通罰單補助") ??
        wb.getWorksheet("(+)交通罰單補助")!
      );
      const summaryInfo = parseSummarySheet(
        wb.getWorksheet("01.請款總表") ??
        wb.getWorksheet("02.請款總表")!
      );

      // Derive period from data
      let periodYear = 0, periodMonth = 0;
      if (summaryInfo.period_start) {
        const [y, m] = summaryInfo.period_start.split("-").map(Number);
        periodYear = y; periodMonth = m;
      } else {
        // fallback from route daily data
        const allDates = [...storeRows, ...nddRows, ...whnddRows]
          .flatMap((r) => Object.keys(r.daily))
          .sort();
        if (allDates.length > 0) {
          const [y, m] = allDates[0].split("-").map(Number);
          periodYear = y; periodMonth = m;
        }
      }

      // Per-driver summary
      const driverMap: Record<string, {
        driver_id: string; routes: number; trips: number; amount: number; types: string[];
      }> = {};
      const addDriver = (rows: RouteRow[], type: string) => {
        for (const r of rows) {
          if (!r.driver_id) continue;
          if (!driverMap[r.driver_id]) driverMap[r.driver_id] = { driver_id: r.driver_id, routes: 0, trips: 0, amount: 0, types: [] };
          driverMap[r.driver_id].routes++;
          driverMap[r.driver_id].trips  += r.total_trips;
          driverMap[r.driver_id].amount += r.total_amount;
          if (!driverMap[r.driver_id].types.includes(type)) driverMap[r.driver_id].types.push(type);
        }
      };
      addDriver(storeRows,  "店配車");
      addDriver(nddRows,    "NDD");
      addDriver(whnddRows,  "WHNDD");

      const driverList = Object.values(driverMap).sort((a, b) => b.amount - a.amount);

      const penaltyTotal = penaltyRows.reduce((s, r) => s + r.amount, 0);
      const subsidyTotal = subsidyRows.reduce((s, r) => s + r.amount, 0);
      const grossTotal   = [...storeRows, ...nddRows, ...whnddRows].reduce((s, r) => s + r.total_amount, 0);

      const preview = {
        sheetNames,
        period: { year: periodYear, month: periodMonth },
        summary: summaryInfo,
        grossTotal,
        penaltyTotal,
        subsidyTotal,
        driverCount: driverList.length,
        totalTrips:  driverList.reduce((s, d) => s + d.trips, 0),
        drivers: driverList,
        storeRouteCount:  storeRows.length,
        nddRouteCount:    nddRows.length,
        whnddRouteCount:  whnddRows.length,
        penaltyCount:     penaltyRows.length,
        subsidyCount:     subsidyRows.length,
        penalties:  penaltyRows,
        subsidies:  subsidyRows,
        storeRows,
        nddRows,
        whnddRows,
      };

      if (action === "preview") {
        return res.json({ ok: true, preview });
      }

      // ── SAVE to DB ──
      const insResult = await db.execute(sql`
        INSERT INTO shopee_settlements
          (period_year, period_month, fleet_name, sheet_source, gross_total, commission,
           net_total, tax_amount, billing_total, penalty_total, subsidy_total, summary_json)
        VALUES (
          ${periodYear}, ${periodMonth},
          ${summaryInfo.fleet_name || "富詠運輸有限公司"},
          ${sheetNames.join(", ")},
          ${grossTotal},
          ${summaryInfo.items.reduce((s, i) => s + i.commission, 0)},
          ${summaryInfo.tax_free_total || grossTotal},
          ${summaryInfo.tax_amount},
          ${summaryInfo.billing_total || grossTotal},
          ${penaltyTotal},
          ${subsidyTotal},
          ${JSON.stringify({ summary: summaryInfo, drivers: driverList })}::jsonb
        )
        RETURNING id
      `);
      const settlementId = (insResult.rows[0] as any).id;

      // Insert route rows
      const insertRouteRows = async (rows: RouteRow[], type: string) => {
        for (const r of rows) {
          await db.execute(sql`
            INSERT INTO shopee_settlement_rows
              (settlement_id, row_type, fleet_name, warehouse, area, route_no,
               truck_size, driver_id, total_trips, total_amount, daily_data)
            VALUES (
              ${settlementId}, ${type},
              ${r.fleet}, ${r.warehouse}, ${r.area}, ${r.route_no},
              ${r.truck_size}, ${r.driver_id}, ${r.total_trips}, ${r.total_amount},
              ${JSON.stringify(r.daily)}::jsonb
            )
          `);
        }
      };

      await insertRouteRows(storeRows,  "store");
      await insertRouteRows(nddRows,    "ndd");
      await insertRouteRows(whnddRows,  "whndd");

      for (const p of penaltyRows) {
        await db.execute(sql`
          INSERT INTO shopee_settlement_rows
            (settlement_id, row_type, driver_id, fleet_name, shop_name,
             penalty_date, penalty_reason, total_amount, deduct_month, note)
          VALUES (
            ${settlementId}, 'penalty',
            ${p.driver_id}, ${p.fleet}, ${p.shop_name},
            ${p.date}::date, ${p.reason}, ${p.amount},
            ${p.deduct_month}, ${p.note}
          )
        `);
      }

      for (const s of subsidyRows) {
        await db.execute(sql`
          INSERT INTO shopee_settlement_rows
            (settlement_id, row_type, fleet_name, shop_name,
             penalty_date, penalty_reason, total_amount, note)
          VALUES (
            ${settlementId}, 'subsidy',
            ${s.fleet}, ${s.shop_name},
            ${s.business_date || s.date}::date, ${s.reason}, ${s.amount}, ${s.plate}
          )
        `);
      }

      res.json({ ok: true, settlementId, preview });
    } catch (err: any) {
      console.error("[shopee-billing-import]", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── GET /api/shopee/settlements ───────────────────────────────────────────
shopeeBillingRouter.get("/shopee/settlements", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, period_year, period_month, fleet_name,
             gross_total, commission, net_total, billing_total,
             penalty_total, subsidy_total, imported_at
      FROM shopee_settlements
      ORDER BY period_year DESC, period_month DESC, imported_at DESC
    `);
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/shopee/settlements/:id ─────────────────────────────────────
shopeeBillingRouter.get("/shopee/settlements/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const settlement = await db.execute(sql`SELECT * FROM shopee_settlements WHERE id = ${id}`);
    if (!settlement.rows.length) return res.status(404).json({ error: "找不到" });

    const rows = await db.execute(sql`
      SELECT * FROM shopee_settlement_rows WHERE settlement_id = ${id} ORDER BY id
    `);

    res.json({ ...settlement.rows[0], rows: rows.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/shopee/settlements/:id ───────────────────────────────────
shopeeBillingRouter.delete("/shopee/settlements/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM shopee_settlements WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
