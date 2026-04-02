import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const driverEarningsRouter = Router();

// GET /driver-earnings — per-driver earnings summary
driverEarningsRouter.get("/", async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;

    let dateFilter = "";
    if (from) dateFilter += ` AND o.created_at >= '${from}'`;
    if (to)   dateFilter += ` AND o.created_at <= '${to} 23:59:59'`;

    const rows = await db.execute(sql`
      WITH parsed AS (
        SELECT
          id,
          (regexp_match(notes, '司機ID：([0-9]+)'))[1]   AS shopee_id,
          (regexp_match(notes, '路線：([A-Z0-9]+)-'))[1] AS prefix,
          (regexp_match(notes, '路線：([^｜]+)'))[1]     AS route_id,
          required_vehicle_type,
          driver_payment_status,
          created_at
        FROM orders
        WHERE notes LIKE '路線：%'
        ${sql.raw(dateFilter)}
      )
      SELECT
        COALESCE(p.shopee_id, '(未指派)') AS shopee_id,
        sd.name            AS driver_name,
        sd.vehicle_plate,
        sd.vehicle_type    AS driver_vehicle_type,
        COUNT(*)           AS route_count,
        SUM(COALESCE(pr.rate_per_trip, 0)) AS total_fee,
        COUNT(CASE WHEN p.driver_payment_status = 'paid' THEN 1 END) AS paid_count,
        json_agg(json_build_object(
          'id', p.id,
          'route_id', p.route_id,
          'prefix', p.prefix,
          'service_type', pr.service_type,
          'route_od', pr.route_od,
          'rate_per_trip', pr.rate_per_trip,
          'vehicle_type', p.required_vehicle_type,
          'payment_status', p.driver_payment_status,
          'created_at', p.created_at
        ) ORDER BY p.created_at) AS routes
      FROM parsed p
      LEFT JOIN shopee_drivers sd ON sd.shopee_id = p.shopee_id
      LEFT JOIN route_prefix_rates pr ON pr.prefix = p.prefix
      GROUP BY p.shopee_id, sd.name, sd.vehicle_plate, sd.vehicle_type
      ORDER BY total_fee DESC NULLS LAST
    `);

    const totalRows = await db.execute(sql`
      SELECT
        COUNT(*) AS total_routes,
        SUM(COALESCE(pr.rate_per_trip, 0)) AS grand_total
      FROM orders o
      LEFT JOIN route_prefix_rates pr ON pr.prefix = (regexp_match(o.notes, '路線：([A-Z0-9]+)-'))[1]
      WHERE o.notes LIKE '路線：%'
      ${sql.raw(dateFilter)}
    `);

    res.json({
      ok: true,
      drivers: rows.rows,
      summary: (totalRows.rows as any[])[0],
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /driver-earnings/prefix-rates — get all prefix→rate mappings
driverEarningsRouter.get("/prefix-rates", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM route_prefix_rates ORDER BY prefix
    `);
    res.json({ ok: true, items: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /driver-earnings/prefix-rates/:prefix — update a rate
driverEarningsRouter.put("/prefix-rates/:prefix", async (req, res) => {
  try {
    const { prefix } = req.params;
    const { rate_per_trip, service_type, route_od, description } = req.body;
    await db.execute(sql`
      UPDATE route_prefix_rates
      SET rate_per_trip = ${rate_per_trip},
          service_type  = ${service_type},
          route_od      = ${route_od},
          description   = ${description},
          updated_at    = NOW()
      WHERE prefix = ${prefix}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /driver-earnings/shopee-drivers — list drivers
driverEarningsRouter.get("/shopee-drivers", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT sd.*,
        (SELECT COUNT(*) FROM orders o 
         WHERE (regexp_match(o.notes, '司機ID：([0-9]+)'))[1] = sd.shopee_id
           AND o.notes LIKE '路線：%') AS route_count
      FROM shopee_drivers sd
      ORDER BY shopee_id
    `);
    res.json({ ok: true, items: rows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /driver-earnings/shopee-drivers/:shopee_id — update driver info
driverEarningsRouter.put("/shopee-drivers/:shopee_id", async (req, res) => {
  try {
    const { shopee_id } = req.params;
    const { name, vehicle_plate, vehicle_type, notes } = req.body;
    await db.execute(sql`
      INSERT INTO shopee_drivers (shopee_id, name, vehicle_plate, vehicle_type, notes)
      VALUES (${shopee_id}, ${name}, ${vehicle_plate}, ${vehicle_type}, ${notes})
      ON CONFLICT (shopee_id) DO UPDATE
        SET name = EXCLUDED.name,
            vehicle_plate = EXCLUDED.vehicle_plate,
            vehicle_type = EXCLUDED.vehicle_type,
            notes = EXCLUDED.notes
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
