/**
 * ownerCashSettlement.ts — 車主現金結算系統
 *
 * 現金流公式：
 *   蝦皮趟次收入（富詠代收）
 *     - 靠行費  (shopee_income × commission_rate%)
 *     - 油錢    (per_trip × 趟次 / 月固定 / 據實)
 *     - 雜項    (misc_deductions JSON 陣列)
 *     - 司機薪資
 *   ═══════════════════
 *     = 現金給車主
 *
 * POST   /api/owner-settlement/calculate          自動計算結算單（冪等）
 * GET    /api/owner-settlement/:fleetId           查詢結算單
 * PATCH  /api/owner-settlement/:id/deductions     更新油錢＋雜項
 * PATCH  /api/owner-settlement/:id/pay            標記現金已付
 * GET    /api/owner-settlement/summary            所有車主月結彙總
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
  fuelType: string,
  fuelPerTrip: number,
  fuelMonthly: number,
  fuelReceipt: number,
  tripCount: number,
): number {
  if (fuelType === "per_trip")  return r2(fuelPerTrip * tripCount);
  if (fuelType === "monthly")   return r2(fuelMonthly);
  if (fuelType === "receipt")   return r2(fuelReceipt);
  return 0;
}

function calcMiscTotal(miscDeductions: { label: string; amount: number }[]): number {
  return r2(miscDeductions.reduce((s, d) => s + Number(d.amount ?? 0), 0));
}

function recalcNet(
  shopeeIncome: number,
  affiliationDeduct: number,
  fuelTotal: number,
  miscTotal: number,
  driverPayroll: number,
): { totalDeduction: number; netCash: number } {
  const totalDeduction = r2(affiliationDeduct + fuelTotal + miscTotal + driverPayroll);
  const netCash        = r2(shopeeIncome - totalDeduction);
  return { totalDeduction, netCash };
}

// ─── POST /api/owner-settlement/calculate ─────────────────────
ownerCashSettlementRouter.post("/owner-settlement/calculate", async (req, res) => {
  const { fleet_id, period } = req.body as { fleet_id?: number; period?: string };

  if (!fleet_id || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "需要 fleet_id 及正確格式 period（YYYY-MM）" });
  }

  const { start, end } = periodToRange(period);

  try {
    // ── 1. 取車主資料（commission_rate / monthly_affiliation_fee）──
    const { rows: fleetRows } = await pool.query(`
      SELECT f.id, f.fleet_name,
             COALESCE(f.commission_rate, 15)::numeric          AS commission_rate,
             COALESCE(f.monthly_affiliation_fee, 0)::numeric   AS monthly_affiliation_fee,
             a.id AS owner_id,
             a.fuel_type          -- affiliated_vehicle_owners 若有 fuel_type 欄位
      FROM   fusingao_fleets f
      LEFT JOIN affiliated_vehicle_owners a
        ON   a.fleet_id = f.id AND a.is_active = true
      WHERE  f.id = $1 LIMIT 1
    `, [fleet_id]).catch(() =>
      // affiliated_vehicle_owners 可能沒有 fuel_type 欄位，fallback
      pool.query(`
        SELECT f.id, f.fleet_name,
               COALESCE(f.commission_rate, 15)::numeric        AS commission_rate,
               COALESCE(f.monthly_affiliation_fee, 0)::numeric AS monthly_affiliation_fee,
               a.id AS owner_id
        FROM   fusingao_fleets f
        LEFT JOIN affiliated_vehicle_owners a
          ON   a.fleet_id = f.id AND a.is_active = true
        WHERE  f.id = $1 LIMIT 1
      `, [fleet_id])
    );

    if (!fleetRows.length) {
      return res.status(404).json({ error: `找不到 fleet_id=${fleet_id}` });
    }

    const fleet        = fleetRows[0];
    const commRate     = r2(Number(fleet.commission_rate));
    const ownerId: number | null = fleet.owner_id ?? null;

    // ── 2. 計算蝦皮趟次收入 & 趟次數 ─────────────────────────
    const { rows: orderRows } = await pool.query(`
      SELECT
        COUNT(*)                              AS trip_count,
        COALESCE(SUM(base_price), 0)::numeric AS shopee_income
      FROM orders
      WHERE fusingao_fleet_id = $1
        AND created_at >= $2
        AND created_at <  ($3::date + interval '1 day')
        AND status NOT IN ('cancelled','failed')
    `, [fleet_id, start, end]);

    const tripCount    = Number(orderRows[0]?.trip_count   ?? 0);
    const shopeeIncome = r2(Number(orderRows[0]?.shopee_income ?? 0));

    // ── 3. 靠行費 ─────────────────────────────────────────────
    const affiliationDeduct = r2(shopeeIncome * commRate / 100);

    // ── 4. 油錢：取既有結算單的設定（或預設 per_trip=0）────────
    const { rows: existRows } = await pool.query(`
      SELECT fuel_type, fuel_per_trip, fuel_monthly, fuel_receipt,
             misc_deductions, driver_payroll
      FROM   owner_cash_settlements
      WHERE  fleet_id = $1 AND period = $2
    `, [fleet_id, period]);

    const fuelType    = existRows[0]?.fuel_type    ?? "per_trip";
    const fuelPerTrip = r2(Number(existRows[0]?.fuel_per_trip  ?? 0));
    const fuelMonthly = r2(Number(existRows[0]?.fuel_monthly   ?? 0));
    const fuelReceipt = r2(Number(existRows[0]?.fuel_receipt   ?? 0));
    const fuelTotal   = calcFuelTotal(fuelType, fuelPerTrip, fuelMonthly, fuelReceipt, tripCount);

    // ── 5. 雜項：從 fleet_penalties + fleet_vehicle_costs 自動填入（若首次計算）──
    let miscDeductions: { label: string; amount: number }[] = [];
    if (existRows.length > 0 && Array.isArray(existRows[0]?.misc_deductions)) {
      miscDeductions = existRows[0].misc_deductions;
    } else {
      // 自動拉已知雜項
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

    // ── 6. 司機薪資：從 settlement_records Layer 3（若有計算過）──
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

    // ── 7. 最終結算 ───────────────────────────────────────────
    const { totalDeduction, netCash } = recalcNet(
      shopeeIncome, affiliationDeduct, fuelTotal, miscTotal, driverPayroll
    );

    // ── 8. 冪等寫入 ───────────────────────────────────────────
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
         COALESCE(
           (SELECT status FROM owner_cash_settlements WHERE fleet_id=$2 AND period=$3),
           'draft'
         ),
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
        "①趟次收入":   shopeeIncome,
        "②靠行費%":   `-${affiliationDeduct}  (${commRate}%)`,
        "③油費":      `-${fuelTotal}  [${fuelType}]`,
        "④雜項":      `-${miscTotal}`,
        "⑤司機薪資":  `-${driverPayroll}`,
        "＝現金給車主": netCash,
      },
    });

  } catch (err: any) {
    console.error("[owner-settlement/calculate]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/owner-settlement/summary ────────────────────────
// 必須在 /:fleetId 之前註冊，避免 "summary" 被解析成 fleetId
ownerCashSettlementRouter.get("/owner-settlement/summary", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        ocs.id,
        ocs.fleet_id,
        f.fleet_name,
        ocs.trip_count,
        ocs.shopee_income,
        ocs.affiliation_deduct,
        ocs.fuel_total,
        ocs.misc_total,
        ocs.driver_payroll,
        ocs.total_deduction,
        ocs.net_cash,
        ocs.status,
        ocs.paid_at,
        ocs.paid_by,
        ocs.updated_at
      FROM   owner_cash_settlements ocs
      JOIN   fusingao_fleets f ON f.id = ocs.fleet_id
      WHERE  ocs.period = $1
      ORDER  BY ocs.net_cash DESC
    `, [period]);

    const totals = rows.reduce((acc, r) => ({
      shopee_income:      r2(acc.shopee_income      + Number(r.shopee_income)),
      total_deduction:    r2(acc.total_deduction    + Number(r.total_deduction)),
      net_cash:           r2(acc.net_cash           + Number(r.net_cash)),
      driver_payroll:     r2(acc.driver_payroll     + Number(r.driver_payroll)),
    }), { shopee_income: 0, total_deduction: 0, net_cash: 0, driver_payroll: 0 });

    return res.json({
      period,
      count: rows.length,
      totals,
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
    return res.json({
      settlement: s,
      breakdown: {
        "①趟次收入（蝦皮代收）": s.shopee_income,
        "②靠行費%":             `-${s.affiliation_deduct}  (${s.commission_rate}%)`,
        "③油費":                `-${s.fuel_total}  [${s.fuel_type}]`,
        "④雜項":                `-${s.misc_total}`,
        "⑤司機薪資":            `-${s.driver_payroll}`,
        "＝現金給車主":          s.net_cash,
      },
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
    fuel_type,
    fuel_per_trip,
    fuel_monthly,
    fuel_receipt,
    misc_deductions,
    driver_payroll,
  } = req.body as {
    fuel_type?:       string;
    fuel_per_trip?:   number;
    fuel_monthly?:    number;
    fuel_receipt?:    number;
    misc_deductions?: { label: string; amount: number }[];
    driver_payroll?:  number;
  };

  try {
    // 取現有資料
    const { rows: cur } = await pool.query(
      `SELECT * FROM owner_cash_settlements WHERE id = $1`, [id]
    );
    if (!cur.length) return res.status(404).json({ error: "找不到結算單" });
    if (cur[0].status === "paid") {
      return res.status(409).json({ error: "已付款的結算單不可修改" });
    }

    const s = cur[0];
    const newFuelType    = fuel_type     ?? s.fuel_type;
    const newFuelPerTrip = fuel_per_trip !== undefined ? r2(fuel_per_trip) : Number(s.fuel_per_trip);
    const newFuelMonthly = fuel_monthly  !== undefined ? r2(fuel_monthly)  : Number(s.fuel_monthly);
    const newFuelReceipt = fuel_receipt  !== undefined ? r2(fuel_receipt)  : Number(s.fuel_receipt);
    const newMisc        = misc_deductions !== undefined ? misc_deductions : s.misc_deductions;
    const newDriverPay   = driver_payroll !== undefined ? r2(driver_payroll) : Number(s.driver_payroll);

    const newFuelTotal = calcFuelTotal(
      newFuelType, newFuelPerTrip, newFuelMonthly, newFuelReceipt, Number(s.trip_count)
    );
    const newMiscTotal = calcMiscTotal(newMisc);
    const { totalDeduction, netCash } = recalcNet(
      Number(s.shopee_income), Number(s.affiliation_deduct),
      newFuelTotal, newMiscTotal, newDriverPay
    );

    const { rows: updated } = await pool.query(`
      UPDATE owner_cash_settlements SET
        fuel_type       = $2,
        fuel_per_trip   = $3,
        fuel_monthly    = $4,
        fuel_receipt    = $5,
        fuel_total      = $6,
        misc_deductions = $7::jsonb,
        misc_total      = $8,
        driver_payroll  = $9,
        total_deduction = $10,
        net_cash        = $11,
        updated_at      = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      newFuelType, newFuelPerTrip, newFuelMonthly, newFuelReceipt, newFuelTotal,
      JSON.stringify(newMisc), newMiscTotal,
      newDriverPay,
      totalDeduction, netCash,
    ]);

    return res.json({
      ok: true,
      settlement: updated[0],
      breakdown: {
        "①趟次收入":   updated[0].shopee_income,
        "②靠行費%":   `-${updated[0].affiliation_deduct}`,
        "③油費":      `-${newFuelTotal}  [${newFuelType}]`,
        "④雜項":      `-${newMiscTotal}`,
        "⑤司機薪資":  `-${newDriverPay}`,
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
    paid_by?: string;
    receipt_note?: string;
  };

  try {
    const { rows, rowCount } = await pool.query(`
      UPDATE owner_cash_settlements SET
        status       = 'paid',
        paid_at      = NOW(),
        paid_by      = $2,
        receipt_note = $3,
        updated_at   = NOW()
      WHERE  id = $1 AND status != 'paid'
      RETURNING id, fleet_id, period, net_cash, status, paid_at, paid_by, receipt_note
    `, [id, paid_by ?? null, receipt_note ?? null]);

    if (!rowCount || rowCount === 0) {
      // 可能已是 paid 狀態
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
