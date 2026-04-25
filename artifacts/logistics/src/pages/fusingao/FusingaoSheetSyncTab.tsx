import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Database, RefreshCw, Plus, Play, Trash2, CheckCircle2,
  XCircle, Clock, Link, AlertTriangle, ShieldCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api/fusingao/${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("auth-jwt")}`, "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });

interface DbTable { name: string; count: number; latest: string | null; }
interface DbStatus {
  ok: boolean; db_type: string; db_connected: boolean;
  total_records: number; tables: DbTable[]; checked_at: string;
}
interface SyncConfig {
  id: number; sync_name: string; sync_type: string; sheet_url: string;
  interval_hours: number; is_active: boolean;
  last_sync_at: string | null; last_sync_status: string | null;
  last_sync_count: number | null; last_sync_error: string | null;
  last_sync_skipped: number | null; last_sync_errors: number | null;
}

export default function FusingaoSheetSyncTab() {
  const { toast } = useToast();
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [running, setRunning] = useState<Record<number, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sync_name: "", sync_type: "billing_trips", sheet_url: "", interval_hours: "1" });

  const loadDbStatus = async () => {
    setDbLoading(true);
    const data = await api("db-status").then(r => r.json()).catch(() => null);
    setDbStatus(data);
    setDbLoading(false);
  };

  const loadConfigs = async () => {
    const data = await api("sheet-sync/configs").then(r => r.json()).catch(() => null);
    if (data?.ok) setConfigs(data.configs);
  };

  useEffect(() => { loadDbStatus(); loadConfigs(); }, []);

  const createConfig = async () => {
    if (!form.sync_name || !form.sheet_url) {
      toast({ title: "請填寫同步名稱和 Sheet URL", variant: "destructive" }); return;
    }
    const data = await api("sheet-sync/configs", {
      method: "POST",
      body: JSON.stringify({ ...form, interval_hours: Number(form.interval_hours) }),
    }).then(r => r.json());
    if (data.ok) {
      toast({ title: "✅ 已新增同步設定" });
      setShowForm(false);
      setForm({ sync_name: "", sync_type: "billing_trips", sheet_url: "", interval_hours: "1" });
      loadConfigs();
    } else toast({ title: "新增失敗", description: data.error, variant: "destructive" });
  };

  const toggleActive = async (cfg: SyncConfig) => {
    await api(`sheet-sync/configs/${cfg.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !cfg.is_active }),
    });
    loadConfigs();
  };

  const deleteConfig = async (id: number) => {
    await api(`sheet-sync/configs/${id}`, { method: "DELETE" });
    loadConfigs();
  };

  const runNow = async (id: number, name: string) => {
    setRunning(r => ({ ...r, [id]: true }));
    const data = await api(`sheet-sync/configs/${id}/run`, { method: "POST" }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    setRunning(r => ({ ...r, [id]: false }));
    if (data.ok) {
      const newRows = data.inserted ?? 0;
      const updRows = data.updated ?? 0;
      const desc = newRows > 0 || updRows > 0
        ? `新增 ${newRows} 筆${updRows > 0 ? `，更新 ${updRows} 筆` : ""}`
        : data.warning ? `⚠️ ${data.warning}` : "無新資料";
      toast({ title: `✅ ${name} 同步完成`, description: desc });
    } else {
      toast({ title: `${name} 同步失敗`, description: data.error, variant: "destructive" });
    }
    loadConfigs();
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "從未";
    const d = new Date(s);
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  return (
    <div className="space-y-4 p-4">
      {/* ── DB Status Section ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-green-600" /> 資料庫持久化狀態
          </h2>
          <Button size="sm" variant="outline" onClick={loadDbStatus} disabled={dbLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${dbLoading ? "animate-spin" : ""}`} />重新檢查
          </Button>
        </div>

        {dbStatus ? (
          <div className="space-y-3">
            {/* Connection badge */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${dbStatus.db_connected ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {dbStatus.db_connected
                ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                : <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              }
              <div>
                <p className={`text-sm font-bold ${dbStatus.db_connected ? "text-green-700" : "text-red-700"}`}>
                  {dbStatus.db_connected ? "✅ 資料庫連線正常" : "❌ 資料庫連線失敗"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{dbStatus.db_type}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-500">總資料筆數</p>
                <p className="text-lg font-black text-gray-800">{dbStatus.total_records.toLocaleString()}</p>
              </div>
            </div>

            <div className={`p-3 rounded-lg bg-blue-50 border border-blue-200`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-700 font-medium">
                  所有匯入資料均寫入 Replit PostgreSQL 永久資料庫 — 系統重啟後資料不會消失
                </p>
              </div>
            </div>

            {/* Table counts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {dbStatus.tables.map(t => (
                <div key={t.name} className="flex items-center justify-between px-3 py-2 bg-white border rounded-lg text-xs">
                  <div>
                    <p className="font-medium text-gray-700">{t.name}</p>
                    {t.latest && <p className="text-gray-400 text-[10px]">最後更新：{fmtDate(t.latest)}</p>}
                  </div>
                  <Badge variant={t.count > 0 ? "default" : "secondary"} className="text-[11px] font-bold">
                    {t.count.toLocaleString()} 筆
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 text-right">最後檢查：{fmtDate(dbStatus.checked_at)}</p>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">
            {dbLoading ? "檢查中..." : "點擊「重新檢查」確認資料庫狀態"}
          </div>
        )}
      </div>

      <hr />

      {/* ── Google Sheets Auto-Sync Section ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-orange-500" /> Google Sheets 自動同步
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              每小時自動從 Google Sheets 抓取帳務資料並 UPSERT 進資料庫（不重複匯入）
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadConfigs}><RefreshCw className="w-3.5 h-3.5" /></Button>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />新增同步設定
            </Button>
          </div>
        </div>

        {/* CSV format guide */}
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Google Sheets 欄位格式（由左至右，第一列為標題）
          </p>
          <p className="font-mono text-[10px] text-amber-700 bg-amber-100 px-2 py-1 rounded">
            月份 | 類型 | 車隊名稱 | 倉別 | 區域 | 路線號碼 | 車型 | 司機工號 | 出車日期 | 金額
          </p>
          <p className="text-[10px] text-amber-600 mt-1">
            範例：2026-03 | NDD | 富詠運輸 | N-SOC | 台北 | FN-01-395-1 | 6.2T | 14681 | 2026-03-05 | 3200
          </p>
        </div>

        {/* New config form */}
        {showForm && (
          <Card className="border-orange-200 bg-orange-50 mb-3">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">新增 Google Sheets 同步設定</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">同步名稱 *</label>
                  <Input value={form.sync_name} onChange={e => setForm(p => ({ ...p, sync_name: e.target.value }))}
                    placeholder="例：富詠2026年帳務" className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">資料類型</label>
                  <select value={form.sync_type} onChange={e => setForm(p => ({ ...p, sync_type: e.target.value }))}
                    className="w-full h-8 text-xs border rounded px-2 mt-1">
                    <option value="billing_trips">帳務趟次（billing_trips）</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600">Google Sheets URL *</label>
                  <Input value={form.sheet_url} onChange={e => setForm(p => ({ ...p, sheet_url: e.target.value }))}
                    placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit" className="h-8 text-xs mt-1" />
                  <p className="text-[10px] text-gray-400 mt-0.5">試算表必須設為「知道連結的人可查看」</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">同步間隔（小時）</label>
                  <Input value={form.interval_hours} onChange={e => setForm(p => ({ ...p, interval_hours: e.target.value }))}
                    type="number" min="1" max="24" className="h-8 text-xs mt-1" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>取消</Button>
                <Button size="sm" className="h-8 text-xs bg-orange-600 hover:bg-orange-700" onClick={createConfig}>儲存設定</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Config list */}
        {configs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border border-dashed rounded-lg">
            <Link className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">尚未設定任何 Google Sheets 同步</p>
            <p className="text-xs mt-1">新增設定後，系統每小時自動同步並儲存至資料庫</p>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map(cfg => (
              <Card key={cfg.id} className={`overflow-hidden ${cfg.last_sync_status === "warning" ? "border-yellow-300" : ""}`}>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800 text-sm">{cfg.sync_name}</span>
                        <Badge className={`text-[10px] ${cfg.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {cfg.is_active ? "啟用中" : "已停用"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {cfg.sync_type === "billing_trips" ? "帳務趟次" : cfg.sync_type}
                        </Badge>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />每 {cfg.interval_hours} 小時同步
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 truncate font-mono">{cfg.sheet_url}</p>

                      {/* Sync status row */}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs">
                        <span className="text-gray-400">上次同步：{cfg.last_sync_at ? fmtDate(cfg.last_sync_at) : "從未"}</span>
                        {(cfg.last_sync_status === "success" || cfg.last_sync_status === "warning") && (
                          <>
                            <span className={`flex items-center gap-1 ${(cfg.last_sync_count ?? 0) > 0 ? "text-green-600" : "text-gray-400"}`}>
                              <CheckCircle2 className="w-3 h-3" /> 新增 {cfg.last_sync_count ?? 0} 筆
                            </span>
                            {(cfg.last_sync_skipped ?? 0) > 0 && (
                              <span className="text-blue-500 flex items-center gap-1">更新 {cfg.last_sync_skipped} 筆</span>
                            )}
                          </>
                        )}
                        {cfg.last_sync_status === "warning" && (cfg.last_sync_errors ?? 0) > 0 && (
                          <span className="text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {cfg.last_sync_errors} 筆格式錯誤
                          </span>
                        )}
                        {cfg.last_sync_status === "error" && (
                          <span className="text-red-500 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> 同步失敗
                          </span>
                        )}
                      </div>

                      {/* Warning / error detail */}
                      {(cfg.last_sync_status === "warning" || cfg.last_sync_status === "error") && cfg.last_sync_error && (
                        <div className={`mt-1.5 px-2 py-1 rounded text-[10px] ${cfg.last_sync_status === "warning" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                          ⚠️ {cfg.last_sync_error}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {/* Toggle switch */}
                      <button
                        onClick={() => toggleActive(cfg)}
                        title={cfg.is_active ? "點擊停用" : "點擊啟用"}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${cfg.is_active ? "bg-green-500" : "bg-gray-300"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cfg.is_active ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-500"
                        title="立即同步" onClick={() => runNow(cfg.id, cfg.sync_name)} disabled={running[cfg.id]}>
                        {running[cfg.id]
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                        title="刪除此同步" onClick={() => deleteConfig(cfg.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
