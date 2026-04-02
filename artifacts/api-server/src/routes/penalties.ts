import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const penaltiesRouter = Router();

penaltiesRouter.get("/", async (req, res) => {
  try {
    const { source, appeal_status, driver_code, limit = "200", offset = "0" } = req.query as Record<string, string>;

    let conditions: string[] = [];
    if (source) conditions.push(`source = '${source.replace(/'/g, "''")}'`);
    if (appeal_status) conditions.push(`appeal_status = '${appeal_status.replace(/'/g, "''")}'`);
    if (driver_code) conditions.push(`driver_code = '${driver_code.replace(/'/g, "''")}'`);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.execute(sql`
      SELECT * FROM shopee_penalties
      ${sql.raw(where)}
      ORDER BY incident_date DESC NULLS LAST, id DESC
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total, 
             SUM(fine_amount) as total_fine,
             COUNT(CASE WHEN appeal_status = 'V' THEN 1 END) as appeal_passed,
             COUNT(CASE WHEN appeal_status = 'X' THEN 1 END) as appeal_failed,
             COUNT(CASE WHEN source = 'NDD過刷異常' THEN 1 END) as ndd_count,
             COUNT(CASE WHEN source = '罰款統計' THEN 1 END) as penalty_count
      FROM shopee_penalties
      ${sql.raw(where)}
    `);

    const stats = (countResult.rows as any[])[0];
    res.json({
      ok: true,
      items: rows.rows,
      total: parseInt(stats.total),
      totalFine: parseFloat(stats.total_fine || "0"),
      appealPassed: parseInt(stats.appeal_passed || "0"),
      appealFailed: parseInt(stats.appeal_failed || "0"),
      nddCount: parseInt(stats.ndd_count || "0"),
      penaltyCount: parseInt(stats.penalty_count || "0"),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

penaltiesRouter.get("/summary", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT 
        source,
        COUNT(*) as count,
        SUM(fine_amount) as total_fine,
        COUNT(CASE WHEN appeal_status = 'V' THEN 1 END) as appeal_passed,
        COUNT(CASE WHEN appeal_status = 'X' THEN 1 END) as appeal_failed
      FROM shopee_penalties
      GROUP BY source
      ORDER BY source
    `);

    const driverRows = await db.execute(sql`
      SELECT driver_code, COUNT(*) as count, SUM(fine_amount) as total_fine
      FROM shopee_penalties
      WHERE driver_code IS NOT NULL AND driver_code != ''
      GROUP BY driver_code
      ORDER BY total_fine DESC
      LIMIT 10
    `);

    res.json({ ok: true, bySources: rows.rows, byDriver: driverRows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

penaltiesRouter.post("/import-from-sheet", async (req, res) => {
  try {
    const { sheetId, gid, source } = req.body as { sheetId: string; gid: string; source: string };
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const r = await fetch(csvUrl);
    if (!r.ok) return res.status(400).json({ ok: false, error: "無法存取試算表" });

    const text = await r.text();
    const lines = text.split("\n").filter((l) => l.trim());

    let inserted = 0;
    if (source === "NDD過刷異常") {
      const hIdx = lines.findIndex((l) => l.includes("案件發生日期") && l.includes("罰款金額"));
      if (hIdx < 0) return res.status(400).json({ ok: false, error: "找不到欄位標題行" });

      for (const line of lines.slice(hIdx + 1)) {
        const c = line.split(",").map((x) => x.replace(/^"|"$/g, "").trim());
        const [, date, soc, store, vtype, fleet, driver, fineStr, fineMonth, deductMonth, notes, appeal] = c;
        if (!date && !store) continue;
        const fineAmt = parseFloat((fineStr || "0").replace(/[^0-9.]/g, "")) || 0;
        await db.execute(sql`
          INSERT INTO shopee_penalties
            (incident_date,soc,store_name,violation_type,fleet_name,driver_code,fine_amount,fine_month,deduction_month,notes,appeal_status,source)
          VALUES (${date || null},${soc || null},${store || null},${vtype || null},${fleet || null},${driver || null},${fineAmt},${fineMonth || null},${deductMonth || null},${notes || null},${appeal || null},'NDD過刷異常')
        `);
        inserted++;
      }
    } else {
      const hIdx = lines.findIndex((l) => l.includes("vender"));
      if (hIdx < 0) return res.status(400).json({ ok: false, error: "找不到欄位標題行" });
      for (const line of lines.slice(hIdx + 1)) {
        const c = line.split(",").map((x) => x.replace(/^"|"$/g, "").trim());
        const [vendor, date, store, scanRate, , appealResult, appealFail, remarks] = c;
        if (!date && !store) continue;
        await db.execute(sql`
          INSERT INTO shopee_penalties
            (incident_date,store_name,scan_rate,vendor,appeal_status,appeal_fail_reason,notes,source)
          VALUES (${date || null},${store || null},${scanRate || null},${vendor || null},${appealResult || null},${appealFail || null},${remarks || null},'罰款統計')
        `);
        inserted++;
      }
    }
    res.json({ ok: true, inserted });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
