import { Router } from "express";
import { db } from "@workspace/db";
import { vehicleCostsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const vehicleCostsRouter = Router();

const bodySchema = z.object({
  vehicleName: z.string().min(1),
  vehicleType: z.string().optional().nullable(),
  plateNumber: z.string().optional().nullable(),
  vehicleValue: z.coerce.number().int().min(0).default(0),
  depreciationYears: z.coerce.number().int().min(1).default(5),
  residualValue: z.coerce.number().int().min(0).default(0),
  fuelConsumptionPer100km: z.coerce.number().min(0).default(10),
  fuelPricePerLiter: z.coerce.number().min(0).default(32),
  licenseTaxYearly: z.coerce.number().int().min(0).default(0),
  fuelTaxYearly: z.coerce.number().int().min(0).default(0),
  maintenanceMonthly: z.coerce.number().int().min(0).default(0),
  wearMonthly: z.coerce.number().int().min(0).default(0),
  driverSalaryMonthly: z.coerce.number().int().min(0).default(0),
  insuranceYearly: z.coerce.number().int().min(0).default(0),
  otherMonthly: z.coerce.number().int().min(0).default(0),
  workingDaysMonthly: z.coerce.number().int().min(1).default(25),
  tripsPerDay: z.coerce.number().int().min(1).default(2),
  notes: z.string().optional().nullable(),
});

// GET /api/vehicle-costs
vehicleCostsRouter.get("/vehicle-costs", async (_req, res) => {
  try {
    const rows = await db.select().from(vehicleCostsTable).orderBy(vehicleCostsTable.vehicleName);
    return res.json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/vehicle-costs
vehicleCostsRouter.post("/vehicle-costs", async (req, res) => {
  try {
    const data = bodySchema.parse(req.body);
    const [row] = await db.insert(vehicleCostsTable).values({
      vehicleName: data.vehicleName,
      vehicleType: data.vehicleType ?? null,
      plateNumber: data.plateNumber ?? null,
      vehicleValue: data.vehicleValue,
      depreciationYears: data.depreciationYears,
      residualValue: data.residualValue,
      fuelConsumptionPer100km: data.fuelConsumptionPer100km,
      fuelPricePerLiter: data.fuelPricePerLiter,
      licenseTaxYearly: data.licenseTaxYearly,
      fuelTaxYearly: data.fuelTaxYearly,
      maintenanceMonthly: data.maintenanceMonthly,
      wearMonthly: data.wearMonthly,
      driverSalaryMonthly: data.driverSalaryMonthly,
      insuranceYearly: data.insuranceYearly,
      otherMonthly: data.otherMonthly,
      workingDaysMonthly: data.workingDaysMonthly,
      tripsPerDay: data.tripsPerDay,
      notes: data.notes ?? null,
    }).returning();
    return res.json(row);
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// PUT /api/vehicle-costs/:id
vehicleCostsRouter.put("/vehicle-costs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const data = bodySchema.parse(req.body);
    const [row] = await db.update(vehicleCostsTable).set({
      vehicleName: data.vehicleName,
      vehicleType: data.vehicleType ?? null,
      plateNumber: data.plateNumber ?? null,
      vehicleValue: data.vehicleValue,
      depreciationYears: data.depreciationYears,
      residualValue: data.residualValue,
      fuelConsumptionPer100km: data.fuelConsumptionPer100km,
      fuelPricePerLiter: data.fuelPricePerLiter,
      licenseTaxYearly: data.licenseTaxYearly,
      fuelTaxYearly: data.fuelTaxYearly,
      maintenanceMonthly: data.maintenanceMonthly,
      wearMonthly: data.wearMonthly,
      driverSalaryMonthly: data.driverSalaryMonthly,
      insuranceYearly: data.insuranceYearly,
      otherMonthly: data.otherMonthly,
      workingDaysMonthly: data.workingDaysMonthly,
      tripsPerDay: data.tripsPerDay,
      notes: data.notes ?? null,
      updatedAt: new Date(),
    }).where(eq(vehicleCostsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Bad request" });
  }
});

// DELETE /api/vehicle-costs/:id
vehicleCostsRouter.delete("/vehicle-costs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    await db.delete(vehicleCostsTable).where(eq(vehicleCostsTable.id, id));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});
