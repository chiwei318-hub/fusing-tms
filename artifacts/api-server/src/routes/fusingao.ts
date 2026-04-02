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

// ════════════════════════════════════════════════════════════════════════════
//  FLEET DRIVER MANAGEMENT (Layer 3 → Layer 4: fleet manages its own drivers)
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/fleets/:id/drivers
fusingaoRouter.get("/fleets/:id/drivers", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.execute(sql`
      SELECT
        fd.*,
        COUNT(o.id)                                                  AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL)  AS completed_routes,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip) * (1 - COALESCE(f.commission_rate,15)/100.0)), 0) AS total_earnings
      FROM fleet_drivers fd
      LEFT JOIN fusingao_fleets f ON f.id = ${Number(id)}
      LEFT JOIN orders o ON o.fleet_driver_id = fd.id
      LEFT JOIN route_prefix_rates pr
        ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE fd.fleet_id = ${Number(id)}
      GROUP BY fd.id, fd.fleet_id, fd.name, fd.phone, fd.id_number, fd.vehicle_plate,
               fd.vehicle_type, fd.line_id, fd.notes, fd.is_active, fd.created_at, fd.updated_at
      ORDER BY fd.is_active DESC, fd.name
    `);
    res.json({ ok: true, drivers: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /fusingao/fleets/:id/drivers
fusingaoRouter.post("/fleets/:id/drivers", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "司機姓名為必填" });
    const [row] = await db.execute(sql`
      INSERT INTO fleet_drivers (fleet_id, name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes)
      VALUES (${Number(id)}, ${name}, ${phone??null}, ${id_number??null}, ${vehicle_plate??null}, ${vehicle_type??"一般"}, ${line_id??null}, ${notes??null})
      RETURNING *
    `).then(r => r.rows as any[]);
    res.json({ ok: true, driver: row });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/fleets/:id/drivers/:driverId
fusingaoRouter.put("/fleets/:id/drivers/:driverId", async (req, res) => {
  try {
    const { id, driverId } = req.params;
    const { name, phone, id_number, vehicle_plate, vehicle_type, line_id, notes, is_active } = req.body;
    await db.execute(sql`
      UPDATE fleet_drivers SET
        name          = ${name},
        phone         = ${phone??null},
        id_number     = ${id_number??null},
        vehicle_plate = ${vehicle_plate??null},
        vehicle_type  = ${vehicle_type??"一般"},
        line_id       = ${line_id??null},
        notes         = ${notes??null},
        is_active     = ${is_active??true},
        updated_at    = NOW()
      WHERE id = ${Number(driverId)} AND fleet_id = ${Number(id)}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/assign-driver — fleet assigns route to one of its drivers
fusingaoRouter.put("/routes/:id/assign-driver", async (req, res) => {
  try {
    const { id } = req.params;
    const { fleetId, driverId } = req.body as { fleetId: number; driverId: number | null };
    await db.execute(sql`
      UPDATE orders SET fleet_driver_id=${driverId??null}, updated_at=NOW()
      WHERE id=${Number(id)} AND fusingao_fleet_id=${fleetId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  DISPATCH MANAGEMENT  — weekly route × driver grid
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/dispatch?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
fusingaoRouter.get("/dispatch", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;
    // Default: current week Mon–Sun in Taiwan time (UTC+8)
    const nowTW = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const dowTW = nowTW.getUTCDay() === 0 ? 6 : nowTW.getUTCDay() - 1; // Mon=0
    const monTW = new Date(nowTW); monTW.setUTCDate(nowTW.getUTCDate() - dowTW);
    const sunTW = new Date(monTW); sunTW.setUTCDate(monTW.getUTCDate() + 6);
    const start = startDate ?? monTW.toISOString().slice(0, 10);
    const end   = endDate   ?? sunTW.toISOString().slice(0, 10);

    const rows = await db.execute(sql`
      SELECT
        o.id,
        (regexp_match(o.notes,'路線：([^|｜[:space:]]+)'))[1]  AS route_id,
        (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]        AS prefix,
        (regexp_match(o.notes,'共 ([0-9]+) 站'))[1]::int      AS stations,
        o.dispatch_driver_code,
        o.fusingao_fleet_id,
        f.fleet_name,
        o.fleet_completed_at,
        o.completed_at,
        (o.created_at AT TIME ZONE 'Asia/Taipei')::date        AS dispatch_date
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      WHERE o.notes LIKE '路線：%'
        AND (o.created_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN ${start}::date AND ${end}::date
      ORDER BY (o.created_at AT TIME ZONE 'Asia/Taipei')::date, route_id
    `).then(r => r.rows as any[]);

    // Build grid: route_id → date → entry
    const routeMap = new Map<string, any>();
    for (const r of rows) {
      if (!r.route_id) continue;
      if (!routeMap.has(r.route_id)) {
        routeMap.set(r.route_id, { route_id: r.route_id, prefix: r.prefix, stations: r.stations, dates: {} });
      }
      routeMap.get(r.route_id).dates[r.dispatch_date] = {
        order_id: r.id,
        dispatch_driver_code: r.dispatch_driver_code,
        fleet_name: r.fleet_name,
        done: !!(r.fleet_completed_at || r.completed_at),
      };
    }

    // Build date range array
    const dates: string[] = [];
    const cur = new Date(start);
    const endD = new Date(end);
    while (cur <= endD) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

    res.json({ ok: true, dates, routes: Array.from(routeMap.values()), range: { start, end } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /fusingao/routes/:id/dispatch-code
fusingaoRouter.put("/routes/:id/dispatch-code", async (req, res) => {
  try {
    const { id } = req.params;
    const { dispatch_driver_code } = req.body as { dispatch_driver_code: string };
    await db.execute(sql`
      UPDATE orders SET dispatch_driver_code = ${dispatch_driver_code ?? null}
      WHERE id = ${Number(id)} AND notes LIKE '路線：%'
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/control-tower  — real-time dispatch control dashboard
fusingaoRouter.get("/control-tower", async (req, res) => {
  try {
    // ── Today's KPIs ─────────────────────────────────────────────────────────
    const kpi = await db.execute(sql`
      SELECT
        COUNT(*)                                                                       AS total,
        COUNT(*) FILTER (WHERE fleet_completed_at IS NOT NULL OR completed_at IS NOT NULL) AS completed,
        COUNT(*) FILTER (WHERE fleet_completed_at IS NULL AND completed_at IS NULL AND fusingao_fleet_id IS NOT NULL) AS in_progress,
        COUNT(*) FILTER (WHERE fusingao_fleet_id IS NULL)                              AS unassigned,
        COUNT(*) FILTER (WHERE
          fleet_completed_at IS NULL AND completed_at IS NULL
          AND created_at < NOW() - INTERVAL '36 hours'
        )                                                                              AS overdue
      FROM orders
      WHERE notes LIKE '路線：%'
        AND created_at >= NOW() - INTERVAL '30 days'
    `).then(r => r.rows[0] as any);

    // ── Exception routes: overdue + recently created but unassigned ───────────
    const exceptions = await db.execute(sql`
      SELECT
        o.id,
        (regexp_match(o.notes,'路線：([^|｜[:space:]]+)'))[1]              AS route_id,
        (regexp_match(o.notes,'共 ([0-9]+) 站'))[1]::int                AS stations,
        (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]                  AS prefix,
        o.fusingao_fleet_id,
        f.fleet_name,
        o.created_at,
        o.fleet_completed_at,
        o.completed_at,
        CASE
          WHEN o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL THEN 'done'
          WHEN o.fusingao_fleet_id IS NULL THEN 'unassigned'
          WHEN o.created_at < NOW() - INTERVAL '36 hours' THEN 'overdue'
          WHEN o.created_at < NOW() - INTERVAL '20 hours' THEN 'warning'
          ELSE 'normal'
        END AS status
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      WHERE o.notes LIKE '路線：%'
        AND o.created_at >= NOW() - INTERVAL '7 days'
        AND (
          o.fusingao_fleet_id IS NULL
          OR (o.fleet_completed_at IS NULL AND o.completed_at IS NULL AND o.created_at < NOW() - INTERVAL '20 hours')
        )
      ORDER BY
        CASE
          WHEN o.fusingao_fleet_id IS NULL THEN 1
          WHEN o.created_at < NOW() - INTERVAL '36 hours' THEN 2
          ELSE 3
        END,
        o.created_at ASC
      LIMIT 50
    `).then(r => r.rows as any[]);

    // ── Fleet performance ranking ─────────────────────────────────────────────
    const fleetPerf = await db.execute(sql`
      SELECT
        f.id,
        f.fleet_name,
        f.commission_rate,
        f.is_active,
        COUNT(o.id)                                                                    AS total_routes,
        COUNT(o.id) FILTER (WHERE o.fusingao_fleet_id IS NOT NULL)                    AS grabbed,
        COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL) AS completed,
        COUNT(o.id) FILTER (WHERE
          o.fleet_completed_at IS NULL AND o.completed_at IS NULL AND o.created_at < NOW() - INTERVAL '36 hours'
        )                                                                              AS overdue_count,
        ROUND(
          100.0 * COUNT(o.id) FILTER (WHERE o.fleet_completed_at IS NOT NULL OR o.completed_at IS NOT NULL)
          / NULLIF(COUNT(o.id), 0), 1
        )                                                                              AS completion_rate,
        MAX(o.fleet_completed_at)                                                      AS last_activity
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.notes LIKE '路線：%'
        AND o.created_at >= NOW() - INTERVAL '30 days'
      WHERE f.is_active = true
      GROUP BY f.id, f.fleet_name, f.commission_rate, f.is_active
      ORDER BY completion_rate DESC NULLS LAST, total_routes DESC
    `).then(r => r.rows as any[]);

    // ── Available routes for grab (unassigned) ───────────────────────────────
    const unassigned = await db.execute(sql`
      SELECT
        o.id,
        (regexp_match(o.notes,'路線：([^|｜[:space:]]+)'))[1]  AS route_id,
        (regexp_match(o.notes,'共 ([0-9]+) 站'))[1]::int   AS stations,
        (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]     AS prefix,
        o.created_at,
        pr.rate_per_trip                                    AS shopee_rate
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%'
        AND o.fusingao_fleet_id IS NULL
        AND o.fleet_completed_at IS NULL
        AND o.completed_at IS NULL
        AND o.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY o.created_at ASC
      LIMIT 20
    `).then(r => r.rows as any[]);

    res.json({
      ok: true,
      kpi,
      exceptions,
      fleet_performance: fleetPerf,
      unassigned_routes: unassigned,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  SETTLEMENT CHAIN: 福興高 → Platform (抽成) → Fleet → Fleet Driver
// ════════════════════════════════════════════════════════════════════════════

// GET /fusingao/settlement?month=YYYY-MM  — admin view of full settlement chain
fusingaoRouter.get("/settlement", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    const monthFilter = month ? sql`AND to_char(o.created_at,'YYYY-MM') = ${month}` : sql``;

    // Top-level summary
    const [summary] = await db.execute(sql`
      SELECT
        COUNT(o.id)                              AS total_routes,
        COALESCE(SUM(pr.rate_per_trip),0)        AS platform_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS fleet_payout,
        COALESCE(SUM(pr.rate_per_trip) - SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS platform_commission
      FROM orders o
      LEFT JOIN fusingao_fleets f ON f.id = o.fusingao_fleet_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%' ${monthFilter}
    `).then(r => r.rows as any[]);

    // Per-fleet breakdown
    const fleets = await db.execute(sql`
      SELECT
        f.id, f.fleet_name, f.commission_rate,
        COUNT(o.id)                              AS route_count,
        COALESCE(SUM(pr.rate_per_trip),0)        AS shopee_income,
        COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS fleet_payout,
        COALESCE(SUM(pr.rate_per_trip) - SUM(COALESCE(f.rate_override, pr.rate_per_trip * (1 - COALESCE(f.commission_rate,15)/100.0))),0) AS commission_earned,
        COUNT(o.id) FILTER (WHERE o.driver_payment_status='paid') AS billed_count,
        COUNT(o.fleet_completed_at)              AS completed_count
      FROM fusingao_fleets f
      LEFT JOIN orders o ON o.fusingao_fleet_id = f.id AND o.notes LIKE '路線：%' ${monthFilter}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      GROUP BY f.id, f.fleet_name, f.commission_rate
      ORDER BY shopee_income DESC
    `);

    res.json({ ok: true, summary: summary ?? {}, fleets: fleets.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /fusingao/fleets/:id/settlement?month=YYYY-MM — fleet-level settlement (for fleet portal)
fusingaoRouter.get("/fleets/:id/settlement", async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query as Record<string, string>;
    const monthFilter = month ? sql`AND to_char(o.created_at,'YYYY-MM') = ${month}` : sql``;

    // Summary
    const [summary] = await db.execute(sql`
      SELECT
        COALESCE(SUM(pr.rate_per_trip),0)  AS shopee_income,
        COALESCE(SUM(COALESCE(fl.rate_override, pr.rate_per_trip * (1 - COALESCE(fl.commission_rate,15)/100.0))),0) AS fleet_receive,
        COALESCE(MAX(fl.commission_rate), 15)    AS commission_rate
      FROM orders o
      LEFT JOIN fusingao_fleets fl ON fl.id = ${Number(id)}
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%' AND o.fusingao_fleet_id = ${Number(id)} ${monthFilter}
    `).then(r => r.rows as any[]);

    // Per-driver breakdown
    const drivers = await db.execute(sql`
      SELECT
        COALESCE(fd.name,'未指派') AS driver_name,
        fd.vehicle_plate,
        COUNT(o.id)               AS route_count,
        COUNT(o.fleet_completed_at) AS completed_count,
        COALESCE(SUM(COALESCE(fl2.rate_override, pr.rate_per_trip * (1 - COALESCE(fl2.commission_rate,15)/100.0))),0) AS earnings
      FROM orders o
      LEFT JOIN fusingao_fleets fl2 ON fl2.id = ${Number(id)}
      LEFT JOIN fleet_drivers fd ON fd.id = o.fleet_driver_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes,'路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%' AND o.fusingao_fleet_id = ${Number(id)} ${monthFilter}
      GROUP BY fd.name, fd.vehicle_plate
      ORDER BY earnings DESC
    `);

    res.json({ ok: true, summary: summary ?? {}, drivers: drivers.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /fusingao/invoice?month=YYYY-MM
// 自動計算每月請款單（依路線前綴分組）
// ════════════════════════════════════════════════════════════════════════════
fusingaoRouter.get("/invoice", async (req, res) => {
  try {
    const { month } = req.query as Record<string, string>;
    const m = month ?? new Date().toISOString().slice(0, 7);

    // 依前綴分組統計趟次 + 金額
    const rows = await db.execute(sql`
      WITH base AS (
        SELECT
          (regexp_match(o.notes, '路線：([A-Z0-9]+)-'))[1] AS prefix
        FROM orders o
        WHERE o.notes LIKE '路線：%'
          AND TO_CHAR(o.created_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM') = ${m}
      )
      SELECT
        b.prefix,
        pr.service_type,
        pr.rate_per_trip,
        COUNT(*)                         AS trip_count,
        COUNT(*) * pr.rate_per_trip      AS gross_amount
      FROM base b
      JOIN route_prefix_rates pr ON pr.prefix = b.prefix
      WHERE b.prefix IS NOT NULL
      GROUP BY b.prefix, pr.service_type, pr.rate_per_trip
      ORDER BY b.prefix
    `).then(r => r.rows as any[]);

    // 前綴 → 請款單分類對應
    const CATEGORY_MAP: Record<string, string> = {
      FM: "店配車", WB: "店配車", WD: "店配車",
      FN: "NDD",   A3: "NDD",
      NB: "WHNDD",
    };

    // 合併到分類
    const catMap: Record<string, { trips: number; gross: number; rate: number }> = {};
    for (const r of rows) {
      const cat = CATEGORY_MAP[r.prefix] ?? r.prefix ?? "其他";
      if (!catMap[cat]) catMap[cat] = { trips: 0, gross: 0, rate: Number(r.rate_per_trip) };
      catMap[cat].trips += Number(r.trip_count);
      catMap[cat].gross += Number(r.gross_amount);
    }

    const categories = Object.entries(catMap).map(([name, v]) => ({
      name, trips: v.trips, gross: v.gross, rate: v.rate,
    }));

    // 自動趟次合計（未含手動項目）
    const autoGross = categories.reduce((s, c) => s + c.gross, 0);

    res.json({ ok: true, month: m, categories, autoGross });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
