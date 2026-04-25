/**
 * fourLayerSettlement.ts — 四層財務結算系統
 *
 * 金流架構：
 *   Layer 1：福興高 → 富詠  蝦皮趟次 × (1-抽成%) × 1.05 - 罰款
 *   Layer 2：富詠 → 車主    趟次收入 - 靠行費% - 月靠行費 - 油費 - 雜項 - 司機薪資
 *   Layer 3：車主 → 司機    依 pay_type，扣繳稅 + 二代健保
 *   Layer 4：平台損益       收入 - 成本 - 營業稅
 *
 * POST   /api/settlement/calculate        計算並寫入月結算（冪等）
 * GET    /api/settlement/summary          月結四層彙總
 * GET    /api/settlement/fleet/:fleetId   單一車主結算明細
 * GET    /api/settlement/driver/:driverId 單一司機薪資明細
 * POST   /api/settlement/payout/:fleetId  標記車主已撥款
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const fourLayerSettlementRouter = Router();

// ─── 常數 ─────────────────────────────────────────────────────
const FUSINGAO_RATE_NORMAL  = 0.07;
const FUSINGAO_RATE_PREMIUM = 0.05;
const FUSINGAO_THRESHOLD    = 2_000_000;
const VAT_RATE              = 0.05;
const WITHHOLDING_RATE      = 0.10;
const WITHHOLDING_THRESHOLD = 20_010;
const NHI_SUPPLEMENT_RATE   = 0.0211;
const NHI_THRESHOLD         = 24_000;

// ─── 工具 ─────────────────────────────────────────────────────
function periodToRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const last  = new Date(y, m, 0).getDate();
  const end   = `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
  return { start, end };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// settlement_records 用 party_id=0 代替 NULL（讓 UNIQUE 約束正確運作）
const PLATFORM_PARTY_ID = 0;

// ─── POST /api/settlement/calculate ──────────────────────────
fourLayerSettlementRouter.post("/settlement/calculate", async (req, res) => {
  const { period } = req.body as { period?: string };
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  const { start, end } = periodToRange(period);

  try {
    // ── Layer 1：福興高 → 富詠 ────────────────────────────────
    const { rows: grossRows } = await pool.query(`
      SELECT COALESCE(SUM(base_price), 0)::numeric AS gross
      FROM   orders
      WHERE  created_at >= $1
        AND  created_at <  ($2::date + interval '1 day')
        AND  status NOT IN ('cancelled','failed')
    `, [start, end]);

    const l1Gross   = round2(Number(grossRows[0]?.gross ?? 0));
    const fRate     = l1Gross >= FUSINGAO_THRESHOLD ? FUSINGAO_RATE_PREMIUM : FUSINGAO_RATE_NORMAL;
    const fComm     = round2(l1Gross * fRate);

    const { rows: pen1Rows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total
      FROM   fleet_penalties WHERE period = $1
    `, [period]);
    const l1Penalty = round2(Number(pen1Rows[0]?.total ?? 0));

    // 富詠實收 = 趟次總額 × (1-抽成%) × 1.05 - 罰款
    const l1Net = round2(l1Gross * (1 - fRate) * (1 + VAT_RATE) - l1Penalty);
    const l1Tax = round2(l1Gross * (1 - fRate) * VAT_RATE);

    await upsertSettlement(period, 1, PLATFORM_PARTY_ID, '富詠運輸', 'platform',
      l1Gross, fComm + l1Penalty, l1Tax, l1Net, {
        fusingao_rate: fRate,
        fusingao_commission: fComm,
        penalty: l1Penalty,
        vat: l1Tax,
      });

    // ── Layer 3：司機薪資（先算，供 Layer 2 扣除）──────────────
    const { rows: fleetList } = await pool.query(`
      SELECT id, fleet_name, commission_rate,
             COALESCE(monthly_affiliation_fee, 0)::numeric AS monthly_affiliation_fee
      FROM   fusingao_fleets WHERE is_active = true
    `);

    // 各車隊 driver salary 合計（fleet_name → total net salary）
    const driverSalaryByFleet: Record<string, number> = {};

    const { rows: driverRows } = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.fleet_group,
        COALESCE(od.pay_type,      'per_trip')  AS pay_type,
        COALESCE(od.per_trip_rate, 0)           AS per_trip_rate,
        COALESCE(od.base_pay,      0)           AS base_pay,
        COALESCE(SUM(o.base_price),0)::numeric  AS trip_total
      FROM   drivers d
      LEFT JOIN owner_drivers od ON od.id = (
        SELECT id FROM owner_drivers od2
        WHERE  od2.driver_name = d.name AND od2.is_active = true
        LIMIT 1
      )
      LEFT JOIN orders o
        ON  o.driver_id = d.id
        AND o.created_at >= $1
        AND o.created_at <  ($2::date + interval '1 day')
        AND o.status NOT IN ('cancelled','failed')
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.fleet_group,
               od.pay_type, od.per_trip_rate, od.base_pay
      HAVING COALESCE(SUM(o.base_price), 0) > 0
          OR COALESCE(od.base_pay, 0) > 0
    `, [start, end]);

    for (const drv of driverRows) {
      const payType     = drv.pay_type as string;
      const tripTotal   = Number(drv.trip_total);
      const perTripRate = Number(drv.per_trip_rate);
      const basePay     = Number(drv.base_pay);

      let grossPay = 0;
      if (payType === "per_trip") {
        grossPay = perTripRate > 0
          ? round2(tripTotal * perTripRate / 100)
          : round2(tripTotal * 0.85);
      } else {
        grossPay = round2(basePay);
      }

      const withholding    = grossPay > WITHHOLDING_THRESHOLD ? round2(grossPay * WITHHOLDING_RATE)       : 0;
      const nhiSupplement  = grossPay > NHI_THRESHOLD         ? round2(grossPay * NHI_SUPPLEMENT_RATE)    : 0;
      const netPay         = round2(grossPay - withholding - nhiSupplement);

      await upsertSettlement(period, 3, drv.id, drv.name, 'driver',
        grossPay, withholding + nhiSupplement, withholding + nhiSupplement, netPay, {
          pay_type:       payType,
          trip_total:     tripTotal,
          withholding,
          nhi_supplement: nhiSupplement,
          fleet_group:    drv.fleet_group,
        });

      // 累計到車隊薪資池
      const fg = drv.fleet_group ?? "__unknown__";
      driverSalaryByFleet[fg] = round2((driverSalaryByFleet[fg] ?? 0) + netPay);
    }

    // ── Layer 2：富詠 → 車主（5 步扣除）──────────────────────
    //
    //   蝦皮趟次收入（富詠代收）
    //     ÷ 靠行費%  (gross × commission_rate)
    //     ÷ 月靠行固定費 (monthly_affiliation_fee)
    //     ÷ 油費    (fleet_vehicle_costs[fuel] + fuel_records)
    //     ÷ 雜項    (fleet_vehicle_costs[misc] + fleet_penalties)
    //     ÷ 司機薪資 (Layer 3 合計)
    //     ─────────────────────────
    //     = 現金給車主

    let l2TotalPayout = 0;

    for (const fleet of fleetList) {
      const fleetId    = fleet.id as number;
      const commRate   = round2(Number(fleet.commission_rate ?? 15)) / 100;
      const monthlyFee = round2(Number(fleet.monthly_affiliation_fee));

      // 趟次總額（該車隊）
      const { rows: ftRows } = await pool.query(`
        SELECT COALESCE(SUM(base_price), 0)::numeric AS gross
        FROM   orders
        WHERE  fusingao_fleet_id = $1
          AND  created_at >= $2
          AND  created_at <  ($3::date + interval '1 day')
          AND  status NOT IN ('cancelled','failed')
      `, [fleetId, start, end]);
      const fleetGross = round2(Number(ftRows[0]?.gross ?? 0));

      // ① 靠行費%
      const commDeduction = round2(fleetGross * commRate);

      // ② 油費：fleet_vehicle_costs[fuel] + fuel_records（依 plate 從 fleet_vehicles 關聯）
      const { rows: fuelRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM   fleet_vehicle_costs
        WHERE  fleet_id = $1 AND period = $2 AND cost_type = 'fuel'
      `, [fleetId, period]);

      const { rows: fuelRecRows } = await pool.query(`
        SELECT COALESCE(SUM(fr.total_amount), 0)::numeric AS total
        FROM   fuel_records fr
        JOIN   fleet_vehicles fv ON fv.plate = fr.plate_no
        WHERE  fv.fleet_reg_id = $1
          AND  fr.fuel_date >= $2 AND fr.fuel_date <= $3
      `, [fleetId, start, end]);

      const fuelCost = round2(
        Number(fuelRows[0]?.total ?? 0) + Number(fuelRecRows[0]?.total ?? 0)
      );

      // ③ 雜項：fleet_vehicle_costs[insurance/maintenance/toll/other] + fleet_penalties
      const { rows: miscRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM   fleet_vehicle_costs
        WHERE  fleet_id = $1 AND period = $2
          AND  cost_type IN ('insurance','maintenance','toll','other')
      `, [fleetId, period]);

      const { rows: penRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM   fleet_penalties
        WHERE  fleet_id = $1 AND period = $2
      `, [fleetId, period]);

      const miscCost = round2(
        Number(miscRows[0]?.total ?? 0) + Number(penRows[0]?.total ?? 0)
      );

      // ④ 司機薪資（Layer 3 已計算）
      const driverSalary = round2(driverSalaryByFleet[fleet.fleet_name] ?? 0);

      // ⑤ 現金給車主
      const totalDeduction = round2(commDeduction + monthlyFee + fuelCost + miscCost + driverSalary);
      const netToOwner     = round2(fleetGross - totalDeduction);
      l2TotalPayout       += Math.max(netToOwner, 0);   // 負數不累計成本

      await upsertSettlement(period, 2, fleetId, fleet.fleet_name, 'fleet',
        fleetGross, totalDeduction, 0, netToOwner, {
          步驟: {
            "①趟次收入":   fleetGross,
            "②靠行費%":   `-${commDeduction}  (${(commRate*100).toFixed(0)}%)`,
            "③月靠行費":  `-${monthlyFee}`,
            "④油費":      `-${fuelCost}`,
            "⑤雜項":      `-${miscCost}`,
            "⑥司機薪資":  `-${driverSalary}`,
            "＝現金給車主": netToOwner,
          },
          commission_rate:    commRate,
          commission_amount:  commDeduction,
          monthly_fee:        monthlyFee,
          fuel_cost:          fuelCost,
          misc_cost:          miscCost,
          driver_salary:      driverSalary,
        });
    }

    // ── Layer 4：平台損益 ──────────────────────────────────────
    const l4Revenue = l1Net;
    const l4Cost    = round2(l2TotalPayout);
    const l4Gross   = round2(l4Revenue - l4Cost);
    const l4Vat     = round2(l4Revenue / (1 + VAT_RATE) * VAT_RATE);
    const l4Net     = round2(l4Gross - l4Vat);

    await upsertSettlement(period, 4, PLATFORM_PARTY_ID, '富詠運輸（平台損益）', 'platform_pnl',
      l4Revenue, l4Cost, l4Vat, l4Net, {
        revenue:       l4Revenue,
        fleet_payout:  l4Cost,
        gross_profit:  l4Gross,
        vat:           l4Vat,
        net_profit:    l4Net,
      });

    return res.json({
      ok: true,
      period,
      summary: {
        layer1: { label: "福興高→富詠",   gross: l1Gross, net: l1Net,
                  fusingao_rate: `${round2(fRate*100)}%` },
        layer2: { label: "富詠→車主",     fleet_count: fleetList.length,
                  total_payout: l2TotalPayout },
        layer3: { label: "車主→司機",     driver_count: driverRows.length },
        layer4: { label: "平台損益",      revenue: l4Revenue, cost: l4Cost,
                  gross_profit: l4Gross, net_profit: l4Net },
      },
    });

  } catch (err: any) {
    console.error("[settlement/calculate]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── 共用 upsert ──────────────────────────────────────────────
async function upsertSettlement(
  period: string, layer: number, partyId: number,
  partyName: string, partyType: string,
  gross: number, deduction: number, tax: number, net: number,
  meta: object,
) {
  await pool.query(`
    INSERT INTO settlement_records
      (period, layer, party_id, party_name, party_type,
       gross_amount, deduction, tax_amount, net_amount, meta, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, NOW())
    ON CONFLICT (period, layer, party_id, party_type) DO UPDATE SET
      party_name   = EXCLUDED.party_name,
      gross_amount = EXCLUDED.gross_amount,
      deduction    = EXCLUDED.deduction,
      tax_amount   = EXCLUDED.tax_amount,
      net_amount   = EXCLUDED.net_amount,
      meta         = EXCLUDED.meta,
      updated_at   = NOW()
  `, [period, layer, partyId, partyName, partyType, gross, deduction, tax, net, JSON.stringify(meta)]);
}

// ─── GET /api/settlement/summary ──────────────────────────────
fourLayerSettlementRouter.get("/settlement/summary", async (req, res) => {
  const period = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        layer,
        party_type,
        COUNT(*)                   AS party_count,
        SUM(gross_amount)::numeric AS total_gross,
        SUM(deduction)::numeric    AS total_deduction,
        SUM(tax_amount)::numeric   AS total_tax,
        SUM(net_amount)::numeric   AS total_net,
        array_agg(DISTINCT status) AS statuses
      FROM   settlement_records
      WHERE  period = $1
      GROUP  BY layer, party_type
      ORDER  BY layer
    `, [period]);

    const { rows: pnlRows } = await pool.query(`
      SELECT meta FROM settlement_records
      WHERE  period = $1 AND layer = 4 AND party_type = 'platform_pnl'
      LIMIT  1
    `, [period]);

    return res.json({
      period,
      layers: rows,
      platform_pnl: pnlRows[0]?.meta ?? null,
      calculated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[settlement/summary]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/settlement/fleet/:fleetId ───────────────────────
fourLayerSettlementRouter.get("/settlement/fleet/:fleetId", async (req, res) => {
  const fleetId = Number(req.params.fleetId);
  const period  = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  if (!fleetId) return res.status(400).json({ error: "無效的 fleetId" });

  try {
    const { rows: sr } = await pool.query(`
      SELECT * FROM settlement_records
      WHERE  period = $1 AND layer = 2 AND party_id = $2
    `, [period, fleetId]);

    // 取該車隊名稱
    const { rows: fn } = await pool.query(
      `SELECT fleet_name FROM fusingao_fleets WHERE id = $1`, [fleetId]
    );
    const fleetName = fn[0]?.fleet_name ?? "";

    // 該車隊司機薪資明細（Layer 3）
    const { rows: drivers } = await pool.query(`
      SELECT d.id, d.name, d.driver_type,
             sr.gross_amount, sr.deduction, sr.net_amount, sr.status, sr.meta
      FROM   drivers d
      JOIN   settlement_records sr
        ON   sr.party_id = d.id AND sr.layer = 3 AND sr.period = $1
      WHERE  d.fleet_group = $2
      ORDER  BY sr.gross_amount DESC
    `, [period, fleetName]);

    // 各費用明細
    const { rows: costs } = await pool.query(`
      SELECT cost_type, SUM(amount)::numeric AS total, COUNT(*) AS items
      FROM   fleet_vehicle_costs
      WHERE  fleet_id = $1 AND period = $2
      GROUP  BY cost_type ORDER BY cost_type
    `, [fleetId, period]);

    const { rows: penalties } = await pool.query(`
      SELECT reason, amount, order_no, created_at
      FROM   fleet_penalties
      WHERE  fleet_id = $1 AND period = $2
      ORDER  BY created_at
    `, [fleetId, period]);

    return res.json({
      period,
      fleet_id:   fleetId,
      fleet_name: fleetName,
      settlement: sr[0] ?? null,
      breakdown:  sr[0]?.meta?.步驟 ?? null,
      drivers,
      costs,
      penalties,
    });
  } catch (err: any) {
    console.error("[settlement/fleet]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/settlement/driver/:driverId ─────────────────────
fourLayerSettlementRouter.get("/settlement/driver/:driverId", async (req, res) => {
  const driverId = Number(req.params.driverId);
  const period   = String(req.query.period ?? "");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  if (!driverId) return res.status(400).json({ error: "無效的 driverId" });

  const { start, end } = periodToRange(period);

  try {
    const { rows: sr } = await pool.query(`
      SELECT sr.*, d.phone, d.fleet_group, d.driver_type
      FROM   settlement_records sr
      JOIN   drivers d ON d.id = sr.party_id
      WHERE  sr.period = $1 AND sr.layer = 3 AND sr.party_id = $2
    `, [period, driverId]);

    const { rows: trips } = await pool.query(`
      SELECT id, order_no, base_price, status, created_at, completed_at,
             pickup_address, delivery_address
      FROM   orders
      WHERE  driver_id = $1
        AND  created_at >= $2
        AND  created_at <  ($3::date + interval '1 day')
        AND  status NOT IN ('cancelled','failed')
      ORDER  BY created_at
    `, [driverId, start, end]);

    return res.json({
      period,
      driver_id:  driverId,
      settlement: sr[0] ?? null,
      trips,
      trip_count: trips.length,
      trip_total: round2(trips.reduce((s, t) => s + Number(t.base_price ?? 0), 0)),
    });
  } catch (err: any) {
    console.error("[settlement/driver]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settlement/payout/:fleetId ─────────────────────
fourLayerSettlementRouter.post("/settlement/payout/:fleetId", async (req, res) => {
  const fleetId = Number(req.params.fleetId);
  const { period, payment_ref, paid_at } = req.body as {
    period?: string; payment_ref?: string; paid_at?: string;
  };

  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }
  if (!fleetId) return res.status(400).json({ error: "無效的 fleetId" });

  try {
    const { rows, rowCount } = await pool.query(`
      UPDATE settlement_records
      SET    status      = 'paid',
             paid_at     = COALESCE($3::timestamptz, NOW()),
             payment_ref = $4,
             updated_at  = NOW()
      WHERE  period = $1 AND layer = 2 AND party_id = $2
      RETURNING id, party_name, net_amount, paid_at, payment_ref
    `, [period, fleetId, paid_at ?? null, payment_ref ?? null]);

    if (!rowCount || rowCount === 0) {
      return res.status(404).json({
        error: "找不到該車主的結算記錄，請先執行 POST /settlement/calculate",
      });
    }

    return res.json({ ok: true, period, payout: rows[0] });
  } catch (err: any) {
    console.error("[settlement/payout]", err);
    return res.status(500).json({ error: err.message });
  }
});
