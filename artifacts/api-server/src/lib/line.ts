import * as line from "@line/bot-sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { enqueueNotification } from "./notificationQueue";

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

/** Query all LINE user IDs that should receive company order notifications */
export async function getOrderNotifyReceivers(): Promise<string[]> {
  try {
    const rows = await db.execute(
      sql`SELECT value FROM pricing_config WHERE key = 'line_notify_ids' LIMIT 1`
    );
    const row = (rows.rows as any[])[0];
    if (!row?.value) return [];
    const ids: string[] = JSON.parse(row.value);
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

let client: line.messagingApi.MessagingApiClient | null = null;

function getClient(): line.messagingApi.MessagingApiClient {
  if (!client) {
    client = new line.messagingApi.MessagingApiClient({ channelAccessToken });
  }
  return client;
}

export function getLineMiddleware() {
  return line.middleware({ channelSecret });
}

export function isLineConfigured(): boolean {
  return !!channelAccessToken && !!channelSecret;
}

/**
 * 向 LINE API 查詢使用者顯示名稱
 * 使用 Channel Access Token（bot token），不需要使用者授權
 * 回傳 null 代表查詢失敗（例如 token 未設定、使用者封鎖 bot）
 */
export async function getLineUserProfile(userId: string): Promise<{ displayName: string; pictureUrl?: string } | null> {
  if (!channelAccessToken) return null;
  try {
    const resp = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${channelAccessToken}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { displayName: string; pictureUrl?: string };
    return data;
  } catch {
    return null;
  }
}

async function pushFlex(to: string, altText: string, bubble: line.messagingApi.FlexBubble) {
  if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  const msg: line.messagingApi.FlexMessage = { type: "flex", altText, contents: bubble };
  try {
    await getClient().pushMessage({ to, messages: [msg] });
  } catch (err: any) {
    // 盡量取出 LINE API 原始錯誤 body
    let detail: string;
    try {
      const respText = err?.originalError?.response
        ? await err.originalError.response.text?.()
        : null;
      detail = respText ?? err?.originalError?.message ?? err?.statusCode ?? String(err);
    } catch {
      detail = String(err);
    }
    console.error(`[LINE pushFlex] ✗ 推播失敗 to=${to.slice(-6)} status=${err?.statusCode ?? "?"}: ${detail}`);
    throw err;
  }
}

function row(label: string, value: string): line.messagingApi.FlexBox {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      { type: "text", text: label, color: "#64748b", size: "sm", flex: 2 },
      { type: "text", text: value || "—", wrap: true, color: "#1e293b", size: "sm", flex: 5 },
    ],
  };
}

export interface OrderInfo {
  id: number;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription: string;
  customerName: string;
  customerPhone?: string;
}

export interface DriverInfo {
  name: string;
  phone: string;
  licensePlate: string;
  vehicleType?: string;
}

/* ─── 1. 派車通知 → 司機 ─── */
export async function sendDispatchNotification(lineUserId: string, order: OrderInfo): Promise<void> {
  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const driverTaskUrl = appBaseUrl.startsWith("http") ? `${appBaseUrl}/driver/orders` : "";

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "派車通知", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#2563EB",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `訂單 #${order.id}`, weight: "bold", size: "xl", color: "#1e293b" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("客戶", order.customerName),
            row("取貨", order.pickupAddress),
            row("送達", order.deliveryAddress),
            row("貨物", order.cargoDescription),
          ],
        },
      ],
      paddingAll: "md",
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "md",
      contents: [
        {
          type: "button", style: "primary", color: "#16a34a",
          action: { type: "postback", label: "接單", data: `action=accept&orderId=${order.id}`, displayText: "已接單" },
        },
        {
          type: "button", style: "secondary",
          action: { type: "postback", label: "拒單", data: `action=reject&orderId=${order.id}`, displayText: "已拒單" },
        },
        ...(driverTaskUrl ? [{
          type: "button" as const, style: "link" as const,
          action: { type: "uri" as const, label: "前往任務頁", uri: driverTaskUrl },
        }] : []),
      ],
    },
  };

  await pushFlex(lineUserId, `【派車通知】訂單 #${order.id} 已指派給您`, bubble);
}

/* ─── 2. 新訂單提醒 → 公司（所有已設定接收者） ─── */
export async function sendNewOrderAlertToCompany(order: OrderInfo): Promise<void> {
  // Collect all receiver IDs: DB-stored list + legacy env var
  const dbReceivers = await getOrderNotifyReceivers();
  const envId = process.env.LINE_COMPANY_USER_ID;
  const all = [...new Set([...dbReceivers, ...(envId ? [envId] : [])])];
  if (all.length === 0) return;

  // Use first valid receiver to check access token (existing guard)
  const companyUserId = all[0];

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "🚚 新訂單", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#f97316",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `訂單 #${order.id}`, weight: "bold", size: "xl", color: "#1e293b" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("客戶", order.customerName),
            row("電話", order.customerPhone ?? "—"),
            row("取貨", order.pickupAddress),
            row("送達", order.deliveryAddress),
            row("貨物", order.cargoDescription),
          ],
        },
      ],
      paddingAll: "md",
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "button", style: "primary", color: "#f97316",
          action: { type: "uri", label: "前往後台派車", uri: `${process.env.APP_BASE_URL ?? ""}/admin` },
        },
      ],
    },
  };

  // 非阻塞推播：加入通知佇列，不等待回應
  const altText = `【新訂單】#${order.id} ${order.customerName} 已下單`;
  for (const uid of all) {
    enqueueNotification(() => pushFlex(uid, altText, bubble), `newOrder#${order.id}`);
  }
}

/* ─── 3. 派車成功 → 客戶（含司機/車牌/時間） ─── */
export async function sendCustomerDispatch(
  lineUserId: string,
  order: OrderInfo,
  driver: DriverInfo,
): Promise<void> {
  const now = new Date();
  const eta = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 預計到達`;

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "✅ 司機已派出", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#16a34a",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `您的訂單 #${order.id} 已安排司機`, size: "sm", color: "#64748b", wrap: true },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("司機", driver.name),
            row("電話", driver.phone),
            row("車牌", driver.licensePlate),
            ...(driver.vehicleType ? [row("車型", driver.vehicleType)] : []),
            row("預計", eta),
          ],
        },
      ],
      paddingAll: "md",
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "button", style: "link",
          action: { type: "uri", label: "📞 聯絡司機", uri: `tel:${driver.phone}` },
        },
      ],
    },
  };

  await pushFlex(lineUserId, `【派車成功】司機 ${driver.name}（${driver.licensePlate}）已出發`, bubble);
}

/* ─── 4. 狀態更新 → 客戶（到達 / 完成） ─── */
export async function sendCustomerStatusUpdate(
  lineUserId: string,
  orderId: number,
  status: "in_transit" | "delivered",
): Promise<void> {
  const isDelivered = status === "delivered";
  const title = isDelivered ? "🎉 訂單完成" : "🚚 司機已到達";
  const body = isDelivered
    ? `訂單 #${orderId} 已完成交貨，感謝您使用富詠運輸！`
    : `訂單 #${orderId} 司機已抵達取貨地點，請準備貨物。`;
  const color = isDelivered ? "#2563EB" : "#0891b2";

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: title, weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: color,
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        { type: "text", text: body, wrap: true, color: "#1e293b", size: "sm" },
      ],
    },
    ...(isDelivered ? {
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "md",
        contents: [{
          type: "button", style: "link",
          action: { type: "uri", label: "查看訂單紀錄", uri: `${process.env.APP_BASE_URL ?? ""}/customer/orders` },
        }],
      },
    } : {}),
  };

  await pushFlex(lineUserId, isDelivered ? `【完成】訂單 #${orderId} 已完成` : `【到達】司機已抵達 訂單 #${orderId}`, bubble);
}

/* ─── 5. 付款提醒 → 客戶 ─── */
export async function sendPaymentReminder(
  lineUserId: string,
  orderId: number,
  amountDue: number,
): Promise<void> {
  const nt = (n: number) => `NT$${n.toLocaleString()}`;

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "💳 付款提醒", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#dc2626",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        { type: "text", text: `訂單 #${orderId} 尚有款項未付`, wrap: true, color: "#1e293b", weight: "bold" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [row("未付金額", nt(amountDue))],
        },
        { type: "text", text: "請盡快完成付款，謝謝您的配合。", wrap: true, color: "#64748b", size: "sm", margin: "md" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [{
        type: "button", style: "primary", color: "#dc2626",
        action: { type: "uri", label: "查看帳單", uri: `${process.env.APP_BASE_URL ?? ""}/customer/orders` },
      }],
    },
  };

  await pushFlex(lineUserId, `【付款提醒】訂單 #${orderId} 未付 ${nt(amountDue)}`, bubble);
}

/* ─── 6. 拒單提醒 → 公司（所有已設定接收者） ─── */
export async function sendRejectAlertToCompany(order: OrderInfo, driverName: string): Promise<void> {
  const dbReceivers = await getOrderNotifyReceivers();
  const envId = process.env.LINE_COMPANY_USER_ID;
  const all = [...new Set([...dbReceivers, ...(envId ? [envId] : [])])];
  if (all.length === 0) return;
  const companyUserId = all[0];

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "⚠️ 司機拒單", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#dc2626",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        { type: "text", text: `訂單 #${order.id} 被拒單`, weight: "bold", size: "xl", color: "#1e293b" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("司機", driverName),
            row("客戶", order.customerName),
            row("取貨", order.pickupAddress),
            row("送達", order.deliveryAddress),
          ],
        },
        {
          type: "text",
          text: "⚡ 訂單已退回待派車，請盡快重新安排！",
          wrap: true,
          color: "#dc2626",
          size: "sm",
          margin: "md",
          weight: "bold",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [{
        type: "button", style: "primary", color: "#dc2626",
        action: { type: "uri", label: "前往後台重新派車", uri: `${process.env.APP_BASE_URL ?? ""}/admin` },
      }],
    },
  };

  const altText = `【拒單警告】司機 ${driverName} 拒絕訂單 #${order.id}`;
  for (const uid of all) {
    enqueueNotification(() => pushFlex(uid, altText, bubble), `reject#${order.id}`);
  }
}

/* ─── 7. 發票通知（推播給客戶） ─── */
export async function sendInvoiceNotification(
  lineUserId: string,
  info: { invoiceNumber: string; orderId: number; buyerName: string; totalAmount: number; taxAmount: number }
): Promise<void> {
  if (!channelAccessToken) return;
  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1e40af",
      paddingAll: "md",
      contents: [
        { type: "text", text: "📄 電子發票開立通知", color: "#ffffff", size: "md", weight: "bold" },
        { type: "text", text: "富詠運輸", color: "#93c5fd", size: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "md",
      contents: [
        row("發票號碼", info.invoiceNumber),
        row("買　　方", info.buyerName),
        row("訂單編號", `#${info.orderId}`),
        { type: "separator" },
        row("未稅金額", `NT$${(info.totalAmount - info.taxAmount).toLocaleString()}`),
        row("稅　　額", `NT$${info.taxAmount.toLocaleString()}`),
        {
          type: "box", layout: "baseline", spacing: "sm",
          contents: [
            { type: "text", text: "含稅合計", color: "#64748b", size: "sm", flex: 2 },
            { type: "text", text: `NT$${info.totalAmount.toLocaleString()}`, wrap: true, color: "#1e40af", size: "lg", flex: 5, weight: "bold" },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "md",
      contents: [{
        type: "text",
        text: "如有疑問請聯絡客服，感謝您的使用！",
        color: "#94a3b8", size: "xs", wrap: true, align: "center",
      }],
    },
  };
  await pushFlex(lineUserId, `【富詠運輸】電子發票 ${info.invoiceNumber} 已開立，合計 NT$${info.totalAmount.toLocaleString()}`, bubble);
}

/* ─── 9. 抵達通知 → 司機（含完成按鈕 + 導航） ─── */
export async function pushArrivedFlexToDriver(lineUserId: string, order: OrderInfo): Promise<void> {
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.deliveryAddress)}`;
  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "📍 已抵達取貨地", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#d97706",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `訂單 #${order.id}`, weight: "bold", size: "xl", color: "#1e293b" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("送達", order.deliveryAddress),
            row("貨物", order.cargoDescription),
          ],
        },
        { type: "text", text: "完成裝貨後請按「完成配送」，並上傳簽收單照片。", size: "xs", color: "#64748b", margin: "md", wrap: true },
      ],
      paddingAll: "md",
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "md",
      contents: [
        {
          type: "button", style: "primary", color: "#2563EB",
          action: { type: "postback", label: "🏁 完成配送", data: `action=complete&orderId=${order.id}`, displayText: "已完成配送" },
        },
        {
          type: "button", style: "link",
          action: { type: "uri", label: "🗺️ 開啟導航至送達地", uri: navUrl },
        },
      ],
    },
  };
  await pushFlex(lineUserId, `【配送中】訂單 #${order.id} — 抵達完成，請導航至送達地`, bubble);
}

/* ─── 10. 配送完成通知 → 司機（含積分更新） ─── */
export async function pushDeliveryCompletedFlex(
  lineUserId: string,
  order: OrderInfo,
  creditChange: number,
  newScore: number,
): Promise<void> {
  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "🎉 配送完成！", weight: "bold", color: "#ffffff", size: "lg" }],
      backgroundColor: "#16a34a",
      paddingAll: "md",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: `訂單 #${order.id} 配送完成`, weight: "bold", size: "xl", color: "#1e293b" },
        { type: "separator", margin: "md" },
        {
          type: "box", layout: "vertical", margin: "md", spacing: "sm",
          contents: [
            row("客戶", order.customerName),
            row("送達地", order.deliveryAddress),
            { type: "separator", margin: "sm" },
            {
              type: "box", layout: "baseline", spacing: "sm",
              contents: [
                { type: "text", text: "信用積分", color: "#64748b", size: "sm", flex: 2 },
                {
                  type: "text",
                  text: `${creditChange >= 0 ? "+" : ""}${creditChange} (累積 ${newScore} 分)`,
                  color: creditChange >= 0 ? "#16a34a" : "#dc2626",
                  size: "sm", flex: 5, weight: "bold",
                },
              ],
            },
          ],
        },
        {
          type: "text",
          text: newScore >= 90
            ? "⭐ 優良積分，優先取得高單價急單機會！"
            : newScore >= 70
              ? "繼續努力，提升積分可接更多好單！"
              : "⚠️ 積分偏低，請注意服務品質。",
          size: "xs", color: "#64748b", margin: "md", wrap: true,
        },
        { type: "text", text: "如有簽收單請上傳照片以記錄 POD，再獲 +2 積分。", size: "xs", color: "#64748b", margin: "sm", wrap: true },
      ],
      paddingAll: "md",
    },
  };
  await pushFlex(lineUserId, `【完成】訂單 #${order.id} 配送完成，積分 ${creditChange >= 0 ? "+" : ""}${creditChange}`, bubble);
}

/* ─── 8. 回覆訊息（含多則） ─── */
export async function replyMessages(replyToken: string, messages: line.messagingApi.Message[]): Promise<void> {
  if (!channelAccessToken) return;
  await getClient().replyMessage({ replyToken, messages });
}

/* ─── 8. 回覆單則文字 ─── */
export async function replyTextMessage(replyToken: string, text: string): Promise<void> {
  if (!channelAccessToken) return;
  await getClient().replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}

/* ─── 9. 搶單廣播 → 所有已綁定 LINE 的司機 ─── */
export interface BroadcastOrderInfo {
  id: number;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription?: string | null;
  customerName?: string | null;
  distanceKm?: number | null;
  totalFee?: number | null;
  suggestedPrice?: number | null;
  pickupTime?: string | null;
  requiredVehicleType?: string | null;
}

export async function sendOrderBroadcast(
  driverLineIds: string[],
  order: BroadcastOrderInfo,
): Promise<{ sent: number; failed: number }> {
  if (!channelAccessToken || driverLineIds.length === 0) return { sent: 0, failed: 0 };

  const nt = (n: number | null | undefined) => n ? `NT$${n.toLocaleString()}` : "待定";
  const price = order.totalFee ?? order.suggestedPrice;
  const pickupTimeStr = order.pickupTime
    ? new Date(order.pickupTime).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "即時";

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "🔥 搶單機會！", weight: "bold", color: "#ffffff", size: "xl" },
        { type: "text", text: `訂單 #${order.id} — 先搶先得`, color: "#fde68a", size: "sm" },
      ],
      backgroundColor: "#16a34a",
      paddingAll: "lg",
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "box", layout: "vertical", spacing: "sm",
          contents: [
            row("貨物", order.cargoDescription ?? "—"),
            row("取貨", order.pickupAddress),
            row("送達", order.deliveryAddress),
            ...(order.distanceKm ? [row("距離", `${order.distanceKm} km`)] : []),
            row("時間", pickupTimeStr),
            ...(order.requiredVehicleType ? [row("車型", order.requiredVehicleType)] : []),
            { type: "separator", margin: "md" },
            {
              type: "box", layout: "baseline", spacing: "sm",
              contents: [
                { type: "text", text: "報酬", color: "#64748b", size: "sm", flex: 2 },
                { type: "text", text: price ? nt(price) : "洽談", color: "#16a34a", size: "lg", weight: "bold", flex: 5 },
              ],
            },
          ],
        },
        {
          type: "text",
          text: `回覆「接單:${order.id}」或點下方按鈕搶單`,
          size: "xs", color: "#64748b", margin: "md", wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      paddingAll: "md",
      contents: [
        {
          type: "button", style: "primary", color: "#16a34a", flex: 2,
          action: { type: "message", label: "✅ 我要接單", text: `接單:${order.id}` },
        },
        {
          type: "button", style: "secondary", flex: 1,
          action: { type: "message", label: "查詢詳情", text: `查詢 ${order.id}` },
        },
      ],
    },
  };

  const altText = `【搶單】訂單 #${order.id}｜${order.pickupAddress} → ${order.deliveryAddress}｜${price ? nt(price) : "洽談"}`;

  // ── 去重，避免同一 LINE ID 被推播多次（對應 Python: set(active_uids)）──
  const uniqueIds = [...new Set(driverLineIds.filter(Boolean))];
  if (uniqueIds.length < driverLineIds.length) {
    console.warn(`[LINE broadcast] Order #${order.id}: 去除 ${driverLineIds.length - uniqueIds.length} 個重複 LINE ID`);
  }

  const msg: line.messagingApi.FlexMessage = { type: "flex", altText, contents: bubble };

  // ── LINE Multicast API：一次呼叫發給所有人（Python: line_bot_api.multicast(active_uids, ...)）──
  // LINE 每次最多 500 人，超過自動分批
  const BATCH = 500;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < uniqueIds.length; i += BATCH) {
    const batch = uniqueIds.slice(i, i + BATCH);
    try {
      await getClient().multicast({ to: batch, messages: [msg] });
      sent += batch.length;
      console.log(`[LINE multicast] Order #${order.id}: batch ${Math.floor(i / BATCH) + 1} → ${batch.length} 位`);
    } catch (err: any) {
      failed += batch.length;
      console.error(`[LINE multicast] Order #${order.id}: batch failed —`, err?.message ?? err);
    }
  }

  if (failed > 0) {
    console.warn(`[LINE multicast] Order #${order.id}: ${sent} 成功, ${failed} 失敗`);
  }

  return { sent, failed };
}
