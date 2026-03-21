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

export interface OrderInfo {
  id: number;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription: string;
  customerName: string;
}

export async function sendDispatchNotification(lineUserId: string, order: OrderInfo): Promise<void> {
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const driverTaskUrl = appBaseUrl && appBaseUrl.startsWith("http") ? `${appBaseUrl}/driver/orders` : "";

  const message: line.messagingApi.FlexMessage = {
    type: "flex",
    altText: `【派車通知】訂單 #${order.id} 已指派給您`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "派車通知",
            weight: "bold",
            color: "#ffffff",
            size: "lg",
          },
        ],
        backgroundColor: "#2563EB",
        paddingAll: "md",
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `訂單 #${order.id}`,
            weight: "bold",
            size: "xl",
            color: "#1e293b",
            margin: "none",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "sm",
            contents: [
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "客戶",
                    color: "#64748b",
                    size: "sm",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: order.customerName,
                    wrap: true,
                    color: "#1e293b",
                    size: "sm",
                    flex: 5,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "取貨",
                    color: "#64748b",
                    size: "sm",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: order.pickupAddress,
                    wrap: true,
                    color: "#1e293b",
                    size: "sm",
                    flex: 5,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "送達",
                    color: "#64748b",
                    size: "sm",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: order.deliveryAddress,
                    wrap: true,
                    color: "#1e293b",
                    size: "sm",
                    flex: 5,
                  },
                ],
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: "貨物",
                    color: "#64748b",
                    size: "sm",
                    flex: 2,
                  },
                  {
                    type: "text",
                    text: order.cargoDescription,
                    wrap: true,
                    color: "#1e293b",
                    size: "sm",
                    flex: 5,
                  },
                ],
              },
            ],
          },
        ],
        paddingAll: "md",
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#16a34a",
            action: {
              type: "postback",
              label: "接單",
              data: `action=accept&orderId=${order.id}`,
              displayText: "已接單",
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "拒單",
              data: `action=reject&orderId=${order.id}`,
              displayText: "已拒單",
            },
          },
          ...(driverTaskUrl ? [{
            type: "button" as const,
            style: "link" as const,
            action: {
              type: "uri" as const,
              label: "前往任務頁",
              uri: driverTaskUrl,
            },
          }] : []),
        ],
        paddingAll: "md",
      },
    },
  };

  await getClient().pushMessage({
    to: lineUserId,
    messages: [message],
  });
}
