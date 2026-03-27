import { Router } from "express";
import { pool } from "@workspace/db";

export const settlementExportRouter = Router();

function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(headers: string[], rows: Record<string, unknown>[], keys: string[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(keys.map(k => escapeCSV(row[k])).join(","));
  }
  return "\uFEFF" + lines.join("\r\n"); // BOM for Excel UTF-8
}

// ── GET /api/settlement/export/customer-ar ────────────────────────────────
settlementExportRouter.get("/settlement/export/customer-ar", async (req, res) => {
  try {
    const { month, format = "csv" } = req.query as Record<string, string>;

    let dateFilter = "";
    const params: string[] = [];
    if (month) {
      dateFilter = `AND o.created_at >= $1::date AND o.created_at < ($1::date + INTERVAL '1 month')`;
      params.push(`${month}-01`);
    }

    const { rows } = await pool.query(`
      SELECT
        COALESCE(o.customer_name, '匿名')    AS "客戶名稱",
        o.customer_phone                       AS "聯絡電話",
        COUNT(*)::int                          AS "訂單數",
        COALESCE(SUM(o.total_fee), 0)::numeric AS "應收金額",
        COALESCE(SUM(o.total_fee)
          FILTER (WHERE o.fee_status='paid'), 0)::numeric   AS "已收金額",
        COALESCE(SUM(o.total_fee)
          FILTER (WHERE o.fee_status='unpaid'), 0)::numeric AS "未收金額",
        COUNT(*) FILTER (WHERE o.fee_status='paid')::int    AS "已結訂單",
        COUNT(*) FILTER (WHERE o.fee_status='unpaid')::int  AS "未結訂單",
        MIN(o.created_at)::date AS "最早訂單",
        MAX(o.created_at)::date AS "最新訂單"
      FROM orders o
      WHERE o.status = 'delivered' ${dateFilter}
      GROUP BY COALESCE(o.customer_name, '匿名'), o.customer_phone
      ORDER BY SUM(o.total_fee) DESC NULLS LAST
    `, params);

    const headers = ["客戶名稱","聯絡電話","訂單數","應收金額","已收金額","未收金額","已結訂單","未結訂單","最早訂單","最新訂單"];
    const csv = toCSV(headers, rows, headers);
    const filename = `客戶對帳單_${month ?? "all"}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/settlement/export/driver-payroll ─────────────────────────────
settlementExportRouter.get("/settlement/export/driver-payroll", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;

    const params: string[] = [];
    let dateFilter = "";
    if (month) {
      dateFilter = `AND o.created_at >= $1::date AND o.created_at < ($1::date + INTERVAL '1 month')`;
      params.push(`${month}-01`);
    }

    const { rows } = await pool.query(`
      SELECT
        d.name                                  AS "司機姓名",
        d.license_plate                         AS "車牌號碼",
        d.vehicle_type                          AS "車型",
        d.phone                                 AS "聯絡電話",
        COUNT(o.id) FILTER (WHERE o.status='delivered')::int   AS "完成趟次",
        COUNT(o.id) FILTER (WHERE o.status='cancelled')::int   AS "取消趟次",
        COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric AS "總趟次收入",
        ROUND(COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric * 0.85, 0) AS "應付薪資(85%)",
        ROUND(COALESCE(SUM(o.total_fee) FILTER (WHERE o.status='delivered'), 0)::numeric * 0.15, 0) AS "佣金(15%)",
        ROUND(COALESCE(AVG(r.stars), 0)::numeric, 1) AS "平均評分"
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id ${dateFilter}
      LEFT JOIN driver_ratings r ON r.driver_id = d.id
      GROUP BY d.id, d.name, d.license_plate, d.vehicle_type, d.phone
      HAVING COUNT(o.id) FILTER (WHERE o.status='delivered') > 0
      ORDER BY SUM(o.total_fee) FILTER (WHERE o.status='delivered') DESC NULLS LAST
    `, params);

    const headers = ["司機姓名","車牌號碼","車型","聯絡電話","完成趟次","取消趟次","總趟次收入","應付薪資(85%)","佣金(15%)","平均評分"];
    const csv = toCSV(headers, rows, headers);
    const filename = `司機薪資表_${month ?? "all"}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/settlement/export/outsourcer ─────────────────────────────────
// Outsourcer invoices derived from orders with outsource data in approval payload
settlementExportRouter.get("/settlement/export/outsourcer", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;

    const params: unknown[] = [];
    let dateFilter = "";
    if (month) {
      dateFilter = `AND ar.created_at >= $1::date AND ar.created_at < ($1::date + INTERVAL '1 month')`;
      params.push(`${month}-01`);
    }

    const { rows } = await pool.query(`
      SELECT
        ar.payload->>'fleet_name'    AS "外包商名稱",
        COUNT(*)::int                AS "單量",
        ar.created_at::date          AS "申請日期",
        ar.reviewed_at::date         AS "核准日期",
        SUM((ar.payload->>'outsource_fee')::numeric)::numeric AS "外包費合計",
        ar.status                    AS "狀態",
        STRING_AGG(ar.order_id::text, ', ') AS "訂單編號"
      FROM approval_requests ar
      WHERE ar.action_type = 'outsource_order'
        AND ar.status = 'approved'
        ${dateFilter}
      GROUP BY ar.payload->>'fleet_name', ar.created_at::date, ar.reviewed_at::date, ar.status
      ORDER BY ar.created_at::date DESC
    `, params);

    const headers = ["外包商名稱","單量","申請日期","核准日期","外包費合計","狀態","訂單編號"];
    const csv = toCSV(headers, rows, headers);
    const filename = `外包商請款_${month ?? "all"}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/settlement/export/cost-analysis ──────────────────────────────
settlementExportRouter.get("/settlement/export/cost-analysis", async (req, res) => {
  try {
    const { month, type = "customer" } = req.query as Record<string, string>;

    const params: string[] = [];
    let dateFilter = "";
    if (month) {
      dateFilter = `AND o.created_at >= $1::date AND o.created_at < ($1::date + INTERVAL '1 month')`;
      params.push(`${month}-01`);
    }

    const groupBy = type === "route"
      ? "COALESCE(o.region, '未指定')"
      : "COALESCE(o.customer_name, '匿名'), o.customer_phone";
    const selectLabel = type === "route"
      ? "COALESCE(o.region, '未指定') AS \"分類\""
      : "COALESCE(o.customer_name, '匿名') AS \"分類\", o.customer_phone AS \"聯絡電話\"";

    const { rows } = await pool.query(`
      SELECT
        ${selectLabel},
        COUNT(*)::int                                        AS "趟次",
        COALESCE(SUM(o.total_fee), 0)::numeric              AS "總收入",
        COALESCE(AVG(o.total_fee), 0)::numeric              AS "平均每單",
        COALESCE(SUM(o.distance_km)
          FILTER (WHERE o.distance_km > 0), 0)::numeric     AS "總公里",
        ROUND(COALESCE(SUM(o.total_fee)*0.15, 0)::numeric, 0) AS "人事成本(估)",
        ROUND(COALESCE(SUM(o.total_fee)*0.05, 0)::numeric, 0) AS "管銷成本(估)",
        ROUND(COALESCE(SUM(o.total_fee)*0.80, 0)::numeric, 0) AS "毛利(估)",
        ROUND(80::numeric, 0)                                AS "毛利率%(估)"
      FROM orders o
      WHERE o.status = 'delivered' ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY SUM(o.total_fee) DESC NULLS LAST
      LIMIT 100
    `, params);

    const headers = type === "route"
      ? ["分類","趟次","總收入","平均每單","總公里","人事成本(估)","管銷成本(估)","毛利(估)","毛利率%(估)"]
      : ["分類","聯絡電話","趟次","總收入","平均每單","總公里","人事成本(估)","管銷成本(估)","毛利(估)","毛利率%(估)"];
    const csv = toCSV(headers, rows, headers);
    const filename = `毛利分析_${type}_${month ?? "all"}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
