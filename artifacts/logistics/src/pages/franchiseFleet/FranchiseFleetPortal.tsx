import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Store, Truck, LayoutDashboard, Users, DollarSign, Calendar,
  ClipboardList, LogOut, RefreshCw, Plus, Pencil, Trash2,
  Check, X, ChevronRight, MapPin, Clock, AlertCircle,
  Phone, Car, Badge, Banknote, TrendingUp, FileText,
  Upload, Download, ListFilter,
} from "lucide-react";
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

  // Load dashboard
  const load = useCallback(async () => {
    try { setLoading(true); const d = await api("GET", "/dashboard"); setData(d); }
    catch { } finally { setLoading(false); }
  }, [api]);

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

  // Export CSV
  const handleExport = useCallback(async () => {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const url = `${BASE_URL}/api/fleet/trips/export?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `車趟記錄_${dateFrom}_${dateTo}.csv`;
    a.click();
  }, [token, dateFrom, dateTo]);

  // Parse CSV file for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string ?? "").replace(/^\uFEFF/, "");
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast({ title: "CSV 格式錯誤，需有標題列", variant: "destructive" }); return; }
      const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
      const parsed = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.replace(/^"|"$/g, "").trim());
        const row: any = {};
        headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
        return row;
      }).filter(r => Object.values(r).some(v => String(v).trim()));
      setImportRows(parsed);
      setImportErrors([]);
    };
    reader.readAsText(file, "utf-8");
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
  const onlineCount = drivers.filter((d: any) => d.status !== "offline").length;
  const busyCount = drivers.filter((d: any) => d.status === "busy").length;

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
              { label: "在線司機", value: onlineCount, icon: Truck, color: "text-green-600", bg: "bg-green-50" },
              { label: "執行中", value: busyCount, icon: ClipboardList, color: "text-orange-600", bg: "bg-orange-50" },
              { label: "待審假單", value: leaves.length, icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
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
                  {drivers.map((d: any) => (
                    <div key={d.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                        {d.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{d.name}</p>
                        <p className="text-xs text-slate-500">{d.vehicle_type} · {d.license_plate || "未填車牌"}</p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                  ))}
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
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />匯出
            </Button>
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
              { key: "csv", label: "📄 從 CSV 檔案匯入" },
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
                  <p className="font-semibold text-slate-700">CSV 欄位格式（需有標題列）：</p>
                  <p className="font-mono text-slate-500">日期, 司機姓名, 客戶名稱, 起點, 終點, 金額, 司機薪資, 狀態, 備註</p>
                  <p className="text-slate-400 mt-1">· 司機姓名需與系統相符才能自動連結<br />· 狀態：completed / pending / cancelled</p>
                </div>
                <div>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-4 h-4" />選擇 CSV 檔案
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: 司機管理
// ══════════════════════════════════════════════════════════════════════════════
function DriversTab() {
  const api = useFleetApi();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editDriver, setEditDriver] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: "", phone: "", username: "", password: "", vehicle_type: "小貨車", license_plate: "", commission_rate: 70
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api("GET", "/drivers");
      setDrivers(d.drivers ?? []);
    } catch { } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ name: "", phone: "", username: "", password: "", vehicle_type: "小貨車", license_plate: "", commission_rate: 70 });
    setEditDriver(null);
    setShowAdd(true);
  };

  const openEdit = (d: any) => {
    setForm({ name: d.name, phone: d.phone ?? "", vehicle_type: d.vehicle_type ?? "小貨車", license_plate: d.license_plate ?? "", commission_rate: d.commission_rate ?? 70, username: d.username ?? "", password: "" });
    setEditDriver(d);
    setShowAdd(true);
  };

  const handleSave = async () => {
    try {
      if (editDriver) {
        const payload: any = { name: form.name, phone: form.phone, vehicle_type: form.vehicle_type, license_plate: form.license_plate, commission_rate: Number(form.commission_rate) };
        if (form.password) payload.password = form.password;
        await api("PATCH", `/drivers/${editDriver.id}`, payload);
        toast({ title: "司機資料已更新" });
      } else {
        if (!form.username || !form.password) { toast({ title: "請填寫帳號與密碼", variant: "destructive" }); return; }
        await api("POST", "/drivers", { ...form, commission_rate: Number(form.commission_rate) });
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
          {drivers.map((d: any) => (
            <Card key={d.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
                    {d.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">{d.name}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>
                      <span className="flex items-center gap-1"><Car className="w-3 h-3" />{d.vehicle_type}</span>
                      {d.license_plate && <span className="flex items-center gap-1"><Badge className="w-3 h-3" />{d.license_plate}</span>}
                      <span className="flex items-center gap-1"><Banknote className="w-3 h-3" />抽成 {d.commission_rate}%</span>
                    </div>
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
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editDriver ? "編輯司機資料" : "新增旗下司機"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">姓名 *</Label>
                <Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="司機姓名" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">電話</Label>
                <Input value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="0912345678" />
              </div>
            </div>
            {!editDriver && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">帳號 *</Label>
                  <Input value={form.username} onChange={e => setForm((f: any) => ({ ...f, username: e.target.value }))} placeholder="登入帳號" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">密碼 *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm((f: any) => ({ ...f, password: e.target.value }))} placeholder="初始密碼" />
                </div>
              </div>
            )}
            {editDriver && (
              <div className="space-y-1">
                <Label className="text-xs">重設密碼（留空則不更改）</Label>
                <Input type="password" value={form.password} onChange={e => setForm((f: any) => ({ ...f, password: e.target.value }))} placeholder="輸入新密碼" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">車型</Label>
                <Select value={form.vehicle_type} onValueChange={v => setForm((f: any) => ({ ...f, vehicle_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["小貨車", "中貨車", "大貨車", "廂型車", "機車"].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">車牌</Label>
                <Input value={form.license_plate} onChange={e => setForm((f: any) => ({ ...f, license_plate: e.target.value }))} placeholder="ABC-1234" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">司機抽成比例（%）</Label>
              <Input type="number" min={0} max={100} value={form.commission_rate} onChange={e => setForm((f: any) => ({ ...f, commission_rate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">{editDriver ? "儲存變更" : "新增司機"}</Button>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">計費規則</h2>
        <Button onClick={openAdd} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4" />新增規則</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin mr-2" />載入中…</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-slate-400"><DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>尚無計費規則</p></div>
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
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">{r.vehicle_type}</span>
                      <span className="text-xs bg-blue-50 px-2 py-0.5 rounded-full text-blue-700">底價 ${r.base_fee}</span>
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
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editRule ? "編輯計費規則" : "新增計費規則"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-xs">規則名稱</Label><Input value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="例：小貨車市區計費" /></div>
            <div className="space-y-1">
              <Label className="text-xs">適用車型</Label>
              <Select value={form.vehicle_type} onValueChange={v => setForm((f: any) => ({ ...f, vehicle_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["小貨車", "中貨車", "大貨車", "廂型車", "機車"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
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
  const [calcForm, setCalcForm] = useState({ period_type: "monthly", period_label: new Date().toISOString().slice(0, 7), driver_id: "" });
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
      const payload: any = { period_type: calcForm.period_type, period_label: calcForm.period_label };
      if (calcForm.driver_id) payload.driver_id = Number(calcForm.driver_id);
      const d = await api("POST", "/salary/calculate", payload);
      toast({ title: `已計算薪資，共 ${d.count ?? 0} 筆` });
      load();
    } catch (err: any) { toast({ title: "計算失敗", description: err.message, variant: "destructive" }); }
    finally { setCalcLoading(false); }
  };

  const settle = async (id: number) => {
    try {
      await api("POST", "/salary/settle", { record_id: id });
      toast({ title: "已標記為已結算" });
      load();
    } catch (err: any) { toast({ title: "操作失敗", description: err.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-slate-800">薪資結算</h2>

      {/* Calc panel */}
      <Card className="border-0 shadow-sm bg-green-50">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" />計算薪資</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Select value={calcForm.period_type} onValueChange={v => setCalcForm(f => ({ ...f, period_type: v }))}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="monthly">月結</SelectItem><SelectItem value="weekly">週結</SelectItem></SelectContent>
            </Select>
            <Input value={calcForm.period_label} onChange={e => setCalcForm(f => ({ ...f, period_label: e.target.value }))} placeholder="2026-04" className="bg-white" />
            <Select value={calcForm.driver_id} onValueChange={v => setCalcForm(f => ({ ...f, driver_id: v }))}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="全部司機" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部司機</SelectItem>
                {drivers.map((d: any) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={calcSalary} disabled={calcLoading} className="bg-green-600 hover:bg-green-700 text-white gap-1">
              {calcLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {calcLoading ? "計算中…" : "開始計算"}
            </Button>
          </div>
          <p className="text-xs text-green-700">計算後的薪資紀錄會顯示在下方，確認無誤後再點「標記結算」</p>
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

  const handleLogout = () => { logout(); setLocation("/login"); };

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
