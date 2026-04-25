import { Router } from "express";
import { pool } from "@workspace/db";
import crypto from "crypto";
import { sendInviteEmail } from "../lib/email.js";

const router = Router();

export async function ensureInvitationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL,
      role          TEXT NOT NULL,
      token         TEXT NOT NULL UNIQUE,
      invited_by    TEXT,
      expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      used_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS invitations_token_idx ON invitations(token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS invitations_email_idx ON invitations(email)`);
}

const ROLE_LABELS: Record<string, string> = {
  customer:       "客戶",
  fusingao_fleet: "福興高司機",
  fleet_owner:    "加盟車行業主",
};

// POST /api/admin/invitations — create invite + send email
router.post("/", async (req, res) => {
  const { email, role, invited_by } = req.body as {
    email?: string; role?: string; invited_by?: string;
  };

  if (!email || !role) return res.status(400).json({ error: "缺少 email 或 role" });
  if (!ROLE_LABELS[role]) return res.status(400).json({ error: `不支援的角色：${role}` });

  const token = crypto.randomBytes(32).toString("hex");
  const appBase = process.env.APP_BASE_URL ?? "";

  await pool.query(
    `INSERT INTO invitations (email, role, token, invited_by) VALUES ($1, $2, $3, $4)`,
    [email.toLowerCase().trim(), role, token, invited_by ?? "admin"],
  );

  const inviteUrl = `${appBase}/invite/${token}`;
  await sendInviteEmail({ to: email, role, roleLabel: ROLE_LABELS[role] ?? role, inviteUrl });

  res.json({ ok: true, token, inviteUrl });
});

// GET /api/admin/invitations — list all invitations
router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, role, invited_by, expires_at, used_at, created_at,
            token,
            CASE WHEN used_at IS NOT NULL THEN 'used'
                 WHEN expires_at < NOW() THEN 'expired'
                 ELSE 'pending' END AS status
     FROM invitations ORDER BY created_at DESC LIMIT 200`,
  );
  res.json(rows);
});

// DELETE /api/admin/invitations/:id — revoke
router.delete("/:id", async (req, res) => {
  await pool.query(`DELETE FROM invitations WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// POST /api/admin/invitations/:id/resend — resend email
router.post("/:id/resend", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM invitations WHERE id=$1`, [req.params.id],
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "找不到邀請" });

  const appBase = process.env.APP_BASE_URL ?? "";
  const inviteUrl = `${appBase}/invite/${inv.token}`;
  await sendInviteEmail({
    to: inv.email, role: inv.role,
    roleLabel: ROLE_LABELS[inv.role] ?? inv.role, inviteUrl,
  });
  res.json({ ok: true });
});

// GET /api/auth/invite/:token — public: verify invite token
router.get("/verify/:token", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, role, expires_at, used_at FROM invitations WHERE token=$1 LIMIT 1`,
    [req.params.token],
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: "邀請連結無效" });
  if (inv.used_at) return res.status(410).json({ error: "此邀請連結已使用過" });
  if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: "此邀請連結已過期" });
  res.json({ email: inv.email, role: inv.role, roleLabel: ROLE_LABELS[inv.role] ?? inv.role });
});

export default router;
