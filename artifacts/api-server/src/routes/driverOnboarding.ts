import { Router } from "express";
import { db } from "@workspace/db";
import { driversTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const driverOnboardingRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isExpiringSoon(dateStr: string | null, days = 30): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const diff = (d.getTime() - Date.now()) / 86400000;
  return diff >= 0 && diff <= days;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

// ─── POST /api/driver-applications (public) ────────────────────────────────────

driverOnboardingRouter.post("/driver-applications", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(2),
      phone: z.string().min(8),
      idNumber: z.string().optional(),
      address: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      vehicleType: z.string().optional(),
      vehicleTonnage: z.string().optional(),
      maxLoadKg: z.coerce.number().optional(),
      licensePlate: z.string().optional(),
      vehicleYear: z.coerce.number().optional(),
      vehicleBodyType: z.string().optional(),
      hasTailgate: z.boolean().optional(),
      hasRefrigeration: z.boolean().optional(),
      hasHydraulicPallet: z.boolean().optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);

    // Check for duplicate phone
    const existing = await db.execute(sql`
      SELECT id, status FROM driver_applications WHERE phone = ${data.phone} ORDER BY created_at DESC LIMIT 1
    `);
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as any;
      if (row.status === "pending" || row.status === "approved") {
        return res.status(409).json({ error: "此電話號碼已有申請記錄", existingId: row.id, status: row.status });
      }
    }

    const result = await db.execute(sql`
      INSERT INTO driver_applications
        (name, phone, id_number, address, email, vehicle_type, vehicle_tonnage,
         max_load_kg, license_plate, vehicle_year, vehicle_body_type,
         has_tailgate, has_refrigeration, has_hydraulic_pallet, notes,
         status, created_at, updated_at)
      VALUES (
        ${data.name}, ${data.phone}, ${data.idNumber ?? null}, ${data.address ?? null},
        ${data.email || null}, ${data.vehicleType ?? null}, ${data.vehicleTonnage ?? null},
        ${data.maxLoadKg ?? null}, ${data.licensePlate ?? null}, ${data.vehicleYear ?? null},
        ${data.vehicleBodyType ?? null}, ${data.hasTailgate ?? false},
        ${data.hasRefrigeration ?? false}, ${data.hasHydraulicPallet ?? false},
        ${data.notes ?? null}, 'pending', NOW(), NOW()
      )
      RETURNING id
    `);
    const appId = (result.rows[0] as any).id;
    return res.status(201).json({ success: true, applicationId: appId });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "申請失敗" });
  }
});

// ─── GET /api/driver-applications/status/:phone (public) ──────────────────────

driverOnboardingRouter.get("/driver-applications/status/:phone", async (req, res) => {
  try {
    const phone = req.params.phone;
    const rows = await db.execute(sql`
      SELECT id, name, status, rejection_reason, contract_signed, created_at, reviewed_at
      FROM driver_applications WHERE phone = ${phone} ORDER BY created_at DESC LIMIT 1
    `);
    if (!rows.rows.length) return res.status(404).json({ error: "找不到申請記錄" });
    return res.json(rows.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/driver-applications (admin) ─────────────────────────────────────

driverOnboardingRouter.get("/driver-applications", async (req, res) => {
  try {
    const status = (req.query as any).status as string | undefined;
    let q = sql`SELECT * FROM driver_applications`;
    if (status) q = sql`SELECT * FROM driver_applications WHERE status = ${status}`;
    q = sql`${q} ORDER BY created_at DESC`;
    const rows = await db.execute(q);

    // Count docs per application
    const docCounts = await db.execute(sql`
      SELECT application_id, COUNT(*) AS doc_count FROM driver_documents GROUP BY application_id
    `);
    const docMap: Record<number, number> = {};
    for (const r of docCounts.rows as any[]) docMap[r.application_id] = parseInt(r.doc_count);

    return res.json(rows.rows.map((r: any) => ({ ...r, docCount: docMap[r.id] ?? 0 })));
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/driver-applications/:id (admin) ─────────────────────────────────

driverOnboardingRouter.get("/driver-applications/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await db.execute(sql`SELECT * FROM driver_applications WHERE id = ${id}`);
    if (!rows.rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(rows.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── PUT /api/driver-applications/:id/review (admin) ──────────────────────────

driverOnboardingRouter.put("/driver-applications/:id/review", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      action: z.enum(["approve", "reject"]),
      reviewedBy: z.string().optional(),
      rejectionReason: z.string().optional(),
    });
    const data = schema.parse(req.body);

    if (data.action === "approve") {
      // Get application data
      const app = await db.execute(sql`SELECT * FROM driver_applications WHERE id = ${id}`);
      if (!app.rows.length) return res.status(404).json({ error: "Not found" });
      const a = app.rows[0] as any;

      await db.execute(sql`
        UPDATE driver_applications SET status = 'approved', reviewed_by = ${data.reviewedBy ?? "admin"},
        reviewed_at = NOW(), updated_at = NOW() WHERE id = ${id}
      `);

      // Create driver account if not exists
      const existingDriver = await db.execute(sql`
        SELECT id FROM drivers WHERE phone = ${a.phone} LIMIT 1
      `);

      if (!existingDriver.rows.length) {
        await db.execute(sql`
          INSERT INTO drivers (name, phone, vehicle_type, license_plate, status,
            vehicle_tonnage, has_tailgate, has_refrigeration, has_hydraulic_pallet,
            max_load_kg, contract_signed, application_id, rating, created_at)
          VALUES (${a.name}, ${a.phone}, ${a.vehicle_type ?? '箱型車'}, ${a.license_plate ?? 'TBD'},
            'offline', ${a.vehicle_tonnage ?? null}, ${a.has_tailgate ?? false},
            ${a.has_refrigeration ?? false}, ${a.has_hydraulic_pallet ?? false},
            ${a.max_load_kg ?? null}, false, ${id}, 5.0, NOW())
        `);
      } else {
        const driverId = (existingDriver.rows[0] as any).id;
        await db.execute(sql`
          UPDATE drivers SET application_id = ${id} WHERE id = ${driverId}
        `);
      }

      return res.json({ success: true, action: "approved" });
    } else {
      if (!data.rejectionReason) return res.status(400).json({ error: "退件原因為必填" });
      await db.execute(sql`
        UPDATE driver_applications SET status = 'rejected',
        rejection_reason = ${data.rejectionReason}, reviewed_by = ${data.reviewedBy ?? "admin"},
        reviewed_at = NOW(), updated_at = NOW() WHERE id = ${id}
      `);
      return res.json({ success: true, action: "rejected" });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/driver-applications/:id/documents ──────────────────────────────

driverOnboardingRouter.post("/driver-applications/:id/documents", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      docType: z.string(),
      docLabel: z.string().optional(),
      filename: z.string().optional(),
      fileData: z.string().optional(), // base64 data URL
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      expiryDate: z.string().optional(),
    });
    const data = schema.parse(req.body);

    // Delete existing doc of same type for this application
    await db.execute(sql`
      DELETE FROM driver_documents WHERE application_id = ${id} AND doc_type = ${data.docType}
    `);

    await db.execute(sql`
      INSERT INTO driver_documents (application_id, doc_type, doc_label, filename, file_data, file_size, mime_type, expiry_date)
      VALUES (${id}, ${data.docType}, ${data.docLabel ?? null}, ${data.filename ?? null},
              ${data.fileData ?? null}, ${data.fileSize ?? null}, ${data.mimeType ?? null},
              ${data.expiryDate ?? null})
    `);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── GET /api/driver-applications/:id/documents ───────────────────────────────

driverOnboardingRouter.get("/driver-applications/:id/documents", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await db.execute(sql`
      SELECT id, application_id, doc_type, doc_label, filename, file_size, mime_type, expiry_date, uploaded_at,
             CASE WHEN file_data IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
      FROM driver_documents WHERE application_id = ${id} ORDER BY uploaded_at
    `);
    return res.json(rows.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/driver-applications/:id/documents/:docId/file ───────────────────

driverOnboardingRouter.get("/driver-applications/:id/documents/:docId/file", async (req, res) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    const rows = await db.execute(sql`
      SELECT file_data, mime_type, filename FROM driver_documents WHERE id = ${docId}
    `);
    if (!rows.rows.length) return res.status(404).json({ error: "Not found" });
    const doc = rows.rows[0] as any;
    if (!doc.file_data) return res.status(404).json({ error: "No file data" });

    // file_data is a base64 data URL
    const match = doc.file_data.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mime = match[1]!;
      const buf = Buffer.from(match[2]!, "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `inline; filename="${doc.filename ?? 'document'}"`);
      return res.send(buf);
    }
    return res.json({ fileData: doc.file_data });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── POST /api/driver-applications/:id/sign-contract ─────────────────────────

driverOnboardingRouter.post("/driver-applications/:id/sign-contract", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      agreedToTerms: z.boolean(),
      signedName: z.string(),
    });
    const data = schema.parse(req.body);
    if (!data.agreedToTerms) return res.status(400).json({ error: "必須同意條款" });

    const ip = req.ip ?? "unknown";
    await db.execute(sql`
      UPDATE driver_applications SET contract_signed = TRUE, contract_signed_at = NOW(),
      contract_signed_ip = ${ip}, updated_at = NOW() WHERE id = ${id}
    `);

    // Update driver if exists
    await db.execute(sql`
      UPDATE drivers SET contract_signed = TRUE, contract_signed_at = NOW()
      WHERE application_id = ${id}
    `);

    return res.json({ success: true, signedAt: new Date().toISOString() });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/drivers/:id/suspend ─────────────────────────────────────────────

driverOnboardingRouter.put("/drivers/:id/suspend", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({ reason: z.string().min(2), lift: z.boolean().optional() });
    const data = schema.parse(req.body);
    if (data.lift) {
      await db.execute(sql`UPDATE drivers SET is_suspended = FALSE, suspend_reason = NULL WHERE id = ${id}`);
      return res.json({ success: true, action: "unsuspended" });
    }
    await db.execute(sql`UPDATE drivers SET is_suspended = TRUE, suspend_reason = ${data.reason} WHERE id = ${id}`);
    return res.json({ success: true, action: "suspended" });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/drivers/:id/blacklist ───────────────────────────────────────────

driverOnboardingRouter.put("/drivers/:id/blacklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({ reason: z.string().min(2), lift: z.boolean().optional() });
    const data = schema.parse(req.body);
    if (data.lift) {
      await db.execute(sql`UPDATE drivers SET is_blacklisted = FALSE, blacklist_reason = NULL WHERE id = ${id}`);
      await db.execute(sql`UPDATE driver_blacklist SET lifted_at = NOW(), lifted_by = 'admin' WHERE driver_id = ${id} AND lifted_at IS NULL`);
      return res.json({ success: true, action: "lifted" });
    }
    await db.execute(sql`UPDATE drivers SET is_blacklisted = TRUE, blacklist_reason = ${data.reason}, status = 'offline' WHERE id = ${id}`);
    await db.execute(sql`INSERT INTO driver_blacklist (driver_id, reason, created_by) VALUES (${id}, ${data.reason}, 'admin')`);
    return res.json({ success: true, action: "blacklisted" });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/drivers/:id/toggle-online ───────────────────────────────────────

driverOnboardingRouter.put("/drivers/:id/toggle-online", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, id)).limit(1);
    if (!driver) return res.status(404).json({ error: "Not found" });

    const d = driver as any;
    if (d.is_blacklisted) return res.status(403).json({ error: "帳號已加入黑名單，無法上線" });
    if (d.is_suspended) return res.status(403).json({ error: "帳號已停權，無法上線" });
    if (!d.contract_signed) return res.status(403).json({ error: "請先完成電子簽署合約" });

    const newStatus = d.status === "offline" ? "available" : "offline";
    await db.execute(sql`UPDATE drivers SET status = ${newStatus} WHERE id = ${id}`);
    return res.json({ success: true, status: newStatus });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/drivers/expiring-docs ───────────────────────────────────────────

driverOnboardingRouter.get("/drivers/expiring-docs", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT d.id, d.name, d.phone, d.license_expiry, d.vehicle_reg_expiry, d.insurance_expiry, d.status
      FROM drivers d
      WHERE d.license_expiry IS NOT NULL OR d.vehicle_reg_expiry IS NOT NULL OR d.insurance_expiry IS NOT NULL
    `);
    const result = (rows.rows as any[]).map(d => {
      const warnings: string[] = [];
      if (isExpired(d.license_expiry)) warnings.push("駕照已過期");
      else if (isExpiringSoon(d.license_expiry)) warnings.push(`駕照 ${d.license_expiry} 到期`);
      if (isExpired(d.vehicle_reg_expiry)) warnings.push("行照已過期");
      else if (isExpiringSoon(d.vehicle_reg_expiry)) warnings.push(`行照 ${d.vehicle_reg_expiry} 到期`);
      if (isExpired(d.insurance_expiry)) warnings.push("保險已過期");
      else if (isExpiringSoon(d.insurance_expiry)) warnings.push(`保險 ${d.insurance_expiry} 到期`);
      return { ...d, warnings, hasWarning: warnings.length > 0 };
    }).filter(d => d.hasWarning);
    return res.json(result);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/drivers (extended with new fields) ──────────────────────────────

driverOnboardingRouter.get("/drivers/extended", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT d.*, da.status AS app_status
      FROM drivers d
      LEFT JOIN driver_applications da ON d.application_id = da.id
      ORDER BY d.created_at DESC
    `);
    return res.json(rows.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});
