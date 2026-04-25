import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Send, ChevronDown, Users } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

interface DriverRow {
  driver_id: number;
  driver_name: string;
  employee_id: string;
  vehicle_plate: string;
  line_id: string | null;
  fleet_name: string;
  notification_id: number | null;
  notification_type: string | null;
  title: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  read_at: string | null;
  notification_status: string | null;
  line_status: string | null;
  atoms_status: string | null;
  route_label: string | null;
  assigned_at: string | null;
}

interface Summary {
  total: number;
  pushed: number;
  confirmed: number;
  unconfirmed: number;
}

interface ConfirmData {
  date: string;
  summary: Summary;
  drivers: DriverRow[];
}

function todayTW(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type Status = "confirmed" | "pushed_unconfirmed" | "not_pushed" | "no_line";

function getStatus(d: DriverRow): Status {
  if (d.confirmed_at) return "confirmed";
  if (d.notification_id) return "pushed_unconfirmed";
  if (!d.line_id) return "no_line";
  return "not_pushed";
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: JSX.Element }> = {
  confirmed:          { label: "已確認",   color: "bg-green-100 text-green-700 border-green-200",  icon: <CheckCircle2 className="h-3.5 w-3.5"/> },
  pushed_unconfirmed: { label: "待確認",   color: "bg-amber-100 text-amber-700 border-amber-200",  icon: <Clock className="h-3.5 w-3.5"/> },
  not_pushed:         { label: "未推播",   color: "bg-gray-100 text-gray-500 border-gray-200",    icon: <AlertCircle className="h-3.5 w-3.5"/> },
  no_line:            { label: "未設LINE", color: "bg-red-100 text-red-600 border-red-200",       icon: <AlertCircle className="h-3.5 w-3.5"/> },
};

export default function NotificationConfirmTab() {
  const token = localStorage.getItem("auth-jwt") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [date, setDate]         = useState(todayTW());
  const [fleets, setFleets]     = useState<{ id: number; name: string }[]>([]);
  const [fleetId, setFleetId]   = useState("");
  const [data, setData]         = useState<ConfirmData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [pushing, setPushing]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter]     = useState<"all" | Status>("all");

  // Load fleet list
  useEffect(() => {
    fetch(`${API}/fusingao/fleets`, { headers })
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setFleets(d.map((f: any) => ({ id: f.id, name: f.fleet_name })));
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setMsg(null);
    const q = new URLSearchParams({ date, ...(fleetId ? { fleet_id: fleetId } : {}) });
    fetch(`${API}/notifications/route-confirmations?${q}`, { headers })
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d);
        else setMsg({ type: "err", text: d.error ?? "載入失敗" });
      })
      .catch(e => setMsg({ type: "err", text: e.message }))
      .finally(() => setLoading(false));
  }, [date, fleetId]);

  useEffect(() => { load(); }, [load]);

  async function triggerDailyPush() {
    setPushing(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/notifications/trigger-daily`, { method: "POST", headers });
      const d = await r.json();
      setMsg({ type: d.ok ? "ok" : "err", text: d.message ?? d.error ?? "完成" });
      if (d.ok) setTimeout(load, 2000);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setPushing(false);
    }
  }

  async function triggerSheetCheck() {
    setChecking(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/notifications/trigger-sheet-check`, { method: "POST", headers });
      const d = await r.json();
      setMsg({ type: d.ok ? "ok" : "err", text: d.message ?? d.error ?? "完成" });
      if (d.ok) setTimeout(load, 2000);
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setChecking(false);
    }
  }

  const displayed = (data?.drivers ?? []).filter(d =>
    filter === "all" ? true : getStatus(d) === filter
  );

  const grouped = displayed.reduce<Record<string, DriverRow[]>>((acc, d) => {
    const k = d.fleet_name;
    if (!acc[k]) acc[k] = [];
    acc[k].push(d);
    return acc;
  }, {});

  const summary = data?.summary;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-800">📋 接單確認狀態</h2>
          <p className="text-xs text-gray-500 mt-0.5">司機收到 LINE 推播後回傳「確認接單」，此頁即時顯示確認進度</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={triggerSheetCheck}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "偵測中…" : "立即偵測班表異動"}
          </button>
          <button
            onClick={triggerDailyPush}
            disabled={pushing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {pushing ? "推播中…" : "立即推播當日班表"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            重整
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">日期</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium whitespace-nowrap">車隊</label>
          <div className="relative">
            <select
              value={fleetId}
              onChange={e => setFleetId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-orange-200 appearance-none"
            >
              <option value="">全部車隊</option>
              {fleets.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-2 h-3 w-3 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`px-3 py-2 rounded-lg text-xs font-medium ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {msg.type === "ok" ? "✅ " : "❌ "}{msg.text}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "總司機數",   val: summary.total,       color: "text-gray-700", bg: "bg-gray-50",   border: "border-gray-200" },
            { label: "已推播",     val: summary.pushed,      color: "text-blue-700", bg: "bg-blue-50",   border: "border-blue-200" },
            { label: "已確認",     val: summary.confirmed,   color: "text-green-700",bg: "bg-green-50",  border: "border-green-200" },
            { label: "待確認",     val: summary.unconfirmed, color: "text-amber-700",bg: "bg-amber-50",  border: "border-amber-200" },
          ].map(c => (
            <div key={c.label} className={`${c.bg} border ${c.border} rounded-xl p-3 text-center shadow-sm`}>
              <div className={`text-2xl font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {(["all", "confirmed", "pushed_unconfirmed", "not_pushed", "no_line"] as const).map(f => {
          const count = f === "all"
            ? (data?.drivers.length ?? 0)
            : (data?.drivers.filter(d => getStatus(d) === f).length ?? 0);
          const cfg = f === "all" ? null : STATUS_CONFIG[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-all ${
                filter === f
                  ? "bg-orange-500 text-white border-orange-500"
                  : cfg?.color ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {f === "all" ? `全部 (${count})` : `${cfg!.label} (${count})`}
            </button>
          );
        })}
      </div>

      {/* Drivers table grouped by fleet */}
      {loading && !data && (
        <div className="text-center py-10 text-gray-400 text-sm">載入中…</div>
      )}
      {!loading && displayed.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          無資料
        </div>
      )}

      {Object.entries(grouped).map(([fleetName, drivers]) => (
        <div key={fleetName} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">🚚 {fleetName}</span>
            <span className="text-xs text-gray-400">
              {drivers.filter(d => d.confirmed_at).length} / {drivers.length} 已確認
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {drivers.map(d => {
              const st = getStatus(d);
              const cfg = STATUS_CONFIG[st];
              return (
                <div key={d.driver_id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* Status icon */}
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium min-w-[60px] justify-center ${cfg.color}`}>
                    {cfg.icon}
                    <span>{cfg.label}</span>
                  </div>

                  {/* Driver info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{d.driver_name}</span>
                      {d.vehicle_plate && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{d.vehicle_plate}</span>
                      )}
                      {d.route_label && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          {d.route_label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {d.title && (
                        <span className="text-xs text-gray-500 truncate max-w-[180px]" title={d.title ?? ""}>{d.title}</span>
                      )}
                      {d.sent_at && (
                        <span className="text-xs text-gray-400">推播 {fmtTime(d.sent_at)}</span>
                      )}
                    </div>
                  </div>

                  {/* Confirmation time */}
                  <div className="text-right min-w-[90px]">
                    {d.confirmed_at ? (
                      <div>
                        <div className="text-xs font-medium text-green-600">✅ 已確認</div>
                        <div className="text-xs text-gray-400">{fmtTime(d.confirmed_at)}</div>
                      </div>
                    ) : d.notification_id ? (
                      <div className="text-xs text-amber-500">⏳ 等待確認</div>
                    ) : (
                      <div className="text-xs text-gray-300">尚未推播</div>
                    )}
                  </div>

                  {/* Channel status */}
                  {d.notification_id && (
                    <div className="flex gap-1">
                      {d.line_id && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                          d.line_status === "sent" ? "bg-green-50 text-green-600 border-green-200" : "bg-red-50 text-red-500 border-red-200"
                        }`}>
                          LINE
                        </span>
                      )}
                      {d.atoms_status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                          d.atoms_status === "sent" ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-red-50 text-red-500 border-red-200"
                        }`}>
                          Atoms
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
