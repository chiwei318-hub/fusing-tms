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

// POST /driver-earnings/prefix-rates — create new rate
driverEarningsRouter.post("/prefix-rates", async (req, res) => {
  try {
    const { prefix, description, service_type, route_od, vehicle_type, rate_per_trip, driver_pay_rate, notes, pay_notes } = req.body;
    if (!prefix) return res.status(400).json({ ok: false, error: "prefix 必填" });
    await db.execute(sql`
      INSERT INTO route_prefix_rates (prefix, description, service_type, route_od, vehicle_type, rate_per_trip, driver_pay_rate, notes, pay_notes, updated_at)
      VALUES (
        ${prefix}, ${description ?? null}, ${service_type ?? null}, ${route_od ?? null},
        ${vehicle_type ?? null}, ${rate_per_trip ?? 0}, ${driver_pay_rate ?? null},
        ${notes ?? null}, ${pay_notes ?? null}, NOW()
      )
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /driver-earnings/prefix-rates/:prefix — update a rate (all fields)
driverEarningsRouter.put("/prefix-rates/:prefix", async (req, res) => {
  try {
    const { prefix } = req.params;
    const { rate_per_trip, service_type, route_od, description, vehicle_type, driver_pay_rate, notes, pay_notes } = req.body;
    await db.execute(sql`
      UPDATE route_prefix_rates
      SET rate_per_trip   = ${rate_per_trip ?? 0},
          service_type    = ${service_type ?? null},
          route_od        = ${route_od ?? null},
          description     = ${description ?? null},
          vehicle_type    = ${vehicle_type ?? null},
          driver_pay_rate = ${driver_pay_rate ?? null},
          notes           = ${notes ?? null},
          pay_notes       = ${pay_notes ?? null},
          updated_at      = NOW()
      WHERE prefix = ${prefix}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /driver-earnings/prefix-rates/:prefix — delete a rate
driverEarningsRouter.delete("/prefix-rates/:prefix", async (req, res) => {
  try {
    const { prefix } = req.params;
    await db.execute(sql`DELETE FROM route_prefix_rates WHERE prefix = ${prefix}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /driver-earnings/prefix-rates/import — bulk upsert from Excel data
driverEarningsRouter.post("/prefix-rates/import", async (req, res) => {
  try {
    const { rows } = req.body as { rows: Array<{
      prefix: string; description?: string; service_type?: string; route_od?: string;
      vehicle_type?: string; rate_per_trip?: number; driver_pay_rate?: number;
      notes?: string; pay_notes?: string;
    }> };
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ ok: false, error: "rows 必填" });

    let inserted = 0;
    for (const r of rows) {
      if (!r.prefix) continue;
      await db.execute(sql`
        INSERT INTO route_prefix_rates (prefix, description, service_type, route_od, vehicle_type, rate_per_trip, driver_pay_rate, notes, pay_notes, updated_at)
        VALUES (
          ${r.prefix}, ${r.description ?? null}, ${r.service_type ?? null}, ${r.route_od ?? null},
          ${r.vehicle_type ?? null}, ${r.rate_per_trip ?? 0}, ${r.driver_pay_rate ?? null},
          ${r.notes ?? null}, ${r.pay_notes ?? null}, NOW()
        )
        ON CONFLICT (prefix) DO UPDATE SET
          description     = EXCLUDED.description,
          service_type    = EXCLUDED.service_type,
          route_od        = EXCLUDED.route_od,
          vehicle_type    = EXCLUDED.vehicle_type,
          rate_per_trip   = EXCLUDED.rate_per_trip,
          driver_pay_rate = EXCLUDED.driver_pay_rate,
          notes           = EXCLUDED.notes,
          pay_notes       = EXCLUDED.pay_notes,
          updated_at      = NOW()
      `);
      inserted++;
    }
    res.json({ ok: true, inserted });
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
