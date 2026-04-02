import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw, Plus, Trash2, Play, Clock, CheckCircle2,
  AlertTriangle, Link2, History, ChevronDown, ChevronUp,
  Settings,
} from "lucide-react";

interface SyncConfig {
  id: number;
  name: string;
  sheet_url: string;
  interval_minutes: number;
  customer_name: string;
  pickup_address: string;
  cargo_description: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_result: {
    inserted?: number;
    duplicates?: number;
    errors?: number;
    warnings?: number;
    error?: string;
  } | null;
  created_at: string;
}

interface SyncLog {
  id: number;
  synced_at: string;
  inserted: number;
  duplicates: number;
  errors: number;
  warnings: number;
}

const EMPTY_FORM = {
  name: "",
  sheet_url: "",
  interval_minutes: 60,
  customer_name: "蝦皮電商配送",
  pickup_address: "（依路線倉庫）",
  cargo_description: "電商門市配送",
  is_active: true,
};

export default function SheetSyncTab() {
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [runningId, setRunningId] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<{ id: number; result: SyncConfig["last_sync_result"] } | null>(null);

  const [logsId, setLogsId] = useState<number | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(apiUrl("/api/sheet-sync"));
      const d = await r.json();
      if (d.ok) setConfigs(d.configs);
      else setError(d.error ?? "載入失敗");
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(cfg: SyncConfig) {
    setEditingId(cfg.id);
    setForm({
      name: cfg.name,
      sheet_url: cfg.sheet_url,
      interval_minutes: cfg.interval_minutes,
      customer_name: cfg.customer_name,
      pickup_address: cfg.pickup_address,
      cargo_description: cfg.cargo_description,
      is_active: cfg.is_active,
    });
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const url = editingId
        ? apiUrl(`/api/sheet-sync/${editingId}`)
        : apiUrl("/api/sheet-sync");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "儲存失敗");
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number, name: string) {
    if (!confirm(`確定要刪除「${name}」的同步設定？`)) return;
    await fetch(apiUrl(`/api/sheet-sync/${id}`), { method: "DELETE" });
    load();
  }

  async function runNow(cfg: SyncConfig) {
    setRunningId(cfg.id);
    setRunResult(null);
    try {
      const r = await fetch(apiUrl(`/api/sheet-sync/${cfg.id}/run`), { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setRunResult({ id: cfg.id, result: d.result });
        load();
      } else {
        alert(d.error ?? "同步失敗");
      }
    } catch (e: unknown) {
      alert(String(e));
    } finally {
      setRunningId(null);
    }
  }

  async function toggleActive(cfg: SyncConfig) {
    await fetch(apiUrl(`/api/sheet-sync/${cfg.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !cfg.is_active }),
    });
    load();
  }

  async function loadLogs(id: number) {
    if (logsId === id) { setLogsId(null); return; }
    setLogsId(id);
    setLogsLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/sheet-sync/${id}/logs`));
      const d = await r.json();
      setLogs(d.logs ?? []);
    } finally {
      setLogsLoading(false);
    }
  }

  function fmtTime(iso: string | null) {
    if (!iso) return "從未";
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
  }

  function minuteLabel(m: number) {
    if (m < 60) return `${m} 分鐘`;
    if (m === 60) return "1 小時";
    if (m % 60 === 0) return `${m / 60} 小時`;
    return `${m} 分鐘`;
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">試算表自動同步</h2>
          <p className="text-sm text-muted-foreground">
            定時從 Google Sheets 拉取路線資料，自動新增尚未匯入的路線，不重複建立已有的路線。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            新增同步
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {configs.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Link2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">尚未設定任何同步來源</p>
            <p className="text-sm mt-1">點擊「新增同步」貼上 Google Sheets 連結即可開始</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {configs.map(cfg => {
          const lastResult = cfg.last_sync_result;
          const hasError = lastResult?.error || (lastResult?.errors && lastResult.errors > 0);
          const isRunning = runningId === cfg.id;

          return (
            <Card key={cfg.id} className={cfg.is_active ? "" : "opacity-60"}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-semibold">{cfg.name}</CardTitle>
                      <Badge variant={cfg.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {cfg.is_active ? "啟用" : "暫停"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        每 {minuteLabel(cfg.interval_minutes)} 同步
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cfg.sheet_url}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive(cfg)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cfg)}>
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                      onClick={() => runNow(cfg)} disabled={isRunning}
                    >
                      {isRunning
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Play className="w-3.5 h-3.5" />
                      }
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => del(cfg.id, cfg.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {/* Last sync status */}
                <div className="flex items-center gap-4 text-[11px] flex-wrap">
                  <span className="text-muted-foreground">
                    上次同步：{fmtTime(cfg.last_sync_at)}
                  </span>
                  {lastResult && !lastResult.error && (
                    <>
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        新增 {lastResult.inserted ?? 0} 條路線
                      </span>
                      {(lastResult.duplicates ?? 0) > 0 && (
                        <span className="text-muted-foreground">略過重複 {lastResult.duplicates}</span>
                      )}
                      {(lastResult.errors ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <AlertTriangle className="w-3 h-3" />
                          錯誤 {lastResult.errors}
                        </span>
                      )}
                    </>
                  )}
                  {lastResult?.error && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertTriangle className="w-3 h-3" />
                      {lastResult.error.slice(0, 60)}
                    </span>
                  )}
                </div>

                {/* Inline run result */}
                {runResult?.id === cfg.id && runResult.result && !runResult.result.error && (
                  <Alert className="py-2 text-xs border-green-200 bg-green-50">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    <AlertDescription className="text-green-700">
                      同步完成：新增 {runResult.result.inserted} 條路線，
                      略過重複 {runResult.result.duplicates}，
                      錯誤 {runResult.result.errors}，
                      警告 {runResult.result.warnings}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Logs toggle */}
                <button
                  className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => loadLogs(cfg.id)}
                >
                  <History className="w-3 h-3" />
                  同步記錄
                  {logsId === cfg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {logsId === cfg.id && (
                  <div className="rounded border text-[11px] overflow-hidden">
                    {logsLoading ? (
                      <p className="p-3 text-muted-foreground text-center">載入中…</p>
                    ) : logs.length === 0 ? (
                      <p className="p-3 text-muted-foreground text-center">尚無記錄</p>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">時間</th>
                            <th className="text-center px-2 py-1.5 font-medium">新增</th>
                            <th className="text-center px-2 py-1.5 font-medium">重複</th>
                            <th className="text-center px-2 py-1.5 font-medium">錯誤</th>
                            <th className="text-center px-2 py-1.5 font-medium">警告</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map(log => (
                            <tr key={log.id} className="border-t">
                              <td className="px-3 py-1.5 text-muted-foreground">{fmtTime(log.synced_at)}</td>
                              <td className="text-center px-2 py-1.5 text-green-600 font-medium">{log.inserted}</td>
                              <td className="text-center px-2 py-1.5 text-muted-foreground">{log.duplicates}</td>
                              <td className={`text-center px-2 py-1.5 ${log.errors > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>{log.errors}</td>
                              <td className={`text-center px-2 py-1.5 ${log.warnings > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{log.warnings}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯同步設定" : "新增試算表同步"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>名稱</Label>
              <Input
                placeholder="例：蝦皮店配（福興高）"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Google Sheets 連結</Label>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={form.sheet_url}
                onChange={e => setForm(f => ({ ...f, sheet_url: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                貼上 Google Sheets 的分頁連結（含 gid 參數），系統自動轉為 CSV 匯出格式。
                請確認試算表已設為「知道連結的人可查看」。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>同步間隔（分鐘）</Label>
              <Input
                type="number"
                min={5}
                max={1440}
                value={form.interval_minutes}
                onChange={e => setForm(f => ({ ...f, interval_minutes: Number(e.target.value) }))}
              />
              <p className="text-[11px] text-muted-foreground">
                建議設定 60（每小時）～ 1440（每天一次）
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>客戶名稱</Label>
                <Input
                  value={form.customer_name}
                  onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>取貨地址</Label>
                <Input
                  value={form.pickup_address}
                  onChange={e => setForm(f => ({ ...f, pickup_address: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>貨物說明</Label>
              <Input
                value={form.cargo_description}
                onChange={e => setForm(f => ({ ...f, cargo_description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <Label>立即啟用自動同步</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.sheet_url}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
