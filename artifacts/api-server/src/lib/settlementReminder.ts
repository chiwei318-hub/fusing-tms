import { pool } from "@workspace/db";

const TICK_MS = 4 * 60 * 60 * 1000; // every 4 hours

async function tick() {
  try {
    // Find draft settlements with a due_date set and due within 7 days (or already overdue)
    // Only re-remind if reminder was never sent OR sent > 24 hours ago
    const { rows } = await pool.query(`
      SELECT s.id, s.fleet_id, s.month, s.due_date, s.cash_due::numeric AS cash_due,
             f.fleet_name, f.contact_name,
             (s.due_date - (NOW() AT TIME ZONE 'Asia/Taipei')::date)::int AS days_remaining
      FROM fleet_cash_settlements s
      JOIN fusingao_fleets f ON f.id = s.fleet_id
      WHERE s.status = 'draft'
        AND s.due_date IS NOT NULL
        AND s.due_date <= (NOW() AT TIME ZONE 'Asia/Taipei')::date + INTERVAL '7 days'
        AND (s.reminder_sent_at IS NULL OR s.reminder_sent_at < NOW() - INTERVAL '24 hours')
      ORDER BY s.due_date ASC
    `);

    for (const row of rows as any[]) {
      await pool.query(
        `INSERT INTO fleet_settlement_reminders (settlement_id, fleet_name, month, due_date, days_remaining, reminded_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [row.id, row.fleet_name, row.month, row.due_date, row.days_remaining]
      );
      await pool.query(
        `UPDATE fleet_cash_settlements SET reminder_sent_at = NOW() WHERE id = $1`,
        [row.id]
      );
      const tag = row.days_remaining < 0
        ? `【逾期 ${Math.abs(row.days_remaining)} 天】`
        : row.days_remaining === 0
          ? "【今日到期】"
          : `【剩 ${row.days_remaining} 天】`;
      console.log(`[SettlementReminder] ${tag} ${row.fleet_name} ${row.month} 結算 NT$${Number(row.cash_due).toLocaleString()} 截止 ${row.due_date}`);
    }

    if (rows.length > 0) {
      console.log(`[SettlementReminder] ${rows.length} 筆結算即將到期，提醒已記錄`);
    }
  } catch (err: any) {
    console.error("[SettlementReminder] scheduler error:", err.message);
  }
}

export function startSettlementReminderScheduler() {
  setTimeout(tick, 30_000); // first run after 30s
  setInterval(tick, TICK_MS);
  console.log("[SettlementReminder] scheduler started, checking every 4 hours");
}
