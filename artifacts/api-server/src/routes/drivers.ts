import { Router, type IRouter } from "express";
import { db, driversTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateDriverBody,
  UpdateDriverBody,
  UpdateDriverParams,
  DeleteDriverParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── DB Migration: add new columns if absent ──────────────────────────────────

async function ensureDriverColumns() {
  const cols = [
    "vehicle_brand TEXT",
    "has_tailgate BOOLEAN DEFAULT FALSE",
    "max_load_kg REAL",
    "max_volume_cbm REAL",
  ];
  for (const col of cols) {
    try {
      await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ${col}`);
    } catch { /* ignore */ }
  }
}
ensureDriverColumns().catch(console.error);

// ─── GET /api/drivers ─────────────────────────────────────────────────────────

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

// ─── POST /api/drivers ────────────────────────────────────────────────────────

router.post("/drivers", async (req, res) => {
  try {
    const body = CreateDriverBody.parse(req.body);
    const b = req.body as Record<string, any>;
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
        vehicleYear: b.vehicleYear ? parseInt(b.vehicleYear) : null,
        vehicleBrand: b.vehicleBrand ?? null,
        vehicleBodyType: b.vehicleBodyType ?? null,
        vehicleTonnage: b.vehicleTonnage ?? null,
        hasTailgate: b.hasTailgate ?? false,
        maxLoadKg: b.maxLoadKg ? parseFloat(b.maxLoadKg) : null,
        maxVolumeCbm: b.maxVolumeCbm ? parseFloat(b.maxVolumeCbm) : null,
        bankName: b.bankName ?? null,
        bankBranch: b.bankBranch ?? null,
        bankAccount: b.bankAccount ?? null,
        bankAccountName: b.bankAccountName ?? null,
        status: "available",
      })
      .returning();
    res.status(201).json(driver);
  } catch (err) {
    req.log.error({ err }, "Failed to create driver");
    res.status(400).json({ error: "Failed to create driver" });
  }
});

// ─── PATCH /api/drivers/:id ───────────────────────────────────────────────────

router.patch("/drivers/:id", async (req, res) => {
  try {
    const { id } = UpdateDriverParams.parse(req.params);
    const body = UpdateDriverBody.parse(req.body);
    const b = req.body as Record<string, any>;

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
    if ("username" in b) updates.username = b.username ?? null;
    if ("password" in b) updates.password = b.password ?? null;
    if ("engineCc" in b) updates.engineCc = b.engineCc ? parseInt(b.engineCc) : null;
    if ("vehicleYear" in b) updates.vehicleYear = b.vehicleYear ? parseInt(b.vehicleYear) : null;
    if ("vehicleBrand" in b) updates.vehicleBrand = b.vehicleBrand ?? null;
    if ("vehicleTonnage" in b) updates.vehicleTonnage = b.vehicleTonnage ?? null;
    if ("vehicleBodyType" in b) updates.vehicleBodyType = b.vehicleBodyType ?? null;
    if ("hasTailgate" in b) updates.hasTailgate = !!b.hasTailgate;
    if ("maxLoadKg" in b) updates.maxLoadKg = b.maxLoadKg ? parseFloat(b.maxLoadKg) : null;
    if ("maxVolumeCbm" in b) updates.maxVolumeCbm = b.maxVolumeCbm ? parseFloat(b.maxVolumeCbm) : null;
    if ("bankName" in b) updates.bankName = b.bankName ?? null;
    if ("bankBranch" in b) updates.bankBranch = b.bankBranch ?? null;
    if ("bankAccount" in b) updates.bankAccount = b.bankAccount ?? null;
    if ("bankAccountName" in b) updates.bankAccountName = b.bankAccountName ?? null;

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

// ─── POST /api/drivers/bulk ───────────────────────────────────────────────────

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

// ─── DELETE /api/drivers/:id ──────────────────────────────────────────────────

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
