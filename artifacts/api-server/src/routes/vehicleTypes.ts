import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vehicleTypesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const vehicleTypeBody = z.object({
  name: z.string().min(1),
  lengthM: z.number().nullable().optional(),
  widthM: z.number().nullable().optional(),
  heightM: z.number().nullable().optional(),
  volumeM3: z.number().nullable().optional(),
  maxWeightKg: z.number().nullable().optional(),
  palletCount: z.number().int().nullable().optional(),
  hasTailgate: z.boolean().optional(),
  hasRefrigeration: z.boolean().optional(),
  hasDumpBody: z.boolean().optional(),
  heightLimitM: z.number().nullable().optional(),
  weightLimitKg: z.number().nullable().optional(),
  cargoTypes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  baseFee: z.number().nullable().optional(),
});

router.get("/vehicle-types", async (_req, res) => {
  try {
    const list = await db.select().from(vehicleTypesTable).orderBy(vehicleTypesTable.id);
    return res.json(list);
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch vehicle types" });
  }
});

router.post("/vehicle-types", async (req, res) => {
  try {
    const data = vehicleTypeBody.parse(req.body);
    const [created] = await db.insert(vehicleTypesTable).values(data).returning();
    return res.status(201).json(created);
  } catch (e) {
    return res.status(400).json({ error: String(e) });
  }
});

router.put("/vehicle-types/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = vehicleTypeBody.partial().parse(req.body);
    const [updated] = await db
      .update(vehicleTypesTable)
      .set(data)
      .where(eq(vehicleTypesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (e) {
    return res.status(400).json({ error: String(e) });
  }
});

router.delete("/vehicle-types/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(vehicleTypesTable)
      .where(eq(vehicleTypesTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Not found" });
    return res.json(deleted);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

export default router;
