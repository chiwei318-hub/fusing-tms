import { Router } from "express";
import { db } from "@workspace/db";
import { pool } from "@workspace/db";
import { driverRatingsTable, driversTable } from "@workspace/db/schema";
import { eq, avg, count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const ratingsRouter = Router();

// ─── DB Migration ─────────────────────────────────────────────────────────────

async function ensurePerformanceTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_performance_events (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_level TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      trigger_value REAL,
      is_resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}
ensurePerformanceTable().catch(console.error);

// ─── Helpers: compute rewards / penalties ─────────────────────────────────────

interface PerfEvent {
  driverId: number;
  eventType: string;
  eventLevel: "reward" | "penalty";
  title: string;
  description: string;
  triggerValue: number;
}

async function computePerformanceEvent(driverId: number): Promise<PerfEvent | null> {
  // Get recent 30 ratings ordered by time desc
  const { rows: recent } = await pool.query(
    `SELECT stars, created_at FROM driver_ratings WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [driverId]
  );
  if (!recent.length) return null;

  const allStars: number[] = recent.map((r: any) => Number(r.stars));
  const totalCount = allStars.length;

  // --- Consecutive streaks ---
  let consecutiveGood = 0;
  let consecutiveBad = 0;
  for (const s of allStars) {
    if (s >= 4) { consecutiveGood++; } else break;
  }
  for (const s of allStars) {
    if (s <= 2) { consecutiveBad++; } else break;
  }

  // --- Last 30 days bad count ---
  const { rows: monthBad } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM driver_ratings
     WHERE driver_id = $1 AND stars <= 2 AND created_at >= NOW() - INTERVAL '30 days'`,
    [driverId]
  );
  const badInMonth = Number((monthBad[0] as any).cnt);

  // --- Overall avg ---
  const { rows: aggAll } = await pool.query(
    `SELECT ROUND(AVG(stars)::numeric,2) AS avg, COUNT(*) AS cnt FROM driver_ratings WHERE driver_id = $1`,
    [driverId]
  );
  const overallAvg = Number((aggAll[0] as any).avg);
  const overallCount = Number((aggAll[0] as any).cnt);

  // --- Check already active events to avoid duplicates ---
  const { rows: activeEvents } = await pool.query(
    `SELECT event_type FROM driver_performance_events
     WHERE driver_id = $1 AND is_resolved = FALSE AND created_at >= NOW() - INTERVAL '24 hours'`,
    [driverId]
  );
  const activeTypes = new Set((activeEvents as any[]).map(e => e.event_type));

  // ── REWARD CHECKS (highest priority first) ──
  if (consecutiveGood >= 10 && !activeTypes.has("bonus_streak_10")) {
    return {
      driverId,
      eventType: "bonus_streak_10",
      eventLevel: "reward",
      title: "🏆 連續10筆好評獎勵",
      description: `司機連續獲得 ${consecutiveGood} 筆 4-5 星好評，表現卓越！`,
      triggerValue: consecutiveGood,
    };
  }

  if (consecutiveGood >= 5 && !activeTypes.has("bonus_streak_5")) {
    return {
      driverId,
      eventType: "bonus_streak_5",
      eventLevel: "reward",
      title: "⭐ 連續5筆好評獎勵",
      description: `司機連續獲得 ${consecutiveGood} 筆 4-5 星好評，服務品質優良！`,
      triggerValue: consecutiveGood,
    };
  }

  if (overallAvg >= 4.8 && overallCount >= 20 && !activeTypes.has("bonus_gold_driver")) {
    return {
      driverId,
      eventType: "bonus_gold_driver",
      eventLevel: "reward",
      title: "🥇 金牌司機認證",
      description: `累計 ${overallCount} 筆評分，平均 ${overallAvg} 星，達到金牌司機標準！`,
      triggerValue: overallAvg,
    };
  }

  if (overallAvg >= 4.5 && overallCount >= 10 && !activeTypes.has("bonus_excellent")) {
    return {
      driverId,
      eventType: "bonus_excellent",
      eventLevel: "reward",
      title: "✨ 優良服務獎勵",
      description: `累計 ${overallCount} 筆評分，平均 ${overallAvg} 星，獲得優良服務認證！`,
      triggerValue: overallAvg,
    };
  }

  // ── PENALTY CHECKS ──
  if (consecutiveBad >= 5 && !activeTypes.has("penalty_suspension")) {
    return {
      driverId,
      eventType: "penalty_suspension",
      eventLevel: "penalty",
      title: "🚫 停職警示",
      description: `司機連續 ${consecutiveBad} 筆 1-2 星差評，建議暫停派車並進行約談。`,
      triggerValue: consecutiveBad,
    };
  }

  if (badInMonth >= 5 && !activeTypes.has("penalty_monthly_bad")) {
    return {
      driverId,
      eventType: "penalty_monthly_bad",
      eventLevel: "penalty",
      title: "⚠️ 月度差評警告",
      description: `司機近30天累計 ${badInMonth} 筆差評（1-2星），需進行績效輔導。`,
      triggerValue: badInMonth,
    };
  }

  if (consecutiveBad >= 3 && !activeTypes.has("penalty_warning")) {
    return {
      driverId,
      eventType: "penalty_warning",
      eventLevel: "penalty",
      title: "⚠️ 服務警告",
      description: `司機連續 ${consecutiveBad} 筆 1-2 星差評，請主動聯繫司機了解狀況。`,
      triggerValue: consecutiveBad,
    };
  }

  if (overallAvg <= 2.5 && overallCount >= 5 && !activeTypes.has("penalty_downgrade")) {
    return {
      driverId,
      eventType: "penalty_downgrade",
      eventLevel: "penalty",
      title: "🔻 服務降級警告",
      description: `司機整體平均評分 ${overallAvg} 星（共 ${overallCount} 筆），服務品質需重大改善。`,
      triggerValue: overallAvg,
    };
  }

  return null;
}

// ─── POST /api/ratings/order/:orderId ────────────────────────────────────────

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

  // Check reward/penalty after inserting
  let performanceEvent: any = null;
  try {
    const event = await computePerformanceEvent(driverId);
    if (event) {
      const { rows } = await pool.query(
        `INSERT INTO driver_performance_events
          (driver_id, event_type, event_level, title, description, trigger_value)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [event.driverId, event.eventType, event.eventLevel, event.title, event.description, event.triggerValue]
      );
      performanceEvent = rows[0];
    }
  } catch (e) {
    console.error("Performance event error:", e);
  }

  res.json({ ok: true, rating, performanceEvent });
});

// ─── GET /api/ratings/driver/:driverId ───────────────────────────────────────

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

  // Distribution
  const { rows: dist } = await pool.query(
    `SELECT stars, COUNT(*) AS cnt FROM driver_ratings WHERE driver_id = $1 GROUP BY stars ORDER BY stars DESC`,
    [driverId]
  );

  res.json({
    avg: agg?.avg ? parseFloat(agg.avg) : null,
    count: agg?.count ?? 0,
    reviews,
    distribution: dist,
  });
});

// ─── GET /api/ratings/driver/:driverId/performance ───────────────────────────

ratingsRouter.get("/driver/:driverId/performance", async (req, res) => {
  const driverId = Number(req.params.driverId);

  // Aggregate stats
  const { rows: stats } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      ROUND(AVG(stars)::numeric, 2) AS avg_stars,
      COUNT(*) FILTER (WHERE stars = 5) AS five_star,
      COUNT(*) FILTER (WHERE stars = 4) AS four_star,
      COUNT(*) FILTER (WHERE stars <= 2) AS bad_count,
      COUNT(*) FILTER (WHERE stars <= 2 AND created_at >= NOW() - INTERVAL '30 days') AS bad_month
    FROM driver_ratings WHERE driver_id = $1
  `, [driverId]);

  // Recent 5 for streak
  const { rows: recent5 } = await pool.query(
    `SELECT stars FROM driver_ratings WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [driverId]
  );

  // Active performance events
  const { rows: events } = await pool.query(
    `SELECT * FROM driver_performance_events WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [driverId]
  );

  res.json({ stats: stats[0] ?? null, recentStars: recent5.map((r: any) => Number(r.stars)), events });
});

// ─── GET /api/ratings/leaderboard ────────────────────────────────────────────

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

// ─── GET /api/ratings/all ─────────────────────────────────────────────────────

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

// ─── GET /api/ratings/performance-events — admin summary ─────────────────────

ratingsRouter.get("/performance-events", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT pe.*, d.name AS driver_name, d.vehicle_type, d.license_plate
    FROM driver_performance_events pe
    JOIN drivers d ON d.id = pe.driver_id
    ORDER BY pe.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// ─── PATCH /api/ratings/performance-events/:id/resolve ───────────────────────

ratingsRouter.patch("/performance-events/:id/resolve", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `UPDATE driver_performance_events SET is_resolved = TRUE WHERE id = $1 RETURNING *`,
    [id]
  );
  res.json(rows[0] ?? null);
});
