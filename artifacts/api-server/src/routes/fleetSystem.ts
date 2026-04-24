/**
 * fleetSystem.ts
 * 車隊分類損益系統
 *
 * 車主實領公式：
 *   蝦皮趟次款
 *   × (1 - fusingao_commission_rate%)  福興高抽成（預設 7%）
 *   × (1 - commission_rate%)           富詠抽成（預設 15%）
 *   + 自接收入
 *   - 掛靠費
 *   - 司機薪資
 *   - 罰款
 *   = 車主實領
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

export const FLEET_TYPES = {
  affiliated: { label: "靠行車",  withholdingRate: 0.10, monthlyFee: true  },
  owner:      { label: "車主車",  withholdingRate: 0.10, monthlyFee: false },
  external:   { label: "外車",    withholdingRate: 0.10, monthlyFee: false },
  agency:     { label: "貨運行",  withholdingRate: 0.019,monthlyFee: false },
} as const;

export type FleetType = keyof typeof FLEET_TYPES;

export function createFleetSystemRouter() {
  const router = Router();

  async function ensureTables() {
    // fusingao_fleets 新欄位
    const fleetCols = [
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        fleet_type TEXT DEFAULT 'owner'
        CHECK (fleet_type IN ('affiliated','owner','external','agency'))`,
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        fusingao_commission_rate NUMERIC(5,2) DEFAULT 7`,
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        monthly_affiliation_fee NUMERIC(10,2) DEFAULT 0`,
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        platform_fee_monthly NUMERIC(10,2) DEFAULT 0`,
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        contract_start_date DATE`,
      `ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS
        notes_internal TEXT`,
    ];
    for (const s of fleetCols) {
      try { await pool.query(s); } catch {}
    }

    // fleet_orders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_orders (
        id               SERIAL PRIMARY KEY,
        fleet_id         INTEGER NOT NULL REFERENCES fusingao_fleets(id),
        order_no         TEXT UNIQUE,
        source           TEXT DEFAULT 'self'
          CHECK (source IN ('fusingao','self')),
        customer_name    TEXT,
        customer_phone   TEXT,
        pickup_address   TEXT,
        delivery_address TEXT,
        cargo_name       TEXT,
        cargo_weight     NUMERIC(10,2),
        vehicle_type     TEXT,
        assigned_driver_id INTEGER,
        assigned_driver_name TEXT,
        total_fee        NUMERIC(10,2) DEFAULT 0,
        driver_pay       NUMERIC(10,2) DEFAULT 0,
        status           TEXT DEFAULT 'pending'
          CHECK (status IN ('pending','assigned','in_transit','delivered','cancelled')),
        pickup_date      DATE,
        note             TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // fleet_vehicle_costs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_vehicle_costs (
        id          SERIAL PRIMARY KEY,
        fleet_id    INTEGER NOT NULL REFERENCES fusingao_fleets(id),
        driver_id   INTEGER,
        period      TEXT NOT NULL,
        cost_type   TEXT NOT NULL
          CHECK (cost_type IN ('fuel','insurance','maintenance','toll','other')),
        amount      NUMERIC(10,2) NOT NULL,
        description TEXT,
        receipt_no  TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // fleet_penalties — 罰款明細
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_penalties (
        id          SERIAL PRIMARY KEY,
        fleet_id    INTEGER NOT NULL REFERENCES fusingao_fleets(id),
        driver_id   INTEGER,
        period      TEXT NOT NULL,
        reason      TEXT NOT NULL,
        amount      NUMERIC(10,2) NOT NULL,
        order_no    TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // fleet_ledger — 月損益快照（含完整雙層抽成明細）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fleet_ledger (
        id                      SERIAL PRIMARY KEY,
        fleet_id                INTEGER NOT NULL REFERENCES fusingao_fleets(id),
        period                  TEXT NOT NULL,
        -- 蝦皮收入拆解
        shopee_gross            NUMERIC(12,2) DEFAULT 0,
        fusingao_commission_amt NUMERIC(12,2) DEFAULT 0,
        fuying_commission_amt   NUMERIC(12,2) DEFAULT 0,
        fusingao_income         NUMERIC(12,2) DEFAULT 0,
        self_income             NUMERIC(12,2) DEFAULT 0,
        total_income            NUMERIC(12,2) DEFAULT 0,
        -- 成本明細
        driver_cost             NUMERIC(12,2) DEFAULT 0,
        vehicle_cost            NUMERIC(12,2) DEFAULT 0,
        platform_fee            NUMERIC(12,2) DEFAULT 0,
        monthly_affiliation     NUMERIC(12,2) DEFAULT 0,
        penalties               NUMERIC(12,2) DEFAULT 0,
        total_cost              NUMERIC(12,2) DEFAULT 0,
        -- 最終結果
        gross_profit            NUMERIC(12,2) DEFAULT 0,
        net_owner_pay           NUMERIC(12,2) DEFAULT 0,
        profit_margin           NUMERIC(6,2)  DEFAULT 0,
        fusingao_trip_count     INTEGER DEFAULT 0,
        self_trip_count         INTEGER DEFAULT 0,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(fleet_id, period)
      )
    `);

    // 舊表補欄位（若已存在 fleet_ledger 但缺新欄位）
    const ledgerCols = [
      "ALTER TABLE fleet_ledger ADD COLUMN IF NOT EXISTS shopee_gross            NUMERIC(12,2) DEFAULT 0",
      "ALTER TABLE fleet_ledger ADD COLUMN IF NOT EXISTS fusingao_commission_amt NUMERIC(12,2) DEFAULT 0",
      "ALTER TABLE fleet_ledger ADD COLUMN IF NOT EXISTS fuying_commission_amt   NUMERIC(12,2) DEFAULT 0",
      "ALTER TABLE fleet_ledger ADD COLUMN IF NOT EXISTS penalties               NUMERIC(12,2) DEFAULT 0",
      "ALTER TABLE fleet_ledger ADD COLUMN IF NOT EXISTS net_owner_pay           NUMERIC(12,2) DEFAULT 0",
    ];
    for (const s of ledgerCols) {
      try { await pool.query(s); } catch {}
    }

    console.log("[FleetSystem] 車隊分類系統表結構確認完成");
  }
  ensureTables().catch(console.error);

  // ════════════════════════════════════════════════════════════
  // 車隊管理
  // ════════════════════════════════════════════════════════════

  router.get("/fleets", async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          f.*,
          COUNT(fd.id)::int  AS driver_count,
          COUNT(fo.id)::int  AS self_order_count
        FROM fusingao_fleets f
        LEFT JOIN fleet_drivers fd ON fd.fleet_id = f.id
        LEFT JOIN fleet_orders  fo ON fo.fleet_id = f.id
          AND fo.source = 'self'
          AND fo.created_at >= date_trunc('month', NOW())
        WHERE f.is_active = true
        GROUP BY f.id
        ORDER BY f.fleet_type, f.fleet_name
      `);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/fleets/:id/type", async (req: Request, res: Response) => {
    try {
      const {
        fleet_type, fusingao_commission_rate,
        monthly_affiliation_fee, platform_fee_monthly,
      } = req.body;
      if (!Object.keys(FLEET_TYPES).includes(fleet_type)) {
        return res.status(400).json({ error: "無效的 fleet_type" });
      }
      const { rows } = await pool.query(`
        UPDATE fusingao_fleets SET
          fleet_type               = $1,
          fusingao_commission_rate = COALESCE($2, fusingao_commission_rate),
          monthly_affiliation_fee  = COALESCE($3, monthly_affiliation_fee),
          platform_fee_monthly     = COALESCE($4, platform_fee_monthly),
          updated_at               = NOW()
        WHERE id = $5
        RETURNING *
      `, [fleet_type,
          fusingao_commission_rate ?? null,
          monthly_affiliation_fee  ?? null,
          platform_fee_monthly     ?? null,
          req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "找不到車隊" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════
  // 車隊自接單
  // ════════════════════════════════════════════════════════════

  router.get("/orders/:fleetId", async (req: Request, res: Response) => {
    try {
      const { source, status, from, to } = req.query;
      const params: any[] = [req.params.fleetId];
      const conds: string[] = ["fleet_id = $1"];
      if (source) { params.push(source); conds.push(`source = $${params.length}`); }
      if (status) { params.push(status); conds.push(`status = $${params.length}`); }
      if (from)   { params.push(from);   conds.push(`pickup_date >= $${params.length}::date`); }
      if (to)     { params.push(to);     conds.push(`pickup_date <= $${params.length}::date`); }
      const { rows } = await pool.query(
        `SELECT * FROM fleet_orders WHERE ${conds.join(" AND ")}
         ORDER BY created_at DESC LIMIT 200`, params
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/orders", async (req: Request, res: Response) => {
    try {
      const {
        fleet_id, customer_name, customer_phone,
        pickup_address, delivery_address, cargo_name,
        cargo_weight, vehicle_type, total_fee,
        driver_pay, pickup_date, note,
      } = req.body;
      if (!fleet_id || !pickup_address || !delivery_address) {
        return res.status(400).json({ error: "缺少必要欄位" });
      }
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,"");
      const { rows: cnt } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM fleet_orders WHERE fleet_id=$1 AND created_at >= CURRENT_DATE`,
        [fleet_id]
      );
      const order_no = `FL-${dateStr}-${String((cnt[0].n ?? 0) + 1).padStart(4,"0")}`;
      const { rows } = await pool.query(`
        INSERT INTO fleet_orders
          (fleet_id, order_no, source, customer_name, customer_phone,
           pickup_address, delivery_address, cargo_name, cargo_weight,
           vehicle_type, total_fee, driver_pay, pickup_date, note)
        VALUES ($1,$2,'self',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [fleet_id, order_no, customer_name, customer_phone,
          pickup_address, delivery_address, cargo_name, cargo_weight,
          vehicle_type, total_fee, driver_pay, pickup_date, note]);
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.patch("/orders/:id/status", async (req: Request, res: Response) => {
    try {
      const { status, assigned_driver_id, assigned_driver_name } = req.body;
      const { rows } = await pool.query(`
        UPDATE fleet_orders SET
          status               = $1,
          assigned_driver_id   = COALESCE($2, assigned_driver_id),
          assigned_driver_name = COALESCE($3, assigned_driver_name),
          updated_at           = NOW()
        WHERE id = $4 RETURNING *
      `, [status, assigned_driver_id ?? null, assigned_driver_name ?? null, req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "找不到訂單" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════
  // 車輛成本
  // ════════════════════════════════════════════════════════════

  router.get("/vehicle-costs/:fleetId", async (req: Request, res: Response) => {
    try {
      const { period } = req.query;
      const params: any[] = [req.params.fleetId];
      const conds = ["fleet_id = $1"];
      if (period) { params.push(period); conds.push(`period = $${params.length}`); }
      const { rows } = await pool.query(
        `SELECT * FROM fleet_vehicle_costs WHERE ${conds.join(" AND ")} ORDER BY created_at DESC`,
        params
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/vehicle-costs", async (req: Request, res: Response) => {
    try {
      const { fleet_id, driver_id, period, cost_type, amount, description, receipt_no } = req.body;
      const { rows } = await pool.query(`
        INSERT INTO fleet_vehicle_costs
          (fleet_id, driver_id, period, cost_type, amount, description, receipt_no)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [fleet_id, driver_id ?? null, period, cost_type, amount, description ?? null, receipt_no ?? null]);
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════
  // 罰款管理
  // ════════════════════════════════════════════════════════════

  router.get("/penalties/:fleetId", async (req: Request, res: Response) => {
    try {
      const { period } = req.query;
      const params: any[] = [req.params.fleetId];
      const conds = ["fleet_id = $1"];
      if (period) { params.push(period); conds.push(`period = $${params.length}`); }
      const { rows } = await pool.query(
        `SELECT * FROM fleet_penalties WHERE ${conds.join(" AND ")} ORDER BY created_at DESC`,
        params
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/penalties", async (req: Request, res: Response) => {
    try {
      const { fleet_id, driver_id, period, reason, amount, order_no } = req.body;
      if (!fleet_id || !period || !reason || !amount) {
        return res.status(400).json({ error: "缺少必要欄位" });
      }
      const { rows } = await pool.query(`
        INSERT INTO fleet_penalties (fleet_id, driver_id, period, reason, amount, order_no)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
      `, [fleet_id, driver_id ?? null, period, reason, amount, order_no ?? null]);
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/penalties/:id", async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM fleet_penalties WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════
  // 損益計算（雙層抽成）
  // ════════════════════════════════════════════════════════════

  router.post("/ledger/calculate", async (req: Request, res: Response) => {
    try {
      const { fleet_id, period } = req.body as { fleet_id: number; period: string };
      if (!fleet_id || !period) {
        return res.status(400).json({ error: "需要 fleet_id 和 period" });
      }

      const [year, month] = period.split("-").map(Number);
      const startDate = `${period}-01`;
      const endDate   = new Date(year, month, 0).toISOString().slice(0,10);

      const { rows: fleetRows } = await pool.query(
        `SELECT * FROM fusingao_fleets WHERE id = $1`, [fleet_id]
      );
      if (!fleetRows.length) return res.status(404).json({ error: "找不到車隊" });
      const fleet = fleetRows[0];

      // 費率
      const fusingaoRate = parseFloat(fleet.fusingao_commission_rate ?? "7")  || 7;
      const fuyingRate   = parseFloat(fleet.commission_rate           ?? "15") || 15;

      // ── 蝦皮趟次款（雙層抽成拆解）────────────────────────────
      // 蝦皮趟次款 × (1 - 福興高%) × (1 - 富詠%) = 車主入帳
      const { rows: fusingaoRows } = await pool.query(`
        SELECT
          COUNT(dr.id)::int AS trip_count,
          COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip, 0)), 0)
            AS shopee_gross,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0)
            * ($4 / 100.0)
          ), 0) AS fusingao_commission_amt,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0)
            * (1 - $4 / 100.0)
            * ($5 / 100.0)
          ), 0) AS fuying_commission_amt,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0)
            * (1 - $4 / 100.0)
            * (1 - $5 / 100.0)
          ), 0) AS income
        FROM dispatch_order_routes dr
        JOIN dispatch_orders do_ ON do_.id = dr.dispatch_order_id
        LEFT JOIN route_prefix_rates pr ON pr.prefix = dr.route_label
        LEFT JOIN fusingao_fleets f    ON f.id = do_.fleet_id
        WHERE do_.fleet_id = $1
          AND dr.assigned_at BETWEEN $2 AND $3
          AND dr.assigned_driver_id IS NOT NULL
      `, [fleet_id, startDate, endDate, fusingaoRate, fuyingRate]);

      const shopeeGross          = parseFloat(fusingaoRows[0]?.shopee_gross           ?? "0") || 0;
      const fusingaoCommissionAmt= parseFloat(fusingaoRows[0]?.fusingao_commission_amt?? "0") || 0;
      const fuyingCommissionAmt  = parseFloat(fusingaoRows[0]?.fuying_commission_amt  ?? "0") || 0;
      const fusingaoIncome       = parseFloat(fusingaoRows[0]?.income                 ?? "0") || 0;
      const fusingaoTripCount    = fusingaoRows[0]?.trip_count || 0;

      // ── 自接單收入 ───────────────────────────────────────────
      const { rows: selfRows } = await pool.query(`
        SELECT COUNT(*)::int AS trip_count, COALESCE(SUM(total_fee), 0) AS income
        FROM fleet_orders
        WHERE fleet_id = $1
          AND source = 'self'
          AND status = 'delivered'
          AND pickup_date BETWEEN $2 AND $3
      `, [fleet_id, startDate, endDate]);

      const selfIncome    = parseFloat(selfRows[0]?.income     ?? "0") || 0;
      const selfTripCount = selfRows[0]?.trip_count || 0;

      // ── 司機薪資（fleet_driver_payroll）─────────────────────
      const { rows: payrollRows } = await pool.query(`
        SELECT COALESCE(SUM(net_salary), 0) AS total
        FROM fleet_driver_payroll
        WHERE fleet_id = $1 AND month = $2
      `, [fleet_id, period]);
      const driverCost = parseFloat(payrollRows[0]?.total ?? "0") || 0;

      // ── 車輛成本 ────────────────────────────────────────────
      const { rows: vehicleRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM fleet_vehicle_costs WHERE fleet_id = $1 AND period = $2
      `, [fleet_id, period]);
      const vehicleCost = parseFloat(vehicleRows[0]?.total ?? "0") || 0;

      // ── 罰款 ────────────────────────────────────────────────
      const { rows: penaltyRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM fleet_penalties WHERE fleet_id = $1 AND period = $2
      `, [fleet_id, period]);
      const penalties = parseFloat(penaltyRows[0]?.total ?? "0") || 0;

      // ── 固定費用 ────────────────────────────────────────────
      const monthlyFee  = parseFloat(fleet.monthly_affiliation_fee ?? "0") || 0;
      const platformFee = parseFloat(fleet.platform_fee_monthly    ?? "0") || 0;

      // ── 計算結果 ────────────────────────────────────────────
      // 蝦皮趟次款 × (1-福興高%) × (1-富詠%) + 自接收入 = 總收入
      const totalIncome  = fusingaoIncome + selfIncome;
      const totalCost    = driverCost + vehicleCost + monthlyFee + platformFee + penalties;
      const grossProfit  = totalIncome - totalCost;
      // 車主實領 = 總收入 - 掛靠費 - 司機薪資 - 罰款（不含車輛成本，那是車隊整體）
      const netOwnerPay  = fusingaoIncome + selfIncome - monthlyFee - driverCost - penalties;
      const profitMargin = totalIncome > 0
        ? Math.round((grossProfit / totalIncome) * 10000) / 100
        : 0;

      const { rows: ledger } = await pool.query(`
        INSERT INTO fleet_ledger (
          fleet_id, period,
          shopee_gross, fusingao_commission_amt, fuying_commission_amt,
          fusingao_income, self_income, total_income,
          driver_cost, vehicle_cost, platform_fee, monthly_affiliation,
          penalties, total_cost,
          gross_profit, net_owner_pay, profit_margin,
          fusingao_trip_count, self_trip_count
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (fleet_id, period) DO UPDATE SET
          shopee_gross            = EXCLUDED.shopee_gross,
          fusingao_commission_amt = EXCLUDED.fusingao_commission_amt,
          fuying_commission_amt   = EXCLUDED.fuying_commission_amt,
          fusingao_income         = EXCLUDED.fusingao_income,
          self_income             = EXCLUDED.self_income,
          total_income            = EXCLUDED.total_income,
          driver_cost             = EXCLUDED.driver_cost,
          vehicle_cost            = EXCLUDED.vehicle_cost,
          platform_fee            = EXCLUDED.platform_fee,
          monthly_affiliation     = EXCLUDED.monthly_affiliation,
          penalties               = EXCLUDED.penalties,
          total_cost              = EXCLUDED.total_cost,
          gross_profit            = EXCLUDED.gross_profit,
          net_owner_pay           = EXCLUDED.net_owner_pay,
          profit_margin           = EXCLUDED.profit_margin,
          fusingao_trip_count     = EXCLUDED.fusingao_trip_count,
          self_trip_count         = EXCLUDED.self_trip_count,
          created_at              = NOW()
        RETURNING *
      `, [fleet_id, period,
          shopeeGross, fusingaoCommissionAmt, fuyingCommissionAmt,
          fusingaoIncome, selfIncome, totalIncome,
          driverCost, vehicleCost, platformFee, monthlyFee,
          penalties, totalCost,
          grossProfit, netOwnerPay, profitMargin,
          fusingaoTripCount, selfTripCount]);

      res.json(ledger[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /fleet-system/ledger/summary/all — 所有車隊彙總（在 :fleetId 前）
  router.get("/ledger/summary/all", async (req: Request, res: Response) => {
    try {
      const { period } = req.query;
      const params: any[] = [];
      const cond = period ? `WHERE l.period = $${(params.push(period), 1)}` : "";
      const { rows } = await pool.query(`
        SELECT
          f.id, f.fleet_name, f.fleet_type,
          l.period,
          l.shopee_gross, l.fusingao_commission_amt, l.fuying_commission_amt,
          l.fusingao_income, l.self_income, l.total_income,
          l.total_cost, l.gross_profit, l.net_owner_pay, l.profit_margin,
          l.penalties, l.fusingao_trip_count, l.self_trip_count
        FROM fleet_ledger l
        JOIN fusingao_fleets f ON f.id = l.fleet_id
        ${cond}
        ORDER BY l.period DESC, l.net_owner_pay DESC
      `, params);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /fleet-system/ledger/:fleetId — 車隊歷史損益
  router.get("/ledger/:fleetId", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM fleet_ledger
        WHERE fleet_id = $1
        ORDER BY period DESC LIMIT 12
      `, [req.params.fleetId]);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
