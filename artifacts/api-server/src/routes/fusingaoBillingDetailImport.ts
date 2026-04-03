/**
 * 富詠-2026年_每月對帳明細 Excel Import
 * Parses monthly billing details from 富詠 to 福興高:
 *  - 店配車/NDD/WHNDD trip records (per route, per driver, per date)
 *  - 作業運輸罰款 (operational penalties)
 *  - 交通罰單補助 (traffic ticket subsidies)
 *  - 請款總表 (billing summary)
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import * as ExcelJS from "exceljs";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const fusingaoBillingDetailRouter = Router();

// ── Table setup ────────────────────────────────────────────────────────────────
export async function ensureBillingDetailTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_billing_trips (
      id             SERIAL PRIMARY KEY,
      billing_month  TEXT NOT NULL,
      billing_type   TEXT NOT NULL,
      fleet_name     TEXT,
      warehouse      TEXT,
      area           TEXT,
      route_no       TEXT NOT NULL,
      vehicle_size   TEXT,
      driver_id      TEXT,
      trip_date      DATE NOT NULL,
      amount         NUMERIC,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_billing_penalties (
      id               SERIAL PRIMARY KEY,
      billing_month    TEXT NOT NULL,
      incident_date    DATE,
      soc              TEXT,
      store_name       TEXT,
      violation_type   TEXT,
      fleet_name       TEXT,
      driver_id        TEXT,
      amount           NUMERIC,
      penalty_month    TEXT,
      deduction_month  TEXT,
      notes            TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_billing_subsidies (
      id               SERIAL PRIMARY KEY,
      billing_month    TEXT NOT NULL,
      application_date DATE,
      company_name     TEXT,
      incident_date    DATE,
      store_name       TEXT,
      store_address    TEXT,
      violation        TEXT,
      amount           NUMERIC,
      license_plate    TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS fusingao_billing_summary (
      id               SERIAL PRIMARY KEY,
      billing_month    TEXT NOT NULL UNIQUE,
      company_name     TEXT,
      billing_period_start DATE,
      billing_period_end   DATE,
      commission_rate  NUMERIC,
      split_note       TEXT,
      pretax_total     NUMERIC,
      tax_amount       NUMERIC,
      invoice_total    NUMERIC,
      store_delivery_total NUMERIC,
      ndd_total        NUMERIC,
      whndd_total      NUMERIC,
      penalty_total    NUMERIC,
      subsidy_total    NUMERIC,
      invoice_title    TEXT,
      invoice_tax_id   TEXT,
      invoice_address  TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_trips_month ON fusingao_billing_trips(billing_month)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_billing_penalties_month ON fusingao_billing_penalties(billing_month)`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ((v as any).text) return String((v as any).text);
    if ((v as any).richText) return (v as any).richText.map((r: any) => r.text).join("");
    if (v instanceof Date) return v.toISOString().substring(0, 10);
    if ((v as any).formula !== undefined) {
      const result = (v as any).result;
      if (result === null || result === undefined) return "";
      if (result instanceof Date) return result.toISOString().substring(0, 10);
      return String(result);
    }
  }
  return String(v);
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && (v as any).formula !== undefined) {
    const r = (v as any).result;
    return typeof r === "number" ? r : null;
  }
  const n = Number(String(v).replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function excelDateToISO(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === "number" && v > 40000) {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().substring(0, 10);
  }
  const s = String(v).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0, 10);
  return null;
}

interface TripRecord {
  fleet_name: string; warehouse: string; area: string;
  route_no: string; vehicle_size: string; driver_id: string;
  trip_date: string; amount: number; billing_type: string;
}

interface PenaltyRecord {
  incident_date: string | null; soc: string; store_name: string;
  violation_type: string; fleet_name: string; driver_id: string;
  amount: number; penalty_month: string; deduction_month: string; notes: string;
}

interface SubsidyRecord {
  application_date: string | null; company_name: string;
  incident_date: string | null; store_name: string; store_address: string;
  violation: string; amount: number; license_plate: string;
}

// ── Parser: 店配車/NDD/WHNDD trip sheets ─────────────────────────────────────
function parseTripSheet(ws: ExcelJS.Worksheet, billingType: string): TripRecord[] {
  const trips: TripRecord[] = [];
  let headerRowNum = -1;
  let dateColStart = 7;
  let dateCols: { col: number; date: string }[] = [];

  // Find header row (has 所屬車隊/執行車隊 in col1 and dates from col7+)
  ws.eachRow((row, rn) => {
    if (rn > 8) return;
    const c1 = cellText(row.getCell(1));
    if (c1.includes("車隊") || c1.includes("fleet") || c1.toLowerCase().includes("fleet")) {
      headerRowNum = rn;
      // Find date columns (col7 onwards)
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        if (cn >= dateColStart) {
          const dateStr = excelDateToISO(cell.value);
          if (dateStr) dateCols.push({ col: cn, date: dateStr });
        }
      });
    }
  });

  if (headerRowNum < 0 || dateCols.length === 0) return trips;

  ws.eachRow((row, rn) => {
    if (rn <= headerRowNum) return;
    const fleet = cellText(row.getCell(1));
    const warehouse = cellText(row.getCell(2));
    const area = cellText(row.getCell(3));
    const routeNo = cellText(row.getCell(4));
    const vehicleSize = cellText(row.getCell(5));
    const driverId = cellText(row.getCell(6));

    if (!fleet && !routeNo) return;
    if (fleet.includes("車隊") && !fleet.includes("富") && !fleet.includes("公司")) return; // skip header-like rows

    for (const { col, date } of dateCols) {
      const amount = cellNum(row.getCell(col));
      if (amount && amount > 0) {
        trips.push({ fleet_name: fleet, warehouse, area, route_no: routeNo, vehicle_size: vehicleSize, driver_id: driverId, trip_date: date, amount, billing_type: billingType });
      }
    }
  });

  return trips;
}

// ── Parser: 罰款 sheet ────────────────────────────────────────────────────────
function parsePenaltySheet(ws: ExcelJS.Worksheet): PenaltyRecord[] {
  const penalties: PenaltyRecord[] = [];
  let headerRowNum = -1;

  ws.eachRow((row, rn) => {
    if (rn > 5) return;
    const c1 = cellText(row.getCell(1));
    if (c1.includes("案件發生") || c1.includes("日期")) headerRowNum = rn;
  });

  if (headerRowNum < 0) return penalties;

  ws.eachRow((row, rn) => {
    if (rn <= headerRowNum) return;
    const incidentDate = excelDateToISO(row.getCell(1).value);
    const soc = cellText(row.getCell(2));
    const storeName = cellText(row.getCell(3));
    const violationType = cellText(row.getCell(4));
    const fleetName = cellText(row.getCell(5));
    const driverId = cellText(row.getCell(6));
    const amount = cellNum(row.getCell(7));
    const penaltyMonth = cellText(row.getCell(8));
    const deductionMonth = cellText(row.getCell(9));
    const notes = cellText(row.getCell(10));

    if (!soc && !storeName && !amount) return;
    if (amount && amount > 0) {
      penalties.push({ incident_date: incidentDate, soc, store_name: storeName, violation_type: violationType, fleet_name: fleetName, driver_id: driverId, amount, penalty_month: penaltyMonth, deduction_month: deductionMonth, notes });
    }
  });

  return penalties;
}

// ── Parser: 補助 sheet ────────────────────────────────────────────────────────
function parseSubsidySheet(ws: ExcelJS.Worksheet): SubsidyRecord[] {
  const subsidies: SubsidyRecord[] = [];
  let headerRowNum = 1;

  ws.eachRow((row, rn) => {
    if (rn > 3) return;
    const c1 = cellText(row.getCell(1));
    if (c1.includes("時間戳記") || c1.includes("申請")) headerRowNum = rn;
  });

  ws.eachRow((row, rn) => {
    if (rn <= headerRowNum) return;
    const appDate = excelDateToISO(row.getCell(1).value);
    const company = cellText(row.getCell(2));
    const incidentDate = excelDateToISO(row.getCell(3).value);
    const storeName = cellText(row.getCell(4));
    const storeAddr = cellText(row.getCell(5));
    const violation = cellText(row.getCell(6));
    const amount = cellNum(row.getCell(7));
    const plate = cellText(row.getCell(8));

    if (!company && !storeName) return;
    if (amount && amount > 0) {
      subsidies.push({ application_date: appDate, company_name: company, incident_date: incidentDate, store_name: storeName, store_address: storeAddr, violation, amount, license_plate: plate });
    }
  });

  return subsidies;
}

// ── Parser: 請款總表 ──────────────────────────────────────────────────────────
interface BillingSummary {
  company_name: string; billing_period_start: string | null; billing_period_end: string | null;
  commission_rate: number; split_note: string; pretax_total: number;
  tax_amount: number; invoice_total: number;
  store_delivery_total: number; ndd_total: number; whndd_total: number;
  invoice_title: string; invoice_tax_id: string; invoice_address: string;
}

function parseSummarySheet(ws: ExcelJS.Worksheet): BillingSummary {
  const r = (rn: number, cn: number) => cellText(ws.getRow(rn).getCell(cn));
  const n = (rn: number, cn: number) => cellNum(ws.getRow(rn).getCell(cn)) ?? 0;

  return {
    company_name: r(4, 2) || "富詠運輸有限公司",
    split_note: r(5, 2),
    billing_period_start: excelDateToISO(ws.getRow(6).getCell(2).value),
    billing_period_end: excelDateToISO(ws.getRow(6).getCell(4).value),
    commission_rate: 7,
    pretax_total: n(7, 2),
    tax_amount: n(8, 2),
    invoice_total: n(9, 2),
    store_delivery_total: n(12, 2),
    ndd_total: n(13, 2),
    whndd_total: n(14, 2),
    invoice_title: r(25, 2),
    invoice_tax_id: r(25, 4),
    invoice_address: "",
  };
}

export interface BillingDetailResult {
  month: string;
  trips: TripRecord[];
  penalties: PenaltyRecord[];
  subsidies: SubsidyRecord[];
  summary: BillingSummary | null;
}

export async function parseBillingDetailExcel(buffer: Buffer, targetMonth?: string): Promise<BillingDetailResult[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Group sheets by month prefix (e.g., "03." → "03")
  const monthGroups: Record<string, { trips: TripRecord[]; penalties: PenaltyRecord[]; subsidies: SubsidyRecord[]; summary: BillingSummary | null }> = {};

  const getGroup = (prefix: string) => {
    if (!monthGroups[prefix]) monthGroups[prefix] = { trips: [], penalties: [], subsidies: [], summary: null };
    return monthGroups[prefix];
  };

  for (const ws of wb.worksheets) {
    const name = ws.name.trim();
    // Extract month prefix like "03." → "03"
    const prefixMatch = name.match(/^(\d{2})\./);
    const prefix = prefixMatch ? prefixMatch[1] : "00";

    if (name.includes("店配車") && !name.includes("明細")) {
      getGroup(prefix).trips.push(...parseTripSheet(ws, "店配車"));
    } else if (name.endsWith("NDD") && !name.includes("WH")) {
      getGroup(prefix).trips.push(...parseTripSheet(ws, "NDD"));
    } else if (name.includes("WHNDD")) {
      getGroup(prefix).trips.push(...parseTripSheet(ws, "WHNDD"));
    } else if (name.includes("罰款") && name.includes("作業")) {
      getGroup(prefix).penalties.push(...parsePenaltySheet(ws));
    } else if (name.includes("補助") || name.includes("交通罰")) {
      getGroup(prefix).subsidies.push(...parseSubsidySheet(ws));
    } else if (name.includes("請款總表")) {
      getGroup(prefix).summary = parseSummarySheet(ws);
    }
  }

  // Convert to result array with proper month strings
  const currentYear = new Date().getFullYear();
  return Object.entries(monthGroups)
    .filter(([, g]) => g.trips.length > 0 || g.penalties.length > 0)
    .map(([prefix, g]) => ({
      month: targetMonth ?? `${currentYear}-${prefix}`,
      ...g,
    }));
}

// ── POST /fusingao/billing-detail/import ──────────────────────────────────────
fusingaoBillingDetailRouter.post("/billing-detail/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "請上傳對帳明細 Excel 檔案" });

    const { year } = req.body as { year?: string };
    const currentYear = year ?? String(new Date().getFullYear());

    const results = await parseBillingDetailExcel(req.file.buffer);
    if (results.length === 0) return res.status(400).json({ ok: false, error: "未找到有效的帳務資料" });

    let totalTrips = 0; let totalPenalties = 0;

    for (const result of results) {
      const month = result.month.includes("-") ? result.month : `${currentYear}-${result.month}`;
      result.month = month;

      // Clean up existing data for this month
      await db.execute(sql`DELETE FROM fusingao_billing_trips WHERE billing_month = ${month}`);
      await db.execute(sql`DELETE FROM fusingao_billing_penalties WHERE billing_month = ${month}`);
      await db.execute(sql`DELETE FROM fusingao_billing_subsidies WHERE billing_month = ${month}`);
      await db.execute(sql`DELETE FROM fusingao_billing_summary WHERE billing_month = ${month}`);

      // Insert trips
      for (const t of result.trips) {
        await db.execute(sql`
          INSERT INTO fusingao_billing_trips
            (billing_month, billing_type, fleet_name, warehouse, area, route_no, vehicle_size, driver_id, trip_date, amount)
          VALUES (${month}, ${t.billing_type}, ${t.fleet_name||null}, ${t.warehouse||null}, ${t.area||null},
                  ${t.route_no}, ${t.vehicle_size||null}, ${t.driver_id||null}, ${t.trip_date}, ${t.amount})
        `);
        totalTrips++;
      }

      // Insert penalties
      for (const p of result.penalties) {
        await db.execute(sql`
          INSERT INTO fusingao_billing_penalties
            (billing_month, incident_date, soc, store_name, violation_type, fleet_name, driver_id, amount, penalty_month, deduction_month, notes)
          VALUES (${month}, ${p.incident_date}, ${p.soc||null}, ${p.store_name||null}, ${p.violation_type||null},
                  ${p.fleet_name||null}, ${p.driver_id||null}, ${p.amount}, ${p.penalty_month||null}, ${p.deduction_month||null}, ${p.notes||null})
        `);
        totalPenalties++;
      }

      // Insert subsidies
      for (const s of result.subsidies) {
        await db.execute(sql`
          INSERT INTO fusingao_billing_subsidies
            (billing_month, application_date, company_name, incident_date, store_name, store_address, violation, amount, license_plate)
          VALUES (${month}, ${s.application_date}, ${s.company_name||null}, ${s.incident_date}, ${s.store_name||null},
                  ${s.store_address||null}, ${s.violation||null}, ${s.amount}, ${s.license_plate||null})
        `);
      }

      // Insert summary
      if (result.summary) {
        const sm = result.summary;
        await db.execute(sql`
          INSERT INTO fusingao_billing_summary
            (billing_month, company_name, billing_period_start, billing_period_end, commission_rate, split_note,
             pretax_total, tax_amount, invoice_total, store_delivery_total, ndd_total, whndd_total,
             invoice_title, invoice_tax_id)
          VALUES (${month}, ${sm.company_name}, ${sm.billing_period_start}, ${sm.billing_period_end},
                  ${sm.commission_rate}, ${sm.split_note}, ${sm.pretax_total}, ${sm.tax_amount}, ${sm.invoice_total},
                  ${sm.store_delivery_total}, ${sm.ndd_total}, ${sm.whndd_total},
                  ${sm.invoice_title||null}, ${sm.invoice_tax_id||null})
        `);
      }
    }

    res.json({ ok: true, months: results.map(r => r.month), totalTrips, totalPenalties, totalMonths: results.length });
  } catch (err: any) {
    console.error("Billing detail import error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fusingao/billing-detail/months ───────────────────────────────────────
fusingaoBillingDetailRouter.get("/billing-detail/months", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT billing_month,
        COUNT(CASE WHEN billing_type='店配車' THEN 1 END)::int AS store_delivery_count,
        COUNT(CASE WHEN billing_type='NDD' THEN 1 END)::int AS ndd_count,
        COUNT(CASE WHEN billing_type='WHNDD' THEN 1 END)::int AS whndd_count,
        SUM(amount)::numeric AS total_amount
      FROM fusingao_billing_trips
      GROUP BY billing_month ORDER BY billing_month DESC
    `);
    const summaries = await db.execute(sql`SELECT * FROM fusingao_billing_summary ORDER BY billing_month DESC`);
    const penaltyTotals = await db.execute(sql`
      SELECT billing_month, SUM(amount)::numeric AS penalty_total, COUNT(*)::int AS penalty_count
      FROM fusingao_billing_penalties GROUP BY billing_month
    `);
    res.json({ ok: true, months: rows.rows, summaries: summaries.rows, penaltyTotals: penaltyTotals.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fusingao/billing-detail/:month ───────────────────────────────────────
fusingaoBillingDetailRouter.get("/billing-detail/:month", async (req, res) => {
  try {
    const { month } = req.params;
    const { type } = req.query as { type?: string };

    let tripWhere = `WHERE billing_month = '${month}'`;
    if (type) tripWhere += ` AND billing_type = '${type}'`;

    const [trips, penalties, subsidies, summary] = await Promise.all([
      db.execute(sql.raw(`
        SELECT billing_type, fleet_name, warehouse, area, route_no, vehicle_size, driver_id,
               trip_date, amount FROM fusingao_billing_trips ${tripWhere}
        ORDER BY billing_type, route_no, trip_date
      `)),
      db.execute(sql`SELECT * FROM fusingao_billing_penalties WHERE billing_month = ${month} ORDER BY incident_date`),
      db.execute(sql`SELECT * FROM fusingao_billing_subsidies WHERE billing_month = ${month} ORDER BY incident_date`),
      db.execute(sql`SELECT * FROM fusingao_billing_summary WHERE billing_month = ${month}`),
    ]);

    // Aggregate by type
    const aggByType = await db.execute(sql.raw(`
      SELECT billing_type, route_no, driver_id, SUM(amount)::numeric AS total, COUNT(*)::int AS trip_count
      FROM fusingao_billing_trips WHERE billing_month = '${month}'
      GROUP BY billing_type, route_no, driver_id ORDER BY billing_type, route_no
    `));

    res.json({
      ok: true, month,
      trips: trips.rows, penalties: penalties.rows, subsidies: subsidies.rows,
      summary: (summary.rows as any[])[0] ?? null,
      aggregated: aggByType.rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
