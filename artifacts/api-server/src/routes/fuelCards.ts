/**
 * fuelCards.ts — 加油卡代墊記錄系統
 *
 * 金流：富詠公司卡代墊加油費 → 中油退 1% 回饋給富詠（平台收益）
 *       月結時將油費從趟次收入中扣除，車主提供油單核實
 *
 * POST   /api/fuel-cards/record        登錄加油記錄
 * GET    /api/fuel-cards               查詢加油記錄（?fleet_id=&period=）
 * GET    /api/fuel-cards/summary       所有車隊加油彙總（?period=）
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const fuelCardsRouter = Router();

function r2(n: number) { return Math.round(n * 100) / 100; }

// ─── POST /api/fuel-cards/record ─────────────────────────────
fuelCardsRouter.post("/fuel-cards/record", async (req, res) => {
  const {
    fleet_id, driver_id, vehicle_plate,
    fuel_date, fuel_station,
    liters, amount, receipt_no, period, note,
  } = req.body as {
    fleet_id: number; driver_id?: number; vehicle_plate: string;
    fuel_date: string; fuel_station?: string;
    liters?: number; amount: number; receipt_no?: string;
    period: string; note?: string;
  };

  // 必填驗證
  if (!fleet_id || !vehicle_plate || !fuel_date || !amount || !period) {
    return res.status(400).json({
      error: "必填欄位：fleet_id, vehicle_plate, fuel_date, amount, period",
    });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  // 確認車牌屬於該車隊
  const { rows: plateCheck } = await pool.query(`
    SELECT id FROM fleet_vehicles
    WHERE  fleet_reg_id = $1 AND plate = $2
  `, [fleet_id, vehicle_plate]);
  if (!plateCheck.length) {
    return res.status(400).json({
      error: `車牌 ${vehicle_plate} 不屬於 fleet_id=${fleet_id}，請確認`,
    });
  }

  // 取車隊名稱 + 司機名稱
  const { rows: fleetRow } = await pool.query(
    `SELECT fleet_name FROM fusingao_fleets WHERE id = $1`, [fleet_id]
  );
  let driverName: string | null = null;
  if (driver_id) {
    const { rows: dRow } = await pool.query(
      `SELECT name FROM drivers WHERE id = $1`, [driver_id]
    );
    driverName = dRow[0]?.name ?? null;
  }

  const cpcRebate = r2(Number(amount) * 0.01);

  try {
    const { rows } = await pool.query(`
      INSERT INTO fuel_card_records
        (fleet_id, fleet_name, driver_id, driver_name, vehicle_plate,
         fuel_date, fuel_station, liters, amount, receipt_no,
         cpc_rebate, period, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      fleet_id, fleetRow[0]?.fleet_name ?? null,
      driver_id ?? null, driverName,
      vehicle_plate, fuel_date, fuel_station ?? null,
      liters ?? 0, amount, receipt_no ?? null,
      cpcRebate, period, note ?? null,
    ]);

    return res.status(201).json({
      ok: true,
      record: rows[0],
      rebate_note: `中油退款 1% = $${cpcRebate}，計入富詠平台收益`,
    });
  } catch (err: any) {
    console.error("[fuel-cards/record]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/fuel-cards ─────────────────────────────────────
fuelCardsRouter.get("/fuel-cards", async (req, res) => {
  const fleetId = req.query.fleet_id ? Number(req.query.fleet_id) : null;
  const period  = String(req.query.period ?? "");

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        fcr.*,
        CASE WHEN fcr.is_deducted THEN '已扣款' ELSE '待扣款' END AS deduct_status
      FROM   fuel_card_records fcr
      WHERE  fcr.period = $1
        AND  ($2::integer IS NULL OR fcr.fleet_id = $2)
      ORDER  BY fcr.fuel_date, fcr.fleet_id
    `, [period, fleetId]);

    const summary = {
      record_count:   rows.length,
      total_amount:   r2(rows.reduce((s, r) => s + Number(r.amount), 0)),
      total_rebate:   r2(rows.reduce((s, r) => s + Number(r.cpc_rebate), 0)),
      deducted_count: rows.filter(r => r.is_deducted).length,
      pending_count:  rows.filter(r => !r.is_deducted).length,
    };

    return res.json({ period, fleet_id: fleetId, summary, records: rows });
  } catch (err: any) {
    console.error("[fuel-cards GET]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/fuel-cards/summary ─────────────────────────────
fuelCardsRouter.get("/fuel-cards/summary", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        fleet_id,
        fleet_name,
        COUNT(*)::int                                  AS fill_count,
        SUM(amount)::numeric                           AS total_amount,
        SUM(cpc_rebate)::numeric                       AS total_rebate,
        COUNT(*) FILTER (WHERE is_deducted)::int       AS deducted_count,
        COUNT(*) FILTER (WHERE NOT is_deducted)::int   AS pending_count,
        MIN(fuel_date)::text                           AS earliest_fill,
        MAX(fuel_date)::text                           AS latest_fill
      FROM   fuel_card_records
      WHERE  period = $1
      GROUP  BY fleet_id, fleet_name
      ORDER  BY total_amount DESC
    `, [period]);

    const grand = rows.reduce((acc, r) => ({
      total_amount: r2(acc.total_amount + Number(r.total_amount)),
      total_rebate: r2(acc.total_rebate + Number(r.total_rebate)),
    }), { total_amount: 0, total_rebate: 0 });

    return res.json({
      period,
      fleet_count: rows.length,
      by_fleet:    rows,
      grand_total: {
        ...grand,
        rebate_note: "中油退款 1%（富詠平台收益，不退還給車主）",
      },
    });
  } catch (err: any) {
    console.error("[fuel-cards/summary]", err);
    return res.status(500).json({ error: err.message });
  }
});
