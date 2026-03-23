import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

export const performanceRouter = Router();

// ════════════════════════════════════════════════════════════════
// KPI 目標管理
// ════════════════════════════════════════════════════════════════

// GET /api/performance/targets
performanceRouter.get("/performance/targets", async (req, res) => {
  const { type } = req.query;
  const { rows } = await pool.query(`
    SELECT * FROM performance_targets
    ${type ? `WHERE target_type = '${type === "fleet" ? "fleet" : "driver"}'` : ""}
    ORDER BY target_type, metric
  `);
  res.json(rows);
});

// POST /api/performance/targets
performanceRouter.post("/performance/targets", async (req, res) => {
  const { target_type, metric, target_value, period_type, description } = req.body;
  if (!target_type || !metric || target_value == null)
    return res.status(400).json({ error: "缺少必填欄位" });

  const { rows } = await pool.query(`
    INSERT INTO performance_targets (target_type, metric, target_value, period_type, description)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [target_type, metric, target_value, period_type ?? "monthly", description ?? ""]);
  res.json({ ok: true, target: rows[0] });
});

// PATCH /api/performance/targets/:id
performanceRouter.patch("/performance/targets/:id", async (req, res) => {
  const { target_value, is_active, description } = req.body;
  const { rows } = await pool.query(`
    UPDATE performance_targets
    SET target_value = COALESCE($1, target_value),
        is_active    = COALESCE($2, is_active),
        description  = COALESCE($3, description),
        updated_at   = NOW()
    WHERE id = $4
    RETURNING *
  `, [target_value, is_active, description, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "目標不存在" });
  res.json({ ok: true, target: rows[0] });
});

// DELETE /api/performance/targets/:id
performanceRouter.delete("/performance/targets/:id", async (req, res) => {
  await pool.query("DELETE FROM performance_targets WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// 獎金規則管理
// ════════════════════════════════════════════════════════════════

// GET /api/performance/bonus-rules
performanceRouter.get("/performance/bonus-rules", async (req, res) => {
  const { type } = req.query;
  const { rows } = await pool.query(`
    SELECT * FROM bonus_rules
    ${type ? `WHERE target_type = '${type === "fleet" ? "fleet" : "driver"}'` : ""}
    ORDER BY target_type, achievement_pct
  `);
  res.json(rows);
});

// POST /api/performance/bonus-rules
performanceRouter.post("/performance/bonus-rules", async (req, res) => {
  const { rule_name, target_type, level_name, level_color, achievement_pct, bonus_amount, bonus_pct, require_all } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO bonus_rules (rule_name, target_type, level_name, level_color, achievement_pct, bonus_amount, bonus_pct, require_all)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [rule_name, target_type, level_name, level_color ?? "bronze", achievement_pct ?? 80,
      bonus_amount ?? 0, bonus_pct ?? 0, require_all ?? false]);
  res.json({ ok: true, rule: rows[0] });
});

// PATCH /api/performance/bonus-rules/:id
performanceRouter.patch("/performance/bonus-rules/:id", async (req, res) => {
  const { rule_name, achievement_pct, bonus_amount, bonus_pct, require_all, is_active } = req.body;
  const { rows } = await pool.query(`
    UPDATE bonus_rules SET
      rule_name       = COALESCE($1, rule_name),
      achievement_pct = COALESCE($2, achievement_pct),
      bonus_amount    = COALESCE($3, bonus_amount),
      bonus_pct       = COALESCE($4, bonus_pct),
      require_all     = COALESCE($5, require_all),
      is_active       = COALESCE($6, is_active)
    WHERE id = $7 RETURNING *
  `, [rule_name, achievement_pct, bonus_amount, bonus_pct, require_all, is_active, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "規則不存在" });
  res.json({ ok: true, rule: rows[0] });
});

// ════════════════════════════════════════════════════════════════
// 稽核儀表板 — 司機 KPI 查詢
// ════════════════════════════════════════════════════════════════

// GET /api/performance/audit/drivers?year=2026&month=3
performanceRouter.get("/performance/audit/drivers", async (req, res) => {
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? new Date().getMonth() + 1), 10);

  const { rows: drivers } = await pool.query(`
    SELECT
      d.id, d.name, d.phone, d.vehicle_type, d.status,
      COALESCE(kpi.total_orders,0) AS order_count,
      COALESCE(kpi.completed_orders,0) AS completed_orders,
      ROUND(CASE WHEN kpi.total_orders > 0
            THEN kpi.completed_orders * 100.0 / kpi.total_orders ELSE 0 END, 1) AS completion_rate,
      COALESCE(kpi.avg_rating, 0) AS avg_rating,
      COALESCE(kpi.complaint_cnt, 0) AS complaint_count,
      COALESCE(kpi.total_km, 0) AS km_total,
      COALESCE(kpi.total_revenue, 0) AS revenue
    FROM drivers d
    LEFT JOIN (
      SELECT
        o.driver_id,
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
        AVG(r.stars) AS avg_rating,
        COUNT(av.id) AS complaint_cnt,
        0 AS total_km,
        SUM(o.total_fee) FILTER (WHERE o.status = 'delivered') AS total_revenue
      FROM orders o
      LEFT JOIN driver_ratings r ON r.order_id = o.id
      LEFT JOIN audit_violations av ON av.driver_id = o.driver_id
        AND av.severity IN ('major','critical')
        AND EXTRACT(YEAR FROM av.created_at) = ${year}
        AND EXTRACT(MONTH FROM av.created_at) = ${month}
      WHERE o.driver_id IS NOT NULL
        AND EXTRACT(YEAR FROM o.created_at)  = ${year}
        AND EXTRACT(MONTH FROM o.created_at) = ${month}
      GROUP BY o.driver_id
    ) kpi ON kpi.driver_id = d.id
    WHERE d.status NOT IN ('inactive')
    ORDER BY completion_rate DESC NULLS LAST, avg_rating DESC NULLS LAST
  `);

  // 取目標值
  const { rows: targets } = await pool.query(
    "SELECT metric, target_value FROM performance_targets WHERE target_type='driver' AND is_active=true"
  );
  const targetMap: Record<string, number> = {};
  targets.forEach((t: any) => { targetMap[t.metric] = parseFloat(t.target_value); });

  // 計算每位司機達成率
  const result = drivers.map((d: any) => {
    const checks: Record<string, { actual: number; target: number; met: boolean }> = {
      completion_rate: { actual: parseFloat(d.completion_rate), target: targetMap.completion_rate ?? 95, met: parseFloat(d.completion_rate) >= (targetMap.completion_rate ?? 95) },
      avg_rating:      { actual: parseFloat(d.avg_rating),      target: targetMap.avg_rating ?? 4.5,    met: parseFloat(d.avg_rating) >= (targetMap.avg_rating ?? 4.5) },
      order_count:     { actual: parseInt(d.order_count),        target: targetMap.order_count ?? 30,    met: parseInt(d.order_count) >= (targetMap.order_count ?? 30) },
      complaint_count: { actual: parseInt(d.complaint_count),    target: targetMap.complaint_count ?? 0, met: parseInt(d.complaint_count) <= (targetMap.complaint_count ?? 0) },
    };
    const metCount = Object.values(checks).filter(c => c.met).length;
    const overallPct = Math.round((metCount / Object.keys(checks).length) * 100);
    return { ...d, checks, metCount, totalChecks: Object.keys(checks).length, overallPct };
  });

  res.json({ year, month, targets: targetMap, drivers: result });
});

// GET /api/performance/audit/driver/:driverId
performanceRouter.get("/performance/audit/driver/:driverId", async (req, res) => {
  const driverId = parseInt(req.params.driverId, 10);
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? new Date().getMonth() + 1), 10);

  const { rows: [driver] } = await pool.query("SELECT id,name,phone,vehicle_type FROM drivers WHERE id=$1", [driverId]);
  if (!driver) return res.status(404).json({ error: "司機不存在" });

  const { rows: [kpi] } = await pool.query(`
    SELECT
      COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE o.status = 'delivered') AS completed_orders,
      ROUND(CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE o.status='delivered')*100.0/COUNT(*) ELSE 0 END,1) AS completion_rate,
      ROUND(AVG(r.stars)::numeric, 2) AS avg_rating,
      SUM(o.total_fee) FILTER (WHERE o.status='delivered') AS revenue
    FROM orders o
    LEFT JOIN driver_ratings r ON r.order_id = o.id
    WHERE o.driver_id = $1
      AND EXTRACT(YEAR FROM o.created_at)  = $2
      AND EXTRACT(MONTH FROM o.created_at) = $3
  `, [driverId, year, month]);

  const { rows: violations } = await pool.query(`
    SELECT * FROM audit_violations WHERE driver_id=$1
      AND EXTRACT(YEAR FROM created_at)=$2 AND EXTRACT(MONTH FROM created_at)=$3
    ORDER BY created_at DESC
  `, [driverId, year, month]);

  const { rows: bonuses } = await pool.query(`
    SELECT * FROM performance_bonuses WHERE driver_id=$1
    ORDER BY period_year DESC, period_month DESC LIMIT 12
  `, [driverId]);

  const { rows: targets } = await pool.query(
    "SELECT metric, target_value FROM performance_targets WHERE target_type='driver' AND is_active=true"
  );
  const targetMap: Record<string, number> = {};
  targets.forEach((t: any) => { targetMap[t.metric] = parseFloat(t.target_value); });

  const complaintCount = violations.length;
  const checks = {
    completion_rate: { actual: parseFloat(kpi?.completion_rate ?? "0"), target: targetMap.completion_rate ?? 95 },
    avg_rating:      { actual: parseFloat(kpi?.avg_rating ?? "0"),      target: targetMap.avg_rating ?? 4.5 },
    order_count:     { actual: parseInt(kpi?.total_orders ?? "0"),       target: targetMap.order_count ?? 30 },
    complaint_count: { actual: complaintCount,                           target: targetMap.complaint_count ?? 0 },
  };

  res.json({ driver, year, month, kpi: { ...kpi, complaint_count: complaintCount }, checks, violations, bonuses });
});

// ════════════════════════════════════════════════════════════════
// 稽核儀表板 — 車隊 KPI 查詢
// ════════════════════════════════════════════════════════════════

// GET /api/performance/audit/fleets?year=2026&month=3
performanceRouter.get("/performance/audit/fleets", async (req, res) => {
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? new Date().getMonth() + 1), 10);

  const { rows: fleets } = await pool.query(`
    SELECT
      fr.id, fr.company_name, fr.contact_name, fr.status AS reg_status,
      pf.status AS partner_status,
      COALESCE(kpi.total_orders,0) AS order_count,
      COALESCE(kpi.completed_orders,0) AS completed_orders,
      ROUND(CASE WHEN kpi.total_orders > 0
            THEN kpi.completed_orders*100.0/kpi.total_orders ELSE 0 END, 1) AS completion_rate,
      COALESCE(kpi.avg_rating, 0) AS avg_rating,
      COALESCE(kpi.complaint_cnt, 0) AS complaint_count,
      fr.risk_score
    FROM fleet_registrations fr
    LEFT JOIN partner_fleets pf ON pf.fleet_reg_id = fr.id
    LEFT JOIN (
      SELECT
        o.outsource_fleet_id AS fleet_id,
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE o.status='delivered') AS completed_orders,
        AVG(r.stars) AS avg_rating,
        0 AS complaint_cnt
      FROM orders o
      LEFT JOIN driver_ratings r ON r.order_id = o.id
      WHERE o.outsource_fleet_id IS NOT NULL
        AND EXTRACT(YEAR FROM o.created_at)  = ${year}
        AND EXTRACT(MONTH FROM o.created_at) = ${month}
      GROUP BY o.outsource_fleet_id
    ) kpi ON kpi.fleet_id = pf.id
    WHERE fr.status IN ('approved','suspended')
    ORDER BY completion_rate DESC NULLS LAST
  `);

  const { rows: targets } = await pool.query(
    "SELECT metric, target_value FROM performance_targets WHERE target_type='fleet' AND is_active=true"
  );
  const targetMap: Record<string, number> = {};
  targets.forEach((t: any) => { targetMap[t.metric] = parseFloat(t.target_value); });

  const result = fleets.map((f: any) => {
    const checks = {
      completion_rate: { actual: parseFloat(f.completion_rate), target: targetMap.completion_rate ?? 93, met: parseFloat(f.completion_rate) >= (targetMap.completion_rate ?? 93) },
      avg_rating:      { actual: parseFloat(f.avg_rating),      target: targetMap.avg_rating ?? 4.3,    met: parseFloat(f.avg_rating) >= (targetMap.avg_rating ?? 4.3) },
      order_count:     { actual: parseInt(f.order_count),        target: targetMap.order_count ?? 100,   met: parseInt(f.order_count) >= (targetMap.order_count ?? 100) },
      complaint_count: { actual: parseInt(f.complaint_count),    target: targetMap.complaint_count ?? 2, met: parseInt(f.complaint_count) <= (targetMap.complaint_count ?? 2) },
    };
    const metCount = Object.values(checks).filter(c => c.met).length;
    const overallPct = Math.round((metCount / Object.keys(checks).length) * 100);
    return { ...f, checks, metCount, totalChecks: Object.keys(checks).length, overallPct };
  });

  res.json({ year, month, targets: targetMap, fleets: result });
});

// ════════════════════════════════════════════════════════════════
// 達標獎金計算 & 核發
// ════════════════════════════════════════════════════════════════

// POST /api/performance/calculate-bonuses  { year, month, entity_type }
performanceRouter.post("/performance/calculate-bonuses", async (req, res) => {
  const { year, month, entity_type = "driver" } = req.body;
  if (!year || !month) return res.status(400).json({ error: "缺少 year/month" });

  const { rows: rules } = await pool.query(
    "SELECT * FROM bonus_rules WHERE target_type=$1 AND is_active=true ORDER BY achievement_pct DESC",
    [entity_type]
  );
  const { rows: targets } = await pool.query(
    "SELECT metric, target_value FROM performance_targets WHERE target_type=$1 AND is_active=true",
    [entity_type]
  );
  const targetMap: Record<string, number> = {};
  targets.forEach((t: any) => { targetMap[t.metric] = parseFloat(t.target_value); });

  const preview: any[] = [];

  if (entity_type === "driver") {
    const { rows: drivers } = await pool.query(`
      SELECT d.id, d.name,
        COUNT(o.id) AS order_count,
        ROUND(CASE WHEN COUNT(o.id)>0 THEN COUNT(o.id) FILTER (WHERE o.status='delivered')*100.0/COUNT(o.id) ELSE 0 END,1) AS completion_rate,
        ROUND(AVG(r.stars)::numeric,2) AS avg_rating,
        (SELECT COUNT(*) FROM audit_violations av WHERE av.driver_id=d.id AND severity IN ('major','critical')
          AND EXTRACT(YEAR FROM av.created_at)=$1 AND EXTRACT(MONTH FROM av.created_at)=$2) AS complaint_count
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id=d.id
        AND EXTRACT(YEAR FROM o.created_at)=$1 AND EXTRACT(MONTH FROM o.created_at)=$2
      LEFT JOIN driver_ratings r ON r.order_id=o.id
      WHERE d.status NOT IN ('inactive')
      GROUP BY d.id
    `, [year, month]);

    for (const d of drivers as any[]) {
      const achievementData = {
        completion_rate: parseFloat(d.completion_rate),
        avg_rating:      parseFloat(d.avg_rating ?? "0"),
        order_count:     parseInt(d.order_count),
        complaint_count: parseInt(d.complaint_count),
      };
      const targetsMet = {
        completion_rate: achievementData.completion_rate >= (targetMap.completion_rate ?? 95),
        avg_rating:      achievementData.avg_rating      >= (targetMap.avg_rating ?? 4.5),
        order_count:     achievementData.order_count     >= (targetMap.order_count ?? 30),
        complaint_count: achievementData.complaint_count <= (targetMap.complaint_count ?? 0),
      };
      const metCount = Object.values(targetsMet).filter(Boolean).length;
      const overallPct = Math.round((metCount / Object.keys(targetsMet).length) * 100);

      let matchedRule: any = null;
      for (const rule of rules) {
        const pct = parseFloat(rule.achievement_pct);
        const allMet = Object.values(targetsMet).every(Boolean);
        if (rule.require_all && !allMet) continue;
        if (overallPct >= pct) { matchedRule = rule; break; }
      }

      if (matchedRule) {
        preview.push({
          driver_id: d.id, driver_name: d.name,
          achievementData, targetsMet, overallPct,
          level_name: matchedRule.level_name,
          level_color: matchedRule.level_color,
          bonus_rule_id: matchedRule.id,
          total_bonus: matchedRule.bonus_amount,
        });
      }
    }
  }

  res.json({ year, month, entity_type, count: preview.length, preview });
});

// POST /api/performance/bonuses/approve-batch  批量建立並核准獎金
performanceRouter.post("/performance/bonuses/approve-batch", async (req, res) => {
  const { year, month, entity_type = "driver", bonuses } = req.body;
  if (!Array.isArray(bonuses) || !year || !month)
    return res.status(400).json({ error: "缺少參數" });

  let created = 0;
  for (const b of bonuses) {
    try {
      await pool.query(`
        INSERT INTO performance_bonuses
          (entity_type, driver_id, fleet_reg_id, period_year, period_month, bonus_rule_id,
           achievement_data, targets_met, overall_pct, level_name, total_bonus, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved')
        ON CONFLICT (entity_type, driver_id, period_year, period_month) DO UPDATE SET
          bonus_rule_id=EXCLUDED.bonus_rule_id, achievement_data=EXCLUDED.achievement_data,
          targets_met=EXCLUDED.targets_met, overall_pct=EXCLUDED.overall_pct,
          level_name=EXCLUDED.level_name, total_bonus=EXCLUDED.total_bonus,
          status='approved', approved_at=NOW()
      `, [
        entity_type,
        entity_type === "driver" ? b.driver_id : null,
        entity_type === "fleet"  ? b.fleet_reg_id : null,
        year, month, b.bonus_rule_id,
        JSON.stringify(b.achievementData), JSON.stringify(b.targetsMet),
        b.overallPct, b.level_name, b.total_bonus
      ]);
      created++;
    } catch { /* skip duplicates */ }
  }
  res.json({ ok: true, created });
});

// GET /api/performance/bonuses?year=&month=&type=driver
performanceRouter.get("/performance/bonuses", async (req, res) => {
  const { year, month, type } = req.query;
  const { rows } = await pool.query(`
    SELECT pb.*, d.name AS driver_name, d.phone AS driver_phone,
           fr.company_name AS fleet_name
    FROM performance_bonuses pb
    LEFT JOIN drivers d ON d.id = pb.driver_id
    LEFT JOIN fleet_registrations fr ON fr.id = pb.fleet_reg_id
    WHERE ($1::int IS NULL OR pb.period_year  = $1)
      AND ($2::int IS NULL OR pb.period_month = $2)
      AND ($3::text IS NULL OR pb.entity_type = $3)
    ORDER BY pb.period_year DESC, pb.period_month DESC, pb.total_bonus DESC
  `, [year || null, month || null, type || null]);
  res.json(rows);
});

// PATCH /api/performance/bonuses/:id/status
performanceRouter.patch("/performance/bonuses/:id/status", async (req, res) => {
  const { status, note } = req.body;
  const { rows } = await pool.query(`
    UPDATE performance_bonuses SET
      status      = $1,
      note        = COALESCE($2, note),
      approved_at = CASE WHEN $1='approved' THEN NOW() ELSE approved_at END,
      paid_at     = CASE WHEN $1='paid'     THEN NOW() ELSE paid_at     END
    WHERE id=$3 RETURNING *
  `, [status, note, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "獎金記錄不存在" });
  res.json({ ok: true, bonus: rows[0] });
});

// ════════════════════════════════════════════════════════════════
// 稽核違規管理
// ════════════════════════════════════════════════════════════════

// POST /api/performance/violations
performanceRouter.post("/performance/violations", async (req, res) => {
  const { entity_type, driver_id, fleet_reg_id, order_id, violation_type, severity, description, penalty_points, penalty_amount } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO audit_violations
      (entity_type, driver_id, fleet_reg_id, order_id, violation_type, severity, description, penalty_points, penalty_amount)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
  `, [entity_type, driver_id || null, fleet_reg_id || null, order_id || null,
      violation_type, severity ?? "minor", description, penalty_points ?? 0, penalty_amount ?? 0]);
  res.json({ ok: true, violation: rows[0] });
});

// GET /api/performance/violations
performanceRouter.get("/performance/violations", async (req, res) => {
  const { driver_id, fleet_reg_id, status } = req.query;
  const { rows } = await pool.query(`
    SELECT av.*, d.name AS driver_name, fr.company_name AS fleet_name, o.id AS order_no
    FROM audit_violations av
    LEFT JOIN drivers d ON d.id = av.driver_id
    LEFT JOIN fleet_registrations fr ON fr.id = av.fleet_reg_id
    LEFT JOIN orders o ON o.id = av.order_id
    WHERE ($1::int IS NULL OR av.driver_id = $1)
      AND ($2::int IS NULL OR av.fleet_reg_id = $2)
      AND ($3::text IS NULL OR av.status = $3)
    ORDER BY av.created_at DESC
    LIMIT 200
  `, [driver_id || null, fleet_reg_id || null, status || null]);
  res.json(rows);
});

// PATCH /api/performance/violations/:id/resolve
performanceRouter.patch("/performance/violations/:id/resolve", async (req, res) => {
  const { status, resolved_by, appeal_reason } = req.body;
  const { rows } = await pool.query(`
    UPDATE audit_violations SET
      status=$1, resolved_by=$2, appeal_reason=COALESCE($3,appeal_reason), resolved_at=NOW()
    WHERE id=$4 RETURNING *
  `, [status ?? "resolved", resolved_by ?? "admin", appeal_reason, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "違規記錄不存在" });
  res.json({ ok: true, violation: rows[0] });
});

// ════════════════════════════════════════════════════════════════
// 司機端: 自己的獎金進度
// ════════════════════════════════════════════════════════════════

// GET /api/performance/my-bonus/:driverId
performanceRouter.get("/performance/my-bonus/:driverId", async (req, res) => {
  const driverId = parseInt(req.params.driverId, 10);
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? new Date().getMonth() + 1), 10);

  const { rows: [kpi] } = await pool.query(`
    SELECT
      COUNT(*) AS order_count,
      ROUND(CASE WHEN COUNT(*)>0 THEN COUNT(*) FILTER(WHERE status='delivered')*100.0/COUNT(*) ELSE 0 END,1) AS completion_rate,
      ROUND(AVG(r.stars)::numeric,2) AS avg_rating,
      SUM(total_fee) FILTER(WHERE status='delivered') AS revenue
    FROM orders o
    LEFT JOIN driver_ratings r ON r.order_id=o.id
    WHERE o.driver_id=$1
      AND EXTRACT(YEAR FROM o.created_at)=$2 AND EXTRACT(MONTH FROM o.created_at)=$3
  `, [driverId, year, month]);

  const { rows: targets } = await pool.query(
    "SELECT metric, target_value FROM performance_targets WHERE target_type='driver' AND is_active=true"
  );
  const targetMap: Record<string, number> = {};
  targets.forEach((t: any) => { targetMap[t.metric] = parseFloat(t.target_value); });

  const { rows: rules } = await pool.query(
    "SELECT * FROM bonus_rules WHERE target_type='driver' AND is_active=true ORDER BY achievement_pct DESC"
  );
  const { rows: bonuses } = await pool.query(
    "SELECT * FROM performance_bonuses WHERE driver_id=$1 ORDER BY period_year DESC, period_month DESC LIMIT 6",
    [driverId]
  );
  const { rows: violations } = await pool.query(`
    SELECT violation_type, severity, description, created_at FROM audit_violations
    WHERE driver_id=$1 AND EXTRACT(YEAR FROM created_at)=$2 AND EXTRACT(MONTH FROM created_at)=$3
    ORDER BY created_at DESC
  `, [driverId, year, month]);

  const achievementData = {
    completion_rate: parseFloat(kpi?.completion_rate ?? "0"),
    avg_rating:      parseFloat(kpi?.avg_rating ?? "0"),
    order_count:     parseInt(kpi?.order_count ?? "0"),
    complaint_count: violations.length,
  };
  const targetsMet = {
    completion_rate: achievementData.completion_rate >= (targetMap.completion_rate ?? 95),
    avg_rating:      achievementData.avg_rating      >= (targetMap.avg_rating ?? 4.5),
    order_count:     achievementData.order_count     >= (targetMap.order_count ?? 30),
    complaint_count: achievementData.complaint_count <= (targetMap.complaint_count ?? 0),
  };
  const metCount = Object.values(targetsMet).filter(Boolean).length;
  const overallPct = Math.round((metCount / 4) * 100);

  let nextLevel = null;
  for (const rule of rules as any[]) {
    if (overallPct < parseFloat(rule.achievement_pct)) { nextLevel = rule; break; }
    else { nextLevel = rule; }
  }

  res.json({ year, month, kpi, targets: targetMap, achievementData, targetsMet, overallPct, rules, nextLevel, bonuses, violations });
});

// GET /api/performance/stats  — 總覽統計
performanceRouter.get("/performance/stats", async (_req, res) => {
  const year  = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  const { rows: [summary] } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM performance_bonuses WHERE status='pending') AS pending_bonuses,
      (SELECT COUNT(*) FROM performance_bonuses WHERE status='approved') AS approved_bonuses,
      (SELECT COALESCE(SUM(total_bonus),0) FROM performance_bonuses WHERE status='approved' AND period_year=$1 AND period_month=$2) AS this_month_approved,
      (SELECT COALESCE(SUM(total_bonus),0) FROM performance_bonuses WHERE status='paid' AND period_year=$1 AND period_month=$2) AS this_month_paid,
      (SELECT COUNT(*) FROM audit_violations WHERE status='open') AS open_violations,
      (SELECT COUNT(*) FROM audit_violations WHERE severity='critical' AND status='open') AS critical_violations
  `, [year, month]);

  res.json(summary);
});
