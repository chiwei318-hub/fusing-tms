/**
 * 班表自動派車 — 變動偵測 + 3 步驟確認流程
 *
 * 第 1 步：選日期 → 「同步今日班表」→ 從 Google Sheets 拉資料並 diff
 * 第 2 步：確認後派車 → 路線沒改延用原司機 / 有改標記待重新指派
 * 第 3 步：推播給司機 → LINE 通知（可只推異動司機）
 */
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Trash2, ArrowRight,
  MessageCircle, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiUrl, authHeaders } from "@/lib/api";

interface Config {
  id: number;
  config_name: string;
  sheet_url: string;
  schedule_hour_tw: number;
  date_offset_days: number;
  is_active: boolean;
  last_run_at: string | null;
  last_run_date: string | null;
  last_run_status: string | null;
  last_run_count: number;
  last_run_assigned: number;
  last_run_error: string | null;
  notes: string | null;
}

interface Log {
  id: number;
  config_name: string;
  target_date: string;
  dispatch_orders_created: number;
  routes_created: number;
  routes_assigned: number;
  routes_skipped: number;
  routes_changed: number;
  routes_removed: number;
  status: string;
  error: string | null;
  detail: any;
  created_at: string;
}

interface DiffRoute {
  route_no: string;
  fleet_name: string;
  kind: "unchanged" | "driver_changed" | "new" | "removed";
  old_driver_id?: string;
  new_driver_id?: string;
  vehicle_type?: string;
  existing_driver_name?: string;
}

interface DiffResult {
  date: string;
  unchanged: DiffRoute[];
  driver_changed: DiffRoute[];
  new: DiffRoute[];
  removed: DiffRoute[];
  total_sheet: number;
}

interface PreviewData {
  date: string;
  total: number;
  diff: DiffResult;
  by_fleet: Record<string, any[]>;
}

type Step = "idle" | "syncing" | "preview" | "dispatching" | "done" | "notifying" | "notified";

const KIND_LABEL: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  unchanged:      { label: "延用原司機", color: "text-green-700",  bg: "bg-green-50  border-green-200",  icon: "✓" },
  driver_changed: { label: "司機變更",   color: "text-amber-700",  bg: "bg-amber-50  border-amber-200",  icon: "🔄" },
  new:            { label: "新增路線",   color: "text-blue-700",   bg: "bg-blue-50   border-blue-200",   icon: "＋" },
  removed:        { label: "已從班表移除", color: "text-red-600",   bg: "bg-red-50    border-red-200",    icon: "✕" },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function AutoDispatchTab() {
  const { toast } = useToast();
  const [configs, setConfigs]   = useState<Config[]>([]);
  const [logs, setLogs]         = useState<Log[]>([]);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showLog, setShowLog]   = useState(false);
  const [form, setForm] = useState({
    config_name: "蝦皮班表自動派車",
    sheet_url: "",
    schedule_hour_tw: "6",
    date_offset_days: "0",
    notes: "",
  });

  const [selConfig, setSelConfig]   = useState<Config | null>(null);
  const [date, setDate]             = useState(todayStr());
  const [step, setStep]             = useState<Step>("idle");
  const [preview, setPreview]       = useState<PreviewData | null>(null);
  const [dispatchResult, setDispatch] = useState<any | null>(null);
  const [notifyResult, setNotify]   = useState<any | null>(null);
  const [showAllUnchanged, setShowAllUnchanged] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgR, logR] = await Promise.all([
        fetch(apiUrl("/fusingao/auto-dispatch/configs"), { headers: authHeaders() }).then(r => r.json()),
        fetch(apiUrl("/fusingao/auto-dispatch/logs?limit=30"), { headers: authHeaders() }).then(r => r.json()),
      ]);
      const cfgs: Config[] = cfgR.configs ?? [];
      setConfigs(cfgs);
      setLogs(logR.logs ?? []);
      if (!selConfig && cfgs.length > 0) setSelConfig(cfgs[0]);
    } finally { setLoading(false); }
  }, [selConfig]);

  useEffect(() => { loadAll(); }, []);

  const reset = () => { setStep("idle"); setPreview(null); setDispatch(null); setNotify(null); };

  // Step 1 — sync preview with diff
  const handleSync = async () => {
    if (!selConfig) return;
    setStep("syncing");
    setPreview(null); setDispatch(null); setNotify(null);
    try {
      const r = await fetch(
        apiUrl(`/fusingao/auto-dispatch/preview?config_id=${selConfig.id}&date=${date}`),
        { headers: authHeaders() }
      );
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setPreview(d);
      setStep("preview");
    } catch (e: any) {
      toast({ title: `同步失敗：${e.message}`, variant: "destructive" });
      setStep("idle");
    }
  };

  // Step 2 — confirm dispatch
  const handleDispatch = async () => {
    if (!selConfig) return;
    setStep("dispatching");
    try {
      const r = await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${selConfig.id}/run`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ date }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setDispatch(d);
      setStep("done");
      loadAll();
    } catch (e: any) {
      toast({ title: `派車失敗：${e.message}`, variant: "destructive" });
      setStep("preview");
    }
  };

  // Step 3 — notify
  const handleNotify = async (changedOnly: boolean) => {
    setStep("notifying");
    try {
      const r = await fetch(apiUrl("/fusingao/auto-dispatch/notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ date, changed_only: changedOnly }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setNotify({ ...d, changed_only: changedOnly });
      setStep("notified");
    } catch (e: any) {
      toast({ title: `推播失敗：${e.message}`, variant: "destructive" });
      setStep("done");
    }
  };

  // Config CRUD
  const saveConfig = async () => {
    if (!form.sheet_url.trim()) return toast({ title: "請填寫 Google Sheets 網址", variant: "destructive" });
    try {
      const r = await fetch(apiUrl("/fusingao/auto-dispatch/configs"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          config_name: form.config_name,
          sheet_url: form.sheet_url,
          schedule_hour_tw: Number(form.schedule_hour_tw),
          date_offset_days: Number(form.date_offset_days),
          notes: form.notes || null,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "✅ 已新增設定" });
      setShowForm(false);
      setForm({ config_name: "蝦皮班表自動派車", sheet_url: "", schedule_hour_tw: "6", date_offset_days: "0", notes: "" });
      loadAll();
    } catch (e: any) { toast({ title: `失敗：${e.message}`, variant: "destructive" }); }
  };

  const deleteConfig = async (cfg: Config) => {
    if (!window.confirm(`確定刪除「${cfg.config_name}」？`)) return;
    await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${cfg.id}`), { method: "DELETE", headers: authHeaders() });
    if (selConfig?.id === cfg.id) { setSelConfig(null); reset(); }
    loadAll();
  };

  const toggleActive = async (cfg: Config) => {
    await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${cfg.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ is_active: !cfg.is_active }),
    });
    loadAll();
  };

  const isBusy = step === "syncing" || step === "dispatching" || step === "notifying";
  const diff = preview?.diff ?? null;
  const hasChanges = diff ? (diff.driver_changed.length + diff.new.length + diff.removed.length) > 0 : false;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">班表自動派車</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            偵測 Google Sheets 變動 → 路線沒改延用原司機 → 有改標記 + 推播通知
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="h-8 gap-1 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setShowForm(v => !v)}>
            <Plus className="h-3.5 w-3.5" />新增設定
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
          <p className="text-sm font-medium text-orange-800">新增班表來源</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">設定名稱</label>
              <input value={form.config_name} onChange={e => setForm(p => ({ ...p, config_name: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Google Sheets 網址</label>
              <input type="url" value={form.sheet_url} onChange={e => setForm(p => ({ ...p, sheet_url: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm font-mono"
                placeholder="https://docs.google.com/spreadsheets/d/..." />
              <p className="text-[11px] text-gray-400 mt-0.5">試算表請設為「知道連結的人可查看」</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">自動執行時間</label>
                <select value={form.schedule_hour_tw} onChange={e => setForm(p => ({ ...p, schedule_hour_tw: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}:00 台灣時間</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">派哪天的班</label>
                <select value={form.date_offset_days} onChange={e => setForm(p => ({ ...p, date_offset_days: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="-1">昨天（補跑）</option>
                  <option value="0">今天</option>
                  <option value="1">明天（提前）</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white h-8" onClick={saveConfig}>儲存</Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      {/* Config list */}
      {configs.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          尚無設定，點右上「新增設定」開始
        </div>
      ) : (
        <div className="space-y-1">
          {configs.map(cfg => (
            <div key={cfg.id}
              onClick={() => { if (!isBusy) { setSelConfig(cfg); reset(); } }}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all border
                ${selConfig?.id === cfg.id
                  ? "border-orange-300 bg-orange-50 shadow-sm"
                  : "border-gray-100 hover:border-gray-200 hover:bg-gray-50 bg-white"}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.is_active ? "bg-green-400" : "bg-gray-300"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{cfg.config_name}</p>
                <p className="text-[11px] font-mono text-gray-400 truncate">{cfg.sheet_url}</p>
                {cfg.last_run_status === "success" && (
                  <p className="text-[11px] text-green-600">
                    上次：{cfg.last_run_date} · 路線 {cfg.last_run_count} · 指派 {cfg.last_run_assigned}
                  </p>
                )}
                {cfg.last_run_status === "error" && (
                  <p className="text-[11px] text-red-500 truncate">{cfg.last_run_error}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); toggleActive(cfg); }}
                  className="text-[11px] text-gray-400 hover:text-amber-600 px-1 rounded">
                  {cfg.is_active ? "停用" : "啟用"}
                </button>
                <button onClick={e => { e.stopPropagation(); deleteConfig(cfg); }}
                  className="text-gray-300 hover:text-red-400 p-1 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3-step panel ──────────────────────────────────────────────────────── */}
      {selConfig && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">

          {/* Panel header + date */}
          <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-sm font-medium text-gray-700 truncate">{selConfig.config_name}</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">出車日期</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); reset(); }}
                disabled={isBusy}
                className="h-7 px-2 border border-gray-200 rounded text-xs bg-white disabled:opacity-50" />
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex border-b border-gray-100 text-[11px]">
            {[
              { n: 1, label: "同步班表", done: ["dispatching","done","notifying","notified"].includes(step), active: step === "syncing" || step === "preview" },
              { n: 2, label: "確認派車", done: ["done","notifying","notified"].includes(step), active: step === "dispatching" },
              { n: 3, label: "推播司機", done: step === "notified", active: step === "notifying" },
            ].map((s, i) => (
              <div key={s.n} className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors
                ${s.done ? "text-green-600 bg-green-50" : s.active ? "text-orange-600 bg-orange-50" : "text-gray-400"}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold
                  ${s.done ? "bg-green-500 text-white" : s.active ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {s.done ? "✓" : s.n}
                </span>
                {s.label}
                {i < 2 && <ArrowRight className="h-2.5 w-2.5 opacity-30 ml-0.5" />}
              </div>
            ))}
          </div>

          <div className="p-5 space-y-4">

            {/* IDLE */}
            {step === "idle" && (
              <div className="text-center py-6 space-y-4">
                <p className="text-sm text-gray-500">
                  系統將比對 <strong>{date}</strong> 的班表與現有派車單<br />
                  <span className="text-xs text-gray-400">路線沒改 → 延用原司機　路線有改 → 標記待重新指派</span>
                </p>
                <Button onClick={handleSync}
                  className="h-11 px-8 bg-blue-500 hover:bg-blue-600 text-white text-sm gap-2">
                  <RefreshCw className="h-4 w-4" />同步今日班表
                </Button>
              </div>
            )}

            {/* SYNCING */}
            {step === "syncing" && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">從 Google Sheets 拉取班表並比對差異...</p>
              </div>
            )}

            {/* PREVIEW with diff */}
            {step === "preview" && preview && diff && (
              <div className="space-y-4">

                {/* Summary pills */}
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: "unchanged",      count: diff.unchanged.length },
                    { key: "driver_changed", count: diff.driver_changed.length },
                    { key: "new",            count: diff.new.length },
                    { key: "removed",        count: diff.removed.length },
                  ] as const).filter(s => s.count > 0).map(s => {
                    const m = KIND_LABEL[s.key];
                    return (
                      <span key={s.key}
                        className={`inline-flex items-center gap-1 border text-xs px-3 py-1 rounded-full font-medium ${m.bg} ${m.color}`}>
                        <span>{m.icon}</span>{m.label} {s.count} 條
                      </span>
                    );
                  })}
                  {preview.total === 0 && <span className="text-sm text-gray-400">當日班表無資料</span>}
                </div>

                {/* No changes banner */}
                {!hasChanges && preview.total > 0 && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <p className="text-sm text-green-700">
                      班表與現有派車單<strong>完全一致</strong>，所有路線延用原司機，無需重新指派。
                    </p>
                  </div>
                )}

                {/* Changed sections */}
                {(["driver_changed", "new", "removed"] as const).map(kind => {
                  const routes = diff[kind];
                  if (routes.length === 0) return null;
                  const m = KIND_LABEL[kind];
                  return (
                    <div key={kind}>
                      <p className={`text-xs font-semibold mb-1.5 ${m.color}`}>{m.icon} {m.label}（{routes.length} 條）</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {routes.map((r, i) => (
                          <div key={i} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs ${m.bg}`}>
                            <span className={`font-mono font-medium w-20 shrink-0 ${m.color}`}>{r.route_no}</span>
                            <span className="text-gray-500 shrink-0">{r.fleet_name}</span>
                            {kind === "driver_changed" && (
                              <span className="text-amber-600 ml-auto">
                                {r.old_driver_id || r.existing_driver_name || "未指派"} → 工號 {r.new_driver_id}
                              </span>
                            )}
                            {kind === "new" && (
                              <span className="text-blue-600 ml-auto">
                                {r.new_driver_id ? `工號 ${r.new_driver_id}` : "（未配對司機）"}
                              </span>
                            )}
                            {kind === "removed" && (
                              <span className="text-red-500 ml-auto">
                                原指派：{r.existing_driver_name || r.old_driver_id || "未指派"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Unchanged (collapsed) */}
                {diff.unchanged.length > 0 && (
                  <div>
                    <button onClick={() => setShowAllUnchanged(v => !v)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1.5">
                      {showAllUnchanged ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      延用原司機 {diff.unchanged.length} 條（{showAllUnchanged ? "收合" : "展開"}）
                    </button>
                    {showAllUnchanged && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {diff.unchanged.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 text-xs">
                            <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                            <span className="font-mono text-gray-600 w-20 shrink-0">{r.route_no}</span>
                            <span className="text-gray-500">{r.fleet_name}</span>
                            <span className="ml-auto text-green-600">{r.existing_driver_name || `工號 ${r.new_driver_id}`}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" className="h-9 text-gray-500" onClick={handleSync}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />重新同步
                  </Button>
                  <Button onClick={handleDispatch} disabled={preview.total === 0}
                    className="h-9 px-6 bg-orange-500 hover:bg-orange-600 text-white gap-2 ml-auto">
                    確認派車<ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* DISPATCHING */}
            {step === "dispatching" && (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 text-orange-400 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">正在建立派車單 · 路線沒改延用原司機 · 有改標記待重新指派...</p>
              </div>
            )}

            {/* DONE */}
            {(["done","notifying","notified"] as Step[]).includes(step) && dispatchResult && (
              <div className="space-y-4">

                {/* Result summary */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-wrap gap-4">
                  {[
                    { label: "新建派車單", value: dispatchResult.ordersCreated, unit: "張", hi: false },
                    { label: "新增路線",   value: dispatchResult.routesCreated,  unit: "條", hi: false },
                    { label: "司機指派",   value: dispatchResult.routesAssigned, unit: "條", hi: false },
                    { label: "路線變動",   value: dispatchResult.routesChanged,  unit: "條", hi: dispatchResult.routesChanged > 0 },
                    { label: "移除路線",   value: dispatchResult.routesRemoved,  unit: "條", hi: dispatchResult.routesRemoved > 0 },
                    { label: "略過重複",   value: dispatchResult.routesSkipped,  unit: "條", hi: false },
                  ].filter(s => s.value > 0 || s.label === "新建派車單").map(s => (
                    <div key={s.label} className="text-center min-w-[56px]">
                      <p className={`text-xl font-bold ${s.hi ? "text-amber-600" : "text-green-700"}`}>
                        {s.value}<span className="text-sm font-normal">{s.unit}</span>
                      </p>
                      <p className={`text-[11px] ${s.hi ? "text-amber-600" : "text-green-600"}`}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Notify panel */}
                {step === "done" && (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 space-y-3">
                    <p className="text-sm font-medium text-blue-800">推播通知司機</p>
                    <div className="flex flex-wrap gap-2">
                      {(dispatchResult.routesChanged > 0 || dispatchResult.routesRemoved > 0) && (
                        <Button onClick={() => handleNotify(true)}
                          className="h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white gap-2">
                          <Bell className="h-4 w-4" />只推播異動司機
                        </Button>
                      )}
                      <Button onClick={() => handleNotify(false)}
                        className="h-9 px-4 bg-green-500 hover:bg-green-600 text-white gap-2">
                        <MessageCircle className="h-4 w-4" />推播全部司機
                      </Button>
                    </div>
                    <p className="text-xs text-blue-500">需司機在「車隊管理」設定 LINE ID 才能收到通知</p>
                  </div>
                )}

                {step === "notifying" && (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 flex items-center gap-3">
                    <RefreshCw className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                    <p className="text-sm text-blue-700">正在傳送 LINE 推播...</p>
                  </div>
                )}

                {step === "notified" && notifyResult && (
                  <div className="border border-green-200 rounded-xl p-4 bg-green-50">
                    <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {notifyResult.changed_only ? "異動推播完成" : "全員推播完成"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs">
                      <span className="text-green-700">成功 {notifyResult.sent} 位</span>
                      {notifyResult.failed > 0 && <span className="text-red-500">失敗 {notifyResult.failed} 位</span>}
                      {notifyResult.reason && <span className="text-gray-500">{notifyResult.reason}</span>}
                    </div>
                    {notifyResult.errors?.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {notifyResult.errors.map((e: string, i: number) => (
                          <p key={i} className="text-xs text-red-500">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-8 text-gray-400" onClick={reset}>
                    重新同步其他日期
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution log */}
      {logs.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
            onClick={() => setShowLog(v => !v)}>
            <span className="text-xs font-medium text-gray-700">執行紀錄（最近 {logs.length} 筆）</span>
            {showLog ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {showLog && (
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-2 text-xs">
                  {log.status === "ok" || log.status === "partial"
                    ? <CheckCircle2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${log.status === "partial" ? "text-amber-400" : "text-green-500"}`} />
                    : <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-red-400 shrink-0" />}
                  <span className="text-gray-500 shrink-0 w-20">{log.target_date}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-600">{log.config_name ?? "推播"}</span>
                    {log.status !== "error" && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-gray-400">
                        {log.detail?.action === "notify"
                          ? <span>推播 {log.routes_assigned} 位司機</span>
                          : <>
                              {log.routes_created > 0   && <span className="text-blue-500">+{log.routes_created} 新增</span>}
                              {log.routes_changed > 0   && <span className="text-amber-500">~{log.routes_changed} 變動</span>}
                              {log.routes_removed > 0   && <span className="text-red-400">-{log.routes_removed} 移除</span>}
                              {log.routes_skipped > 0   && <span>{log.routes_skipped} 略過</span>}
                            </>}
                      </div>
                    )}
                    {log.status === "error" && <p className="text-red-500 truncate">{log.error}</p>}
                  </div>
                  <span className="text-gray-400 shrink-0">
                    {new Date(log.created_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Format guide */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2">
        <p className="font-medium">📋 Google Sheets 班表格式（標題列自動配對）</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {[
            ["出車日期 / 日期 / date", "2025-04-25 或 2025/04/25"],
            ["路線號碼 / 路線號 / route_no", "例：KH-001"],
            ["司機工號 / 工號 / shopee_id", "蝦皮工號 → 對應 employee_id"],
            ["車隊名稱 / 車隊 / fleet_name", "部分匹配車隊名稱"],
            ["車型（選填）", "6.2T、一般…"],
          ].map(([col, note]) => (
            <div key={col} className="flex gap-2">
              <span className="font-mono shrink-0">{col}</span>
              <span className="text-amber-600">{note}</span>
            </div>
          ))}
        </div>
        <p className="text-amber-600 pt-1">
          LINE 推播需在「車隊管理 → 司機」設定 LINE ID。未設定仍可在 APP 查看今日路線。
        </p>
      </div>
    </div>
  );
}
