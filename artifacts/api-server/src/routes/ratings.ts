import { Router } from "express";
import { db } from "@workspace/db";
import { driverRatingsTable, driversTable } from "@workspace/db/schema";
import { eq, avg, count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const ratingsRouter = Router();

// GET /api/ratings/driver/:driverId - driver rating summary + reviews
ratingsRouter.get("/driver/:driverId", async (req, res) => {
  const driverId = Number(req.params.driverId);
  const reviews = await db
    .select()
    .from(driverRatingsTable)
    .where(eq(driverRatingsTable.driverId, driverId))
    .orderBy(desc(driverRatingsTable.createdAt))
    .limit(50);

  const [agg] = await db
    .select({ avg: avg(driverRatingsTable.stars), count: count() })
    .from(driverRatingsTable)
    .where(eq(driverRatingsTable.driverId, driverId));

  res.json({ avg: agg?.avg ? parseFloat(agg.avg) : null, count: agg?.count ?? 0, reviews });
});

// POST /api/ratings/order/:orderId - submit rating
ratingsRouter.post("/order/:orderId", async (req, res) => {
  const orderId = Number(req.params.orderId);
  const { driverId, customerId, stars, comment } = req.body;
  if (!driverId || !stars || stars < 1 || stars > 5) {
    return res.status(400).json({ error: "需要 driverId 和 1-5 星評分" });
  }

  const existing = await db
    .select()
    .from(driverRatingsTable)
    .where(eq(driverRatingsTable.orderId, orderId));
  if (existing.length > 0) {
    return res.status(409).json({ error: "此訂單已評分" });
  }

  const [rating] = await db.insert(driverRatingsTable).values({
    orderId, driverId, customerId: customerId ?? null, stars, comment: comment ?? null,
  }).returning();

  res.json({ ok: true, rating });
});

// GET /api/ratings/leaderboard - top drivers by average rating
ratingsRouter.get("/leaderboard", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT d.id, d.name, d.vehicle_type, d.license_plate,
           ROUND(AVG(r.stars)::numeric, 2) AS avg_stars,
           COUNT(r.id) AS rating_count
    FROM drivers d
    JOIN driver_ratings r ON r.driver_id = d.id
    GROUP BY d.id, d.name, d.vehicle_type, d.license_plate
    HAVING COUNT(r.id) >= 1
    ORDER BY avg_stars DESC, rating_count DESC
    LIMIT 20
  `);
  res.json(rows.rows);
});

// GET /api/ratings/all - all ratings for admin view
ratingsRouter.get("/all", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT r.*, d.name AS driver_name, d.vehicle_type,
           o.pickup_address, o.delivery_address
    FROM driver_ratings r
    JOIN drivers d ON d.id = r.driver_id
    LEFT JOIN orders o ON o.id = r.order_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  res.json(rows.rows);
});
