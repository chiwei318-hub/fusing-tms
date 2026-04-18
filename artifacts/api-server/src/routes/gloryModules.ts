import { Router } from "express";
import { pool } from "@workspace/db";

export const gloryModulesRouter = Router();

// ══════════════════════════════════════════════════════════
// 車輛基本資料
// ══════════════════════════════════════════════════════════

gloryModulesRouter.get("/vehicles", async (req, res) => {
  try {
    const { search, status } = req.query as Record<string, string>;
    let q = `SELECT * FROM vehicles WHERE 1=1`;
    const p: any[] = [];
    if (search) { p.push(`%${search}%`); q += ` AND (plate_no ILIKE $${p.length} OR brand ILIKE $${p.length} OR owner_name ILIKE $${p.length} OR assigned_driver ILIKE $${p.length})`; }
    if (status) { p.push(status); q += ` AND status = $${p.length}`; }
    q += ` ORDER BY plate_no`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.get("/vehicles/:id", async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM vehicles WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    const [tax, ins, etag] = await Promise.all([
      pool.query(`SELECT * FROM vehicle_tax WHERE vehicle_id=$1 ORDER BY tax_year DESC, tax_type`, [req.params.id]),
      pool.query(`SELECT * FROM vehicle_insurance WHERE vehicle_id=$1 ORDER BY end_date DESC`, [req.params.id]),
      pool.query(`SELECT * FROM vehicle_etag WHERE vehicle_id=$1 ORDER BY bind_date DESC`, [req.params.id]),
    ]);
    res.json({ ...r.rows[0], tax: tax.rows, insurance: ins.rows, etag: etag.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.post("/vehicles", async (req, res) => {
  try {
    const {
      plateNo, vehicleNo, branchCompany, vehicleType, vehicleCategory, vehicleModelType,
      brand, model, year, mfgMonth, color, vin, engineNo,
      grossWeight, emptyWeightKg, maxLoadKg, maxCubicFeet, maxPallets,
      ownerName, ownerId, assignedDriver, driverCode, fleetId, status,
      purchaseDate, licenseIssueDate, deregisterDate, dealerSponsorDate,
      notes, isLegalId, innerLengthCm, innerWidthCm, innerHeightCm, liftHeightCm,
      tireSize, engineCc, fuelType, gpsVendor, gpsCost, simNo, subVehicleCode,
      weighingCount, insuranceKm, nextMaintenanceKm, fuelConsumption, perTripFee, gateType,
    } = req.body;
    if (!plateNo) return res.status(400).json({ error: "plate_no required" });
    const r = await pool.query(
      `INSERT INTO vehicles (
        plate_no,vehicle_no,branch_company,vehicle_type,vehicle_category,vehicle_model_type,
        brand,model,year,mfg_month,color,vin,engine_no,
        gross_weight,empty_weight_kg,max_load_kg,max_cubic_feet,max_pallets,
        owner_name,owner_id,assigned_driver,driver_code,fleet_id,status,
        purchase_date,license_issue_date,deregister_date,dealer_sponsor_date,
        notes,is_legal_id,inner_length_cm,inner_width_cm,inner_height_cm,lift_height_cm,
        tire_size,engine_cc,fuel_type,gps_vendor,gps_cost,sim_no,sub_vehicle_code,
        weighing_count,insurance_km,next_maintenance_km,fuel_consumption,per_trip_fee,gate_type
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
        $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47
      ) RETURNING *`,
      [
        plateNo, vehicleNo||null, branchCompany||null, vehicleType||null, vehicleCategory||null, vehicleModelType||null,
        brand||null, model||null, year||null, mfgMonth||null, color||null, vin||null, engineNo||null,
        grossWeight||null, emptyWeightKg||null, maxLoadKg||null, maxCubicFeet||null, maxPallets||null,
        ownerName||null, ownerId||null, assignedDriver||null, driverCode||null, fleetId||null, status||"active",
        purchaseDate||null, licenseIssueDate||null, deregisterDate||null, dealerSponsorDate||null,
        notes||null, isLegalId||"Y", innerLengthCm||null, innerWidthCm||null, innerHeightCm||null, liftHeightCm||null,
        tireSize||null, engineCc||null, fuelType||null, gpsVendor||null, gpsCost||null, simNo||null, subVehicleCode||null,
        weighingCount||0, insuranceKm||null, nextMaintenanceKm||null, fuelConsumption||null, perTripFee||null, gateType||null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.put("/vehicles/:id", async (req, res) => {
  try {
    const {
      plateNo, vehicleNo, branchCompany, vehicleType, vehicleCategory, vehicleModelType,
      brand, model, year, mfgMonth, color, vin, engineNo,
      grossWeight, emptyWeightKg, maxLoadKg, maxCubicFeet, maxPallets,
      ownerName, ownerId, assignedDriver, driverCode, fleetId, status,
      purchaseDate, licenseIssueDate, deregisterDate, dealerSponsorDate,
      notes, isLegalId, innerLengthCm, innerWidthCm, innerHeightCm, liftHeightCm,
      tireSize, engineCc, fuelType, gpsVendor, gpsCost, simNo, subVehicleCode,
      weighingCount, insuranceKm, nextMaintenanceKm, fuelConsumption, perTripFee, gateType,
    } = req.body;
    const r = await pool.query(
      `UPDATE vehicles SET
        plate_no=$1,vehicle_no=$2,branch_company=$3,vehicle_type=$4,vehicle_category=$5,vehicle_model_type=$6,
        brand=$7,model=$8,year=$9,mfg_month=$10,color=$11,vin=$12,engine_no=$13,
        gross_weight=$14,empty_weight_kg=$15,max_load_kg=$16,max_cubic_feet=$17,max_pallets=$18,
        owner_name=$19,owner_id=$20,assigned_driver=$21,driver_code=$22,fleet_id=$23,status=$24,
        purchase_date=$25,license_issue_date=$26,deregister_date=$27,dealer_sponsor_date=$28,
        notes=$29,is_legal_id=$30,inner_length_cm=$31,inner_width_cm=$32,inner_height_cm=$33,lift_height_cm=$34,
        tire_size=$35,engine_cc=$36,fuel_type=$37,gps_vendor=$38,gps_cost=$39,sim_no=$40,sub_vehicle_code=$41,
        weighing_count=$42,insurance_km=$43,next_maintenance_km=$44,fuel_consumption=$45,per_trip_fee=$46,gate_type=$47,
        updated_at=NOW()
       WHERE id=$48 RETURNING *`,
      [
        plateNo, vehicleNo||null, branchCompany||null, vehicleType||null, vehicleCategory||null, vehicleModelType||null,
        brand||null, model||null, year||null, mfgMonth||null, color||null, vin||null, engineNo||null,
        grossWeight||null, emptyWeightKg||null, maxLoadKg||null, maxCubicFeet||null, maxPallets||null,
        ownerName||null, ownerId||null, assignedDriver||null, driverCode||null, fleetId||null, status||"active",
        purchaseDate||null, licenseIssueDate||null, deregisterDate||null, dealerSponsorDate||null,
        notes||null, isLegalId||"Y", innerLengthCm||null, innerWidthCm||null, innerHeightCm||null, liftHeightCm||null,
        tireSize||null, engineCc||null, fuelType||null, gpsVendor||null, gpsCost||null, simNo||null, subVehicleCode||null,
        weighingCount||0, insuranceKm||null, nextMaintenanceKm||null, fuelConsumption||null, perTripFee||null, gateType||null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.delete("/vehicles/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM vehicles WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 稅務 ──
gloryModulesRouter.get("/vehicles/:id/tax", async (req, res) => {
  try { const r = await pool.query(`SELECT * FROM vehicle_tax WHERE vehicle_id=$1 ORDER BY tax_year DESC,tax_type`, [req.params.id]); res.json(r.rows); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.post("/vehicles/:id/tax", async (req, res) => {
  try {
    const { taxYear, taxType, amount, dueDate, paidDate, paidAmount, receiptNo, status, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO vehicle_tax (vehicle_id,tax_year,tax_type,amount,due_date,paid_date,paid_amount,receipt_no,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, taxYear, taxType||"牌照稅", amount||0, dueDate||null, paidDate||null, paidAmount||null, receiptNo||null, status||"unpaid", notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.put("/vehicle-tax/:id", async (req, res) => {
  try {
    const { taxYear, taxType, amount, dueDate, paidDate, paidAmount, receiptNo, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE vehicle_tax SET tax_year=$1,tax_type=$2,amount=$3,due_date=$4,paid_date=$5,paid_amount=$6,receipt_no=$7,status=$8,notes=$9 WHERE id=$10 RETURNING *`,
      [taxYear, taxType||"牌照稅", amount||0, dueDate||null, paidDate||null, paidAmount||null, receiptNo||null, status||"unpaid", notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.delete("/vehicle-tax/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM vehicle_tax WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 保險 ──
gloryModulesRouter.get("/vehicles/:id/insurance", async (req, res) => {
  try { const r = await pool.query(`SELECT * FROM vehicle_insurance WHERE vehicle_id=$1 ORDER BY end_date DESC`, [req.params.id]); res.json(r.rows); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.post("/vehicles/:id/insurance", async (req, res) => {
  try {
    const { insuranceType, insurer, policyNo, startDate, endDate, premium, coverageAmount, agentName, agentPhone, status, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO vehicle_insurance (vehicle_id,insurance_type,insurer,policy_no,start_date,end_date,premium,coverage_amount,agent_name,agent_phone,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.id, insuranceType||"強制險", insurer||null, policyNo||null, startDate||null, endDate||null, premium||null, coverageAmount||null, agentName||null, agentPhone||null, status||"active", notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.put("/vehicle-insurance/:id", async (req, res) => {
  try {
    const { insuranceType, insurer, policyNo, startDate, endDate, premium, coverageAmount, agentName, agentPhone, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE vehicle_insurance SET insurance_type=$1,insurer=$2,policy_no=$3,start_date=$4,end_date=$5,premium=$6,coverage_amount=$7,agent_name=$8,agent_phone=$9,status=$10,notes=$11 WHERE id=$12 RETURNING *`,
      [insuranceType||"強制險", insurer||null, policyNo||null, startDate||null, endDate||null, premium||null, coverageAmount||null, agentName||null, agentPhone||null, status||"active", notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.delete("/vehicle-insurance/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM vehicle_insurance WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── eTag ──
gloryModulesRouter.get("/vehicles/:id/etag", async (req, res) => {
  try { const r = await pool.query(`SELECT * FROM vehicle_etag WHERE vehicle_id=$1 ORDER BY bind_date DESC`, [req.params.id]); res.json(r.rows); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.post("/vehicles/:id/etag", async (req, res) => {
  try {
    const { etagNo, bindDate, status, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO vehicle_etag (vehicle_id,etag_no,bind_date,status,notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, etagNo, bindDate||null, status||"active", notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.put("/vehicle-etag/:id", async (req, res) => {
  try {
    const { etagNo, bindDate, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE vehicle_etag SET etag_no=$1,bind_date=$2,status=$3,notes=$4 WHERE id=$5 RETURNING *`,
      [etagNo, bindDate||null, status||"active", notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
gloryModulesRouter.delete("/vehicle-etag/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM vehicle_etag WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// 油料記錄
// ══════════════════════════════════════════════════════════

gloryModulesRouter.get("/fuel-records", async (req, res) => {
  try {
    const { search, vehicleId, dateFrom, dateTo } = req.query as Record<string, string>;
    let q = `SELECT f.*, v.vehicle_type FROM fuel_records f LEFT JOIN vehicles v ON v.id=f.vehicle_id WHERE 1=1`;
    const p: any[] = [];
    if (search) { p.push(`%${search}%`); q += ` AND (f.plate_no ILIKE $${p.length} OR f.driver_name ILIKE $${p.length} OR f.station_name ILIKE $${p.length})`; }
    if (vehicleId) { p.push(vehicleId); q += ` AND f.vehicle_id=$${p.length}`; }
    if (dateFrom) { p.push(dateFrom); q += ` AND f.fuel_date>=$${p.length}`; }
    if (dateTo) { p.push(dateTo); q += ` AND f.fuel_date<=$${p.length}`; }
    q += ` ORDER BY f.fuel_date DESC, f.id DESC`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.post("/fuel-records", async (req, res) => {
  try {
    const { vehicleId, plateNo, fuelDate, fuelType, liters, unitPrice, totalAmount, mileage, stationName, driverName, receiptNo, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO fuel_records (vehicle_id,plate_no,fuel_date,fuel_type,liters,unit_price,total_amount,mileage,station_name,driver_name,receipt_no,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [vehicleId||null, plateNo||null, fuelDate, fuelType||"柴油", liters||0, unitPrice||0, totalAmount||0, mileage||null, stationName||null, driverName||null, receiptNo||null, notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.put("/fuel-records/:id", async (req, res) => {
  try {
    const { vehicleId, plateNo, fuelDate, fuelType, liters, unitPrice, totalAmount, mileage, stationName, driverName, receiptNo, notes } = req.body;
    const r = await pool.query(
      `UPDATE fuel_records SET vehicle_id=$1,plate_no=$2,fuel_date=$3,fuel_type=$4,liters=$5,unit_price=$6,total_amount=$7,mileage=$8,station_name=$9,driver_name=$10,receipt_no=$11,notes=$12 WHERE id=$13 RETURNING *`,
      [vehicleId||null, plateNo||null, fuelDate, fuelType||"柴油", liters||0, unitPrice||0, totalAmount||0, mileage||null, stationName||null, driverName||null, receiptNo||null, notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.delete("/fuel-records/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM fuel_records WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// 油料統計（比較報表）
gloryModulesRouter.get("/fuel-records/stats", async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query as Record<string, string>;
    let where = "WHERE 1=1";
    const p: any[] = [];
    if (dateFrom) { p.push(dateFrom); where += ` AND fuel_date>=$${p.length}`; }
    if (dateTo)   { p.push(dateTo);   where += ` AND fuel_date<=$${p.length}`; }
    const r = await pool.query(
      `SELECT plate_no, fuel_type, SUM(liters) AS total_liters, SUM(total_amount) AS total_amount, COUNT(*) AS fill_count, AVG(liters) AS avg_liters
       FROM fuel_records ${where} GROUP BY plate_no, fuel_type ORDER BY total_amount DESC`,
      p
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// 司機獎金
// ══════════════════════════════════════════════════════════

gloryModulesRouter.get("/driver-bonus", async (req, res) => {
  try {
    const { search, status, dateFrom, dateTo } = req.query as Record<string, string>;
    let q = `SELECT * FROM driver_bonus WHERE 1=1`;
    const p: any[] = [];
    if (search)   { p.push(`%${search}%`); q += ` AND (driver_name ILIKE $${p.length} OR bonus_type ILIKE $${p.length} OR reason ILIKE $${p.length})`; }
    if (status)   { p.push(status);   q += ` AND status=$${p.length}`; }
    if (dateFrom) { p.push(dateFrom); q += ` AND bonus_date>=$${p.length}`; }
    if (dateTo)   { p.push(dateTo);   q += ` AND bonus_date<=$${p.length}`; }
    q += ` ORDER BY bonus_date DESC, id DESC`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.post("/driver-bonus", async (req, res) => {
  try {
    const { driverName, driverId, bonusDate, bonusType, amount, reason, status, paidDate, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO driver_bonus (driver_name,driver_id,bonus_date,bonus_type,amount,reason,status,paid_date,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driverName, driverId||null, bonusDate, bonusType||"績效獎金", amount||0, reason||null, status||"pending", paidDate||null, notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.put("/driver-bonus/:id", async (req, res) => {
  try {
    const { driverName, driverId, bonusDate, bonusType, amount, reason, status, paidDate, notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_bonus SET driver_name=$1,driver_id=$2,bonus_date=$3,bonus_type=$4,amount=$5,reason=$6,status=$7,paid_date=$8,notes=$9 WHERE id=$10 RETURNING *`,
      [driverName, driverId||null, bonusDate, bonusType||"績效獎金", amount||0, reason||null, status||"pending", paidDate||null, notes||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.delete("/driver-bonus/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM driver_bonus WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// 鄉鎮市區
// ══════════════════════════════════════════════════════════

gloryModulesRouter.get("/townships", async (req, res) => {
  try {
    const { search, county } = req.query as Record<string, string>;
    let q = `SELECT * FROM townships WHERE 1=1`;
    const p: any[] = [];
    if (county) { p.push(county); q += ` AND county=$${p.length}`; }
    if (search) { p.push(`%${search}%`); q += ` AND (county ILIKE $${p.length} OR district ILIKE $${p.length} OR zip_code ILIKE $${p.length})`; }
    q += ` ORDER BY zip_code, county, district`;
    const r = await pool.query(q, p);
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.post("/townships", async (req, res) => {
  try {
    const { county, district, zipCode } = req.body;
    const r = await pool.query(`INSERT INTO townships (county,district,zip_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *`, [county, district, zipCode||null]);
    res.status(201).json(r.rows[0] ?? { county, district, zipCode });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.put("/townships/:id", async (req, res) => {
  try {
    const { county, district, zipCode } = req.body;
    const r = await pool.query(`UPDATE townships SET county=$1,district=$2,zip_code=$3 WHERE id=$4 RETURNING *`, [county, district, zipCode||null, req.params.id]);
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

gloryModulesRouter.delete("/townships/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM townships WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════
// Glory 批量匯入
// ══════════════════════════════════════════════════════════

gloryModulesRouter.post("/vehicles/bulk", async (req, res) => {
  const { rows } = req.body as { rows: any[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: "rows required" });
  let inserted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.plateNo) { errors.push(`略過空車牌列`); continue; }
    try {
      await pool.query(
        `INSERT INTO vehicles (plate_no,vehicle_type,brand,model,year,color,vin,engine_no,gross_weight,owner_name,owner_id,assigned_driver,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT DO NOTHING`,
        [r.plateNo, r.vehicleType||null, r.brand||null, r.model||null,
         r.year ? parseInt(String(r.year)) : null,
         r.color||null, r.vin||null, r.engineNo||null,
         r.grossWeight ? parseFloat(String(r.grossWeight)) : null,
         r.ownerName||null, r.ownerId||null, r.assignedDriver||null, r.status||"active"]
      );
      inserted++;
    } catch (e: any) { errors.push(`${r.plateNo}: ${e.message}`); }
  }
  res.json({ inserted, errors });
});

gloryModulesRouter.post("/townships/bulk", async (req, res) => {
  const { rows } = req.body as { rows: any[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: "rows required" });
  let inserted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.county || !r.district) { errors.push(`略過空縣市或鄉鎮列`); continue; }
    try {
      await pool.query(
        `INSERT INTO townships (county,district,zip_code) VALUES ($1,$2,$3) ON CONFLICT (county,district) DO NOTHING`,
        [r.county, r.district, r.zipCode||null]
      );
      inserted++;
    } catch (e: any) { errors.push(`${r.county}${r.district}: ${e.message}`); }
  }
  res.json({ inserted, errors });
});
