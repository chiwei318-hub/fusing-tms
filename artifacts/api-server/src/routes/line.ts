import { Router, type IRouter } from "express";
import * as lineLib from "@line/bot-sdk";
import { db, ordersTable, customersTable, driversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  replyTextMessage,
  isLineConfigured,
  sendPaymentReminder,
} from "../lib/line.js";

const router: IRouter = Router();

/* ──────────────────────────────────────
   LINE Webhook (postback + message)
────────────────────────────────────── */
router.post(
  "/line/webhook",
  (req, _res, next) => {
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";
    if (!channelSecret) { next(); return; }
    lineLib.middleware({ channelSecret })(req, _res, next);
  },
  async (req, res) => {
    res.sendStatus(200);
    const events: lineLib.WebhookEvent[] = req.body?.events ?? [];

    for (const event of events) {
      /* ── postback: 司機接單/拒單 ── */
      if (event.type === "postback") {
        const data = new URLSearchParams(event.postback.data);
        const action = data.get("action");
        const orderIdStr = data.get("orderId");
        if (!action || !orderIdStr) continue;
        const orderId = parseInt(orderIdStr, 10);
        if (isNaN(orderId)) continue;
        try {
          const existing = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
          if (!existing.length) continue;
          const now = new Date();
          if (action === "accept") {
            await db.update(ordersTable).set({ status: "assigned", driverAcceptedAt: now, updatedAt: now }).where(eq(ordersTable.id, orderId));
          } else if (action === "reject") {
            await db.update(ordersTable).set({ driverId: null, status: "pending", updatedAt: now }).where(eq(ordersTable.id, orderId));
          }
        } catch (err) {
          console.error(`Failed to process LINE postback for order ${orderId}:`, err);
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
          await replyTextMessage(replyToken, "富詠運輸 LINE 服務\n\n📌 可用指令：\n・綁定 [電話] — 綁定您的帳號\n・查詢 [訂單號碼] — 查詢訂單狀態\n\n需要協助請聯絡客服。");
        }
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

export default router;
