import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, RefreshCw, DollarSign, CheckCircle2, XCircle,
  FileWarning, Search, ChevronDown, ChevronUp, Link2, Play,
  Plus, Trash2, ToggleLeft, ToggleRight, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface SyncConfig {
  id: number;
  name: string;
  sheet_url: string;
  interval_minutes: number;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_result: { inserted?: number; duplicates?: number; errors?: number; error?: string } | null;
}

// ── Google Sheet Sync Panel ───────────────────────────────────────────────────
function PenaltySyncPanel() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("https://docs.google.com/spreadsheets/d/1Z65luSGOGNYpFPyL1apLR8kxOvYV-U2VvPcVrmC5TzI/edit?gid=1070063351#gid=1070063351");
  const [newName, setNewName] = useState("Shopee 福興高罰款");
  const [newInterval, setNewInterval] = useState("60");
  const [running, setRunning] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  const loadConfigs = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/penalty-sync"));
      const d = await r.json();
      if (d.ok) setConfigs(d.configs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const addConfig = async () => {
    if (!newUrl || !newName) return;
    try {
      const r = await fetch(apiUrl("/penalty-sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, sheet_url: newUrl, interval_minutes: Number(newInterval) }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "已新增同步設定" });
      setShowAdd(false);
      loadConfigs();
    } catch (e: any) {
      toast({ title: "新增失敗", description: e.message, variant: "destructive" });
    }
  };

  const toggleActive = async (cfg: SyncConfig) => {
    try {
      await fetch(apiUrl(`/penalty-sync/${cfg.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !cfg.is_active }),
      });
      loadConfigs();
    } catch { /* ignore */ }
  };

  const deleteConfig = async (id: number) => {
    if (!confirm("確定刪除此同步設定？")) return;
    await fetch(apiUrl(`/penalty-sync/${id}`), { method: "DELETE" });
    loadConfigs();
  };

  const runNow = async (cfg: SyncConfig) => {
    setRunning(cfg.id);
    try {
      const r = await fetch(apiUrl(`/penalty-sync/${cfg.id}/run`), { method: "POST" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({
        title: "同步完成",
        description: `新增 ${d.inserted} 筆・重複跳過 ${d.duplicates} 筆・錯誤 ${d.errors} 筆`,
      });
      loadConfigs();
    } catch (e: any) {
      toast({ title: "同步失敗", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const fmtTime = (iso: string | null) => {
    if (!iso) return "從未同步";
    return new Date(iso).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-2 pt-3 px-4">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setExpanded((p) => !p)}
        >
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-gray-700">Google Sheet 自動同步</span>
            {configs.filter(c => c.is_active).length > 0 && (
              <Badge className="bg-green-100 text-green-700 text-xs">
                {configs.filter(c => c.is_active).length} 個啟用中
              </Badge>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {/* Config list */}
          {configs.length === 0 && !showAdd && (
            <p className="text-sm text-gray-400 text-center py-3">
              尚未設定任何同步來源。點「新增」加入 Google Sheet 連結。
            </p>
          )}

          {configs.map((cfg) => {
            const result = cfg.last_sync_result;
            const hasError = result?.error;
            return (
              <div key={cfg.id} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800">{cfg.name}</span>
                      <Badge variant="outline" className="text-xs">每 {cfg.interval_minutes} 分鐘</Badge>
                      {cfg.is_active
                        ? <Badge className="bg-green-100 text-green-700 text-xs">啟用</Badge>
                        : <Badge className="bg-gray-100 text-gray-500 text-xs">暫停</Badge>
                      }
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-1">{cfg.sheet_url}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        上次：{fmtTime(cfg.last_sync_at)}
                      </span>
                      {result && !hasError && (
                        <span className="text-green-600">
                          ↑{result.inserted ?? 0} 新 · ={result.duplicates ?? 0} 重複
                        </span>
                      )}
                      {hasError && (
                        <span className="text-red-500 truncate max-w-[200px]">⚠ {result?.error}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm" variant="outline" className="h-7 px-2"
                      onClick={() => runNow(cfg)}
                      disabled={running === cfg.id}
                      title="立即同步"
                    >
                      {running === cfg.id
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        : <Play className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2"
                      onClick={() => toggleActive(cfg)}
                      title={cfg.is_active ? "暫停" : "啟用"}
                    >
                      {cfg.is_active
                        ? <ToggleRight className="h-4 w-4 text-green-500" />
                        : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-600"
                      onClick={() => deleteConfig(cfg.id)}
                      title="刪除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add form */}
          {showAdd ? (
            <div className="border rounded-lg p-3 space-y-2 bg-blue-50 border-blue-200">
              <p className="text-xs font-semibold text-blue-700">新增 Google Sheet 同步來源</p>
              <Input
                className="h-8 text-sm"
                placeholder="名稱（例：Shopee 2月罰款）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                className="h-8 text-sm"
                placeholder="Google Sheet 連結（需可公開存取）"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">同步間隔（分鐘）</label>
                <Input
                  className="h-8 text-sm w-24"
                  type="number" min="10"
                  value={newInterval}
                  onChange={(e) => setNewInterval(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 bg-blue-600 hover:bg-blue-700 text-white" onClick={addConfig}>
                  儲存
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowAdd(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs border-dashed"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> 新增同步來源
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface PenaltyRecord {
  id: number;
  incident_date: string | null;
  soc: string | null;
  store_name: string | null;
  violation_type: string | null;
  fleet_name: string | null;
  driver_code: string | null;
  fine_amount: number;
  fine_month: string | null;
  deduction_month: string | null;
  scan_rate: string | null;
  vendor: string | null;
  appeal_status: string | null;
  appeal_fail_reason: string | null;
  notes: string | null;
  source: string;
}

interface PenaltySummary {
  ok: boolean;
  items: PenaltyRecord[];
  total: number;
  totalFine: number;
  appealPassed: number;
  appealFailed: number;
  nddCount: number;
  penaltyCount: number;
}

type SortField = "incident_date" | "fine_amount" | "store_name" | "driver_code";

export default function PenaltiesTab() {
  const { toast } = useToast();
  const [data, setData] = useState<PenaltySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [appealFilter, setAppealFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (appealFilter !== "all") params.set("appeal_status", appealFilter);
      const r = await fetch(apiUrl(`/penalties?${params}`));
      const d = await r.json();
      setData(d);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, appealFilter, page, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    ) : null;

  const filtered = (data?.items ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.store_name?.toLowerCase().includes(q) ||
      r.driver_code?.toLowerCase().includes(q) ||
      r.violation_type?.toLowerCase().includes(q) ||
      r.soc?.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = a[sortField] ?? "";
    let vb: string | number = b[sortField] ?? "";
    if (sortField === "fine_amount") { va = a.fine_amount; vb = b.fine_amount; }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const appealBadge = (status: string | null) => {
    if (status === "V") return <Badge className="bg-green-100 text-green-800 text-xs">申訴通過</Badge>;
    if (status === "X") return <Badge className="bg-red-100 text-red-800 text-xs">申訴失敗</Badge>;
    if (status === "Y") return <Badge className="bg-green-100 text-green-800 text-xs">通過</Badge>;
    if (status === "N") return <Badge className="bg-red-100 text-red-800 text-xs">未通過</Badge>;
    return <Badge variant="outline" className="text-xs text-gray-500">未申訴</Badge>;
  };

  const sourceBadge = (source: string) => {
    if (source === "NDD過刷異常") return <Badge className="bg-orange-100 text-orange-800 text-xs">NDD異常</Badge>;
    if (source === "sheet_sync")  return <Badge className="bg-green-100 text-green-800 text-xs">Sheet同步</Badge>;
    return <Badge className="bg-blue-100 text-blue-800 text-xs">罰款統計</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Google Sheet Sync Panel */}
      <PenaltySyncPanel />

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">總罰款筆數</p>
                <p className="text-xl font-bold">{data?.total ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">NDD罰款總額</p>
                <p className="text-xl font-bold text-red-600">
                  NT$ {(data?.totalFine ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">申訴通過</p>
                <p className="text-xl font-bold text-green-600">{data?.appealPassed ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-xs text-gray-500">申訴失敗</p>
                <p className="text-xl font-bold text-red-400">{data?.appealFailed ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Shopee 罰款記錄
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                className="pl-7 h-8 text-sm"
                placeholder="搜尋門市、司機、違規類型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="資料來源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                <SelectItem value="NDD過刷異常">NDD異常</SelectItem>
                <SelectItem value="罰款統計">罰款統計</SelectItem>
              </SelectContent>
            </Select>
            <Select value={appealFilter} onValueChange={(v) => { setAppealFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[120px] text-sm">
                <SelectValue placeholder="申訴狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="V">申訴通過(V)</SelectItem>
                <SelectItem value="X">申訴失敗(X)</SelectItem>
                <SelectItem value="Y">通過(Y)</SelectItem>
                <SelectItem value="N">未通過(N)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              重新整理
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 bg-gray-50">
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("incident_date")}
                  >
                    <span className="flex items-center gap-1">日期 <SortIcon field="incident_date" /></span>
                  </th>
                  <th className="text-left p-2">來源</th>
                  <th className="text-left p-2">SOC</th>
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("store_name")}
                  >
                    <span className="flex items-center gap-1">門市 <SortIcon field="store_name" /></span>
                  </th>
                  <th className="text-left p-2 hidden md:table-cell">違規類型</th>
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("driver_code")}
                  >
                    <span className="flex items-center gap-1">司機 <SortIcon field="driver_code" /></span>
                  </th>
                  <th
                    className="text-right p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("fine_amount")}
                  >
                    <span className="flex items-center justify-end gap-1">罰款 <SortIcon field="fine_amount" /></span>
                  </th>
                  <th className="text-left p-2 hidden lg:table-cell">掃描率</th>
                  <th className="text-left p-2">申訴</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      {loading ? "載入中..." : "無資料"}
                    </td>
                  </tr>
                )}
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-2 text-xs text-gray-600 whitespace-nowrap">{r.incident_date || "—"}</td>
                    <td className="p-2">{sourceBadge(r.source)}</td>
                    <td className="p-2 text-xs text-gray-500">{r.soc || "—"}</td>
                    <td className="p-2 text-xs max-w-[160px] truncate" title={r.store_name ?? ""}>
                      {r.store_name || "—"}
                    </td>
                    <td className="p-2 text-xs text-gray-600 hidden md:table-cell max-w-[180px] truncate" title={r.violation_type ?? ""}>
                      {r.violation_type || "—"}
                    </td>
                    <td className="p-2 text-xs font-medium">{r.driver_code || r.vendor || "—"}</td>
                    <td className="p-2 text-right">
                      {r.fine_amount > 0 ? (
                        <span className="font-medium text-red-600">
                          NT$ {r.fine_amount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-gray-500 hidden lg:table-cell">
                      {r.scan_rate || "—"}
                    </td>
                    <td className="p-2">{appealBadge(r.appeal_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(data?.total ?? 0) > pageSize && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>共 {data?.total} 筆</span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >上一頁</Button>
                <span className="px-2 py-1">第 {page + 1} 頁</span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= (data?.total ?? 0)}
                >下一頁</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
