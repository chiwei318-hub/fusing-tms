import { Router, type IRouter } from "express";
import crypto from "crypto";
import * as lineLib from "@line/bot-sdk";
import { db, ordersTable, customersTable, driversTable } from "@workspace/db";
import { lineAccountsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  replyTextMessage,
  replyMessages,
  isLineConfigured,
  sendPaymentReminder,
  sendRejectAlertToCompany,
  getOrderNotifyReceivers,
  pushArrivedFlexToDriver,
  pushDeliveryCompletedFlex,
} from "../lib/line.js";

const router: IRouter = Router();

function verifyLineSignature(rawBody: Buffer, signature: string, channelSecret: string): boolean {
  try {
    const hash = crypto.createHmac("SHA256", channelSecret).update(rawBody).digest("base64");
    return hash === signature;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────
   LINE Webhook (postback + message)
────────────────────────────────────── */
router.post("/line/webhook", async (req, res) => {
    // LINE requires 200 response immediately
    res.sendStatus(200);

    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
    const rawBody = req.body as Buffer;
    const signature = req.headers["x-line-signature"] as string | undefined;

    // Validate signature if both are available
    if (channelSecret && signature) {
      if (!verifyLineSignature(rawBody, signature, channelSecret)) {
        console.warn("[LINE webhook] ⚠ Signature mismatch — request rejected");
        return;
      }
    } else if (channelSecret && !signature) {
      console.warn("[LINE webhook] ⚠ No X-Line-Signature header received");
    }

    let parsed: { events?: lineLib.WebhookEvent[] };
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      console.error("[LINE webhook] ✗ Failed to parse body:", err);
      return;
    }

    const events: lineLib.WebhookEvent[] = parsed?.events ?? [];
    console.log(`[LINE webhook] ✓ Received ${events.length} event(s)`);

    for (const event of events) {
      /* ── postback: 司機接單/拒單 ── */
      if (event.type === "postback") {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get("action");
        const orderIdStr = data.get("orderId");
        const replyToken = event.replyToken;
        if (!action || !orderIdStr) continue;
        const orderId = parseInt(orderIdStr, 10);
        if (isNaN(orderId)) continue;
        try {
          const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
          if (!order) {
            await replyTextMessage(replyToken, `❌ 找不到訂單 #${orderId}，可能已被取消或異動。`);
            continue;
          }
          const now = new Date();

          if (action === "accept") {
            // 防止重複接單
            if (order.driverAcceptedAt) {
              await replyTextMessage(replyToken, `ℹ️ 訂單 #${orderId} 您已確認過接單，無需重複操作。`);
              continue;
            }
            await db.update(ordersTable).set({ status: "assigned", driverAcceptedAt: now, updatedAt: now }).where(eq(ordersTable.id, orderId));

            // 取貨時間格式化
            const pickupTimeStr = order.pickupTime
              ? new Date(order.pickupTime).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "待確認";

            await replyMessages(replyToken, [
              {
                type: "text",
                text: [
                  `✅ 接單成功！訂單 #${orderId}`,
                  ``,
                  `📦 貨物：${order.cargoDescription || "—"}`,
                  `📍 取貨：${order.pickupAddress}`,
                  `🏁 送達：${order.deliveryAddress}`,
                  `🕐 取貨時間：${pickupTimeStr}`,
                  ``,
                  `請準時前往取貨，祝行車順利！`,
                ].join("\n"),
              },
            ]);
            console.log(`[LINE postback] ✓ Driver accepted order #${orderId}`);

          } else if (action === "reject") {
            // 取得司機名稱
            let driverName = "（司機）";
            if (order.driverId) {
              const [driver] = await db.select().from(driversTable).where(eq(driversTable.id, order.driverId)).limit(1);
              if (driver) driverName = driver.name;
            }

            await db.update(ordersTable).set({ driverId: null, status: "pending", updatedAt: now }).where(eq(ordersTable.id, orderId));

            // 回覆司機
            await replyTextMessage(replyToken, `已收到您的拒單，訂單 #${orderId} 將由系統重新安排司機。感謝告知！`);

            // 通知公司拒單
            await sendRejectAlertToCompany(
              {
                id: orderId,
                pickupAddress: order.pickupAddress,
                deliveryAddress: order.deliveryAddress,
                cargoDescription: order.cargoDescription || "—",
                customerName: order.customerName || "—",
                customerPhone: order.customerPhone ?? undefined,
              },
              driverName,
            );
            console.log(`[LINE postback] ✓ Driver rejected order #${orderId}, company notified`);

          } else if (action === "arrive") {
            /* ── 司機抵達取貨地 ── */
            if (order.status === "delivered") {
              await replyTextMessage(replyToken, `ℹ️ 訂單 #${orderId} 已完成，無需重複操作。`);
              continue;
            }
            await db.update(ordersTable).set({ status: "in_transit", updatedAt: now }).where(eq(ordersTable.id, orderId));
            await replyTextMessage(replyToken, `✅ 已記錄抵達！訂單 #${orderId} 狀態更新為「配送中」。\n\n請將貨物裝載後，完成配送並拍照上傳簽收單。`);

            // 推送含完成按鈕的 Flex 訊息（非同步，不影響回覆時效）
            const driverLineId = event.source.userId;
            if (driverLineId) {
              pushArrivedFlexToDriver(driverLineId, {
                id: orderId,
                pickupAddress: order.pickupAddress,
                deliveryAddress: order.deliveryAddress,
                cargoDescription: order.cargoDescription || "—",
                customerName: order.customerName || "—",
                customerPhone: order.customerPhone ?? undefined,
              }).catch(() => {});
            }
            console.log(`[LINE postback] ✓ Driver arrived for order #${orderId}`);

          } else if (action === "complete") {
            /* ── 司機完成配送 ── */
            if (order.status === "delivered") {
              await replyTextMessage(replyToken, `ℹ️ 訂單 #${orderId} 已完成，無需重複操作。`);
              continue;
            }
            await db.update(ordersTable).set({ status: "delivered", updatedAt: now }).where(eq(ordersTable.id, orderId));

            // 授予信用積分 +5（按時完成）
            let creditChange = 5;
            let newScore = 100;
            if (order.driverId) {
              const creditResult = await db.execute(sql`
                UPDATE drivers
                SET credit_score = LEAST(150, COALESCE(credit_score, 100) + ${creditChange})
                WHERE id = ${order.driverId}
                RETURNING credit_score
              `);
              newScore = (creditResult.rows[0] as any)?.credit_score ?? 100;
              // 寫入積分歷史
              await db.execute(sql`
                INSERT INTO driver_credit_history (driver_id, order_id, change, reason, score_after, created_at)
                VALUES (${order.driverId}, ${orderId}, ${creditChange}, '按時完成配送', ${newScore}, NOW())
              `).catch(() => {});
            }

            await replyTextMessage(replyToken, `🎉 配送完成！訂單 #${orderId} 已結單。\n\n積分 +${creditChange}，目前共 ${newScore} 分。\n\n請上傳簽收單照片以獲得額外 +2 積分！`);

            // 推送完成 Flex（非同步）
            const driverLineId2 = event.source.userId;
            if (driverLineId2) {
              pushDeliveryCompletedFlex(driverLineId2, {
                id: orderId,
                pickupAddress: order.pickupAddress,
                deliveryAddress: order.deliveryAddress,
                cargoDescription: order.cargoDescription || "—",
                customerName: order.customerName || "—",
                customerPhone: order.customerPhone ?? undefined,
              }, creditChange, newScore).catch(() => {});
            }
            console.log(`[LINE postback] ✓ Driver completed order #${orderId}, credit +${creditChange}`);
          }
        } catch (err) {
          console.error(`Failed to process LINE postback for order ${orderId}:`, err);
          try { await replyTextMessage(replyToken, "系統處理中發生錯誤，請稍後再試或聯繫管理員。"); } catch {}
        }
        continue;
      }

      /* ── text message: 電話綁定 ── */
      if (event.type === "message" && event.message.type === "text") {
        const userId = event.source.userId;
        const text = event.message.text.trim();
        const replyToken = event.replyToken;
        if (!userId) continue;

        // 格式：「綁定 0912345678」或「綁定0912345678」
        const bindMatch = text.match(/^綁定\s*([0-9]{8,12})$/);
        if (bindMatch) {
          const phone = bindMatch[1];
          try {
            const customers = await db
              .select()
              .from(customersTable)
              .where(eq(customersTable.phone, phone))
              .limit(1);

            if (customers.length) {
              await db.update(customersTable).set({
                lineUserId: userId,
                lineLinkedAt: new Date(),
              }).where(eq(customersTable.phone, phone));
              await replyTextMessage(replyToken, `✅ 綁定成功！\n已將 ${phone} 與您的 LINE 帳號連結。\n\n之後派車通知、訂單狀態、付款提醒都會自動發送到這裡。`);
            } else {
              // 嘗試綁定司機
              const drivers = await db
                .select()
                .from(driversTable)
                .where(eq(driversTable.phone, phone))
                .limit(1);
              if (drivers.length) {
                await db.update(driversTable).set({ lineUserId: userId }).where(eq(driversTable.phone, phone));
                await replyTextMessage(replyToken, `✅ 司機帳號綁定成功！\n已將 ${phone} 與您的 LINE 帳號連結。\n\n之後派車通知都會自動發送到這裡，您可以直接在 LINE 上接單或拒單。`);
              } else {
                await replyTextMessage(replyToken, `❌ 找不到電話 ${phone} 的帳號。\n\n請確認電話號碼是否正確，或聯繫客服協助綁定。`);
              }
            }
          } catch (err) {
            console.error("LINE binding error:", err);
            await replyTextMessage(replyToken, "系統處理中，請稍後再試。");
          }
          continue;
        }

        // 查詢訂單
        const queryMatch = text.match(/^查詢\s*([0-9]+)$/);
        if (queryMatch) {
          const orderId = parseInt(queryMatch[1], 10);
          try {
            const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
            if (order) {
              const statusMap: Record<string, string> = {
                pending: "⏳ 待派車",
                assigned: "✅ 已派車",
                in_transit: "🚚 運送中",
                delivered: "🎉 已完成",
                cancelled: "❌ 已取消",
              };
              await replyTextMessage(replyToken, `📦 訂單 #${orderId}\n狀態：${statusMap[order.status] ?? order.status}\n取貨：${order.pickupAddress}\n送達：${order.deliveryAddress}`);
            } else {
              await replyTextMessage(replyToken, `找不到訂單 #${orderId}，請確認訂單編號。`);
            }
          } catch {
            await replyTextMessage(replyToken, "查詢失敗，請稍後再試。");
          }
          continue;
        }

        // 說明訊息
        if (text === "help" || text === "說明" || text === "指令") {
          await replyTextMessage(replyToken, [
            "富詠運輸 LINE 服務 🚚",
            "",
            "📌 可用指令：",
            "・綁定 [電話] — 綁定您的帳號",
            "・查詢 [訂單號碼] — 查詢訂單狀態",
            "",
            "📦 司機操作（點擊派車通知中的按鈕）：",
            "・✅ 接單 — 確認接受訂單",
            "・❌ 拒單 — 拒絕訂單",
            "・📍 抵達 — 標記已抵達取貨地",
            "・🏁 完成配送 — 配送完成",
            "・📷 上傳照片 — 傳送簽收單即可自動記錄 POD",
            "",
            "💡 積分說明：",
            "・按時完成 +5 分，上傳簽收單 +2 分",
            "・積分高者優先取得高單價急單",
            "",
            "需要協助請聯絡客服。",
          ].join("\n"));
        }
      }

      /* ── image message: POD 簽收單辨識 ── */
      if (event.type === "message" && event.message.type === "image") {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        if (!userId) continue;

        // 找到此司機的 in_transit 訂單
        const driverRows = await db.select().from(driversTable).where(eq(driversTable.lineUserId as any, userId)).limit(1);
        const driver = driverRows[0];
        if (!driver) {
          await replyTextMessage(replyToken, "❌ 找不到綁定帳號，請先發送「綁定 [電話]」進行綁定。");
          continue;
        }

        // 找正在配送中的訂單
        const activeOrders = await db.execute(sql`
          SELECT id, pickup_address, delivery_address, cargo_description, customer_name, status
          FROM orders
          WHERE driver_id = ${driver.id}
            AND status IN ('assigned', 'in_transit')
          ORDER BY updated_at DESC
          LIMIT 1
        `);
        const activeOrder = (activeOrders.rows[0] as any);

        if (!activeOrder) {
          await replyTextMessage(replyToken, "ℹ️ 目前沒有進行中的訂單，感謝上傳。");
          continue;
        }

        const orderId = activeOrder.id;

        // 儲存 POD 記錄（notes 欄位追加）
        await db.execute(sql`
          UPDATE orders
          SET notes = CONCAT(COALESCE(notes, ''), '\n[POD] LINE圖片已上傳 ', TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI')),
              updated_at = NOW()
          WHERE id = ${orderId}
        `);

        // POD 積分 +2
        let podScore = 100;
        const podResult = await db.execute(sql`
          UPDATE drivers
          SET credit_score = LEAST(150, COALESCE(credit_score, 100) + 2)
          WHERE id = ${driver.id}
          RETURNING credit_score
        `);
        podScore = (podResult.rows[0] as any)?.credit_score ?? 100;

        await db.execute(sql`
          INSERT INTO driver_credit_history (driver_id, order_id, change, reason, score_after, created_at)
          VALUES (${driver.id}, ${orderId}, 2, 'POD 簽收單上傳', ${podScore}, NOW())
        `).catch(() => {});

        await replyTextMessage(replyToken, `✅ 簽收單已記錄！訂單 #${orderId} POD 上傳成功。\n\n積分 +2，目前共 ${podScore} 分。感謝您的配合！`);
        console.log(`[LINE image] ✓ POD photo received for order #${orderId} from driver ${driver.id}`);
      }
    }
  }
);

/* ──────────────────────────────────────
   LINE 管理 API
────────────────────────────────────── */

// LINE 設定狀態
router.get("/line/status", (_req, res) => {
  res.json({
    configured: isLineConfigured(),
    hasCompanyUserId: !!process.env.LINE_COMPANY_USER_ID,
    hasAppBaseUrl: !!process.env.APP_BASE_URL,
  });
});

// 已綁定客戶列表
router.get("/line/bindings/customers", async (_req, res) => {
  try {
    const customers = await db
      .select()
      .from(customersTable)
      .orderBy(customersTable.lineLinkedAt);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bindings" });
  }
});

// 解除客戶綁定
router.delete("/line/bindings/customers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(customersTable).set({ lineUserId: null, lineLinkedAt: null }).where(eq(customersTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to unbind" });
  }
});

// 已綁定司機列表
router.get("/line/bindings/drivers", async (_req, res) => {
  try {
    const drivers = await db.select().from(driversTable).orderBy(driversTable.createdAt);
    res.json(drivers);
  } catch {
    res.status(500).json({ error: "Failed to fetch driver bindings" });
  }
});

// 手動設定司機 LINE User ID
router.patch("/line/bindings/drivers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { lineUserId } = req.body as { lineUserId: string };
    if (!lineUserId || typeof lineUserId !== "string") {
      return res.status(400).json({ error: "lineUserId is required" });
    }
    await db.update(driversTable).set({ lineUserId: lineUserId.trim() }).where(eq(driversTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to set driver LINE ID" });
  }
});

// 解除司機綁定
router.delete("/line/bindings/drivers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.update(driversTable).set({ lineUserId: null }).where(eq(driversTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to unbind driver" });
  }
});

// 手動發送付款提醒
router.post("/line/send-payment-reminder/:orderId", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!order.customerPhone) return res.status(400).json({ error: "No customer phone" });

    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, order.customerPhone))
      .limit(1);

    const customer = customers[0];
    if (!customer?.lineUserId) return res.status(400).json({ error: "Customer LINE not bound" });

    const amountDue = (order.totalFee ?? 0);
    await sendPaymentReminder(customer.lineUserId, orderId, amountDue);

    await db.update(ordersTable).set({ updatedAt: new Date() }).where(eq(ordersTable.id, orderId));

    res.json({ ok: true, sentTo: customer.lineUserId });
  } catch (err) {
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

/* ─── Admin: LINE Notification Receiver Management ─── */

/** GET /api/line/receivers — list all LINE accounts with notify flag */
router.get("/line/receivers", async (_req, res) => {
  try {
    const currentIds = await getOrderNotifyReceivers();
    const envId = process.env.LINE_COMPANY_USER_ID;
    const allReceiverIds = new Set([...currentIds, ...(envId ? [envId] : [])]);

    const accounts = await db.select().from(lineAccountsTable);
    const result = accounts.map(a => ({
      lineUserId: a.lineUserId,
      displayName: a.displayName,
      pictureUrl: a.pictureUrl,
      userType: a.userType,
      userRefId: a.userRefId,
      createdAt: a.createdAt,
      isReceiver: allReceiverIds.has(a.lineUserId),
    }));

    // Also include env-only receiver if not in lineAccountsTable
    if (envId && !accounts.find(a => a.lineUserId === envId)) {
      result.unshift({
        lineUserId: envId,
        displayName: "(env 設定)",
        pictureUrl: null,
        userType: "admin",
        userRefId: "env",
        createdAt: new Date(),
        isReceiver: true,
      } as any);
    }

    res.json({ receivers: [...allReceiverIds], accounts: result });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** POST /api/line/receivers — add a LINE user ID as receiver */
router.post("/line/receivers", async (req, res) => {
  try {
    const { lineUserId } = req.body as { lineUserId: string };
    if (!lineUserId) return res.status(400).json({ error: "lineUserId required" });

    const current = await getOrderNotifyReceivers();
    if (!current.includes(lineUserId)) {
      const updated = [...current, lineUserId];
      await db.execute(sql`
        INSERT INTO pricing_config (key, value, label, updated_at)
        VALUES ('line_notify_ids', ${JSON.stringify(updated)}, 'LINE訂單通知接收者', NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(updated)}, updated_at = NOW()
      `);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** DELETE /api/line/receivers/:lineUserId — remove a LINE user ID from receivers */
router.delete("/line/receivers/:lineUserId", async (req, res) => {
  try {
    const { lineUserId } = req.params;
    const current = await getOrderNotifyReceivers();
    const updated = current.filter(id => id !== lineUserId);
    await db.execute(sql`
      INSERT INTO pricing_config (key, value, label, updated_at)
      VALUES ('line_notify_ids', ${JSON.stringify(updated)}, 'LINE訂單通知接收者', NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(updated)}, updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/* ──────────────────────────────────────
   司機信用積分管理 API
────────────────────────────────────── */

// DB 初始化：確保信用積分欄位與歷史表存在
export async function ensureCreditSchema(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS credit_score INTEGER DEFAULT 100
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS driver_credit_history (
        id SERIAL PRIMARY KEY,
        driver_id INTEGER NOT NULL REFERENCES drivers(id),
        order_id INTEGER,
        change INTEGER NOT NULL,
        reason TEXT,
        score_after INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[DriverCredit] schema ensured");
  } catch (err) {
    console.error("[DriverCredit] schema error:", err);
  }
}

// 列出所有司機信用積分（可用於排行榜）
router.get("/drivers/credit", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT
        d.id, d.name, d.phone, d.vehicle_type, d.license_plate, d.status,
        COALESCE(d.credit_score, 100) AS credit_score,
        d.rating, d.rating_count,
        COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
        COUNT(o.id) FILTER (WHERE o.status IN ('assigned','in_transit','delivered')) AS total_assigned
      FROM drivers d
      LEFT JOIN orders o ON o.driver_id = d.id
      WHERE d.is_blacklisted IS NOT TRUE
      GROUP BY d.id
      ORDER BY credit_score DESC, d.name ASC
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 取得單一司機積分歷史
router.get("/drivers/:id/credit-history", async (req, res) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    const rows = await db.execute(sql`
      SELECT
        h.id, h.change, h.reason, h.score_after, h.created_at,
        o.pickup_address, o.delivery_address
      FROM driver_credit_history h
      LEFT JOIN orders o ON o.id = h.order_id
      WHERE h.driver_id = ${driverId}
      ORDER BY h.created_at DESC
      LIMIT 50
    `);
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 管理員手動調整積分
router.patch("/drivers/:id/credit", async (req, res) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    const { change, reason } = req.body as { change: number; reason?: string };
    if (typeof change !== "number" || isNaN(change)) {
      return res.status(400).json({ error: "change 必須為整數" });
    }
    const result = await db.execute(sql`
      UPDATE drivers
      SET credit_score = GREATEST(0, LEAST(150, COALESCE(credit_score, 100) + ${change}))
      WHERE id = ${driverId}
      RETURNING credit_score
    `);
    const newScore = (result.rows[0] as any)?.credit_score ?? 100;
    await db.execute(sql`
      INSERT INTO driver_credit_history (driver_id, order_id, change, reason, score_after, created_at)
      VALUES (${driverId}, NULL, ${change}, ${reason ?? "管理員手動調整"}, ${newScore}, NOW())
    `).catch(() => {});
    res.json({ ok: true, newScore });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
