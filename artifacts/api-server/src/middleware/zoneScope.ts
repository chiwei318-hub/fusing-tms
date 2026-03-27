/**
 * Zone-Scoped Permission Middleware
 *
 * Attaches zone-access info to req after JWT decode.
 * Controllers can then filter queries by req.zoneIds.
 *
 * Roles:
 *   admin      — global access (no filter applied)
 *   regional   — can access a list of zone_ids (cross-zone)
 *   dispatcher — can only access their single zone_id
 *
 * JWT payload extension:
 *   { ...existing, zone_role: "admin"|"regional"|"dispatcher", zone_ids: number[] }
 *
 * The middleware does NOT block requests — it enriches req so that
 * route handlers can apply filters when needed. This way routes can
 * be updated incrementally to use zone scoping.
 */
import { type Request, type Response, type NextFunction } from "express";

// ── Types ─────────────────────────────────────────────────────────────────
export type ZoneRole = "admin" | "regional" | "dispatcher";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      zoneRole?: ZoneRole;
      zoneIds?: number[];       // zones the current user can access
      isGlobalAdmin?: boolean;  // shorthand: no zone filter should be applied
    }
  }
}

// ── Middleware ─────────────────────────────────────────────────────────────
export function zoneScopeMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    // Pull zone info from existing auth middleware's decoded payload
    // The auth middleware attaches the decoded JWT to req.user
    const user = (req as Request & { user?: {
      role?: string;
      zone_role?: ZoneRole;
      zone_ids?: number[];
    } }).user;

    if (!user) {
      // Not authenticated — let auth middleware handle it
      return next();
    }

    const zone_role: ZoneRole = user.zone_role ?? (user.role === "admin" ? "admin" : "dispatcher");
    const zone_ids: number[]  = Array.isArray(user.zone_ids) ? user.zone_ids : [];

    req.zoneRole = zone_role;
    req.zoneIds  = zone_ids;
    req.isGlobalAdmin = zone_role === "admin";

    next();
  } catch {
    next();
  }
}

// ── Helper for route handlers ──────────────────────────────────────────────
/**
 * Build a SQL WHERE clause fragment for zone filtering.
 * Returns { clause, params } where clause is like "AND zone_id = ANY($N)"
 * and params is the array of zone_ids values to append to your query params.
 *
 * Usage:
 *   const { clause, params } = buildZoneFilter(req, existingParams.length + 1);
 *   const { rows } = await pool.query(
 *     `SELECT * FROM orders WHERE 1=1 ${clause}`,
 *     [...existingParams, ...params]
 *   );
 */
export function buildZoneFilter(
  req: Request,
  paramStartIndex: number,
  tableAlias = ""
): { clause: string; params: number[][] } {
  const col = tableAlias ? `${tableAlias}.zone_id` : "zone_id";

  if (req.isGlobalAdmin || !req.zoneRole || req.zoneRole === "admin") {
    return { clause: "", params: [] };
  }

  if (!req.zoneIds || req.zoneIds.length === 0) {
    // Dispatcher with no zones assigned — sees nothing
    return { clause: `AND ${col} = -1`, params: [] };
  }

  return {
    clause: `AND ${col} = ANY($${paramStartIndex})`,
    params: [req.zoneIds],
  };
}

// ── Zone Role Management API (admin only) ─────────────────────────────────
// Separate router mounted at /api/zone-permissions
import { Router } from "express";
import { pool } from "@workspace/db";

export const zonePermissionsRouter = Router();

// Ensure zone columns on admin_users table
async function ensureZoneColumns() {
  for (const [col, def] of [
    ["zone_role",  "TEXT DEFAULT 'admin'"],
    ["zone_ids",   "TEXT"],  // JSON array of zone IDs
  ] as [string, string][]) {
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS ${col} ${def}`).catch(() => {});
  }
  console.log("[ZoneScope] user columns ensured");
}
ensureZoneColumns().catch(console.error);

// GET /api/zone-permissions — list all users with zone roles
zonePermissionsRouter.get("/zone-permissions", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.display_name AS name, u.zone_role, u.zone_ids,
        (SELECT json_agg(json_build_object('id', z.id, 'name', z.name))
         FROM zones z
         WHERE u.zone_ids IS NOT NULL
           AND z.id = ANY(
             ARRAY(SELECT jsonb_array_elements_text(u.zone_ids::jsonb)::int)
           )
        ) AS zone_details
      FROM admin_users u
      WHERE u.is_active IS NOT FALSE
      ORDER BY u.display_name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// PATCH /api/zone-permissions/:userId — set zone role for a user
zonePermissionsRouter.patch("/zone-permissions/:userId", async (req, res) => {
  try {
    const { zone_role, zone_ids } = req.body as { zone_role?: ZoneRole; zone_ids?: number[] };
    if (zone_role && !["admin", "regional", "dispatcher"].includes(zone_role)) {
      return res.status(400).json({ error: "zone_role 必須是 admin/regional/dispatcher" });
    }

    const { rows } = await pool.query(
      `UPDATE admin_users SET
        zone_role = COALESCE($1, zone_role),
        zone_ids  = COALESCE($2::text, zone_ids)
       WHERE id = $3 RETURNING id, username, display_name AS name, zone_role, zone_ids`,
      [
        zone_role ?? null,
        zone_ids != null ? JSON.stringify(zone_ids) : null,
        Number(req.params.userId),
      ]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// GET /api/zone-permissions/my-zones — current user's accessible zones
zonePermissionsRouter.get("/zone-permissions/my-zones", async (req, res) => {
  try {
    if (req.isGlobalAdmin || !req.zoneIds?.length) {
      const { rows } = await pool.query(`SELECT id, name, region FROM zones WHERE is_active ORDER BY name`);
      return res.json({ role: req.zoneRole ?? "admin", zones: rows, is_global: true });
    }

    const { rows } = await pool.query(
      `SELECT id, name, region FROM zones WHERE id = ANY($1) AND is_active ORDER BY name`,
      [req.zoneIds]
    );
    res.json({ role: req.zoneRole, zones: rows, is_global: false });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});
