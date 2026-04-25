import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, Play, Trash2, ChevronDown, ChevronRight, Eye, CheckCircle2, AlertCircle, Clock } from "lucide-react";
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
  config_id: number;
  config_name: string;
  target_date: string;
  dispatch_orders_created: number;
  routes_created: number;
  routes_assigned: number;
  routes_skipped: number;
  status: string;
  error: string | null;
  created_at: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export default function AutoDispatchTab() {
  const { toast } = useToast();
  const [configs, setConfigs]     = useState<Config[]>([]);
  const [logs, setLogs]           = useState<Log[]>([]);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [preview, setPreview]     = useState<any | null>(null);
  const [previewDate, setPreviewDate] = useState("");
  const [expandLog, setExpandLog] = useState(false);
  const [form, setForm] = useState({
    config_name: "蝦皮班表自動派車",
    sheet_url: "",
    schedule_hour_tw: "6",
    date_offset_days: "0",
    notes: "",
  });
  const [runDate, setRunDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, logRes] = await Promise.all([
        fetch(apiUrl("/fusingao/auto-dispatch/configs"), { headers: authHeaders() }).then(r => r.json()),
        fetch(apiUrl("/fusingao/auto-dispatch/logs?limit=30"), { headers: authHeaders() }).then(r => r.json()),
      ]);
      setConfigs(cfgRes.configs ?? []);
      setLogs(logRes.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const saveConfig = async () => {
    if (!form.sheet_url.trim()) return toast({ title: "請填寫 Google Sheets 網址", variant: "destructive" });
    try {
      await fetch(apiUrl("/fusingao/auto-dispatch/configs"), {
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
      toast({ title: "✅ 已新增自動派車設定" });
      setShowForm(false);
      setForm({ config_name: "蝦皮班表自動派車", sheet_url: "", schedule_hour_tw: "6", date_offset_days: "0", notes: "" });
      load();
    } catch (e: any) { toast({ title: `新增失敗：${e.message}`, variant: "destructive" }); }
  };

  const toggleActive = async (cfg: Config) => {
    await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${cfg.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ is_active: !cfg.is_active }),
    });
    load();
  };

  const deleteConfig = async (cfg: Config) => {
    if (!window.confirm(`確定刪除「${cfg.config_name}」？`)) return;
    await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${cfg.id}`), { method: "DELETE", headers: authHeaders() });
    load();
  };

  const runNow = async (cfg: Config) => {
    setRunningId(cfg.id);
    try {
      const body = runDate ? { date: runDate } : {};
      const r = await fetch(apiUrl(`/fusingao/auto-dispatch/configs/${cfg.id}/run`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: `✅ 執行完成：建立 ${d.ordersCreated} 張派車單，${d.routesAssigned} 條路線已指派` });
      load();
    } catch (e: any) {
      toast({ title: `執行失敗：${e.message}`, variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  const runPreview = async (cfg: Config) => {
    setPreviewId(cfg.id);
    setPreview(null);
    try {
      const date = previewDate || today;
      const r = await fetch(apiUrl(`/fusingao/auto-dispatch/preview?config_id=${cfg.id}&date=${date}`), { headers: authHeaders() });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setPreview(d);
    } catch (e: any) {
      toast({ title: `預覽失敗：${e.message}`, variant: "destructive" });
      setPreviewId(null);
    }
  };

  const statusBadge = (cfg: Config) => {
    if (!cfg.last_run_status) return <span className="text-xs text-gray-400">尚未執行</span>;
    if (cfg.last_run_status === "success")
      return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />上次成功 {cfg.last_run_date}</span>;
    return <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="h-3 w-3" />上次失敗 {cfg.last_run_date}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">班表自動派車</h2>
          <p className="text-xs text-gray-500 mt-0.5">設定 Google Sheets 班表來源，系統每天整點自動建立派車單並指派司機</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="h-8 gap-1 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setShowForm(v => !v)}>
            <Plus className="h-3.5 w-3.5" />新增設定
          </Button>
        </div>
      </div>

      {/* Pipeline diagram */}
      <div className="bg-gradient-to-r from-orange-50 to-blue-50 rounded-xl border border-orange-100 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-center">
          {[
            { icon: "📊", label: "Google Sheets", sub: "班表來源" },
            { icon: "🕕", label: "每日整點", sub: "自動同步" },
            { icon: "📋", label: "建立派車單", sub: "依車隊分組" },
            { icon: "🔗", label: "工號配對", sub: "自動指派司機" },
            { icon: "📱", label: "司機 APP", sub: "看到今日任務" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="bg-white rounded-lg px-3 py-2 border border-gray-200 shadow-sm min-w-[72px]">
                <div className="text-lg">{s.icon}</div>
                <div className="font-medium text-gray-700">{s.label}</div>
                <div className="text-[10px] text-gray-400">{s.sub}</div>
              </div>
              {i < 4 && <span className="text-gray-400 text-base">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
          <p className="text-sm font-medium text-orange-800">新增自動派車設定</p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">設定名稱</label>
              <input type="text" value={form.config_name}
                onChange={e => setForm(p => ({ ...p, config_name: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                placeholder="蝦皮班表自動派車" />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Google Sheets 網址</label>
              <input type="url" value={form.sheet_url}
                onChange={e => setForm(p => ({ ...p, sheet_url: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm font-mono"
                placeholder="https://docs.google.com/spreadsheets/d/..." />
              <p className="text-[11px] text-gray-400 mt-0.5">試算表須設為「知道連結的人可查看」</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">每日執行時間（台灣時間）</label>
                <select value={form.schedule_hour_tw}
                  onChange={e => setForm(p => ({ ...p, schedule_hour_tw: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white">
                  {HOUR_OPTIONS.map(h => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">派哪天的班（+N 天）</label>
                <select value={form.date_offset_days}
                  onChange={e => setForm(p => ({ ...p, date_offset_days: e.target.value }))}
                  className="w-full h-9 px-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="0">今天（當天班表）</option>
                  <option value="1">明天（提前一天）</option>
                  <option value="-1">昨天（補跑）</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">備注（選填）</label>
              <input type="text" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm"
                placeholder="可填寫說明" />
            </div>
          </div>
          <div className="pt-1">
            <p className="text-xs text-gray-500 mb-2">班表欄位需含（標題列自動配對，支援中英文）：</p>
            <div className="flex flex-wrap gap-1">
              {["出車日期", "路線號碼", "司機工號", "車隊名稱", "車型（選填）"].map(c => (
                <span key={c} className="text-[11px] bg-white border border-gray-200 rounded px-2 py-0.5 font-mono">{c}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white h-8 px-4"
              onClick={saveConfig}>儲存設定</Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      {/* Config cards */}
      {configs.length === 0 && !showForm && (
        <div className="text-center py-10 text-gray-400 text-sm">
          尚無設定，點右上「新增設定」開始
        </div>
      )}

      <div className="space-y-3">
        {configs.map(cfg => (
          <div key={cfg.id} className={`border rounded-xl overflow-hidden ${cfg.is_active ? "border-orange-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"}`}>
            {/* Card header */}
            <div className="flex items-start justify-between p-4 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${cfg.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                    {cfg.is_active ? "啟用" : "停用"}
                  </span>
                  <span className="font-medium text-gray-800 text-sm">{cfg.config_name}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    每日 {String(cfg.schedule_hour_tw).padStart(2, "0")}:00 台灣時間
                    {cfg.date_offset_days !== 0 && ` • 派 ${cfg.date_offset_days > 0 ? "明" : "昨"}天班表`}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-mono text-gray-400 truncate max-w-[400px]">{cfg.sheet_url}</div>
                <div className="mt-1">{statusBadge(cfg)}</div>
                {cfg.last_run_error && (
                  <div className="mt-1 text-xs text-red-500 bg-red-50 rounded px-2 py-1">{cfg.last_run_error}</div>
                )}
                {cfg.last_run_status === "success" && (
                  <div className="mt-1 text-xs text-gray-500">
                    建立路線 {cfg.last_run_count} 條 · 已指派 {cfg.last_run_assigned} 條
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-400 hover:text-amber-600"
                  onClick={() => toggleActive(cfg)}>
                  {cfg.is_active ? "停用" : "啟用"}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                  onClick={() => deleteConfig(cfg)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Manual run section */}
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex flex-wrap items-center gap-2">
              <input type="date" value={runDate} onChange={e => setRunDate(e.target.value)}
                placeholder={today}
                className="h-8 px-2 border border-gray-200 rounded text-xs bg-white" />
              <span className="text-xs text-gray-400">不選日期 = 依設定偏移</span>
              <Button size="sm" className="h-8 gap-1 bg-blue-500 hover:bg-blue-600 text-white"
                disabled={runningId === cfg.id}
                onClick={() => runNow(cfg)}>
                {runningId === cfg.id
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />執行中…</>
                  : <><Play className="h-3.5 w-3.5" />立即執行</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1"
                onClick={() => { setPreviewId(previewId === cfg.id ? null : cfg.id); setPreview(null); }}
                disabled={previewId === cfg.id && !preview}>
                <Eye className="h-3.5 w-3.5" />
                {previewId === cfg.id && !preview ? "載入中…" : "預覽班表"}
              </Button>
              {previewId === cfg.id && !preview && (
                (() => { runPreview(cfg); return null; })()
              )}
            </div>

            {/* Preview panel */}
            {previewId === cfg.id && preview && (
              <div className="border-t border-blue-100 p-4 bg-blue-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-blue-800">
                    📋 {preview.date} 班表預覽 — 共 {preview.total} 條路線
                  </p>
                  <button onClick={() => { setPreviewId(null); setPreview(null); }}
                    className="text-blue-400 hover:text-blue-600 text-xs">關閉</button>
                </div>
                {Object.entries(preview.by_fleet as Record<string, any[]>).map(([fleet, routes]) => (
                  <div key={fleet} className="mb-3">
                    <p className="text-xs font-medium text-gray-700 mb-1">{fleet}（{routes.length} 條）</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {routes.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white rounded border border-blue-100 px-2 py-1 text-xs">
                          <span className="font-mono text-gray-600 w-16 shrink-0">{r.route_no}</span>
                          <span className="text-gray-500">工號：{r.driver_id || "—"}</span>
                          {r.vehicle_type && <span className="text-gray-400">{r.vehicle_type}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {preview.total === 0 && (
                  <p className="text-xs text-blue-500">當日試算表無資料</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Execution logs */}
      {logs.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            onClick={() => setExpandLog(v => !v)}>
            <span className="text-xs font-medium text-gray-700">執行紀錄（最近 {logs.length} 筆）</span>
            {expandLog ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {expandLog && (
            <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  {log.status === "ok"
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    : <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                  <span className="text-gray-500 shrink-0">{log.target_date}</span>
                  <span className="text-gray-600 shrink-0">{log.config_name}</span>
                  {log.status === "ok" ? (
                    <span className="text-gray-500">
                      派車單 {log.dispatch_orders_created} 張 · 路線 {log.routes_created} · 指派 {log.routes_assigned} · 略過 {log.routes_skipped}
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

      {/* Sheet format guide */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-2">
        <p className="font-medium">📋 Google Sheets 班表格式說明</p>
        <p>試算表需有標題列，以下欄位名稱自動配對（不分大小寫、支援中英文）：</p>
        <table className="w-full text-xs mt-1">
          <thead><tr className="text-left text-amber-700"><th className="py-0.5 pr-4">欄位（任一名稱皆可）</th><th>說明</th></tr></thead>
          <tbody className="divide-y divide-amber-100">
            {[
              ["出車日期 / 日期 / date", "格式：2025-04-25 或 2025/04/25"],
              ["路線號碼 / 路線號 / route_no", "例：KH-001"],
              ["司機工號 / 工號 / shopee_id", "蝦皮工號，對應司機名單的 employee_id"],
              ["車隊名稱 / 車隊 / fleet_name", "對應系統車隊名稱（部分匹配）"],
              ["車型（選填）", "如：6.2T、一般"],
            ].map(([col, note]) => (
              <tr key={col}><td className="py-0.5 pr-4 font-mono">{col}</td><td className="text-amber-700">{note}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-amber-600">司機指派依「蝦皮工號」自動對應到車隊的旗下司機，未建立工號的司機路線仍會建立但不自動指派。</p>
      </div>
    </div>
  );
}
