/**
 * 模組 2：全台車型定義矩陣
 * vehicle_type_matrix + vehicle_equipment 表格
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const vehicleMatrixRouter = Router();

// ── 建表 & 種子資料 ───────────────────────────────────────────────────────────

export async function ensureVehicleMatrixTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_type_matrix (
      id             SERIAL PRIMARY KEY,
      type_code      TEXT UNIQUE NOT NULL,
      type_name      TEXT NOT NULL,
      weight_factor  NUMERIC(4,2) NOT NULL,
      base_surcharge NUMERIC(10,2) DEFAULT 0,
      description    TEXT
    )
  `);

  await pool.query(`
    INSERT INTO vehicle_type_matrix (type_code, type_name, weight_factor, base_surcharge)
    VALUES
      ('3.5t', '3.5噸小貨車', 1.0, 0),
      ('8.5t', '8.5噸中貨車', 1.6, 0),
      ('17t',  '17噸大貨車',  2.8, 0),
      ('35t',  '35噸聯結車',  4.2, 0)
    ON CONFLICT (type_code) DO UPDATE SET
      weight_factor  = EXCLUDED.weight_factor,
      type_name      = EXCLUDED.type_name
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_equipment (
      id          SERIAL PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      surcharge   NUMERIC(10,2) DEFAULT 0,
      multiplier  NUMERIC(4,2)  DEFAULT 1.0,
      description TEXT
    )
  `);

  await pool.query(`
    INSERT INTO vehicle_equipment (code, name, surcharge, multiplier)
    VALUES
      ('tailgate', '尾門',  500, 1.0),
      ('frozen',   '冷凍',  0,   1.5),
      ('gullwing', '鷗翼',  300, 1.0)
    ON CONFLICT (code) DO UPDATE SET
      surcharge  = EXCLUDED.surcharge,
      multiplier = EXCLUDED.multiplier
  `);

  console.log("[VehicleMatrix] tables ensured");
}

// ── GET /api/vehicle-matrix/types ────────────────────────────────────────────

vehicleMatrixRouter.get("/vehicle-matrix/types", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM vehicle_type_matrix ORDER BY weight_factor`);
    res.json({ ok: true, types: rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── GET /api/vehicle-matrix/equipment ────────────────────────────────────────

vehicleMatrixRouter.get("/vehicle-matrix/equipment", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM vehicle_equipment ORDER BY id`);
    res.json({ ok: true, equipment: rows });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── PATCH /api/vehicle-matrix/types/:code ────────────────────────────────────

vehicleMatrixRouter.patch("/vehicle-matrix/types/:code", async (req, res) => {
  try {
    const { weight_factor, base_surcharge, type_name, description } = req.body;
    await pool.query(
      `UPDATE vehicle_type_matrix SET weight_factor=$1, base_surcharge=$2, type_name=$3, description=$4 WHERE type_code=$5`,
      [weight_factor, base_surcharge, type_name, description, req.params.code]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── PATCH /api/vehicle-matrix/equipment/:code ────────────────────────────────

vehicleMatrixRouter.patch("/vehicle-matrix/equipment/:code", async (req, res) => {
  try {
    const { surcharge, multiplier, name, description } = req.body;
    await pool.query(
      `UPDATE vehicle_equipment SET surcharge=$1, multiplier=$2, name=$3, description=$4 WHERE code=$5`,
      [surcharge, multiplier, name, description, req.params.code]
    );
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});
