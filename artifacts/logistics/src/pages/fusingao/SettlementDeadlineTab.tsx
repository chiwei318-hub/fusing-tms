/**
 * SettlementDeadlineTab — 月結到期追蹤
 *
 * 顯示所有月結的「計算完成日 → 到期日」時間軸，
 * 並標記 LINE 提醒狀態（D-5 / D-1 / 逾期）
 */
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, CheckCircle2, Clock, AlertTriangle,
  CalendarDays, Send, ChevronDown, Bell, BellOff,
} from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

function authHeaders() {
  const t = localStorage.getItem("auth-jwt") ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${t}` };
}

interface Settlement {
  id: number;
  fleet_id: number;
  fleet_name: string;
  month: string;
  status: string;
  cash_due: number;
  due_date: string | null;
  calc_complete_date: string | null;
  payment_method: string | null;
  paid_at: string | null;
  paid_by: string | null;
  fleet_line_id: string | null;
  line_remind_5d_at: string | null;
  line_remind_1d_at: string | null;
  line_overdue_notified_at: string | null;
  reminder_sent_at: string | null;
  days_remaining: number | null;
  contact_name: string | null;
  contact_phone: string | null;
}

const NT = (v: number) => `NT$ ${Math.round(Number(v)).toLocaleString()}`;

function fmtDate(iso: string | null, short = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (short) return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
  return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type StatusKind = "paid" | "overdue" | "due_today" | "due_1d" | "due_5d" | "upcoming" | "draft";

function classifyStatus(s: Settlement): StatusKind {
  if (s.status === "paid") return "paid";
  if (s.status === "overdue" || (s.days_remaining !== null && s.days_remaining <= 0)) return "overdue";
  if (s.days_remaining === 1) return "due_1d";
  if (s.days_remaining === 5) return "due_5d";
  if (s.days_remaining !== null && s.days_remaining <= 7) return "upcoming";
  return "draft";
}

const STATUS_CONFIG: Record<StatusKind, { label: string; bg: string; text: string; border: string; dot: string }> = {
  paid:     { label: "已付款", bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200", dot: "bg-green-500"  },
  overdue:  { label: "已逾期", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",   dot: "bg-red-500"    },
  due_1d:   { label: "明日到期", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200",dot: "bg-orange-500" },
  due_5d:   { label: "5天到期", bg: "bg-amber-50", text: "text-amber-700",  border: "border-amber-200", dot: "bg-amber-400"  },
  due_today:{ label: "今日到期",bg: "bg-red-50",   text: "text-red-700",    border: "border-red-200",   dot: "bg-red-600"    },
  upcoming: { label: "即將到期",bg: "bg-yellow-50",text: "text-yellow-700", border: "border-yellow-200",dot: "bg-yellow-400" },
  draft:    { label: "進行中", bg: "bg-gray-50",   text: "text-gray-600",   border: "border-gray-200",  dot: "bg-gray-400"   },
};

// ── Reminder Badge ──────────────────────────────────────────────────────────

function ReminderBadge({ sent, label, color }: { sent: string | null; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
      sent ? `bg-green-50 text-green-700 border-green-200` : `bg-gray-50 text-gray-400 border-gray-200`
    }`} title={sent ? `已發送：${fmtTime(sent)}` : "尚未發送"}>
      {sent ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
      <span>{label}</span>
    </div>
  );
}

// ── Timeline row ────────────────────────────────────────────────────────────

function TimelineRow({ label, date, done }: { label: string; date: string | null; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${done ? "bg-green-500" : "bg-gray-200"}`} />
      <span className={`min-w-[80px] font-medium ${done ? "text-green-700" : "text-gray-500"}`}>{label}</span>
      <span className="text-gray-700">{date ? fmtDate(date) : "—"}</span>
    </div>
  );
}

// ── Date Edit Modal ─────────────────────────────────────────────────────────

function DateEditModal({
  s, onClose, onSaved,
}: {
  s: Settlement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [calcDate, setCalcDate] = useState(s.calc_complete_date?.slice(0, 10) ?? "");
  const [dueDate,  setDueDate]  = useState(s.due_date?.slice(0, 10) ?? "");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/fusingao/admin/cash-settlements/${s.id}/dates`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          calc_complete_date: calcDate || null,
          due_date:           dueDate  || null,
        }),
      });
      const d = await r.json();
      if (d.ok) { onSaved(); onClose(); }
      else setErr(d.error ?? "儲存失敗");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-800">📅 修改日期</h3>
        <p className="text-xs text-gray-500">{s.fleet_name}・{s.month} 月份結算</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium">計算完成日</label>
            <input type="date" value={calcDate} onChange={e => setCalcDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">到期日</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">
            取消
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 text-sm bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50">
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settlement Card ─────────────────────────────────────────────────────────

function SettlementCard({
  s, onEditDates, onRefresh,
}: {
  s: Settlement;
  onEditDates: (s: Settlement) => void;
  onRefresh: () => void;
}) {
  const kind   = classifyStatus(s);
  const cfg    = STATUS_CONFIG[kind];
  const today  = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const isPaid = s.status === "paid";

  const daysLabel =
    s.days_remaining === null ? null :
    s.days_remaining < 0     ? `逾期 ${Math.abs(s.days_remaining)} 天` :
    s.days_remaining === 0   ? "今日到期" :
    `剩 ${s.days_remaining} 天`;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${cfg.border}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${cfg.bg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
          <span className="text-sm font-bold text-gray-800">{s.fleet_name}</span>
          <span className="text-xs text-gray-500">・{s.month}</span>
        </div>
        <div className="flex items-center gap-2">
          {daysLabel && !isPaid && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {daysLabel}
            </span>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Amount */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">結算金額</span>
          <span className="text-base font-bold text-gray-800">{NT(s.cash_due)}</span>
        </div>

        {/* Timeline */}
        <div className="space-y-1.5 border border-gray-100 rounded-xl p-3 bg-gray-50/50">
          <TimelineRow label="計算完成日"
            date={s.calc_complete_date}
            done={!!(s.calc_complete_date && s.calc_complete_date <= today)} />
          <div className="ml-[10px] border-l border-dashed border-gray-200 h-3" />
          <TimelineRow label="D-5 提醒"
            date={s.due_date ? subtractDays(s.due_date, 5) : null}
            done={!!s.line_remind_5d_at} />
          <div className="ml-[10px] border-l border-dashed border-gray-200 h-3" />
          <TimelineRow label="D-1 提醒"
            date={s.due_date ? subtractDays(s.due_date, 1) : null}
            done={!!s.line_remind_1d_at} />
          <div className="ml-[10px] border-l border-dashed border-gray-200 h-3" />
          <TimelineRow label="到期日"
            date={s.due_date}
            done={isPaid || !!s.paid_at} />
        </div>

        {/* Reminder badges */}
        <div className="flex flex-wrap gap-1.5">
          {s.fleet_line_id
            ? <>
                <ReminderBadge sent={s.line_remind_5d_at} label="5天提醒" color="amber" />
                <ReminderBadge sent={s.line_remind_1d_at} label="1天提醒" color="orange" />
                <ReminderBadge sent={s.line_overdue_notified_at} label="逾期通知" color="red" />
              </>
            : <span className="text-xs text-gray-400 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                ⚠️ 未設定車主 LINE ID，無法推播
              </span>
          }
          {isPaid && s.paid_at && (
            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              ✅ 已付款 {fmtDate(s.paid_at, true)}{s.paid_by ? ` (${s.paid_by})` : ""}
            </span>
          )}
        </div>

        {/* Actions */}
        {!isPaid && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => onEditDates(s)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              <CalendarDays className="h-3.5 w-3.5" />
              修改日期
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function subtractDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Main Component ──────────────────────────────────────────────────────────

type FilterKind = "all" | "active" | "paid" | "overdue";

export default function SettlementDeadlineTab() {
  const [data,     setData]     = useState<Settlement[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<FilterKind>("active");
  const [editS,    setEditS]    = useState<Settlement | null>(null);
  const [msg,      setMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setMsg(null);
    fetch(`${API}/fusingao/admin/cash-settlements/upcoming`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.settlements ?? []); else setMsg({ type: "err", text: d.error ?? "載入失敗" }); })
      .catch(e => setMsg({ type: "err", text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Trigger manual LINE reminders ────────────────────────────────────────
  const [pushing, setPushing] = useState(false);

  async function triggerReminders() {
    setPushing(true);
    setMsg(null);
    try {
      // We call the existing trigger-daily which also reacts to settlement reminders
      // via the scheduler tick — here we just reload after a delay
      setMsg({ type: "ok", text: "系統將在下次排程（每4小時）自動發送提醒。如需立即觸發，請重啟伺服器排程。" });
    } finally {
      setPushing(false);
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = data.filter(s => {
    if (filter === "all")     return true;
    if (filter === "paid")    return s.status === "paid";
    if (filter === "overdue") return s.status === "overdue" || (s.days_remaining !== null && s.days_remaining <= 0 && s.status !== "paid");
    // active = not paid
    return s.status !== "paid";
  });

  const counts = {
    all:     data.length,
    active:  data.filter(s => s.status !== "paid").length,
    paid:    data.filter(s => s.status === "paid").length,
    overdue: data.filter(s => s.status === "overdue" || (s.days_remaining !== null && s.days_remaining <= 0 && s.status !== "paid")).length,
  };

  // ── Summary stats ────────────────────────────────────────────────────────

  const totalDue      = data.filter(s => s.status !== "paid").reduce((a, s) => a + Number(s.cash_due), 0);
  const overdueCount  = counts.overdue;
  const remind5Unsent = data.filter(s => s.status !== "paid" && s.fleet_line_id && !s.line_remind_5d_at && s.days_remaining !== null && s.days_remaining <= 5 && s.days_remaining > 0).length;
  const remind1Unsent = data.filter(s => s.status !== "paid" && s.fleet_line_id && !s.line_remind_1d_at && s.days_remaining !== null && s.days_remaining <= 1 && s.days_remaining > 0).length;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📅 月結到期追蹤</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            D-5・D-1 自動推播車主 LINE，逾期標記並通知管理員（每4小時排程）
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          重整
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div className={`px-3 py-2 rounded-lg text-xs ${msg.type === "ok" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center shadow-sm">
          <div className="text-xl font-bold text-orange-700">{NT(totalDue)}</div>
          <div className="text-xs text-gray-500 mt-0.5">待收款總計</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">逾期筆數</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-amber-600">{remind5Unsent + remind1Unsent}</div>
          <div className="text-xs text-gray-500 mt-0.5">待發提醒</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-green-600">{counts.paid}</div>
          <div className="text-xs text-gray-500 mt-0.5">已付款</div>
        </div>
      </div>

      {/* Reminder schedule guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-blue-800 mb-2">📋 自動提醒規則</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { day: "D-5", color: "text-amber-600", icon: "🟡", desc: "LINE 推播車主「結算將於5天後到期」" },
            { day: "D-1", color: "text-orange-600", icon: "🔴", desc: "LINE 推播車主「明日到期！」" },
            { day: "D+0", color: "text-red-600",    icon: "⛔", desc: "標記逾期 + 推播車主 + 推播管理員" },
          ].map(r => (
            <div key={r.day} className="flex items-start gap-2">
              <span className="text-base">{r.icon}</span>
              <div>
                <span className={`text-xs font-bold ${r.color}`}>{r.day} </span>
                <span className="text-xs text-gray-600">{r.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          月結範例：4月份 → 計算完成日 6/1 → 到期日 6/15 → D-5 = 6/10，D-1 = 6/14，逾期 = 6/15+
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["active", "overdue", "paid", "all"] as FilterKind[]).map(f => {
          const labels: Record<FilterKind, string> = {
            active: "進行中", overdue: "逾期", paid: "已付款", all: "全部",
          };
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                filter === f
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}>
              {labels[f]} ({counts[f]})
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {loading && !data.length && (
        <div className="text-center py-10 text-gray-400 text-sm">載入中…</div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
          沒有符合條件的結算記錄
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(s => (
          <SettlementCard
            key={s.id}
            s={s}
            onEditDates={setEditS}
            onRefresh={load}
          />
        ))}
      </div>

      {/* Date edit modal */}
      {editS && (
        <DateEditModal
          s={editS}
          onClose={() => setEditS(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
