/**
 * openApi.ts — 開放 API 接口（第三方串接用，需 API Key）
 * Base: /api/open/v1
 *
 * Header: X-API-Key: fv1_xxxx
 *
 * Endpoints:
 *   POST  /api/open/v1/orders        建立訂單
 *   GET   /api/open/v1/orders/:id    查詢訂單
 *   GET   /api/open/v1/orders        查詢訂單列表（限自己建立）
 *   POST  /api/open/v1/quote         報價試算
 */
import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { verifyApiKey } from "./apiKeys";
import { broadcastWebhook } from "./webhooks";

export const openApiRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      apiKeyId?: number;
      apiKeyScope?: string[];
    }
  }
}

// ─── Middleware: verify API Key & log usage ───────────────────────────────
async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-api-key"] as string;
  if (!raw) return res.status(401).json({ error: "缺少 X-API-Key header" });

  const keyInfo = await verifyApiKey(raw);
  if (!keyInfo) return res.status(401).json({ error: "API Key 無效或已過期" });

  req.apiKeyId    = keyInfo.id;
  req.apiKeyScope = keyInfo.scope;

  // Async log
  const start = Date.now();
  res.on("finish", () => {
    db.execute(sql`
      INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, ip_address, latency_ms)
      VALUES (${keyInfo.id}, ${req.path}, ${req.method}, ${res.statusCode},
              ${req.ip ?? "unknown"}, ${Date.now() - start})
    `).catch(() => {});
  });

  next();
}

function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKeyScope?.includes(scope)) {
      return res.status(403).json({ error: `此 API Key 缺少 '${scope}' 權限` });
    }
    next();
  };
}

openApiRouter.use("/open/v1", apiKeyAuth);

// ─── POST /open/v1/quote — 報價試算 ──────────────────────────────────────
openApiRouter.post("/open/v1/quote", requireScope("quote"), async (req, res) => {
  const { vehicle_type, distance_km, weight_kg, extra_items } = req.body ?? {};
  if (!vehicle_type) return res.status(400).json({ error: "vehicle_type 必填" });

  // Pull rate cards from pricing_config — format: { vehicles: { "3.5T": {...} } }
  const cfgRow = await db.execute(sql`
    SELECT value FROM pricing_config WHERE key = 'vehicle_rate_cards' LIMIT 1
  `);
  const raw   = cfgRow.rows.length ? JSON.parse((cfgRow.rows[0] as any).value) : {};
  const cards = raw.vehicles ?? raw; // support both formats
  const card  = cards[vehicle_type];
  if (!card) {
    const available = Object.keys(cards);
    return res.status(400).json({ error: `未知的車型 '${vehicle_type}'`, available });
  }

  const base     = Number(card.basePrice ?? card.base_price ?? 0);
  const distFee  = Number(distance_km ?? 0) * Number(card.pricePerKm ?? card.per_km ?? 0);
  // Weight fee: find applicable tier
  const wkg = Number(weight_kg ?? 0);
  const weightTiers: any[] = card.weightTiers ?? [];
  const wTier = weightTiers.find((t: any) => wkg >= t.minVal && wkg <= t.maxVal);
  const weightFee = wTier ? Number(wTier.surcharge ?? 0) : 0;
  const subtotal = base + distFee + weightFee;
  const total    = Math.ceil(subtotal);

  res.json({
    vehicle_type, distance_km, weight_kg,
    breakdown: { base, distance_fee: distFee, weight_fee: weightFee },
    subtotal: Math.round(subtotal),
    total,
    currency: "TWD",
  });
});

// ─── POST /open/v1/orders — 建立訂單 ─────────────────────────────────────
openApiRouter.post("/open/v1/orders", requireScope("orders:create"), async (req, res) => {
  const {
    customer_name, customer_phone, customer_email,
    pickup_address, delivery_address,
    pickup_date, pickup_time,
    required_vehicle_type, cargo_weight, cargo_description, notes,
    payment_method = "cash",
  } = req.body ?? {};

  if (!customer_name || !customer_phone || !pickup_address || !delivery_address) {
    return res.status(400).json({ error: "必填欄位：customer_name, customer_phone, pickup_address, delivery_address" });
  }

  const r = await db.execute(sql`
    INSERT INTO orders (
      customer_name, customer_phone, customer_email,
      pickup_address, delivery_address,
      pickup_date, pickup_time,
      required_vehicle_type, cargo_weight, cargo_description,
      notes, payment_method, status, source
    ) VALUES (
      ${customer_name}, ${customer_phone}, ${customer_email ?? null},
      ${pickup_address}, ${delivery_address},
      ${pickup_date ?? null}, ${pickup_time ?? null},
      ${required_vehicle_type ?? null},
      ${cargo_weight ? Number(cargo_weight) : null},
      ${cargo_description ?? "API 訂單"},
      ${notes ?? null}, ${payment_method}, 'pending', 'api'
    )
    RETURNING id, customer_name, pickup_address, delivery_address, status, created_at
  `);

  const newOrder = r.rows[0] as any;

  // Broadcast webhook
  broadcastWebhook("order.created", newOrder).catch(() => {});

  res.status(201).json(newOrder);
});

// ─── GET /open/v1/orders/:id — 查詢單筆 ──────────────────────────────────
openApiRouter.get("/open/v1/orders/:id", requireScope("orders:read"), async (req, res) => {
  const row = await db.execute(sql`
    SELECT
      o.id, o.customer_name, o.customer_phone, o.customer_email,
      o.pickup_address, o.delivery_address,
      o.pickup_date, o.pickup_time,
      o.required_vehicle_type, o.cargo_weight, o.cargo_description,
      o.total_fee, o.status, o.notes, o.source, o.created_at,
      d.name AS driver_name, d.phone AS driver_phone, d.license_plate
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.id = ${Number(req.params.id)}
    LIMIT 1
  `);
  if (!row.rows.length) return res.status(404).json({ error: "找不到該訂單" });
  res.json(row.rows[0]);
});

// ─── GET /open/v1/orders — 查詢列表（限 api 來源） ────────────────────────
openApiRouter.get("/open/v1/orders", requireScope("orders:read"), async (req, res) => {
  const page  = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Number(req.query.limit ?? 20));
  const offset = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const statusClause = status ? sql`AND o.status = ${status}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      o.id, o.customer_name, o.pickup_address, o.delivery_address,
      o.status, o.total_fee, o.required_vehicle_type, o.created_at,
      d.name AS driver_name
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.source = 'api'
    ${statusClause}
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRow = await db.execute(sql`
    SELECT COUNT(*) AS total FROM orders WHERE source = 'api'
  `);

  res.json({
    data:  rows.rows,
    total: Number((countRow.rows[0] as any)?.total ?? 0),
    page, limit,
  });
});

// ─── GET /open/v1/track/:id — 物流追蹤（對外友善） ─────────────────────────
openApiRouter.get("/open/v1/track/:id", requireScope("orders:read"), async (req, res) => {
  const row = await db.execute(sql`
    SELECT
      o.id, o.customer_name, o.pickup_address, o.delivery_address,
      o.status, o.cargo_description, o.required_vehicle_type,
      o.pickup_date, o.pickup_time, o.created_at, o.updated_at,
      d.name AS driver_name, d.phone AS driver_phone, d.license_plate,
      d.latitude AS driver_lat, d.longitude AS driver_lng,
      d.last_location_at, d.current_location
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.id = ${Number(req.params.id)}
    LIMIT 1
  `);
  if (!row.rows.length) return res.status(404).json({ error: "找不到訂單" });
  const o = row.rows[0] as any;
  const statusMap: Record<string, string> = {
    pending: "待派車", assigned: "已派車", in_transit: "配送中",
    delivered: "已送達", cancelled: "已取消",
  };
  res.json({
    id: o.id,
    status: o.status,
    status_label: statusMap[o.status] ?? o.status,
    pickup_address: o.pickup_address,
    delivery_address: o.delivery_address,
    cargo_description: o.cargo_description,
    pickup_date: o.pickup_date,
    estimated_arrival: o.pickup_time,
    driver: o.driver_name ? {
      name: o.driver_name,
      phone: o.driver_phone,
      license_plate: o.license_plate,
      location: o.driver_lat ? { lat: o.driver_lat, lng: o.driver_lng, updated_at: o.last_location_at } : null,
    } : null,
    created_at: o.created_at,
    updated_at: o.updated_at,
  });
});

// ─── POST /open/v1/webhooks — 註冊 Webhook ────────────────────────────────
openApiRouter.post("/open/v1/webhooks", requireScope("orders:read"), async (req, res) => {
  const { url, events, name } = req.body ?? {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url 必填" });
  if (!url.startsWith("https://")) return res.status(400).json({ error: "url 必須使用 HTTPS" });
  const validEvents = ["order.created", "order.assigned", "order.delivered", "order.cancelled"];
  const evList: string[] = Array.isArray(events) ? events.filter((e: string) => validEvents.includes(e)) : validEvents;
  const note = `api_key_id:${req.apiKeyId}`;

  const result = await db.execute(sql`
    INSERT INTO webhooks (url, events, status, name, note, created_at)
    VALUES (${url}, ${JSON.stringify(evList)}, 'active', ${name ?? "API Webhook"}, ${note}, NOW())
    RETURNING id, url, events, status, name, created_at
  `);
  res.status(201).json(result.rows[0]);
});

// ─── GET /open/v1/webhooks — 列出 Webhook ─────────────────────────────────
openApiRouter.get("/open/v1/webhooks", requireScope("orders:read"), async (req, res) => {
  const note = `api_key_id:${req.apiKeyId}`;
  const rows = await db.execute(sql`
    SELECT id, url, events, status, name, created_at, failure_count
    FROM webhooks
    WHERE note = ${note}
    ORDER BY created_at DESC
  `);
  res.json(rows.rows);
});

// ─── DELETE /open/v1/webhooks/:id — 刪除 Webhook ──────────────────────────
openApiRouter.delete("/open/v1/webhooks/:id", requireScope("orders:read"), async (req, res) => {
  const note = `api_key_id:${req.apiKeyId}`;
  await db.execute(sql`
    DELETE FROM webhooks WHERE id = ${Number(req.params.id)} AND note = ${note}
  `);
  res.json({ ok: true });
});
