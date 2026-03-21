import { Router, type IRouter } from "express";
import { db, vehicleLicensesTable, driversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const LicenseBody = z.object({
  driverId: z.number().nullable().optional(),
  licenseType: z.string(),
  licenseNumber: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerPhone: z.string().nullable().optional(),
  vehiclePlate: z.string().nullable().optional(),
  issuedDate: z.string().nullable().optional(),
  expiryDate: z.string(),
  notes: z.string().nullable().optional(),
});

router.get("/licenses", async (req, res) => {
  try {
    const licenses = await db
      .select()
      .from(vehicleLicensesTable)
      .orderBy(vehicleLicensesTable.expiryDate);
    res.json(licenses);
  } catch (err) {
    req.log.error({ err }, "Failed to list licenses");
    res.status(500).json({ error: "Failed to list licenses" });
  }
});

router.post("/licenses", async (req, res) => {
  try {
    const body = LicenseBody.parse(req.body);
    const [license] = await db.insert(vehicleLicensesTable).values({
      driverId: body.driverId ?? null,
      licenseType: body.licenseType,
      licenseNumber: body.licenseNumber ?? null,
      ownerName: body.ownerName ?? null,
      ownerPhone: body.ownerPhone ?? null,
      vehiclePlate: body.vehiclePlate ?? null,
      issuedDate: body.issuedDate ?? null,
      expiryDate: body.expiryDate,
      notes: body.notes ?? null,
    }).returning();
    res.status(201).json(license);
  } catch (err) {
    req.log.error({ err }, "Failed to create license");
    res.status(400).json({ error: "Failed to create license" });
  }
});

router.put("/licenses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = LicenseBody.parse(req.body);
    const [license] = await db.update(vehicleLicensesTable)
      .set({
        driverId: body.driverId ?? null,
        licenseType: body.licenseType,
        licenseNumber: body.licenseNumber ?? null,
        ownerName: body.ownerName ?? null,
        ownerPhone: body.ownerPhone ?? null,
        vehiclePlate: body.vehiclePlate ?? null,
        issuedDate: body.issuedDate ?? null,
        expiryDate: body.expiryDate,
        notes: body.notes ?? null,
      })
      .where(eq(vehicleLicensesTable.id, id))
      .returning();
    if (!license) return res.status(404).json({ error: "Not found" });
    res.json(license);
  } catch (err) {
    req.log.error({ err }, "Failed to update license");
    res.status(400).json({ error: "Failed to update license" });
  }
});

router.delete("/licenses/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(vehicleLicensesTable).where(eq(vehicleLicensesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete license");
    res.status(500).json({ error: "Failed to delete license" });
  }
});

export default router;
