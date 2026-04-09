/**
 * franchiseSettlements.ts — 加盟主清算 API
 *
 * 功能：
 *   1. GET  /api/franchise-settlements/config        取得費率設定
 *   2. PUT  /api/franchise-settlements/config        更新費率設定
 *   3. GET  /api/franchise-settlements/preview       預覽計算結果（不寫 DB）
 *   4. POST /api/franchise-settlements/calculate/:orderId  計算並寫入單筆結算
 *   5. POST /api/franchise-settlements/batch-calculate     批次計算
 *   6. GET  /api/franchise-settlements                     查詢清算列表
 *   7. GET  /api/franchise-settlements/summary             匯總統計
 *   8. GET  /api/franchise-settlements/driver/:driverId    每位司機每趟薪資（ATOMS 用）
 *   9. PATCH /api/franchise-settlements/:id/pay-franchisee 標記撥款給加盟主
 *  10. POST /api/franchise-settlements/push-atoms          推送淨分潤到 ATOMS
 */

import { Router }          from "express";
import { db }              from "@workspace/db";
import { sql, SQL }        from "drizzle-orm";
import { calculateSettlement } from "../lib/settlementEngine";
import { broadcastWebhook }    from "./webhooks";

export const franchiseSettlementsRouter = Router();

// ─── 費率設定讀取 ─────────────────────────────────────────────────────────────
async function getRates(): Promise<{
  commissionRate: number;
  insuranceRate:  number;
  otherFeeRate:   number;
  otherFeeFixed:  number;
}> {
  const result = await db.execute(sql`
    SELECT key, value FROM pricing_config
    WHERE key IN ('default_commission_rate','insurance_rate','other_fee_rate','other_fee_fixed')
  `);
  const map: Record<string, number> = {};
  for (const row of result.rows as any[]) {
    map[row.key] = parseFloat(row.value) || 0;
  }
  return {
    commissionRate: map["default_commission_rate"] ?? 15,
    insuranceRate:  map["insurance_rate"]          ?? 1,
    otherFeeRate:   map["other_fee_rate"]          ?? 0.5,
    otherFeeFixed:  map["other_fee_fixed"]         ?? 0,
  };
}

// ─── 1. GET /config ──────────────────────────────────────────────────────────
franchiseSettlementsRouter.get("/config", async (_req, res) => {
  try {
    const rates = await getRates();
    res.json(rates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 2. PUT /config ──────────────────────────────────────────────────────────
franchiseSettlementsRouter.put("/config", async (req, res) => {
  try {
    const { commissionRate, insuranceRate, otherFeeRate, otherFeeFixed } =
      req.body as Record<string, number>;

    const updates: Array<{ key: string; value: string; label: string }> = [];
    if (commissionRate != null) updates.push({ key: "default_commission_rate", value: String(commissionRate), label: "系統服務費率 (%)" });
    if (insuranceRate  != null) updates.push({ key: "insurance_rate",          value: String(insuranceRate),  label: "保險費率 (%)" });
    if (otherFeeRate   != null) updates.push({ key: "other_fee_rate",          value: String(otherFeeRate),   label: "其他手續費率 (%)" });
    if (otherFeeFixed  != null) updates.push({ key: "other_fee_fixed",         value: String(otherFeeFixed),  label: "固定手續費 (NT$)" });

    for (const u of updates) {
      await db.execute(sql`
        INSERT INTO pricing_config (key, value, label, updated_at)
        VALUES (${u.key}, ${u.value}, ${u.label}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${u.value}, updated_at = NOW()
      `);
    }

    res.json({ ok: true, updated: updates.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 3. GET /preview ─────────────────────────────────────────────────────────
franchiseSettlementsRouter.get("/preview", async (req, res) => {
  try {
    const totalFreight   = parseFloat(req.query.total_freight   as string ?? "0");
    const rates          = await getRates();
    const commissionRate = parseFloat(req.query.commission_rate as string ?? String(rates.commissionRate));
    const insuranceRate  = parseFloat(req.query.insurance_rate  as string ?? String(rates.insuranceRate));
    const otherFeeRate   = parseFloat(req.query.other_fee_rate  as string ?? String(rates.otherFeeRate));
    const otherFeeFixed  = parseFloat(req.query.other_fee_fixed as string ?? String(rates.otherFeeFixed));

    if (isNaN(totalFreight) || totalFreight < 0) {
      return res.status(400).json({ error: "total_freight 必須 >= 0" });
    }

    const result = calculateSettlement({ totalFreight, commissionRate, insuranceRate, otherFeeRate, otherFeeFixed });
    res.json({ ...result, rates: { commissionRate, insuranceRate, otherFeeRate, otherFeeFixed } });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 4. POST /calculate/:orderId ─────────────────────────────────────────────
franchiseSettlementsRouter.post("/calculate/:orderId", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ error: "無效訂單 ID" });

    // 查訂單基本資料
    const orderRows = await db.execute(sql`
      SELECT o.id, o.order_no, o.total_fee, o.driver_id, o.status,
             d.franchisee_id, d.name AS driver_name, d.phone AS driver_phone,
             f.name AS franchisee_name, f.commission_rate AS franchisee_commission_rate
      FROM orders o
      LEFT JOIN drivers     d ON d.id = o.driver_id
      LEFT JOIN franchisees f ON f.id = d.franchisee_id
      WHERE o.id = ${orderId}
      LIMIT 1
    `);
    if (!orderRows.rows.length) return res.status(404).json({ error: "訂單不存在" });
    const order = orderRows.rows[0] as any;

    const totalFreight  = parseFloat(order.total_fee ?? "0");
    const systemRates   = await getRates();
    const commissionRate = req.body.commission_rate ?? systemRates.commissionRate;
    const insuranceRate  = req.body.insurance_rate  ?? systemRates.insuranceRate;
    const otherFeeRate   = req.body.other_fee_rate  ?? systemRates.otherFeeRate;
    const otherFeeFixed  = req.body.other_fee_fixed ?? systemRates.otherFeeFixed;

    const result = calculateSettlement({ totalFreight, commissionRate, insuranceRate, otherFeeRate, otherFeeFixed });

    // Upsert order_settlements
    const upsert = await db.execute(sql`
      INSERT INTO order_settlements (
        order_id, order_no, driver_id,
        total_amount, commission_rate,
        insurance_rate, insurance_fee,
        other_fee_rate, other_handling_fee,
        franchisee_id, franchisee_payout,
        franchisee_payment_status,
        payment_status, created_at, updated_at
      )
      VALUES (
        ${orderId}, ${order.order_no}, ${order.driver_id ?? null},
        ${result.totalFreight}, ${commissionRate},
        ${insuranceRate}, ${result.insuranceFee},
        ${otherFeeRate}, ${result.otherHandlingFee},
        ${order.franchisee_id ?? null}, ${result.franchiseePayout},
        'unpaid',
        'unpaid', NOW(), NOW()
      )
      ON CONFLICT (order_id) DO UPDATE SET
        total_amount           = EXCLUDED.total_amount,
        commission_rate        = EXCLUDED.commission_rate,
        insurance_rate         = EXCLUDED.insurance_rate,
        insurance_fee          = EXCLUDED.insurance_fee,
        other_fee_rate         = EXCLUDED.other_fee_rate,
        other_handling_fee     = EXCLUDED.other_handling_fee,
        franchisee_id          = EXCLUDED.franchisee_id,
        franchisee_payout      = EXCLUDED.franchisee_payout,
        updated_at             = NOW()
      RETURNING *
    `);

    const settlement = upsert.rows[0] as any;

    res.json({
      ok: true,
      settlement,
      calculation: result,
      order: {
        id: order.id,
        order_no: order.order_no,
        driver_name: order.driver_name,
        franchisee_name: order.franchisee_name,
      },
    });
  } catch (e) {
    console.error("[franchise-settlements/calculate]", e);
    res.status(500).json({ error: String(e) });
  }
});

// ─── 5. POST /batch-calculate ────────────────────────────────────────────────
franchiseSettlementsRouter.post("/batch-calculate", async (req, res) => {
  try {
    const { order_ids, from_date, to_date } = req.body as {
      order_ids?: number[];
      from_date?: string;
      to_date?: string;
    };

    const rates = await getRates();
    let orderFilter: SQL;

    if (order_ids?.length) {
      orderFilter = sql`o.id = ANY(${order_ids}::int[])`;
    } else if (from_date || to_date) {
      const parts: SQL[] = [];
      if (from_date) parts.push(sql`o.pickup_date >= ${from_date}::date`);
      if (to_date)   parts.push(sql`o.pickup_date <= ${to_date}::date`);
      orderFilter = sql.join(parts, sql` AND `);
    } else {
      return res.status(400).json({ error: "需提供 order_ids 或日期範圍" });
    }

    const orders = await db.execute(sql`
      SELECT o.id, o.order_no, o.total_fee, o.driver_id,
             d.franchisee_id
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE o.status IN ('delivered','settled')
        AND (o.total_fee IS NOT NULL AND o.total_fee > 0)
        AND ${orderFilter}
    `);

    let inserted = 0, errors = 0;
    for (const order of orders.rows as any[]) {
      try {
        const totalFreight = parseFloat(order.total_fee ?? "0");
        const result = calculateSettlement({ totalFreight, ...rates });
        await db.execute(sql`
          INSERT INTO order_settlements (
            order_id, order_no, driver_id, total_amount, commission_rate,
            insurance_rate, insurance_fee, other_fee_rate, other_handling_fee,
            franchisee_id, franchisee_payout, franchisee_payment_status,
            payment_status, created_at, updated_at
          )
          VALUES (
            ${order.id}, ${order.order_no}, ${order.driver_id ?? null},
            ${result.totalFreight}, ${rates.commissionRate},
            ${rates.insuranceRate}, ${result.insuranceFee},
            ${rates.otherFeeRate}, ${result.otherHandlingFee},
            ${order.franchisee_id ?? null}, ${result.franchiseePayout},
            'unpaid', 'unpaid', NOW(), NOW()
          )
          ON CONFLICT (order_id) DO UPDATE SET
            insurance_rate     = EXCLUDED.insurance_rate,
            insurance_fee      = EXCLUDED.insurance_fee,
            other_fee_rate     = EXCLUDED.other_fee_rate,
            other_handling_fee = EXCLUDED.other_handling_fee,
            franchisee_id      = EXCLUDED.franchisee_id,
            franchisee_payout  = EXCLUDED.franchisee_payout,
            updated_at         = NOW()
        `);
        inserted++;
      } catch { errors++; }
    }

    res.json({ ok: true, processed: orders.rows.length, inserted, errors });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 6. GET / — 查詢清算列表 ─────────────────────────────────────────────────
franchiseSettlementsRouter.get("/", async (req, res) => {
  try {
    const {
      franchisee_id,
      driver_id,
      franchisee_payment_status,
      payment_status,
      from, to,
      limit = "50", offset = "0",
    } = req.query as Record<string, string>;

    const conds: SQL[] = [];
    if (franchisee_id)             conds.push(sql`s.franchisee_id = ${parseInt(franchisee_id)}`);
    if (driver_id)                 conds.push(sql`s.driver_id = ${parseInt(driver_id)}`);
    if (franchisee_payment_status) conds.push(sql`s.franchisee_payment_status = ${franchisee_payment_status}`);
    if (payment_status)            conds.push(sql`s.payment_status = ${payment_status}`);
    if (from) conds.push(sql`s.created_at >= ${from}::timestamptz`);
    if (to)   conds.push(sql`s.created_at <= ${to}::timestamptz`);
    const where = conds.length ? sql`AND ${sql.join(conds, sql` AND `)}` : sql``;

    const rows = await db.execute(sql`
      SELECT
        s.id,
        s.order_id,
        s.order_no,
        s.driver_id,
        d.name                              AS driver_name,
        d.phone                             AS driver_phone,
        d.vehicle_type                      AS driver_vehicle_type,
        s.franchisee_id,
        f.name                              AS franchisee_name,
        f.code                              AS franchisee_code,
        o.pickup_address,
        o.delivery_address,
        o.completed_at,
        o.pickup_date,
        s.total_amount::numeric             AS total_freight,
        s.commission_rate::numeric          AS commission_rate,
        s.commission_amount::numeric        AS system_commission,
        s.insurance_rate::numeric           AS insurance_rate,
        s.insurance_fee::numeric            AS insurance_fee,
        s.other_fee_rate::numeric           AS other_fee_rate,
        s.other_handling_fee::numeric       AS other_handling_fee,
        (s.commission_amount + s.insurance_fee + s.other_handling_fee)::numeric
                                            AS total_deductions,
        s.franchisee_payout::numeric        AS franchisee_payout,
        s.payment_status,
        s.franchisee_payment_status,
        s.franchisee_paid_at,
        s.franchisee_payment_ref,
        s.atoms_pushed_at,
        s.created_at
      FROM order_settlements s
      LEFT JOIN drivers     d ON d.id = s.driver_id
      LEFT JOIN franchisees f ON f.id = s.franchisee_id
      LEFT JOIN orders      o ON o.id = s.order_id
      WHERE 1=1 ${where}
      ORDER BY s.created_at DESC
      LIMIT  ${parseInt(limit)}
      OFFSET ${parseInt(offset)}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM order_settlements s
      WHERE 1=1 ${where}
    `);

    res.json({ data: rows.rows, total: (countResult.rows[0] as any)?.total ?? 0 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 7. GET /summary ─────────────────────────────────────────────────────────
franchiseSettlementsRouter.get("/summary", async (req, res) => {
  try {
    const { franchisee_id, from, to, month } = req.query as Record<string, string>;
    const conds: SQL[] = [];
    if (franchisee_id) conds.push(sql`franchisee_id = ${parseInt(franchisee_id)}`);
    if (month) conds.push(sql`TO_CHAR(created_at,'YYYY-MM') = ${month}`);
    if (from)  conds.push(sql`created_at >= ${from}::timestamptz`);
    if (to)    conds.push(sql`created_at <= ${to}::timestamptz`);
    const where = conds.length ? sql`AND ${sql.join(conds, sql` AND `)}` : sql``;

    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                   AS total_orders,
        COALESCE(SUM(total_amount),0)::numeric                         AS total_freight,
        COALESCE(SUM(commission_amount),0)::numeric                    AS total_system_commission,
        COALESCE(SUM(insurance_fee),0)::numeric                        AS total_insurance_fee,
        COALESCE(SUM(other_handling_fee),0)::numeric                   AS total_other_handling_fee,
        COALESCE(SUM(commission_amount + insurance_fee + other_handling_fee),0)::numeric
                                                                       AS total_deductions,
        COALESCE(SUM(franchisee_payout),0)::numeric                    AS total_franchisee_payout,
        COUNT(*) FILTER (WHERE franchisee_payment_status = 'unpaid')::int AS unpaid_count,
        COUNT(*) FILTER (WHERE franchisee_payment_status = 'paid')::int   AS paid_count,
        COALESCE(SUM(franchisee_payout) FILTER (WHERE franchisee_payment_status='unpaid'),0)::numeric
                                                                       AS pending_payout
      FROM order_settlements
      WHERE 1=1 ${where}
    `);

    res.json(result.rows[0] ?? {});
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 8. GET /driver/:driverId — 每位司機每趟薪資分配（ATOMS 用）─────────────
franchiseSettlementsRouter.get("/driver/:driverId", async (req, res) => {
  try {
    const driverId = parseInt(req.params.driverId);
    const { from, to, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const conds: SQL[] = [sql`s.driver_id = ${driverId}`];
    if (from) conds.push(sql`s.created_at >= ${from}::timestamptz`);
    if (to)   conds.push(sql`s.created_at <= ${to}::timestamptz`);
    const where = sql.join(conds, sql` AND `);

    const rows = await db.execute(sql`
      SELECT
        s.order_id,
        s.order_no,
        o.pickup_date,
        o.pickup_address,
        o.delivery_address,
        d.name                             AS driver_name,
        d.phone                            AS driver_phone,
        d.vehicle_type,
        f.name                             AS franchisee_name,
        f.code                             AS franchisee_code,
        s.total_amount::numeric            AS total_freight,
        s.commission_rate::numeric         AS commission_rate,
        s.commission_amount::numeric       AS system_commission,
        s.insurance_fee::numeric           AS insurance_fee,
        s.other_handling_fee::numeric      AS other_handling_fee,
        (s.commission_amount + s.insurance_fee + s.other_handling_fee)::numeric
                                           AS total_deductions,
        s.franchisee_payout::numeric       AS franchisee_payout,
        s.driver_payout::numeric           AS driver_payout_reference,
        s.franchisee_payment_status,
        s.franchisee_paid_at,
        s.created_at                       AS settled_at
      FROM order_settlements s
      LEFT JOIN drivers     d ON d.id = s.driver_id
      LEFT JOIN franchisees f ON f.id = s.franchisee_id
      LEFT JOIN orders      o ON o.id = s.order_id
      WHERE ${where}
      ORDER BY s.created_at DESC
      LIMIT  ${parseInt(limit)}
      OFFSET ${parseInt(offset)}
    `);

    // 合計
    const summary = await db.execute(sql`
      SELECT
        COUNT(*)::int                    AS trip_count,
        SUM(total_amount)::numeric       AS total_freight,
        SUM(franchisee_payout)::numeric  AS total_franchisee_payout,
        SUM(commission_amount + insurance_fee + other_handling_fee)::numeric
                                         AS total_deductions
      FROM order_settlements s
      WHERE ${where}
    `);

    res.json({
      driver_id:  driverId,
      trips:      rows.rows,
      summary:    summary.rows[0] ?? {},
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 9. PATCH /:id/pay-franchisee — 標記撥款給加盟主 ────────────────────────
franchiseSettlementsRouter.patch("/:id/pay-franchisee", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { payment_ref, notes } = req.body as { payment_ref?: string; notes?: string };

    const result = await db.execute(sql`
      UPDATE order_settlements
      SET franchisee_payment_status = 'paid',
          franchisee_paid_at        = NOW(),
          franchisee_payment_ref    = ${payment_ref ?? null},
          notes                     = COALESCE(${notes ?? null}, notes),
          updated_at                = NOW()
      WHERE id = ${id}
        AND franchisee_payment_status != 'paid'
      RETURNING id, order_no, franchisee_payout, franchisee_paid_at
    `);

    if (!result.rows.length) {
      return res.status(404).json({ error: "記錄不存在或已撥款" });
    }
    res.json({ ok: true, settlement: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 10. POST /push-atoms — 推送淨分潤到 ATOMS 加盟商後台 ───────────────────
franchiseSettlementsRouter.post("/push-atoms", async (req, res) => {
  try {
    const { settlement_ids, from_date, to_date } = req.body as {
      settlement_ids?: number[];
      from_date?: string;
      to_date?: string;
    };

    let filter: SQL;
    if (settlement_ids?.length) {
      filter = sql`s.id = ANY(${settlement_ids}::int[])`;
    } else if (from_date || to_date) {
      const parts: SQL[] = [];
      if (from_date) parts.push(sql`s.created_at >= ${from_date}::timestamptz`);
      if (to_date)   parts.push(sql`s.created_at <= ${to_date}::timestamptz`);
      filter = sql.join(parts, sql` AND `);
    } else {
      // 預設：推送所有尚未推送的
      filter = sql`s.atoms_pushed_at IS NULL`;
    }

    const rows = await db.execute(sql`
      SELECT
        s.id            AS settlement_id,
        s.order_id,
        s.order_no,
        s.driver_id,
        d.name          AS driver_name,
        d.phone         AS driver_phone,
        d.vehicle_type,
        s.franchisee_id,
        f.name          AS franchisee_name,
        f.code          AS franchisee_code,
        o.pickup_date,
        o.pickup_address,
        o.delivery_address,
        s.total_amount::numeric                       AS total_freight,
        s.commission_amount::numeric                  AS system_commission,
        s.insurance_fee::numeric                      AS insurance_fee,
        s.other_handling_fee::numeric                 AS other_handling_fee,
        (s.commission_amount + s.insurance_fee + s.other_handling_fee)::numeric
                                                      AS total_deductions,
        s.franchisee_payout::numeric                  AS franchisee_payout,
        s.franchisee_payment_status,
        s.created_at                                  AS settled_at
      FROM order_settlements s
      LEFT JOIN drivers     d ON d.id = s.driver_id
      LEFT JOIN franchisees f ON f.id = s.franchisee_id
      LEFT JOIN orders      o ON o.id = s.order_id
      WHERE ${filter}
      ORDER BY s.created_at DESC
      LIMIT 200
    `);

    let pushed = 0, failed = 0;

    for (const row of rows.rows as any[]) {
      try {
        const payload = {
          settlement_id:       row.settlement_id,
          order_id:            row.order_id,
          order_no:            row.order_no,
          driver: {
            id:           row.driver_id,
            name:         row.driver_name,
            phone:        row.driver_phone,
            vehicle_type: row.vehicle_type,
          },
          franchisee: {
            id:   row.franchisee_id,
            name: row.franchisee_name,
            code: row.franchisee_code,
          },
          trip: {
            date:             row.pickup_date,
            pickup_address:   row.pickup_address,
            delivery_address: row.delivery_address,
          },
          settlement: {
            total_freight:      Number(row.total_freight),
            system_commission:  Number(row.system_commission),
            insurance_fee:      Number(row.insurance_fee),
            other_handling_fee: Number(row.other_handling_fee),
            total_deductions:   Number(row.total_deductions),
            franchisee_payout:  Number(row.franchisee_payout),
            payment_status:     row.franchisee_payment_status,
          },
          settled_at:  row.settled_at,
          pushed_at:   new Date().toISOString(),
        };

        await broadcastWebhook("settlement.completed", payload);

        await db.execute(sql`
          UPDATE order_settlements
          SET atoms_pushed_at = NOW(), updated_at = NOW()
          WHERE id = ${row.settlement_id}
        `);
        pushed++;
      } catch { failed++; }
    }

    res.json({ ok: true, total: rows.rows.length, pushed, failed });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── 11. POST /auto-calculate-on-complete (內部使用) ─────────────────────────
/**
 * 訂單完成時自動計算並寫入清算記錄（由 orders.ts 的 delivered 觸發器呼叫）
 */
export async function autoCalculateSettlement(orderId: number): Promise<void> {
  try {
    const orderRows = await db.execute(sql`
      SELECT o.id, o.order_no, o.total_fee, o.driver_id,
             d.franchisee_id, d.name AS driver_name
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE o.id = ${orderId}
      LIMIT 1
    `);
    if (!orderRows.rows.length) return;
    const order = orderRows.rows[0] as any;
    const totalFreight = parseFloat(order.total_fee ?? "0");
    if (totalFreight <= 0) return;

    const rates = await getRates();
    const result = calculateSettlement({ totalFreight, ...rates });

    await db.execute(sql`
      INSERT INTO order_settlements (
        order_id, order_no, driver_id, total_amount, commission_rate,
        insurance_rate, insurance_fee, other_fee_rate, other_handling_fee,
        franchisee_id, franchisee_payout, franchisee_payment_status,
        payment_status, created_at, updated_at
      )
      VALUES (
        ${orderId}, ${order.order_no}, ${order.driver_id ?? null},
        ${result.totalFreight}, ${rates.commissionRate},
        ${rates.insuranceRate}, ${result.insuranceFee},
        ${rates.otherFeeRate}, ${result.otherHandlingFee},
        ${order.franchisee_id ?? null}, ${result.franchiseePayout},
        'unpaid', 'unpaid', NOW(), NOW()
      )
      ON CONFLICT (order_id) DO UPDATE SET
        insurance_rate     = EXCLUDED.insurance_rate,
        insurance_fee      = EXCLUDED.insurance_fee,
        other_fee_rate     = EXCLUDED.other_fee_rate,
        other_handling_fee = EXCLUDED.other_handling_fee,
        franchisee_id      = EXCLUDED.franchisee_id,
        franchisee_payout  = EXCLUDED.franchisee_payout,
        updated_at         = NOW()
    `);

    // 自動推送 settlement.completed 事件到 ATOMS
    setImmediate(async () => {
      try {
        await broadcastWebhook("settlement.completed", {
          order_id:   orderId,
          order_no:   order.order_no,
          driver_id:  order.driver_id,
          driver_name:order.driver_name,
          franchisee_id: order.franchisee_id ?? null,
          settlement: {
            total_freight:     result.totalFreight,
            system_commission: result.systemCommission,
            insurance_fee:     result.insuranceFee,
            other_handling_fee:result.otherHandlingFee,
            total_deductions:  result.totalDeductions,
            franchisee_payout: result.franchiseePayout,
          },
          calculated_at: new Date().toISOString(),
        });
        await db.execute(sql`
          UPDATE order_settlements SET atoms_pushed_at = NOW() WHERE order_id = ${orderId}
        `);
      } catch (e) {
        console.error("[autoCalculateSettlement] ATOMS push failed:", e);
      }
    });
  } catch (e) {
    console.error("[autoCalculateSettlement] error:", e);
  }
}
