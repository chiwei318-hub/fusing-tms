/**
 * 雙推播核心服務 — LINE + Atoms APP
 * 統一入口：sendPush() / sendBatchPush()
 * 所有推播紀錄寫入 push_notifications 資料表
 */
import { pool } from "@workspace/db";
import { enqueueNotification } from "./notificationQueue";

const LINE_TOKEN   = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
const ATOMS_URL    = process.env.ATOMS_WEBHOOK_URL ?? "";
const APP_BASE_URL = process.env.ATOMS_CALLBACK_BASE_URL || process.env.APP_BASE_URL || "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlexRouteInfo {
  label: string;
  timeSlot?: string;
  stationCount?: number;
  dock?: string;
  serviceType?: string;
}

export interface PushPayload {
  driverId?: number | null;
  driverName?: string | null;
  fleetId?: number | null;
  channel: "line" | "app" | "both";
  type: "task" | "schedule_change" | "settlement" | "reminder" | "expiry";
  title: string;
  body: string;
  data?: Record<string, any>;
  lineUserId?: string | null;
  atomsAccount?: string | null;
  flex?: {
    date?: string;
    routes?: FlexRouteInfo[];
    amount?: number;
    actionUrl?: string;
  };
}

export interface PushResult {
  notificationId: number;
  lineStatus: "sent" | "failed" | "skipped";
  atomsStatus: "sent" | "failed" | "skipped";
  ok: boolean;
}

// ─── Flex Message Builder ─────────────────────────────────────────────────────

function buildFlexBubble(payload: PushPayload): object {
  const { title, body, driverName, flex, type } = payload;

  const headerColor =
    type === "settlement"                         ? "#10B981" :
    type === "expiry" || type === "reminder"      ? "#EF4444" :
    type === "schedule_change"                    ? "#F59E0B" :
    "#F97316"; // task = orange

  const icon =
    type === "settlement"    ? "💰" :
    type === "expiry"        ? "⚠️" :
    type === "reminder"      ? "🔔" :
    type === "schedule_change" ? "🔄" :
    "🚛";

  const bodyContents: object[] = [];

  bodyContents.push({
    type: "text",
    text: driverName ? `${driverName} 您好` : title,
    size: "lg", weight: "bold",
  });
  bodyContents.push({ type: "separator", margin: "md" });

  if (flex?.date) {
    bodyContents.push({
      type: "text",
      text: `📅 日期：${flex.date}`,
      size: "sm", color: "#555555", margin: "md",
    });
  }

  if (flex?.routes?.length) {
    const label = type === "schedule_change" ? "路線異動：" :
                  flex.routes.length > 1      ? "您的任務已確認：" : "明日任務已確認：";
    bodyContents.push({
      type: "text",
      text: label,
      size: "sm", color: "#666666", margin: "sm",
    });

    for (const r of flex.routes) {
      const lines: object[] = [
        { type: "text", text: `📍 ${r.label}`, size: "sm", weight: "bold" },
      ];
      if (r.timeSlot)    lines.push({ type: "text", text: `⏰ ${r.timeSlot} 出車`,  size: "sm" });
      if (r.stationCount) lines.push({ type: "text", text: `🏪 ${r.stationCount} 站點`, size: "sm" });
      if (r.dock)        lines.push({ type: "text", text: `🚢 碼頭：${r.dock}`,   size: "sm" });
      if (r.serviceType) lines.push({ type: "text", text: `📦 ${r.serviceType}`,  size: "sm", color: "#888888" });
      bodyContents.push({
        type: "box", layout: "vertical",
        backgroundColor: type === "schedule_change" ? "#FFF7ED" : "#F0FDF4",
        cornerRadius: "6px",
        paddingAll: "8px",
        margin: "sm",
        contents: lines,
      });
    }
  } else {
    bodyContents.push({
      type: "text",
      text: body,
      size: "sm", wrap: true, margin: "md",
    });
  }

  if (flex?.amount !== undefined) {
    bodyContents.push({ type: "separator", margin: "md" });
    bodyContents.push({
      type: "text",
      text: `💰 金額：NT$ ${flex.amount.toLocaleString()}`,
      size: "md", weight: "bold", color: "#10B981", margin: "md",
    });
  }

  const footerContents: object[] = [];
  if (flex?.actionUrl) {
    footerContents.push({
      type: "button",
      style: "primary",
      color: headerColor,
      height: "sm",
      action: { type: "uri", label: "查看詳情", uri: flex.actionUrl },
    });
  }
  if (type === "task" || type === "schedule_change") {
    footerContents.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "message", label: "確認接單", text: "確認接單" },
    });
  }

  return {
    type: "bubble",
    size: "giga",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: headerColor,
      paddingAll: "14px",
      contents: [{
        type: "text",
        text: `${icon} 富詠運輸  ${title}`,
        size: "md",
        color: "#ffffff",
        weight: "bold",
      }],
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents,
      paddingAll: "16px",
      spacing: "xs",
    },
    ...(footerContents.length > 0 ? {
      footer: {
        type: "box",
        layout: footerContents.length > 1 ? "horizontal" : "vertical",
        contents: footerContents,
        paddingAll: "12px",
        spacing: "sm",
      },
    } : {}),
  };
}

// ─── LINE Push (via enqueueNotification for rate limiting) ────────────────────

async function doLinePush(lineUserId: string, payload: PushPayload): Promise<{ ok: boolean; error?: string }> {
  if (!LINE_TOKEN) return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" };
  const bubble  = buildFlexBubble(payload);
  const message = { type: "flex", altText: `【富詠運輸】${payload.title}`, contents: bubble };
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
      body: JSON.stringify({ to: lineUserId, messages: [message] }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return { ok: true };
    const errText = await r.text().catch(() => "unknown");
    return { ok: false, error: `LINE ${r.status}: ${errText}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Atoms APP Push ───────────────────────────────────────────────────────────

async function doAtomsPush(
  atomsAccount: string,
  payload: PushPayload,
  notifId: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!ATOMS_URL) return { ok: false, error: "ATOMS_WEBHOOK_URL 未設定" };
  const body = {
    event:     "notification",
    timestamp: new Date().toISOString(),
    data: {
      notification_id: notifId,
      type:            payload.type,
      title:           payload.title,
      body:            payload.body,
      atoms_account:   atomsAccount,
      driver_name:     payload.driverName ?? null,
      action_url:      payload.flex?.actionUrl ?? `${APP_BASE_URL}/fleet`,
      routes:          payload.flex?.routes ?? [],
      date:            payload.flex?.date ?? null,
      amount:          payload.flex?.amount ?? null,
      ...(payload.data ?? {}),
    },
  };
  try {
    const r = await fetch(ATOMS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return { ok: true };
    const errText = await r.text().catch(() => "unknown");
    return { ok: false, error: `Atoms ${r.status}: ${errText}` };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Main: sendPush ───────────────────────────────────────────────────────────

export async function sendPush(payload: PushPayload): Promise<PushResult> {
  const ins = await pool.query(
    `INSERT INTO push_notifications
       (driver_id, driver_name, fleet_id, channel, type, title, body, data,
        line_user_id, atoms_account, status, line_status, atoms_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','pending','pending')
     RETURNING id`,
    [
      payload.driverId ?? null,
      payload.driverName ?? null,
      payload.fleetId ?? null,
      payload.channel,
      payload.type,
      payload.title,
      payload.body,
      payload.data ? JSON.stringify(payload.data) : null,
      payload.lineUserId ?? null,
      payload.atomsAccount ?? null,
    ],
  );
  const notifId: number = ins.rows[0].id;

  const useLine  = payload.channel !== "app"  && !!payload.lineUserId;
  const useAtoms = payload.channel !== "line" && !!payload.atomsAccount;

  let lineStatus:  PushResult["lineStatus"]  = "skipped";
  let atomsStatus: PushResult["atomsStatus"] = "skipped";
  const errors: string[] = [];

  if (useLine) {
    const res = await doLinePush(payload.lineUserId!, payload);
    lineStatus = res.ok ? "sent" : "failed";
    if (!res.ok && res.error) errors.push(res.error);
  }
  if (useAtoms) {
    const res = await doAtomsPush(payload.atomsAccount!, payload, notifId);
    atomsStatus = res.ok ? "sent" : "failed";
    if (!res.ok && res.error) errors.push(res.error);
  }

  const overallStatus =
    lineStatus === "sent" || atomsStatus === "sent" ? "sent"  :
    lineStatus === "failed" || atomsStatus === "failed" ? "failed" :
    "skipped";

  await pool.query(
    `UPDATE push_notifications
     SET status=$2, line_status=$3, atoms_status=$4, sent_at=NOW(), error=$5
     WHERE id=$1`,
    [notifId, overallStatus, lineStatus, atomsStatus, errors.length ? errors.join("; ") : null],
  );

  if (overallStatus === "failed") {
    console.warn(`[PushNotif] ✗ id=${notifId} ${payload.type} → ${payload.driverName ?? "?"} errors: ${errors.join("; ")}`);
  } else {
    const chs = [useLine && `LINE${lineStatus === "sent" ? "✓" : "✗"}`, useAtoms && `Atoms${atomsStatus === "sent" ? "✓" : "✗"}`].filter(Boolean).join(" ");
    console.log(`[PushNotif] ✓ id=${notifId} ${payload.type} → ${payload.driverName ?? "?"} [${chs}]`);
  }

  return { notificationId: notifId, lineStatus, atomsStatus, ok: overallStatus !== "failed" };
}

// ─── Batch Push ───────────────────────────────────────────────────────────────

export async function sendBatchPush(payloads: PushPayload[]): Promise<{
  sent: number; failed: number; results: PushResult[];
}> {
  const results = await Promise.all(
    payloads.map(p =>
      sendPush(p).catch((e): PushResult => ({
        notificationId: -1,
        lineStatus: "failed",
        atomsStatus: "failed",
        ok: false,
      })),
    ),
  );
  const sent   = results.filter(r => r.ok).length;
  const failed = results.length - sent;
  console.log(`[PushNotif] 批次完成 → ${sent} 成功 / ${failed} 失敗`);
  return { sent, failed, results };
}
