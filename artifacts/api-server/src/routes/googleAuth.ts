import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { signJwt } from "../lib/jwt.js";

const router = Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getCallbackUrl(): string {
  return (
    process.env.GOOGLE_CALLBACK_URL ??
    `${process.env.APP_BASE_URL ?? ""}/api/auth/google/callback`
  );
}

export async function ensureGoogleAuthColumns() {
  await db.execute(sql`ALTER TABLE customers       ADD COLUMN IF NOT EXISTS google_id   TEXT`);
  await db.execute(sql`ALTER TABLE customers       ADD COLUMN IF NOT EXISTS avatar_url  TEXT`);
  await db.execute(sql`ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS google_id   TEXT`);
  await db.execute(sql`ALTER TABLE fusingao_fleets ADD COLUMN IF NOT EXISTS avatar_url  TEXT`);
  await db.execute(sql`ALTER TABLE franchisees     ADD COLUMN IF NOT EXISTS google_id   TEXT`);
  await db.execute(sql`ALTER TABLE franchisees     ADD COLUMN IF NOT EXISTS avatar_url  TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS customers_google_id_uidx       ON customers(google_id)       WHERE google_id IS NOT NULL`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS fusingao_fleets_google_id_uidx ON fusingao_fleets(google_id)  WHERE google_id IS NOT NULL`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS franchisees_google_id_uidx     ON franchisees(google_id)      WHERE google_id IS NOT NULL`);
}

// GET /auth/google/url?role=customer|fleet|owner
router.get("/auth/google/url", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: "Google Login 未設定" });

  const role = String(req.query.role ?? "customer");
  const callbackUri = getCallbackUrl();
  const state = Buffer.from(JSON.stringify({ role })).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUri,
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  res.json({ url: `${GOOGLE_AUTH_URL}?${params}` });
});

// GET /auth/google/callback
router.get("/auth/google/callback", async (req, res) => {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appBase      = process.env.APP_BASE_URL ?? "";

  if (!clientId || !clientSecret) return res.status(503).send("Google Login 未設定");

  const { code, state, error: gErr } = req.query as Record<string, string>;
  if (gErr || !code) return res.redirect(`${appBase}/login?error=google_cancelled`);

  let role = "customer";
  try {
    const parsed = JSON.parse(Buffer.from(state ?? "", "base64url").toString());
    role = parsed.role ?? "customer";
  } catch {}

  try {
    const callbackUri = getCallbackUrl();

    // Exchange code → access_token
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenResp.ok) throw new Error(`Token exchange ${tokenResp.status}`);
    const { access_token } = await tokenResp.json() as { access_token: string };

    // Get user profile
    const infoResp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!infoResp.ok) throw new Error(`UserInfo ${infoResp.status}`);
    const prof = await infoResp.json() as {
      sub: string; email: string; name: string; picture?: string;
    };

    const googleId  = prof.sub;
    const email     = prof.email ?? null;
    const name      = prof.name ?? email ?? "Google 用戶";
    const avatarUrl = prof.picture ?? null;

    // ── 客戶 ────────────────────────────────────────────────────────────────────
    if (role === "customer") {
      let row = (await pool.query(
        `SELECT id, name, phone, is_active FROM customers WHERE google_id = $1 LIMIT 1`,
        [googleId],
      )).rows[0];

      if (!row && email) {
        const byEmail = (await pool.query(
          `SELECT id, name, phone, is_active FROM customers WHERE email = $1 LIMIT 1`,
          [email],
        )).rows[0];
        if (byEmail) {
          await pool.query(
            `UPDATE customers SET google_id=$1, avatar_url=$2 WHERE id=$3`,
            [googleId, avatarUrl, byEmail.id],
          );
          row = byEmail;
        }
      }

      if (!row) {
        row = (await pool.query(
          `INSERT INTO customers (name, email, google_id, avatar_url, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id, name, phone, is_active`,
          [name, email, googleId, avatarUrl],
        )).rows[0];
      }

      if (!row.is_active) return res.redirect(`${appBase}/login?error=account_inactive`);
      const token = signJwt({ role: "customer", id: row.id, name: row.name, phone: row.phone });
      return res.redirect(`${appBase}/login/callback?token=${token}`);
    }

    // ── 福興高車隊（fusingao_fleet）────────────────────────────────────────────
    if (role === "fleet") {
      const row = (await pool.query(
        `SELECT id, fleet_name, username, is_active FROM fusingao_fleets WHERE google_id = $1 LIMIT 1`,
        [googleId],
      )).rows[0];

      if (!row) {
        const hint = email ? encodeURIComponent(email) : "";
        return res.redirect(`${appBase}/login/fleet?error=google_no_account&hint=${hint}`);
      }
      if (!row.is_active) return res.redirect(`${appBase}/login/fleet?error=account_inactive`);

      await pool.query(
        `UPDATE fusingao_fleets SET avatar_url=$1 WHERE id=$2`,
        [avatarUrl, row.id],
      );
      const token = signJwt({
        role: "fusingao_fleet" as any,
        id: row.id, name: row.fleet_name, username: row.username, fleetId: row.id,
      } as any);
      return res.redirect(`${appBase}/login/callback?token=${token}`);
    }

    // ── 加盟車行老闆（fleet_owner）──────────────────────────────────────────────
    if (role === "owner") {
      let row = (await pool.query(
        `SELECT id, name, owner_name, username, status FROM franchisees WHERE google_id = $1 LIMIT 1`,
        [googleId],
      )).rows[0];

      if (!row && email) {
        const byEmail = (await pool.query(
          `SELECT id, name, owner_name, username, status FROM franchisees WHERE email = $1 LIMIT 1`,
          [email],
        )).rows[0];
        if (byEmail) {
          await pool.query(
            `UPDATE franchisees SET google_id=$1, avatar_url=$2 WHERE id=$3`,
            [googleId, avatarUrl, byEmail.id],
          );
          row = byEmail;
        }
      }

      if (!row) {
        const hint = email ? encodeURIComponent(email) : "";
        return res.redirect(`${appBase}/login/franchise-fleet?error=google_no_account&hint=${hint}`);
      }
      const token = signJwt({
        role: "fleet_owner" as any,
        id: row.id,
        name: row.owner_name ?? row.name,
        username: row.username,
        franchisee_id: row.id,
        franchisee_name: row.name,
      } as any);
      return res.redirect(`${appBase}/login/callback?token=${token}`);
    }

    return res.redirect(`${appBase}/login?error=unknown_role`);
  } catch (err: any) {
    console.error("[GoogleAuth] callback error:", err.message);
    return res.redirect(`${appBase}/login?error=google_failed`);
  }
});

export default router;
