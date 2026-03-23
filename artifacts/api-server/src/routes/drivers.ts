import { Router, type IRouter } from "express";
import { db, driversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateDriverBody,
  UpdateDriverBody,
  UpdateDriverParams,
  DeleteDriverParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drivers", async (req, res) => {
  try {
    const drivers = await db
      .select()
      .from(driversTable)
      .orderBy(driversTable.createdAt);
    res.json(drivers);
  } catch (err) {
    req.log.error({ err }, "Failed to list drivers");
    res.status(500).json({ error: "Failed to list drivers" });
  }
});

router.post("/drivers", async (req, res) => {
  try {
    const body = CreateDriverBody.parse(req.body);
    const [driver] = await db
      .insert(driversTable)
      .values({
        name: body.name,
        phone: body.phone,
        vehicleType: body.vehicleType,
        licensePlate: body.licensePlate,
        lineUserId: body.lineUserId ?? null,
        driverType: body.driverType ?? null,
        username: body.username ?? null,
        password: body.password ?? null,
        status: "available",
      })
      .returning();
    res.status(201).json(driver);
  } catch (err) {
    req.log.error({ err }, "Failed to create driver");
    res.status(400).json({ error: "Failed to create driver" });
  }
});

router.patch("/drivers/:id", async (req, res) => {
  try {
    const { id } = UpdateDriverParams.parse(req.params);
    const body = UpdateDriverBody.parse(req.body);

    const existing = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Driver not found" });
    }

    const updates: Partial<typeof driversTable.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.vehicleType !== undefined) updates.vehicleType = body.vehicleType;
    if (body.licensePlate !== undefined) updates.licensePlate = body.licensePlate;
    if (body.status !== undefined) updates.status = body.status;
    if ("lineUserId" in body) updates.lineUserId = body.lineUserId ?? null;
    if ("driverType" in body) updates.driverType = body.driverType ?? null;
    if ("username" in body) updates.username = body.username ?? null;
    if ("password" in body) updates.password = body.password ?? null;
    if ("engineCc" in body) updates.engineCc = (body as any).engineCc ?? null;
    if ("vehicleYear" in body) updates.vehicleYear = (body as any).vehicleYear ?? null;
    if ("vehicleTonnage" in body) updates.vehicleTonnage = (body as any).vehicleTonnage ?? null;
    if ("vehicleBodyType" in body) updates.vehicleBodyType = (body as any).vehicleBodyType ?? null;

    const [driver] = await db
      .update(driversTable)
      .set(updates)
      .where(eq(driversTable.id, id))
      .returning();
    res.json(driver);
  } catch (err) {
    req.log.error({ err }, "Failed to update driver");
    res.status(500).json({ error: "Failed to update driver" });
  }
});

router.post("/drivers/bulk", async (req, res) => {
  try {
    const { rows } = req.body as { rows: { name: string; phone: string; vehicleType: string; licensePlate: string; driverType?: string; username?: string; password?: string }[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }
    const values = rows.map(r => ({
      name: String(r.name ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
      vehicleType: String(r.vehicleType ?? "").trim() || "機車",
      licensePlate: String(r.licensePlate ?? "").trim(),
      status: "available" as const,
      driverType: r.driverType ? String(r.driverType).trim() : null,
      username: r.username ? String(r.username).trim() : null,
      password: r.password ? String(r.password).trim() : null,
    })).filter(r => r.name && r.phone && r.licensePlate);

    if (values.length === 0) {
      return res.status(400).json({ error: "No valid rows (name, phone and licensePlate required)" });
    }
    const inserted = await db.insert(driversTable).values(values).returning();
    return res.status(201).json({ inserted: inserted.length, rows: inserted });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk import drivers");
    return res.status(500).json({ error: "Failed to bulk import drivers" });
  }
});

router.delete("/drivers/:id", async (req, res) => {
  try {
    const { id } = DeleteDriverParams.parse(req.params);
    const existing = await db
      .select()
      .from(driversTable)
      .where(eq(driversTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Driver not found" });
    }
    await db.delete(driversTable).where(eq(driversTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete driver");
    res.status(500).json({ error: "Failed to delete driver" });
  }
});

export default router;
