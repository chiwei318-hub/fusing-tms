/**
 * apiKeys.ts — API Key 管理（需 Admin JWT）
 * CRUD + 使用統計 + 撤銷
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export const apiKeysRouter = Router();

function hashKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function generateKey(prefix: string) {
  const rand = crypto.randomBytes(24).toString("base64url");
  return `${prefix}_${rand}`;
}

// ─── List ─────────────────────────────────────────────────────────────────
apiKeysRouter.get("/api-keys", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT id, name, key_prefix, scope, status, rate_limit, note,
           expires_at, last_used_at, request_count, created_at
    FROM api_keys
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

// ─── Create ───────────────────────────────────────────────────────────────
apiKeysRouter.post("/api-keys", async (req, res) => {
  const { name, scope, rate_limit = 1000, note, expires_at } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name 必填" });

  const prefix = "fv1";
  const raw    = generateKey(prefix);
  const hash   = hashKey(raw);
  const scopeArr = Array.isArray(scope)
    ? scope
    : ["orders:read", "orders:create", "quote"];

  await db.execute(sql`
    INSERT INTO api_keys (name, key_prefix, key_hash, scope, rate_limit, note, expires_at)
    VALUES (
      ${name},
      ${prefix},
      ${hash},
      ${scopeArr}::text[],
      ${Number(rate_limit)},
      ${note ? String(note) : null},
      ${expires_at ?? null}
    )
  `);

  // Return the raw key ONCE — never stored in plain text again
  res.status(201).json({ key: raw, prefix, name, scope: scopeArr, note });
});

// ─── Update (status / note / rate_limit) ──────────────────────────────────
apiKeysRouter.patch("/api-keys/:id", async (req, res) => {
  const { id } = req.params;
  const { status, note, rate_limit } = req.body ?? {};

  const setClauses: ReturnType<typeof sql>[] = [];
  if (status    !== undefined) setClauses.push(sql`status = ${status === "active" ? "active" : "revoked"}`);
  if (note      !== undefined) setClauses.push(sql`note = ${note ? String(note) : null}`);
  if (rate_limit !== undefined) setClauses.push(sql`rate_limit = ${Number(rate_limit)}`);
  if (!setClauses.length) return res.status(400).json({ error: "沒有可更新的欄位" });

  setClauses.push(sql`updated_at = NOW()`);
  await db.execute(sql`UPDATE api_keys SET ${sql.join(setClauses, sql`, `)} WHERE id = ${Number(id)}`);
  res.json({ ok: true });
});

// ─── Revoke / Delete ──────────────────────────────────────────────────────
apiKeysRouter.delete("/api-keys/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM api_keys WHERE id = ${Number(req.params.id)}`);
  res.json({ ok: true });
});

// ─── Usage stats ──────────────────────────────────────────────────────────
apiKeysRouter.get("/api-keys/:id/usage", async (req, res) => {
  const id = Number(req.params.id);
  const days = Number(req.query.days ?? 7);

  const timeline = await db.execute(sql`
    SELECT
      DATE_TRUNC('hour', created_at)::timestamptz AS hour,
      COUNT(*)                                     AS calls,
      COUNT(*) FILTER (WHERE status_code >= 400)  AS errors
    FROM api_usage_logs
    WHERE api_key_id = ${id}
      AND created_at >= NOW() - (${days} || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour ASC
  `);

  const endpoints = await db.execute(sql`
    SELECT endpoint, method, COUNT(*) AS calls,
           ROUND(AVG(latency_ms)::numeric, 0) AS avg_ms,
           COUNT(*) FILTER (WHERE status_code >= 400) AS errors
    FROM api_usage_logs
    WHERE api_key_id = ${id}
      AND created_at >= NOW() - (${days} || ' days')::INTERVAL
    GROUP BY endpoint, method
    ORDER BY calls DESC
    LIMIT 10
  `);

  res.json({ timeline: timeline.rows, endpoints: endpoints.rows });
});

// ─── Verify key (internal helper used by openApi middleware) ──────────────
export async function verifyApiKey(rawKey: string): Promise<{ id: number; scope: string[]; rateLimit: number } | null> {
  const hash = hashKey(rawKey);
  const rows = await db.execute(sql`
    SELECT id, scope, rate_limit FROM api_keys
    WHERE key_hash = ${hash}
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
  `);
  if (!rows.rows.length) return null;
  const row = rows.rows[0] as any;
  // Update last_used_at and increment counter asynchronously
  db.execute(sql`
    UPDATE api_keys
    SET last_used_at = NOW(), request_count = request_count + 1
    WHERE id = ${row.id}
  `).catch(() => {});
  return { id: row.id, scope: row.scope, rateLimit: row.rate_limit };
}
