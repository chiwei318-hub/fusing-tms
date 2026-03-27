/**
 * Presence / Online Users Tracking
 *
 * POST /api/presence/ping       — authenticated user sends heartbeat (every 30s)
 * GET  /api/online-users        — admin panel: who's currently online (last 5 min)
 *
 * "Online" = last_seen_at within the past 5 minutes.
 * All three user types (admin / driver / customer) are tracked.
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { verifyJwt, extractBearerToken } from "../lib/jwt";

export const presenceRouter = Router();

// ── Ensure last_seen_at columns exist ────────────────────────────────────────
async function ensurePresenceColumns() {
  const tables = [
    { table: "admin_users",  role: "admin"    },
    { table: "drivers",      role: "driver"   },
    { table: "customers",    role: "customer" },
  ];
  for (const { table } of tables) {
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`
    ).catch(() => {});
  }
  console.log("[Presence] last_seen_at columns ensured");
}
ensurePresenceColumns().catch(console.error);

// ── POST /api/presence/ping ───────────────────────────────────────────────────
presenceRouter.post("/presence/ping", async (req, res) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const payload = verifyJwt(token);
    if (!payload) return res.status(401).json({ error: "Invalid token" });

    const { role, id } = payload;
    const table = role === "admin" ? "admin_users" : role === "driver" ? "drivers" : "customers";

    await pool.query(
      `UPDATE ${table} SET last_seen_at = NOW() WHERE id = $1`,
      [id]
    );

    res.json({ ok: true, role, id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── GET /api/online-users ─────────────────────────────────────────────────────
presenceRouter.get("/online-users", async (req, res) => {
  try {
    const windowMin = Number(req.query["window"] ?? 5); // default: active in last 5 min
    const cutoff = `NOW() - INTERVAL '${Math.max(1, Math.min(60, windowMin))} minutes'`;

    const [admins, drivers, customers] = await Promise.all([
      pool.query<{
        id: number; display_name: string; username: string;
        zone_role: string | null; last_seen_at: string;
      }>(`
        SELECT id, display_name, username, zone_role, last_seen_at
        FROM admin_users
        WHERE is_active = true AND last_seen_at >= ${cutoff}
        ORDER BY last_seen_at DESC
      `),
      pool.query<{
        id: number; name: string; phone: string;
        vehicle_type: string | null; status: string | null; last_seen_at: string;
      }>(`
        SELECT id, name, phone, vehicle_type, status, last_seen_at
        FROM drivers
        WHERE last_seen_at >= ${cutoff}
        ORDER BY last_seen_at DESC
      `),
      pool.query<{
        id: number; name: string; phone: string; last_seen_at: string;
      }>(`
        SELECT id, name, phone, last_seen_at
        FROM customers
        WHERE last_seen_at >= ${cutoff}
        ORDER BY last_seen_at DESC
      `),
    ]);

    res.json({
      window_minutes: windowMin,
      total: admins.rows.length + drivers.rows.length + customers.rows.length,
      admins: admins.rows.map(u => ({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        role_label: u.zone_role === "dispatcher" ? "調度員" :
                    u.zone_role === "regional"   ? "區域主管" : "管理員",
        last_seen_at: u.last_seen_at,
        type: "admin" as const,
      })),
      drivers: drivers.rows.map(u => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        vehicle_type: u.vehicle_type,
        driver_status: u.status,
        last_seen_at: u.last_seen_at,
        type: "driver" as const,
      })),
      customers: customers.rows.map(u => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        last_seen_at: u.last_seen_at,
        type: "customer" as const,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
