/**
 * fourLayerSettlement.ts
 * 四層財務結算系統
 *
 * 金流架構：
 *   Layer 1：福興高 → 富詠（蝦皮趟次 × 抽成比率 × 1.05 - 罰款）
 *   Layer 2：富詠 → 車主（趟次金額 × (1 - commission_rate)）
 *   Layer 3：車主 → 司機（依 pay_type，扣繳稅 + 二代健保）
 *   Layer 4：平台損益（收入 - 成本 - 營業稅）
 *
 * POST   /api/settlement/calculate         計算並寫入月結算
 * GET    /api/settlement/summary           月結四層彙總
 * GET    /api/settlement/fleet/:fleetId    單一車主結算明細
 * GET    /api/settlement/driver/:driverId  單一司機薪資明細
 * POST   /api/settlement/payout/:fleetId   標記車主已撥款
 */

import { Router } from "express";
import { pool } from "@workspace/db";

export const fourLayerSettlementRouter = Router();

// ─── 常數 ─────────────────────────────────────────────────────
const FUSINGAO_RATE_NORMAL   = 0.07;   // 福興高正常抽成 7%
const FUSINGAO_RATE_PREMIUM  = 0.05;   // 月業績 ≥ 200 萬改 5%
const FUSINGAO_THRESHOLD     = 2_000_000;
const VAT_RATE               = 0.05;   // 營業稅 5%
const WITHHOLDING_RATE       = 0.10;   // 扣繳稅 10%（月累計 > 20,010）
const WITHHOLDING_THRESHOLD  = 20_010;
const NHI_SUPPLEMENT_RATE    = 0.0211; // 二代健保 2.11%
const NHI_THRESHOLD          = 24_000; // 單次 > 24,000 才補費

// ─── 工具：期間轉日期範圍 ─────────────────────────────────────
function periodToRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2,"0")}-01`;
  const endDate = new Date(y, m, 0);
  const end = `${y}-${String(m).padStart(2,"0")}-${String(endDate.getDate()).padStart(2,"0")}`;
  return { start, end };
}

// ─── POST /api/settlement/calculate ──────────────────────────
fourLayerSettlementRouter.post("/settlement/calculate", async (req, res) => {
  const { period } = req.body as { period?: string };
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return res.status(400).json({ error: "period 格式錯誤，請用 YYYY-MM" });
  }

  const { start, end } = periodToRange(period);

  try {
    // ── Layer 1：計算蝦皮趟次總額（以 orders.base_price 為準）──
    const { rows: totalRows } = await pool.query(`
      SELECT COALESCE(SUM(base_price), 0)::numeric AS gross
      FROM   orders
      WHERE  created_at >= $1 AND created_at <= ($2::date + interval '1 day')
        AND  status NOT IN ('cancelled','failed')
    `, [start, end]);

    const l1Gross: number = Number(totalRows[0]?.gross ?? 0);

    // 福興高抽成率（業績 ≥ 200 萬改 5%）
    const fusingaoRate = l1Gross >= FUSINGAO_THRESHOLD
      ? FUSINGAO_RATE_PREMIUM
      : FUSINGAO_RATE_NORMAL;
    const fusingaoCommission = l1Gross * fusingaoRate;

    // 福興高罰款（fleet_id = NULL 視為平台層罰款）
    const { rows: penaltyRows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total_penalty
      FROM   fleet_penalties
      WHERE  period = $1
    `, [period]);
    const totalPenalty: number = Number(penaltyRows[0]?.total_penalty ?? 0);

    // 富詠實收 = 趟次總額 × (1 - 抽成%) × 1.05（含稅）- 罰款
    const l1Net = l1Gross * (1 - fusingaoRate) * (1 + VAT_RATE) - totalPenalty;
    const l1Tax = l1Gross * (1 - fusingaoRate) * VAT_RATE;

    await pool.query(`
      INSERT INTO settlement_records
        (period, layer, party_id, party_name, party_type,
         gross_amount, deduction, tax_amount, net_amount, meta)
      VALUES ($1, 1, NULL, '富詠運輸', 'platform',
              $2, $3, $4, $5,
              $6::jsonb)
      ON CONFLICT (period, layer, party_id, party_type) DO UPDATE SET
        gross_amount = EXCLUDED.gross_amount,
        deduction    = EXCLUDED.deduction,
        tax_amount   = EXCLUDED.tax_amount,
        net_amount   = EXCLUDED.net_amount,
        meta         = EXCLUDED.meta,
        updated_at   = NOW()
    `, [
      period, l1Gross, fusingaoCommission + totalPenalty, l1Tax, l1Net,
      JSON.stringify({
        fusingao_rate: fusingaoRate,
        fusingao_commission: fusingaoCommission,
        penalty: totalPenalty,
        vat: l1Tax,
      }),
    ]);

    // ── Layer 2：各車主結算 ───────────────────────────────────
    const { rows: fleetRows } = await pool.query(`
      SELECT
        f.id,
        f.fleet_name,
        f.commission_rate,
        COALESCE(SUM(o.base_price), 0)::numeric AS fleet_gross
      FROM   fusingao_fleets f
      LEFT JOIN orders o
        ON  o.fusingao_fleet_id = f.id
        AND o.created_at >= $1
        AND o.created_at <= ($2::date + interval '1 day')
        AND o.status NOT IN ('cancelled','failed')
      WHERE  f.is_active = true
      GROUP  BY f.id, f.fleet_name, f.commission_rate
    `, [start, end]);

    let l2TotalCost = 0;

    for (const fleet of fleetRows) {
      const fleetGross: number = Number(fleet.fleet_gross);
      const commRate: number   = Number(fleet.commission_rate ?? 15) / 100;

      // 車主應收 = 趟次金額 × (1 - commission_rate)
      const fleetNet = fleetGross * (1 - commRate);
      const fleetDeduction = fleetGross * commRate;

      // 該車主罰款
      const { rows: fp } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS p
        FROM   fleet_penalties
        WHERE  fleet_id = $1 AND period = $2
      `, [fleet.id, period]);
      const fleetPenalty = Number(fp[0]?.p ?? 0);

      const fleetNetAfterPenalty = fleetNet - fleetPenalty;
      l2TotalCost += fleetNetAfterPenalty;

      await pool.query(`
        INSERT INTO settlement_records
          (period, layer, party_id, party_name, party_type,
           gross_amount, deduction, tax_amount, net_amount, meta)
        VALUES ($1, 2, $2, $3, 'fleet',
                $4, $5, 0, $6,
                $7::jsonb)
        ON CONFLICT (period, layer, party_id, party_type) DO UPDATE SET
          gross_amount = EXCLUDED.gross_amount,
          deduction    = EXCLUDED.deduction,
          net_amount   = EXCLUDED.net_amount,
          meta         = EXCLUDED.meta,
          updated_at   = NOW()
      `, [
        period, fleet.id, fleet.fleet_name,
        fleetGross, fleetDeduction + fleetPenalty, fleetNetAfterPenalty,
        JSON.stringify({
          commission_rate: commRate,
          commission_amount: fleetDeduction,
          penalty: fleetPenalty,
        }),
      ]);
    }

    // ── Layer 3：司機薪資 ─────────────────────────────────────
    const { rows: driverRows } = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.driver_type,
        d.fleet_group,
        COALESCE(od.pay_type, 'per_trip')  AS pay_type,
        COALESCE(od.per_trip_rate, 0)      AS per_trip_rate,
        COALESCE(od.base_pay, 0)           AS base_pay,
        COALESCE(SUM(o.base_price), 0)::numeric AS trip_total
      FROM   drivers d
      LEFT JOIN owner_drivers od ON od.id = (
        SELECT id FROM owner_drivers od2
        WHERE  od2.driver_name = d.name AND od2.is_active = true
        LIMIT  1
      )
      LEFT JOIN orders o
        ON  o.driver_id = d.id
        AND o.created_at >= $1
        AND o.created_at <= ($2::date + interval '1 day')
        AND o.status NOT IN ('cancelled','failed')
      WHERE  d.is_active = true
      GROUP  BY d.id, d.name, d.driver_type, d.fleet_group,
                od.pay_type, od.per_trip_rate, od.base_pay
      HAVING COALESCE(SUM(o.base_price), 0) > 0
          OR COALESCE(od.base_pay, 0) > 0
    `, [start, end]);

    for (const drv of driverRows) {
      const payType    = drv.pay_type    as string;
      const tripTotal  = Number(drv.trip_total);
      const perTripRate = Number(drv.per_trip_rate);
      const basePay    = Number(drv.base_pay);

      let grossPay = 0;
      if (payType === "per_trip") {
        grossPay = perTripRate > 0
          ? tripTotal * perTripRate / 100  // per_trip_rate 視為百分比趟次分潤
          : tripTotal * 0.85;              // 預設司機拿 85%
      } else {
        grossPay = basePay;                // daily / monthly 直接用 base_pay
      }

      // 扣繳稅（月累計 > 20,010 → 10%）
      const withholding = grossPay > WITHHOLDING_THRESHOLD
        ? grossPay * WITHHOLDING_RATE : 0;

      // 二代健保補費（單次/月 > 24,000 → 2.11%）
      const nhiSupplement = grossPay > NHI_THRESHOLD
        ? grossPay * NHI_SUPPLEMENT_RATE : 0;

      const netPay = grossPay - withholding - nhiSupplement;

      await pool.query(`
        INSERT INTO settlement_records
          (period, layer, party_id, party_name, party_type,
           gross_amount, deduction, tax_amount, net_amount, meta)
        VALUES ($1, 3, $2, $3, 'driver',
                $4, $5, $6, $7,
                $8::jsonb)
        ON CONFLICT (period, layer, party_id, party_type) DO UPDATE SET
          gross_amount = EXCLUDED.gross_amount,
          deduction    = EXCLUDED.deduction,
          tax_amount   = EXCLUDED.tax_amount,
          net_amount   = EXCLUDED.net_amount,
          meta         = EXCLUDED.meta,
          updated_at   = NOW()
      `, [
        period, drv.id, drv.name,
        grossPay, withholding + nhiSupplement, withholding + nhiSupplement, netPay,
        JSON.stringify({
          pay_type: payType,
          trip_total: tripTotal,
          withholding,
          nhi_supplement: nhiSupplement,
          fleet_group: drv.fleet_group,
        }),
      ]);
    }

    // ── Layer 4：平台損益 ─────────────────────────────────────
    const l4Revenue  = l1Net;                              // 富詠實收
    const l4Cost     = l2TotalCost;                        // 付給各車主
    const l4Gross    = l4Revenue - l4Cost;                 // 毛利
    const l4Vat      = l4Revenue / (1 + VAT_RATE) * VAT_RATE; // 應繳營業稅
    const l4Net      = l4Gross - l4Vat;                   // 淨利

    await pool.query(`
      INSERT INTO settlement_records
        (period, layer, party_id, party_name, party_type,
         gross_amount, deduction, tax_amount, net_amount, meta)
      VALUES ($1, 4, NULL, '富詠運輸（平台損益）', 'platform_pnl',
              $2, $3, $4, $5,
              $6::jsonb)
      ON CONFLICT (period, layer, party_id, party_type) DO UPDATE SET
        gross_amount = EXCLUDED.gross_amount,
        deduction    = EXCLUDED.deduction,
        tax_amount   = EXCLUDED.tax_amount,
        net_amount   = EXCLUDED.net_amount,
        meta         = EXCLUDED.meta,
        updated_at   = NOW()
    `, [
      period, l4Revenue, l4Cost, l4Vat, l4Net,
      JSON.stringify({
        revenue: l4Revenue,
        fleet_payout: l4Cost,
        gross_profit: l4Gross,
        vat: l4Vat,
        net_profit: l4Net,
      }),
    ]);

    return res.json({
      ok: true,
      period,
      summary: {
        layer1: { label: "福興高→富詠", gross: l1Gross, net: l1Net },
        layer2: { label: "富詠→車主", fleet_count: fleetRows.length, total_payout: l2TotalCost },
        layer3: { label: "車主→司機", driver_count: driverRows.length },
        layer4: { label: "平台損益", revenue: l4Revenue, cost: l4Cost, gross_profit: l4Gross, net_profit: l4Net },
      },
    });

  } catch (err: any) {
    console.error("[settlement/calculate]", err);
    return res.status(500).json({ error: err.message });
  }
});

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
        COUNT(*)                    AS party_count,
        SUM(gross_amount)::numeric  AS total_gross,
        SUM(deduction)::numeric     AS total_deduction,
        SUM(tax_amount)::numeric    AS total_tax,
        SUM(net_amount)::numeric    AS total_net,
        ARRAY_AGG(status)           AS statuses
      FROM   settlement_records
      WHERE  period = $1
      GROUP  BY layer, party_type
      ORDER  BY layer
    `, [period]);

    // 也拉 Layer 4 的 meta 作為最終損益
    const { rows: pnlRows } = await pool.query(`
      SELECT meta FROM settlement_records
      WHERE period = $1 AND layer = 4 AND party_type = 'platform_pnl'
      LIMIT 1
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
      WHERE period = $1 AND layer = 2 AND party_id = $2
    `, [period, fleetId]);

    const { rows: drivers } = await pool.query(`
      SELECT d.id, d.name, d.driver_type,
             sr.gross_amount, sr.deduction, sr.net_amount, sr.status, sr.meta
      FROM   drivers d
      JOIN   settlement_records sr
        ON   sr.party_id = d.id AND sr.layer = 3 AND sr.period = $1
      WHERE  d.fleet_group = (
        SELECT fleet_name FROM fusingao_fleets WHERE id = $2 LIMIT 1
      )
      ORDER  BY sr.gross_amount DESC
    `, [period, fleetId]);

    const { rows: penalties } = await pool.query(`
      SELECT reason, amount, order_no, created_at
      FROM   fleet_penalties
      WHERE  fleet_id = $1 AND period = $2
      ORDER  BY created_at
    `, [fleetId, period]);

    return res.json({
      period,
      fleet_id: fleetId,
      settlement: sr[0] ?? null,
      drivers,
      penalties,
    });
  } catch (err: any) {
    console.error("[settlement/fleet]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/settlement/driver/:driverId ────────────────────
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
        AND  created_at <= ($3::date + interval '1 day')
        AND  status NOT IN ('cancelled','failed')
      ORDER  BY created_at
    `, [driverId, start, end]);

    return res.json({
      period,
      driver_id: driverId,
      settlement: sr[0] ?? null,
      trips,
      trip_count: trips.length,
      trip_total: trips.reduce((s, t) => s + Number(t.base_price ?? 0), 0),
    });
  } catch (err: any) {
    console.error("[settlement/driver]", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/settlement/payout/:fleetId ────────────────────
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
        error: "找不到該車主的結算記錄，請先執行 /settlement/calculate",
      });
    }

    return res.json({ ok: true, period, payout: rows[0] });
  } catch (err: any) {
    console.error("[settlement/payout]", err);
    return res.status(500).json({ error: err.message });
  }
});
