/**
 * ownerCashSettlement.ts — 車主現金結算系統 + 中油公司卡加油管理
 *
 * 加油金流：
 *   中油加油 → 富詠公司卡代墊 → 中油退 1% 回饋給富詠（平台收益）
 *   月結時從趟費扣除實際油錢（據實核實）→ 現金給車主
 *
 * 現金結算公式：
 *   蝦皮趟次收入（富詠代收）
 *     - 靠行費  (shopee_income × commission_rate%)
 *     - 油錢    (per_trip × 趟次 / 月固定 / 據實 from fuel_records)
 *     - 雜項    (misc_deductions JSON 陣列)
 *     - 司機薪資
 *   ═══════════════════
 *     = 現金給車主
 *
 * Endpoints：
 *   POST   /api/owner-settlement/calculate          自動計算結算單（冪等）
 *   GET    /api/owner-settlement/summary            所有車主月結彙總
 *   GET    /api/owner-settlement/fuel/rebate        中油回饋彙總（富詠收益）
 *   POST   /api/owner-settlement/fuel               登錄加油記錄（公司卡代墊）
 *   GET    /api/owner-settlement/fuel/:fleetId      查詢車隊加油記錄
 *   PATCH  /api/owner-settlement/fuel/:id/verify    核實油單
 *   GET    /api/owner-settlement/:fleetId           查詢結算單
 *   PATCH  /api/owner-settlement/:id/deductions     更新油錢＋雜項
 *   PATCH  /api/owner-settlement/:id/pay            標記現金已付
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const ownerCashSettlementRouter = Router();

// ─── 工具 ─────────────────────────────────────────────────────
function periodToRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start  = `${y}-${String(m).padStart(2,"0")}-01`;
  const last   = new Date(y, m, 0).getDate();
  const end    = `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
  return { start, end };
}

function r2(n: number) { return Math.round(n * 100) / 100; }

function calcFuelTotal(
  fuelType: string, fuelPerTrip: number, fuelMonthly: number,
  fuelReceipt: number, tripCount: number,
): number {
  if (fuelType === "per_trip") return r2(fuelPerTrip * tripCount);
  if (fuelType === "monthly")  return r2(fuelMonthly);
  if (fuelType === "receipt")  return r2(fuelReceipt);   // 據實：由加油記錄自動填入
  return 0;
}

function calcMiscTotal(misc: { label: string; amount: number }[]) {
  return r2(misc.reduce((s, d) => s + Number(d.amount ?? 0), 0));
}

function recalcNet(income: number, affil: number, fuel: number, misc: number, payroll: number) {
  const totalDeduction = r2(affil + fuel + misc + payroll);
  return { totalDeduction, netCash: r2(income - totalDeduction) };
}

/** 從 fuel_records 抓該車隊本月公司卡代墊加油總額 */
async function fetchReceiptFuel(fleetId: number, start: string, end: string): Promise<number> {
  const { rows } = await pool.query(`
    SELECT COALESCE(SUM(total_amount), 0)::numeric AS total
    FROM   fuel_records
    WHERE  fleet_id = $1
      AND  paid_by_company = true
      AND  fuel_date >= $2 AND fuel_date <= $3
  `, [fleetId, start, end]);
  return r2(Number(rows[0]?.total ?? 0));
}

// ═══════════════════════════════════════════════════════════════
// 加油記錄管理
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/owner-settlement/fuel — 登錄加油記錄 ──────────
ownerCashSettlementRouter.post("/owner-settlement/fuel", async (req, res) => {
  const {
    fleet_id, plate_no, fuel_date, fuel_type = "柴油",
    liters, unit_price, total_amount,
    mileage, station_name, driver_name, receipt_no, notes,
    paid_by_company = true,
    rebate_rate = 0.01,
  } = req.body as {
    fleet_id: number; plate_no: string; fuel_date: string;
    fuel_type?: string; liters: number; unit_price: number; total_amount: number;
    mileage?: number; station_name?: string; driver_name?: string;
    receipt_no?: string; notes?: string;
    paid_by_company?: boolean; rebate_rate?: number;
  };

  if (!fleet_id || !plate_no || !fuel_date || !total_amount) {
    return res.status(400).json({
      error: "必填欄位：fleet_id, plate_no, fuel_date, total_amount",
    });
  }

  // 驗證 plate 屬於該車隊
  const { rows: plateCheck } = await pool.query(`
    SELECT id FROM fleet_vehicles
    WHERE  fleet_reg_id = $1 AND plate = $2
  `, [fleet_id, plate_no]);
  if (!plateCheck.length) {
    return res.status(400).json({
      error: `車牌 ${plate_no} 不屬於 fleet_id=${fleet_id}，請確認`,
    });
  }

  const rebateAmount = r2(Number(total_amount) * Number(rebate_rate));

  try {
    const { rows } = await pool.query(`
      INSERT INTO fuel_records
        (fleet_id, plate_no, fuel_date, fuel_type,
         liters, unit_price, total_amount,
         mileage, station_name, driver_name, receipt_no, notes,
         paid_by_company, rebate_rate, rebate_amount)
      VALUES
        ($1,$2,$3,$4,
         $5,$6,$7,
         $8,$9,$10,$11,$12,
         $13,$14,$15)
      RETURNING *
    `, [
      fleet_id, plate_no, fuel_date, fuel_type,
      liters ?? 0, unit_price ?? 0, total_amount,
      mileage ?? null, station_name ?? null, driver_name ?? null,
      receipt_no ?? null, notes ?? null,
      paid_by_company, rebate_rate, rebateAmount,
    ]);

    return res.status(201).json({
      ok: true,
      fuel_record: rows[0],
      rebate: {
        rate:   `${(rebate_rate * 100).toFixed(0)}%`,
        amount: rebateAmount,
        note:   "中油退1%回饋給富詠（平台收益）",
      },
    });
  } catch (err: any) {
    console.error("[owner-settlement/fuel POST]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/owner-settlement/fuel/rebate — 中油回饋彙總 ────
// 必須在 /fuel/:fleetId 之前
ownerCashSettlementRouter.get("/owner-settlement/fuel/rebate", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  const { start, end } = periodToRange(period);

  try {
    const { rows } = await pool.query(`
      SELECT
        f.fleet_name,
        COUNT(fr.id)                           AS fill_count,
        SUM(fr.total_amount)::numeric          AS fuel_total,
        SUM(fr.rebate_amount)::numeric         AS rebate_total,
        COUNT(*) FILTER (WHERE fr.verified)    AS verified_count,
        COUNT(*) FILTER (WHERE NOT fr.verified)AS unverified_count
      FROM   fuel_records fr
      JOIN   fusingao_fleets f ON f.id = fr.fleet_id
      WHERE  fr.paid_by_company = true
        AND  fr.fuel_date >= $1 AND fr.fuel_date <= $2
      GROUP  BY f.id, f.fleet_name
      ORDER  BY rebate_total DESC
    `, [start, end]);

    const grandTotal = rows.reduce((acc, r) => ({
      fuel_total:   r2(acc.fuel_total   + Number(r.fuel_total)),
      rebate_total: r2(acc.rebate_total + Number(r.rebate_total)),
    }), { fuel_total: 0, rebate_total: 0 });

    return res.json({
      period,
      rebate_rate: "1%（中油固定回饋）",
      by_fleet: rows,
      grand_total: grandTotal,
    });
  } catch (err: any) {
    console.error("[owner-settlement/fuel/rebate]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/owner-settlement/fuel/:fleetId — 查加油記錄 ────
ownerCashSettlementRouter.get("/owner-settlement/fuel/:fleetId", async (req, res) => {
  const fleetId = Number(req.params.fleetId);
  const period  = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  if (!fleetId) return res.status(400).json({ error: "無效的 fleetId" });

  const { start, end } = periodToRange(period);

  try {
    const { rows } = await pool.query(`
      SELECT
        fr.*,
        CASE WHEN fr.paid_by_company THEN '富詠公司卡' ELSE '車主自付' END AS payer_label
      FROM   fuel_records fr
      WHERE  fr.fleet_id = $1
        AND  fr.fuel_date >= $2 AND fr.fuel_date <= $3
      ORDER  BY fr.fuel_date, fr.plate_no
    `, [fleetId, start, end]);

    const summary = {
      total_amount:    r2(rows.reduce((s, r) => s + Number(r.total_amount), 0)),
      company_amount:  r2(rows.filter(r => r.paid_by_company).reduce((s, r) => s + Number(r.total_amount), 0)),
      rebate_total:    r2(rows.reduce((s, r) => s + Number(r.rebate_amount), 0)),
      verified_count:  rows.filter(r => r.verified).length,
      pending_count:   rows.filter(r => !r.verified).length,
    };

    return res.json({ period, fleet_id: fleetId, summary, records: rows });
  } catch (err: any) {
    console.error("[owner-settlement/fuel/:fleetId]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/owner-settlement/fuel/:id/verify — 核實油單 ──
ownerCashSettlementRouter.patch("/owner-settlement/fuel/:id/verify", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "無效的 id" });

  const { verified_by, notes } = req.body as { verified_by?: string; notes?: string };

  try {
    const { rows, rowCount } = await pool.query(`
      UPDATE fuel_records SET
        verified    = true,
        verified_at = NOW(),
        verified_by = $2,
        notes       = COALESCE($3, notes)
      WHERE  id = $1
      RETURNING id, plate_no, fuel_date, total_amount, rebate_amount, verified, verified_by
    `, [id, verified_by ?? null, notes ?? null]);

    if (!rowCount) return res.status(404).json({ error: "找不到加油記錄" });

    return res.json({ ok: true, fuel_record: rows[0] });
  } catch (err: any) {
    console.error("[owner-settlement/fuel/:id/verify]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 車主現金結算
// ═══════════════════════════════════════════════════════════════

// ─── POST /api/owner-settlement/calculate ─────────────────────
ownerCashSettlementRouter.post("/owner-settlement/calculate", async (req, res) => {
  const { fleet_id, period } = req.body as { fleet_id?: number; period?: string };
  if (!fleet_id || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "需要 fleet_id 及正確格式 period（YYYY-MM）" });
  }

  const { start, end } = periodToRange(period);

  try {
    // ── 1. 車隊設定 ───────────────────────────────────────────
    const { rows: fleetRows } = await pool.query(`
      SELECT f.id, f.fleet_name,
             COALESCE(f.commission_rate, 15)::numeric        AS commission_rate,
             COALESCE(f.monthly_affiliation_fee, 0)::numeric AS monthly_affiliation_fee,
             a.id AS owner_id
      FROM   fusingao_fleets f
      LEFT JOIN affiliated_vehicle_owners a
        ON   a.fleet_id = f.id AND a.is_active = true
      WHERE  f.id = $1 LIMIT 1
    `, [fleet_id]);

    if (!fleetRows.length) {
      return res.status(404).json({ error: `找不到 fleet_id=${fleet_id}` });
    }

    const fleet    = fleetRows[0];
    const commRate = r2(Number(fleet.commission_rate));
    const ownerId: number | null = fleet.owner_id ?? null;

    // ── 2. 蝦皮趟次收入 & 趟次數 ─────────────────────────────
    const { rows: orderRows } = await pool.query(`
      SELECT COUNT(*)::int                          AS trip_count,
             COALESCE(SUM(base_price), 0)::numeric  AS shopee_income
      FROM   orders
      WHERE  fusingao_fleet_id = $1
        AND  created_at >= $2
        AND  created_at <  ($3::date + interval '1 day')
        AND  status NOT IN ('cancelled','failed')
    `, [fleet_id, start, end]);

    const tripCount    = Number(orderRows[0]?.trip_count   ?? 0);
    const shopeeIncome = r2(Number(orderRows[0]?.shopee_income ?? 0));
    const affiliationDeduct = r2(shopeeIncome * commRate / 100);

    // ── 3. 取既有結算單設定（保留已設定的油錢模式）────────────
    const { rows: existRows } = await pool.query(`
      SELECT * FROM owner_cash_settlements
      WHERE  fleet_id = $1 AND period = $2
    `, [fleet_id, period]);

    const fuelType    = existRows[0]?.fuel_type    ?? "receipt";  // 預設「據實」
    const fuelPerTrip = r2(Number(existRows[0]?.fuel_per_trip  ?? 0));
    const fuelMonthly = r2(Number(existRows[0]?.fuel_monthly   ?? 0));

    // ── 4. 油錢：receipt 模式自動從公司卡加油記錄抓總額 ───────
    let fuelReceiptAuto = 0;
    if (fuelType === "receipt") {
      fuelReceiptAuto = await fetchReceiptFuel(fleet_id, start, end);
    }
    const fuelReceipt = fuelReceiptAuto > 0
      ? fuelReceiptAuto
      : r2(Number(existRows[0]?.fuel_receipt ?? 0));

    const fuelTotal = calcFuelTotal(fuelType, fuelPerTrip, fuelMonthly, fuelReceipt, tripCount);

    // ── 5. 雜項：首次計算自動拉 penalties + vehicle_costs ─────
    let miscDeductions: { label: string; amount: number }[] = [];
    if (existRows.length > 0 && Array.isArray(existRows[0]?.misc_deductions)) {
      miscDeductions = existRows[0].misc_deductions;
    } else {
      const { rows: penRows } = await pool.query(`
        SELECT reason AS label, SUM(amount)::numeric AS amount
        FROM   fleet_penalties
        WHERE  fleet_id = $1 AND period = $2
        GROUP  BY reason
      `, [fleet_id, period]);
      const { rows: costRows } = await pool.query(`
        SELECT cost_type AS label, SUM(amount)::numeric AS amount
        FROM   fleet_vehicle_costs
        WHERE  fleet_id = $1 AND period = $2
          AND  cost_type IN ('insurance','maintenance','toll','other')
        GROUP  BY cost_type
      `, [fleet_id, period]);
      miscDeductions = [
        ...penRows.map(r => ({ label: r.label, amount: Number(r.amount) })),
        ...costRows.map(r => ({ label: r.label, amount: Number(r.amount) })),
      ];
    }
    const miscTotal = calcMiscTotal(miscDeductions);

    // ── 6. 司機薪資 ───────────────────────────────────────────
    const { rows: salaryRows } = await pool.query(`
      SELECT COALESCE(SUM(net_amount), 0)::numeric AS total
      FROM   settlement_records sr
      JOIN   drivers d ON d.id = sr.party_id
      WHERE  sr.period = $1 AND sr.layer = 3
        AND  d.fleet_group = $2
    `, [period, fleet.fleet_name]);

    const driverPayroll = r2(Number(
      existRows.length > 0
        ? (existRows[0]?.driver_payroll ?? salaryRows[0]?.total ?? 0)
        : (salaryRows[0]?.total ?? 0)
    ));

    // ── 7. 中油回饋（1%，此月公司卡加油總額）─────────────────
    const cpcRebate = r2(fuelType === "receipt" ? fuelReceipt * 0.01 : 0);

    // ── 8. 最終結算 ───────────────────────────────────────────
    const { totalDeduction, netCash } = recalcNet(
      shopeeIncome, affiliationDeduct, fuelTotal, miscTotal, driverPayroll
    );

    // ── 9. 冪等寫入 ───────────────────────────────────────────
    const { rows: upserted } = await pool.query(`
      INSERT INTO owner_cash_settlements
        (owner_id, fleet_id, period,
         shopee_income, trip_count,
         affiliation_deduct, commission_rate,
         fuel_type, fuel_per_trip, fuel_monthly, fuel_receipt, fuel_total,
         misc_deductions, misc_total,
         driver_payroll,
         total_deduction, net_cash,
         status, updated_at)
      VALUES
        ($1,$2,$3,
         $4,$5,
         $6,$7,
         $8,$9,$10,$11,$12,
         $13::jsonb,$14,
         $15,
         $16,$17,
         COALESCE((SELECT status FROM owner_cash_settlements WHERE fleet_id=$2 AND period=$3),'draft'),
         NOW())
      ON CONFLICT (fleet_id, period) DO UPDATE SET
        owner_id           = EXCLUDED.owner_id,
        shopee_income      = EXCLUDED.shopee_income,
        trip_count         = EXCLUDED.trip_count,
        affiliation_deduct = EXCLUDED.affiliation_deduct,
        commission_rate    = EXCLUDED.commission_rate,
        fuel_type          = EXCLUDED.fuel_type,
        fuel_per_trip      = EXCLUDED.fuel_per_trip,
        fuel_monthly       = EXCLUDED.fuel_monthly,
        fuel_receipt       = EXCLUDED.fuel_receipt,
        fuel_total         = EXCLUDED.fuel_total,
        misc_deductions    = EXCLUDED.misc_deductions,
        misc_total         = EXCLUDED.misc_total,
        driver_payroll     = EXCLUDED.driver_payroll,
        total_deduction    = EXCLUDED.total_deduction,
        net_cash           = EXCLUDED.net_cash,
        updated_at         = NOW()
      RETURNING *
    `, [
      ownerId, fleet_id, period,
      shopeeIncome, tripCount,
      affiliationDeduct, commRate,
      fuelType, fuelPerTrip, fuelMonthly, fuelReceipt, fuelTotal,
      JSON.stringify(miscDeductions), miscTotal,
      driverPayroll,
      totalDeduction, netCash,
    ]);

    return res.json({
      ok: true,
      settlement: upserted[0],
      breakdown: {
        "①趟次收入（蝦皮代收）": shopeeIncome,
        "②靠行費%":             `-${affiliationDeduct}（${commRate}%）`,
        "③油費":                {
          mode:   fuelType,
          amount: `-${fuelTotal}`,
          note:   fuelType === "receipt"
            ? `公司卡代墊據實扣除，中油回饋 1% = ${cpcRebate} 元（富詠收益）`
            : fuelType === "per_trip"
            ? `每趟 ${fuelPerTrip} × ${tripCount} 趟`
            : `月固定 ${fuelMonthly} 元`,
        },
        "④雜項":                `-${miscTotal}`,
        "⑤司機薪資":            `-${driverPayroll}`,
        "＝現金給車主":          netCash,
      },
      cpc_rebate: cpcRebate > 0
        ? { amount: cpcRebate, note: "中油1%回饋已計入富詠平台收益" }
        : null,
    });

  } catch (err: any) {
    console.error("[owner-settlement/calculate]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/owner-settlement/summary ────────────────────────
ownerCashSettlementRouter.get("/owner-settlement/summary", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  const { start, end } = periodToRange(period);

  try {
    const { rows } = await pool.query(`
      SELECT ocs.id, ocs.fleet_id, f.fleet_name,
             ocs.trip_count, ocs.shopee_income,
             ocs.affiliation_deduct, ocs.fuel_type, ocs.fuel_total,
             ocs.misc_total, ocs.driver_payroll,
             ocs.total_deduction, ocs.net_cash,
             ocs.status, ocs.paid_at, ocs.paid_by, ocs.updated_at
      FROM   owner_cash_settlements ocs
      JOIN   fusingao_fleets f ON f.id = ocs.fleet_id
      WHERE  ocs.period = $1
      ORDER  BY ocs.net_cash DESC
    `, [period]);

    // 中油回饋彙總
    const { rows: rebateRows } = await pool.query(`
      SELECT COALESCE(SUM(rebate_amount), 0)::numeric AS total_rebate
      FROM   fuel_records
      WHERE  paid_by_company = true
        AND  fuel_date >= $1 AND fuel_date <= $2
    `, [start, end]);

    const totals = rows.reduce((acc, r) => ({
      shopee_income:   r2(acc.shopee_income   + Number(r.shopee_income)),
      total_deduction: r2(acc.total_deduction + Number(r.total_deduction)),
      net_cash:        r2(acc.net_cash        + Number(r.net_cash)),
      driver_payroll:  r2(acc.driver_payroll  + Number(r.driver_payroll)),
      fuel_total:      r2(acc.fuel_total      + Number(r.fuel_total)),
    }), { shopee_income:0, total_deduction:0, net_cash:0, driver_payroll:0, fuel_total:0 });

    return res.json({
      period,
      count: rows.length,
      totals,
      cpc_rebate_income: r2(Number(rebateRows[0]?.total_rebate ?? 0)),
      settlements: rows,
    });
  } catch (err: any) {
    console.error("[owner-settlement/summary]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/owner-settlement/:fleetId ───────────────────────
ownerCashSettlementRouter.get("/owner-settlement/:fleetId", async (req, res) => {
  const fleetId = Number(req.params.fleetId);
  const period  = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  if (!fleetId) return res.status(400).json({ error: "無效的 fleetId" });

  const { start, end } = periodToRange(period);

  try {
    const { rows } = await pool.query(`
      SELECT ocs.*, f.fleet_name, f.commission_rate
      FROM   owner_cash_settlements ocs
      JOIN   fusingao_fleets f ON f.id = ocs.fleet_id
      WHERE  ocs.fleet_id = $1 AND ocs.period = $2
    `, [fleetId, period]);

    if (!rows.length) {
      return res.status(404).json({
        error: "尚未建立結算單，請先呼叫 POST /owner-settlement/calculate",
      });
    }

    const s = rows[0];

    // 附上本月加油明細
    const { rows: fuelRows } = await pool.query(`
      SELECT plate_no, fuel_date, total_amount, rebate_amount,
             station_name, driver_name, receipt_no, verified, verified_by
      FROM   fuel_records
      WHERE  fleet_id = $1 AND paid_by_company = true
        AND  fuel_date >= $2 AND fuel_date <= $3
      ORDER  BY fuel_date
    `, [fleetId, start, end]);

    const cpcRebate = r2(fuelRows.reduce((s, r) => s + Number(r.rebate_amount), 0));

    return res.json({
      settlement: s,
      breakdown: {
        "①趟次收入（蝦皮代收）": s.shopee_income,
        "②靠行費%":             `-${s.affiliation_deduct}（${s.commission_rate}%）`,
        "③油費":                `-${s.fuel_total}（${s.fuel_type}）`,
        "④雜項":                `-${s.misc_total}`,
        "⑤司機薪資":            `-${s.driver_payroll}`,
        "＝現金給車主":          s.net_cash,
      },
      fuel_records:      fuelRows,
      fuel_record_count: fuelRows.length,
      cpc_rebate:        cpcRebate,
      unverified_count:  fuelRows.filter(r => !r.verified).length,
    });
  } catch (err: any) {
    console.error("[owner-settlement/:fleetId]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/owner-settlement/:id/deductions ───────────────
ownerCashSettlementRouter.patch("/owner-settlement/:id/deductions", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "無效的 id" });

  const {
    fuel_type, fuel_per_trip, fuel_monthly, fuel_receipt,
    misc_deductions, driver_payroll,
  } = req.body as {
    fuel_type?: string; fuel_per_trip?: number;
    fuel_monthly?: number; fuel_receipt?: number;
    misc_deductions?: { label: string; amount: number }[];
    driver_payroll?: number;
  };

  try {
    const { rows: cur } = await pool.query(
      `SELECT * FROM owner_cash_settlements WHERE id = $1`, [id]
    );
    if (!cur.length) return res.status(404).json({ error: "找不到結算單" });
    if (cur[0].status === "paid") {
      return res.status(409).json({ error: "已付款的結算單不可修改" });
    }

    const s = cur[0];
    const nFuelType    = fuel_type     ?? s.fuel_type;
    const nFuelPerTrip = fuel_per_trip !== undefined ? r2(fuel_per_trip) : Number(s.fuel_per_trip);
    const nFuelMonthly = fuel_monthly  !== undefined ? r2(fuel_monthly)  : Number(s.fuel_monthly);
    const nFuelReceipt = fuel_receipt  !== undefined ? r2(fuel_receipt)  : Number(s.fuel_receipt);
    const nMisc        = misc_deductions !== undefined ? misc_deductions : s.misc_deductions;
    const nDriverPay   = driver_payroll !== undefined ? r2(driver_payroll) : Number(s.driver_payroll);

    const nFuelTotal = calcFuelTotal(nFuelType, nFuelPerTrip, nFuelMonthly, nFuelReceipt, Number(s.trip_count));
    const nMiscTotal = calcMiscTotal(nMisc);
    const { totalDeduction, netCash } = recalcNet(
      Number(s.shopee_income), Number(s.affiliation_deduct),
      nFuelTotal, nMiscTotal, nDriverPay
    );

    const { rows: updated } = await pool.query(`
      UPDATE owner_cash_settlements SET
        fuel_type       = $2, fuel_per_trip = $3, fuel_monthly = $4,
        fuel_receipt    = $5, fuel_total    = $6,
        misc_deductions = $7::jsonb, misc_total = $8,
        driver_payroll  = $9, total_deduction = $10, net_cash = $11,
        updated_at      = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, nFuelType, nFuelPerTrip, nFuelMonthly, nFuelReceipt, nFuelTotal,
        JSON.stringify(nMisc), nMiscTotal, nDriverPay, totalDeduction, netCash]);

    return res.json({
      ok: true,
      settlement: updated[0],
      breakdown: {
        "①趟次收入":   updated[0].shopee_income,
        "②靠行費%":   `-${updated[0].affiliation_deduct}`,
        "③油費":      `-${nFuelTotal}（${nFuelType}）`,
        "④雜項":      `-${nMiscTotal}`,
        "⑤司機薪資":  `-${nDriverPay}`,
        "＝現金給車主": netCash,
      },
    });
  } catch (err: any) {
    console.error("[owner-settlement/:id/deductions]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/owner-settlement/:id/pay ─────────────────────
ownerCashSettlementRouter.patch("/owner-settlement/:id/pay", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "無效的 id" });

  const { paid_by, receipt_note } = req.body as {
    paid_by?: string; receipt_note?: string;
  };

  try {
    const { rows, rowCount } = await pool.query(`
      UPDATE owner_cash_settlements SET
        status = 'paid', paid_at = NOW(),
        paid_by = $2, receipt_note = $3, updated_at = NOW()
      WHERE  id = $1 AND status != 'paid'
      RETURNING id, fleet_id, period, net_cash, status, paid_at, paid_by, receipt_note
    `, [id, paid_by ?? null, receipt_note ?? null]);

    if (!rowCount) {
      const { rows: check } = await pool.query(
        `SELECT status FROM owner_cash_settlements WHERE id = $1`, [id]
      );
      if (check[0]?.status === "paid") {
        return res.status(409).json({ error: "此結算單已標記為付款，請勿重複操作" });
      }
      return res.status(404).json({ error: "找不到結算單" });
    }

    return res.json({
      ok: true,
      message: `✅ 現金 $${rows[0].net_cash} 已付款給車主`,
      payout: rows[0],
    });
  } catch (err: any) {
    console.error("[owner-settlement/:id/pay]", err);
    return res.status(500).json({ error: err.message });
  }
});
