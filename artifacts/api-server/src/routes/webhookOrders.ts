/**
 * webhookOrders.ts — 外部系統推送訂單接收端點
 * POST /api/v1/webhook/orders
 *
 * 支援兩種 payload 格式：
 *
 * 1. 事件包裝格式（Event-wrapped）：
 *    { event, timestamp, data: { order_id, customer_name, ... } }
 *
 * 2. 直接訂單格式（Flat）：
 *    { order_id, customer_name, address, contact_phone, temp_type, lat, lng, status, ... }
 *
 * 認證：X-API-Key header（需 orders:create 權限）
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { verifyApiKey } from "./apiKeys.js";
import { broadcastWebhook } from "./webhooks.js";

export const webhookOrdersRouter = Router();

// ─── Field normaliser ─────────────────────────────────────────────────────
/**
 * Accepts both flat and event-wrapped payloads and returns a normalised object.
 */
function normalise(body: Record<string, any>): Record<string, any> {
  // Unwrap event envelope if present
  const raw: Record<string, any> =
    body.event && body.data && typeof body.data === "object"
      ? body.data
      : body;

  return {
    externalOrderId: String(raw.order_id ?? "").trim() || null,
    customerName:    String(raw.customer_name  ?? "").trim() || null,
    customerPhone:   String(raw.customer_phone ?? raw.contact_phone ?? "").trim() || null,
    // Support both `address` (pickup) and separate pickup/delivery
    pickupAddress:   String(raw.pickup_address  ?? raw.address ?? "").trim() || null,
    deliveryAddress: String(raw.delivery_address ?? raw.address ?? "").trim() || null,
    cargoDescription:String(raw.cargo_description ?? raw.temp_type ?? "").trim() || null,
    isColdChain:     /冷凍|冷藏|cold/i.test(String(raw.temp_type ?? raw.cargo_description ?? "")),
    totalFee:        raw.total_fee != null ? Number(raw.total_fee) : null,
    notes:           buildNotes(raw),
    status:          raw.status ?? "pending",
    driverName:      raw.driver_name  ?? null,
    driverPhone:     raw.driver_phone ?? null,
    driverLicense:   raw.driver_license ?? null,
  };
}

function buildNotes(raw: Record<string, any>): string | null {
  const parts: string[] = [];
  const freeText = raw.notes ?? raw.note ?? null;
  if (freeText)       parts.push(String(freeText));
  if (raw.lat != null && raw.lng != null) parts.push(`坐標：${raw.lat},${raw.lng}`);
  if (raw.order_id)   parts.push(`外部單號：${raw.order_id}`);
  return parts.length ? parts.join(" | ") : null;
}

// ─── Auth middleware ───────────────────────────────────────────────────────
async function requireOrdersCreate(req: any, res: any, next: any) {
  const raw = (req.headers["x-api-key"] as string) ?? "";
  if (!raw) return res.status(401).json({ error: "缺少 X-API-Key header" });

  const keyInfo = await verifyApiKey(raw);
  if (!keyInfo) return res.status(401).json({ error: "API Key 無效或已過期" });

  if (!keyInfo.scope.includes("orders:create")) {
    return res.status(403).json({ error: "此 API Key 缺少 orders:create 權限" });
  }

  req.apiKeyId = keyInfo.id;
  next();
}

// ─── POST /v1/webhook/atoms-broadcast — 批次補發未派車訂單給 ATOMS ─────────────
webhookOrdersRouter.post("/v1/webhook/atoms-broadcast", async (req, res) => {
  try {
    const statuses: string[] = req.body?.statuses ?? ["pending"];
    const validStatuses = ["pending", "assigned", "in_transit"];
    const safeStatuses = statuses.filter(s => validStatuses.includes(s));
    if (!safeStatuses.length) {
      return res.status(400).json({ error: "statuses 必須包含 pending / assigned / in_transit 之一" });
    }

    const statusList = sql.join(safeStatuses.map(s => sql`${s}`), sql`, `);
    const rows = await db.execute(sql`
      SELECT o.id, o.order_no, o.customer_name, o.customer_phone,
             o.pickup_address, o.pickup_date, o.pickup_time,
             o.delivery_address, o.delivery_date, o.delivery_time,
             o.cargo_description, o.is_cold_chain, o.total_fee, o.notes, o.status,
             d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone,
             d.license_plate AS driver_license, d.vehicle_type AS driver_vehicle
      FROM orders o
      LEFT JOIN drivers d ON d.id = o.driver_id
      WHERE o.status IN (${statusList})
      ORDER BY o.id DESC
      LIMIT 200
    `);

    const orders = rows.rows as any[];
    const results: { order_id: number; ok: boolean; statusCode?: number; error?: string }[] = [];

    for (const o of orders) {
      const payload = {
        order_id:         o.id,
        order_no:         o.order_no,
        status:           o.status,
        customer_name:    o.customer_name,
        customer_phone:   o.customer_phone,
        pickup_address:   o.pickup_address,
        pickup_date:      o.pickup_date,
        pickup_time:      o.pickup_time,
        delivery_address: o.delivery_address,
        delivery_date:    o.delivery_date,
        delivery_time:    o.delivery_time,
        cargo_description: o.cargo_description,
        is_cold_chain:    o.is_cold_chain,
        total_fee:        o.total_fee,
        notes:            o.notes,
        driver_id:        o.driver_id ?? null,
        driver_name:      o.driver_name ?? null,
        driver_phone:     o.driver_phone ?? null,
        driver_license:   o.driver_license ?? null,
        driver_vehicle:   o.driver_vehicle ?? null,
        broadcast_at:     new Date().toISOString(),
      };

      const atomsUrl = process.env.ATOMS_WEBHOOK_URL;
      if (!atomsUrl) {
        results.push({ order_id: o.id, ok: false, error: "ATOMS_WEBHOOK_URL 未設定" });
        continue;
      }

      try {
        const r = await fetch(atomsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "order.assigned", timestamp: new Date().toISOString(), data: payload }),
          signal: AbortSignal.timeout(8000),
        });
        results.push({ order_id: o.id, ok: r.ok, statusCode: r.status });
      } catch (err: any) {
        results.push({ order_id: o.id, ok: false, error: err?.message ?? "timeout" });
      }
    }

    const success = results.filter(r => r.ok).length;
    const failed  = results.filter(r => !r.ok).length;

    console.log(`[AtomsBroadcast] sent=${results.length} success=${success} failed=${failed}`);
    res.json({ ok: true, total: results.length, success, failed, results });
  } catch (err: any) {
    console.error("[AtomsBroadcast] error:", err?.message ?? err);
    res.status(500).json({ error: "批次補發失敗", detail: err?.message ?? "unknown" });
  }
});

// ─── POST /v1/webhook/orders  (and alias /v1/webhook/receive-order) ──────────
webhookOrdersRouter.post(
  ["/v1/webhook/orders", "/v1/webhook/receive-order"],
  requireOrdersCreate,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const d = normalise(body);

      // Required field validation
      const missing: string[] = [];
      if (!d.customerName)    missing.push("customer_name");
      if (!d.customerPhone)   missing.push("customer_phone / contact_phone");
      if (!d.deliveryAddress) missing.push("delivery_address / address");
      if (missing.length) {
        return res.status(400).json({ error: "必填欄位缺少", missing });
      }

      // Pickup address defaults to delivery address if omitted
      const pickupAddress = d.pickupAddress || d.deliveryAddress;

      // Map status to valid enum values
      const validStatuses = ["pending", "assigned", "in_transit", "delivered", "cancelled"];
      const status = validStatuses.includes(d.status) ? d.status : "pending";

      const result = await db.execute(sql`
        INSERT INTO orders (
          customer_name, customer_phone,
          pickup_address, delivery_address,
          cargo_description, is_cold_chain,
          total_fee, notes, status,
          source_channel, created_at, updated_at
        ) VALUES (
          ${d.customerName},  ${d.customerPhone},
          ${pickupAddress},   ${d.deliveryAddress},
          ${d.cargoDescription ?? "API 訂單"},
          ${d.isColdChain},
          ${d.totalFee ?? null},
          ${d.notes ?? null},
          ${status},
          'api', NOW(), NOW()
        )
        RETURNING
          id, order_no, customer_name, customer_phone,
          pickup_address, delivery_address,
          cargo_description, is_cold_chain,
          total_fee, notes, status, source_channel, created_at
      `);

      const newOrder = result.rows[0] as any;

      // Log API key usage
      db.execute(sql`
        INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, ip_address, latency_ms)
        VALUES (${req.apiKeyId}, '/v1/webhook/orders', 'POST', 201, ${req.ip ?? "unknown"}, 0)
      `).catch(() => {});

      // Broadcast outgoing webhooks
      broadcastWebhook("order.created", {
        ...newOrder,
        external_order_id: d.externalOrderId,
      }).catch(() => {});

      res.status(201).json({
        ok:                true,
        order_id:          newOrder.id,
        order_no:          newOrder.order_no,
        status:            newOrder.status,
        external_order_id: d.externalOrderId,
        created_at:        newOrder.created_at,
      });
    } catch (err: any) {
      console.error("[WebhookOrders] error:", err?.message ?? err);
      res.status(500).json({ error: "訂單建立失敗", detail: err?.message ?? "unknown" });
    }
  }
);
