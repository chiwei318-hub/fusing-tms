/**
 * affiliatedOwner.ts
 * 路徑：artifacts/api-server/src/routes/affiliatedOwner.ts
 *
 * 靠行車主管理 — 車輛掛靠在車隊下的個人車主
 *
 * 資料結構：
 *   affiliated_vehicle_owners  — 車主基本資料
 *   affiliated_owner_payouts   — 月結算快照（可重算）
 *
 * 車主月淨額公式：
 *   蝦皮趟次款
 *   × (1 - fusingao_commission_rate%)   福興高抽成
 *   × (1 - fleet_commission_rate%)      富詠抽成
 *   - monthly_affiliation_fee           掛靠費
 *   - penalties                         罰款
 *   = owner_net_pay
 */

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

export function createAffiliatedOwnerRouter() {
  const router = Router();

  // ── 建表 ────────────────────────────────────────────────────
  async function ensureTables() {
    // 靠行車主資料表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliated_vehicle_owners (
        id                    SERIAL PRIMARY KEY,
        fleet_id              INTEGER NOT NULL REFERENCES fusingao_fleets(id) ON DELETE CASCADE,
        name                  TEXT NOT NULL,
        phone                 TEXT,
        id_number             TEXT,
        vehicle_plate         TEXT NOT NULL,
        vehicle_type          TEXT DEFAULT '小貨車',
        bank_name             TEXT,
        bank_account          TEXT,
        monthly_affiliation_fee NUMERIC(10,2) DEFAULT 0,
        fusingao_commission_rate NUMERIC(5,2) DEFAULT 7,
        fleet_commission_rate   NUMERIC(5,2) DEFAULT 15,
        contract_start_date   DATE,
        notes                 TEXT,
        is_active             BOOLEAN NOT NULL DEFAULT true,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 月結算快照表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliated_owner_payouts (
        id                      SERIAL PRIMARY KEY,
        owner_id                INTEGER NOT NULL REFERENCES affiliated_vehicle_owners(id) ON DELETE CASCADE,
        fleet_id                INTEGER NOT NULL,
        period                  TEXT NOT NULL,
        trip_count              INTEGER DEFAULT 0,
        shopee_gross            NUMERIC(12,2) DEFAULT 0,
        fusingao_commission_amt NUMERIC(12,2) DEFAULT 0,
        fuying_commission_amt   NUMERIC(12,2) DEFAULT 0,
        fusingao_income         NUMERIC(12,2) DEFAULT 0,
        monthly_affiliation_fee NUMERIC(12,2) DEFAULT 0,
        penalties               NUMERIC(12,2) DEFAULT 0,
        owner_net_pay           NUMERIC(12,2) DEFAULT 0,
        locked                  BOOLEAN DEFAULT false,
        note                    TEXT,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(owner_id, period)
      )
    `);

    console.log("[AffiliatedOwner] 靠行車主表結構確認完成");
  }
  ensureTables().catch(console.error);

  // ════════════════════════════════════════════════════════════
  // 車主 CRUD
  // ════════════════════════════════════════════════════════════

  // GET /affiliated-owners?fleet_id=&active=
  router.get("/", async (req: Request, res: Response) => {
    try {
      const { fleet_id, active } = req.query;
      const params: any[] = [];
      const conds: string[] = [];
      if (fleet_id) { params.push(fleet_id); conds.push(`o.fleet_id = $${params.length}`); }
      if (active !== undefined) {
        params.push(active === "true");
        conds.push(`o.is_active = $${params.length}`);
      }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const { rows } = await pool.query(`
        SELECT
          o.*,
          f.fleet_name,
          f.fleet_type,
          (SELECT COUNT(*)::int FROM affiliated_owner_payouts p WHERE p.owner_id = o.id) AS payout_months
        FROM affiliated_vehicle_owners o
        JOIN fusingao_fleets f ON f.id = o.fleet_id
        ${where}
        ORDER BY o.fleet_id, o.name
      `, params);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /affiliated-owners/:id
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT o.*, f.fleet_name, f.fleet_type
        FROM affiliated_vehicle_owners o
        JOIN fusingao_fleets f ON f.id = o.fleet_id
        WHERE o.id = $1
      `, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: "找不到車主" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /affiliated-owners — 新增靠行車主
  router.post("/", async (req: Request, res: Response) => {
    try {
      const {
        fleet_id, name, phone, id_number, vehicle_plate, vehicle_type,
        bank_name, bank_account,
        monthly_affiliation_fee, fusingao_commission_rate, fleet_commission_rate,
        contract_start_date, notes,
      } = req.body;
      if (!fleet_id || !name || !vehicle_plate) {
        return res.status(400).json({ error: "缺少必要欄位：fleet_id / name / vehicle_plate" });
      }
      const { rows } = await pool.query(`
        INSERT INTO affiliated_vehicle_owners (
          fleet_id, name, phone, id_number, vehicle_plate, vehicle_type,
          bank_name, bank_account,
          monthly_affiliation_fee, fusingao_commission_rate, fleet_commission_rate,
          contract_start_date, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        fleet_id, name, phone ?? null, id_number ?? null, vehicle_plate,
        vehicle_type ?? "小貨車",
        bank_name ?? null, bank_account ?? null,
        monthly_affiliation_fee ?? 0,
        fusingao_commission_rate ?? 7,
        fleet_commission_rate ?? 15,
        contract_start_date ?? null, notes ?? null,
      ]);
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /affiliated-owners/:id — 更新車主資料
  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const {
        name, phone, id_number, vehicle_plate, vehicle_type,
        bank_name, bank_account,
        monthly_affiliation_fee, fusingao_commission_rate, fleet_commission_rate,
        contract_start_date, notes, is_active,
      } = req.body;
      const { rows } = await pool.query(`
        UPDATE affiliated_vehicle_owners SET
          name                    = COALESCE($1,  name),
          phone                   = COALESCE($2,  phone),
          id_number               = COALESCE($3,  id_number),
          vehicle_plate           = COALESCE($4,  vehicle_plate),
          vehicle_type            = COALESCE($5,  vehicle_type),
          bank_name               = COALESCE($6,  bank_name),
          bank_account            = COALESCE($7,  bank_account),
          monthly_affiliation_fee = COALESCE($8,  monthly_affiliation_fee),
          fusingao_commission_rate= COALESCE($9,  fusingao_commission_rate),
          fleet_commission_rate   = COALESCE($10, fleet_commission_rate),
          contract_start_date     = COALESCE($11, contract_start_date),
          notes                   = COALESCE($12, notes),
          is_active               = COALESCE($13, is_active),
          updated_at              = NOW()
        WHERE id = $14
        RETURNING *
      `, [
        name ?? null, phone ?? null, id_number ?? null, vehicle_plate ?? null,
        vehicle_type ?? null, bank_name ?? null, bank_account ?? null,
        monthly_affiliation_fee ?? null, fusingao_commission_rate ?? null,
        fleet_commission_rate ?? null, contract_start_date ?? null,
        notes ?? null, is_active ?? null,
        req.params.id,
      ]);
      if (!rows.length) return res.status(404).json({ error: "找不到車主" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /affiliated-owners/:id — 停用（軟刪除）
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE affiliated_vehicle_owners SET is_active=false, updated_at=NOW() WHERE id=$1`,
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════
  // 月結算
  // ════════════════════════════════════════════════════════════

  // POST /affiliated-owners/:id/payout/calculate — 計算單一車主月結
  router.post("/:id/payout/calculate", async (req: Request, res: Response) => {
    try {
      const { period } = req.body as { period: string };
      if (!period) return res.status(400).json({ error: "需要 period (yyyy-MM)" });

      const { rows: ownerRows } = await pool.query(
        `SELECT * FROM affiliated_vehicle_owners WHERE id = $1`, [req.params.id]
      );
      if (!ownerRows.length) return res.status(404).json({ error: "找不到車主" });
      const owner = ownerRows[0];

      const { rows: lockedRows } = await pool.query(
        `SELECT locked FROM affiliated_owner_payouts WHERE owner_id=$1 AND period=$2`,
        [owner.id, period]
      );
      if (lockedRows[0]?.locked) {
        return res.status(409).json({ error: "此月結算已鎖定，無法重算" });
      }

      const [year, month] = period.split("-").map(Number);
      const startDate = `${period}-01`;
      const endDate   = new Date(year, month, 0).toISOString().slice(0,10);

      const fusingaoRate = parseFloat(owner.fusingao_commission_rate) || 7;
      const fleetRate    = parseFloat(owner.fleet_commission_rate)    || 15;

      // 蝦皮趟次款（從 dispatch_order_routes，過濾車牌）
      const { rows: tripRows } = await pool.query(`
        SELECT
          COUNT(dr.id)::int AS trip_count,
          COALESCE(SUM(COALESCE(f.rate_override, pr.rate_per_trip, 0)), 0) AS shopee_gross,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0) * ($4 / 100.0)
          ), 0) AS fusingao_commission_amt,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0)
            * (1 - $4 / 100.0) * ($5 / 100.0)
          ), 0) AS fuying_commission_amt,
          COALESCE(SUM(
            COALESCE(f.rate_override, pr.rate_per_trip, 0)
            * (1 - $4 / 100.0) * (1 - $5 / 100.0)
          ), 0) AS fusingao_income
        FROM dispatch_order_routes dr
        JOIN dispatch_orders do_ ON do_.id = dr.dispatch_order_id
        LEFT JOIN route_prefix_rates pr ON pr.prefix = dr.route_label
        LEFT JOIN fusingao_fleets f ON f.id = do_.fleet_id
        JOIN fleet_drivers fd ON fd.id = dr.assigned_driver_id
        WHERE do_.fleet_id = $1
          AND fd.vehicle_plate = $2
          AND dr.assigned_at BETWEEN $3 AND $6
          AND dr.assigned_driver_id IS NOT NULL
      `, [owner.fleet_id, owner.vehicle_plate, startDate, fusingaoRate, fleetRate, endDate]);

      const tripCount          = tripRows[0]?.trip_count           || 0;
      const shopeeGross        = parseFloat(tripRows[0]?.shopee_gross        ?? "0") || 0;
      const fusingaoCommAmt    = parseFloat(tripRows[0]?.fusingao_commission_amt ?? "0") || 0;
      const fuyingCommAmt      = parseFloat(tripRows[0]?.fuying_commission_amt  ?? "0") || 0;
      const fusingaoIncome     = parseFloat(tripRows[0]?.fusingao_income     ?? "0") || 0;

      // 罰款（從 fleet_penalties，可加 driver_id 或暫以 fleet 維度）
      const { rows: penRows } = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM fleet_penalties
        WHERE fleet_id = $1 AND period = $2
          AND (order_no IS NULL OR order_no IN (
            SELECT fo.order_no FROM fleet_orders fo
            JOIN dispatch_order_routes dr2 ON dr2.id = fo.id
            JOIN fleet_drivers fd2 ON fd2.id = dr2.assigned_driver_id
            WHERE fd2.vehicle_plate = $3
          ))
      `, [owner.fleet_id, period, owner.vehicle_plate]).catch(() => [{ rows: [{ total: "0" }] }] as any);
      const penalties = parseFloat(penRows[0]?.total ?? "0") || 0;

      const monthlyFee  = parseFloat(owner.monthly_affiliation_fee) || 0;
      const ownerNetPay = fusingaoIncome - monthlyFee - penalties;

      // UPSERT 月結快照
      const { rows: payout } = await pool.query(`
        INSERT INTO affiliated_owner_payouts (
          owner_id, fleet_id, period, trip_count,
          shopee_gross, fusingao_commission_amt, fuying_commission_amt,
          fusingao_income, monthly_affiliation_fee, penalties, owner_net_pay
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (owner_id, period) DO UPDATE SET
          trip_count              = EXCLUDED.trip_count,
          shopee_gross            = EXCLUDED.shopee_gross,
          fusingao_commission_amt = EXCLUDED.fusingao_commission_amt,
          fuying_commission_amt   = EXCLUDED.fuying_commission_amt,
          fusingao_income         = EXCLUDED.fusingao_income,
          monthly_affiliation_fee = EXCLUDED.monthly_affiliation_fee,
          penalties               = EXCLUDED.penalties,
          owner_net_pay           = EXCLUDED.owner_net_pay,
          created_at              = NOW()
        RETURNING *
      `, [
        owner.id, owner.fleet_id, period, tripCount,
        shopeeGross, fusingaoCommAmt, fuyingCommAmt,
        fusingaoIncome, monthlyFee, penalties, ownerNetPay,
      ]);
      res.json(payout[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /affiliated-owners/:id/payout — 歷史月結列表
  router.get("/:id/payout", async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT * FROM affiliated_owner_payouts
        WHERE owner_id = $1
        ORDER BY period DESC LIMIT 24
      `, [req.params.id]);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /affiliated-owners/:id/payout/:period/lock — 鎖定月結
  router.patch("/:id/payout/:period/lock", async (req: Request, res: Response) => {
    try {
      const { locked } = req.body;
      const { rows } = await pool.query(`
        UPDATE affiliated_owner_payouts
        SET locked = $1
        WHERE owner_id = $2 AND period = $3
        RETURNING *
      `, [locked ?? true, req.params.id, req.params.period]);
      if (!rows.length) return res.status(404).json({ error: "找不到月結記錄" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /affiliated-owners/payout/summary?fleet_id=&period=
  router.get("/payout/summary", async (req: Request, res: Response) => {
    try {
      const { fleet_id, period } = req.query;
      const params: any[] = [];
      const conds: string[] = [];
      if (fleet_id) { params.push(fleet_id); conds.push(`p.fleet_id = $${params.length}`); }
      if (period)   { params.push(period);   conds.push(`p.period = $${params.length}`); }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const { rows } = await pool.query(`
        SELECT
          o.name, o.vehicle_plate, o.vehicle_type,
          f.fleet_name,
          p.period, p.trip_count,
          p.shopee_gross, p.fusingao_commission_amt, p.fuying_commission_amt,
          p.fusingao_income, p.monthly_affiliation_fee, p.penalties,
          p.owner_net_pay, p.locked
        FROM affiliated_owner_payouts p
        JOIN affiliated_vehicle_owners o ON o.id = p.owner_id
        JOIN fusingao_fleets f ON f.id = p.fleet_id
        ${where}
        ORDER BY p.period DESC, p.owner_net_pay DESC
      `, params);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
