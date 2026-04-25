/**
 * oauthAccounts.ts
 * Centralised OAuth account management.
 * Table: oauth_accounts
 * Providers: google (yahoo / apple to be added later)
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";
import { signJwt } from "../lib/jwt.js";
import { sendInviteEmail } from "../lib/email.js";

const router = Router();

// ─── Env helpers ─────────────────────────────────────────────────────────────
const GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_INFO_URL  = "https://www.googleapis.com/oauth2/v3/userinfo";

function googleCallbackUrl() {
  return (
    process.env.GOOGLE_OAUTH_CALLBACK_URL ??
    `${process.env.APP_BASE_URL ?? ""}/api/auth/oauth/callback/google`
  );
}

// ─── DB bootstrap ────────────────────────────────────────────────────────────
export async function ensureOAuthAccountsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id           SERIAL PRIMARY KEY,
      email        TEXT NOT NULL,
      provider     TEXT NOT NULL DEFAULT 'google',
      role         TEXT NOT NULL,
      fleet_id     INTEGER,
      driver_id    INTEGER,
      status       TEXT NOT NULL DEFAULT 'pending',
      invite_token TEXT UNIQUE,
      expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ,
      oauth_sub    TEXT,
      avatar_url   TEXT,
      display_name TEXT,
      invited_by   TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS oauth_accounts_email_idx     ON oauth_accounts(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS oauth_accounts_token_idx     ON oauth_accounts(invite_token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS oauth_accounts_oauth_sub_idx ON oauth_accounts(oauth_sub) WHERE oauth_sub IS NOT NULL`);
  console.log("[OAuthAccounts] table ensured");
}

// ─── Role labels ─────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin:          "系統管理員",
  fleet:          "福興高司機",
  driver:         "司機",
  customer:       "客戶",
  fleet_owner:    "加盟車行業主",
};

// ─── JWT builder from oauth_accounts row ────────────────────────────────────
async function buildJwt(acc: any): Promise<string | null> {
  const { role, fleet_id, driver_id, email, display_name, oauth_sub } = acc;

  if (role === "fleet") {
    if (!fleet_id) return null;
    const { rows } = await pool.query(
      `SELECT id, fleet_name, username, is_active FROM fusingao_fleets WHERE id=$1 LIMIT 1`,
      [fleet_id],
    );
    const f = rows[0];
    if (!f || !f.is_active) return null;
    return signJwt({ role: "fusingao_fleet" as any, id: f.id, name: f.fleet_name, username: f.username, fleetId: f.id } as any);
  }

  if (role === "driver") {
    if (!driver_id) return null;
    const { rows } = await pool.query(
      `SELECT id, name, phone, is_active FROM drivers WHERE id=$1 LIMIT 1`,
      [driver_id],
    );
    const d = rows[0];
    if (!d || d.is_active === false) return null;
    return signJwt({ role: "driver", id: d.id, name: d.name, phone: d.phone });
  }

  if (role === "customer") {
    let { rows } = await pool.query(
      `SELECT id, name, phone, is_active FROM customers WHERE email=$1 LIMIT 1`,
      [email],
    );
    let c = rows[0];
    if (!c) {
      const ins = await pool.query(
        `INSERT INTO customers (name, email, google_id, is_active) VALUES ($1,$2,$3,true) RETURNING id, name, phone`,
        [display_name ?? email, email, oauth_sub ?? null],
      );
      c = ins.rows[0];
    }
    if (c?.is_active === false) return null;
    return signJwt({ role: "customer", id: c.id, name: c.name, phone: c.phone });
  }

  if (role === "fleet_owner") {
    let { rows } = await pool.query(
      `SELECT id, name, owner_name, username, status FROM franchisees WHERE email=$1 LIMIT 1`,
      [email],
    );
    const f = rows[0];
    if (!f) return null;
    return signJwt({
      role: "fleet_owner" as any,
      id: f.id, name: f.owner_name ?? f.name, username: f.username,
      franchisee_id: f.id, franchisee_name: f.name,
    } as any);
  }

  if (role === "admin") {
    const { rows } = await pool.query(
      `SELECT id, username, display_name FROM admin_users WHERE email=$1 AND is_active=true LIMIT 1`,
      [email],
    );
    const a = rows[0];
    if (!a) {
      // Fallback: use oauth_accounts.id
      return signJwt({ role: "admin", id: acc.id, name: display_name ?? email, username: email });
    }
    return signJwt({ role: "admin", id: a.id, name: a.display_name, username: a.username });
  }

  return null;
}

// ─── POST /api/auth/oauth/invite ─────────────────────────────────────────────
router.post("/invite", async (req, res) => {
  const { email, role, fleet_id, driver_id, invited_by } = req.body as {
    email?: string; role?: string;
    fleet_id?: number; driver_id?: number; invited_by?: string;
  };

  if (!email || !role) return res.status(400).json({ error: "缺少 email 或 role" });
  if (!ROLE_LABELS[role]) return res.status(400).json({ error: `不支援的角色：${role}` });

  const cleanEmail = email.toLowerCase().trim();
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const appBase = process.env.APP_BASE_URL ?? "";

  // Upsert: if pending invite exists for same email+role, replace token
  await pool.query(
    `INSERT INTO oauth_accounts (email, role, fleet_id, driver_id, invite_token, invited_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [cleanEmail, role, fleet_id ?? null, driver_id ?? null, inviteToken, invited_by ?? "admin"],
  );

  const inviteUrl = `${appBase}/invite/${inviteToken}`;
  await sendInviteEmail({ to: cleanEmail, role, roleLabel: ROLE_LABELS[role] ?? role, inviteUrl });

  res.json({ ok: true, inviteToken, inviteUrl });
});

// ─── GET /api/auth/oauth/verify/:token ───────────────────────────────────────
router.get("/verify/:token", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, role, status, expires_at, activated_at
     FROM oauth_accounts WHERE invite_token=$1 LIMIT 1`,
    [req.params.token],
  );
  const acc = rows[0];
  if (!acc) return res.status(404).json({ error: "邀請連結無效" });
  if (acc.status === "disabled") return res.status(410).json({ error: "此帳號已停用" });
  if (acc.status === "active") {
    return res.json({ email: acc.email, role: acc.role, roleLabel: ROLE_LABELS[acc.role] ?? acc.role, alreadyActive: true });
  }
  if (new Date(acc.expires_at) < new Date()) return res.status(410).json({ error: "此邀請連結已過期" });
  res.json({ email: acc.email, role: acc.role, roleLabel: ROLE_LABELS[acc.role] ?? acc.role });
});

// ─── GET /api/auth/oauth/url/google ──────────────────────────────────────────
router.get("/url/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: "Google Login 未設定" });

  const inviteToken = req.query.invite_token ? String(req.query.invite_token) : undefined;
  const statePayload: Record<string, string> = { system: "oauth" };
  if (inviteToken) statePayload.invite_token = inviteToken;
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: googleCallbackUrl(),
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  res.json({ url: `${GOOGLE_AUTH_URL}?${params}` });
});

// ─── GET /api/auth/oauth/callback/google ─────────────────────────────────────
router.get("/callback/google", async (req, res) => {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appBase      = process.env.APP_BASE_URL ?? "";

  if (!clientId || !clientSecret) return res.status(503).send("Google OAuth 未設定");

  const { code, state, error: gErr } = req.query as Record<string, string>;
  if (gErr || !code) return res.redirect(`${appBase}/login?error=google_cancelled`);

  let inviteToken: string | null = null;
  try {
    const parsed = JSON.parse(Buffer.from(state ?? "", "base64url").toString());
    inviteToken = parsed.invite_token ?? null;
  } catch {}

  try {
    // Exchange code → tokens
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: googleCallbackUrl(), grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenResp.ok) throw new Error(`Token exchange ${tokenResp.status}`);
    const { access_token } = await tokenResp.json() as { access_token: string };

    // Get profile
    const infoResp = await fetch(GOOGLE_INFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoResp.ok) throw new Error(`UserInfo ${infoResp.status}`);
    const prof = await infoResp.json() as { sub: string; email: string; name: string; picture?: string };
    const { sub: googleSub, email, name, picture: avatarUrl } = prof;

    // ── Invite flow ─────────────────────────────────────────────────────────
    if (inviteToken) {
      const { rows } = await pool.query(
        `SELECT * FROM oauth_accounts WHERE invite_token=$1 LIMIT 1`, [inviteToken],
      );
      const acc = rows[0];
      if (!acc) return res.redirect(`${appBase}/login?error=invite_invalid`);
      if (acc.status === "disabled") return res.redirect(`${appBase}/login?error=account_inactive`);
      if (acc.status !== "active" && new Date(acc.expires_at) < new Date()) {
        return res.redirect(`${appBase}/login?error=invite_expired`);
      }

      // Bind OAuth sub if not yet bound (first time)
      if (!acc.oauth_sub) {
        await pool.query(
          `UPDATE oauth_accounts SET oauth_sub=$1, avatar_url=$2, display_name=$3,
           status='active', activated_at=NOW(), provider='google'
           WHERE id=$4`,
          [googleSub, avatarUrl ?? null, name, acc.id],
        );
        acc.oauth_sub = googleSub;
        acc.status = "active";
        acc.display_name = name;
      }

      const jwtToken = await buildJwt({ ...acc, oauth_sub: googleSub, display_name: name });
      if (!jwtToken) return res.redirect(`${appBase}/login?error=account_setup_failed`);
      return res.redirect(`${appBase}/login/oauth/callback?token=${jwtToken}`);
    }

    // ── Return login (no invite token) ──────────────────────────────────────
    // Look up by oauth_sub first, then email
    let { rows } = await pool.query(
      `SELECT * FROM oauth_accounts WHERE oauth_sub=$1 AND status='active' LIMIT 1`, [googleSub],
    );
    let acc = rows[0];

    if (!acc) {
      const byEmail = await pool.query(
        `SELECT * FROM oauth_accounts WHERE email=$1 AND status='active' LIMIT 1`,
        [email?.toLowerCase()],
      );
      acc = byEmail.rows[0];
      if (acc && !acc.oauth_sub) {
        await pool.query(
          `UPDATE oauth_accounts SET oauth_sub=$1, avatar_url=$2, display_name=$3, provider='google' WHERE id=$4`,
          [googleSub, avatarUrl ?? null, name, acc.id],
        );
      }
    }

    if (!acc) return res.redirect(`${appBase}/login?error=no_oauth_account`);
    if (acc.status === "disabled") return res.redirect(`${appBase}/login?error=account_inactive`);

    const jwtToken = await buildJwt({ ...acc, display_name: acc.display_name ?? name });
    if (!jwtToken) return res.redirect(`${appBase}/login?error=account_setup_failed`);
    return res.redirect(`${appBase}/login/oauth/callback?token=${jwtToken}`);

  } catch (err: any) {
    console.error("[OAuthAccounts] Google callback error:", err.message);
    return res.redirect(`${appBase}/login?error=google_failed`);
  }
});

// ─── GET /api/auth/oauth/accounts ────────────────────────────────────────────
router.get("/accounts", async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT oa.*,
      ff.fleet_name AS fleet_name,
      d.name        AS driver_name
    FROM oauth_accounts oa
    LEFT JOIN fusingao_fleets ff ON ff.id = oa.fleet_id
    LEFT JOIN drivers          d  ON d.id  = oa.driver_id
    ORDER BY oa.invited_at DESC
    LIMIT 300
  `);
  res.json(rows);
});

// ─── PATCH /api/auth/oauth/accounts/:id/disable ──────────────────────────────
router.patch("/accounts/:id/disable", async (req, res) => {
  await pool.query(`UPDATE oauth_accounts SET status='disabled' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── PATCH /api/auth/oauth/accounts/:id/enable ───────────────────────────────
router.patch("/accounts/:id/enable", async (req, res) => {
  await pool.query(`UPDATE oauth_accounts SET status='active' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── DELETE /api/auth/oauth/accounts/:id ─────────────────────────────────────
router.delete("/accounts/:id", async (req, res) => {
  await pool.query(`DELETE FROM oauth_accounts WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── POST /api/auth/oauth/accounts/:id/resend ────────────────────────────────
router.post("/accounts/:id/resend", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM oauth_accounts WHERE id=$1 LIMIT 1`, [req.params.id],
  );
  const acc = rows[0];
  if (!acc) return res.status(404).json({ error: "找不到帳號" });

  // Refresh token + expiry
  const newToken = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `UPDATE oauth_accounts SET invite_token=$1, expires_at=NOW()+INTERVAL '7 days', status='pending' WHERE id=$2`,
    [newToken, acc.id],
  );

  const appBase = process.env.APP_BASE_URL ?? "";
  const inviteUrl = `${appBase}/invite/${newToken}`;
  await sendInviteEmail({ to: acc.email, role: acc.role, roleLabel: ROLE_LABELS[acc.role] ?? acc.role, inviteUrl });
  res.json({ ok: true, inviteUrl });
});

export default router;
