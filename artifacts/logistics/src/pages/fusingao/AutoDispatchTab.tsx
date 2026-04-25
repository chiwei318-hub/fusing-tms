/**
 * 班表自動派車 — 3 步驟確認流程
 *
 * 第 1 步：選日期 → 「同步今日班表」→ 從 Google Sheets 拉資料並預覽
 * 第 2 步：確認後派車 → 建立派車單 + 自動指派司機
 * 第 3 步：推播給司機 → 傳送 LINE 通知給已配對的司機
 */
import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Clock, Trash2,
  ArrowRight, MessageCircle,
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
  status: string;
  error: string | null;
  detail: any;
  created_at: string;
}

type Step = "idle" | "syncing" | "preview" | "dispatching" | "done" | "notifying" | "notified";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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

  // Per-config dispatch state
  const [selConfig, setSelConfig]   = useState<Config | null>(null);
  const [date, setDate]             = useState(todayStr());
  const [step, setStep]             = useState<Step>("idle");
  const [preview, setPreview]       = useState<any | null>(null);
  const [dispatchResult, setDispatch] = useState<any | null>(null);
  const [notifyResult, setNotify]   = useState<any | null>(null);

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
      // Auto-select first active config
      if (!selConfig && cfgs.length > 0) setSelConfig(cfgs[0]);
    } finally { setLoading(false); }
  }, [selConfig]);

  useEffect(() => { loadAll(); }, []);

  // ── Step 1: sync / preview ──────────────────────────────────────────────────
  const handleSync = async () => {
    if (!selConfig) return;
    setStep("syncing");
    setPreview(null);
    setDispatch(null);
    setNotify(null);
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

  // ── Step 2: confirm dispatch ────────────────────────────────────────────────
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

  // ── Step 3: notify drivers ──────────────────────────────────────────────────
  const handleNotify = async () => {
    setStep("notifying");
    try {
      const r = await fetch(apiUrl("/fusingao/auto-dispatch/notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ date }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setNotify(d);
      setStep("notified");
    } catch (e: any) {
      toast({ title: `推播失敗：${e.message}`, variant: "destructive" });
      setStep("done");
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    setStep("idle");
    setPreview(null);
    setDispatch(null);
    setNotify(null);
  };

  // ── Config CRUD ─────────────────────────────────────────────────────────────
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

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">班表自動派車</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            從 Google Sheets 同步班表 → 確認後建立派車單 → 推播通知司機
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

      {/* ── Add form ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
          <p className="text-sm font-medium text-orange-800">新增班表來源</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">設定名稱</label>
              <input value={form.config_name} onChange={e => setForm(p => ({ ...p, config_name: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                placeholder="蝦皮班表自動派車" />
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
                <label className="text-xs text-gray-600 mb-1 block">自動定時（台灣時間）</label>
                <select value={form.schedule_hour_tw} onChange={e => setForm(p => ({ ...p, schedule_hour_tw: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, "0")}:00 自動執行</option>
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
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white h-8"
              onClick={saveConfig}>儲存</Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      {/* ── Config list ────────────────────────────────────────────────────── */}
      {configs.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          尚無班表設定，點右上「新增設定」開始
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
                <p className="text-[11px] text-gray-400 truncate font-mono">{cfg.sheet_url}</p>
                {cfg.last_run_status === "success" && (
                  <p className="text-[11px] text-green-600">
                    上次：{cfg.last_run_date} · 路線 {cfg.last_run_count} 條 · 指派 {cfg.last_run_assigned} 位
                  </p>
                )}
                {cfg.last_run_status === "error" && (
                  <p className="text-[11px] text-red-500 truncate">{cfg.last_run_error}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); toggleActive(cfg); }}
                  className="text-[11px] text-gray-400 hover:text-amber-600 px-1 py-0.5 rounded transition-colors">
                  {cfg.is_active ? "停用" : "啟用"}
                </button>
                <button onClick={e => { e.stopPropagation(); deleteConfig(cfg); }}
                  className="text-gray-300 hover:text-red-400 p-1 rounded transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3-step dispatch panel ──────────────────────────────────────────── */}
      {selConfig && (
        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">

          {/* Panel header */}
          <div className="bg-gray-50 border-b border-gray-100 px-5 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-sm font-medium text-gray-700">{selConfig.config_name}</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-gray-500">出車日期</label>
              <input type="date" value={date} onChange={e => { setDate(e.target.value); reset(); }}
                disabled={isBusy}
                className="h-7 px-2 border border-gray-200 rounded text-xs bg-white disabled:opacity-50" />
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex border-b border-gray-100">
            {[
              { n: 1, label: "同步班表", active: step === "syncing" || step === "preview", done: ["dispatching","done","notifying","notified"].includes(step) },
              { n: 2, label: "確認派車", active: step === "dispatching", done: ["done","notifying","notified"].includes(step) },
              { n: 3, label: "推播司機", active: step === "notifying", done: step === "notified" },
            ].map((s, i) => (
              <div key={s.n} className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors
                ${s.done ? "text-green-600 bg-green-50" : s.active ? "text-orange-600 bg-orange-50" : "text-gray-400"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${s.done ? "bg-green-500 text-white" : s.active ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {s.done ? "✓" : s.n}
                </span>
                {s.label}
                {i < 2 && <ArrowRight className="h-3 w-3 opacity-30 ml-1" />}
              </div>
            ))}
          </div>

          {/* ── Step content ─────────────────────────────────────────────── */}
          <div className="p-5 space-y-4">

            {/* IDLE — just the sync button */}
            {step === "idle" && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-4">點下方按鈕，從 Google Sheets 拉取 <strong>{date}</strong> 的班表</p>
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
                <p className="text-sm text-gray-500">正在從 Google Sheets 拉取班表...</p>
              </div>
            )}

            {/* PREVIEW — show what will be dispatched */}
            {step === "preview" && preview && (
              <div className="space-y-4">
                {/* Summary pills */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-1 rounded-full">
                    📋 {Object.keys(preview.by_fleet).length} 個車隊
                  </span>
                  <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-1 rounded-full">
                    🚛 {preview.total} 條路線
                  </span>
                  <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-1 rounded-full">
                    👤 {Object.values(preview.by_fleet as Record<string, any[]>).flat().filter(r => r.driver_id).length} 位司機已配對
                  </span>
                </div>

                {/* Fleet breakdowns */}
                {preview.total === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">當日試算表無資料</p>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {Object.entries(preview.by_fleet as Record<string, any[]>).map(([fleet, routes]) => (
                      <div key={fleet}>
                        <p className="text-xs font-medium text-gray-600 mb-1">{fleet}（{routes.length} 條）</p>
                        <div className="space-y-1">
                          {routes.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                              <span className="font-mono text-gray-700 w-20 shrink-0">{r.route_no}</span>
                              {r.driver_id
                                ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />工號 {r.driver_id}</span>
                                : <span className="text-gray-400">（未配對司機）</span>}
                              {r.vehicle_type && <span className="ml-auto text-gray-400">{r.vehicle_type}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <Button variant="ghost" size="sm" className="h-9 text-gray-500" onClick={reset}>重新同步</Button>
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
                <p className="text-sm text-gray-500">正在建立派車單並指派司機...</p>
              </div>
            )}

            {/* DONE — dispatch result */}
            {(step === "done" || step === "notifying" || step === "notified") && dispatchResult && (
              <div className="space-y-4">
                {/* Result summary */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-wrap gap-4">
                  {[
                    { label: "新建派車單", value: dispatchResult.ordersCreated, unit: "張" },
                    { label: "建立路線", value: dispatchResult.routesCreated, unit: "條" },
                    { label: "司機已指派", value: dispatchResult.routesAssigned, unit: "條" },
                    { label: "略過重複", value: dispatchResult.routesSkipped, unit: "條" },
                  ].map(s => (
                    <div key={s.label} className="text-center min-w-[60px]">
                      <p className="text-xl font-bold text-green-700">{s.value}<span className="text-sm font-normal">{s.unit}</span></p>
                      <p className="text-[11px] text-green-600">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Notify drivers */}
                {step === "done" && (
                  <div className="border border-blue-100 rounded-xl p-4 bg-blue-50 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-blue-800">推播通知司機</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        傳送 LINE 訊息給今日已指派路線的司機（需設定 LINE ID）
                      </p>
                    </div>
                    <Button onClick={handleNotify}
                      className="h-9 px-4 bg-green-500 hover:bg-green-600 text-white gap-2 shrink-0">
                      <MessageCircle className="h-4 w-4" />推播給司機
                    </Button>
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
                      <CheckCircle2 className="h-4 w-4" />推播完成
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-green-700">
                      <span>成功：{notifyResult.sent} 位</span>
                      {notifyResult.failed > 0 && <span className="text-red-500">失敗：{notifyResult.failed} 位</span>}
                      {notifyResult.reason && <span className="text-gray-500">{notifyResult.reason}</span>}
                    </div>
                    {notifyResult.errors?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {notifyResult.errors.map((e: string, i: number) => (
                          <p key={i} className="text-xs text-red-500">{e}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Re-run */}
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="h-8 text-gray-500" onClick={reset}>
                    重新同步其他日期
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Execution log ──────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            onClick={() => setShowLog(v => !v)}>
            <span className="text-xs font-medium text-gray-700">執行紀錄（最近 {logs.length} 筆）</span>
            {showLog ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {showLog && (
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  {log.status === "ok" || log.status === "partial"
                    ? <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${log.status === "partial" ? "text-amber-400" : "text-green-500"}`} />
                    : <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  <span className="text-gray-500 shrink-0 w-20">{log.target_date}</span>
                  <span className="text-gray-600 shrink-0 truncate max-w-[100px]">{log.config_name ?? "推播"}</span>
                  {log.status !== "error" ? (
                    <span className="text-gray-500">
                      {log.detail?.action === "notify"
                        ? `推播 ${log.routes_assigned} 位司機`
                        : `派車單 ${log.dispatch_orders_created} · 路線 ${log.routes_created} · 指派 ${log.routes_assigned}`}
                    </span>
                  ) : (
                    <span className="text-red-500 truncate">{log.error}</span>
                  )}
                  <span className="ml-auto text-gray-400 shrink-0">
                    {new Date(log.created_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Format guide ───────────────────────────────────────────────────── */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2">
        <p className="font-medium">📋 Google Sheets 班表格式（標題列自動配對）</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {[
            ["出車日期 / 日期 / date", "2025-04-25 或 2025/04/25"],
            ["路線號碼 / 路線號 / route_no", "例：KH-001"],
            ["司機工號 / 工號 / shopee_id", "蝦皮工號，對應 employee_id"],
            ["車隊名稱 / 車隊 / fleet_name", "部分匹配車隊"],
            ["車型（選填）", "6.2T、一般…"],
          ].map(([col, note]) => (
            <div key={col} className="flex gap-2">
              <span className="font-mono shrink-0">{col}</span>
              <span className="text-amber-600">{note}</span>
            </div>
          ))}
        </div>
        <p className="text-amber-600 pt-1">
          LINE 推播需在「車隊管理 → 司機」填入司機的 LINE ID，才能傳送派車通知。
        </p>
      </div>
    </div>
  );
}
