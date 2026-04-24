/**
 * affiliatedOwner.ts
 * 路徑：artifacts/api-server/src/routes/affiliatedOwner.ts
 *
 * 靠行車主帳號系統：
 *   - 車主帳號管理（一個車主可有多台車、多個司機）
 *   - 代收代付結算（富詠代收蝦皮款，算完撥給車主）
 *   - 車主自管：新增車輛、設定司機薪資
 *   - 月結單產生（車主版對帳單）
 *
 * 金流：
 *   福興高 → 富詠（代收）→ 扣掛靠費+平台費+司機薪資 → 撥給車主
 */

import { Router, Request, Response } from "express";
import { Pool } from "pg";

export function createAffiliatedOwnerRouter(pool: Pool) {
  const router = Router();

  // ── 建表 ────────────────────────────────────────────────────
  async function ensureTables() {
    // 1. 靠行車主帳號表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliated_owners (
        id                   SERIAL PRIMARY KEY,
        owner_name           TEXT NOT NULL,
        owner_phone          TEXT,
        id_number            TEXT,
        bank_name            TEXT,
        bank_account         TEXT,
        bank_branch          TEXT,
        username             TEXT UNIQUE NOT NULL,
        password_hash        TEXT NOT NULL,
        affiliation_fee      NUMERIC(10,2) DEFAULT 3000,
        platform_fee         NUMERIC(10,2) DEFAULT 0,
        commission_rate      NUMERIC(5,2)  DEFAULT 15,
        contract_start       DATE,
        is_active            BOOLEAN DEFAULT TRUE,
        notes                TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 2. 靠行車主的車輛
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_vehicles (
        id              SERIAL PRIMARY KEY,
        owner_id        INTEGER NOT NULL REFERENCES affiliated_owners(id),
        plate_no        TEXT NOT NULL,
        vehicle_type    TEXT DEFAULT '小貨車',
        vehicle_brand   TEXT,
        year            INTEGER,
        max_load_kg     NUMERIC(8,2),
        insurance_expiry DATE,
        inspection_expiry DATE,
        is_active       BOOLEAN DEFAULT TRUE,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 3. 靠行車主的司機
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_drivers (
        id              SERIAL PRIMARY KEY,
        owner_id        INTEGER NOT NULL REFERENCES affiliated_owners(id),
        driver_name     TEXT NOT NULL,
        driver_phone    TEXT,
        id_number       TEXT,
        license_no      TEXT,
        vehicle_id      INTEGER REFERENCES owner_vehicles(id),
        pay_type        TEXT DEFAULT 'per_trip'
          CHECK (pay_type IN ('per_trip','daily','monthly')),
        base_pay        NUMERIC(10,2) DEFAULT 0,
        per_trip_rate   NUMERIC(8,2)  DEFAULT 0,
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 4. 代收帳（富詠幫車主收的每筆款項）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_receivables (
        id              SERIAL PRIMARY KEY,
        owner_id        INTEGER NOT NULL REFERENCES affiliated_owners(id),
        period          TEXT NOT NULL,
        route_type      TEXT,
        trip_count      INTEGER DEFAULT 0,
        gross_amount    NUMERIC(12,2) DEFAULT 0,
        fusingao_deduct NUMERIC(12,2) DEFAULT 0,
        net_income      NUMERIC(12,2) DEFAULT 0,
        penalty_amount  NUMERIC(12,2) DEFAULT 0,
        bonus_amount    NUMERIC(12,2) DEFAULT 0,
        source          TEXT DEFAULT 'fusingao',
        note            TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 5. 月結單（代收代付總表）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_monthly_statements (
        id                   SERIAL PRIMARY KEY,
        owner_id             INTEGER NOT NULL REFERENCES affiliated_owners(id),
        period               TEXT NOT NULL,
        total_income         NUMERIC(12,2) DEFAULT 0,
        affiliation_fee      NUMERIC(12,2) DEFAULT 0,
        platform_fee         NUMERIC(12,2) DEFAULT 0,
        driver_payroll       NUMERIC(12,2) DEFAULT 0,
        vehicle_cost         NUMERIC(12,2) DEFAULT 0,
        penalty_deduct       NUMERIC(12,2) DEFAULT 0,
        total_deduct         NUMERIC(12,2) DEFAULT 0,
        net_payout           NUMERIC(12,2) DEFAULT 0,
        status               TEXT DEFAULT 'draft',
        confirmed_at         TIMESTAMPTZ,
        paid_at              TIMESTAMPTZ,
        payment_ref          TEXT,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(owner_id, period)
      )
    `);

    console.log("[AffiliatedOwner] 靠行車主系統表結構確認完成");
  }
  ensureTables().catch(console.error);

  // ════════════════════════════════════════════════════════════
  // 車主帳號管理
  // ════════════════════════════════════════════════════════════

  // GET /affiliated-owners — 列出所有車主
  router.get("/", async (_req: Request, res: Response) => {
    const { rows } = await pool.query(`
      SELECT
        o.*,
        COUNT(DISTINCT v.id)::int AS vehicle_count,
        COUNT(DISTINCT d.id)::int AS driver_count
      FROM affiliated_owners o
      LEFT JOIN owner_vehicles v ON v.owner_id = o.id AND v.is_active = true
      LEFT JOIN owner_drivers  d ON d.owner_id = o.id AND d.is_active = true
      WHERE o.is_active = true
      GROUP BY o.id
      ORDER BY o.owner_name
    `);
    res.json(rows);
  });

  // POST /affiliated-owners — 新增車主帳號（富詠管理員操作）
  router.post("/", async (req: Request, res: Response) => {
    const {
      owner_name, owner_phone, id_number,
      bank_name, bank_account, bank_branch,
      username, password,
      affiliation_fee = 3000,
      platform_fee = 0,
      commission_rate = 15,
      contract_start, notes,
    } = req.body;

    if (!owner_name || !username || !password) {
      return res.status(400).json({ error: "需要 owner_name, username, password" });
    }

    // 簡單 hash（生產環境請用 bcrypt）
    const crypto = await import("crypto");
    const password_hash = crypto.createHash("sha256").update(password).digest("hex");

    const { rows } = await pool.query(`
      INSERT INTO affiliated_owners
        (owner_name, owner_phone, id_number, bank_name, bank_account, bank_branch,
         username, password_hash, affiliation_fee, platform_fee, commission_rate,
         contract_start, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, owner_name, username, affiliation_fee, commission_rate, created_at
    `, [owner_name, owner_phone, id_number, bank_name, bank_account, bank_branch,
        username, password_hash, affiliation_fee, platform_fee, commission_rate,
        contract_start, notes]);

    res.json(rows[0]);
  });

  // POST /affiliated-owners/login — 車主登入
  router.post("/login", async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const crypto = await import("crypto");
    const password_hash = crypto.createHash("sha256").update(password).digest("hex");

    const { rows } = await pool.query(`
      SELECT id, owner_name, username, affiliation_fee, commission_rate, is_active
      FROM affiliated_owners
      WHERE username = $1 AND password_hash = $2 AND is_active = true
    `, [username, password_hash]);

    if (!rows.length) return res.status(401).json({ error: "帳號或密碼錯誤" });

    const jwt = await import("jsonwebtoken");
    const token = jwt.sign(
      { id: rows[0].id, role: "affiliated_owner", name: rows[0].owner_name },
      process.env.JWT_SECRET ?? "secret",
      { expiresIn: "30d" }
    );

    res.json({ token, user: rows[0] });
  });

  // ════════════════════════════════════════════════════════════
  // 車輛管理（車主自管）
  // ════════════════════════════════════════════════════════════

  router.get("/:ownerId/vehicles", async (req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT * FROM owner_vehicles WHERE owner_id = $1 AND is_active = true ORDER BY plate_no`,
      [req.params.ownerId]
    );
    res.json(rows);
  });

  router.post("/:ownerId/vehicles", async (req: Request, res: Response) => {
    const { plate_no, vehicle_type, vehicle_brand, year,
            max_load_kg, insurance_expiry, inspection_expiry, notes } = req.body;
    if (!plate_no) return res.status(400).json({ error: "需要車牌號碼" });

    const { rows } = await pool.query(`
      INSERT INTO owner_vehicles
        (owner_id, plate_no, vehicle_type, vehicle_brand, year,
         max_load_kg, insurance_expiry, inspection_expiry, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.params.ownerId, plate_no, vehicle_type, vehicle_brand,
        year, max_load_kg, insurance_expiry, inspection_expiry, notes]);
    res.json(rows[0]);
  });

  // ════════════════════════════════════════════════════════════
  // 司機管理（車主自管）
  // ════════════════════════════════════════════════════════════

  router.get("/:ownerId/drivers", async (req: Request, res: Response) => {
    const { rows } = await pool.query(`
      SELECT d.*, v.plate_no, v.vehicle_type
      FROM owner_drivers d
      LEFT JOIN owner_vehicles v ON v.id = d.vehicle_id
      WHERE d.owner_id = $1 AND d.is_active = true
      ORDER BY d.driver_name
    `, [req.params.ownerId]);
    res.json(rows);
  });

  router.post("/:ownerId/drivers", async (req: Request, res: Response) => {
    const { driver_name, driver_phone, id_number, license_no,
            vehicle_id, pay_type, base_pay, per_trip_rate } = req.body;
    if (!driver_name) return res.status(400).json({ error: "需要司機姓名" });

    const { rows } = await pool.query(`
      INSERT INTO owner_drivers
        (owner_id, driver_name, driver_phone, id_number, license_no,
         vehicle_id, pay_type, base_pay, per_trip_rate)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [req.params.ownerId, driver_name, driver_phone, id_number,
        license_no, vehicle_id, pay_type, base_pay, per_trip_rate]);
    res.json(rows[0]);
  });

  // ════════════════════════════════════════════════════════════
  // 代收代付：月結單計算
  // ════════════════════════════════════════════════════════════

  // POST /affiliated-owners/:ownerId/statement/calculate
  // 計算車主月結單（富詠管理員執行）
  router.post("/:ownerId/statement/calculate", async (req: Request, res: Response) => {
    const { period } = req.body;
    const ownerId = parseInt(req.params.ownerId);

    // 取得車主資料
    const { rows: ownerRows } = await pool.query(
      `SELECT * FROM affiliated_owners WHERE id = $1`, [ownerId]
    );
    if (!ownerRows.length) return res.status(404).json({ error: "找不到車主" });
    const owner = ownerRows[0];

    // 取得本月代收款（從 owner_receivables）
    const { rows: recvRows } = await pool.query(`
      SELECT COALESCE(SUM(net_income), 0) AS total_income
      FROM owner_receivables
      WHERE owner_id = $1 AND period = $2
    `, [ownerId, period]);
    const totalIncome = parseFloat(recvRows[0]?.total_income) || 0;

    // 取得罰款
    const { rows: penaltyRows } = await pool.query(`
      SELECT COALESCE(SUM(penalty_amount), 0) AS total_penalty
      FROM owner_receivables
      WHERE owner_id = $1 AND period = $2
    `, [ownerId, period]);
    const penaltyDeduct = parseFloat(penaltyRows[0]?.total_penalty) || 0;

    // 取得司機薪資（從 driver_payroll，關聯 owner_drivers）
    const { rows: payrollRows } = await pool.query(`
      SELECT COALESCE(SUM(dp.net_pay), 0) AS total_payroll
      FROM driver_payroll dp
      WHERE dp.period = $1
        AND dp.driver_id IN (
          SELECT id FROM owner_drivers WHERE owner_id = $2
        )
    `, [period, ownerId]);
    const driverPayroll = parseFloat(payrollRows[0]?.total_payroll) || 0;

    // 取得車輛成本
    const { rows: vehicleCostRows } = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM fleet_vehicle_costs
      WHERE fleet_id = $1 AND period = $2
    `, [ownerId, period]).catch(() => ({ rows: [{ total: 0 }] }));
    const vehicleCost = parseFloat(vehicleCostRows[0]?.total) || 0;

    // 固定費用
    const affiliationFee = parseFloat(owner.affiliation_fee) || 0;
    const platformFee    = parseFloat(owner.platform_fee) || 0;

    // 計算淨撥款
    const totalDeduct = affiliationFee + platformFee + driverPayroll + vehicleCost + penaltyDeduct;
    const netPayout   = Math.round((totalIncome - totalDeduct) * 100) / 100;

    // 寫入月結單
    const { rows: stmt } = await pool.query(`
      INSERT INTO owner_monthly_statements
        (owner_id, period, total_income, affiliation_fee, platform_fee,
         driver_payroll, vehicle_cost, penalty_deduct, total_deduct, net_payout, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
      ON CONFLICT (owner_id, period) DO UPDATE SET
        total_income    = EXCLUDED.total_income,
        affiliation_fee = EXCLUDED.affiliation_fee,
        platform_fee    = EXCLUDED.platform_fee,
        driver_payroll  = EXCLUDED.driver_payroll,
        vehicle_cost    = EXCLUDED.vehicle_cost,
        penalty_deduct  = EXCLUDED.penalty_deduct,
        total_deduct    = EXCLUDED.total_deduct,
        net_payout      = EXCLUDED.net_payout
      WHERE owner_monthly_statements.status = 'draft'
      RETURNING *
    `, [ownerId, period, totalIncome, affiliationFee, platformFee,
        driverPayroll, vehicleCost, penaltyDeduct, totalDeduct, netPayout]);

    res.json(stmt[0]);
  });

  // GET /affiliated-owners/:ownerId/statement — 查詢月結單
  router.get("/:ownerId/statement", async (req: Request, res: Response) => {
    const { period } = req.query;
    const params: any[] = [req.params.ownerId];
    const cond = period ? `AND period = $2` : "";
    if (period) params.push(period);

    const { rows } = await pool.query(`
      SELECT * FROM owner_monthly_statements
      WHERE owner_id = $1 ${cond}
      ORDER BY period DESC LIMIT 24
    `, params);
    res.json(rows);
  });

  // PATCH /affiliated-owners/:ownerId/statement/:stmtId/pay — 標記已撥款
  router.patch("/:ownerId/statement/:stmtId/pay", async (req: Request, res: Response) => {
    const { payment_ref, paid_at } = req.body;
    const { rows } = await pool.query(`
      UPDATE owner_monthly_statements SET
        status      = 'paid',
        paid_at     = $1,
        payment_ref = $2
      WHERE id = $3 AND owner_id = $4
      RETURNING *
    `, [paid_at ?? new Date().toISOString(), payment_ref, req.params.stmtId, req.params.ownerId]);
    if (!rows.length) return res.status(404).json({ error: "找不到月結單" });
    res.json(rows[0]);
  });

  // GET /affiliated-owners/all-statements — 富詠看所有車主月結單
  router.get("/all-statements", async (req: Request, res: Response) => {
    const { period } = req.query;
    const params: any[] = [];
    const cond = period ? `WHERE s.period = $1` : "";
    if (period) params.push(period);

    const { rows } = await pool.query(`
      SELECT
        s.*,
        o.owner_name, o.bank_name, o.bank_account,
        o.affiliation_fee AS contract_fee
      FROM owner_monthly_statements s
      JOIN affiliated_owners o ON o.id = s.owner_id
      ${cond}
      ORDER BY s.period DESC, o.owner_name
    `, params);
    res.json(rows);
  });

  return router;
}
