/**
 * AR/AP 一條龍財務清算
 * AR = 向廠商/客戶收取的總額
 * AP = 給司機的分帳（含尾門全額補助）
 * 每單完成後自動觸發，後台可手動補跑，並提供當月 Excel 導出
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import ExcelJS from "exceljs";

export const arApRouter = Router();

// ── 建表 ─────────────────────────────────────────────────────────────────────

export async function ensureArApTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ar_ap_records (
      id               SERIAL PRIMARY KEY,
      order_id         INTEGER NOT NULL UNIQUE,
      order_no         TEXT,
      completed_at     TIMESTAMPTZ,
      customer_name    TEXT,
      pickup_address   TEXT,
      delivery_address TEXT,
      vehicle_type     TEXT,
      distance_km      NUMERIC,
      ar_amount        NUMERIC NOT NULL DEFAULT 0,
      ap_driver        NUMERIC NOT NULL DEFAULT 0,
      ap_equipment     NUMERIC NOT NULL DEFAULT 0,
      ap_total         NUMERIC NOT NULL DEFAULT 0,
      net_profit       NUMERIC NOT NULL DEFAULT 0,
      profit_margin_pct NUMERIC,
      status           TEXT NOT NULL DEFAULT 'pending',
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ar_ap_completed_at ON ar_ap_records (completed_at)`);
  console.log("[ArAp] tables ensured");
}

// ── 核心：產生單筆 AR/AP 紀錄 ───────────────────────────────────────────────

export async function generateArApForOrder(orderId: number): Promise<void> {
  const { rows } = await pool.query(`
    SELECT
      o.id, o.order_no, o.customer_name,
      o.pickup_address, o.delivery_address,
      o.required_vehicle_type,
      o.need_tailgate,
      o.need_hydraulic_pallet,
      COALESCE(o.total_fee, 0)::numeric          AS ar_amount,
      COALESCE(os.driver_payout, 0)::numeric     AS driver_payout,
      COALESCE(os.commission_amount, 0)::numeric AS commission,
      o.completed_at
    FROM orders o
    LEFT JOIN order_settlements os ON os.order_id = o.id
    WHERE o.id = $1
    LIMIT 1
  `, [orderId]);

  if (!rows[0]) return;
  const o = rows[0];

  const arAmount   = Number(o.ar_amount);
  let apDriver     = Number(o.driver_payout);
  if (apDriver <= 0) apDriver = Math.round(arAmount * 0.80);

  const hasTailgate      = o.need_tailgate === "true" || o.need_tailgate === true;
  const hasHydraulic     = o.need_hydraulic_pallet === "true" || o.need_hydraulic_pallet === true;
  const apEquipment      = (hasTailgate ? 500 : 0) + (hasHydraulic ? 800 : 0);
  const apTotal          = apDriver + apEquipment;
  const netProfit        = arAmount - apTotal;
  const profitMarginPct  = arAmount > 0 ? Math.round((netProfit / arAmount) * 1000) / 10 : 0;

  await pool.query(`
    INSERT INTO ar_ap_records (
      order_id, order_no, completed_at, customer_name,
      pickup_address, delivery_address, vehicle_type,
      ar_amount, ap_driver, ap_equipment, ap_total,
      net_profit, profit_margin_pct, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
    ON CONFLICT (order_id) DO UPDATE SET
      ar_amount = EXCLUDED.ar_amount,
      ap_driver = EXCLUDED.ap_driver,
      ap_equipment = EXCLUDED.ap_equipment,
      ap_total = EXCLUDED.ap_total,
      net_profit = EXCLUDED.net_profit,
      profit_margin_pct = EXCLUDED.profit_margin_pct,
      updated_at = NOW()
  `, [
    orderId, o.order_no, o.completed_at ?? new Date(), o.customer_name,
    o.pickup_address, o.delivery_address, o.required_vehicle_type,
    arAmount, apDriver, apEquipment, apTotal, netProfit, profitMarginPct,
  ]);
}

// ── GET /api/ar-ap/records ───────────────────────────────────────────────────

arApRouter.get("/ar-ap/records", async (req, res) => {
  try {
    const { month, status } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (month) {
      params.push(month);
      conditions.push(`TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM') = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`
      SELECT * FROM ar_ap_records ${where}
      ORDER BY COALESCE(completed_at, created_at) DESC
      LIMIT 500
    `, params);

    res.json({ ok: true, records: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ar-ap/monthly-summary ──────────────────────────────────────────

arApRouter.get("/ar-ap/monthly-summary", async (req, res) => {
  try {
    const { month } = req.query as { month?: string };
    const target = month ?? new Date().toISOString().slice(0, 7);

    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int                     AS order_count,
        COALESCE(SUM(ar_amount), 0)::int  AS total_ar,
        COALESCE(SUM(ap_total), 0)::int   AS total_ap,
        COALESCE(SUM(net_profit), 0)::int AS total_profit,
        ROUND(
          CASE WHEN SUM(ar_amount) > 0
            THEN SUM(net_profit) / SUM(ar_amount) * 100
            ELSE 0
          END, 1
        )::numeric                        AS profit_margin_pct
      FROM ar_ap_records
      WHERE TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM') = $1
    `, [target]);

    const summary = rows[0];
    res.json({ ok: true, month: target, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/ar-ap/generate/:orderId ───────────────────────────────────────

arApRouter.post("/ar-ap/generate/:orderId", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ ok: false, error: "無效的訂單 ID" });
    await generateArApForOrder(orderId);
    const { rows } = await pool.query(`SELECT * FROM ar_ap_records WHERE order_id = $1`, [orderId]);
    res.json({ ok: true, record: rows[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/ar-ap/batch-generate ──────────────────────────────────────────
// 補跑：把所有 delivered 但尚未有 AR/AP 紀錄的訂單全部產生

arApRouter.post("/ar-ap/batch-generate", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id FROM orders o
      LEFT JOIN ar_ap_records a ON a.order_id = o.id
      WHERE o.status = 'delivered' AND a.id IS NULL
      ORDER BY o.id DESC
      LIMIT 200
    `);

    let success = 0;
    for (const row of rows) {
      try { await generateArApForOrder(row.id); success++; } catch { /* continue */ }
    }
    res.json({ ok: true, total: rows.length, success });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ar-ap/monthly-export ───────────────────────────────────────────
// 下載當月財務結算總表 Excel

arApRouter.get("/ar-ap/monthly-export", async (req, res) => {
  try {
    const { month } = req.query as { month?: string };
    const target = month ?? new Date().toISOString().slice(0, 7);

    const [summaryRes, detailRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                     AS order_count,
          COALESCE(SUM(ar_amount), 0)       AS total_ar,
          COALESCE(SUM(ap_total), 0)        AS total_ap,
          COALESCE(SUM(net_profit), 0)      AS total_profit,
          ROUND(
            CASE WHEN SUM(ar_amount) > 0
              THEN SUM(net_profit) / SUM(ar_amount) * 100 ELSE 0 END, 1
          ) AS profit_margin_pct
        FROM ar_ap_records
        WHERE TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM') = $1
      `, [target]),
      pool.query(`
        SELECT
          order_id, order_no, customer_name,
          pickup_address, delivery_address, vehicle_type,
          ar_amount, ap_driver, ap_equipment, ap_total, net_profit, profit_margin_pct,
          status,
          TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM-DD') AS date
        FROM ar_ap_records
        WHERE TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM') = $1
        ORDER BY COALESCE(completed_at, created_at) ASC
      `, [target]),
    ]);

    const summary = summaryRes.rows[0];
    const details = detailRes.rows;

    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸智慧物流清算平台";
    wb.created = new Date();

    // ─ 總表 sheet ────────────────────────────────────────────────────────────
    const summarySheet = wb.addWorksheet("當月財務摘要");
    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } },
      alignment: { horizontal: "center" },
    };
    const numStyle = (color = "FF000000"): Partial<ExcelJS.Style> => ({
      numFmt: '#,##0',
      font: { color: { argb: color } },
    });

    summarySheet.addRow(["富詠運輸 — 財務結算總表", target]);
    summarySheet.addRow([]);
    const hdrRow = summarySheet.addRow(["指標", "金額"]);
    hdrRow.eachCell(c => Object.assign(c, { style: headerStyle }));

    const summaryData = [
      ["結算月份", target],
      ["訂單總數", summary.order_count],
      ["AR 總收入（應收）", Number(summary.total_ar)],
      ["AP 總支出（應付）", Number(summary.total_ap)],
      ["平台淨利", Number(summary.total_profit)],
      ["利潤率 %", `${summary.profit_margin_pct}%`],
    ];
    summaryData.forEach(([k, v]) => {
      const r = summarySheet.addRow([k, v]);
      if (typeof v === "number") {
        r.getCell(2).style = numStyle(v < 0 ? "FFCC0000" : "FF1E3A5F");
      }
    });
    summarySheet.getColumn(1).width = 22;
    summarySheet.getColumn(2).width = 18;

    // ─ 明細 sheet ────────────────────────────────────────────────────────────
    const detailSheet = wb.addWorksheet("訂單明細");
    const cols = [
      { header: "日期", key: "date", width: 12 },
      { header: "訂單ID", key: "order_id", width: 9 },
      { header: "訂單號", key: "order_no", width: 18 },
      { header: "客戶", key: "customer_name", width: 16 },
      { header: "取貨地址", key: "pickup_address", width: 28 },
      { header: "送貨地址", key: "delivery_address", width: 28 },
      { header: "車型", key: "vehicle_type", width: 10 },
      { header: "AR 收入", key: "ar_amount", width: 12 },
      { header: "AP 司機", key: "ap_driver", width: 12 },
      { header: "AP 設備補助", key: "ap_equipment", width: 14 },
      { header: "AP 合計", key: "ap_total", width: 12 },
      { header: "淨利", key: "net_profit", width: 12 },
      { header: "利潤率", key: "profit_margin_pct", width: 10 },
      { header: "狀態", key: "status", width: 10 },
    ];
    detailSheet.columns = cols;
    const dHdrRow = detailSheet.getRow(1);
    dHdrRow.eachCell(c => Object.assign(c, { style: headerStyle }));
    dHdrRow.commit();

    details.forEach(row => {
      const r = detailSheet.addRow({
        ...row,
        ar_amount:        Number(row.ar_amount),
        ap_driver:        Number(row.ap_driver),
        ap_equipment:     Number(row.ap_equipment),
        ap_total:         Number(row.ap_total),
        net_profit:       Number(row.net_profit),
        profit_margin_pct: `${row.profit_margin_pct ?? 0}%`,
      });
      ["ar_amount","ap_driver","ap_equipment","ap_total","net_profit"].forEach(k => {
        r.getCell(k).numFmt = '#,##0';
      });
      if (Number(row.net_profit) < 0) {
        r.getCell("net_profit").font = { color: { argb: "FFCC0000" } };
      }
    });

    // 合計列
    const totalRow = detailSheet.addRow({
      date: "合計",
      ar_amount:    details.reduce((s, r) => s + Number(r.ar_amount), 0),
      ap_driver:    details.reduce((s, r) => s + Number(r.ap_driver), 0),
      ap_equipment: details.reduce((s, r) => s + Number(r.ap_equipment), 0),
      ap_total:     details.reduce((s, r) => s + Number(r.ap_total), 0),
      net_profit:   details.reduce((s, r) => s + Number(r.net_profit), 0),
    });
    totalRow.font = { bold: true };
    totalRow.getCell("date").font = { bold: true };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="ARAP_${target}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("[ArAp] export error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PATCH /api/ar-ap/records/:id/status ─────────────────────────────────────

arApRouter.patch("/ar-ap/records/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "settled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status 只允許 pending / settled" });
    }
    await pool.query(
      `UPDATE ar_ap_records SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, req.params.id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
