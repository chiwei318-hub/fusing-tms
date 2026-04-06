import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";

export const orderSettlementsRouter = Router();

/** GET /api/order-settlements
 *  查詢每筆訂單結算記錄（含司機名稱、訂單資訊）
 *  Query: payment_status, driver_id, limit, offset, from, to
 */
orderSettlementsRouter.get("/", async (req, res) => {
  try {
    const {
      payment_status,
      driver_id,
      limit = "50",
      offset = "0",
      from,
      to,
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    if (payment_status) conditions.push(`s.payment_status = '${payment_status}'`);
    if (driver_id)      conditions.push(`s.driver_id = ${parseInt(driver_id)}`);
    if (from)           conditions.push(`s.created_at >= '${from}'::timestamptz`);
    if (to)             conditions.push(`s.created_at <= '${to}'::timestamptz`);
    const where = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        s.id,
        s.order_id,
        s.order_no,
        s.driver_id,
        d.name                AS driver_name,
        d.commission_rate     AS driver_commission_rate,
        o.pickup_address,
        o.delivery_address,
        o.completed_at,
        s.total_amount::numeric        AS total_amount,
        s.commission_rate::numeric     AS commission_rate,
        s.commission_amount::numeric   AS commission_amount,
        s.platform_revenue::numeric    AS platform_revenue,
        s.driver_payout::numeric       AS driver_payout,
        s.payment_status,
        s.paid_at,
        s.payment_ref,
        s.notes,
        s.created_at
      FROM order_settlements s
      LEFT JOIN drivers d ON d.id = s.driver_id
      LEFT JOIN orders  o ON o.id = s.order_id
      WHERE 1=1 ${where}
      ORDER BY s.created_at DESC
      LIMIT  ${parseInt(limit)}
      OFFSET ${parseInt(offset)}
    `));

    const countResult = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total FROM order_settlements s WHERE 1=1 ${where}
    `));

    res.json({ data: result.rows, total: countResult.rows[0]?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/order-settlements/summary
 *  平台整體利潤摘要（可按月份篩選）
 */
orderSettlementsRouter.get("/summary", async (req, res) => {
  try {
    const { month } = req.query as { month?: string }; // YYYY-MM
    const monthFilter = month ? `AND TO_CHAR(created_at, 'YYYY-MM') = '${month}'` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int                                                     AS total_orders,
        COALESCE(SUM(total_amount), 0)::numeric                          AS gross_revenue,
        COALESCE(SUM(platform_revenue), 0)::numeric                      AS platform_revenue,
        COALESCE(SUM(driver_payout), 0)::numeric                         AS driver_payout_total,
        COALESCE(AVG(commission_rate), 15)::numeric                      AS avg_commission_rate,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int             AS paid_count,
        COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int           AS unpaid_count,
        COALESCE(SUM(driver_payout) FILTER (WHERE payment_status = 'unpaid'), 0)::numeric
                                                                         AS pending_payout
      FROM order_settlements
      WHERE 1=1 ${monthFilter}
    `));

    res.json(result.rows[0] ?? {});
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** GET /api/order-settlements/export
 *  匯出 Excel 財務報表（三個工作表：訂單明細 / 司機帳款 / 平台收入）
 *  Query: month (YYYY-MM), from, to, payment_status
 */
orderSettlementsRouter.get("/export", async (req, res) => {
  try {
    const { month, from, to, payment_status } = req.query as Record<string, string>;

    const conditions: string[] = [];
    if (month)          conditions.push(`TO_CHAR(s.created_at,'YYYY-MM') = '${month}'`);
    if (from)           conditions.push(`s.created_at >= '${from}'::timestamptz`);
    if (to)             conditions.push(`s.created_at <= '${to}'::timestamptz`);
    if (payment_status && payment_status !== "all")
                        conditions.push(`s.payment_status = '${payment_status}'`);
    const where = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    /* ── 1. 訂單明細 ── */
    const detailRows = (await db.execute(sql.raw(`
      SELECT
        s.order_no                            AS "單號",
        TO_CHAR(s.created_at,'YYYY-MM-DD')    AS "結算日期",
        d.name                                AS "司機姓名",
        o.pickup_address                      AS "取貨地址",
        o.delivery_address                    AS "送達地址",
        s.total_amount::numeric               AS "總運費(NT$)",
        s.commission_rate::numeric            AS "抽成率(%)",
        s.platform_revenue::numeric           AS "平台利潤(NT$)",
        s.driver_payout::numeric              AS "司機應得(NT$)",
        CASE s.payment_status
          WHEN 'paid'       THEN '已付款'
          WHEN 'unpaid'     THEN '待付款'
          WHEN 'processing' THEN '處理中'
          ELSE '已取消' END                   AS "付款狀態",
        TO_CHAR(s.paid_at,'YYYY-MM-DD HH24:MI') AS "付款時間",
        s.payment_ref                         AS "匯款單號"
      FROM order_settlements s
      LEFT JOIN drivers d ON d.id = s.driver_id
      LEFT JOIN orders  o ON o.id = s.order_id
      WHERE 1=1 ${where}
      ORDER BY s.created_at DESC
    `))).rows as Record<string, unknown>[];

    /* ── 2. 司機帳款彙總 ── */
    const driverRows = (await db.execute(sql.raw(`
      SELECT
        d.name                                   AS "司機姓名",
        COUNT(s.id)::int                         AS "接單筆數",
        SUM(s.total_amount)::numeric             AS "總承接運費(NT$)",
        ROUND(AVG(s.commission_rate),1)::numeric AS "平均抽成率(%)",
        SUM(s.driver_payout)::numeric            AS "合計應付(NT$)",
        SUM(s.driver_payout) FILTER
          (WHERE s.payment_status='paid')::numeric  AS "已付(NT$)",
        SUM(s.driver_payout) FILTER
          (WHERE s.payment_status='unpaid')::numeric AS "待付(NT$)"
      FROM order_settlements s
      LEFT JOIN drivers d ON d.id = s.driver_id
      WHERE 1=1 ${where}
      GROUP BY d.id, d.name
      ORDER BY "合計應付(NT$)" DESC NULLS LAST
    `))).rows as Record<string, unknown>[];

    /* ── 3. 平台收入摘要 ── */
    const summaryRow = (await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int                                                AS "總訂單筆數",
        COALESCE(SUM(total_amount),0)::numeric                      AS "總運費營收(NT$)",
        COALESCE(SUM(platform_revenue),0)::numeric                  AS "平台淨利(NT$)",
        COALESCE(SUM(driver_payout),0)::numeric                     AS "司機總應付(NT$)",
        ROUND(AVG(commission_rate),2)::numeric                      AS "平均抽成率(%)",
        COUNT(*) FILTER(WHERE payment_status='paid')::int           AS "已結清筆數",
        COUNT(*) FILTER(WHERE payment_status='unpaid')::int         AS "待付款筆數",
        COALESCE(SUM(driver_payout) FILTER
          (WHERE payment_status='unpaid'),0)::numeric               AS "待付金額(NT$)"
      FROM order_settlements
      WHERE 1=1 ${where.replace(/s\./g, "")}
    `))).rows[0] as Record<string, unknown>;

    /* ── 建立 Excel 工作簿 ── */
    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸管理系統";
    wb.created = new Date();

    const HEADER_FILL: ExcelJS.Fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FF1e3a5f" },
    };
    const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const BORDER: Partial<ExcelJS.Borders> = {
      top:    { style: "thin", color: { argb: "FFcccccc" } },
      left:   { style: "thin", color: { argb: "FFcccccc" } },
      bottom: { style: "thin", color: { argb: "FFcccccc" } },
      right:  { style: "thin", color: { argb: "FFcccccc" } },
    };

    function addSheet(
      name: string,
      headers: { key: string; width: number }[],
      data: Record<string, unknown>[],
    ) {
      const ws = wb.addWorksheet(name);
      ws.columns = headers.map(h => ({ header: h.key, key: h.key, width: h.width }));

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill   = HEADER_FILL;
        cell.font   = HEADER_FONT;
        cell.border = BORDER;
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      headerRow.height = 22;

      data.forEach((row, ri) => {
        const r = ws.addRow(headers.map(h => row[h.key] ?? ""));
        r.eachCell(cell => {
          cell.border = BORDER;
          cell.alignment = { vertical: "middle" };
          if (ri % 2 === 1) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
          }
        });
      });
      return ws;
    }

    /* Sheet 1：訂單明細 */
    if (detailRows.length > 0) {
      addSheet("訂單明細", [
        { key: "單號",         width: 20 },
        { key: "結算日期",     width: 14 },
        { key: "司機姓名",     width: 12 },
        { key: "取貨地址",     width: 28 },
        { key: "送達地址",     width: 28 },
        { key: "總運費(NT$)",  width: 14 },
        { key: "抽成率(%)",    width: 11 },
        { key: "平台利潤(NT$)",width: 15 },
        { key: "司機應得(NT$)",width: 15 },
        { key: "付款狀態",     width: 10 },
        { key: "付款時間",     width: 18 },
        { key: "匯款單號",     width: 18 },
      ], detailRows);
    }

    /* Sheet 2：司機帳款 */
    if (driverRows.length > 0) {
      addSheet("司機帳款", [
        { key: "司機姓名",        width: 14 },
        { key: "接單筆數",        width: 10 },
        { key: "總承接運費(NT$)", width: 18 },
        { key: "平均抽成率(%)",   width: 14 },
        { key: "合計應付(NT$)",   width: 16 },
        { key: "已付(NT$)",       width: 14 },
        { key: "待付(NT$)",       width: 14 },
      ], driverRows);
    }

    /* Sheet 3：平台收入摘要 */
    {
      const ws = wb.addWorksheet("平台收入摘要");
      ws.getColumn(1).width = 22;
      ws.getColumn(2).width = 20;

      const title = ws.addRow(["富詠運輸 — 平台收入摘要"]);
      title.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1e3a5f" } };
      title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFe8f0fe" } };
      ws.mergeCells("A1:B1");
      ws.addRow([]);

      const label = ws.addRow(["項目", "金額"]);
      label.eachCell(c => { c.fill = HEADER_FILL; c.font = HEADER_FONT; c.border = BORDER; });

      const items: [string, unknown][] = [
        ["總訂單筆數",      summaryRow["總訂單筆數"]],
        ["總運費營收(NT$)", summaryRow["總運費營收(NT$)"]],
        ["平台淨利(NT$)",   summaryRow["平台淨利(NT$)"]],
        ["司機總應付(NT$)", summaryRow["司機總應付(NT$)"]],
        ["平均抽成率(%)",   summaryRow["平均抽成率(%)"]],
        ["已結清筆數",      summaryRow["已結清筆數"]],
        ["待付款筆數",      summaryRow["待付款筆數"]],
        ["待付金額(NT$)",   summaryRow["待付金額(NT$)"]],
      ];
      items.forEach(([k, v], i) => {
        const r = ws.addRow([k, v]);
        r.eachCell(c => {
          c.border = BORDER;
          if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAFC" } };
        });
        r.getCell(1).font = { bold: true };
      });

      ws.addRow([]);
      ws.addRow([`報表生成時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`]);
    }

    /* ── 回傳 Excel ── */
    const label = month ?? (from ? from.substring(0, 7) : new Date().toISOString().substring(0, 7));
    const filename = `富詠運輸_財務報表_${label}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error("[order-settlements/export]", e);
    res.status(500).json({ error: String(e) });
  }
});

/** PATCH /api/order-settlements/:id/pay
 *  標記已付款給司機
 */
orderSettlementsRouter.patch("/:id/pay", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { payment_ref, notes } = req.body as { payment_ref?: string; notes?: string };

    const result = await db.execute(sql`
      UPDATE order_settlements
      SET payment_status = 'paid',
          paid_at        = NOW(),
          payment_ref    = ${payment_ref ?? null},
          notes          = COALESCE(${notes ?? null}, notes),
          updated_at     = NOW()
      WHERE id = ${id}
        AND payment_status != 'paid'
      RETURNING id, order_no, driver_payout, paid_at
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "記錄不存在或已付款" });
    }
    res.json({ ok: true, settlement: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** PATCH /api/order-settlements/:id/commission
 *  調整個別訂單抽成率（特殊合約）
 */
orderSettlementsRouter.patch("/:id/commission", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { commission_rate } = req.body as { commission_rate: number };

    if (!commission_rate || commission_rate < 0 || commission_rate > 100) {
      return res.status(400).json({ error: "commission_rate 需介於 0~100" });
    }

    const result = await db.execute(sql`
      UPDATE order_settlements
      SET commission_rate = ${commission_rate},
          updated_at      = NOW()
      WHERE id = ${id}
        AND payment_status = 'unpaid'
      RETURNING id, order_no, commission_rate, commission_amount, platform_revenue, driver_payout
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "記錄不存在或已付款（不可修改）" });
    }
    res.json({ ok: true, settlement: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** POST /api/order-settlements/batch-pay
 *  批次標記已付款給司機
 */
orderSettlementsRouter.post("/batch-pay", async (req, res) => {
  try {
    const { ids, payment_ref } = req.body as { ids: number[]; payment_ref?: string };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "需提供 ids 陣列" });
    }

    const result = await db.execute(sql`
      UPDATE order_settlements
      SET payment_status = 'paid',
          paid_at        = NOW(),
          payment_ref    = ${payment_ref ?? null},
          updated_at     = NOW()
      WHERE id = ANY(${ids}::int[])
        AND payment_status = 'unpaid'
      RETURNING id, order_no, driver_payout
    `);

    res.json({ ok: true, updated: result.rows.length, settlements: result.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
