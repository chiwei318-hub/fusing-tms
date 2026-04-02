import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

function hashPw(pw: string, salt?: string) {
  const s = salt ?? randomBytes(16).toString("hex");
  return `${s}:${createHash("sha256").update(s + pw).digest("hex")}`;
}

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

// ════════════════════════════════════════════════════════════════════════════
//  FLEET MANAGEMENT (admin creates / manages sub-contractor fleet accounts)
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/fleets
fusingaoRouter.get("/fleets", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        f.id, f.fleet_name, f.contact_name, f.contact_phone, f.username,
        f.vehicle_types, f.notes, f.is_active, f.created_at,
        COUNT(o.id)                                               AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL) AS completed_routes,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status = 'paid')  AS billed_routes,
        COALESCE(SUM(pr.rate_per_trip),0)                            AS total_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip)),0) AS fleet_payout
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.notes LIKE '路線：%'
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      GROUP BY f.id
      ORDER BY f.fleet_name
    `);
    res.json({ ok: true, fleets: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets — create fleet account
fusingaoRouter.post("/fleets", async (req, res) => {
  try {
    const { fleet_name, contact_name, contact_phone, username, password, vehicle_types, notes, rate_override } = req.body;
    if (!fleet_name || !username || !password)
      return res.status(400).json({ ok: false, error: "車隊名稱、帳號、密碼為必填" });
    const hashed = hashPw(password);
    const [result] = await db.execute(sql`
      INSERT INTO fusingao_fleets (fleet_name, contact_name, contact_phone, username, password, vehicle_types, notes, rate_override)
      VALUES (${fleet_name}, ${contact_name ?? null}, ${contact_phone ?? null}, ${username}, ${hashed}, ${vehicle_types ?? null}, ${notes ?? null}, ${rate_override ?? null})
      RETURNING id, fleet_name, username, contact_name, contact_phone
    `).then(r => r.rows as any[]);
    res.json({ ok: true, fleet: result });
  } catch (err: any) {
    if (err.message?.includes("unique")) return res.status(409).json({ ok: false, error: "帳號已存在" });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id — update fleet
fusingaoRouter.put("/fleets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleet_name, contact_name, contact_phone, vehicle_types, notes, is_active, rate_override, password } = req.body;
    const pwUpdate = password ? sql`, password=${hashPw(password)}` : sql``;
    await db.execute(sql`
      UPDATE fusingao_fleets SET
        fleet_name    = ${fleet_name},
        contact_name  = ${contact_name ?? null},
        contact_phone = ${contact_phone ?? null},
        vehicle_types = ${vehicle_types ?? null},
        notes         = ${notes ?? null},
        is_active     = ${is_active ?? true},
        rate_override = ${rate_override ?? null},
        updated_at    = NOW()
        ${pwUpdate}
      WHERE id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/routes — routes grabbed by this fleet
fusingaoRouter.get("/fleets/:id/routes", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    const rows = await db.execute(sql`
      SELECT
        o.id, o.status, o.notes, o.completed_at, o.driver_payment_status,
        o.created_at, o.fleet_grabbed_at, o.fleet_completed_at,
        sd.name AS driver_name, sd.vehicle_plate,
        pr.rate_per_trip AS shopee_rate,
        COALESCE(f.rate_override, pr.rate_per_trip) AS fleet_rate,
        pr.service_type
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = (regexp_match(o.notes,'司機ID：([0-9]+)'))[1]
      WHERE o.notes LIKE '路線：%' AND o.fusingao_fleet_id = ${Number(id)}
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);
    res.json({ ok: true, routes: (rows.rows as any[]).map(r => ({ ...r, ...parseNote(r.notes) })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/monthly — per-fleet monthly billing
fusingaoRouter.get("/fleets/:id/monthly", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.execute(sql`
      SELECT
        to_char(o.created_at,'YYYY-MM')    AS month,
        to_char(o.created_at,'YYYY年MM月') AS month_label,
        COUNT(*)                           AS route_count,
        COUNT(o.fleet_completed_at)        AS completed_count,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status='paid') AS billed_count,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip)), 0) AS fleet_payout,
        COALESCE(SUM(CASE WHEN o.driver_payment_status='paid' THEN COALESCE(f.rate_override, pr.rate_per_trip) ELSE 0 END), 0) AS billed_amount
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%' AND o.fusingao_fleet_id = ${Number(id)}
      GROUP BY 1, 2 ORDER BY 1 DESC
    `);
    res.json({ ok: true, months: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  FLEET GRAB SYSTEM
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/available — ungrabbed routes visible to all fleets
fusingaoRouter.get("/available", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    let extra = "";
    if (month) extra += ` AND to_char(o.created_at,'YYYY-MM') = '${month}'`;
    const rows = await db.execute(sql`
      SELECT
        o.id, o.status, o.notes, o.created_at,
        pr.rate_per_trip AS shopee_rate, pr.service_type, pr.route_od,
        sd.name AS driver_name, sd.vehicle_plate
      FROM orders o
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      LEFT JOIN shopee_drivers sd
        ON sd.shopee_id = (regexp_match(o.notes,'司機ID：([0-9]+)'))[1]
      WHERE o.notes LIKE '路線：%' AND o.fusingao_fleet_id IS NULL
      ${sql.raw(extra)}
      ORDER BY o.created_at DESC
    `);
    res.json({ ok: true, routes: (rows.rows as any[]).map(r => ({ ...r, ...parseNote(r.notes) })) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/routes/:id/grab — fleet grabs a route
fusingaoRouter.post("/routes/:id/grab", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId } = req.body as { fleetId: number };
    if (!fleetId) return res.status(400).json({ ok: false, error: "缺少 fleetId" });
    // Atomic grab: only succeed if not already grabbed
    const result = await db.execute(sql`
      UPDATE orders SET
        fusingao_fleet_id = ${fleetId},
        fleet_grabbed_at  = NOW(),
        updated_at        = NOW()
      WHERE id = ${Number(id)}
        AND notes LIKE '路線：%'
        AND fusingao_fleet_id IS NULL
      RETURNING id
    `);
    if ((result.rows as any[]).length === 0)
      return res.status(409).json({ ok: false, error: "路線已被搶走，請選擇其他路線" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /fusingao/routes/:id/grab — release a grabbed route
fusingaoRouter.delete("/routes/:id/grab", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId } = req.body as { fleetId: number };
    await db.execute(sql`
      UPDATE orders SET
        fusingao_fleet_id = NULL,
        fleet_grabbed_at  = NULL,
        updated_at        = NOW()
      WHERE id = ${Number(id)} AND fusingao_fleet_id = ${fleetId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/fleet-complete — fleet marks route as completed
fusingaoRouter.put("/routes/:id/fleet-complete", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId, completed } = req.body as { fleetId: number; completed: boolean };
    if (completed) {
      await db.execute(sql`
        UPDATE orders SET fleet_completed_at=NOW(), status='completed', completed_at=NOW(), updated_at=NOW()
        WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
      `);
    } else {
      await db.execute(sql`
        UPDATE orders SET fleet_completed_at=NULL, status='pending', completed_at=NULL, updated_at=NOW()
        WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
      `);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id/monthly/:month/bill-all
fusingaoRouter.put("/fleets/:id/monthly/:month/bill-all", async (req, res) => {
  try {
    const { id, month } = req.params;
    await db.execute(sql`
      UPDATE orders SET driver_payment_status='paid', updated_at=NOW()
      WHERE notes LIKE '路線：%'
        AND fusingao_fleet_id = ${Number(id)}
        AND to_char(created_at,'YYYY-MM') = ${month}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
