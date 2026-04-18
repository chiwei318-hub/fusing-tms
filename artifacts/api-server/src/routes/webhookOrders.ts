/**
 * webhookOrders.ts — 外部系統推送訂單接收端點
 *
 * 端點列表：
 *   POST /api/v1/webhook/orders           — 外部建立訂單（需 X-API-Key: orders:create）
 *   POST /api/v1/webhook/receive-order    — 同上（別名）
 *   POST /api/v1/webhook/atoms-broadcast  — 批次補發訂單給 Atoms
 *   POST /api/v1/webhook/atoms-accept     — Atoms 司機接單回傳（迴圈完成）
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { verifyApiKey } from "./apiKeys.js";
import { broadcastWebhook } from "./webhooks.js";
import { getOrderNotifyReceivers } from "../lib/line.js";
import { enqueueNotification } from "../lib/notificationQueue.js";
import * as line from "@line/bot-sdk";
import { calculateSettlement } from "../lib/settlementEngine.js";

export const webhookOrdersRouter = Router();

// ─── DB Migration: atoms_synced_at / atoms_accepted_at ─────────────────────
(async () => {
  try {
    await db.execute(sql`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS atoms_synced_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS atoms_accepted_at  TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS atoms_driver_name  TEXT,
        ADD COLUMN IF NOT EXISTS atoms_driver_phone TEXT,
        ADD COLUMN IF NOT EXISTS atoms_driver_id    TEXT
    `);
    console.log("[AtomsColumns] atoms_synced_at / atoms_accepted_at 欄位已確認");
  } catch (e) {
    console.warn("[AtomsColumns] migration warn:", String(e).slice(0, 200));
  }
})();

// ─── LINE：Atoms 接單通知推送管理者 ────────────────────────────────────────
async function sendAtomsAcceptedAlert(params: {
  orderId: number;
  driverName: string;
  driverPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  event: string;
}) {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
    if (!channelAccessToken) return;

    const receivers = await getOrderNotifyReceivers();
    const envId = process.env.LINE_COMPANY_USER_ID;
    const all = [...new Set([...receivers, ...(envId ? [envId] : [])])];
    if (!all.length) return;

    const isCompleted = /complet|finish|done|deliver/i.test(params.event);
    const headerColor = isCompleted ? "#16a34a" : "#2563eb";
    const headerText  = isCompleted ? "✅ Atoms 司機完成派送" : "✅ Atoms 司機已接單";

    const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

    const bubble: line.messagingApi.FlexBubble = {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        backgroundColor: headerColor, paddingAll: "md",
        contents: [
          { type: "text", text: headerText, weight: "bold", color: "#ffffff", size: "lg" },
          { type: "text", text: `訂單 #${params.orderId}`, color: "#e0f2fe", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "司機", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: params.driverName || "—", size: "sm", color: "#1e293b", weight: "bold", flex: 5 },
            ],
          },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "電話", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: params.driverPhone || "—", size: "sm", color: "#1e293b", flex: 5 },
            ],
          },
          { type: "separator", margin: "md" },
          {
            type: "box", layout: "horizontal", spacing: "sm", margin: "md",
            contents: [
              { type: "text", text: "取貨", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: params.pickupAddress || "—", size: "sm", color: "#1e293b", flex: 5, wrap: true },
            ],
          },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "送達", size: "sm", color: "#64748b", flex: 2 },
              { type: "text", text: params.deliveryAddress || "—", size: "sm", color: "#1e293b", flex: 5, wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "md",
        contents: [
          {
            type: "button", style: "primary", color: headerColor,
            action: {
              type: "uri",
              label: "查看訂單詳情",
              uri: `${process.env.APP_BASE_URL ?? ""}/orders/${params.orderId}`,
            },
          },
        ],
      },
    };

    const altText = `【Atoms 接單】訂單 #${params.orderId} 司機 ${params.driverName} 已接單`;
    for (const uid of all) {
      enqueueNotification(
        () => client.pushMessage({ to: uid, messages: [{ type: "flex", altText, contents: bubble }] }),
        `atomsAccept#${params.orderId}`,
      );
    }
  } catch (e) {
    console.warn("[AtomsAcceptAlert] LINE push failed:", String(e).slice(0, 200));
  }
}

// ─── LINE：Atoms 完成派送通知加盟主 ────────────────────────────────────────
async function sendFranchiseeCompletionAlert(params: {
  orderId: number;
  orderNo: string | null;
  franchiseeName: string;
  franchiseeLineId: string;
  driverName: string;
  pickupAddress: string;
  deliveryAddress: string;
  totalFreight: number;
  franchiseePayout: number;
}) {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
    if (!channelAccessToken || !params.franchiseeLineId) return;

    const NT = (n: number) => `NT$ ${n.toLocaleString()}`;
    const client = new line.messagingApi.MessagingApiClient({ channelAccessToken });

    const bubble: line.messagingApi.FlexBubble = {
      type: "bubble",
      header: {
        type: "box", layout: "vertical",
        backgroundColor: "#16a34a", paddingAll: "md",
        contents: [
          { type: "text", text: "✅ 訂單完成 — 運費已結算", weight: "bold", color: "#ffffff", size: "lg" },
          { type: "text", text: `訂單 ${params.orderNo ?? `#${params.orderId}`}`, color: "#bbf7d0", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "sm",
        contents: [
          { type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "司機", size: "sm", color: "#64748b", flex: 3 },
              { type: "text", text: params.driverName, size: "sm", color: "#1e293b", weight: "bold", flex: 7 },
            ] },
          { type: "separator", margin: "md" },
          { type: "box", layout: "horizontal", spacing: "sm", margin: "md",
            contents: [
              { type: "text", text: "取貨", size: "sm", color: "#64748b", flex: 3 },
              { type: "text", text: params.pickupAddress, size: "sm", color: "#1e293b", flex: 7, wrap: true },
            ] },
          { type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "text", text: "送達", size: "sm", color: "#64748b", flex: 3 },
              { type: "text", text: params.deliveryAddress, size: "sm", color: "#1e293b", flex: 7, wrap: true },
            ] },
          { type: "separator", margin: "md" },
          { type: "box", layout: "vertical", backgroundColor: "#f0fdf4", cornerRadius: "md", paddingAll: "md", margin: "md",
            contents: [
              { type: "box", layout: "horizontal", spacing: "sm",
                contents: [
                  { type: "text", text: "總運費", size: "sm", color: "#64748b", flex: 4 },
                  { type: "text", text: NT(params.totalFreight), size: "sm", color: "#1e293b", flex: 6, align: "end" },
                ] },
              { type: "box", layout: "horizontal", spacing: "sm", margin: "sm",
                contents: [
                  { type: "text", text: "您的分潤", size: "md", color: "#16a34a", weight: "bold", flex: 4 },
                  { type: "text", text: NT(params.franchiseePayout), size: "md", color: "#16a34a", weight: "bold", flex: 6, align: "end" },
                ] },
            ] },
        ],
      },
    };

    const altText = `【訂單完成】${params.orderNo ?? `#${params.orderId}`} 您的分潤 ${NT(params.franchiseePayout)}`;
    enqueueNotification(
      () => client.pushMessage({ to: params.franchiseeLineId, messages: [{ type: "flex", altText, contents: bubble }] }),
      `atomsComplete#${params.orderId}`,
    );
  } catch (e) {
    console.warn("[FranchiseeCompletionAlert] LINE push failed:", String(e).slice(0, 200));
  }
}

// ─── Field normaliser ─────────────────────────────────────────────────────
function normalise(body: Record<string, any>): Record<string, any> {
  const raw: Record<string, any> =
    body.event && body.data && typeof body.data === "object" ? body.data : body;

  return {
    externalOrderId:  String(raw.order_id ?? "").trim() || null,
    customerName:     String(raw.customer_name  ?? "").trim() || null,
    customerPhone:    String(raw.customer_phone ?? raw.contact_phone ?? "").trim() || null,
    pickupAddress:    String(raw.pickup_address  ?? raw.address ?? "").trim() || null,
    deliveryAddress:  String(raw.delivery_address ?? raw.address ?? "").trim() || null,
    cargoDescription: String(raw.cargo_description ?? raw.temp_type ?? "").trim() || null,
    isColdChain:      /冷凍|冷藏|cold/i.test(String(raw.temp_type ?? raw.cargo_description ?? "")),
    totalFee:         raw.total_fee != null ? Number(raw.total_fee) : null,
    notes:            buildNotes(raw),
    status:           raw.status ?? "pending",
    driverName:       raw.driver_name  ?? null,
    driverPhone:      raw.driver_phone ?? null,
    driverLicense:    raw.driver_license ?? null,
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

// ─── POST /v1/webhook/atoms-broadcast — 批次補發訂單給 Atoms ──────────────
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
    const atomsUrl = process.env.ATOMS_WEBHOOK_URL;
    if (!atomsUrl) {
      return res.status(503).json({ error: "ATOMS_WEBHOOK_URL 未設定" });
    }

    const now = new Date().toISOString();
    const CONCURRENCY = 3;
    const results: { order_id: number; ok: boolean; statusCode?: number; error?: string }[] = [];

    async function sendOne(o: any) {
      const payload = {
        order_id:          o.id,
        order_no:          o.order_no,
        status:            o.status,
        customer_name:     o.customer_name,
        customer_phone:    o.customer_phone,
        pickup_address:    o.pickup_address,
        pickup_date:       o.pickup_date,
        pickup_time:       o.pickup_time,
        delivery_address:  o.delivery_address,
        delivery_date:     o.delivery_date,
        delivery_time:     o.delivery_time,
        cargo_description: o.cargo_description,
        is_cold_chain:     o.is_cold_chain,
        total_fee:         o.total_fee,
        notes:             o.notes,
        driver_id:         o.driver_id    ?? null,
        driver_name:       o.driver_name  ?? null,
        driver_phone:      o.driver_phone ?? null,
        driver_license:    o.driver_license ?? null,
        driver_vehicle:    o.driver_vehicle ?? null,
        broadcast_at:      now,
        // Callback URL: tells Atoms where to send the acceptance notification
        callback_url: `${process.env.APP_BASE_URL ?? ""}/api/v1/webhook/atoms-accept`,
      };
      try {
        const r = await fetch(atomsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "order.assigned", timestamp: now, data: payload }),
          signal: AbortSignal.timeout(10000),
        });
        const ok = r.ok;
        // ── 成功發送 → 標記 atoms_synced_at ──
        if (ok) {
          db.execute(sql`
            UPDATE orders SET atoms_synced_at = NOW(), updated_at = NOW()
            WHERE id = ${o.id}
          `).catch(() => {});
        }
        return { order_id: o.id, ok, statusCode: r.status };
      } catch (err: any) {
        return { order_id: o.id, ok: false, error: err?.message ?? "error" };
      }
    }

    for (let i = 0; i < orders.length; i += CONCURRENCY) {
      const batch = orders.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(sendOne));
      results.push(...batchResults);
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

// ─── POST /v1/webhook/atoms-accept — Atoms 司機接單迴圈回傳 ──────────────
/**
 * Atoms 派單系統在司機接單（或完成派送）後，呼叫此端點回傳結果。
 *
 * 支援 payload 格式（兩種皆可）：
 *   1. 事件包裝：{ event, timestamp, data: { order_id, driver_name, ... } }
 *   2. 扁平：    { order_id, driver_name, driver_phone, atoms_driver_id, ... }
 *
 * 認證（選擇性）：
 *   - 若設定環境變數 ATOMS_CALLBACK_SECRET，要求 Header X-Atoms-Secret 相符
 *
 * 回傳事件（event 欄位）：
 *   - order.accepted / driver.accepted / accepted → 標記 atoms_accepted_at
 *   - order.completed / order.delivered / completed / delivered → 同上（視為完成）
 */
webhookOrdersRouter.post("/v1/webhook/atoms-accept", async (req, res) => {
  try {
    // ── 選擇性認證 ──
    const secret = process.env.ATOMS_CALLBACK_SECRET;
    if (secret) {
      const incoming = req.headers["x-atoms-secret"] as string | undefined;
      if (incoming !== secret) {
        return res.status(401).json({ error: "X-Atoms-Secret 驗證失敗" });
      }
    }

    // ── Unwrap payload ──
    const body = req.body ?? {};
    const raw: Record<string, any> =
      body.event && body.data && typeof body.data === "object" ? body.data : body;

    const event: string = (body.event ?? raw.event ?? "unknown").toLowerCase();

    // ── 取得訂單 ID ──
    const orderId = parseInt(String(raw.order_id ?? raw.orderId ?? ""), 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).json({ error: "缺少 order_id" });
    }

    // ── 取得 Atoms 司機資訊 ──
    const atomsDriverName  = String(raw.driver_name  ?? raw.driverName  ?? "").trim() || null;
    const atomsDriverPhone = String(raw.driver_phone ?? raw.driverPhone ?? "").trim() || null;
    const atomsDriverId    = String(raw.atoms_driver_id ?? raw.atomsDriverId ?? raw.driver_id ?? "").trim() || null;
    const acceptedAt       = raw.accepted_at ?? raw.acceptedAt ?? null;

    // ── 判斷事件類型 ──
    const isCompletion = /complet|finish|done|deliver/i.test(event);
    const isAccepted   = /accept|assign/i.test(event);

    // ── 查詢訂單 ──
    const orderRows = await db.execute(sql`
      SELECT id, status, pickup_address, delivery_address, customer_name,
             driver_id, total_fee, order_no, atoms_accepted_at
      FROM orders WHERE id = ${orderId} LIMIT 1
    `);
    if (!orderRows.rows.length) {
      return res.status(404).json({ error: `訂單 #${orderId} 不存在` });
    }
    const order = orderRows.rows[0] as any;

    // ── 更新 atoms 欄位（冪等：已有就不覆蓋，除非 force=true）──
    const force = body.force === true;
    if (!order.atoms_accepted_at || force || isCompletion) {
      await db.execute(sql`
        UPDATE orders
        SET atoms_accepted_at  = COALESCE(atoms_accepted_at, ${acceptedAt ? new Date(acceptedAt) : sql`NOW()`}),
            atoms_driver_name  = COALESCE(atoms_driver_name, ${atomsDriverName}),
            atoms_driver_phone = COALESCE(atoms_driver_phone, ${atomsDriverPhone}),
            atoms_driver_id    = COALESCE(atoms_driver_id, ${atomsDriverId}),
            atoms_synced_at    = COALESCE(atoms_synced_at, NOW()),
            updated_at         = NOW()
        WHERE id = ${orderId}
      `);

      // ── 若訂單仍是 pending 且是接單事件，切換為 assigned ──
      if (order.status === "pending" && isAccepted && !isCompletion) {
        await db.execute(sql`
          UPDATE orders SET status = 'assigned', updated_at = NOW()
          WHERE id = ${orderId} AND status = 'pending'
        `);
      }

      // ── 完成事件：標記 delivered + 自動結算 ──────────────────────────
      if (isCompletion) {
        // 1. 標記訂單為已完成
        await db.execute(sql`
          UPDATE orders
          SET status = 'delivered', completed_at = NOW(), updated_at = NOW()
          WHERE id = ${orderId} AND status != 'delivered'
        `);

        // 2. 找對應的平台司機（先用 atoms_driver_id 匹配 username，次用 driver_id）
        let driverId: number | null = order.driver_id ?? null;
        let franchiseeId: number | null = null;
        let franchiseeName: string | null = null;
        let franchiseeLineId: string | null = null;
        let driverName: string | null = atomsDriverName;

        if (atomsDriverId) {
          const driverMatch = await db.execute(sql`
            SELECT d.id, d.name, d.franchisee_id,
                   f.name AS franchisee_name, f.line_user_id AS franchisee_line_id
            FROM drivers d
            LEFT JOIN franchisees f ON f.id = d.franchisee_id
            WHERE d.username = ${atomsDriverId}
            LIMIT 1
          `);
          if (driverMatch.rows.length) {
            const dr = driverMatch.rows[0] as any;
            driverId      = dr.id;
            franchiseeId  = dr.franchisee_id ?? null;
            franchiseeName = dr.franchisee_name ?? null;
            franchiseeLineId = dr.franchisee_line_id ?? null;
            if (!driverName) driverName = dr.name;
          }
        }

        // fallback：用 order.driver_id 查加盟主
        if (driverId && !franchiseeId) {
          const drRows = await db.execute(sql`
            SELECT d.franchisee_id, f.name AS franchisee_name, f.line_user_id AS franchisee_line_id
            FROM drivers d
            LEFT JOIN franchisees f ON f.id = d.franchisee_id
            WHERE d.id = ${driverId}
            LIMIT 1
          `);
          if (drRows.rows.length) {
            const dr = drRows.rows[0] as any;
            franchiseeId   = dr.franchisee_id ?? null;
            franchiseeName = dr.franchisee_name ?? null;
            franchiseeLineId = dr.franchisee_line_id ?? null;
          }
        }

        // 3. 若找到司機 id，更新 order.driver_id
        if (driverId && !order.driver_id) {
          await db.execute(sql`
            UPDATE orders SET driver_id = ${driverId}, updated_at = NOW()
            WHERE id = ${orderId}
          `);
        }

        // 4. 計算結算金額並 upsert order_settlements
        const totalFreight = parseFloat(order.total_fee ?? "0");
        let settlementResult: any = null;
        if (totalFreight > 0) {
          // 讀費率設定
          const rateRows = await db.execute(sql`
            SELECT key, value FROM pricing_config
            WHERE key IN ('default_commission_rate','insurance_rate','other_fee_rate','other_fee_fixed')
          `);
          const rateMap: Record<string, number> = {};
          for (const r of rateRows.rows as any[]) rateMap[r.key] = parseFloat(r.value) || 0;
          const commissionRate = rateMap["default_commission_rate"] ?? 15;
          const insuranceRate  = rateMap["insurance_rate"]          ?? 1;
          const otherFeeRate   = rateMap["other_fee_rate"]          ?? 0.5;
          const otherFeeFixed  = rateMap["other_fee_fixed"]         ?? 0;

          settlementResult = calculateSettlement({ totalFreight, commissionRate, insuranceRate, otherFeeRate, otherFeeFixed });

          await db.execute(sql`
            INSERT INTO order_settlements (
              order_id, order_no, driver_id,
              total_amount, commission_rate,
              insurance_rate, insurance_fee,
              other_fee_rate, other_handling_fee,
              franchisee_id, franchisee_payout,
              franchisee_payment_status,
              payment_status, created_at, updated_at
            ) VALUES (
              ${orderId}, ${order.order_no ?? null}, ${driverId ?? null},
              ${settlementResult.totalFreight}, ${commissionRate},
              ${insuranceRate}, ${settlementResult.insuranceFee},
              ${otherFeeRate}, ${settlementResult.otherHandlingFee},
              ${franchiseeId ?? null}, ${settlementResult.franchiseePayout},
              'unpaid',
              'unpaid', NOW(), NOW()
            )
            ON CONFLICT (order_id) DO UPDATE SET
              total_amount           = EXCLUDED.total_amount,
              commission_rate        = EXCLUDED.commission_rate,
              insurance_rate         = EXCLUDED.insurance_rate,
              insurance_fee          = EXCLUDED.insurance_fee,
              other_fee_rate         = EXCLUDED.other_fee_rate,
              other_handling_fee     = EXCLUDED.other_handling_fee,
              franchisee_id          = EXCLUDED.franchisee_id,
              franchisee_payout      = EXCLUDED.franchisee_payout,
              updated_at             = NOW()
          `).catch(e => console.warn("[AtomsAccept] settlement upsert warn:", e?.message));

          console.log(`[AtomsAccept] 訂單 #${orderId} 完成結算：運費 ${totalFreight}，加盟主分潤 ${settlementResult.franchiseePayout}（${franchiseeName ?? "未綁定"}）`);
        }

        // 5. LINE 通知加盟主（若有 line_user_id）
        if (franchiseeLineId) {
          sendFranchiseeCompletionAlert({
            orderId,
            orderNo: order.order_no,
            franchiseeName: franchiseeName ?? "加盟主",
            franchiseeLineId,
            driverName: driverName ?? atomsDriverName ?? "Atoms 司機",
            pickupAddress:   order.pickup_address   ?? "—",
            deliveryAddress: order.delivery_address ?? "—",
            totalFreight,
            franchiseePayout: settlementResult?.franchiseePayout ?? 0,
          }).catch(() => {});
        }

        console.log(`[AtomsAccept] 訂單 #${orderId} Atoms 完成派送（event: ${event}）`);
      } else {
        console.log(`[AtomsAccept] 訂單 #${orderId} Atoms 司機 ${atomsDriverName ?? "—"} 接單成功（event: ${event}）`);
      }

      // ── LINE 通知管理者（接單與完成都通知）──
      sendAtomsAcceptedAlert({
        orderId,
        driverName:     atomsDriverName  ?? "Atoms 司機",
        driverPhone:    atomsDriverPhone ?? "—",
        pickupAddress:  order.pickup_address   ?? "—",
        deliveryAddress:order.delivery_address ?? "—",
        event,
      }).catch(() => {});
    } else {
      console.log(`[AtomsAccept] 訂單 #${orderId} 已有 atoms_accepted_at，略過（使用 force=true 強制覆蓋）`);
    }

    res.json({
      ok: true,
      order_id: orderId,
      atoms_driver_name: atomsDriverName,
      atoms_accepted_at: order.atoms_accepted_at ?? new Date().toISOString(),
      completed: isCompletion,
      message: isCompletion ? "訂單完成回傳已處理，結算記錄已建立" : "接單回傳已處理",
    });
  } catch (err: any) {
    console.error("[AtomsAccept] error:", err?.message ?? err);
    res.status(500).json({ error: "接單回傳處理失敗", detail: err?.message ?? "unknown" });
  }
});

// ─── POST /v1/webhook/orders ──────────────────────────────────────────────
webhookOrdersRouter.post(
  ["/v1/webhook/orders", "/v1/webhook/receive-order"],
  requireOrdersCreate,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const d = normalise(body);

      const missing: string[] = [];
      if (!d.customerName)    missing.push("customer_name");
      if (!d.customerPhone)   missing.push("customer_phone / contact_phone");
      if (!d.deliveryAddress) missing.push("delivery_address / address");
      if (missing.length) {
        return res.status(400).json({ error: "必填欄位缺少", missing });
      }

      const pickupAddress = d.pickupAddress || d.deliveryAddress;
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

      db.execute(sql`
        INSERT INTO api_usage_logs (api_key_id, endpoint, method, status_code, ip_address, latency_ms)
        VALUES (${req.apiKeyId}, '/v1/webhook/orders', 'POST', 201, ${req.ip ?? "unknown"}, 0)
      `).catch(() => {});

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
