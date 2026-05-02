/**
 * 模組 4 + 模組 6：一條龍財務清算 + 月結財務總表導出
 * GET  /api/financials?period=YYYY-MM
 * GET  /api/financials/order/:orderId
 * POST /api/financials/recalculate/:orderId
 * GET  /api/financials/monthly-report?period=YYYY-MM
 * GET  /api/financials/export-excel?period=YYYY-MM  (6-sheet Excel)
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import ExcelJS from "exceljs";
import { taipeiMonth } from "../lib/timezone";

export const financialsRouter = Router();

// ── 建表 + DB 觸發器 ──────────────────────────────────────────────────────────

export async function ensureFinancialsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_financials (
      id                 SERIAL PRIMARY KEY,
      order_id           INTEGER,
      order_no           TEXT,
      partner_id         INTEGER,
      partner_name       TEXT,
      driver_id          INTEGER,
      driver_name        TEXT,
      vehicle_type       TEXT,
      distance_km        NUMERIC(8,2),
      duration_min       INTEGER,

      -- AR（應收：向廠商/客戶收）
      ar_base            NUMERIC(12,2) DEFAULT 0,
      ar_vehicle         NUMERIC(12,2) DEFAULT 0,
      ar_equipment       NUMERIC(12,2) DEFAULT 0,
      ar_area            NUMERIC(12,2) DEFAULT 0,
      ar_total           NUMERIC(12,2) DEFAULT 0,
      ar_tax             NUMERIC(12,2) DEFAULT 0,
      ar_grand_total     NUMERIC(12,2) DEFAULT 0,
      ar_status          TEXT DEFAULT 'pending',
      ar_paid_at         TIMESTAMPTZ,

      -- AP（應付：給司機/車隊）
      ap_base            NUMERIC(12,2) DEFAULT 0,
      ap_tailgate        NUMERIC(12,2) DEFAULT 0,
      ap_frozen          NUMERIC(12,2) DEFAULT 0,
      ap_other_equipment NUMERIC(12,2) DEFAULT 0,
      ap_total           NUMERIC(12,2) DEFAULT 0,
      ap_status          TEXT DEFAULT 'pending',
      ap_paid_at         TIMESTAMPTZ,

      -- 平台損益
      platform_revenue   NUMERIC(12,2) DEFAULT 0,
      platform_cost      NUMERIC(12,2) DEFAULT 0,
      platform_profit    NUMERIC(12,2) DEFAULT 0,
      profit_margin_pct  NUMERIC(5,2)  DEFAULT 0,

      period             TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(order_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_of_period ON order_financials (period)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_of_order_id ON order_financials (order_id)`);

  // DB 觸發器：訂單 → delivered 時自動產生財務清算
  await pool.query(`
    CREATE OR REPLACE FUNCTION auto_create_financials()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        INSERT INTO order_financials (
          order_id, order_no, period,
          ar_total, ar_grand_total,
          ap_total, platform_profit, platform_revenue,
          profit_margin_pct
        ) VALUES (
          NEW.id,
          NEW.order_no,
          TO_CHAR(NOW(), 'YYYY-MM'),
          COALESCE(NEW.total_fee, 0),
          COALESCE(NEW.total_fee, 0) * 1.05,
          COALESCE((NEW.total_fee::numeric * 0.80), 0),
          COALESCE(NEW.total_fee, 0) * 0.15,
          COALESCE(NEW.total_fee, 0) * 0.15,
          15
        )
        ON CONFLICT (order_id) DO NOTHING;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_auto_financials ON orders;
    CREATE TRIGGER trg_auto_financials
      AFTER UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION auto_create_financials()
  `).catch(() => { /* orders table 可能不存在 */ });

  console.log("[Financials] tables + trigger ensured");
}

// ── 內部工具：依單計算財務分拆 ────────────────────────────────────────────────

async function calcFinancials(orderId: number): Promise<void> {
  const { rows } = await pool.query(`
    SELECT
      o.id, o.order_no, o.status,
      COALESCE(o.total_fee, 0)::numeric   AS ar_total,
      COALESCE(o.driver_id, 0)            AS driver_id,
      o.driver_name,
      o.required_vehicle_type             AS vehicle_type,
      o.need_tailgate,
      o.need_hydraulic_pallet,
      TO_CHAR(COALESCE(o.completed_at, o.created_at), 'YYYY-MM') AS period,
      COALESCE(os.driver_payout, 0)::numeric AS ap_base
    FROM orders o
    LEFT JOIN order_settlements os ON os.order_id = o.id
    WHERE o.id = $1 LIMIT 1
  `, [orderId]);
  if (!rows[0]) return;
  const o = rows[0];

  const ar_total     = Number(o.ar_total);
  const ar_tax       = Math.round(ar_total * 0.05 * 100) / 100;
  const ar_grand     = ar_total + ar_tax;

  const ap_tailgate  = (o.need_tailgate === true || o.need_tailgate === "true") ? 500 : 0;
  const ap_frozen    = 0;
  const ap_other     = (o.need_hydraulic_pallet === true || o.need_hydraulic_pallet === "true") ? 800 : 0;
  let ap_base        = Number(o.ap_base ?? 0);
  if (ap_base <= 0) ap_base = Math.round(ar_total * 0.80);
  const ap_total     = ap_base + ap_tailgate + ap_frozen + ap_other;

  const platform_revenue = ar_total;
  const platform_cost    = ap_total;
  const platform_profit  = ar_total - ap_total;
  const profit_margin_pct = ar_total > 0 ? Math.round(platform_profit / ar_total * 1000) / 10 : 0;

  await pool.query(`
    INSERT INTO order_financials (
      order_id, order_no, driver_id, driver_name, vehicle_type,
      ar_total, ar_tax, ar_grand_total,
      ap_base, ap_tailgate, ap_frozen, ap_other_equipment, ap_total,
      platform_revenue, platform_cost, platform_profit, profit_margin_pct,
      period, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
    ON CONFLICT (order_id) DO UPDATE SET
      ar_total           = EXCLUDED.ar_total,
      ar_tax             = EXCLUDED.ar_tax,
      ar_grand_total     = EXCLUDED.ar_grand_total,
      ap_base            = EXCLUDED.ap_base,
      ap_tailgate        = EXCLUDED.ap_tailgate,
      ap_frozen          = EXCLUDED.ap_frozen,
      ap_other_equipment = EXCLUDED.ap_other_equipment,
      ap_total           = EXCLUDED.ap_total,
      platform_revenue   = EXCLUDED.platform_revenue,
      platform_cost      = EXCLUDED.platform_cost,
      platform_profit    = EXCLUDED.platform_profit,
      profit_margin_pct  = EXCLUDED.profit_margin_pct,
      updated_at         = NOW()
  `, [
    orderId, o.order_no, o.driver_id, o.driver_name, o.vehicle_type,
    ar_total, ar_tax, ar_grand,
    ap_base, ap_tailgate, ap_frozen, ap_other, ap_total,
    platform_revenue, platform_cost, platform_profit, profit_margin_pct,
    o.period,
  ]);
}

// ── GET /api/financials?period=YYYY-MM ───────────────────────────────────────

financialsRouter.get("/financials", async (req, res) => {
  try {
    const { period, ar_status, ap_status } = req.query as Record<string, string>;
    const conds: string[] = [];
    const params: unknown[] = [];

    if (period) { params.push(period); conds.push(`period = $${params.length}`); }
    if (ar_status) { params.push(ar_status); conds.push(`ar_status = $${params.length}`); }
    if (ap_status) { params.push(ap_status); conds.push(`ap_status = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM order_financials ${where} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    res.json({ ok: true, financials: rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/financials/order/:orderId ───────────────────────────────────────

financialsRouter.get("/financials/order/:orderId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM order_financials WHERE order_id = $1 LIMIT 1`,
      [req.params.orderId]
    );
    res.json({ ok: true, financial: rows[0] ?? null });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/financials/recalculate/:orderId ─────────────────────────────────

financialsRouter.post("/financials/recalculate/:orderId", async (req, res) => {
  try {
    const id = parseInt(req.params.orderId);
    if (isNaN(id)) return res.status(400).json({ ok: false, error: "無效的訂單 ID" });
    await calcFinancials(id);
    const { rows } = await pool.query(`SELECT * FROM order_financials WHERE order_id = $1`, [id]);
    res.json({ ok: true, financial: rows[0] ?? null });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/financials/batch-recalculate ───────────────────────────────────
// 補跑：所有 delivered 但無財務紀錄的訂單

financialsRouter.post("/financials/batch-recalculate", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id FROM orders o
      LEFT JOIN order_financials f ON f.order_id = o.id
      WHERE o.status = 'delivered' AND f.id IS NULL
      ORDER BY o.id DESC LIMIT 300
    `);
    let success = 0;
    for (const row of rows) {
      try { await calcFinancials(row.id); success++; } catch { /* continue */ }
    }
    res.json({ ok: true, total: rows.length, success });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── PATCH /api/financials/:id/status ────────────────────────────────────────

financialsRouter.patch("/financials/:id/status", async (req, res) => {
  try {
    const { ar_status, ap_status } = req.body;
    const sets: string[] = ["updated_at = NOW()"];
    const vals: unknown[] = [req.params.id];
    if (ar_status) { vals.push(ar_status); sets.push(`ar_status = $${vals.length}, ar_paid_at = ${ar_status === "paid" ? "NOW()" : "NULL"}`); }
    if (ap_status) { vals.push(ap_status); sets.push(`ap_status = $${vals.length}, ap_paid_at = ${ap_status === "paid" ? "NOW()" : "NULL"}`); }
    await pool.query(`UPDATE order_financials SET ${sets.join(", ")} WHERE id = $1`, vals);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/financials/monthly-report?period=YYYY-MM ────────────────────────

financialsRouter.get("/financials/monthly-report", async (req, res) => {
  try {
    const { period } = req.query as { period?: string };
    const target = period ?? taipeiMonth();

    const [sumRow, byPartner, byDriver, byVehicle, arDetail, apDetail] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                       AS total_orders,
          COALESCE(SUM(ar_total),0)::numeric  AS total_ar,
          COALESCE(SUM(ap_total),0)::numeric  AS total_ap,
          COALESCE(SUM(platform_profit),0)::numeric AS total_platform_profit,
          ROUND(CASE WHEN SUM(ar_total)>0 THEN SUM(platform_profit)/SUM(ar_total)*100 ELSE 0 END,1) AS profit_margin,
          COALESCE(SUM(ar_tax),0)::numeric    AS total_tax
        FROM order_financials WHERE period = $1
      `, [target]),
      pool.query(`
        SELECT partner_name,
          COUNT(*)::int AS orders,
          SUM(ar_total)::numeric AS ar, SUM(ap_total)::numeric AS ap,
          SUM(platform_profit)::numeric AS profit
        FROM order_financials WHERE period=$1
        GROUP BY partner_name ORDER BY ar DESC NULLS LAST
      `, [target]),
      pool.query(`
        SELECT driver_name,
          COUNT(*)::int AS orders,
          SUM(ap_total)::numeric AS total_pay
        FROM order_financials WHERE period=$1 AND driver_name IS NOT NULL
        GROUP BY driver_name ORDER BY total_pay DESC NULLS LAST
      `, [target]),
      pool.query(`
        SELECT vehicle_type,
          COUNT(*)::int AS orders,
          SUM(ar_total)::numeric AS ar, SUM(ap_total)::numeric AS ap,
          SUM(platform_profit)::numeric AS profit
        FROM order_financials WHERE period=$1 AND vehicle_type IS NOT NULL
        GROUP BY vehicle_type ORDER BY ar DESC NULLS LAST
      `, [target]),
      pool.query(`SELECT id,order_id,order_no,partner_name,ar_total,ar_tax,ar_grand_total,ar_status FROM order_financials WHERE period=$1 ORDER BY created_at`, [target]),
      pool.query(`SELECT id,order_id,order_no,driver_name,ap_base,ap_tailgate,ap_frozen,ap_other_equipment,ap_total,ap_status FROM order_financials WHERE period=$1 ORDER BY created_at`, [target]),
    ]);

    const s = sumRow.rows[0] ?? {};
    res.json({
      ok: true,
      period: target,
      summary: {
        total_orders:         s.total_orders ?? 0,
        total_ar:             Number(s.total_ar ?? 0),
        total_ap:             Number(s.total_ap ?? 0),
        total_platform_profit:Number(s.total_platform_profit ?? 0),
        profit_margin:        `${s.profit_margin ?? 0}%`,
        total_tax:            Number(s.total_tax ?? 0),
      },
      by_partner:      byPartner.rows,
      by_driver:       byDriver.rows,
      by_vehicle_type: byVehicle.rows,
      ar_details:      arDetail.rows,
      ap_details:      apDetail.rows,
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/financials/export-excel?period=YYYY-MM ──────────────────────────
// 6 工作表完整月結 Excel

const BRAND_COLOR = "FF1E3A5F";
const ACCENT      = "FFE8A020";
const hStyle = (bg = BRAND_COLOR): Partial<ExcelJS.Style> => ({
  font: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
  alignment: { horizontal: "center", vertical: "middle" },
  border: { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } },
});
const numFmt = (n: number | string) => Number(n ?? 0).toLocaleString("zh-TW");

financialsRouter.get("/financials/export-excel", async (req, res) => {
  try {
    const { period } = req.query as { period?: string };
    const target = period ?? taipeiMonth();

    // 取全部資料
    const [allRows, byPartner, byDriver, byVehicle] = await Promise.all([
      pool.query(`SELECT * FROM order_financials WHERE period=$1 ORDER BY created_at`, [target]),
      pool.query(`
        SELECT partner_name, COUNT(*)::int AS orders,
          SUM(ar_total)::numeric AS ar, SUM(ap_total)::numeric AS ap,
          SUM(platform_profit)::numeric AS profit
        FROM order_financials WHERE period=$1 GROUP BY partner_name ORDER BY ar DESC
      `, [target]),
      pool.query(`
        SELECT driver_name, COUNT(*)::int AS orders,
          SUM(ap_base)::numeric AS base, SUM(ap_tailgate)::numeric AS tailgate,
          SUM(ap_frozen)::numeric AS frozen, SUM(ap_other_equipment)::numeric AS other,
          SUM(ap_total)::numeric AS total
        FROM order_financials WHERE period=$1 AND driver_name IS NOT NULL
        GROUP BY driver_name ORDER BY total DESC
      `, [target]),
      pool.query(`
        SELECT vehicle_type, COUNT(*)::int AS orders,
          SUM(ar_total)::numeric AS ar, SUM(ap_total)::numeric AS ap,
          SUM(platform_profit)::numeric AS profit
        FROM order_financials WHERE period=$1 AND vehicle_type IS NOT NULL
        GROUP BY vehicle_type ORDER BY ar DESC
      `, [target]),
    ]);

    const rows = allRows.rows;
    const sumAR    = rows.reduce((s, r) => s + Number(r.ar_total ?? 0), 0);
    const sumAP    = rows.reduce((s, r) => s + Number(r.ap_total ?? 0), 0);
    const sumProfit= rows.reduce((s, r) => s + Number(r.platform_profit ?? 0), 0);
    const sumTax   = rows.reduce((s, r) => s + Number(r.ar_tax ?? 0), 0);
    const margin   = sumAR > 0 ? Math.round(sumProfit / sumAR * 1000) / 10 : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠全智慧物流清算平台";
    wb.created = new Date();

    // ─ Sheet 1：月結總覽 ───────────────────────────────────────────────────────
    const s1 = wb.addWorksheet("月結總覽");
    s1.getColumn("A").width = 26;
    s1.getColumn("B").width = 22;
    s1.addRow([`富詠運輸 — ${target} 月結財務總覽`]).font = { bold: true, size: 14, color: { argb: BRAND_COLOR } };
    s1.addRow([`產生時間：${new Date().toLocaleString("zh-TW")}`]).font = { size: 9, color: { argb: "FF888888" } };
    s1.addRow([]);
    const h1 = s1.addRow(["指標", "數值"]); h1.eachCell(c => Object.assign(c, { style: hStyle() })); h1.height = 22;
    const summary1 = [
      ["結算月份", target],
      ["訂單總數", rows.length],
      ["AR 應收總額", `$${numFmt(sumAR)}`],
      ["AP 應付總額", `$${numFmt(sumAP)}`],
      ["平台淨利", `$${numFmt(sumProfit)}`],
      ["利潤率", `${margin}%`],
      ["含稅AR總額", `$${numFmt(sumAR + sumTax)}`],
      ["稅金（5%）", `$${numFmt(sumTax)}`],
    ];
    summary1.forEach(([k, v]) => {
      const r = s1.addRow([k, v]);
      r.height = 20;
      if (String(v).startsWith("$")) r.getCell(2).font = { bold: true, color: { argb: BRAND_COLOR } };
    });

    s1.addRow([]);
    s1.addRow(["車型統計"]).font = { bold: true };
    const hvt = s1.addRow(["車型", "訂單數", "AR 收入", "AP 支出", "淨利"]);
    hvt.eachCell(c => Object.assign(c, { style: hStyle(ACCENT) }));
    byVehicle.rows.forEach(r => {
      s1.addRow([r.vehicle_type ?? "-", r.orders, `$${numFmt(r.ar)}`, `$${numFmt(r.ap)}`, `$${numFmt(r.profit)}`]);
    });

    // ─ Sheet 2：AR 應收明細 ────────────────────────────────────────────────────
    const s2 = wb.addWorksheet("AR 應收明細");
    const ar_cols = [
      { header: "訂單ID",   width: 9  },
      { header: "訂單號",   width: 18 },
      { header: "廠商",     width: 18 },
      { header: "AR 基本",  width: 13 },
      { header: "AR 稅",    width: 11 },
      { header: "AR 含稅",  width: 13 },
      { header: "收款狀態", width: 11 },
    ];
    s2.columns = ar_cols.map(c => ({ header: c.header, width: c.width }));
    s2.getRow(1).eachCell(c => Object.assign(c, { style: hStyle() }));
    rows.forEach(r => s2.addRow([r.order_id, r.order_no ?? "-", r.partner_name ?? "-",
      Number(r.ar_total), Number(r.ar_tax), Number(r.ar_grand_total), r.ar_status === "paid" ? "已收款" : "待收款"]));
    ["D","E","F"].forEach(col => {
      s2.getColumn(col).numFmt = '#,##0';
      s2.getColumn(col).width = 13;
    });
    const arTotal = s2.addRow(["合計", "", "", sumAR, sumTax, sumAR + sumTax, ""]);
    arTotal.font = { bold: true };

    // ─ Sheet 3：AP 應付明細 ────────────────────────────────────────────────────
    const s3 = wb.addWorksheet("AP 應付明細");
    s3.columns = [
      { header: "訂單ID",   width: 9  },
      { header: "訂單號",   width: 18 },
      { header: "司機",     width: 16 },
      { header: "AP 基本",  width: 13 },
      { header: "AP 尾門",  width: 11 },
      { header: "AP 冷凍",  width: 11 },
      { header: "AP 其他",  width: 11 },
      { header: "AP 合計",  width: 13 },
      { header: "付款狀態", width: 11 },
    ].map(c => ({ header: c.header, width: c.width }));
    s3.getRow(1).eachCell(c => Object.assign(c, { style: hStyle() }));
    rows.forEach(r => s3.addRow([r.order_id, r.order_no ?? "-", r.driver_name ?? "-",
      Number(r.ap_base), Number(r.ap_tailgate), Number(r.ap_frozen),
      Number(r.ap_other_equipment), Number(r.ap_total),
      r.ap_status === "paid" ? "已付款" : "待付款"]));
    ["D","E","F","G","H"].forEach(col => { s3.getColumn(col).numFmt = '#,##0'; });
    const apTotalRow = s3.addRow(["合計", "", "", sumAP, "", "", "", sumAP, ""]);
    apTotalRow.font = { bold: true };

    // ─ Sheet 4：廠商對帳單 ────────────────────────────────────────────────────
    const s4 = wb.addWorksheet("廠商對帳單");
    s4.columns = ["廠商名稱","訂單數","AR 收入","AP 支出","平台淨利"].map((h, i) => ({
      header: h, width: [20, 9, 14, 14, 14][i],
    }));
    s4.getRow(1).eachCell(c => Object.assign(c, { style: hStyle() }));
    byPartner.rows.forEach(r => s4.addRow([r.partner_name ?? "（無廠商）", r.orders,
      Number(r.ar), Number(r.ap), Number(r.profit)]));
    ["C","D","E"].forEach(col => { s4.getColumn(col).numFmt = '#,##0'; });

    // ─ Sheet 5：司機薪資單 ────────────────────────────────────────────────────
    const s5 = wb.addWorksheet("司機薪資單");
    s5.columns = ["司機姓名","訂單數","基本薪資","尾門補助","冷凍補助","其他補助","薪資合計"].map((h, i) => ({
      header: h, width: [18, 9, 13, 11, 11, 11, 13][i],
    }));
    s5.getRow(1).eachCell(c => Object.assign(c, { style: hStyle() }));
    byDriver.rows.forEach(r => s5.addRow([r.driver_name ?? "-", r.orders,
      Number(r.base), Number(r.tailgate), Number(r.frozen), Number(r.other), Number(r.total)]));
    ["C","D","E","F","G"].forEach(col => { s5.getColumn(col).numFmt = '#,##0'; });
    const driverTotal = s5.addRow(["合計", byDriver.rows.reduce((s, r) => s + r.orders, 0), "",
      "", "", "", byDriver.rows.reduce((s, r) => s + Number(r.total), 0)]);
    driverTotal.font = { bold: true };

    // ─ Sheet 6：平台損益 ──────────────────────────────────────────────────────
    const s6 = wb.addWorksheet("平台損益");
    s6.getColumn("A").width = 24;
    s6.getColumn("B").width = 18;
    s6.addRow([`富詠運輸 — ${target} 平台損益表`]).font = { bold: true, size: 13, color: { argb: BRAND_COLOR } };
    s6.addRow([]);
    const h6 = s6.addRow(["項目", "金額"]); h6.eachCell(c => Object.assign(c, { style: hStyle() }));
    const pnl = [
      ["● 營業收入（AR 總額）", sumAR],
      ["  減：應付司機（AP）", -sumAP],
      ["═ 平台毛利", sumProfit],
      ["  毛利率", `${margin}%`],
      ["  含稅 AR", sumAR + sumTax],
      ["  稅金（5%）", sumTax],
    ];
    pnl.forEach(([label, v]) => {
      const r = s6.addRow([label, typeof v === "number" ? v : v]);
      r.height = 20;
      if (String(label).startsWith("═")) r.font = { bold: true, color: { argb: BRAND_COLOR } };
      if (typeof v === "number" && v < 0) r.getCell(2).font = { color: { argb: "FFCC0000" } };
      if (typeof v === "number") r.getCell(2).numFmt = '#,##0';
    });

    // ─ 輸出 ──────────────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Financials_${target}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("[Financials] export-excel error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

