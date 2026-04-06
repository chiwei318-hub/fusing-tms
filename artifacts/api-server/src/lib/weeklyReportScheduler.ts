import * as line from "@line/bot-sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const CHANNEL_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const WARN_MARGIN   = 12; // 毛利率警戒線 %

function getClient(): line.messagingApi.MessagingApiClient | null {
  if (!CHANNEL_TOKEN) return null;
  return new line.messagingApi.MessagingApiClient({ channelAccessToken: CHANNEL_TOKEN });
}

async function getReceivers(): Promise<string[]> {
  const dbReceivers = (await db.execute(sql`
    SELECT line_user_id FROM order_notify_receivers WHERE active = TRUE
  `)).rows.map((r: any) => r.line_user_id as string).filter(Boolean);
  const envId = process.env.LINE_COMPANY_USER_ID;
  return [...new Set([...dbReceivers, ...(envId ? [envId] : [])])];
}

async function fetchWeekSummary() {
  const result = await db.execute(sql.raw(`
    SELECT
      COUNT(*)::int                                    AS total_orders,
      COALESCE(SUM(total_amount),0)::numeric           AS gross_revenue,
      COALESCE(SUM(platform_revenue),0)::numeric       AS platform_revenue,
      COALESCE(SUM(driver_payout),0)::numeric          AS driver_payout,
      ROUND(COALESCE(SUM(platform_revenue),0)
        / NULLIF(SUM(total_amount),0) * 100, 1)::numeric AS margin_pct,
      COUNT(*) FILTER(WHERE payment_status='unpaid')::int AS unpaid_count,
      COALESCE(SUM(driver_payout) FILTER
        (WHERE payment_status='unpaid'),0)::numeric    AS pending_payout
    FROM order_settlements
    WHERE created_at >= NOW() - INTERVAL '7 days'
  `));
  return result.rows[0] as Record<string, unknown>;
}

async function pushWeeklyReport() {
  const client = getClient();
  if (!client) {
    console.log("[WeeklyReport] LINE_CHANNEL_ACCESS_TOKEN 未設定，跳過推播");
    return;
  }

  const receivers = await getReceivers();
  if (receivers.length === 0) {
    console.log("[WeeklyReport] 無 LINE 接收者，跳過推播");
    return;
  }

  const s = await fetchWeekSummary();
  const appBase    = process.env.APP_BASE_URL ?? "";
  const exportUrl  = `${appBase}/api/order-settlements/export`;
  const nt = (n: unknown) => `NT$${Number(n ?? 0).toLocaleString("zh-TW")}`;
  const margin     = Number(s.margin_pct ?? 0);
  const marginWarn = margin > 0 && margin < WARN_MARGIN;
  const nowTW      = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

  const bubble: line.messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical",
      backgroundColor: marginWarn ? "#c0392b" : "#1e3a5f",
      paddingAll: "md",
      contents: [
        { type: "text", text: "📊 富詠運輸 — 週結報表", weight: "bold", color: "#ffffff", size: "md" },
        { type: "text", text: nowTW, color: "#aac4e8", size: "xs", margin: "xs" },
      ],
    },
    body: {
      type: "box", layout: "vertical", paddingAll: "md", spacing: "sm",
      contents: [
        ...(marginWarn ? [{
          type: "box" as const, layout: "vertical" as const,
          backgroundColor: "#fde8e8", paddingAll: "sm", cornerRadius: "md",
          contents: [{
            type: "text" as const,
            text: `⚠️ 毛利率 ${margin}% 低於警戒線 ${WARN_MARGIN}%！請檢查報價`,
            color: "#c0392b", size: "xs", weight: "bold", wrap: true,
          }],
        }] : []),
        row("本週訂單筆數", `${s.total_orders ?? 0} 筆`),
        row("總運費營收",   nt(s.gross_revenue)),
        row("平台淨利",     nt(s.platform_revenue)),
        row("整體毛利率",   `${margin}%`),
        row("司機總應付",   nt(s.driver_payout)),
        row("待付款金額",   nt(s.pending_payout)),
      ],
    },
    footer: {
      type: "box", layout: "vertical", paddingAll: "md", spacing: "sm",
      contents: [
        ...(appBase ? [{
          type: "button" as const, style: "primary" as const,
          color: "#1e3a5f",
          action: {
            type: "uri" as const,
            label: "📥 下載 Excel 財務報表",
            uri: exportUrl,
          },
        }] : []),
        {
          type: "button", style: "secondary",
          action: {
            type: "uri", label: "前往結算中心",
            uri: appBase ? `${appBase}/admin` : "https://example.com",
          },
        },
      ],
    },
  };

  for (const uid of receivers) {
    try {
      const msg: line.messagingApi.FlexMessage = {
        type: "flex", altText: `【富詠週結】本週 ${s.total_orders} 筆，平台淨利 ${nt(s.platform_revenue)}`,
        contents: bubble,
      };
      await client.pushMessage({ to: uid, messages: [msg] });
      console.log(`[WeeklyReport] 已推播給 ${uid}`);
    } catch (e) {
      console.error(`[WeeklyReport] 推播失敗 ${uid}:`, e);
    }
  }
}

function row(label: string, value: string): line.messagingApi.FlexBox {
  return {
    type: "box", layout: "horizontal",
    contents: [
      { type: "text", text: label, color: "#555555", size: "sm", flex: 3 },
      { type: "text", text: value, color: "#1e3a5f",  size: "sm", flex: 2, align: "end", weight: "bold" },
    ],
  };
}

function msUntilNextSundayNight(): number {
  const now = new Date();
  const tw  = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day = tw.getDay(); // 0=Sun, 1=Mon...
  const daysUntilSun = day === 0 ? 7 : 7 - day;

  const nextSun = new Date(tw);
  nextSun.setDate(tw.getDate() + daysUntilSun);
  nextSun.setHours(23, 59, 0, 0);

  return nextSun.getTime() - tw.getTime();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function startWeeklyReportScheduler() {
  const ms = msUntilNextSundayNight();
  const days = Math.round(ms / 1000 / 60 / 60 / 24);
  console.log(`[WeeklyReport] 排程啟動，距離下次週結推播還有 ${days} 天（每週日 23:59 台灣時間）`);

  setTimeout(async () => {
    console.log("[WeeklyReport] 執行週結推播…");
    await pushWeeklyReport().catch(e => console.error("[WeeklyReport] 推播失敗:", e));
    setInterval(async () => {
      console.log("[WeeklyReport] 執行週結推播…");
      await pushWeeklyReport().catch(e => console.error("[WeeklyReport] 推播失敗:", e));
    }, WEEK_MS);
  }, ms);
}

export { pushWeeklyReport };
