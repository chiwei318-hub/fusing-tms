/**
 * Auto-Routing Rules Engine
 *
 * When an order is created, the engine evaluates all active rules (by priority)
 * and assigns zone_id + team_id automatically, routing the order into the
 * correct depot's dispatch pool.
 *
 * Rule match_types (evaluated in order of priority ASC, first match wins):
 *   postal_prefix  — first N digits of postal code match
 *   city           — order address contains the city string
 *   region         — order region field matches
 *   vehicle_type   — required_vehicle_type matches (can chain with address rules)
 *   cargo_keyword  — cargo_description contains keyword
 *   catchall       — always matches (used as default fallback)
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const autoRoutingRouter = Router();

// ── Ensure table ──────────────────────────────────────────────────────────
async function ensureAutoRoutingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auto_routing_rules (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      priority      INT  NOT NULL DEFAULT 100,
      match_type    TEXT NOT NULL,  -- postal_prefix|city|region|vehicle_type|cargo_keyword|catchall
      match_value   TEXT,           -- NULL for catchall
      vehicle_filter TEXT,          -- optional: only apply if vehicle_type matches this
      zone_id       INT  REFERENCES zones(id)  ON DELETE SET NULL,
      team_id       INT  REFERENCES teams(id)  ON DELETE SET NULL,
      region_tag    TEXT,           -- optional: set region label on order
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      description   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_auto_routing_priority ON auto_routing_rules(priority) WHERE is_active`);

  // Insert built-in fallback rule if empty
  const { rows } = await pool.query("SELECT COUNT(*)::int AS cnt FROM auto_routing_rules");
  if (rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO auto_routing_rules (name, priority, match_type, match_value, description)
      VALUES ('預設規則（無分站）', 999, 'catchall', NULL, '所有未匹配到其他規則的訂單')
    `);
  }

  console.log("[AutoRouting] table ensured");
}
ensureAutoRoutingTable().catch(console.error);

// ── Core engine function (exported for use in orderImport + orders.ts) ──────
export interface OrderForRouting {
  pickup_address?: string | null;
  delivery_address?: string | null;
  required_vehicle_type?: string | null;
  cargo_description?: string | null;
  region?: string | null;
  postal_code?: string | null;     // explicit postal code override
}

export interface RoutingResult {
  zone_id: number | null;
  team_id: number | null;
  region: string | null;
  rule_id: number | null;
  rule_name: string | null;
  matched: boolean;
}

export async function applyAutoRoutingToOrder(order: OrderForRouting): Promise<RoutingResult> {
  try {
    const { rows: rules } = await pool.query<{
      id: number; name: string; priority: number; match_type: string;
      match_value: string | null; vehicle_filter: string | null;
      zone_id: number | null; team_id: number | null; region_tag: string | null;
    }>(`
      SELECT id, name, priority, match_type, match_value, vehicle_filter, zone_id, team_id, region_tag
      FROM auto_routing_rules
      WHERE is_active = true
      ORDER BY priority ASC
    `);

    // Extract postal code from pickup_address if not explicitly provided
    const postalCode = order.postal_code
      || (order.pickup_address?.match(/\b([1-9]\d{2,5})\b/)?.[1] ?? null);

    const vehicleType  = (order.required_vehicle_type ?? "").toLowerCase();
    const cargoDesc    = (order.cargo_description ?? "").toLowerCase();
    const pickupAddr   = (order.pickup_address ?? "").toLowerCase();
    const region       = (order.region ?? "").toLowerCase();

    for (const rule of rules) {
      // Optional vehicle filter
      if (rule.vehicle_filter) {
        const vf = rule.vehicle_filter.toLowerCase();
        if (!vehicleType.includes(vf) && !cargoDesc.includes(vf)) continue;
      }

      let matched = false;
      const mv = (rule.match_value ?? "").toLowerCase();

      switch (rule.match_type) {
        case "catchall":
          matched = true;
          break;
        case "postal_prefix":
          if (postalCode && mv) {
            matched = postalCode.startsWith(mv.replace(/\*/g, ""));
          }
          break;
        case "city":
          if (mv) {
            matched = pickupAddr.includes(mv);
          }
          break;
        case "region":
          if (mv) {
            matched = region.includes(mv) || pickupAddr.includes(mv);
          }
          break;
        case "vehicle_type":
          if (mv) {
            matched = vehicleType.includes(mv);
          }
          break;
        case "cargo_keyword":
          if (mv) {
            matched = cargoDesc.includes(mv);
          }
          break;
      }

      if (matched) {
        return {
          zone_id:   rule.zone_id,
          team_id:   rule.team_id,
          region:    rule.region_tag ?? order.region ?? null,
          rule_id:   rule.id,
          rule_name: rule.name,
          matched:   true,
        };
      }
    }

    return { zone_id: null, team_id: null, region: order.region ?? null, rule_id: null, rule_name: null, matched: false };
  } catch (e) {
    console.error("[AutoRouting] engine error:", e);
    return { zone_id: null, team_id: null, region: order.region ?? null, rule_id: null, rule_name: null, matched: false };
  }
}

// ── GET /api/auto-routing/rules ────────────────────────────────────────────
autoRoutingRouter.get("/auto-routing/rules", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*,
        z.name AS zone_name,
        t.name AS team_name
      FROM auto_routing_rules r
      LEFT JOIN zones z ON z.id = r.zone_id
      LEFT JOIN teams t ON t.id = r.team_id
      ORDER BY r.priority ASC, r.id
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/auto-routing/rules ───────────────────────────────────────────
autoRoutingRouter.post("/auto-routing/rules", async (req, res) => {
  try {
    const { name, priority, match_type, match_value, vehicle_filter, zone_id, team_id, region_tag, description } = req.body;
    if (!name || !match_type) return res.status(400).json({ error: "name 和 match_type 必填" });

    const VALID_TYPES = ["postal_prefix", "city", "region", "vehicle_type", "cargo_keyword", "catchall"];
    if (!VALID_TYPES.includes(match_type)) {
      return res.status(400).json({ error: `match_type 必須是: ${VALID_TYPES.join(", ")}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO auto_routing_rules (name, priority, match_type, match_value, vehicle_filter, zone_id, team_id, region_tag, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, priority ?? 100, match_type, match_value ?? null, vehicle_filter ?? null,
       zone_id ?? null, team_id ?? null, region_tag ?? null, description ?? null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── PATCH /api/auto-routing/rules/:id ─────────────────────────────────────
autoRoutingRouter.patch("/auto-routing/rules/:id", async (req, res) => {
  try {
    const { name, priority, match_type, match_value, vehicle_filter, zone_id, team_id, region_tag, description, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE auto_routing_rules SET
        name          = COALESCE($1, name),
        priority      = COALESCE($2, priority),
        match_type    = COALESCE($3, match_type),
        match_value   = CASE WHEN $4::text IS NULL THEN match_value ELSE $4 END,
        vehicle_filter= CASE WHEN $5::text IS NULL THEN vehicle_filter ELSE $5 END,
        zone_id       = CASE WHEN $6::int  IS NULL THEN zone_id  ELSE $6::int  END,
        team_id       = CASE WHEN $7::int  IS NULL THEN team_id  ELSE $7::int  END,
        region_tag    = CASE WHEN $8::text IS NULL THEN region_tag ELSE $8 END,
        description   = COALESCE($9, description),
        is_active     = COALESCE($10, is_active)
       WHERE id = $11 RETURNING *`,
      [name, priority ?? null, match_type ?? null, match_value, vehicle_filter,
       zone_id ?? null, team_id ?? null, region_tag, description, is_active ?? null, Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── DELETE /api/auto-routing/rules/:id ────────────────────────────────────
autoRoutingRouter.delete("/auto-routing/rules/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT match_type FROM auto_routing_rules WHERE id=$1`, [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    if (rows[0].match_type === "catchall") {
      return res.status(400).json({ error: "無法刪除預設 catchall 規則" });
    }
    await pool.query(`DELETE FROM auto_routing_rules WHERE id=$1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── POST /api/auto-routing/preview ────────────────────────────────────────
// Test an order against all rules and show which rule would match
autoRoutingRouter.post("/auto-routing/preview", async (req, res) => {
  try {
    const order: OrderForRouting = req.body;
    const result = await applyAutoRoutingToOrder(order);

    // Also return the full rule evaluation trace
    const { rows: rules } = await pool.query(`
      SELECT r.*, z.name AS zone_name, t.name AS team_name
      FROM auto_routing_rules r
      LEFT JOIN zones z ON z.id = r.zone_id
      LEFT JOIN teams t ON t.id = r.team_id
      WHERE r.is_active ORDER BY r.priority ASC
    `);

    res.json({
      result,
      matched_rule: result.rule_id ? rules.find(r => r.id === result.rule_id) : null,
      total_rules: rules.length,
      order_received: order,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── PATCH /api/auto-routing/rules/reorder ─────────────────────────────────
// Bulk update priorities: body = [{id, priority}]
autoRoutingRouter.patch("/auto-routing/rules/reorder", async (req, res) => {
  try {
    const updates: { id: number; priority: number }[] = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: "body must be array" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const { id, priority } of updates) {
        await client.query(`UPDATE auto_routing_rules SET priority=$1 WHERE id=$2`, [priority, id]);
      }
      await client.query("COMMIT");
      res.json({ ok: true, updated: updates.length });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ── GET /api/auto-routing/stats ───────────────────────────────────────────
// Show how many orders have been routed by each rule (from zone assignments)
autoRoutingRouter.get("/auto-routing/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        r.id, r.name, r.match_type, r.match_value, r.priority,
        z.name AS zone_name,
        COUNT(o.id)::int AS routed_orders,
        COUNT(o.id) FILTER (WHERE o.created_at >= NOW() - INTERVAL '7 days')::int AS routed_last_7d
      FROM auto_routing_rules r
      LEFT JOIN zones z ON z.id = r.zone_id
      LEFT JOIN orders o ON o.zone_id = r.zone_id
      GROUP BY r.id, r.name, r.match_type, r.match_value, r.priority, z.name
      ORDER BY r.priority ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
