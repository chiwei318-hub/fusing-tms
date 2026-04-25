/**
 * 定時推播排程
 * - 每天 06:00 TW  → 蝦皮班表地址同步（location_history），完成後推播管理員
 * - 每天 07:00 TW  → 今日班表推播給所有有班的司機
 * - 每天 09:00 TW  → 到期提醒（驗車/保險 30天、合約 5天前）
 */
import { pool } from "@workspace/db";
import { sendBatchPush, PushPayload } from "./pushNotification";
import { syncShopeeLocations } from "./syncShopeeLocations";

// ─── 工具函式 ────────────────────────────────────────────────────────────────

function todayTW(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

/** 計算距離下一個台灣時間 targetHour:targetMin 的毫秒數 */
function msUntilTWHour(targetHour: number, targetMin = 0): number {
  const now = new Date();
  const twParts = now.toLocaleString("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).match(/(\d+):(\d+):(\d+)/);
  if (!twParts) return 5000; // fallback 5s
  const h = Number(twParts[1]);
  const m = Number(twParts[2]);
  const s = Number(twParts[3]);
  const nowSec    = h * 3600 + m * 60 + s;
  const targetSec = targetHour * 3600 + targetMin * 60;
  let diff = targetSec - nowSec;
  if (diff <= 0) diff += 24 * 3600;
  return diff * 1000;
}

// ─── 工具：LINE 推播管理員（個人 or 群組） ───────────────────────────────────
async function pushAdminLine(title: string, body: string): Promise<void> {
  const token   = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  const targets = [
    process.env.LINE_ADMIN_GROUP_ID,  // 管理群組 ID（優先）
    process.env.LINE_ADMIN_USER_ID,   // 或個人 LINE user ID
  ].filter(Boolean) as string[];

  if (!token || targets.length === 0) {
    console.log(`[AdminPush] 未設定 LINE_ADMIN_GROUP_ID 或 LINE_ADMIN_USER_ID，跳過推播`);
    console.log(`[AdminPush] ${title}: ${body}`);
    return;
  }

  for (const to of targets) {
    try {
      const r = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          messages: [{ type: "text", text: `【${title}】\n${body}` }],
        }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        console.warn(`[AdminPush] LINE push 失敗 (${to}): ${r.status} ${txt}`);
      } else {
        console.log(`[AdminPush] LINE push 成功 → ${to}`);
      }
    } catch (e: any) {
      console.error(`[AdminPush] LINE push 例外 (${to}):`, e.message);
    }
  }
}

// ─── 觸發 0：每天 06:00 蝦皮班表地址同步 ─────────────────────────────────────

let lastLocationSyncDate = "";

export async function runDailyLocationSync(): Promise<void> {
  const today = todayTW();
  if (lastLocationSyncDate === today) return;
  lastLocationSyncDate = today;

  console.log(`[ScheduledNotif] 06:00 蝦皮地址同步啟動 → ${today}`);
  try {
    const result = await syncShopeeLocations();

    // 寫入同步日誌
    await pool.query(
      `INSERT INTO shopee_location_sync_log
         (trigger, inserted, updated, total, sheet_count, address_count, duration_ms)
       VALUES ('scheduled', $1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [result.inserted, result.updated, result.total,
       result.sheetCount, result.addressCount, result.durationMs],
    ).catch(() =>
      pool.query(
        `INSERT INTO shopee_location_sync_log
           (trigger, inserted, updated, total, sheet_count, address_count, duration_ms)
         VALUES ('scheduled', $1, $2, $3, $4, $5, $6)`,
        [result.inserted, result.updated, result.total,
         result.sheetCount, result.addressCount, result.durationMs],
      )
    );

    const durSec = Math.round(result.durationMs / 1000);
    const msg = [
      `📅 日期：${today}`,
      `📍 新增地址：${result.inserted} 筆`,
      `🔄 更新地址：${result.updated} 筆`,
      `📂 掃描分頁：${result.sheetCount} 個`,
      `⏱ 耗時：${durSec} 秒`,
    ].join("\n");

    await pushAdminLine("蝦皮地址同步完成", msg);
    console.log(`[ScheduledNotif] 06:00 地址同步完成 — 新增 ${result.inserted} 更新 ${result.updated}`);
  } catch (err: any) {
    console.error("[ScheduledNotif] 06:00 地址同步失敗:", err.message);

    // 同步失敗也通知管理員
    await pushAdminLine(
      "蝦皮地址同步失敗",
      `📅 日期：${today}\n❌ 錯誤：${err.message.slice(0, 200)}`,
    );

    // 寫入失敗記錄
    await pool.query(
      `INSERT INTO shopee_location_sync_log (trigger, error) VALUES ('scheduled', $1)`,
      [err.message.slice(0, 500)],
    ).catch(() => {});
  }
}

// ─── 觸發 1：每天 07:00 今日班表推播 ─────────────────────────────────────────

let lastDailyScheduleDate = "";

export async function runDailySchedulePush(): Promise<void> {
  const today = todayTW();
  if (lastDailyScheduleDate === today) return;
  lastDailyScheduleDate = today;

  console.log(`[ScheduledNotif] 07:00 班表推播啟動 → 日期 ${today}`);
  try {
    const { rows } = await pool.query(
      `SELECT
         r.route_label,
         r.route_date,
         fd.id            AS driver_id,
         fd.name          AS driver_name,
         fd.line_id,
         fd.atoms_account,
         f.id             AS fleet_id,
         f.fleet_name
       FROM dispatch_order_routes r
       JOIN dispatch_orders o   ON o.id = r.dispatch_order_id
       JOIN fleet_drivers   fd  ON fd.id = r.assigned_driver_id
       JOIN fusingao_fleets  f  ON f.id  = o.fleet_id
       WHERE r.route_date = $1
         AND fd.is_active = TRUE
         AND r.needs_reassignment = FALSE
         AND (fd.line_id IS NOT NULL OR fd.atoms_account IS NOT NULL)
       ORDER BY fd.id, r.route_label`,
      [today],
    );

    if (rows.length === 0) {
      console.log(`[ScheduledNotif] ${today} 無派車記錄，跳過推播`);
      return;
    }

    // Group by driver
    const byDriver = new Map<number, {
      driverId: number;
      driverName: string;
      lineId: string | null;
      atomsAccount: string | null;
      fleetId: number;
      fleetName: string;
      routes: Array<{ label: string }>;
    }>();

    for (const row of rows as any[]) {
      if (!byDriver.has(row.driver_id)) {
        byDriver.set(row.driver_id, {
          driverId:     row.driver_id,
          driverName:   row.driver_name,
          lineId:       row.line_id,
          atomsAccount: row.atoms_account,
          fleetId:      row.fleet_id,
          fleetName:    row.fleet_name,
          routes:       [],
        });
      }
      byDriver.get(row.driver_id)!.routes.push({ label: row.route_label });
    }

    const payloads: PushPayload[] = [];
    for (const d of byDriver.values()) {
      const routeSummary = d.routes.map(r => r.label).join("、");
      payloads.push({
        driverId:     d.driverId,
        driverName:   d.driverName,
        fleetId:      d.fleetId,
        channel:      "both",
        type:         "task",
        title:        "今日班表通知",
        body:         `${d.driverName} 您好，您今日的路線：${routeSummary}，請準時出車！`,
        lineUserId:   d.lineId,
        atomsAccount: d.atomsAccount,
        data:         { date: today, fleet: d.fleetName, route_count: d.routes.length },
        flex: {
          date:   today,
          routes: d.routes.map(r => ({ label: r.label })),
        },
      });
    }

    const result = await sendBatchPush(payloads);
    console.log(`[ScheduledNotif] 07:00 推播完成 → ${result.sent} 位成功 / ${result.failed} 位失敗`);
  } catch (err: any) {
    console.error("[ScheduledNotif] 07:00 推播失敗:", err.message);
  }
}

// ─── 觸發 2：班表變動即時推播（供外部呼叫） ───────────────────────────────────

export async function pushScheduleChange(driverIds: number[], date: string, reason?: string): Promise<void> {
  if (driverIds.length === 0) return;
  try {
    const { rows } = await pool.query(
      `SELECT
         r.route_label, r.change_reason,
         fd.id AS driver_id, fd.name AS driver_name,
         fd.line_id, fd.atoms_account, fd.fleet_id
       FROM dispatch_order_routes r
       JOIN fleet_drivers fd ON fd.id = r.assigned_driver_id
       WHERE r.assigned_driver_id = ANY($1::int[])
         AND r.route_date = $2
       ORDER BY fd.id, r.route_label`,
      [driverIds, date],
    );

    const byDriver = new Map<number, {
      driverId: number; driverName: string; lineId: string | null;
      atomsAccount: string | null; fleetId: number;
      routes: Array<{ label: string }>;
    }>();
    for (const row of rows as any[]) {
      if (!byDriver.has(row.driver_id)) {
        byDriver.set(row.driver_id, {
          driverId: row.driver_id, driverName: row.driver_name,
          lineId: row.line_id, atomsAccount: row.atoms_account, fleetId: row.fleet_id, routes: [],
        });
      }
      byDriver.get(row.driver_id)!.routes.push({ label: row.route_label });
    }

    const payloads: PushPayload[] = [];
    for (const d of byDriver.values()) {
      const routeList = d.routes.map(r => r.label).join("、");
      payloads.push({
        driverId: d.driverId, driverName: d.driverName, fleetId: d.fleetId,
        channel: "both", type: "schedule_change",
        title:   "班表異動通知",
        body:    `${d.driverName} 您好，${date} 您的班表有變動：${routeList}。原因：${reason ?? "調度更新"}`,
        lineUserId: d.lineId, atomsAccount: d.atomsAccount,
        data: { date, driver_ids: driverIds, reason },
        flex: { date, routes: d.routes.map(r => ({ label: r.label })) },
      });
    }
    if (payloads.length > 0) {
      const r = await sendBatchPush(payloads);
      console.log(`[ScheduledNotif] 班表變動推播 → ${r.sent} 成功 / ${r.failed} 失敗`);
    }
  } catch (err: any) {
    console.error("[ScheduledNotif] 班表變動推播失敗:", err.message);
  }
}

// ─── 觸發 3：新任務指派即時推播 ────────────────────────────────────────────────

export async function pushTaskAssigned(driverId: number, routeLabel: string, date: string): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, line_id, atoms_account, fleet_id FROM fleet_drivers WHERE id = $1 LIMIT 1`,
      [driverId],
    );
    const d = rows[0] as any;
    if (!d || (!d.line_id && !d.atoms_account)) return;

    await sendBatchPush([{
      driverId: d.id, driverName: d.name, fleetId: d.fleet_id,
      channel: "both", type: "task",
      title:   "新任務指派",
      body:    `${d.name} 您好，您已被指派新任務：${routeLabel}（${date}），請確認接單。`,
      lineUserId: d.line_id, atomsAccount: d.atoms_account,
      data: { route_label: routeLabel, date },
      flex: { date, routes: [{ label: routeLabel }] },
    }]);
  } catch (err: any) {
    console.error("[ScheduledNotif] 任務指派推播失敗:", err.message);
  }
}

// ─── 觸發 4：月結完成推播車主 ──────────────────────────────────────────────────

export async function pushSettlementComplete(
  settlementId: number,
  fleetId: number,
  fleetName: string,
  month: string,
  amount: number,
  fleetLineId?: string | null,
): Promise<void> {
  try {
    const actionUrl = `${process.env.ATOMS_CALLBACK_BASE_URL || process.env.APP_BASE_URL || ""}/fleet/settlements`;
    await sendBatchPush([{
      fleetId,
      driverName: fleetName,
      channel: fleetLineId ? "both" : "app",
      type: "settlement",
      title: "月結完成通知",
      body:  `${fleetName} ${month} 月結已完成，金額 NT$ ${amount.toLocaleString()}，請確認入帳。`,
      lineUserId:   fleetLineId ?? null,
      atomsAccount: null,
      data:  { settlement_id: settlementId, fleet_id: fleetId, month, amount },
      flex:  { amount, actionUrl },
    }]);
  } catch (err: any) {
    console.error("[ScheduledNotif] 月結推播失敗:", err.message);
  }
}

// ─── 觸發 5 & 6：到期提醒（每天 09:00） ───────────────────────────────────────

let lastExpiryDate = "";

export async function runExpiryReminders(): Promise<void> {
  const today = todayTW();
  if (lastExpiryDate === today) return;
  lastExpiryDate = today;

  console.log(`[ScheduledNotif] 09:00 到期提醒啟動 → 日期 ${today}`);
  try {
    const payloads: PushPayload[] = [];

    // 觸發 6：驗車 / 保險到期前 30 天
    const { rows: expiryRows } = await pool.query(
      `SELECT fd.id, fd.name, fd.line_id, fd.atoms_account, fd.fleet_id,
              fd.inspection_expire_date, fd.insurance_expire_date
       FROM fleet_drivers fd
       WHERE fd.is_active = TRUE
         AND (
           (fd.inspection_expire_date IS NOT NULL
            AND fd.inspection_expire_date - CURRENT_DATE BETWEEN 0 AND 30)
           OR
           (fd.insurance_expire_date IS NOT NULL
            AND fd.insurance_expire_date - CURRENT_DATE BETWEEN 0 AND 30)
         )`,
    );

    for (const row of expiryRows as any[]) {
      if (!row.line_id && !row.atoms_account) continue;
      const items: string[] = [];
      if (row.inspection_expire_date) {
        const d = new Date(row.inspection_expire_date);
        const days = Math.round((d.getTime() - new Date(today).getTime()) / 86400000);
        if (days <= 30) items.push(`🚗 驗車到期：${row.inspection_expire_date}（剩 ${days} 天）`);
      }
      if (row.insurance_expire_date) {
        const d = new Date(row.insurance_expire_date);
        const days = Math.round((d.getTime() - new Date(today).getTime()) / 86400000);
        if (days <= 30) items.push(`🛡 保險到期：${row.insurance_expire_date}（剩 ${days} 天）`);
      }
      if (!items.length) continue;
      payloads.push({
        driverId: row.id, driverName: row.name, fleetId: row.fleet_id,
        channel: "both", type: "expiry",
        title: "⚠️ 車輛文件到期提醒",
        body:  `${row.name} 您好，以下文件即將到期：\n${items.join("\n")}`,
        lineUserId: row.line_id, atomsAccount: row.atoms_account,
        data: { items },
      });
    }

    // 觸發 5：合約到期前 5 天（fusingao_fleets.contract_expire_date）
    const { rows: contractRows } = await pool.query(
      `SELECT f.id, f.fleet_name, f.contract_expire_date, f.line_id AS fleet_line_id
       FROM fusingao_fleets f
       WHERE f.is_active = TRUE
         AND f.contract_expire_date IS NOT NULL
         AND f.contract_expire_date - CURRENT_DATE BETWEEN 0 AND 5`,
    );

    for (const row of contractRows as any[]) {
      const days = Math.round((new Date(row.contract_expire_date).getTime() - new Date(today).getTime()) / 86400000);
      payloads.push({
        fleetId: row.id,
        driverName: row.fleet_name,
        channel: row.fleet_line_id ? "both" : "app",
        type: "reminder",
        title: "⚠️ 合約即將到期",
        body:  `${row.fleet_name} 合約將於 ${row.contract_expire_date} 到期（剩 ${days} 天），請盡速聯繫續約。`,
        lineUserId:   row.fleet_line_id ?? null,
        atomsAccount: null,
        data: { contract_expire_date: row.contract_expire_date, days_remaining: days, fleet_id: row.id },
      });
    }

    if (payloads.length > 0) {
      const result = await sendBatchPush(payloads);
      console.log(`[ScheduledNotif] 到期提醒推播 → ${result.sent} 成功 / ${result.failed} 失敗`);
    } else {
      console.log("[ScheduledNotif] 今日無到期提醒需推播");
    }
  } catch (err: any) {
    console.error("[ScheduledNotif] 到期提醒失敗:", err.message);
  }
}

// ─── 啟動排程 ─────────────────────────────────────────────────────────────────

export function startScheduledNotifications(): void {
  const ms06 = msUntilTWHour(6, 0);
  const ms07 = msUntilTWHour(7, 0);
  const ms09 = msUntilTWHour(9, 0);
  const DAY  = 24 * 60 * 60 * 1000;

  console.log(`[ScheduledNotif] 06:00 地址同步將於 ${Math.round(ms06 / 60000)} 分鐘後首次啟動`);
  console.log(`[ScheduledNotif] 07:00 班表推播將於 ${Math.round(ms07 / 60000)} 分鐘後首次啟動`);
  console.log(`[ScheduledNotif] 09:00 到期提醒將於 ${Math.round(ms09 / 60000)} 分鐘後首次啟動`);

  // 06:00 — 蝦皮班表地址同步 + 管理員推播
  setTimeout(() => {
    runDailyLocationSync();
    setInterval(runDailyLocationSync, DAY);
  }, ms06);

  // 07:00 — 今日班表推播（司機）
  setTimeout(() => {
    runDailySchedulePush();
    setInterval(runDailySchedulePush, DAY);
  }, ms07);

  // 09:00 — 到期提醒（驗車/保險/合約）
  setTimeout(() => {
    runExpiryReminders();
    setInterval(runExpiryReminders, DAY);
  }, ms09);

  console.log("[ScheduledNotif] scheduler 已啟動 (06:00 地址同步 + 07:00 班表 + 09:00 到期提醒)");
}
