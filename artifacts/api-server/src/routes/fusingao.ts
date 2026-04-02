import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const fusingaoRouter = Router();

// ── helper: parse a Shopee route note ─────────────────────────────────────
function parseNote(notes: string) {
  const routeId  = (notes.match(/路線：([^｜\s]+)/))?.[1] ?? null;
  const dock     = (notes.match(/碼頭：([^｜\s]+)/))?.[1] ?? null;
  const driverId = (notes.match(/司機ID：([0-9]+|—)/))?.[1] ?? null;
  const stations = (notes.match(/共 ([0-9]+) 站/))?.[1] ?? null;
  const prefix   = routeId ? (routeId.match(/^([A-Z0-9]+)-/))?.[1] ?? null : null;
  const stopList = (notes.match(/（(.+)）/s))?.[1]
    ?.split("→").map(s => s.trim()) ?? [];
  return { routeId, dock, driverId, stations: stations ? Number(stations) : stopList.length, prefix, stopList };
}

// GET /fusingao/summary
fusingaoRouter.get("/summary", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)                                                      AS total_routes,
        COUNT(CASE WHEN status='completed' OR completed_at IS NOT NULL THEN 1 END) AS completed,
        COUNT(CASE WHEN (status='pending' OR status='dispatched') AND completed_at IS NULL THEN 1 END) AS in_progress,
        COUNT(CASE WHEN driver_payment_status='paid' THEN 1 END)       AS billed,
        COUNT(CASE WHEN driver_payment_status<>'paid' OR driver_payment_status IS NULL THEN 1 END) AS unbilled,
        -- this month
        COUNT(CASE WHEN date_trunc('month', created_at)=date_trunc('month', NOW()) THEN 1 END) AS this_month_routes,
        -- last month
        COUNT(CASE WHEN date_trunc('month', created_at)=date_trunc('month', NOW()-interval '1 month') THEN 1 END) AS last_month_routes,
        -- total Shopee income (all time)
        COALESCE((
          SELECT SUM(pr.rate_per_trip)
          FROM orders o2
          JOIN route_prefix_rates pr ON pr.prefix=(regexp_match(o2.notes,'路線：([A-Z0-9]+)-'))[1]
          WHERE o2.notes LIKE '路線：%'
        ),0) AS total_shopee_income,
        -- this month income
        COALESCE((
          SELECT SUM(pr.rate_per_trip)
          FROM orders o2
          JOIN route_prefix_rates pr ON pr.prefix=(regexp_match(o2.notes,'路線：([A-Z0-9]+)-'))[1]
          WHERE o2.notes LIKE '路線：%'
            AND date_trunc('month',o2.created_at)=date_trunc('month',NOW())
        ),0) AS this_month_income
      FROM orders
      WHERE notes LIKE '路線：%'
    `);
    res.json({ ok: true, summary: rows.rows[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/routes?month=2026-04&status=all
fusingaoRouter.get("/routes", async (req, res) => {
  try {
    const { month, status } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    if (status === "completed")   extra += ` AND (o.status='completed' OR o.completed_at IS NOT NULL)`;
    if (status === "in_progress") extra += ` AND o.status NOT IN ('completed') AND o.completed_at IS NULL`;
    if (status === "unbilled")    extra += ` AND (o.driver_payment_status<>'paid' OR o.driver_payment_status IS NULL)`;

    const rows = await db.execute(sql`
      SELECT
        o.id,
        o.status,
        o.notes,
        o.completed_at,
        o.required_vehicle_type,
        o.driver_payment_status,
        o.created_at,
        o.arrival_notified_at,
        sd.name     AS driver_name,
        sd.vehicle_plate,
        pr.rate_per_trip  AS shopee_rate,
        pr.service_type,
        pr.route_od
      FROM orders o
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = (regexp_match(o.notes,'司機ID：([0-9]+)'))[1]
      WHERE o.notes LIKE '路線：%'
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);

    const routes = (rows.rows as any[]).map(r => ({
      ...r,
      ...parseNote(r.notes),
    }));
    res.json({ ok: true, routes });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/monthly  — monthly reconciliation
fusingaoRouter.get("/monthly", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      WITH route_months AS (
        SELECT
          to_char(o.created_at,'YYYY-MM')               AS month,
          to_char(o.created_at,'YYYY年MM月')             AS month_label,
          COUNT(*)                                       AS route_count,
          COUNT(CASE WHEN o.status='completed' OR o.completed_at IS NOT NULL THEN 1 END) AS completed_count,
          COUNT(CASE WHEN o.driver_payment_status='paid' THEN 1 END) AS billed_count,
          COALESCE(SUM(pr.rate_per_trip),0)              AS shopee_income,
          COALESCE(SUM(CASE WHEN o.driver_payment_status='paid' THEN pr.rate_per_trip ELSE 0 END),0) AS billed_amount,
          COALESCE(SUM(CASE WHEN o.driver_payment_status<>'paid' OR o.driver_payment_status IS NULL THEN pr.rate_per_trip ELSE 0 END),0) AS unbilled_amount
        FROM orders o
        LEFT JOIN route_prefix_rates pr
          ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
        WHERE o.notes LIKE '路線：%'
        GROUP BY to_char(o.created_at,'YYYY-MM'), to_char(o.created_at,'YYYY年MM月')
      ),
      penalty_months AS (
        SELECT
          LEFT(incident_date, 7)       AS month,
          COALESCE(SUM(fine_amount),0) AS penalty_deduction
        FROM shopee_penalties
        WHERE source = 'NDD過刷異常' AND fine_amount > 0
        GROUP BY LEFT(incident_date, 7)
      )
      SELECT
        rm.*,
        COALESCE(pm.penalty_deduction, 0) AS penalty_deduction
      FROM route_months rm
      LEFT JOIN penalty_months pm ON pm.month = rm.month
      ORDER BY rm.month DESC
    `);

    // For each month, also fetch route list
    const months = rows.rows as any[];
    const enriched = await Promise.all(months.map(async m => {
      const detail = await db.execute(sql`
        SELECT
          o.id, o.status, o.notes, o.completed_at, o.driver_payment_status,
          o.created_at, o.required_vehicle_type,
          sd.name AS driver_name, sd.vehicle_plate,
          pr.rate_per_trip AS shopee_rate,
          pr.service_type
        FROM orders o
        LEFT JOIN route_prefix_rates pr
          ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
        LEFT JOIN shopee_drivers sd
          ON sd.shopee_id = (regexp_match(o.notes,'司機ID：([0-9]+)'))[1]
        WHERE o.notes LIKE '路線：%'
          AND to_char(o.created_at,'YYYY-MM') = ${m.month}
        ORDER BY o.created_at ASC
      `);
      return {
        ...m,
        net_amount: Number(m.shopee_income) - Number(m.penalty_deduction),
        routes: (detail.rows as any[]).map(r => ({ ...r, ...parseNote(r.notes) })),
      };
    }));

    res.json({ ok: true, months: enriched });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/complete — mark a route as completed
fusingaoRouter.put("/routes/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body as { completed: boolean };
    if (completed) {
      await db.execute(sql`
        UPDATE orders SET status='completed', completed_at=NOW(), updated_at=NOW()
        WHERE id=${Number(id)} AND notes LIKE '路線：%'
      `);
    } else {
      await db.execute(sql`
        UPDATE orders SET status='pending', completed_at=NULL, updated_at=NOW()
        WHERE id=${Number(id)} AND notes LIKE '路線：%'
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/billing — mark billing status
fusingaoRouter.put("/routes/:id/billing", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    await db.execute(sql`
      UPDATE orders SET driver_payment_status=${status}, updated_at=NOW()
      WHERE id=${Number(id)} AND notes LIKE '路線：%'
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/monthly/:month/bill-all — mark all in a month as billed
fusingaoRouter.put("/monthly/:month/bill-all", async (req, res) => {
  try {
    const { month } = req.params;
    await db.execute(sql`
      UPDATE orders SET driver_payment_status='paid', updated_at=NOW()
      WHERE notes LIKE '路線：%'
        AND to_char(created_at,'YYYY-MM') = ${month}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
