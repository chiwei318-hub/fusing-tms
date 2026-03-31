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

export default router;
