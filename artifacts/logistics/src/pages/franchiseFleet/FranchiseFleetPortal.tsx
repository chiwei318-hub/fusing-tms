import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Store, Truck, LayoutDashboard, Users, DollarSign, Calendar,
  ClipboardList, LogOut, RefreshCw, Plus, Pencil, Trash2,
  Check, X, ChevronRight, MapPin, Clock, AlertCircle,
  Phone, Car, Badge, Banknote, TrendingUp, FileText,
  Upload, Download, ListFilter, ChevronDown,
  Link2, Zap, ToggleLeft, ToggleRight, Settings2,
  Package2, CheckCircle2, XCircle, MinusCircle, Umbrella, CalendarDays,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge as BadgeUI } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

function useFleetApi() {
  const { token } = useAuth();
  return useCallback(async (method: string, path: string, body?: object) => {
    const res = await fetch(`${BASE_URL}/api/fleet${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "操作失敗");
    return data;
  }, [token]);
}

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    available: { label: "待命", color: "bg-green-100 text-green-700" },
    busy: { label: "忙碌", color: "bg-orange-100 text-orange-700" },
    offline: { label: "離線", color: "bg-slate-100 text-slate-500" },
    active: { label: "正常", color: "bg-green-100 text-green-700" },
    suspended: { label: "停用", color: "bg-red-100 text-red-600" },
    pending: { label: "待審", color: "bg-yellow-100 text-yellow-700" },
    approved: { label: "核准", color: "bg-green-100 text-green-700" },
    rejected: { label: "拒絕", color: "bg-red-100 text-red-600" },
    cancelled: { label: "已取消", color: "bg-slate-100 text-slate-400" },
  };
  const s = map[status] ?? { label: status, color: "bg-slate-100 text-slate-500" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: 即時調度牆
// ══════════════════════════════════════════════════════════════════════════════
const TRIP_STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: "完成", color: "bg-green-100 text-green-700" },
  pending:   { label: "待確認", color: "bg-amber-100 text-amber-700" },
  cancelled: { label: "取消", color: "bg-slate-100 text-slate-500" },
};

const EMPTY_TRIP = {
  driver_id: "", trip_date: new Date().toISOString().split("T")[0],
  customer_name: "", pickup_address: "", delivery_address: "",
  amount: "", driver_payout: "", status: "completed", notes: "",
};

function DashboardTab() {
  const api = useFleetApi();
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Driver status update
  const [driverStatusLoading, setDriverStatusLoading] = useState<Record<number, boolean>>({});

  // Trips state
  const [trips, setTrips] = useState<any[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [filterDriver, setFilterDriver] = useState("");

  // Dialogs
  const [showTripForm, setShowTripForm] = useState(false);
  const [editTrip, setEditTrip] = useState<any>(null);
  const [tripForm, setTripForm] = useState<any>(EMPTY_TRIP);
  const [savingTrip, setSavingTrip] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<"csv" | "sheet">("sheet");
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Google Sheet import state
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1JQR9RUtxmMt6VhxG_3on-1ftiQKzKQpFI8GO6JuBLvI/edit?gid=1480754828#gid=1480754828");
  const [sheetParsing, setSheetParsing] = useState(false);
  const [sheetTrips, setSheetTrips] = useState<any[]>([]);

  // Route assignment dialog
  const [assigningRoute, setAssigningRoute] = useState<any>(null);
  const [assignDriverId, setAssignDriverId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);

  // Auto-sync configs state
  const [syncConfigs, setSyncConfigs] = useState<any[]>([]);
  const [syncConfigsLoading, setSyncConfigsLoading] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [editSyncConfig, setEditSyncConfig] = useState<any>(null);
  const [syncForm, setSyncForm] = useState({ sync_name: "蝦皮班表", sheet_url: "", interval_minutes: "60" });
  const [savingSyncConfig, setSavingSyncConfig] = useState(false);
  const [runningSyncId, setRunningSyncId] = useState<number | null>(null);

  // Load dashboard
  const load = useCallback(async () => {
    try { setLoading(true); const d = await api("GET", "/dashboard"); setData(d); }
    catch { } finally { setLoading(false); }
  }, [api]);

  const handleDriverStatusChange = useCallback(async (driverId: number, newStatus: string) => {
    setDriverStatusLoading(p => ({ ...p, [driverId]: true }));
    try {
      await api("PATCH", `/drivers/${driverId}`, { status: newStatus });
      await load();
    } catch (e: any) {
      toast({ title: "狀態更新失敗", description: e.message, variant: "destructive" });
    } finally {
      setDriverStatusLoading(p => ({ ...p, [driverId]: false }));
    }
  }, [api, load, toast]);

  const openAddTripForDriver = useCallback((driver: any) => {
    setTripForm({ ...EMPTY_TRIP, driver_id: String(driver.id) });
    setEditTrip(null);
    setShowTripForm(true);
  }, []);

  const handleAssignRoute = useCallback(async () => {
    if (!assigningRoute || !assignDriverId) return;
    setAssigning(true);
    try {
      const driverId = Number(assignDriverId);
      const driverName = (data?.drivers ?? []).find((d: any) => d.id === driverId)?.name ?? "";
      if (assigningRoute._source === "trip") {
        // fleet_trips 指派：PATCH /trips/:id
        await api("PATCH", `/trips/${assigningRoute.id}`, { driver_id: driverId, status: "assigned" });
        const label = assigningRoute.notes?.split("｜")[0]?.trim() ?? `車趟 #${assigningRoute.id}`;
        toast({ title: "指派成功", description: `${label} 已指派給 ${driverName}` });
      } else {
        // 蝦皮訂單指派：POST /orders/:id/assign
        await api("POST", `/orders/${assigningRoute.id}/assign`, { driver_id: driverId });
        toast({ title: "指派成功", description: `${assigningRoute.route_id} 已指派給 ${driverName}` });
      }
      setAssigningRoute(null);
      setAssignDriverId("");
      await load();
    } catch (e: any) {
      toast({ title: "指派失敗", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  }, [api, assigningRoute, assignDriverId, data, load, toast]);

  useEffect(() => { load(); }, [load]);

  // Load trips
  const loadTrips = useCallback(async () => {
    try {
      setTripsLoading(true);
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, limit: "200" });
      if (filterDriver) params.set("driver_id", filterDriver);
      const d = await api("GET", `/trips?${params}`);
      setTrips(d.trips ?? []);
    } catch { toast({ title: "車趟載入失敗", variant: "destructive" }); }
    finally { setTripsLoading(false); }
  }, [api, dateFrom, dateTo, filterDriver]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  // ── Auto-sync callbacks ──────────────────────────────────────────────────
  const loadSyncConfigs = useCallback(async () => {
    try {
      setSyncConfigsLoading(true);
      const d = await api("GET", "/sheet-sync");
      setSyncConfigs(d.configs ?? []);
    } catch { /* silent */ }
    finally { setSyncConfigsLoading(false); }
  }, [api]);

  useEffect(() => { loadSyncConfigs(); }, [loadSyncConfigs]);

  const openNewSyncDialog = () => {
    setEditSyncConfig(null);
    setSyncForm({ sync_name: "蝦皮班表", sheet_url: "", interval_minutes: "60" });
    setShowSyncDialog(true);
  };

  const openEditSyncDialog = (cfg: any) => {
    setEditSyncConfig(cfg);
    setSyncForm({ sync_name: cfg.sync_name, sheet_url: cfg.sheet_url, interval_minutes: String(cfg.interval_minutes) });
    setShowSyncDialog(true);
  };

  const handleSyncSave = async () => {
    if (!syncForm.sheet_url.trim()) {
      toast({ title: "請貼上 Google 試算表連結", variant: "destructive" }); return;
    }
    setSavingSyncConfig(true);
    try {
      if (editSyncConfig) {
        await api("PATCH", `/sheet-sync/${editSyncConfig.id}`, {
          sync_name: syncForm.sync_name, sheet_url: syncForm.sheet_url.trim(),
          interval_minutes: Number(syncForm.interval_minutes),
        });
        toast({ title: "同步設定已更新" });
      } else {
        await api("POST", "/sheet-sync", {
          sync_name: syncForm.sync_name, sheet_url: syncForm.sheet_url.trim(),
          interval_minutes: Number(syncForm.interval_minutes),
        });
        toast({ title: "已新增同步設定" });
      }
      setShowSyncDialog(false);
      loadSyncConfigs();
    } catch (e: any) {
      toast({ title: "儲存失敗", description: e.message, variant: "destructive" });
    } finally { setSavingSyncConfig(false); }
  };

  const handleSyncToggle = async (cfg: any) => {
    try {
      await api("PATCH", `/sheet-sync/${cfg.id}`, { is_active: !cfg.is_active });
      loadSyncConfigs();
    } catch (e: any) {
      toast({ title: "切換失敗", description: e.message, variant: "destructive" });
    }
  };

  const handleSyncDelete = async (cfg: any) => {
    if (!confirm(`確定刪除「${cfg.sync_name}」同步設定？`)) return;
    try {
      await api("DELETE", `/sheet-sync/${cfg.id}`);
      toast({ title: "已刪除同步設定" });
      loadSyncConfigs();
    } catch (e: any) {
      toast({ title: "刪除失敗", description: e.message, variant: "destructive" });
    }
  };

  const handleManualSync = async (cfg: any) => {
    setRunningSyncId(cfg.id);
    try {
      const result = await api("POST", `/sheet-sync/${cfg.id}/run`);
      toast({ title: "同步完成", description: result.message ?? `寫入 ${result.upserted} 筆` });
      loadSyncConfigs();
      loadTrips();
    } catch (e: any) {
      toast({ title: "同步失敗", description: e.message, variant: "destructive" });
    } finally { setRunningSyncId(null); }
  };

  // Export with format selection
  const handleExport = useCallback(async (fmt: "csv" | "xlsx") => {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, format: fmt });
    const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const url = `${BASE_URL}/api/fleet/trips/export?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `車趟記錄_${dateFrom}_${dateTo}.${fmt}`;
    a.click();
  }, [token, dateFrom, dateTo]);

  // Parse CSV or XLSX file for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();

    const parseRows = (headers: string[], dataRows: string[][]) => {
      const parsed = dataRows
        .map(values => {
          const row: any = {};
          headers.forEach((h, i) => { row[h] = String(values[i] ?? "").trim(); });
          return row;
        })
        .filter(r => Object.values(r).some(v => String(v).trim()));
      setImportRows(parsed);
      setImportErrors([]);
    };

    if (ext === "xlsx" || ext === "xls") {
      // XLSX parsing via SheetJS
      import("xlsx").then(XLSX => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const data = ev.target?.result;
          const wb = XLSX.read(data, { type: "array", cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          if (json.length < 2) { toast({ title: "Excel 格式錯誤，需有標題列", variant: "destructive" }); return; }
          const headers = json[0].map((h: any) => String(h).trim());
          const rows = json.slice(1).map(row =>
            headers.map((_, i) => {
              const v = row[i];
              if (v instanceof Date) return v.toISOString().split("T")[0];
              return String(v ?? "").trim();
            })
          );
          parseRows(headers, rows);
        };
        reader.readAsArrayBuffer(file);
      });
    } else {
      // CSV parsing
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = (ev.target?.result as string ?? "").replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { toast({ title: "CSV 格式錯誤，需有標題列", variant: "destructive" }); return; }
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
        const rows = lines.slice(1).map(line =>
          line.split(",").map(v => v.replace(/^"|"$/g, "").trim())
        );
        parseRows(headers, rows);
      };
      reader.readAsText(file, "utf-8");
    }
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const d = await api("POST", "/trips/import", { rows: importRows });
      toast({ title: `已匯入 ${d.inserted} 筆車趟`, description: d.errors?.length ? `${d.errors.length} 筆錯誤` : undefined });
      if (d.errors?.length) setImportErrors(d.errors);
      else { setShowImport(false); setImportRows([]); setSheetTrips([]); }
      loadTrips();
    } catch (e: any) {
      toast({ title: "匯入失敗", description: e.message, variant: "destructive" });
    } finally { setImporting(false); }
  };

  // Parse Google Sheet schedule
  const handleParseSheet = async () => {
    if (!sheetUrl.trim()) { toast({ title: "請貼上試算表連結", variant: "destructive" }); return; }
    setSheetParsing(true);
    setSheetTrips([]);
    try {
      const d = await api("POST", "/trips/parse-sheet", { url: sheetUrl.trim() });
      setSheetTrips(d.trips ?? []);
      setImportRows(d.trips ?? []);
      toast({ title: `解析完成：${d.total} 條路線`, description: "請確認後點「確認匯入」" });
    } catch (e: any) {
      toast({ title: "解析失敗", description: e.message, variant: "destructive" });
    } finally { setSheetParsing(false); }
  };

  // Save trip
  const openAddTrip = () => { setTripForm(EMPTY_TRIP); setEditTrip(null); setShowTripForm(true); };
  const openEditTrip = (t: any) => {
    setTripForm({
      driver_id: t.driver_id ?? "",
      trip_date: t.trip_date ? String(t.trip_date).split("T")[0] : EMPTY_TRIP.trip_date,
      customer_name: t.customer_name ?? "",
      pickup_address: t.pickup_address ?? "",
      delivery_address: t.delivery_address ?? "",
      amount: t.amount ?? "",
      driver_payout: t.driver_payout ?? "",
      status: t.status ?? "completed",
      notes: t.notes ?? "",
    });
    setEditTrip(t);
    setShowTripForm(true);
  };
  const handleSaveTrip = async () => {
    if (!tripForm.pickup_address && !tripForm.delivery_address) {
      toast({ title: "請填寫起點或終點", variant: "destructive" }); return;
    }
    setSavingTrip(true);
    try {
      const payload = {
        ...tripForm,
        driver_id: tripForm.driver_id ? Number(tripForm.driver_id) : null,
        amount: Number(tripForm.amount || 0),
        driver_payout: tripForm.driver_payout !== "" ? Number(tripForm.driver_payout) : null,
      };
      if (editTrip) await api("PATCH", `/trips/${editTrip.id}`, payload);
      else await api("POST", "/trips", payload);
      toast({ title: editTrip ? "已更新車趟" : "車趟已新增" });
      setShowTripForm(false);
      loadTrips();
    } catch (e: any) {
      toast({ title: "儲存失敗", description: e.message, variant: "destructive" });
    } finally { setSavingTrip(false); }
  };

  const handleDeleteTrip = async (id: number) => {
    if (!confirm("確定刪除此車趟記錄？")) return;
    await api("DELETE", `/trips/${id}`);
    toast({ title: "已刪除" });
    loadTrips();
  };

  const drivers = data?.drivers ?? [];
  const orders = data?.active_orders ?? [];
  const leaves = data?.pending_leaves ?? [];
  const todayRoutes: any[] = data?.today_unassigned_routes ?? [];
  const todayTrips: any[] = data?.today_unassigned_trips ?? [];
  const unassignedCount = todayRoutes.length + todayTrips.length;
  const onlineCount = drivers.filter((d: any) => d.status !== "offline").length;
  const busyCount = drivers.filter((d: any) => d.status === "busy").length;
  const availableCount = drivers.filter((d: any) => d.status === "available" && !d.on_leave_today).length;

  const tripTotal = trips.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const tripPayout = trips.reduce((s, t) => s + Number(t.driver_payout ?? 0), 0);

  const NT = (v: number) => `NT$ ${v.toLocaleString()}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">即時調度牆</h2>
        <Button variant="outline" size="sm" onClick={() => { load(); loadTrips(); }} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> 重新整理
        </Button>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="flex items-center justify-center h-24 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 載入中…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "旗下司機", value: drivers.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "可出車", value: availableCount, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
              { label: "執行中", value: busyCount, icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "待派班表", value: unassignedCount, icon: Package2, color: unassignedCount > 0 ? "text-red-600" : "text-slate-400", bg: unassignedCount > 0 ? "bg-red-50" : "bg-slate-50" },
            ].map(c => (
              <Card key={c.label} className="border-0 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg}`}>
                    <c.icon className={`w-5 h-5 ${c.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-800">{c.value}</p>
                    <p className="text-xs text-slate-500">{c.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Driver status grid */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-600">司機即時狀態</CardTitle>
            </CardHeader>
            <CardContent>
              {drivers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">尚無旗下司機</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {drivers.map((d: any) => {
                    const canGo = d.status === "available" && !d.on_leave_today;
                    const onLeave = !!d.on_leave_today;
                    return (
                      <div key={d.id} className={`flex items-center gap-2 p-3 rounded-xl border ${canGo ? "bg-green-50 border-green-200" : onLeave ? "bg-purple-50 border-purple-200" : d.status === "busy" ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-transparent"}`}>
                        {/* Avatar + 可出車燈 */}
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                            {d.name?.charAt(0)}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${canGo ? "bg-green-500" : onLeave ? "bg-purple-500" : d.status === "busy" ? "bg-orange-500" : "bg-slate-400"}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-800 text-sm truncate">{d.name}</p>
                            {/* 可出車標籤 */}
                            {canGo && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">
                                <CheckCircle2 className="w-2.5 h-2.5" />可出車
                              </span>
                            )}
                            {onLeave && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full shrink-0">
                                <Umbrella className="w-2.5 h-2.5" />今日請假
                              </span>
                            )}
                            {!canGo && !onLeave && d.status === "busy" && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full shrink-0">
                                <Truck className="w-2.5 h-2.5" />出車中
                              </span>
                            )}
                            {!canGo && !onLeave && d.status === "offline" && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                                <MinusCircle className="w-2.5 h-2.5" />未上線
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{d.vehicle_type} · {d.license_plate || "未填車牌"}</p>
                        </div>

                        {/* Status dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="flex items-center gap-1 focus:outline-none"
                              disabled={!!driverStatusLoading[d.id]}
                              title="點擊切換狀態"
                            >
                              {driverStatusLoading[d.id]
                                ? <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                                : <StatusBadge status={d.status} />}
                              <ChevronDown className="w-3 h-3 text-slate-400" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32">
                            {[
                              { value: "available", label: "待命", color: "text-green-600" },
                              { value: "busy",      label: "忙碌", color: "text-orange-600" },
                              { value: "offline",   label: "離線", color: "text-slate-500" },
                            ].map(opt => (
                              <DropdownMenuItem
                                key={opt.value}
                                className={`text-xs cursor-pointer ${opt.color} ${d.status === opt.value ? "font-bold bg-slate-50" : ""}`}
                                onClick={() => handleDriverStatusChange(d.id, opt.value)}
                              >
                                {d.status === opt.value && <Check className="w-3 h-3 mr-1.5 inline" />}{opt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Quick add trip */}
                        <button
                          onClick={() => openAddTripForDriver(d)}
                          title={`新增 ${d.name} 的車趟`}
                          className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 px-2 py-1 rounded-lg transition-colors shrink-0 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />車趟
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 待派班表（近 7 日） */}
          <Card className={`border-0 shadow-sm ${unassignedCount > 0 ? "ring-1 ring-red-200" : ""}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package2 className={`w-4 h-4 ${unassignedCount > 0 ? "text-red-500" : "text-slate-400"}`} />
                  <CardTitle className="text-sm font-semibold text-slate-600">
                    待派班表
                  </CardTitle>
                  {unassignedCount > 0 && (
                    <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">{unassignedCount}</span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">尚未指派司機・最多顯示 50 筆</span>
              </div>
            </CardHeader>
            <CardContent>
              {unassignedCount === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-5 text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm">近 7 日所有班表均已派車</span>
                  <button
                    onClick={() => { setImportRows([]); setSheetTrips([]); setImportErrors([]); setShowImport(true); }}
                    className="mt-1 text-xs text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
                  >
                    ＋ 匯入班表 / 連結 Google 試算表
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 蝦皮訂單（orders 表） */}
                  {todayRoutes.map((r: any) => (
                    <div key={`order-${r.id}`} className="flex items-center gap-3 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                      <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                        <Package2 className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-700">{r.route_id}</span>
                          {r.dispatch_dock && r.dispatch_dock !== "—" && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">碼頭 {r.dispatch_dock}</span>
                          )}
                          {(r.station_count ?? 0) > 0 && (
                            <span className="text-[10px] text-slate-500">{r.station_count} 站</span>
                          )}
                          {r.required_vehicle_type && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{r.required_vehicle_type}</span>
                          )}
                          {r.shopee_rate && (
                            <span className="text-[10px] text-green-700 font-semibold">NT${Number(r.shopee_rate).toLocaleString()}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{r.pickup_address}</p>
                      </div>
                      {r.pickup_time && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                          <Clock className="w-3 h-3" />
                          {r.pickup_time}
                        </div>
                      )}
                      <button
                        onClick={() => { setAssigningRoute(r); setAssignDriverId(""); }}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        <Users className="w-3 h-3" />指派
                      </button>
                    </div>
                  ))}
                  {/* 班表匯入車趟（fleet_trips 表，status=pending，driver_id IS NULL，近7日） */}
                  {todayTrips.map((t: any) => {
                    const tripDateStr = t.trip_date ? String(t.trip_date).split("T")[0] : "";
                    const tripDate = tripDateStr ? new Date(tripDateStr + "T00:00:00") : null;
                    const today = new Date(); today.setHours(0,0,0,0);
                    const isToday = tripDate?.toDateString() === today.toDateString();
                    const isTomorrow = tripDate ? (tripDate.getTime() - today.getTime()) === 86400000 : false;
                    const dateBadge = isToday ? "今日" : isTomorrow ? "明日" : tripDateStr ? `${tripDate!.getMonth()+1}/${tripDate!.getDate()}` : "";
                    const dateBadgeColor = isToday ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600";
                    return (
                    <div key={`trip-${t.id}`} className="flex items-center gap-3 p-2.5 bg-orange-50 border border-orange-100 rounded-xl">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                        <ClipboardList className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {dateBadge && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${dateBadgeColor}`}>{dateBadge}</span>
                          )}
                          <span className="font-mono text-xs font-bold text-slate-700">{t.notes?.split("｜")[0]?.trim() ?? `車趟 #${t.id}`}</span>
                          {t.notes?.includes("｜") && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{t.notes.split("｜")[1]?.trim()}</span>
                          )}
                          {t.notes?.split("｜")[2]?.trim() && (
                            <span className="text-[10px] text-slate-500">{t.notes.split("｜")[2]?.trim()}</span>
                          )}
                          <span className="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded font-medium">班表匯入</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t.pickup_address}</p>
                      </div>
                      <button
                        onClick={() => { setAssigningRoute({ ...t, _source: "trip" }); setAssignDriverId(""); }}
                        className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        <Users className="w-3 h-3" />指派
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {orders.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-600">進行中訂單</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {orders.map((o: any) => (
                    <div key={o.id} className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl">
                      <ClipboardList className="w-4 h-4 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">訂單 #{o.id}</p>
                        <p className="text-xs text-slate-500 truncate">{o.delivery_address}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {leaves.length > 0 && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-800 text-sm">有 {leaves.length} 筆待審請假申請</p>
                <p className="text-xs text-yellow-600 mt-0.5">請至「請假管理」標籤處理</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── 班表自動同步 ─────────────────────────────────────────── */}
      <div className="pt-2 border-t">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-slate-700 text-sm">班表自動同步</span>
            {syncConfigsLoading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openNewSyncDialog}>
            <Plus className="w-3.5 h-3.5" />新增同步設定
          </Button>
        </div>

        {syncConfigs.length === 0 && !syncConfigsLoading ? (
          <div className="text-center py-6 bg-indigo-50 rounded-xl border border-dashed border-indigo-200">
            <Link2 className="w-8 h-8 mx-auto mb-2 text-indigo-300" />
            <p className="text-sm text-slate-500">尚未設定自動同步</p>
            <p className="text-xs text-slate-400 mt-0.5">連結 Google 試算表，系統將自動定時匯入班表</p>
            <Button size="sm" className="mt-3 gap-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={openNewSyncDialog}>
              <Plus className="w-3.5 h-3.5" />立即設定
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {syncConfigs.map(cfg => {
              const isRunning = runningSyncId === cfg.id;
              const lastSyncDate = cfg.last_sync_at
                ? new Date(cfg.last_sync_at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                : null;
              const hasError = cfg.last_sync_status === "error";
              return (
                <div key={cfg.id} className={`rounded-xl border p-3 transition-colors ${cfg.is_active ? "bg-white border-indigo-100" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.is_active ? "bg-indigo-100" : "bg-slate-100"}`}>
                      <Link2 className={`w-4 h-4 ${cfg.is_active ? "text-indigo-600" : "text-slate-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{cfg.sync_name}</span>
                        {cfg.is_active
                          ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">自動同步中</span>
                          : <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">已停用</span>}
                        {hasError && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">上次失敗</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{cfg.sheet_url}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>每 {cfg.interval_minutes} 分鐘同步</span>
                        {lastSyncDate && <span>最後同步：{lastSyncDate}</span>}
                        {cfg.last_sync_count != null && <span>寫入 {cfg.last_sync_count} 筆</span>}
                      </div>
                      {hasError && cfg.last_sync_error && (
                        <p className="text-xs text-red-500 mt-1 truncate">錯誤：{cfg.last_sync_error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleManualSync(cfg)}
                        disabled={isRunning}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                        title="立即同步"
                      >
                        {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => openEditSyncDialog(cfg)}
                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                        title="編輯設定"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleSyncToggle(cfg)}
                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                        title={cfg.is_active ? "停用" : "啟用"}
                      >
                        {cfg.is_active ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                      </button>
                      <button
                        onClick={() => handleSyncDelete(cfg)}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 車趟記錄 ───────────────────────────────────────────────── */}
      <div className="pt-2 border-t">
        {/* Section header */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-700 text-sm">車趟記錄</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{trips.length} 筆</span>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setImportRows([]); setImportErrors([]); setShowImport(true); }}>
              <Upload className="w-3.5 h-3.5" />匯入
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Download className="w-3.5 h-3.5" />匯出<ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem className="text-xs cursor-pointer gap-2" onClick={() => handleExport("xlsx")}>
                  <span className="text-green-600 font-bold">XLS</span> Excel 工作表 (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs cursor-pointer gap-2" onClick={() => handleExport("csv")}>
                  <span className="text-blue-600 font-bold">CSV</span> 逗號分隔檔 (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={openAddTrip}>
              <Plus className="w-3.5 h-3.5" />手動新增
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <ListFilter className="w-3.5 h-3.5" />日期：
          </div>
          <Input type="date" className="h-7 text-xs w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-slate-400">～</span>
          <Input type="date" className="h-7 text-xs w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <Select value={filterDriver || "_all"} onValueChange={v => setFilterDriver(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="全部司機" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">全部司機</SelectItem>
              {drivers.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats summary */}
        {trips.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "總車趟", value: trips.length + " 趟", color: "text-blue-600", bg: "bg-blue-50" },
              { label: "總營收", value: NT(tripTotal), color: "text-green-600", bg: "bg-green-50" },
              { label: "司機薪資", value: NT(tripPayout), color: "text-orange-600", bg: "bg-orange-50" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-2.5 ${s.bg}`}>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={`font-bold text-sm ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Trips list */}
        {tripsLoading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">此期間無車趟記錄</p>
            <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={openAddTrip}>
              <Plus className="w-3.5 h-3.5" />手動新增第一筆
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {trips.map((t: any) => {
              const st = TRIP_STATUS_MAP[t.status] ?? { label: t.status, color: "bg-slate-100 text-slate-500" };
              return (
                <div key={t.id} className="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-all">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{String(t.trip_date).split("T")[0]}</span>
                      {t.driver_name && <span className="text-xs font-semibold text-blue-600">{t.driver_name}</span>}
                      {t.customer_name && <span className="text-xs text-slate-500">{t.customer_name}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-600 truncate">
                      <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                      <span className="truncate">{t.pickup_address || "—"} → {t.delivery_address || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-green-600 font-semibold">NT$ {Number(t.amount).toLocaleString()}</span>
                      {t.driver_payout != null && <span className="text-slate-500">司機：NT$ {Number(t.driver_payout).toLocaleString()}</span>}
                      {t.notes && <span className="text-slate-400 truncate">{t.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="text-slate-400 hover:text-blue-600 p-1" onClick={() => openEditTrip(t)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button className="text-slate-400 hover:text-red-500 p-1" onClick={() => handleDeleteTrip(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 指派路線給司機 Dialog ───────────────────────────────────── */}
      <Dialog open={!!assigningRoute} onOpenChange={v => { if (!v) { setAssigningRoute(null); setAssignDriverId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package2 className="w-4 h-4 text-blue-600" />
              指派司機
            </DialogTitle>
          </DialogHeader>
          {assigningRoute && (
            <div className="space-y-4 py-1">
              {/* Route info */}
              <div className={`rounded-xl p-3 space-y-1.5 ${assigningRoute._source === "trip" ? "bg-orange-50" : "bg-slate-50"}`}>
                {assigningRoute._source === "trip" ? (
                  /* 班表車趟：顯示 notes 解析出的路線號 + 車型 + 站數 */
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-800">
                        {assigningRoute.notes?.split("｜")[0]?.trim() ?? `車趟 #${assigningRoute.id}`}
                      </span>
                      {assigningRoute.notes?.split("｜")[1]?.trim() && (
                        <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded font-medium">
                          {assigningRoute.notes.split("｜")[1]?.trim()}
                        </span>
                      )}
                      {assigningRoute.notes?.split("｜")[2]?.trim() && (
                        <span className="text-[10px] text-slate-500">{assigningRoute.notes.split("｜")[2]?.trim()}</span>
                      )}
                      <span className="text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded font-medium">班表匯入</span>
                    </div>
                    {assigningRoute.trip_date && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <CalendarDays className="w-3 h-3" /> 出車日期：{String(assigningRoute.trip_date).split("T")[0]}
                      </div>
                    )}
                    {assigningRoute.pickup_address && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" /> {assigningRoute.pickup_address}
                      </div>
                    )}
                  </>
                ) : (
                  /* 蝦皮訂單：顯示 route_id / dock / station_count */
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-800">{assigningRoute.route_id}</span>
                      {assigningRoute.dispatch_dock && assigningRoute.dispatch_dock !== "—" && (
                        <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">碼頭 {assigningRoute.dispatch_dock}</span>
                      )}
                      {(assigningRoute.station_count ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-500">{assigningRoute.station_count} 站</span>
                      )}
                      {assigningRoute.required_vehicle_type && (
                        <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded font-medium">{assigningRoute.required_vehicle_type}</span>
                      )}
                      {assigningRoute.shopee_rate && (
                        <span className="text-[10px] text-green-700 font-semibold">NT${Number(assigningRoute.shopee_rate).toLocaleString()}</span>
                      )}
                    </div>
                    {assigningRoute.pickup_time && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="w-3 h-3" /> 出發時間：{assigningRoute.pickup_time}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Driver selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-600">選擇司機</Label>
                {(() => {
                  const available = (data?.drivers ?? []).filter((d: any) => d.status === "available" && !d.on_leave_today);
                  return available.length === 0 ? (
                    <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">目前沒有可出車的司機</p>
                  ) : (
                    <div className="space-y-1.5">
                      {available.map((d: any) => (
                        <label
                          key={d.id}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${Number(assignDriverId) === d.id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"}`}
                        >
                          <input
                            type="radio"
                            name="assign_driver"
                            value={d.id}
                            checked={Number(assignDriverId) === d.id}
                            onChange={() => setAssignDriverId(d.id)}
                            className="sr-only"
                          />
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                            {d.name?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-700">{d.name}</p>
                            <p className="text-[11px] text-slate-400">{d.vehicle_type} · {d.license_plate || "未填車牌"}</p>
                          </div>
                          {Number(assignDriverId) === d.id && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
                        </label>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAssigningRoute(null); setAssignDriverId(""); }}>取消</Button>
            <Button
              size="sm"
              onClick={handleAssignRoute}
              disabled={!assignDriverId || assigning}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {assigning ? <><RefreshCw className="w-3 h-3 animate-spin mr-1.5" />指派中…</> : "確認指派"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 手動新增 / 編輯 Dialog ────────────────────────────────── */}
      <Dialog open={showTripForm} onOpenChange={setShowTripForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Truck className="w-4 h-4 text-green-600" />
              {editTrip ? "編輯車趟" : "手動新增車趟"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">日期</Label>
              <Input type="date" value={tripForm.trip_date} onChange={e => setTripForm((p: any) => ({ ...p, trip_date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">司機</Label>
              <Select value={tripForm.driver_id ? String(tripForm.driver_id) : "_none"} onValueChange={v => setTripForm((p: any) => ({ ...p, driver_id: v === "_none" ? "" : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="選擇司機（可空）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">不指定司機</SelectItem>
                  {drivers.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">客戶名稱</Label>
              <Input value={tripForm.customer_name} onChange={e => setTripForm((p: any) => ({ ...p, customer_name: e.target.value }))} placeholder="客戶名稱（可空）" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">狀態</Label>
              <Select value={tripForm.status} onValueChange={v => setTripForm((p: any) => ({ ...p, status: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIP_STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">起點 *</Label>
              <Input value={tripForm.pickup_address} onChange={e => setTripForm((p: any) => ({ ...p, pickup_address: e.target.value }))} placeholder="出發地址" className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">終點 *</Label>
              <Input value={tripForm.delivery_address} onChange={e => setTripForm((p: any) => ({ ...p, delivery_address: e.target.value }))} placeholder="送達地址" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">收費金額 (NT$)</Label>
              <Input type="number" min="0" value={tripForm.amount} onChange={e => setTripForm((p: any) => ({ ...p, amount: e.target.value }))} placeholder="0" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">司機薪資 (NT$)</Label>
              <Input type="number" min="0" value={tripForm.driver_payout} onChange={e => setTripForm((p: any) => ({ ...p, driver_payout: e.target.value }))} placeholder="（自動計算或手填）" className="h-8 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">備註</Label>
              <Input value={tripForm.notes} onChange={e => setTripForm((p: any) => ({ ...p, notes: e.target.value }))} placeholder="備註說明（可空）" className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTripForm(false)}>取消</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSaveTrip} disabled={savingTrip}>
              {savingTrip ? "儲存中…" : editTrip ? "更新" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 匯入 Dialog ──────────────────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={v => { setShowImport(v); if (!v) { setImportRows([]); setSheetTrips([]); setImportErrors([]); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Upload className="w-4 h-4 text-green-600" />匯入車趟記錄
            </DialogTitle>
          </DialogHeader>

          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {([
              { key: "sheet", label: "📋 從班表匯入（Google 試算表）" },
              { key: "csv", label: "📄 從 CSV / Excel 匯入" },
            ] as const).map(m => (
              <button
                key={m.key}
                onClick={() => { setImportMode(m.key); setImportRows([]); setSheetTrips([]); setImportErrors([]); }}
                className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition-all font-medium ${importMode === m.key ? "bg-white shadow text-green-700" : "text-slate-500 hover:text-slate-700"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 py-1">
            {/* ── Google Sheet mode ── */}
            {importMode === "sheet" && (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-blue-700">從蝦皮配送班表匯入</p>
                  <p className="text-slate-500">貼上 Google 試算表連結，系統會自動讀取路線、碼頭、出車時段，每條路線產生一筆車趟記錄。</p>
                  <p className="text-slate-400">· 需確認試算表為「知道連結的人可以查看」<br />· 每條路線的站點清單會記錄在備註欄</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Google 試算表連結</Label>
                  <div className="flex gap-2">
                    <Input
                      value={sheetUrl}
                      onChange={e => { setSheetUrl(e.target.value); setSheetTrips([]); setImportRows([]); }}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="h-8 text-xs flex-1"
                    />
                    <Button
                      size="sm" className="h-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1"
                      onClick={handleParseSheet} disabled={sheetParsing}
                    >
                      {sheetParsing ? <><RefreshCw className="w-3 h-3 animate-spin" />解析中…</> : "預覽資料"}
                    </Button>
                  </div>
                </div>

                {sheetTrips.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">
                      共解析到 <span className="font-bold text-green-600">{sheetTrips.length}</span> 條路線，預覽如下（前 6 筆）：
                    </p>
                    <div className="max-h-52 overflow-y-auto border rounded-xl text-xs">
                      <table className="w-full">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            {["日期", "路線", "碼頭／時段", "站數"].map(h => (
                              <th key={h} className="px-2 py-1.5 text-left text-slate-500 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sheetTrips.slice(0, 6).map((t, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-2 py-1.5 font-mono text-slate-600 whitespace-nowrap">{t.trip_date}</td>
                              <td className="px-2 py-1.5 font-semibold text-blue-700 whitespace-nowrap">{t._route_no}</td>
                              <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{t._dock_no ? `碼頭 ${t._dock_no}` : ""} {t._time_slot}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">{t._stop_count} 站</span>
                              </td>
                            </tr>
                          ))}
                          {sheetTrips.length > 6 && (
                            <tr>
                              <td colSpan={4} className="px-2 py-1.5 text-slate-400 text-center">…還有 {sheetTrips.length - 6} 條路線</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── CSV file mode ── */}
            {importMode === "csv" && (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-700">欄位格式（CSV 或 Excel 第一列為標題）：</p>
                  <p className="font-mono text-slate-500">日期, 司機姓名, 客戶名稱, 起點, 終點, 金額, 司機薪資, 狀態, 備註</p>
                  <p className="text-slate-400 mt-1">
                    · 支援 <b className="text-slate-600">.xlsx</b>、<b className="text-slate-600">.xls</b>、<b className="text-slate-600">.csv</b> 格式<br />
                    · 司機姓名需與系統相符才能自動連結<br />
                    · 狀態：completed / pending / cancelled
                  </p>
                </div>
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                  <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-4 h-4" />選擇檔案（CSV / Excel）
                    {importRows.length > 0 && <span className="ml-1 text-green-600">（已載入 {importRows.length} 筆）</span>}
                  </Button>
                </div>
                {importRows.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded-lg text-xs">
                    <table className="w-full">
                      <tbody>
                        {importRows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="px-2 py-1.5 text-slate-500">{r["日期"] ?? r.date}</td>
                            <td className="px-2 py-1.5 text-blue-600">{r["司機姓名"] ?? r.driver_name}</td>
                            <td className="px-2 py-1.5 truncate max-w-[120px]">{r["起點"] ?? r.pickup_address} → {r["終點"] ?? r.delivery_address}</td>
                            <td className="px-2 py-1.5 text-green-600 text-right">NT$ {r["金額"] ?? r.amount}</td>
                          </tr>
                        ))}
                        {importRows.length > 5 && (
                          <tr><td colSpan={4} className="px-2 py-1.5 text-slate-400 text-center">…還有 {importRows.length - 5} 筆</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {importErrors.length > 0 && (
              <div className="space-y-1">
                {importErrors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-500">{e}</p>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowImport(false)}>取消</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
              onClick={handleImport}
              disabled={importing || importRows.length === 0}
            >
              <Upload className="w-3.5 h-3.5" />
              {importing ? "匯入中…" : importRows.length > 0 ? `確認匯入 ${importRows.length} 筆` : "請先預覽資料"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 自動同步設定 Dialog ─────────────────────────────────────── */}
      <Dialog open={showSyncDialog} onOpenChange={v => { if (!v) setShowSyncDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              {editSyncConfig ? "編輯同步設定" : "新增班表自動同步"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">同步名稱</Label>
              <Input
                value={syncForm.sync_name}
                onChange={e => setSyncForm(f => ({ ...f, sync_name: e.target.value }))}
                placeholder="例：蝦皮北倉班表"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">Google 試算表連結</Label>
              <Input
                value={syncForm.sheet_url}
                onChange={e => setSyncForm(f => ({ ...f, sheet_url: e.target.value }))}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="h-9 text-sm"
              />
              <p className="text-xs text-slate-400">請確認試算表已設為「知道連結的人可查看」</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-700">同步間隔（分鐘）</Label>
              <Select value={syncForm.interval_minutes} onValueChange={v => setSyncForm(f => ({ ...f, interval_minutes: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">每 15 分鐘</SelectItem>
                  <SelectItem value="30">每 30 分鐘</SelectItem>
                  <SelectItem value="60">每 1 小時</SelectItem>
                  <SelectItem value="120">每 2 小時</SelectItem>
                  <SelectItem value="240">每 4 小時</SelectItem>
                  <SelectItem value="480">每 8 小時</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSyncDialog(false)}>取消</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              onClick={handleSyncSave}
              disabled={savingSyncConfig}
            >
              {savingSyncConfig ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editSyncConfig ? "儲存變更" : "新增並啟用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: 司機管理
// ══════════════════════════════════════════════════════════════════════════════
const EMPTY_DRIVER_FORM = {
  name: "", phone: "", id_no: "",
  username: "", password: "",
  vehicle_type: "小貨車", license_plate: "",
  insurance_expiry: "", inspection_date: "",
  commission_rate: 70,
  bank_code: "", bank_account: "", referrer: "",
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ label, dateStr }: { label: string; dateStr?: string | null }) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  const color = days < 0 ? "bg-red-100 text-red-700 border-red-200"
    : days <= 30 ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-green-100 text-green-700 border-green-200";
  const text = days < 0 ? `${label}已逾期 ${Math.abs(days)} 天`
    : days === 0 ? `${label}今日到期`
    : `${label}剩 ${days} 天`;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${color}`}>
      <AlertCircle className="w-2.5 h-2.5" />{text}
    </span>
  );
}

function DriversTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editDriver, setEditDriver] = useState<any>(null);
  const [formTab, setFormTab] = useState<"basic" | "vehicle" | "finance">("basic");
  const [form, setForm] = useState<any>(EMPTY_DRIVER_FORM);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api("GET", "/drivers");
      setDrivers(d.drivers ?? []);
    } catch { } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(EMPTY_DRIVER_FORM);
    setEditDriver(null);
    setFormTab("basic");
    setShowAdd(true);
  };

  const openEdit = (d: any) => {
    setForm({
      name: d.name ?? "", phone: d.phone ?? "", id_no: d.id_no ?? "",
      username: d.username ?? "", password: "",
      vehicle_type: d.vehicle_type ?? "小貨車", license_plate: d.license_plate ?? "",
      insurance_expiry: d.insurance_expiry ? d.insurance_expiry.split("T")[0] : "",
      inspection_date: d.inspection_date ? d.inspection_date.split("T")[0] : "",
      commission_rate: d.commission_rate ?? 70,
      bank_code: d.bank_code ?? "", bank_account: d.bank_account ?? "", referrer: d.referrer ?? "",
    });
    setEditDriver(d);
    setFormTab("basic");
    setShowAdd(true);
  };

  const handleSave = async () => {
    try {
      if (editDriver) {
        const payload: any = {
          name: form.name, phone: form.phone, id_no: form.id_no || null,
          vehicle_type: form.vehicle_type, license_plate: form.license_plate,
          insurance_expiry: form.insurance_expiry || null,
          inspection_date: form.inspection_date || null,
          commission_rate: Number(form.commission_rate),
          bank_code: form.bank_code || null, bank_account: form.bank_account || null,
          referrer: form.referrer || null,
        };
        if (form.password) payload.password = form.password;
        await api("PATCH", `/drivers/${editDriver.id}`, payload);
        toast({ title: "司機資料已更新" });
      } else {
        if (!form.username || !form.password) { toast({ title: "請填寫帳號與密碼", variant: "destructive" }); return; }
        await api("POST", "/drivers", {
          ...form,
          commission_rate: Number(form.commission_rate),
          id_no: form.id_no || null,
          insurance_expiry: form.insurance_expiry || null,
          inspection_date: form.inspection_date || null,
          bank_code: form.bank_code || null,
          bank_account: form.bank_account || null,
          referrer: form.referrer || null,
        });
        toast({ title: "司機已新增" });
      }
      setShowAdd(false);
      load();
    } catch (err: any) {
      toast({ title: "操作失敗", description: err.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm("確定要停用這位司機嗎？")) return;
    try {
      await api("DELETE", `/drivers/${id}`);
      toast({ title: "司機已停用" });
      load();
    } catch (err: any) {
      toast({ title: "操作失敗", description: err.message, variant: "destructive" });
    }
  };

  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">司機管理</h2>
        <Button onClick={openAdd} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4" /> 新增司機
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>尚無旗下司機，點選「新增司機」開始建立</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {drivers.map((d: any) => {
            const insuranceDays = daysUntil(d.insurance_expiry);
            const inspectionDays = daysUntil(d.inspection_date);
            const hasWarning = (insuranceDays !== null && insuranceDays <= 30) || (inspectionDays !== null && inspectionDays <= 30);
            return (
              <Card key={d.id} className={`border-0 shadow-sm ${hasWarning ? "ring-1 ring-orange-200" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
                      {d.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">{d.name}</span>
                        <StatusBadge status={d.status} />
                        {d.id_no && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{d.id_no.slice(0, 3)}***{d.id_no.slice(-2)}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>
                        <span className="flex items-center gap-1"><Car className="w-3 h-3" />{d.vehicle_type}</span>
                        {d.license_plate && <span className="flex items-center gap-1"><Badge className="w-3 h-3" />{d.license_plate}</span>}
                        <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />抽成 {d.commission_rate}%</span>
                        {d.bank_code && d.bank_account && (
                          <span className="flex items-center gap-1 text-slate-400">{d.bank_code} ****{String(d.bank_account).slice(-4)}</span>
                        )}
                      </div>
                      {(d.insurance_expiry || d.inspection_date) && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <ExpiryBadge label="強制險" dateStr={d.insurance_expiry} />
                          <ExpiryBadge label="驗車" dateStr={d.inspection_date} />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEdit(d)} className="h-8 w-8 p-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDeactivate(d.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:border-red-200">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新增/編輯 Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { setShowAdd(v); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-green-600" />
              {editDriver ? `編輯司機 — ${editDriver.name}` : "新增旗下司機"}
            </DialogTitle>
          </DialogHeader>

          {/* Section tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[
              { key: "basic", label: "基本資訊" },
              { key: "vehicle", label: "車輛資料" },
              { key: "finance", label: "財務資料" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFormTab(t.key as any)}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-all ${formTab === t.key ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 py-1 min-h-[260px]">
            {/* 基本資訊 */}
            {formTab === "basic" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">姓名 <span className="text-red-500">*</span></Label>
                    <Input value={form.name} onChange={sf("name")} placeholder="司機本名" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">聯絡電話</Label>
                    <Input value={form.phone} onChange={sf("phone")} placeholder="09XX-XXX-XXX" className="h-9" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">身分證字號</Label>
                  <Input value={form.id_no} onChange={sf("id_no")} placeholder="用於勞靠 / 稅務" className="h-9 font-mono" />
                </div>
                {!editDriver && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">帳號 <span className="text-red-500">*</span></Label>
                      <Input value={form.username} onChange={sf("username")} placeholder="登入帳號" className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">密碼 <span className="text-red-500">*</span></Label>
                      <Input type="password" value={form.password} onChange={sf("password")} placeholder="初始密碼" className="h-9" />
                    </div>
                  </div>
                )}
                {editDriver && (
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">重設密碼（留空則不更改）</Label>
                    <Input type="password" value={form.password} onChange={sf("password")} placeholder="輸入新密碼" className="h-9" />
                  </div>
                )}
              </>
            )}

            {/* 車輛資料 */}
            {formTab === "vehicle" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">車型 / 噸位</Label>
                    <Select value={form.vehicle_type} onValueChange={v => setForm((f: any) => ({ ...f, vehicle_type: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["小貨車 (3.5T)", "中貨車 (5T)", "大貨車 (17T)", "廂型車", "冷凍車", "冷藏車", "機車"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">車牌號碼</Label>
                    <Input value={form.license_plate} onChange={sf("license_plate")} placeholder="ABC-1234" className="h-9 font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      強制險到期日
                      {form.insurance_expiry && <ExpiryBadge label="" dateStr={form.insurance_expiry} />}
                    </Label>
                    <Input type="date" value={form.insurance_expiry} onChange={sf("insurance_expiry")} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      下次驗車日
                      {form.inspection_date && <ExpiryBadge label="" dateStr={form.inspection_date} />}
                    </Label>
                    <Input type="date" value={form.inspection_date} onChange={sf("inspection_date")} className="h-9" />
                  </div>
                </div>
              </>
            )}

            {/* 財務資料 */}
            {formTab === "finance" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">司機抽成比例（%）</Label>
                  <Input type="number" min={0} max={100} value={form.commission_rate} onChange={sf("commission_rate")} className="h-9" />
                  <p className="text-[11px] text-slate-400">系統每趟費用的司機分潤比例</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">銀行代碼</Label>
                    <Input value={form.bank_code} onChange={sf("bank_code")} placeholder="3位" className="h-9 font-mono" maxLength={10} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs font-semibold">銀行帳號</Label>
                    <Input value={form.bank_account} onChange={sf("bank_account")} placeholder="撥款帳號" className="h-9 font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">推薦人（選填）</Label>
                  <Input value={form.referrer} onChange={sf("referrer")} placeholder="推薦司機姓名或編號" className="h-9" />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2">
            {formTab !== "basic" && (
              <Button variant="ghost" size="sm" onClick={() => setFormTab(formTab === "finance" ? "vehicle" : "basic")} className="mr-auto">
                ← 上一步
              </Button>
            )}
            {formTab !== "finance" ? (
              <Button size="sm" onClick={() => setFormTab(formTab === "basic" ? "vehicle" : "finance")} className="bg-blue-600 hover:bg-blue-700 text-white">
                下一步 →
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>取消</Button>
                <Button size="sm" onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">
                  {editDriver ? "儲存變更" : "新增司機"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: 計費規則
// ══════════════════════════════════════════════════════════════════════════════
function PricingTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", vehicle_type: "小貨車", base_fee: 500, per_stop_rate: 50, driver_ratio: 70 });

  // 蝦皮費率匯入
  const [showShopeeImport, setShowShopeeImport] = useState(false);
  const [shopeeRates, setShopeeRates] = useState<any[]>([]);
  const [shopeeLoading, setShopeeLoading] = useState(false);
  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); const d = await api("GET", "/pricing"); setRules(d.rules ?? []); }
    catch { } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ name: "", vehicle_type: "小貨車", base_fee: 500, per_stop_rate: 50, driver_ratio: 70 }); setEditRule(null); setShowAdd(true); };
  const openEdit = (r: any) => { setForm({ name: r.name, vehicle_type: r.vehicle_type, base_fee: r.base_fee, per_stop_rate: r.per_stop_rate ?? 0, driver_ratio: r.driver_ratio }); setEditRule(r); setShowAdd(true); };

  const handleSave = async () => {
    try {
      const payload = { name: form.name, vehicle_type: form.vehicle_type, base_fee: Number(form.base_fee), per_stop_rate: Number(form.per_stop_rate), driver_ratio: Number(form.driver_ratio) };
      if (editRule) { await api("PATCH", `/pricing/${editRule.id}`, payload); toast({ title: "計費規則已更新" }); }
      else { await api("POST", "/pricing", payload); toast({ title: "計費規則已新增" }); }
      setShowAdd(false); load();
    } catch (err: any) { toast({ title: "操作失敗", description: err.message, variant: "destructive" }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("確定刪除此計費規則？")) return;
    try { await api("DELETE", `/pricing/${id}`); toast({ title: "已刪除" }); load(); }
    catch (err: any) { toast({ title: "操作失敗", description: err.message, variant: "destructive" }); }
  };

  const openShopeeImport = async () => {
    setShowShopeeImport(true);
    setSelectedPrefixes(new Set());
    setShopeeLoading(true);
    try {
      const d = await api("GET", "/pricing/shopee-rates");
      setShopeeRates(d.rates ?? []);
    } catch (err: any) {
      toast({ title: "載入失敗", description: err.message, variant: "destructive" });
    } finally { setShopeeLoading(false); }
  };

  const togglePrefix = (prefix: string) => {
    setSelectedPrefixes(prev => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix); else next.add(prefix);
      return next;
    });
  };

  const handleShopeeImport = async () => {
    if (selectedPrefixes.size === 0) { toast({ title: "請至少選擇一個費率", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const d = await api("POST", "/pricing/import-shopee", { prefixes: Array.from(selectedPrefixes) });
      toast({ title: `匯入成功`, description: `已新增 ${d.imported} 筆計費規則` });
      setShowShopeeImport(false);
      load();
    } catch (err: any) {
      toast({ title: "匯入失敗", description: err.message, variant: "destructive" });
    } finally { setImporting(false); }
  };

  const SERVICE_COLOR: Record<string, string> = {
    "店配模式": "bg-blue-100 text-blue-700",
    "NDD快速到貨": "bg-orange-100 text-orange-700",
    "WH NDD": "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">計費規則</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openShopeeImport} className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50">
            <Download className="w-4 h-4" />從蝦皮費率匯入
          </Button>
          <Button onClick={openAdd} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4" />新增規則</Button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 gap-3">
          <DollarSign className="w-12 h-12 opacity-30" />
          <p>尚無計費規則</p>
          <Button variant="outline" onClick={openShopeeImport} className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 text-sm">
            <Download className="w-3.5 h-3.5" />從蝦皮費率匯入
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.map((r: any) => (
            <Card key={r.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{r.name}</p>
                    {r.notes && <p className="text-xs text-slate-400 mt-0.5">{r.notes}</p>}
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{r.vehicle_type}</span>
                      <span className="text-xs bg-blue-50 px-2 py-0.5 rounded-full text-blue-700">底價 NT${Number(r.base_fee).toLocaleString()}</span>
                      {r.per_stop_rate > 0 && <span className="text-xs bg-purple-50 px-2 py-0.5 rounded-full text-purple-700">每站 +${r.per_stop_rate}</span>}
                      <span className="text-xs bg-orange-50 px-2 py-0.5 rounded-full text-orange-700">司機 {r.driver_ratio}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(r)} className="h-8 w-8 p-0"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(r.id)} className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── 蝦皮費率匯入 Dialog ── */}
      <Dialog open={showShopeeImport} onOpenChange={setShowShopeeImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-4 h-4 text-orange-500" />從蝦皮費率匯入計費規則
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-orange-700">說明</p>
              <p>選取要匯入的蝦皮路線前綴，系統會依費率自動建立計費規則。匯入後可手動編輯司機抽成比例。</p>
            </div>
            {shopeeLoading ? (
              <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入費率中…</div>
            ) : shopeeRates.length === 0 ? (
              <div className="text-center py-8 text-slate-400">尚未設定任何蝦皮費率（請先由後台管理員設定）</div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
                  <span>共 {shopeeRates.length} 筆費率</span>
                  <button
                    className="text-indigo-500 hover:text-indigo-700 font-medium"
                    onClick={() => setSelectedPrefixes(
                      selectedPrefixes.size === shopeeRates.length
                        ? new Set()
                        : new Set(shopeeRates.map((r: any) => r.prefix))
                    )}
                  >
                    {selectedPrefixes.size === shopeeRates.length ? "取消全選" : "全選"}
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {shopeeRates.map((r: any) => {
                    const checked = selectedPrefixes.has(r.prefix);
                    const svcColor = SERVICE_COLOR[r.service_type] ?? "bg-slate-100 text-slate-600";
                    return (
                      <button
                        key={r.prefix}
                        onClick={() => togglePrefix(r.prefix)}
                        className={`w-full text-left rounded-xl border p-3 transition-all ${checked ? "bg-orange-50 border-orange-300 ring-1 ring-orange-200" : "bg-white border-slate-200 hover:border-slate-300"}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${checked ? "bg-orange-500 border-orange-500" : "border-slate-300 bg-white"}`}>
                            {checked && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-800 text-sm">{r.prefix}</span>
                              {r.service_type && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${svcColor}`}>{r.service_type}</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{r.description}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs font-semibold text-green-700">NT${Number(r.rate_per_trip).toLocaleString()} / 趟</span>
                              {r.route_od && <span className="text-xs text-slate-400">{r.route_od}</span>}
                              {r.vehicle_type && <span className="text-xs text-slate-400">{r.vehicle_type}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShopeeImport(false)}>取消</Button>
            <Button
              onClick={handleShopeeImport}
              disabled={importing || selectedPrefixes.size === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
            >
              {importing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />匯入中…</> : <><Download className="w-3.5 h-3.5" />匯入 {selectedPrefixes.size} 筆</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 新增／編輯規則 Dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editRule ? "編輯計費規則" : "新增計費規則"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-xs">規則名稱</Label><Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="例：小貨車市區計費" /></div>
            <div className="space-y-1">
              <Label className="text-xs">適用車型</Label>
              <Select value={form.vehicle_type} onValueChange={v => setForm((f: any) => ({ ...f, vehicle_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["小貨車", "中貨車", "大貨車", "廂型車", "機車", "6.2T"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">底價 (元)</Label><Input type="number" value={form.base_fee} onChange={e => setForm((f: any) => ({ ...f, base_fee: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">每站加價</Label><Input type="number" value={form.per_stop_rate} onChange={e => setForm((f: any) => ({ ...f, per_stop_rate: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">司機抽成%</Label><Input type="number" min={0} max={100} value={form.driver_ratio} onChange={e => setForm((f: any) => ({ ...f, driver_ratio: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">{editRule ? "儲存" : "新增"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: 請假管理
// ══════════════════════════════════════════════════════════════════════════════
function LeavesTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setLoading(true); const d = await api("GET", "/leaves"); setLeaves(d.leaves ?? []); }
    catch { } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const handle = async (id: number, action: "approve" | "reject", note = "") => {
    try {
      await api("POST", `/leaves/${id}/${action}`, { note });
      toast({ title: action === "approve" ? "已核准請假" : "已拒絕請假" });
      load();
    } catch (err: any) { toast({ title: "操作失敗", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">請假管理</h2>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" />重新整理</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>目前無請假記錄</p></div>
      ) : (
        <div className="space-y-3">
          {leaves.map((l: any) => (
            <Card key={l.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{l.driver_name ?? `司機 #${l.driver_id}`}</span>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      請假日期：{l.leave_date}{l.leave_end_date && l.leave_end_date !== l.leave_date ? ` ~ ${l.leave_end_date}` : ""}
                    </p>
                    {l.reason && <p className="text-xs text-slate-500 mt-0.5">原因：{l.reason}</p>}
                    {l.note && <p className="text-xs text-blue-600 mt-0.5">備註：{l.note}</p>}
                  </div>
                  {l.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => handle(l.id, "approve")} className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1">
                        <Check className="w-3.5 h-3.5" />核准
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handle(l.id, "reject")} className="h-8 text-red-500 hover:bg-red-50 hover:border-red-200 gap-1">
                        <X className="w-3.5 h-3.5" />拒絕
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5: 薪資結算
// ══════════════════════════════════════════════════════════════════════════════
function SalaryTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calcForm, setCalcForm] = useState({ period_label: new Date().toISOString().slice(0, 7), driver_id: "" });
  const [calcSource, setCalcSource] = useState<"trips" | "orders">("trips");
  const [drivers, setDrivers] = useState<any[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [salData, drvData] = await Promise.all([api("GET", "/salary"), api("GET", "/drivers")]);
      setRecords(salData.records ?? []);
      setDrivers(drvData.drivers ?? []);
    } catch { } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const calcSalary = async () => {
    try {
      setCalcLoading(true);
      const [y, m] = calcForm.period_label.split("-").map(Number);
      const payload: any = { year: y, month: m };
      if (calcSource === "orders" && calcForm.driver_id) payload.driver_id = Number(calcForm.driver_id);
      const endpoint = calcSource === "trips" ? "/salary/calculate-from-trips" : "/salary/calculate";
      const d = await api("POST", endpoint, payload);
      if (d.count === 0) {
        toast({ title: "無資料", description: d.message ?? "此期間找不到符合記錄", variant: "destructive" });
      } else {
        toast({ title: `已計算薪資，共 ${d.count} 筆`, description: calcSource === "trips" ? "資料來源：車趟記錄" : "資料來源：系統訂單" });
      }
      load();
    } catch (err: any) { toast({ title: "計算失敗", description: err.message, variant: "destructive" }); }
    finally { setCalcLoading(false); }
  };

  const settle = async (id: number) => {
    try {
      await api("POST", "/salary/settle", { record_ids: [id] });
      toast({ title: "已標記為已結算" });
      load();
    } catch (err: any) { toast({ title: "操作失敗", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-slate-800">薪資結算</h2>

      {/* Calc panel */}
      <Card className="border-0 shadow-sm bg-green-50">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold text-green-800 flex items-center gap-2"><TrendingUp className="w-4 h-4" />計算薪資</p>

          {/* Source toggle */}
          <div className="flex gap-1 p-1 bg-green-100 rounded-xl">
            {([
              { key: "trips",  label: "📋 從車趟記錄計算", desc: "以調度牆匯入的班表車趟為基準" },
              { key: "orders", label: "📦 從系統訂單計算", desc: "以平台配送訂單金額為基準" },
            ] as const).map(s => (
              <button
                key={s.key}
                onClick={() => setCalcSource(s.key)}
                className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition-all font-medium ${calcSource === s.key ? "bg-white shadow text-green-700" : "text-green-700/60 hover:text-green-800"}`}
                title={s.desc}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Input
              value={calcForm.period_label}
              onChange={e => setCalcForm(f => ({ ...f, period_label: e.target.value }))}
              placeholder="2026-04"
              className="bg-white w-36 h-9 text-sm"
              type="month"
            />
            {calcSource === "orders" && (
              <Select value={calcForm.driver_id} onValueChange={v => setCalcForm(f => ({ ...f, driver_id: v }))}>
                <SelectTrigger className="bg-white h-9 w-36"><SelectValue placeholder="全部司機" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部司機</SelectItem>
                  {drivers.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={calcSalary} disabled={calcLoading} className="bg-green-600 hover:bg-green-700 text-white gap-1 h-9">
              {calcLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {calcLoading ? "計算中…" : "開始計算"}
            </Button>
          </div>
          <p className="text-xs text-green-700">
            {calcSource === "trips"
              ? "⚡ 依調度牆車趟記錄的「司機薪資」欄位加總，每位司機產生一筆薪資草稿"
              : "依系統平台訂單金額 × 分潤比例計算，確認後點「標記結算」完成發薪"}
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>尚無薪資紀錄</p></div>
      ) : (
        <div className="space-y-3">
          {records.map((r: any) => (
            <Card key={r.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-800">{r.driver_name ?? `司機 #${r.driver_id}`}</span>
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{r.period_label} · {r.period_type === "monthly" ? "月結" : "週結"}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>訂單總金額：<b className="text-slate-800">${Number(r.gross_amount ?? 0).toLocaleString()}</b></span>
                      <span>司機應得：<b className="text-green-700">${Number(r.driver_payout ?? 0).toLocaleString()}</b></span>
                      <span>車行收入：<b className="text-blue-700">${Number(r.fleet_income ?? 0).toLocaleString()}</b></span>
                      <span>平台費：<b className="text-orange-600">${Number(r.platform_fee ?? 0).toLocaleString()}</b></span>
                    </div>
                  </div>
                  {r.status === "calculated" && (
                    <Button size="sm" onClick={() => settle(r.id)} className="h-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-white gap-1">
                      <Check className="w-3.5 h-3.5" />標記結算
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6: 車行資訊
// ══════════════════════════════════════════════════════════════════════════════
function FleetInfoTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [info, setInfo] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setLoading(true); const d = await api("GET", "/me"); setInfo(d.fleet); setForm(d.fleet); }
    catch { } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api("PATCH", "/me", { name: form.name, owner_name: form.owner_name, phone: form.phone, email: form.email, address: form.address, notes: form.notes });
      toast({ title: "車行資訊已更新" });
      setEditing(false);
      load();
    } catch (err: any) { toast({ title: "更新失敗", description: err.message, variant: "destructive" }); }
  };

  if (loading) return <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>;

  const fields = [
    { label: "車行名稱", key: "name" },
    { label: "負責人", key: "owner_name" },
    { label: "聯絡電話", key: "phone" },
    { label: "電子信箱", key: "email" },
    { label: "地址", key: "address" },
    { label: "備註", key: "notes" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">車行資訊</h2>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />編輯</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(info); }}>取消</Button>
            <Button size="sm" onClick={save} className="bg-green-600 hover:bg-green-700 text-white gap-1"><Check className="w-3.5 h-3.5" />儲存</Button>
          </div>
        )}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
              <Store className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">{info?.name}</p>
              <p className="text-sm text-slate-500">車行代碼：<span className="font-mono font-bold text-slate-700">{info?.code}</span></p>
            </div>
          </div>

          <div className="grid gap-4">
            {fields.map(f => (
              <div key={f.key} className="flex items-start gap-3">
                <span className="text-sm text-slate-500 w-20 shrink-0 pt-0.5">{f.label}</span>
                {editing ? (
                  <Input value={form[f.key] ?? ""} onChange={e => setForm((p: any) => ({ ...p, [f.key]: e.target.value }))} className="flex-1 h-8 text-sm" />
                ) : (
                  <span className="text-sm text-slate-800 flex-1">{info?.[f.key] || <span className="text-slate-400 italic">未填寫</span>}</span>
                )}
              </div>
            ))}
            <div className="flex items-start gap-3">
              <span className="text-sm text-slate-500 w-20 shrink-0 pt-0.5">司機抽成</span>
              <span className="text-sm font-semibold text-slate-800">{info?.commission_rate}%</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-sm text-slate-500 w-20 shrink-0 pt-0.5">平台費率</span>
              <span className="text-sm font-semibold text-slate-800">{info?.platform_commission_rate}%</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-sm text-slate-500 w-20 shrink-0 pt-0.5">車行狀態</span>
              <StatusBadge status={info?.status} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PORTAL
// ══════════════════════════════════════════════════════════════════════════════
export default function FranchiseFleetPortal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => { logout(); setLocation("/"); };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
              <Store className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="font-black text-slate-800 leading-tight text-sm">{user?.franchisee_name ?? "加盟車行"}</p>
              <p className="text-xs text-slate-400 leading-tight">
                {user?.fleet_code} · 車行後台
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 gap-1.5 hover:text-red-600 hover:bg-red-50">
            <LogOut className="w-4 h-4" />登出
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-5">
        <Tabs defaultValue="dashboard">
          <TabsList className="w-full flex overflow-x-auto mb-5 h-auto p-1 bg-white border border-slate-200 rounded-xl shadow-sm gap-0.5">
            {[
              { value: "dashboard", label: "調度牆", icon: LayoutDashboard },
              { value: "drivers", label: "司機", icon: Users },
              { value: "pricing", label: "計費", icon: DollarSign },
              { value: "leaves", label: "請假", icon: Calendar },
              { value: "salary", label: "薪資", icon: Banknote },
              { value: "info", label: "車行資訊", icon: Store },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-xs data-[state=active]:bg-green-600 data-[state=active]:text-white rounded-lg transition-all min-w-[52px]">
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab /></TabsContent>
          <TabsContent value="drivers"><DriversTab /></TabsContent>
          <TabsContent value="pricing"><PricingTab /></TabsContent>
          <TabsContent value="leaves"><LeavesTab /></TabsContent>
          <TabsContent value="salary"><SalaryTab /></TabsContent>
          <TabsContent value="info"><FleetInfoTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
