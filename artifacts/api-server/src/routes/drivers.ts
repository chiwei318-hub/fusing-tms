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
    "latitude REAL",
    "longitude REAL",
    "last_location_at TIMESTAMP",
    "service_areas TEXT",
    "can_cold_chain BOOLEAN DEFAULT FALSE",
    "can_heavy_cargo BOOLEAN DEFAULT FALSE",
    "available_time_start TEXT",
    "available_time_end TEXT",
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

    // New capability/schedule fields — raw SQL since not in drizzle schema yet
    const rawFields: string[] = [];
    const rawParams: any[] = [];
    let pIdx = 1;

    if ("serviceAreas" in b) {
      rawFields.push(`service_areas = $${pIdx++}`);
      rawParams.push(b.serviceAreas != null ? JSON.stringify(b.serviceAreas) : null);
    }
    if ("canColdChain" in b) { rawFields.push(`can_cold_chain = $${pIdx++}`); rawParams.push(!!b.canColdChain); }
    if ("canHeavyCargo" in b) { rawFields.push(`can_heavy_cargo = $${pIdx++}`); rawParams.push(!!b.canHeavyCargo); }
    if ("availableTimeStart" in b) { rawFields.push(`available_time_start = $${pIdx++}`); rawParams.push(b.availableTimeStart ?? null); }
    if ("availableTimeEnd" in b) { rawFields.push(`available_time_end = $${pIdx++}`); rawParams.push(b.availableTimeEnd ?? null); }

    if (rawFields.length > 0) {
      rawParams.push(id);
      await pool.query(
        `UPDATE drivers SET ${rawFields.join(", ")} WHERE id = $${pIdx}`,
        rawParams,
      );
    }

    const { rows } = await pool.query(`SELECT * FROM drivers WHERE id = $1`, [id]);
    res.json(rows[0] ?? updates);
  } catch (err) {
    req.log.error({ err }, "Failed to update driver");
    res.status(500).json({ error: "Failed to update driver" });
  }
});

// ─── POST /api/drivers/:id/location — update GPS coordinates ─────────────────

router.post("/drivers/:id/location", async (req, res) => {
  const id = Number(req.params.id);
  const { latitude, longitude } = req.body as { latitude: number; longitude: number };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return res.status(400).json({ error: "latitude and longitude required" });
  }
  await pool.query(
    `UPDATE drivers SET latitude = $1, longitude = $2, last_location_at = NOW() WHERE id = $3`,
    [latitude, longitude, id],
  );
  res.json({ ok: true, latitude, longitude });
});

// ─── GET /api/drivers/analytics — order accept/reject rates per driver ────────

router.get("/drivers/analytics", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      d.id,
      d.name,
      d.vehicle_type,
      d.license_plate,
      d.status,
      d.latitude,
      d.longitude,
      d.last_location_at,
      d.service_areas,
      d.can_cold_chain,
      d.can_heavy_cargo,
      d.available_time_start,
      d.available_time_end,
      COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS completed_count,
      COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_count,
      COUNT(o.id) FILTER (WHERE o.status IN ('delivered','cancelled')) AS total_responded,
      ROUND(
        100.0 * COUNT(o.id) FILTER (WHERE o.status = 'delivered') /
        NULLIF(COUNT(o.id) FILTER (WHERE o.status IN ('delivered','cancelled')), 0),
        1
      ) AS accept_rate,
      ROUND(AVG(r.stars)::numeric, 2) AS avg_stars,
      COALESCE(SUM(o.total_fee) FILTER (WHERE o.status = 'delivered' AND o.created_at >= NOW() - INTERVAL '30 days'), 0) AS month_earnings
    FROM drivers d
    LEFT JOIN orders o ON o.driver_id = d.id
    LEFT JOIN driver_ratings r ON r.driver_id = d.id
    GROUP BY d.id, d.name, d.vehicle_type, d.license_plate, d.status,
             d.latitude, d.longitude, d.last_location_at,
             d.service_areas, d.can_cold_chain, d.can_heavy_cargo,
             d.available_time_start, d.available_time_end
    ORDER BY month_earnings DESC
  `);
  res.json(rows);
});

// ─── GET /api/drivers/:id/profile — full raw row including extended fields ────

router.get("/drivers/:id/profile", async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(`SELECT * FROM drivers WHERE id = $1`, [id]);
  if (!rows.length) return res.status(404).json({ error: "Not found" });
  const r = rows[0];
  res.json({
    ...r,
    service_areas: r.service_areas ? JSON.parse(r.service_areas) : [],
  });
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

// ─── GET /api/admin/drivers/:id/commission  (admin only, hidden from drivers) ─
router.get("/admin/drivers/:id/commission", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT id, name, license_plate, vehicle_type,
              COALESCE(commission_rate, 15)       AS commission_rate,
              COALESCE(monthly_affiliation_fee, 0) AS monthly_affiliation_fee
       FROM drivers WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch commission" });
  }
});

// ─── PATCH /api/admin/drivers/:id/commission ─────────────────────────────────
router.patch("/admin/drivers/:id/commission", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { commissionRate, monthlyAffiliationFee } = req.body as {
      commissionRate?: number;
      monthlyAffiliationFee?: number;
    };
    const updates: string[] = [];
    const values: unknown[] = [];
    if (commissionRate !== undefined) {
      values.push(Number(commissionRate));
      updates.push(`commission_rate = $${values.length}`);
    }
    if (monthlyAffiliationFee !== undefined) {
      values.push(Number(monthlyAffiliationFee));
      updates.push(`monthly_affiliation_fee = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(id);
    await pool.query(`UPDATE drivers SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update commission" });
  }
});

// ─── GET /api/admin/drivers/commissions  (list all) ──────────────────────────
router.get("/admin/drivers/commissions", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, license_plate, vehicle_type, status,
              COALESCE(commission_rate, 15)       AS commission_rate,
              COALESCE(monthly_affiliation_fee, 0) AS monthly_affiliation_fee
       FROM drivers ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

export default router;
