/**
 * fuelCards.ts — 加油卡代墊記錄系統 + 車輛專屬加油卡管理
 *
 * 金流：富詠公司卡代墊加油費 → 中油退 1% 回饋給富詠（平台收益）
 *       月結時將油費從趟次收入中扣除，車主提供油單核實
 *
 * ── 加油卡主檔 ──
 * GET    /api/fuel-cards/cards              查詢車隊加油卡（?fleet_id=）
 * POST   /api/fuel-cards/cards              新增加油卡
 * PATCH  /api/fuel-cards/cards/:cardId      更新加油卡（換司機/停用等）
 * GET    /api/fuel-cards/cards/:cardId/records   單張卡加油記錄（?period=）
 *
 * ── 加油記錄 ──
 * POST   /api/fuel-cards/record             登錄加油記錄
 * GET    /api/fuel-cards                    查詢加油記錄（?fleet_id=&period=）
 * GET    /api/fuel-cards/monthly-report     月報表（?period=）
 * GET    /api/fuel-cards/summary            所有車隊彙總（?period=）
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const fuelCardsRouter = Router();

function r2(n: number) { return Math.round(n * 100) / 100; }

// ═══════════════════════════════════════════════════════════════
// 加油卡主檔管理
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/fuel-cards/cards ────────────────────────────────
// 必須在 /cards/:cardId 之前
fuelCardsRouter.get("/fuel-cards/cards", async (req, res) => {
  const fleetId = req.query.fleet_id ? Number(req.query.fleet_id) : null;

  try {
    const { rows } = await pool.query(`
      SELECT
        fc.*,
        COALESCE(
          (SELECT COUNT(*)::int FROM fuel_card_records fcr WHERE fcr.card_id = fc.id),
          0
        ) AS total_fills,
        COALESCE(
          (SELECT SUM(amount)::numeric FROM fuel_card_records fcr WHERE fcr.card_id = fc.id),
          0
        ) AS total_amount
      FROM   fuel_cards fc
      WHERE  ($1::integer IS NULL OR fc.fleet_id = $1)
      ORDER  BY fc.fleet_id, fc.vehicle_plate
    `, [fleetId]);

    return res.json({
      count:    rows.length,
      fleet_id: fleetId,
      cards:    rows,
    });
  } catch (err: any) {
    console.error("[fuel-cards/cards GET]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/fuel-cards/cards ───────────────────────────────
fuelCardsRouter.post("/fuel-cards/cards", async (req, res) => {
  const {
    fleet_id, vehicle_plate, driver_id,
    card_no, card_type = "CPC",
    monthly_limit, issued_at, note,
  } = req.body as {
    fleet_id: number; vehicle_plate: string; driver_id?: number;
    card_no: string; card_type?: string;
    monthly_limit?: number; issued_at?: string; note?: string;
  };

  if (!fleet_id || !vehicle_plate) {
    return res.status(400).json({
      error: "必填欄位：fleet_id, vehicle_plate（card_no 可留空，之後補填）",
    });
  }

  // 確認車牌屬於該車隊
  const { rows: plateCheck } = await pool.query(`
    SELECT id FROM fleet_vehicles WHERE fleet_reg_id = $1 AND plate = $2
  `, [fleet_id, vehicle_plate]);
  if (!plateCheck.length) {
    return res.status(400).json({
      error: `車牌 ${vehicle_plate} 不屬於 fleet_id=${fleet_id}`,
    });
  }

  try {
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

    // card_no 有值時做 UPSERT；為 NULL 時直接 INSERT（UNIQUE 不比對 NULL）
    const params = [
      fleet_id, fleetRow[0]?.fleet_name ?? null,
      vehicle_plate, driver_id ?? null, driverName,
      card_no ?? null, card_type,
      monthly_limit ?? null, issued_at ?? null, note ?? null,
    ];
    const sql = card_no
      ? `INSERT INTO fuel_cards
           (fleet_id, fleet_name, vehicle_plate, driver_id, driver_name,
            card_no, card_type, monthly_limit, issued_at, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (card_no) DO UPDATE SET
           fleet_id      = EXCLUDED.fleet_id,
           fleet_name    = EXCLUDED.fleet_name,
           vehicle_plate = EXCLUDED.vehicle_plate,
           driver_id     = EXCLUDED.driver_id,
           driver_name   = EXCLUDED.driver_name,
           card_type     = EXCLUDED.card_type,
           monthly_limit = EXCLUDED.monthly_limit,
           note          = EXCLUDED.note
         RETURNING *`
      : `INSERT INTO fuel_cards
           (fleet_id, fleet_name, vehicle_plate, driver_id, driver_name,
            card_no, card_type, monthly_limit, issued_at, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`;
    const { rows } = await pool.query(sql, params);

    return res.status(201).json({ ok: true, card: rows[0] });
  } catch (err: any) {
    console.error("[fuel-cards/cards POST]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/fuel-cards/cards/:cardId ──────────────────────
fuelCardsRouter.patch("/fuel-cards/cards/:cardId", async (req, res) => {
  const cardId = Number(req.params.cardId);
  if (!cardId) return res.status(400).json({ error: "無效的 cardId" });

  const {
    card_no, driver_id, card_type, monthly_limit,
    is_active, issued_at, note,
  } = req.body as {
    card_no?: string | null; driver_id?: number | null; card_type?: string;
    monthly_limit?: number | null; is_active?: boolean;
    issued_at?: string; note?: string;
  };

  try {
    const { rows: cur } = await pool.query(
      `SELECT * FROM fuel_cards WHERE id = $1`, [cardId]
    );
    if (!cur.length) return res.status(404).json({ error: "找不到加油卡" });

    let driverName = cur[0].driver_name;
    if (driver_id !== undefined) {
      if (driver_id === null) {
        driverName = null;
      } else {
        const { rows: dRow } = await pool.query(
          `SELECT name FROM drivers WHERE id = $1`, [driver_id]
        );
        driverName = dRow[0]?.name ?? null;
      }
    }

    const { rows } = await pool.query(`
      UPDATE fuel_cards SET
        card_no       = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE card_no END,
        driver_id     = CASE WHEN $3::integer IS NOT NULL THEN $3 ELSE driver_id END,
        driver_name   = $4,
        card_type     = COALESCE($5, card_type),
        monthly_limit = CASE WHEN $6::numeric IS NOT NULL THEN $6 ELSE monthly_limit END,
        is_active     = COALESCE($7, is_active),
        issued_at     = COALESCE($8::date, issued_at),
        note          = COALESCE($9, note)
      WHERE id = $1
      RETURNING *
    `, [
      cardId,
      card_no !== undefined ? (card_no ?? null) : null,
      driver_id !== undefined ? (driver_id ?? null) : null,
      driverName,
      card_type ?? null,
      monthly_limit !== undefined ? monthly_limit : null,
      is_active !== undefined ? is_active : null,
      issued_at ?? null,
      note ?? null,
    ]);

    return res.json({ ok: true, card: rows[0] });
  } catch (err: any) {
    console.error("[fuel-cards/cards PATCH]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/fuel-cards/cards/:cardId/records ────────────────
fuelCardsRouter.get("/fuel-cards/cards/:cardId/records", async (req, res) => {
  const cardId = Number(req.params.cardId);
  const period = String(req.query.period ?? "");

  if (!cardId) return res.status(400).json({ error: "無效的 cardId" });
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    const { rows: cardRows } = await pool.query(
      `SELECT * FROM fuel_cards WHERE id = $1`, [cardId]
    );
    if (!cardRows.length) return res.status(404).json({ error: "找不到加油卡" });

    const { rows: records } = await pool.query(`
      SELECT *,
             CASE WHEN is_deducted THEN '已扣款' ELSE '待扣款' END AS deduct_status
      FROM   fuel_card_records
      WHERE  card_id = $1 AND period = $2
      ORDER  BY fuel_date
    `, [cardId, period]);

    const summary = {
      fill_count:   records.length,
      total_liters: r2(records.reduce((s, r) => s + Number(r.liters), 0)),
      total_amount: r2(records.reduce((s, r) => s + Number(r.amount), 0)),
      total_rebate: r2(records.reduce((s, r) => s + Number(r.cpc_rebate), 0)),
    };

    return res.json({
      card:    cardRows[0],
      period,
      summary,
      records,
    });
  } catch (err: any) {
    console.error("[fuel-cards/cards/:cardId/records]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 加油記錄
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/fuel-cards/record ─────────────────────────────
fuelCardsRouter.post("/fuel-cards/record", async (req, res) => {
  const {
    fleet_id, card_id, driver_id, vehicle_plate,
    fuel_date, fuel_station,
    liters, amount, receipt_no, period, note,
  } = req.body as {
    fleet_id: number; card_id?: number; driver_id?: number;
    vehicle_plate: string; fuel_date: string; fuel_station?: string;
    liters?: number; amount: number; receipt_no?: string;
    period: string; note?: string;
  };

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
    SELECT id FROM fleet_vehicles WHERE fleet_reg_id = $1 AND plate = $2
  `, [fleet_id, vehicle_plate]);
  if (!plateCheck.length) {
    return res.status(400).json({
      error: `車牌 ${vehicle_plate} 不屬於 fleet_id=${fleet_id}，請確認`,
    });
  }

  try {
    // 查車隊名稱
    const { rows: fleetRow } = await pool.query(
      `SELECT fleet_name FROM fusingao_fleets WHERE id = $1`, [fleet_id]
    );

    // 解析 card_id → card_no；若未傳 card_id，嘗試由 vehicle_plate 找主卡
    let resolvedCardId   = card_id ?? null;
    let resolvedCardNo: string | null = null;
    let driverName: string | null = null;

    if (resolvedCardId) {
      const { rows: fcRow } = await pool.query(
        `SELECT card_no, driver_id, driver_name FROM fuel_cards WHERE id = $1`, [resolvedCardId]
      );
      resolvedCardNo = fcRow[0]?.card_no ?? null;
      driverName     = fcRow[0]?.driver_name ?? null;
    } else {
      // 由車牌自動找有效加油卡
      const { rows: fcRow } = await pool.query(`
        SELECT id, card_no, driver_name FROM fuel_cards
        WHERE  fleet_id = $1 AND vehicle_plate = $2 AND is_active = true
        LIMIT  1
      `, [fleet_id, vehicle_plate]);
      if (fcRow.length) {
        resolvedCardId = fcRow[0].id;
        resolvedCardNo = fcRow[0].card_no;
        driverName     = fcRow[0].driver_name;
      }
    }

    // driver_id 傳入時優先查名字
    if (driver_id) {
      const { rows: dRow } = await pool.query(
        `SELECT name FROM drivers WHERE id = $1`, [driver_id]
      );
      driverName = dRow[0]?.name ?? driverName;
    }

    const cpcRebate = r2(Number(amount) * 0.01);

    const { rows } = await pool.query(`
      INSERT INTO fuel_card_records
        (fleet_id, fleet_name, driver_id, driver_name, vehicle_plate,
         fuel_date, fuel_station, liters, amount, receipt_no,
         cpc_rebate, period, note, card_id, card_no)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      fleet_id, fleetRow[0]?.fleet_name ?? null,
      driver_id ?? null, driverName,
      vehicle_plate, fuel_date, fuel_station ?? null,
      liters ?? 0, amount, receipt_no ?? null,
      cpcRebate, period, note ?? null,
      resolvedCardId, resolvedCardNo,
    ]);

    return res.status(201).json({
      ok: true,
      record:      rows[0],
      rebate_note: `中油退款 1% = $${cpcRebate}，計入富詠平台收益`,
    });
  } catch (err: any) {
    console.error("[fuel-cards/record]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/fuel-cards/monthly-report ───────────────────────
// 必須在 /api/fuel-cards (有 period 參數的通用查詢) 之前
fuelCardsRouter.get("/fuel-cards/monthly-report", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    // 按車輛分組
    const { rows: byVehicle } = await pool.query(`
      SELECT
        fcr.fleet_id,
        fcr.fleet_name,
        fcr.vehicle_plate,
        fc.card_no,
        fc.card_type,
        fcr.driver_name,
        COUNT(*)::int                          AS fill_count,
        SUM(fcr.liters)::numeric               AS total_liters,
        SUM(fcr.amount)::numeric               AS total_amount,
        SUM(fcr.cpc_rebate)::numeric           AS total_rebate,
        COUNT(*) FILTER (WHERE fcr.is_deducted)::int   AS deducted_count
      FROM   fuel_card_records fcr
      LEFT JOIN fuel_cards fc ON fc.id = fcr.card_id
      WHERE  fcr.period = $1
      GROUP  BY fcr.fleet_id, fcr.fleet_name, fcr.vehicle_plate,
                fc.card_no, fc.card_type, fcr.driver_name
      ORDER  BY fcr.fleet_id, total_amount DESC
    `, [period]);

    // 按車隊分組
    const { rows: byFleet } = await pool.query(`
      SELECT
        fleet_id,
        fleet_name,
        COUNT(DISTINCT vehicle_plate)::int   AS vehicle_count,
        COUNT(*)::int                        AS fill_count,
        SUM(liters)::numeric                 AS total_liters,
        SUM(amount)::numeric                 AS total_amount,
        SUM(cpc_rebate)::numeric             AS total_rebate
      FROM   fuel_card_records
      WHERE  period = $1
      GROUP  BY fleet_id, fleet_name
      ORDER  BY total_amount DESC
    `, [period]);

    const grand = byFleet.reduce((acc, r) => ({
      vehicle_count: acc.vehicle_count + Number(r.vehicle_count),
      fill_count:    acc.fill_count    + Number(r.fill_count),
      total_liters:  r2(acc.total_liters  + Number(r.total_liters)),
      total_amount:  r2(acc.total_amount  + Number(r.total_amount)),
      total_rebate:  r2(acc.total_rebate  + Number(r.total_rebate)),
    }), { vehicle_count: 0, fill_count: 0, total_liters: 0, total_amount: 0, total_rebate: 0 });

    return res.json({
      period,
      by_vehicle: byVehicle,
      by_fleet:   byFleet,
      grand_total: {
        ...grand,
        rebate_note: `中油退款 1%（富詠平台收益，合計 $${grand.total_rebate}）`,
      },
    });
  } catch (err: any) {
    console.error("[fuel-cards/monthly-report]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/fuel-cards ──────────────────────────────────────
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
        fc.card_type,
        CASE WHEN fcr.is_deducted THEN '已扣款' ELSE '待扣款' END AS deduct_status
      FROM   fuel_card_records fcr
      LEFT JOIN fuel_cards fc ON fc.id = fcr.card_id
      WHERE  fcr.period = $1
        AND  ($2::integer IS NULL OR fcr.fleet_id = $2)
      ORDER  BY fcr.fuel_date, fcr.fleet_id
    `, [period, fleetId]);

    const summary = {
      record_count:   rows.length,
      total_liters:   r2(rows.reduce((s, r) => s + Number(r.liters), 0)),
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
        fleet_id, fleet_name,
        COUNT(*)::int                                  AS fill_count,
        SUM(liters)::numeric                           AS total_liters,
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
