/**
 * webhooks.ts — Webhook 管理 + 送達記錄 + 測試觸發
 * 事件：order.created | order.status_changed | order.delivered
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import https from "https";
import http from "http";
import { URL } from "url";

export const webhooksRouter = Router();

// ─── Delivery helper ──────────────────────────────────────────────────────
export async function deliverWebhook(
  webhookId: number,
  event: string,
  payload: object,
  secret: string | null
): Promise<{ ok: boolean; statusCode?: number; body?: string }> {
  const whRows = await db.execute(sql`
    SELECT url, secret FROM webhooks WHERE id = ${webhookId} AND status = 'active'
  `);
  if (!whRows.rows.length) return { ok: false };
  const { url } = whRows.rows[0] as any;

  const body   = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const sig    = secret ? "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex") : "";
  const parsed = new URL(url);
  const lib    = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve) => {
    const startMs = Date.now();
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: {
        "Content-Type":            "application/json",
        "Content-Length":          Buffer.byteLength(body),
        "X-FV-Event":              event,
        "X-FV-Signature-256":      sig,
        "User-Agent":              "FuYong-Logistics/1.0",
      },
      timeout: 8000,
    };
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", (c: any) => { data += c; });
      res.on("end", () => {
        const latency = Date.now() - startMs;
        const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
        db.execute(sql`
          INSERT INTO webhook_deliveries (webhook_id, event, payload, status, response_code, response_body, delivered_at)
          VALUES (${webhookId}, ${event}, ${JSON.stringify(payload)}::jsonb,
                  ${ok ? "success" : "failed"}, ${res.statusCode ?? 0},
                  ${data.substring(0, 500)}, NOW())
        `).catch(() => {});
        if (!ok) {
          db.execute(sql`UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ${webhookId}`).catch(() => {});
        }
        resolve({ ok, statusCode: res.statusCode, body: data.substring(0, 500) });
      });
    });
    req.on("error", (e: Error) => {
      db.execute(sql`
        INSERT INTO webhook_deliveries (webhook_id, event, payload, status, response_body)
        VALUES (${webhookId}, ${event}, ${JSON.stringify(payload)}::jsonb, 'failed', ${e.message})
      `).catch(() => {});
      db.execute(sql`UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ${webhookId}`).catch(() => {});
      resolve({ ok: false, body: e.message });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, body: "timeout" }); });
    req.write(body);
    req.end();
  });
}

// ─── Broadcast to all active webhooks that subscribe to an event ──────────
export async function broadcastWebhook(event: string, payload: object) {
  const rows = await db.execute(sql`
    SELECT id, secret FROM webhooks
    WHERE status = 'active' AND ${event} = ANY(events)
  `);
  for (const row of rows.rows as any[]) {
    deliverWebhook(row.id, event, payload, row.secret).catch(() => {});
  }
}

// ─── List ─────────────────────────────────────────────────────────────────
webhooksRouter.get("/webhooks", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT id, name, url, events, status, note, failure_count, created_at,
           (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = webhooks.id) AS delivery_count,
           (SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = webhooks.id AND status = 'success') AS success_count
    FROM webhooks
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

// ─── Create ───────────────────────────────────────────────────────────────
webhooksRouter.post("/webhooks", async (req, res) => {
  const { name, url, events, note } = req.body ?? {};
  if (!name || !url) return res.status(400).json({ error: "name 和 url 必填" });

  const secret = crypto.randomBytes(20).toString("hex");
  const eventsArr = Array.isArray(events)
    ? events
    : ["order.created", "order.status_changed", "order.delivered"];

  const r = await db.execute(sql`
    INSERT INTO webhooks (name, url, events, secret, note)
    VALUES (${name}, ${url}, ${eventsArr}::text[], ${secret}, ${note ?? null})
    RETURNING id, name, url, events, status, created_at
  `);
  res.status(201).json({ ...(r.rows[0] as object), secret });
});

// ─── Update ───────────────────────────────────────────────────────────────
webhooksRouter.patch("/webhooks/:id", async (req, res) => {
  const { id } = req.params;
  const { name, url, events, status, note } = req.body ?? {};

  const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
  if (name   !== undefined) setClauses.push(sql`name = ${name}`);
  if (url    !== undefined) setClauses.push(sql`url = ${url}`);
  if (status !== undefined) setClauses.push(sql`status = ${["active","paused"].includes(status) ? status : "paused"}`);
  if (note   !== undefined) setClauses.push(note ? sql`note = ${note}` : sql`note = NULL`);
  if (Array.isArray(events)) {
    setClauses.push(sql`events = ${events}::text[]`);
  }

  const setFragment = sql.join(setClauses, sql`, `);
  await db.execute(sql`UPDATE webhooks SET ${setFragment} WHERE id = ${Number(id)}`);
  res.json({ ok: true });
});

// ─── Delete ───────────────────────────────────────────────────────────────
webhooksRouter.delete("/webhooks/:id", async (req, res) => {
  await db.execute(sql`DELETE FROM webhooks WHERE id = ${Number(req.params.id)}`);
  res.json({ ok: true });
});

// ─── Test fire ────────────────────────────────────────────────────────────
webhooksRouter.post("/webhooks/:id/test", async (req, res) => {
  const id = Number(req.params.id);
  const event = req.body?.event ?? "order.status_changed";
  const payload = {
    order_id: 0, customer_name: "測試客戶", status: "delivered",
    total_fee: 1500, pickup_address: "台北市測試路1號", delivery_address: "新北市範例路2號",
  };
  const result = await deliverWebhook(id, event, payload, null);
  res.json(result);
});

// ─── Delivery history ─────────────────────────────────────────────────────
webhooksRouter.get("/webhooks/:id/deliveries", async (req, res) => {
  const id    = Number(req.params.id);
  const limit = Math.min(50, Number(req.query.limit ?? 20));
  const rows  = await db.execute(sql`
    SELECT id, event, status, response_code, response_body, attempt, created_at
    FROM webhook_deliveries
    WHERE webhook_id = ${id}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  res.json(rows.rows);
});
