/**
 * 月結到期提醒調度器
 *
 * 觸發規則（台北時間）：
 *   D-5 → LINE 推播車主「結算將於5天後到期」
 *   D-1 → LINE 推播車主「明日到期！」
 *   D+0 → 標記逾期 + 推播車主 + 推播管理員
 *
 * 每 4 小時掃描一次，每筆提醒只送一次（由 line_remind_*_at 控制）
 */

import { pool } from "@workspace/db";
import { sendPush } from "./pushNotification";

const TICK_MS      = 4 * 60 * 60 * 1000; // 4 hours
const ADMIN_LINE   = process.env.ADMIN_LINE_USER_ID ?? "";     // 管理員 LINE ID

// ── 共用 LINE Flex 建構 ─────────────────────────────────────────────────────

function buildSettlementReminderFlex(params: {
  fleetName: string;
  month: string;
  cashDue: number;
  dueDate: string;
  calcCompleteDate: string | null;
  daysRemaining: number;
}) {
  const { fleetName, month, cashDue, dueDate, calcCompleteDate, daysRemaining } = params;

  const headerColor =
    daysRemaining <= 0 ? "#D32F2F" :
    daysRemaining === 1 ? "#E64A19" : "#F57C00";

  const urgencyLabel =
    daysRemaining <= 0 ? "⛔ 結算逾期" :
    daysRemaining === 1 ? "🔴 明日到期" : "🟡 即將到期";

  const bodyText =
    daysRemaining <= 0
      ? `您的 ${month} 月份結算款項已逾期，請盡快完成付款。`
      : daysRemaining === 1
        ? `您的 ${month} 月份結算明日到期，請確認付款安排。`
        : `您的 ${month} 月份結算將於 ${daysRemaining} 天後（${dueDate}）到期。`;

  return {
    type: "bubble" as const,
    header: {
      type: "box" as const,
      layout: "vertical" as const,
      backgroundColor: headerColor,
      paddingAll: "md",
      contents: [{
        type: "text" as const,
        text: urgencyLabel,
        color: "#FFFFFF",
        size: "lg",
        weight: "bold" as const,
      }],
    },
    body: {
      type: "box" as const,
      layout: "vertical" as const,
      spacing: "sm",
      contents: [
        {
          type: "text" as const,
          text: `${fleetName}`,
          weight: "bold" as const,
          size: "xl",
          color: "#1A1A2E",
        },
        {
          type: "text" as const,
          text: bodyText,
          wrap: true,
          color: "#555577",
          size: "sm",
          margin: "sm",
        },
        {
          type: "separator" as const,
          margin: "md",
          color: "#EEEEEE",
        },
        {
          type: "box" as const,
          layout: "vertical" as const,
          margin: "md",
          spacing: "xs",
          contents: [
            makeDetailRow("📅 結算月份", month),
            makeDetailRow("💰 結算金額", `NT$ ${Number(cashDue).toLocaleString()}`),
            ...(calcCompleteDate ? [makeDetailRow("📋 計算完成日", calcCompleteDate)] : []),
            makeDetailRow("⏰ 到期日", dueDate),
          ],
        },
      ],
    },
    footer: {
      type: "box" as const,
      layout: "vertical" as const,
      contents: [{
        type: "text" as const,
        text: "如有疑問請聯繫調度人員",
        size: "xs",
        color: "#AAAAAA",
        align: "center" as const,
      }],
    },
  };
}

function makeDetailRow(label: string, value: string) {
  return {
    type: "box" as const,
    layout: "horizontal" as const,
    contents: [
      { type: "text" as const, text: label, color: "#888888", size: "xs", flex: 2 },
      { type: "text" as const, text: value, color: "#1A1A2E", size: "xs", flex: 3, weight: "bold" as const, align: "end" as const },
    ],
  };
}

// ── Main tick ───────────────────────────────────────────────────────────────

async function tick() {
  try {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });

    // Settlements that still need attention (not paid)
    const { rows } = await pool.query(`
      SELECT
        s.id, s.fleet_id, s.month, s.cash_due::numeric AS cash_due,
        s.due_date::text       AS due_date,
        s.calc_complete_date::text AS calc_complete_date,
        s.status,
        s.line_remind_5d_at,
        s.line_remind_1d_at,
        s.line_overdue_notified_at,
        f.fleet_name,
        f.line_id              AS fleet_line_id,
        (s.due_date - $1::date)::int AS days_remaining
      FROM fleet_cash_settlements s
      JOIN fusingao_fleets f ON f.id = s.fleet_id
      WHERE s.status NOT IN ('paid')
        AND s.due_date IS NOT NULL
      ORDER BY s.due_date ASC
    `, [today]);

    let pushed = 0;

    for (const row of rows as any[]) {
      const d   = Number(row.days_remaining);
      const fid = row.fleet_id as number;
      const sid = row.id as number;
      const lineId = row.fleet_line_id as string | null;
      const cash   = Number(row.cash_due);

      const flexAlt = buildSettlementReminderFlex({
        fleetName:        row.fleet_name,
        month:            row.month,
        cashDue:          cash,
        dueDate:          row.due_date,
        calcCompleteDate: row.calc_complete_date,
        daysRemaining:    d,
      });

      // ── D-5 提醒 ──────────────────────────────────────────────────────────
      if (d === 5 && !row.line_remind_5d_at && lineId) {
        await sendPush({
          fleetId:    fid,
          driverName: row.fleet_name,
          channel:    "line",
          type:       "settlement",
          title:      `📢 ${row.fleet_name} 結算5天後到期`,
          body:       `${row.month} 月結算 NT$${cash.toLocaleString()} 將於 ${row.due_date} 到期（剩5天）`,
          lineUserId: lineId,
          flex:       { amount: cash },
          data:       { flexAlt, settlement_id: sid },
        });
        await pool.query(
          `UPDATE fleet_cash_settlements SET line_remind_5d_at = NOW(), reminder_sent_at = NOW() WHERE id = $1`,
          [sid],
        );
        pushed++;
        console.log(`[SettlementReminder] D-5 推播 → ${row.fleet_name} (${row.month})`);
      }

      // ── D-1 提醒 ──────────────────────────────────────────────────────────
      if (d === 1 && !row.line_remind_1d_at && lineId) {
        await sendPush({
          fleetId:    fid,
          driverName: row.fleet_name,
          channel:    "line",
          type:       "settlement",
          title:      `🔴 ${row.fleet_name} 結算明日到期`,
          body:       `${row.month} 月結算 NT$${cash.toLocaleString()} 明日（${row.due_date}）到期，請盡快安排付款`,
          lineUserId: lineId,
          flex:       { amount: cash },
          data:       { flexAlt, settlement_id: sid },
        });
        await pool.query(
          `UPDATE fleet_cash_settlements SET line_remind_1d_at = NOW(), reminder_sent_at = NOW() WHERE id = $1`,
          [sid],
        );
        pushed++;
        console.log(`[SettlementReminder] D-1 推播 → ${row.fleet_name} (${row.month})`);
      }

      // ── D+0 逾期：標記 + 推播 ────────────────────────────────────────────
      if (d <= 0 && !row.line_overdue_notified_at) {
        // 標記逾期
        if (row.status !== "overdue") {
          await pool.query(
            `UPDATE fleet_cash_settlements SET status = 'overdue' WHERE id = $1`,
            [sid],
          );
        }

        // 推播車主
        if (lineId) {
          await sendPush({
            fleetId:    fid,
            driverName: row.fleet_name,
            channel:    "line",
            type:       "settlement",
            title:      `⛔ ${row.fleet_name} 結算逾期`,
            body:       `${row.month} 月結算 NT$${cash.toLocaleString()} 已逾期，請立即聯繫調度人員`,
            lineUserId: lineId,
            flex:       { amount: cash },
            data:       { flexAlt, settlement_id: sid },
          });
        }

        // 推播管理員（如有設定 ADMIN_LINE_USER_ID）
        if (ADMIN_LINE) {
          await sendPush({
            fleetId:    fid,
            driverName: `[管理員] ${row.fleet_name}`,
            channel:    "line",
            type:       "reminder",
            title:      `⚠️ 逾期結算提醒：${row.fleet_name}`,
            body:       `${row.fleet_name} 的 ${row.month} 月結算 NT$${cash.toLocaleString()} 已逾期（到期日 ${row.due_date}）`,
            lineUserId: ADMIN_LINE,
            data:       { settlement_id: sid, fleet_id: fid },
          });
        }

        await pool.query(
          `UPDATE fleet_cash_settlements SET line_overdue_notified_at = NOW(), reminder_sent_at = NOW() WHERE id = $1`,
          [sid],
        );
        pushed++;
        console.log(`[SettlementReminder] D+0 逾期標記+推播 → ${row.fleet_name} (${row.month}) days=${d}`);
      }

      // ── 舊版：寫入 fleet_settlement_reminders log（保留相容性）────────────
      if (d <= 7 && d >= -30) {
        await pool.query(
          `INSERT INTO fleet_settlement_reminders (settlement_id, fleet_name, month, due_date, days_remaining, reminded_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT DO NOTHING`,
          [sid, row.fleet_name, row.month, row.due_date, d],
        ).catch(() => {});  // best-effort
      }
    }

    if (pushed > 0) {
      console.log(`[SettlementReminder] 本次推播 ${pushed} 筆`);
    }
  } catch (err: any) {
    console.error("[SettlementReminder] scheduler error:", err.message);
  }
}

export function startSettlementReminderScheduler() {
  setTimeout(tick, 30_000); // first run 30s after boot
  setInterval(tick, TICK_MS);
  console.log("[SettlementReminder] scheduler started, checking every 4 hours");
}
