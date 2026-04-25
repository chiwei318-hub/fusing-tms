/**
 * ownerCashSettlement.ts — 車主現金結算系統
 *
 * 結算公式：
 *   蝦皮趟次收入（富詠代收）
 *     - 靠行費          (shopee_income × commission_rate%)
 *     - 油費            (自動從 fuel_card_records 加總)
 *     - 司機薪資
 *     - 雜項            (罰款/保險/維修 等 JSONB 陣列)
 *   ═══════════════════
 *     = 現金給車主
 *
 *   中油退款 1%（fuel_rebate）→ 富詠自留，不退還給車主
 *
 * POST   /api/owner-settlement/calculate          自動計算結算單（冪等）
 * GET    /api/owner-settlement/summary            所有車主月結彙總
 * GET    /api/owner-settlement/:fleetId           查詢結算單
 * PATCH  /api/owner-settlement/:id/misc           新增/更新雜項扣款
 * PATCH  /api/owner-settlement/:id/pay            標記現金已付
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const ownerCashSettlementRouter = Router();

// ─── 工具 ─────────────────────────────────────────────────────
function periodToRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start  = `${y}-${String(m).padStart(2, "0")}-01`;
  const last   = new Date(y, m, 0).getDate();
  const end    = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function r2(n: number) { return Math.round(n * 100) / 100; }

function calcMiscTotal(misc: { label: string; amount: number }[]) {
  return r2(misc.reduce((s, d) => s + Number(d.amount ?? 0), 0));
}

// ─── POST /api/owner-settlement/calculate ─────────────────────
ownerCashSettlementRouter.post("/owner-settlement/calculate", async (req, res) => {
  const { fleet_id, period } = req.body as { fleet_id?: number; period?: string };

  if (!fleet_id || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "需要 fleet_id 及正確格式 period（YYYY-MM）" });
  }

  const { start, end } = periodToRange(period);

  try {
    // ① 車隊設定
    const { rows: fleetRows } = await pool.query(`
      SELECT id, fleet_name,
             COALESCE(commission_rate, 15)::numeric AS commission_rate
      FROM   fusingao_fleets
      WHERE  id = $1
    `, [fleet_id]);

    if (!fleetRows.length) {
      return res.status(404).json({ error: `找不到 fleet_id=${fleet_id}` });
    }

    const fleet      = fleetRows[0];
    const commRate   = r2(Number(fleet.commission_rate));
    const fleetName  = fleet.fleet_name;

    // ② 蝦皮趟次收入（from orders）
    const { rows: orderRows } = await pool.query(`
      SELECT COUNT(*)::int                         AS trip_count,
             COALESCE(SUM(base_price), 0)::numeric AS shopee_income
      FROM   orders
      WHERE  fusingao_fleet_id = $1
        AND  created_at >= $2
        AND  created_at <  ($3::date + interval '1 day')
        AND  status NOT IN ('cancelled', 'failed')
    `, [fleet_id, start, end]);

    const tripCount    = Number(orderRows[0]?.trip_count    ?? 0);
    const shopeeIncome = r2(Number(orderRows[0]?.shopee_income ?? 0));
    const affiliationDeduct = r2(shopeeIncome * commRate / 100);

    // ③ 油費：從 fuel_card_records 自動加總
    const { rows: fuelRows } = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0)::numeric      AS fuel_deduct,
        COALESCE(SUM(cpc_rebate), 0)::numeric  AS fuel_rebate
      FROM   fuel_card_records
      WHERE  fleet_id = $1 AND period = $2
    `, [fleet_id, period]);

    const fuelDeduct = r2(Number(fuelRows[0]?.fuel_deduct ?? 0));
    const fuelRebate = r2(Number(fuelRows[0]?.fuel_rebate ?? 0));

    // ④ 司機薪資（優先取既有結算單；否則從 settlement_records layer 3 加總）
    const { rows: existRows } = await pool.query(`
      SELECT driver_payroll, misc_deductions
      FROM   owner_cash_settlements
      WHERE  fleet_id = $1 AND period = $2
    `, [fleet_id, period]);

    let driverPayroll = 0;
    if (existRows.length && Number(existRows[0].driver_payroll) > 0) {
      driverPayroll = r2(Number(existRows[0].driver_payroll));
    } else {
      const { rows: srRows } = await pool.query(`
        SELECT COALESCE(SUM(net_amount), 0)::numeric AS total
        FROM   settlement_records sr
        JOIN   drivers d ON d.id = sr.party_id
        WHERE  sr.period = $1 AND sr.layer = 3
          AND  d.fleet_group = $2
      `, [period, fleetName]);
      driverPayroll = r2(Number(srRows[0]?.total ?? 0));
    }

    // ⑤ 雜項：保留既有設定；首次從 penalties + vehicle_costs 自動拉
    let miscDeductions: { label: string; amount: number }[] = [];
    if (existRows.length && Array.isArray(existRows[0]?.misc_deductions) && existRows[0].misc_deductions.length > 0) {
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
        ...penRows.map(r  => ({ label: String(r.label),  amount: Number(r.amount) })),
        ...costRows.map(r => ({ label: String(r.label),  amount: Number(r.amount) })),
      ];
    }
    const miscTotal = calcMiscTotal(miscDeductions);

    // ⑥ 結算
    const totalDeduction = r2(affiliationDeduct + fuelDeduct + driverPayroll + miscTotal);
    const netCash        = r2(shopeeIncome - totalDeduction);

    // ⑦ 冪等 upsert
    const { rows: upserted } = await pool.query(`
      INSERT INTO owner_cash_settlements
        (fleet_id, fleet_name, period,
         shopee_income, trip_count,
         affiliation_deduct, commission_rate,
         fuel_deduct, fuel_rebate, fuel_total,
         driver_payroll,
         misc_deductions, misc_total,
         total_deduction, net_cash,
         status, updated_at)
      VALUES
        ($1,$2,$3,
         $4,$5,
         $6,$7,
         $8,$9,$8,
         $10,
         $11::jsonb,$12,
         $13,$14,
         COALESCE(
           (SELECT status FROM owner_cash_settlements WHERE fleet_id=$1 AND period=$3),
           'draft'
         ),
         NOW())
      ON CONFLICT (fleet_id, period) DO UPDATE SET
        fleet_name          = EXCLUDED.fleet_name,
        shopee_income       = EXCLUDED.shopee_income,
        trip_count          = EXCLUDED.trip_count,
        affiliation_deduct  = EXCLUDED.affiliation_deduct,
        commission_rate     = EXCLUDED.commission_rate,
        fuel_deduct         = EXCLUDED.fuel_deduct,
        fuel_rebate         = EXCLUDED.fuel_rebate,
        fuel_total          = EXCLUDED.fuel_total,
        driver_payroll      = EXCLUDED.driver_payroll,
        misc_deductions     = EXCLUDED.misc_deductions,
        misc_total          = EXCLUDED.misc_total,
        total_deduction     = EXCLUDED.total_deduction,
        net_cash            = EXCLUDED.net_cash,
        updated_at          = NOW()
      RETURNING *
    `, [
      fleet_id, fleetName, period,
      shopeeIncome, tripCount,
      affiliationDeduct, commRate,
      fuelDeduct, fuelRebate,
      driverPayroll,
      JSON.stringify(miscDeductions), miscTotal,
      totalDeduction, netCash,
    ]);

    // 同時把 fuel_card_records 標記為已扣款
    if (fuelDeduct > 0) {
      await pool.query(`
        UPDATE fuel_card_records SET is_deducted = true
        WHERE  fleet_id = $1 AND period = $2
      `, [fleet_id, period]);
    }

    return res.json({
      ok: true,
      settlement: upserted[0],
      breakdown: {
        "①趟次收入（蝦皮代收）": shopeeIncome,
        "②靠行費":              `-${affiliationDeduct}（${commRate}%）`,
        "③油費（公司卡代墊）":   {
          deduct:  `-${fuelDeduct}`,
          rebate:  `+${fuelRebate}（中油1%，富詠自留）`,
        },
        "④司機薪資":            `-${driverPayroll}`,
        "⑤雜項":               `-${miscTotal}`,
        "＝現金給車主":          netCash,
      },
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

  try {
    const { rows } = await pool.query(`
      SELECT
        ocs.id, ocs.fleet_id, ocs.fleet_name, ocs.period,
        ocs.trip_count, ocs.shopee_income,
        ocs.affiliation_deduct, ocs.commission_rate,
        ocs.fuel_deduct, ocs.fuel_rebate,
        ocs.driver_payroll, ocs.misc_total,
        ocs.total_deduction, ocs.net_cash,
        ocs.status, ocs.paid_at, ocs.paid_by, ocs.updated_at
      FROM   owner_cash_settlements ocs
      WHERE  ocs.period = $1
      ORDER  BY ocs.net_cash DESC
    `, [period]);

    const totals = rows.reduce((acc, r) => ({
      shopee_income:   r2(acc.shopee_income   + Number(r.shopee_income)),
      fuel_deduct:     r2(acc.fuel_deduct     + Number(r.fuel_deduct)),
      fuel_rebate:     r2(acc.fuel_rebate     + Number(r.fuel_rebate)),
      driver_payroll:  r2(acc.driver_payroll  + Number(r.driver_payroll)),
      misc_total:      r2(acc.misc_total      + Number(r.misc_total)),
      total_deduction: r2(acc.total_deduction + Number(r.total_deduction)),
      net_cash:        r2(acc.net_cash        + Number(r.net_cash)),
    }), {
      shopee_income: 0, fuel_deduct: 0, fuel_rebate: 0,
      driver_payroll: 0, misc_total: 0, total_deduction: 0, net_cash: 0,
    });

    return res.json({
      period,
      count: rows.length,
      totals: {
        ...totals,
        fuel_rebate_note: "中油退款1%（富詠平台收益）",
      },
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
      SELECT ocs.*,
             f.commission_rate AS fleet_commission_rate
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
    const { rows: fuelDetail } = await pool.query(`
      SELECT vehicle_plate, fuel_date, fuel_station,
             liters, amount, cpc_rebate, receipt_no, is_deducted, note
      FROM   fuel_card_records
      WHERE  fleet_id = $1 AND period = $2
      ORDER  BY fuel_date
    `, [fleetId, period]);

    return res.json({
      settlement: s,
      breakdown: {
        "①趟次收入":  s.shopee_income,
        "②靠行費%":  `-${s.affiliation_deduct}（${s.commission_rate}%）`,
        "③油費":     `-${s.fuel_deduct}（公司卡代墊，中油回饋${s.fuel_rebate}元富詠自留）`,
        "④司機薪資": `-${s.driver_payroll}`,
        "⑤雜項":    `-${s.misc_total}`,
        "＝現金給車主": s.net_cash,
      },
      fuel_records:   fuelDetail,
      misc_breakdown: s.misc_deductions ?? [],
    });
  } catch (err: any) {
    console.error("[owner-settlement/:fleetId]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/owner-settlement/:id/misc ─────────────────────
ownerCashSettlementRouter.patch("/owner-settlement/:id/misc", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "無效的 id" });

  const { misc_deductions } = req.body as {
    misc_deductions: { label: string; amount: number }[];
  };

  if (!Array.isArray(misc_deductions)) {
    return res.status(400).json({
      error: "misc_deductions 需為陣列，格式：[{label:'罰款',amount:500}]",
    });
  }

  try {
    const { rows: cur } = await pool.query(
      `SELECT * FROM owner_cash_settlements WHERE id = $1`, [id]
    );
    if (!cur.length) return res.status(404).json({ error: "找不到結算單" });
    if (cur[0].status === "paid") {
      return res.status(409).json({ error: "已付款的結算單不可修改" });
    }

    const s           = cur[0];
    const miscTotal   = calcMiscTotal(misc_deductions);
    const totalDeduct = r2(
      Number(s.affiliation_deduct) + Number(s.fuel_deduct) +
      Number(s.driver_payroll)     + miscTotal
    );
    const netCash = r2(Number(s.shopee_income) - totalDeduct);

    const { rows: updated } = await pool.query(`
      UPDATE owner_cash_settlements SET
        misc_deductions = $2::jsonb,
        misc_total      = $3,
        total_deduction = $4,
        net_cash        = $5,
        updated_at      = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, JSON.stringify(misc_deductions), miscTotal, totalDeduct, netCash]);

    return res.json({
      ok: true,
      settlement: updated[0],
      misc_deductions,
      misc_total: miscTotal,
      net_cash:   netCash,
    });
  } catch (err: any) {
    console.error("[owner-settlement/:id/misc]", err);
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
        status       = 'paid',
        paid_at      = NOW(),
        paid_by      = $2,
        receipt_note = $3,
        updated_at   = NOW()
      WHERE  id = $1 AND status != 'paid'
      RETURNING id, fleet_id, fleet_name, period, net_cash,
                status, paid_at, paid_by, receipt_note
    `, [id, paid_by ?? null, receipt_note ?? null]);

    if (!rowCount) {
      const { rows: chk } = await pool.query(
        `SELECT status FROM owner_cash_settlements WHERE id = $1`, [id]
      );
      if (chk[0]?.status === "paid") {
        return res.status(409).json({ error: "此結算單已標記為付款，請勿重複操作" });
      }
      return res.status(404).json({ error: "找不到結算單" });
    }

    return res.json({
      ok: true,
      message: `✅ 現金 $${rows[0].net_cash} 已付款給 ${rows[0].fleet_name ?? "車主"}`,
      payout: rows[0],
    });
  } catch (err: any) {
    console.error("[owner-settlement/:id/pay]", err);
    return res.status(500).json({ error: err.message });
  }
});
