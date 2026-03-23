import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { partnerFleetsTable } from "@workspace/db/schema";

export const fleetRegistrationRouter = Router();

// ── 計算風險分數 ────────────────────────────────────────────────
function calcRiskScore(row: any): number {
  let score = 100;
  const completionRate = row.total_orders > 0
    ? (row.completed_orders / row.total_orders) * 100 : 100;
  if (completionRate < 90) score -= 15;
  if (completionRate < 75) score -= 20;
  if (row.avg_rating && row.avg_rating < 3.5) score -= 20;
  if (row.avg_rating && row.avg_rating < 3.0) score -= 15;
  if (row.warning_count > 0) score -= row.warning_count * 10;
  if (row.complaint_count > 0) score -= row.complaint_count * 5;
  return Math.max(0, Math.min(100, score));
}

function riskLevel(score: number) {
  if (score >= 80) return "low";
  if (score >= 60) return "medium";
  if (score >= 40) return "high";
  return "critical";
}

// ── GET /api/fleet/registrations ─────────────────────────────────
fleetRegistrationRouter.get("/fleet/registrations", async (req, res) => {
  const { status } = req.query as { status?: string };
  const rows = await db.execute(sql`
    SELECT 
      fr.*,
      COUNT(fv.id) AS vehicle_count,
      ROUND(AVG(fra.stars)::numeric, 2) AS avg_rating,
      COUNT(fra.id) AS rating_count,
      COUNT(fc.id) AS open_complaints
    FROM fleet_registrations fr
    LEFT JOIN fleet_vehicles fv ON fv.fleet_reg_id = fr.id
    LEFT JOIN fleet_ratings fra ON fra.fleet_reg_id = fr.id
    LEFT JOIN fleet_complaints fc ON fc.fleet_reg_id = fr.id AND fc.status = 'open'
    WHERE 1=1
      ${status ? sql`AND fr.status = ${status}` : sql``}
    GROUP BY fr.id
    ORDER BY fr.created_at DESC
  `);
  res.json(rows.rows);
});

// ── GET /api/fleet/registrations/:id ─────────────────────────────
fleetRegistrationRouter.get("/fleet/registrations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [reg] = (await db.execute(sql`
    SELECT fr.*,
      ROUND(AVG(fra.stars)::numeric, 2) AS avg_rating,
      COUNT(fra.id) AS rating_count
    FROM fleet_registrations fr
    LEFT JOIN fleet_ratings fra ON fra.fleet_reg_id = fr.id
    WHERE fr.id = ${id}
    GROUP BY fr.id
  `)).rows as any[];

  if (!reg) return res.status(404).json({ error: "找不到申請記錄" });

  const vehicles = (await db.execute(sql`SELECT * FROM fleet_vehicles WHERE fleet_reg_id = ${id} ORDER BY created_at`)).rows;
  const ratings = (await db.execute(sql`SELECT * FROM fleet_ratings WHERE fleet_reg_id = ${id} ORDER BY created_at DESC LIMIT 20`)).rows;
  const complaints = (await db.execute(sql`SELECT * FROM fleet_complaints WHERE fleet_reg_id = ${id} ORDER BY created_at DESC`)).rows;

  res.json({ ...reg, vehicles, ratings, complaints });
});

// ── POST /api/fleet/register (public) ────────────────────────────
fleetRegistrationRouter.post("/fleet/register", async (req, res) => {
  const {
    companyName, taxId, contactPerson, contactPhone, contactEmail,
    address, businessLicense, insuranceDoc, fleetSize, vehicleTypes,
    serviceRegions, yearsInBusiness, orderMode, notes,
  } = req.body;

  if (!companyName || !contactPerson || !contactPhone) {
    return res.status(400).json({ error: "缺少必要欄位：公司名稱、聯絡人、電話" });
  }

  const result = await db.execute(sql`
    INSERT INTO fleet_registrations (
      company_name, tax_id, contact_person, contact_phone, contact_email,
      address, business_license, insurance_doc, fleet_size, vehicle_types,
      service_regions, years_in_business, order_mode, notes
    ) VALUES (
      ${companyName}, ${taxId ?? null}, ${contactPerson}, ${contactPhone},
      ${contactEmail ?? null}, ${address ?? null}, ${businessLicense ?? null},
      ${insuranceDoc ?? null}, ${Number(fleetSize) || 1}, ${vehicleTypes ?? null},
      ${serviceRegions ?? null}, ${yearsInBusiness ?? null},
      ${orderMode ?? "grab"}, ${notes ?? null}
    ) RETURNING *
  `);

  res.status(201).json({ ok: true, registration: result.rows[0] });
});

// ── PATCH /api/fleet/registrations/:id/status ──────────────────
fleetRegistrationRouter.patch("/fleet/registrations/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status, reviewNotes, rejectionReason, commissionRate } = req.body;

  const allowedStatuses = ["pending", "reviewing", "approved", "rejected", "suspended"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "無效的狀態值" });
  }

  await db.execute(sql`
    UPDATE fleet_registrations SET
      status = ${status},
      review_notes = ${reviewNotes ?? null},
      rejection_reason = ${rejectionReason ?? null},
      commission_rate = ${commissionRate ? Number(commissionRate) : sql`commission_rate`},
      reviewed_at = CASE WHEN ${status} IN ('approved','rejected') THEN NOW() ELSE reviewed_at END,
      approved_at = CASE WHEN ${status} = 'approved' THEN NOW() ELSE approved_at END,
      suspended_at = CASE WHEN ${status} = 'suspended' THEN NOW() ELSE suspended_at END,
      suspension_reason = ${status === "suspended" && rejectionReason ? rejectionReason : sql`suspension_reason`},
      updated_at = NOW()
    WHERE id = ${id}
  `);

  // 批准時自動建立 partner_fleet 記錄
  if (status === "approved") {
    const [reg] = (await db.execute(sql`SELECT * FROM fleet_registrations WHERE id = ${id}`)).rows as any[];
    if (reg && !reg.fleet_id) {
      const newFleet = await db.execute(sql`
        INSERT INTO partner_fleets (
          name, contact_person, phone, vehicle_types, regions,
          commission_type, commission_value, rate_type, base_rate,
          status, fleet_reg_id
        ) VALUES (
          ${reg.company_name}, ${reg.contact_person}, ${reg.contact_phone},
          ${reg.vehicle_types ?? ''}, ${reg.service_regions ?? ''},
          'percent', ${reg.commission_rate ?? 20}, 'flat', 0,
          'active', ${id}
        ) RETURNING id
      `);
      const fleetId = (newFleet.rows[0] as any)?.id;
      if (fleetId) {
        await db.execute(sql`UPDATE fleet_registrations SET fleet_id = ${fleetId} WHERE id = ${id}`);
      }
    } else if (reg?.fleet_id) {
      // Re-activating: update existing partner_fleet
      await db.execute(sql`UPDATE partner_fleets SET status = 'active' WHERE id = ${reg.fleet_id}`);
    }
  }

  if (status === "suspended") {
    const [reg] = (await db.execute(sql`SELECT fleet_id FROM fleet_registrations WHERE id = ${id}`)).rows as any[];
    if (reg?.fleet_id) {
      await db.execute(sql`UPDATE partner_fleets SET status = 'suspended' WHERE id = ${reg.fleet_id}`);
    }
  }

  res.json({ ok: true, status });
});

// ── PATCH /api/fleet/registrations/:id/commission ──────────────
fleetRegistrationRouter.patch("/fleet/registrations/:id/commission", async (req, res) => {
  const { commissionRate, orderMode, minOrderValue } = req.body;
  await db.execute(sql`
    UPDATE fleet_registrations SET
      commission_rate = ${Number(commissionRate)},
      order_mode = ${orderMode},
      min_order_value = ${minOrderValue ? Number(minOrderValue) : 500},
      updated_at = NOW()
    WHERE id = ${Number(req.params.id)}
  `);
  res.json({ ok: true });
});

// ── POST /api/fleet/registrations/:id/vehicles ─────────────────
fleetRegistrationRouter.post("/fleet/registrations/:id/vehicles", async (req, res) => {
  const fleetRegId = Number(req.params.id);
  const { plate, vehicleType, brandModel, year, capacityKg, inspectionExpires, insuranceExpires } = req.body;
  if (!plate || !vehicleType) return res.status(400).json({ error: "缺少車牌和車種" });

  const result = await db.execute(sql`
    INSERT INTO fleet_vehicles (fleet_reg_id, plate, vehicle_type, brand_model, year, capacity_kg, inspection_expires, insurance_expires)
    VALUES (${fleetRegId}, ${plate}, ${vehicleType}, ${brandModel ?? null}, ${year ? Number(year) : null},
            ${capacityKg ? Number(capacityKg) : null}, ${inspectionExpires ?? null}, ${insuranceExpires ?? null})
    RETURNING *
  `);
  res.status(201).json({ ok: true, vehicle: result.rows[0] });
});

// ── DELETE /api/fleet/vehicles/:vehicleId ──────────────────────
fleetRegistrationRouter.delete("/fleet/vehicles/:vehicleId", async (req, res) => {
  await db.execute(sql`DELETE FROM fleet_vehicles WHERE id = ${Number(req.params.vehicleId)}`);
  res.json({ ok: true });
});

// ── POST /api/fleet/ratings ────────────────────────────────────
fleetRegistrationRouter.post("/fleet/ratings", async (req, res) => {
  const { fleetRegId, orderId, stars, comment, raterType = "customer" } = req.body;
  if (!fleetRegId || !stars) return res.status(400).json({ error: "缺少車隊ID和評分" });

  const result = await db.execute(sql`
    INSERT INTO fleet_ratings (fleet_reg_id, order_id, stars, comment, rater_type)
    VALUES (${Number(fleetRegId)}, ${orderId ?? null}, ${Number(stars)}, ${comment ?? null}, ${raterType})
    RETURNING *
  `);

  // Recalculate risk score
  const stats = await db.execute(sql`
    SELECT 
      fr.warning_count, fr.complaint_count,
      pf.total_orders, pf.completed_orders,
      AVG(fra.stars) AS avg_rating
    FROM fleet_registrations fr
    LEFT JOIN partner_fleets pf ON pf.id = fr.fleet_id
    LEFT JOIN fleet_ratings fra ON fra.fleet_reg_id = fr.id
    WHERE fr.id = ${Number(fleetRegId)}
    GROUP BY fr.id, pf.total_orders, pf.completed_orders
  `);
  if (stats.rows.length) {
    const newScore = calcRiskScore(stats.rows[0]);
    await db.execute(sql`UPDATE fleet_registrations SET risk_score = ${newScore}, updated_at = NOW() WHERE id = ${Number(fleetRegId)}`);
  }

  res.status(201).json({ ok: true, rating: result.rows[0] });
});

// ── POST /api/fleet/complaints ─────────────────────────────────
fleetRegistrationRouter.post("/fleet/complaints", async (req, res) => {
  const { fleetRegId, orderId, complaintType, description, severity = "medium" } = req.body;
  if (!fleetRegId || !description) return res.status(400).json({ error: "缺少車隊ID和描述" });

  await db.execute(sql`
    INSERT INTO fleet_complaints (fleet_reg_id, order_id, complaint_type, description, severity)
    VALUES (${Number(fleetRegId)}, ${orderId ?? null}, ${complaintType ?? "general"}, ${description}, ${severity})
  `);

  // Increment complaint count and recalc risk
  await db.execute(sql`
    UPDATE fleet_registrations SET 
      complaint_count = complaint_count + 1,
      updated_at = NOW()
    WHERE id = ${Number(fleetRegId)}
  `);

  // Recalculate risk score
  const stats = await db.execute(sql`
    SELECT fr.warning_count, fr.complaint_count, pf.total_orders, pf.completed_orders, AVG(fra.stars) AS avg_rating
    FROM fleet_registrations fr
    LEFT JOIN partner_fleets pf ON pf.id = fr.fleet_id
    LEFT JOIN fleet_ratings fra ON fra.fleet_reg_id = fr.id
    WHERE fr.id = ${Number(fleetRegId)}
    GROUP BY fr.id, pf.total_orders, pf.completed_orders
  `);
  if (stats.rows.length) {
    const newScore = calcRiskScore(stats.rows[0]);
    await db.execute(sql`UPDATE fleet_registrations SET risk_score = ${newScore}, updated_at = NOW() WHERE id = ${Number(fleetRegId)}`);
  }

  res.json({ ok: true });
});

// ── PATCH /api/fleet/complaints/:id/resolve ───────────────────
fleetRegistrationRouter.patch("/fleet/complaints/:id/resolve", async (req, res) => {
  const { resolution } = req.body;
  await db.execute(sql`
    UPDATE fleet_complaints SET status = 'resolved', resolution = ${resolution ?? ''}, resolved_at = NOW()
    WHERE id = ${Number(req.params.id)}
  `);
  res.json({ ok: true });
});

// ── GET /api/fleet/stats ───────────────────────────────────────
fleetRegistrationRouter.get("/fleet/stats", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'reviewing') AS reviewing,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
      ROUND(AVG(risk_score)::numeric, 1) AS avg_risk_score
    FROM fleet_registrations
  `);
  res.json(rows.rows[0]);
});
