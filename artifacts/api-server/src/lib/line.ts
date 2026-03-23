import * as line from "@line/bot-sdk";

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const channelSecret = process.env.LINE_CHANNEL_SECRET ?? "";

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

async function pushFlex(to: string, altText: string, bubble: line.messagingApi.FlexBubble) {
  if (!channelAccessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  const msg: line.messagingApi.FlexMessage = { type: "flex", altText, contents: bubble };
  await getClient().pushMessage({ to, messages: [msg] });
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

/* ─── 2. 新訂單提醒 → 公司 ─── */
export async function sendNewOrderAlertToCompany(order: OrderInfo): Promise<void> {
  const companyUserId = process.env.LINE_COMPANY_USER_ID;
  if (!companyUserId) return;

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

  await pushFlex(companyUserId, `【新訂單】#${order.id} ${order.customerName} 已下單`, bubble);
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

/* ─── 6. 回覆綁定確認 ─── */
export async function replyTextMessage(replyToken: string, text: string): Promise<void> {
  if (!channelAccessToken) return;
  await getClient().replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}
