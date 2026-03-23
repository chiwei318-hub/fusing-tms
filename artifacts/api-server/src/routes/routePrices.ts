import { Router } from "express";
import { db } from "@workspace/db";
import { routePricesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const routePricesRouter = Router();

const bodySchema = z.object({
  fromLocation: z.string().min(1).default("桃園平鎮"),
  toLocation: z.string().min(1),
  vehicleType: z.string().min(1),
  basePrice: z.number().int().min(0),
  waitingFeePerHour: z.number().int().min(0).optional().default(0),
  elevatorFee: z.number().int().min(0).optional().default(0),
  taxRate: z.number().min(0).max(100).optional().default(5),
  heapmachineOnly: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

// GET /api/route-prices
routePricesRouter.get("/route-prices", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(routePricesTable)
      .orderBy(routePricesTable.toLocation, routePricesTable.vehicleType);
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/route-prices
routePricesRouter.post("/route-prices", async (req, res) => {
  try {
    const data = bodySchema.parse(req.body);
    const [row] = await db.insert(routePricesTable).values({
      fromLocation: data.fromLocation,
      toLocation: data.toLocation,
      vehicleType: data.vehicleType,
      basePrice: data.basePrice,
      waitingFeePerHour: data.waitingFeePerHour,
      elevatorFee: data.elevatorFee,
      taxRate: data.taxRate,
      heapmachineOnly: data.heapmachineOnly,
      notes: data.notes ?? null,
    }).returning();
    return res.json(row);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// PUT /api/route-prices/:id
routePricesRouter.put("/route-prices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const data = bodySchema.parse(req.body);
    const [row] = await db.update(routePricesTable).set({
      fromLocation: data.fromLocation,
      toLocation: data.toLocation,
      vehicleType: data.vehicleType,
      basePrice: data.basePrice,
      waitingFeePerHour: data.waitingFeePerHour,
      elevatorFee: data.elevatorFee,
      taxRate: data.taxRate,
      heapmachineOnly: data.heapmachineOnly,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    }).where(eq(routePricesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// DELETE /api/route-prices/:id
routePricesRouter.delete("/route-prices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(routePricesTable).where(eq(routePricesTable.id, id));
    return res.json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});
