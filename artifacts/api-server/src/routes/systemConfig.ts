import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const systemConfigRouter = Router();

// GET /api/system-config - all pricing_config entries
systemConfigRouter.get("/", async (_req, res) => {
  const rows = await db.execute(sql`SELECT id, key, value, label, updated_at FROM pricing_config ORDER BY id`);
  res.json(rows.rows);
});

// PATCH /api/system-config/:key - update a single config value
systemConfigRouter.patch("/:key", async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: "缺少 value" });

  await db.execute(sql`
    UPDATE pricing_config SET value = ${String(value)}, updated_at = NOW()
    WHERE key = ${key}
  `);
  res.json({ ok: true, key, value });
});

// PATCH /api/system-config - batch update multiple configs
systemConfigRouter.patch("/", async (req, res) => {
  const updates: Record<string, string> = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await db.execute(sql`
      UPDATE pricing_config SET value = ${String(value)}, updated_at = NOW()
      WHERE key = ${key}
    `);
  }
  res.json({ ok: true, updated: Object.keys(updates).length });
});

// GET /api/system-config/stats/overview - dashboard KPI stats
systemConfigRouter.get("/stats/overview", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) AS today_orders,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'in_transit') AS in_transit_orders,
      COUNT(*) FILTER (WHERE status = 'delivered' AND DATE(created_at) = CURRENT_DATE) AS today_delivered,
      COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered' AND DATE(created_at) = CURRENT_DATE), 0) AS today_revenue,
      COALESCE(SUM(total_fee) FILTER (WHERE status = 'delivered' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())), 0) AS month_revenue,
      COUNT(*) FILTER (WHERE status = 'delivered' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())) AS month_delivered
    FROM orders
  `);
  const order_stats = rows.rows[0];

  const driver_rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'available') AS available,
      COUNT(*) FILTER (WHERE status = 'busy') AS busy,
      COUNT(*) FILTER (WHERE status = 'offline') AS offline,
      COUNT(*) AS total
    FROM drivers
  `);
  const driver_stats = driver_rows.rows[0];

  const trend_rows = await db.execute(sql`
    SELECT DATE(created_at) AS day,
           COUNT(*) AS order_count,
           COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0) AS revenue
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
    ORDER BY day ASC
  `);

  const vehicle_rows = await db.execute(sql`
    SELECT required_vehicle_type AS vehicle_type,
           COUNT(*) AS order_count,
           COALESCE(SUM(total_fee) FILTER (WHERE status='delivered'), 0) AS revenue
    FROM orders
    WHERE required_vehicle_type IS NOT NULL
      AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    GROUP BY required_vehicle_type
    ORDER BY revenue DESC
    LIMIT 10
  `);

  const rating_rows = await db.execute(sql`
    SELECT ROUND(AVG(stars)::numeric, 2) AS avg_rating, COUNT(*) AS total_ratings
    FROM driver_ratings
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);

  res.json({
    orders: order_stats,
    drivers: driver_stats,
    trend: trend_rows.rows,
    vehicleBreakdown: vehicle_rows.rows,
    ratings: rating_rows.rows[0],
  });
});
