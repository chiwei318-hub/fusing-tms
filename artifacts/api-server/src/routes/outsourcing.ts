import { Router } from "express";
import {
  db,
  partnerFleetsTable,
  outsourcedOrdersTable,
  autoDispatchSettingsTable,
  ordersTable,
} from "@workspace/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";

const router = Router();

/* ══════════════════════════════════════════════
   PARTNER FLEETS — CRUD
══════════════════════════════════════════════ */

router.get("/outsourcing/fleets", async (_req, res) => {
  try {
    const fleets = await db.select().from(partnerFleetsTable).orderBy(desc(partnerFleetsTable.reliabilityScore));
    res.json(fleets);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/outsourcing/fleets", async (req, res) => {
  try {
    const [fleet] = await db.insert(partnerFleetsTable).values(req.body).returning();
    res.json(fleet);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/outsourcing/fleets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [fleet] = await db.update(partnerFleetsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(partnerFleetsTable.id, id))
      .returning();
    res.json(fleet);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/outsourcing/fleets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(partnerFleetsTable).where(eq(partnerFleetsTable.id, id));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/* Auto price comparison — return top fleets sorted by price for a region */
router.get("/outsourcing/fleets/compare", async (req, res) => {
  try {
    const { region, vehicleType } = req.query as { region?: string; vehicleType?: string };
    const fleets = await db.select().from(partnerFleetsTable)
      .where(eq(partnerFleetsTable.status, "active"))
      .orderBy(partnerFleetsTable.baseRate);
    const filtered = fleets.filter(f => {
      const regions: string[] = f.regions ? JSON.parse(f.regions) : [];
      const types: string[] = f.vehicleTypes ? JSON.parse(f.vehicleTypes) : [];
      const regionOk = !region || regions.length === 0 || regions.some(r => r.includes(region) || region.includes(r));
      const typeOk = !vehicleType || types.length === 0 || types.includes(vehicleType);
      return regionOk && typeOk;
    });
    res.json(filtered);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/* ══════════════════════════════════════════════
   OUTSOURCED ORDERS — CRUD
══════════════════════════════════════════════ */

router.get("/outsourcing/orders", async (req, res) => {
  try {
    const { status, fleetId } = req.query as { status?: string; fleetId?: string };
    let query = db
      .select({
        outsourced: outsourcedOrdersTable,
        order: ordersTable,
        fleet: partnerFleetsTable,
      })
      .from(outsourcedOrdersTable)
      .leftJoin(ordersTable, eq(outsourcedOrdersTable.orderId, ordersTable.id))
      .leftJoin(partnerFleetsTable, eq(outsourcedOrdersTable.fleetId, partnerFleetsTable.id))
      .$dynamic();

    if (status) query = query.where(eq(outsourcedOrdersTable.status, status)) as typeof query;
    if (fleetId) query = query.where(eq(outsourcedOrdersTable.fleetId, Number(fleetId))) as typeof query;

    const rows = await query.orderBy(desc(outsourcedOrdersTable.createdAt));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/outsourcing/orders", async (req, res) => {
  try {
    const body = req.body as {
      orderId: number;
      fleetId: number;
      transferPrice: number;
      fleetPrice: number;
      commissionType: string;
      commissionValue: number;
      notes?: string;
    };

    const profit = body.transferPrice - body.fleetPrice;
    const profitPercent = body.transferPrice > 0 ? (profit / body.transferPrice) * 100 : 0;

    // Get settings to check alert threshold
    const [settings] = await db.select().from(autoDispatchSettingsTable).limit(1);
    const threshold = settings?.defaultProfitAlertThreshold ?? 10;
    const profitAlert = profitPercent < threshold;

    const [record] = await db.insert(outsourcedOrdersTable).values({
      ...body,
      profit,
      profitPercent,
      profitAlert,
      status: "pending_notify",
    }).returning();

    // Update fleet stats
    await db.update(partnerFleetsTable)
      .set({ totalOrders: sql`${partnerFleetsTable.totalOrders} + 1`, updatedAt: new Date() })
      .where(eq(partnerFleetsTable.id, body.fleetId));

    res.json(record);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/outsourcing/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;

    // Recalculate profit if prices changed
    let extra: Record<string, unknown> = {};
    if (body.transferPrice !== undefined || body.fleetPrice !== undefined) {
      const [current] = await db.select().from(outsourcedOrdersTable).where(eq(outsourcedOrdersTable.id, id));
      const tp = body.transferPrice ?? current.transferPrice;
      const fp = body.fleetPrice ?? current.fleetPrice;
      const profit = tp - fp;
      const profitPercent = tp > 0 ? (profit / tp) * 100 : 0;
      const [settings] = await db.select().from(autoDispatchSettingsTable).limit(1);
      const threshold = settings?.defaultProfitAlertThreshold ?? 10;
      extra = { profit, profitPercent, profitAlert: profitPercent < threshold };
    }

    // Track completion for reliability score
    if (body.status === "delivered") {
      const [rec] = await db.select().from(outsourcedOrdersTable).where(eq(outsourcedOrdersTable.id, id));
      if (rec?.fleetId) {
        const [fleet] = await db.select().from(partnerFleetsTable).where(eq(partnerFleetsTable.id, rec.fleetId));
        if (fleet) {
          const newCompleted = fleet.completedOrders + 1;
          const score = Math.min(100, Math.round((newCompleted / Math.max(fleet.totalOrders, 1)) * 100));
          await db.update(partnerFleetsTable)
            .set({ completedOrders: newCompleted, reliabilityScore: score, updatedAt: new Date() })
            .where(eq(partnerFleetsTable.id, rec.fleetId));
        }
      }
    }

    const [record] = await db.update(outsourcedOrdersTable)
      .set({ ...body, ...extra, updatedAt: new Date() })
      .where(eq(outsourcedOrdersTable.id, id))
      .returning();
    res.json(record);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/* Mark as notified (simulate LINE push) */
router.post("/outsourcing/orders/:id/notify", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [record] = await db.update(outsourcedOrdersTable)
      .set({ status: "notified", notificationSentAt: new Date(), updatedAt: new Date() })
      .where(eq(outsourcedOrdersTable.id, id))
      .returning();
    res.json({ ok: true, record });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/* ══════════════════════════════════════════════
   AUTO DISPATCH SETTINGS
══════════════════════════════════════════════ */

router.get("/outsourcing/settings", async (_req, res) => {
  try {
    let [settings] = await db.select().from(autoDispatchSettingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(autoDispatchSettingsTable).values({}).returning();
    }
    res.json(settings);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/outsourcing/settings", async (req, res) => {
  try {
    let [settings] = await db.select().from(autoDispatchSettingsTable).limit(1);
    if (!settings) {
      [settings] = await db.insert(autoDispatchSettingsTable).values({ ...req.body, updatedAt: new Date() }).returning();
    } else {
      [settings] = await db.update(autoDispatchSettingsTable)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(autoDispatchSettingsTable.id, settings.id))
        .returning();
    }
    res.json(settings);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

/* ══════════════════════════════════════════════
   REPORTS
══════════════════════════════════════════════ */

router.get("/outsourcing/reports/summary", async (_req, res) => {
  try {
    const rows = await db.select({
      totalOrders: sql<number>`COUNT(*)::int`,
      totalTransferRevenue: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.transferPrice}),0)::real`,
      totalFleetCost: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.fleetPrice}),0)::real`,
      totalProfit: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.profit}),0)::real`,
      avgProfitPercent: sql<number>`COALESCE(AVG(${outsourcedOrdersTable.profitPercent}),0)::real`,
      alertCount: sql<number>`COUNT(CASE WHEN ${outsourcedOrdersTable.profitAlert} THEN 1 END)::int`,
      deliveredCount: sql<number>`COUNT(CASE WHEN ${outsourcedOrdersTable.status} = 'delivered' THEN 1 END)::int`,
    }).from(outsourcedOrdersTable);
    res.json(rows[0] ?? {});
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/outsourcing/reports/by-fleet", async (_req, res) => {
  try {
    const rows = await db.select({
      fleetId: outsourcedOrdersTable.fleetId,
      fleetName: partnerFleetsTable.name,
      totalOrders: sql<number>`COUNT(*)::int`,
      totalRevenue: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.transferPrice}),0)::real`,
      totalCost: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.fleetPrice}),0)::real`,
      totalProfit: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.profit}),0)::real`,
      avgProfitPct: sql<number>`COALESCE(AVG(${outsourcedOrdersTable.profitPercent}),0)::real`,
      alertCount: sql<number>`COUNT(CASE WHEN ${outsourcedOrdersTable.profitAlert} THEN 1 END)::int`,
      reliabilityScore: partnerFleetsTable.reliabilityScore,
    })
      .from(outsourcedOrdersTable)
      .leftJoin(partnerFleetsTable, eq(outsourcedOrdersTable.fleetId, partnerFleetsTable.id))
      .groupBy(outsourcedOrdersTable.fleetId, partnerFleetsTable.name, partnerFleetsTable.reliabilityScore)
      .orderBy(desc(sql`COALESCE(SUM(${outsourcedOrdersTable.profit}),0)`));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/outsourcing/reports/monthly", async (_req, res) => {
  try {
    const rows = await db.select({
      year: sql<number>`EXTRACT(YEAR FROM ${outsourcedOrdersTable.createdAt})::int`,
      month: sql<number>`EXTRACT(MONTH FROM ${outsourcedOrdersTable.createdAt})::int`,
      orderCount: sql<number>`COUNT(*)::int`,
      revenue: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.transferPrice}),0)::real`,
      cost: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.fleetPrice}),0)::real`,
      profit: sql<number>`COALESCE(SUM(${outsourcedOrdersTable.profit}),0)::real`,
    })
      .from(outsourcedOrdersTable)
      .groupBy(
        sql`EXTRACT(YEAR FROM ${outsourcedOrdersTable.createdAt})`,
        sql`EXTRACT(MONTH FROM ${outsourcedOrdersTable.createdAt})`,
      )
      .orderBy(
        desc(sql`EXTRACT(YEAR FROM ${outsourcedOrdersTable.createdAt})`),
        desc(sql`EXTRACT(MONTH FROM ${outsourcedOrdersTable.createdAt})`),
      );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
