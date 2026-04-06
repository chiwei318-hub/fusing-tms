import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
