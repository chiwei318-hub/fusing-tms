import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const commissionTiersRouter = Router();

const DEFAULT_TIERS = [
  {
    tier_type: "cold_chain",
    label: "冷鏈高標案",
    description: "生鮮、醫藥、精密儀器等需溫控監測之貨物",
    min_pct: 15,
    max_pct: 20,
    platform_pct: 70,
    driver_pct: 30,
    urgency_surcharge_pct: 0,
    dispatch_fee: 0,
  },
  {
    tier_type: "regular",
    label: "常溫大宗貨",
    description: "建材、民生用品、一般工業零件等常溫貨物",
    min_pct: 8,
    max_pct: 12,
    platform_pct: 65,
    driver_pct: 35,
    urgency_surcharge_pct: 0,
    dispatch_fee: 0,
  },
  {
    tier_type: "urgent",
    label: "急單加成",
    description: "24小時內需完成之急單：系統自動加價15%，加價部分平台/司機3:7拆帳",
    min_pct: 10,
    max_pct: 15,
    platform_pct: 30,
    driver_pct: 70,
    urgency_surcharge_pct: 15,
    dispatch_fee: 0,
  },
  {
    tier_type: "dispatch_fee",
    label: "每趟派單手續費",
    description: "取代月租費，每成功派車收取固定手續費；讓加盟司機「有跑才有付」",
    min_pct: 0,
    max_pct: 0,
    platform_pct: 100,
    driver_pct: 0,
    urgency_surcharge_pct: 0,
    dispatch_fee: 80,
  },
];

async function ensureSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS commission_tiers (
      id                    SERIAL PRIMARY KEY,
      tier_type             VARCHAR(50) UNIQUE NOT NULL,
      label                 VARCHAR(100) NOT NULL,
      description           TEXT,
      min_pct               NUMERIC(5,2) DEFAULT 0,
      max_pct               NUMERIC(5,2) DEFAULT 0,
      platform_pct          NUMERIC(5,2) DEFAULT 50,
      driver_pct            NUMERIC(5,2) DEFAULT 50,
      urgency_surcharge_pct NUMERIC(5,2) DEFAULT 0,
      dispatch_fee          NUMERIC(10,2) DEFAULT 0,
      active                BOOLEAN DEFAULT true,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM commission_tiers`);
  if (Number(existing.rows[0]?.cnt ?? 0) === 0) {
    for (const t of DEFAULT_TIERS) {
      await db.execute(sql`
        INSERT INTO commission_tiers
          (tier_type, label, description, min_pct, max_pct, platform_pct, driver_pct,
           urgency_surcharge_pct, dispatch_fee)
        VALUES
          (${t.tier_type}, ${t.label}, ${t.description}, ${t.min_pct}, ${t.max_pct},
           ${t.platform_pct}, ${t.driver_pct}, ${t.urgency_surcharge_pct}, ${t.dispatch_fee})
        ON CONFLICT (tier_type) DO NOTHING
      `);
    }
  }
  console.log("[CommissionTiers] schema ensured");
}

ensureSchema().catch(console.error);

commissionTiersRouter.get("/", async (_req, res) => {
  const result = await db.execute(sql`SELECT * FROM commission_tiers ORDER BY id`);
  res.json(result.rows);
});

commissionTiersRouter.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const {
    min_pct, max_pct, platform_pct, driver_pct,
    urgency_surcharge_pct, dispatch_fee, active, description,
  } = req.body;

  const result = await db.execute(sql`
    UPDATE commission_tiers SET
      min_pct               = COALESCE(${min_pct ?? null}::numeric,    min_pct),
      max_pct               = COALESCE(${max_pct ?? null}::numeric,    max_pct),
      platform_pct          = COALESCE(${platform_pct ?? null}::numeric, platform_pct),
      driver_pct            = COALESCE(${driver_pct ?? null}::numeric,  driver_pct),
      urgency_surcharge_pct = COALESCE(${urgency_surcharge_pct ?? null}::numeric, urgency_surcharge_pct),
      dispatch_fee          = COALESCE(${dispatch_fee ?? null}::numeric, dispatch_fee),
      active                = COALESCE(${active ?? null}::boolean,      active),
      description           = COALESCE(${description ?? null},          description),
      updated_at            = NOW()
    WHERE id = ${id}
    RETURNING *
  `);
  if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not found" });
  res.json({ ok: true, tier: result.rows[0] });
});

commissionTiersRouter.post("/reset", async (_req, res) => {
  await db.execute(sql`TRUNCATE commission_tiers RESTART IDENTITY`);
  for (const t of DEFAULT_TIERS) {
    await db.execute(sql`
      INSERT INTO commission_tiers
        (tier_type, label, description, min_pct, max_pct, platform_pct, driver_pct,
         urgency_surcharge_pct, dispatch_fee)
      VALUES
        (${t.tier_type}, ${t.label}, ${t.description}, ${t.min_pct}, ${t.max_pct},
         ${t.platform_pct}, ${t.driver_pct}, ${t.urgency_surcharge_pct}, ${t.dispatch_fee})
    `);
  }
  res.json({ ok: true });
});

commissionTiersRouter.post("/calculate", async (req, res) => {
  const { order_amount = 0, tier_type = "regular", is_urgent = false } = req.body;
  const amount = Number(order_amount);

  const result = await db.execute(sql`SELECT * FROM commission_tiers WHERE active = true`);
  const tierMap: Record<string, Record<string, unknown>> = {};
  for (const t of result.rows) tierMap[String(t.tier_type)] = t as Record<string, unknown>;

  const baseTier = tierMap[tier_type] ?? tierMap["regular"];
  const urgentTier = tierMap["urgent"];
  const dispatchFeeTier = tierMap["dispatch_fee"];

  const midPct = (Number(baseTier?.min_pct ?? 10) + Number(baseTier?.max_pct ?? 12)) / 2;
  const platformFee = Math.round(amount * midPct / 100);
  const driverFee = amount - platformFee;

  let urgentSurcharge = 0;
  let urgentPlatform = 0;
  let urgentDriver = 0;

  if (is_urgent && urgentTier) {
    urgentSurcharge = Math.round(amount * Number(urgentTier.urgency_surcharge_pct ?? 15) / 100);
    urgentPlatform = Math.round(urgentSurcharge * Number(urgentTier.platform_pct ?? 30) / 100);
    urgentDriver = urgentSurcharge - urgentPlatform;
  }

  const dispatchFee = dispatchFeeTier ? Number(dispatchFeeTier.dispatch_fee ?? 80) : 80;

  res.json({
    order_amount: amount,
    tier_type,
    is_urgent,
    base_commission_pct: midPct,
    platform_commission: platformFee,
    driver_net: driverFee,
    urgent_surcharge_total: urgentSurcharge,
    urgent_platform_cut: urgentPlatform,
    urgent_driver_bonus: urgentDriver,
    dispatch_fee: dispatchFee,
    total_platform_revenue: platformFee + urgentPlatform + dispatchFee,
    total_driver_payout: driverFee + urgentDriver,
  });
});

commissionTiersRouter.get("/backhaul-stats", async (_req, res) => {
  const statsResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT driver_id) as active_drivers,
      COUNT(id)                 as completed_trips,
      COALESCE(SUM(total_fee::numeric), 0) as total_revenue,
      COALESCE(AVG(total_fee::numeric), 0) as avg_order_fee
    FROM orders
    WHERE created_at > NOW() - INTERVAL '30 days'
      AND status = 'delivered'
  `);

  const weeklyDemandResult = await db.execute(sql`
    SELECT
      EXTRACT(DOW  FROM created_at)::int AS day_of_week,
      EXTRACT(HOUR FROM created_at)::int AS hour_of_day,
      COUNT(*)::int AS order_count
    FROM orders
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY day_of_week, hour_of_day
    ORDER BY day_of_week, hour_of_day
  `);

  const topRoutesResult = await db.execute(sql`
    SELECT
      pickup_address,
      delivery_address,
      COUNT(*)::int as trip_count,
      COALESCE(SUM(total_fee::numeric), 0) as total_revenue
    FROM orders
    WHERE created_at > NOW() - INTERVAL '30 days'
      AND status = 'delivered'
      AND pickup_address IS NOT NULL
      AND delivery_address IS NOT NULL
    GROUP BY pickup_address, delivery_address
    ORDER BY trip_count DESC
    LIMIT 10
  `);

  const stat = statsResult.rows[0] as Record<string, unknown> | undefined;
  const completedTrips = Number(stat?.completed_trips ?? 0);
  const estimatedBackhaulOpportunities = Math.floor(completedTrips * 0.65);
  const estimatedEmptyReturnPct = 62;
  const potentialExtraRevenue = Math.round(Number(stat?.avg_order_fee ?? 0) * estimatedBackhaulOpportunities * 0.4);

  res.json({
    period: "近30天",
    active_drivers: Number(stat?.active_drivers ?? 0),
    completed_trips: completedTrips,
    total_revenue: Number(stat?.total_revenue ?? 0),
    avg_order_fee: Math.round(Number(stat?.avg_order_fee ?? 0)),
    estimated_empty_return_pct: estimatedEmptyReturnPct,
    estimated_backhaul_opportunities: estimatedBackhaulOpportunities,
    potential_extra_revenue: potentialExtraRevenue,
    weekly_demand: weeklyDemandResult.rows.map((r: Record<string, unknown>) => ({
      day_of_week: Number(r.day_of_week),
      hour_of_day: Number(r.hour_of_day),
      order_count: Number(r.order_count),
    })),
    top_routes: topRoutesResult.rows.map((r: Record<string, unknown>) => ({
      pickup: r.pickup_address,
      delivery: r.delivery_address,
      trips: Number(r.trip_count),
      revenue: Number(r.total_revenue),
    })),
  });
});
