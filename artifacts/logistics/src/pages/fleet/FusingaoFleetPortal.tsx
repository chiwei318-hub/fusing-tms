import { useState, useEffect, useCallback } from "react";
import {
  Truck, LogOut, RefreshCw, CheckCircle2, Clock, Package,
  DollarSign, ChevronDown, ChevronRight, Zap, Download,
  CheckSquare, Square, AlertCircle, UserPlus, User, Edit2, Save, X,
  TrendingUp, ArrowRight, ClipboardList, Send, Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const fapi = (path: string) => `${BASE_URL}/api${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface RouteItem {
  id: number; status: string; notes: string;
  completed_at: string | null; fleet_completed_at: string | null;
  driver_payment_status: string | null; created_at: string;
  fleet_grabbed_at: string | null;
  driver_name: string | null; vehicle_plate: string | null;
  shopee_rate: number | null; fleet_rate: number | null; service_type: string | null;
  routeId: string; dock: string | null; driverId: string | null;
  stations: number; prefix: string | null; stopList: string[];
}
interface MonthRow {
  month: string; month_label: string; route_count: string;
  completed_count: string; billed_count: string;
  fleet_payout: string; billed_amount: string;
}
interface FleetDriver {
  id: number; fleet_id: number; name: string; phone: string | null;
  vehicle_plate: string | null; vehicle_type: string; is_active: boolean;
  total_routes: string; completed_routes: string; total_earnings: string;
}
interface SettlementSummary {
  shopee_income: string; fleet_receive: string; commission_rate: string;
}
interface DriverSettlement {
  driver_name: string; vehicle_plate: string | null;
  route_count: string; completed_count: string; earnings: string;
}

interface DispatchOrder {
  id: number;
  fleet_id: number;
  fleet_name: string;
  title: string;
  week_start: string;
  week_end: string;
  status: "sent" | "acknowledged" | "assigned";
  notes: string | null;
  route_count: number;
  assigned_count: number;
  sent_at: string;
  acknowledged_at: string | null;
}

interface DispatchOrderRoute {
  id: number;
  dispatch_order_id: number;
  order_id: number | null;
  route_label: string | null;
  route_date: string | null;
  prefix: string | null;
  assigned_driver_id: number | null;
  assigned_driver_name: string | null;
  assigned_at: string | null;
}

type PortalTab = "available" | "mine" | "billing" | "drivers" | "settlement" | "dispatch";

const fmt = (n: number | string) => `NT$ ${Math.round(Number(n)).toLocaleString()}`;

const prefixColor: Record<string, string> = {
  FN: "bg-blue-100 text-blue-700", FM: "bg-violet-100 text-violet-700",
  A3: "bg-cyan-100 text-cyan-700", NB: "bg-orange-100 text-orange-700",
  WB: "bg-indigo-100 text-indigo-700", WD: "bg-pink-100 text-pink-700",
};

export default function FusingaoFleetPortal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fleetId = user?.fleetId ?? user?.id;

  const [tab, setTab]           = useState<PortalTab>("available");
  const [loading, setLoading]   = useState(false);
  const [grabbingId, setGrabbingId] = useState<number | null>(null);

  const [available, setAvailable] = useState<RouteItem[]>([]);
  const [mine, setMine]           = useState<RouteItem[]>([]);
  const [months, setMonths]       = useState<MonthRow[]>([]);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("");

  // ── Driver management state ────────────────────────────────────────────────
  const [drivers, setDrivers]         = useState<FleetDriver[]>([]);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [editingDriver, setEditingDriver]   = useState<FleetDriver | null>(null);
  const [driverForm, setDriverForm]         = useState({ name:"", phone:"", vehicle_plate:"", vehicle_type:"一般" });
  const [assigningRoute, setAssigningRoute] = useState<number | null>(null);

  // ── Settlement state ───────────────────────────────────────────────────────
  const [settlement, setSettlement]         = useState<SettlementSummary | null>(null);
  const [driverSettlements, setDriverSettlements] = useState<DriverSettlement[]>([]);
  const [settlementMonth, setSettlementMonth] = useState("");

  // ── Dispatch orders state ──────────────────────────────────────────────────
  const [dispatchOrders, setDispatchOrders]   = useState<DispatchOrder[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [expandedOrder, setExpandedOrder]     = useState<number | null>(null);
  const [orderRoutes, setOrderRoutes]         = useState<Record<number, DispatchOrderRoute[]>>({});
  const [assigningRouteItem, setAssigningRouteItem] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!fleetId) return;
    setLoading(true);
    try {
      const params = filterMonth ? `?month=${filterMonth}` : "";
      const [r1, r2, r3] = await Promise.all([
        fetch(fapi(`/fusingao/available${params}`)).then(x => x.json()),
        fetch(fapi(`/fusingao/fleets/${fleetId}/routes${params}`)).then(x => x.json()),
        fetch(fapi(`/fusingao/fleets/${fleetId}/monthly`)).then(x => x.json()),
      ]);
      if (r1.ok) setAvailable(r1.routes ?? []);
      if (r2.ok) setMine(r2.routes ?? []);
      if (r3.ok) setMonths(r3.months ?? []);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [fleetId, filterMonth]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => { logout(); setLocation("/login/fleet"); };

  const grab = async (routeId: number) => {
    if (grabbingId) return;
    setGrabbingId(routeId);
    try {
      const res = await fetch(fapi(`/fusingao/routes/${routeId}/grab`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "搶單成功！路線已加入我的任務" });
      await load();
      setTab("mine");
    } catch (err: any) {
      toast({ title: "搶單失敗", description: err.message, variant: "destructive" });
    } finally { setGrabbingId(null); }
  };

  const release = async (routeId: number) => {
    await fetch(fapi(`/fusingao/routes/${routeId}/grab`), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleetId }),
    });
    toast({ title: "已放棄路線" });
    await load();
  };

  const markComplete = async (routeId: number, done: boolean) => {
    await fetch(fapi(`/fusingao/routes/${routeId}/fleet-complete`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleetId, completed: done }),
    });
    await load();
    toast({ title: done ? "已標記完成" : "已取消完成" });
  };

  // ── Driver management handlers ─────────────────────────────────────────────
  const loadDrivers = useCallback(async () => {
    if (!fleetId) return;
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/drivers`)).then(x => x.json());
    if (d.ok) setDrivers(d.drivers ?? []);
  }, [fleetId]); // eslint-disable-line

  useEffect(() => { if (tab === "drivers") loadDrivers(); }, [tab]); // eslint-disable-line

  const loadSettlement = useCallback(async () => {
    if (!fleetId) return;
    const params = settlementMonth ? `?month=${settlementMonth}` : "";
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/settlement${params}`)).then(x => x.json());
    if (d.ok) { setSettlement(d.summary); setDriverSettlements(d.drivers ?? []); }
  }, [fleetId, settlementMonth]); // eslint-disable-line

  useEffect(() => { if (tab === "settlement") loadSettlement(); }, [tab, settlementMonth]); // eslint-disable-line

  // ── Dispatch orders handlers ───────────────────────────────────────────────
  const loadDispatchOrders = useCallback(async () => {
    if (!fleetId) return;
    setDispatchLoading(true);
    try {
      const d = await fetch(fapi(`/dispatch-orders/fleet/${fleetId}`)).then(x => x.json());
      if (d.ok) setDispatchOrders(d.orders ?? []);
    } finally { setDispatchLoading(false); }
  }, [fleetId]); // eslint-disable-line

  useEffect(() => { if (tab === "dispatch") loadDispatchOrders(); }, [tab]); // eslint-disable-line

  const toggleOrderExpand = async (orderId: number) => {
    if (expandedOrder === orderId) { setExpandedOrder(null); return; }
    setExpandedOrder(orderId);
    if (!orderRoutes[orderId]) {
      const d = await fetch(fapi(`/dispatch-orders/${orderId}`)).then(x => x.json());
      if (d.ok) setOrderRoutes(prev => ({ ...prev, [orderId]: d.routes ?? [] }));
    }
    // Auto-acknowledge on open
    const order = dispatchOrders.find(o => o.id === orderId);
    if (order?.status === "sent") {
      await fetch(fapi(`/dispatch-orders/${orderId}/acknowledge`), { method: "PUT" });
      setDispatchOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "acknowledged" } : o));
    }
  };

  const assignDriverToRoute = async (orderId: number, routeItemId: number, driver: FleetDriver | null) => {
    setAssigningRouteItem(routeItemId);
    try {
      await fetch(fapi(`/dispatch-orders/${orderId}/routes/${routeItemId}/assign`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: driver?.id ?? null, driver_name: driver?.name ?? null }),
      });
      // Refresh routes
      const d = await fetch(fapi(`/dispatch-orders/${orderId}`)).then(x => x.json());
      if (d.ok) {
        setOrderRoutes(prev => ({ ...prev, [orderId]: d.routes ?? [] }));
        setDispatchOrders(prev => prev.map(o => {
          if (o.id !== orderId) return o;
          const assignedCount = (d.routes ?? []).filter((r: DispatchOrderRoute) => r.assigned_driver_id).length;
          const total = (d.routes ?? []).length;
          return { ...o, assigned_count: assignedCount, status: total > 0 && assignedCount === total ? "assigned" : "acknowledged" };
        }));
      }
      toast({ title: driver ? `已指派 ${driver.name}` : "已清除指派" });
    } finally { setAssigningRouteItem(null); }
  };

  const saveDriver = async () => {
    if (!driverForm.name) return toast({ title: "司機姓名為必填", variant: "destructive" });
    const url = editingDriver
      ? fapi(`/fusingao/fleets/${fleetId}/drivers/${editingDriver.id}`)
      : fapi(`/fusingao/fleets/${fleetId}/drivers`);
    const method = editingDriver ? "PUT" : "POST";
    const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(driverForm) }).then(x => x.json());
    if (!d.ok) return toast({ title: d.error ?? "儲存失敗", variant: "destructive" });
    toast({ title: editingDriver ? "司機資料已更新" : "司機新增成功" });
    setShowDriverForm(false);
    setEditingDriver(null);
    loadDrivers();
  };

  const toggleDriverActive = async (drv: FleetDriver) => {
    await fetch(fapi(`/fusingao/fleets/${fleetId}/drivers/${drv.id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...drv, is_active: !drv.is_active }),
    });
    loadDrivers();
  };

  const assignDriver = async (routeId: number, driverId: number | null) => {
    setAssigningRoute(routeId);
    await fetch(fapi(`/fusingao/routes/${routeId}/assign-driver`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleetId, driverId }),
    });
    await load();
    setAssigningRoute(null);
  };

  const exportMonthCSV = (m: MonthRow) => {
    const myRoutes = mine.filter(r => r.created_at?.startsWith(m.month));
    const lines = [
      "路線編號,服務,站點數,司機,完成狀態,金額",
      ...myRoutes.map(r =>
        `${r.routeId},${r.service_type ?? ""},${r.stations},${r.driver_name ?? r.driverId ?? ""},${r.fleet_completed_at ? "已完成" : "進行中"},${r.fleet_rate ?? r.shopee_rate ?? ""}`
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `車隊對帳_${m.month}.csv`; a.click();
  };

  // ── Month options
  const monthOptions = months.map(m => ({ value: m.month, label: m.month_label }));

  // ── Route card component
  const RouteCard = ({ r, showGrab }: { r: RouteItem; showGrab?: boolean }) => {
    const isOpen = expandedRoute === r.id;
    const isDone = !!r.fleet_completed_at || !!r.completed_at;
    return (
      <Card className={`overflow-hidden ${isDone ? "border-green-200" : ""}`}>
        <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
          onClick={() => setExpandedRoute(isOpen ? null : r.id)}>
          {!showGrab && (
            <button className="shrink-0" onClick={e => { e.stopPropagation(); markComplete(r.id, !isDone); }}>
              {isDone ? <CheckSquare className="h-5 w-5 text-green-500" /> : <Square className="h-5 w-5 text-gray-300" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-gray-800 text-sm">{r.routeId}</span>
              {r.prefix && <Badge className={`text-xs ${prefixColor[r.prefix] ?? "bg-gray-100"}`}>{r.prefix}</Badge>}
              {r.service_type && <span className="text-xs text-gray-500">{r.service_type}</span>}
              {!showGrab && (isDone
                ? <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1 inline"/>已完成</Badge>
                : <Badge className="bg-amber-100 text-amber-700 text-xs"><Clock className="h-3 w-3 mr-1 inline"/>進行中</Badge>)}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {r.stations} 站 {r.dock && r.dock !== "—" ? `・碼頭 ${r.dock}` : ""}
              {(r.driver_name || (r.driverId && r.driverId !== "—")) && ` ・ 司機：${r.driver_name ?? "工號"+r.driverId}`}
              {r.vehicle_plate && ` (${r.vehicle_plate})`}
              {" ・ "}{new Date(r.created_at).toLocaleDateString("zh-TW")}
            </p>
          </div>
          <div className="text-right shrink-0">
            {showGrab ? (
              <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                disabled={!!grabbingId}
                onClick={e => { e.stopPropagation(); grab(r.id); }}>
                <Zap className="h-3.5 w-3.5 mr-1" />{grabbingId === r.id ? "搶中…" : "搶單"}
              </Button>
            ) : (
              <div>
                <p className="font-bold text-orange-600 text-sm">{r.fleet_rate ? fmt(r.fleet_rate) : r.shopee_rate ? fmt(r.shopee_rate) : "—"}</p>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto mt-1" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto mt-1" />}
              </div>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="border-t bg-gray-50 px-4 pb-3 pt-2">
            {/* Driver assignment */}
            {!showGrab && (
              <div className="flex items-center gap-2 mb-2">
                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <Select
                  value={String((r as any).fleet_driver_id ?? "none")}
                  onValueChange={v => assignDriver(r.id, v === "none" ? null : Number(v))}
                  disabled={assigningRoute === r.id}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="指派給旗下司機" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未指派</SelectItem>
                    {drivers.filter(d => d.is_active).map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name} {d.vehicle_plate ? `(${d.vehicle_plate})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600">配送站點（{r.stations} 站）</p>
              <div className="flex gap-2">
                {!showGrab && !isDone && (
                  <Button size="sm" className="h-6 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => markComplete(r.id, true)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />標記完成
                  </Button>
                )}
                {!showGrab && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-600"
                    onClick={() => release(r.id)}>放棄此路線</Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {r.stopList.map((stop, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-gray-600 bg-white rounded px-2 py-1 border">
                  <span className="text-gray-300 font-mono text-xs w-4 shrink-0">{i+1}.</span>
                  {stop}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const totalMine = mine.length;
  const doneMine  = mine.filter(r => !!r.fleet_completed_at || !!r.completed_at).length;
  const totalPay  = mine.reduce((s, r) => s + Number(r.fleet_rate ?? r.shopee_rate ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-orange-700 shadow">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 rounded-lg p-2"><Truck className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-white font-bold">{user?.name}</h1>
              <p className="text-orange-200 text-xs">福興高合作車隊 · 富詠運輸蝦皮路線</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-orange-200 hover:text-white hover:bg-white/10 h-8"
            onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />登出
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Package className="h-4 w-4 text-orange-500"/>, label:"我的路線", val: `${totalMine} 趟` },
            { icon: <CheckCircle2 className="h-4 w-4 text-green-500"/>, label:"已完成", val: `${doneMine}/${totalMine}` },
            { icon: <DollarSign className="h-4 w-4 text-blue-500"/>, label:"合計金額", val: fmt(totalPay) },
          ].map(k => (
            <Card key={k.label}><CardContent className="p-3">
              {k.icon}
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              <p className="font-bold text-gray-800">{k.val}</p>
            </CardContent></Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b bg-white rounded-t-lg px-3 pt-2 overflow-x-auto">
          {([
            { id:"dispatch",   label:`📋 派車單${dispatchOrders.filter(o=>o.status==="sent").length > 0 ? ` 🔴` : dispatchOrders.length > 0 ? ` (${dispatchOrders.length})` : ""}` },
            { id:"available",  label:`🔥 可搶路線 (${available.length})` },
            { id:"mine",       label:`📦 我的任務 (${mine.length})` },
            { id:"billing",    label:"💰 月結帳單" },
            { id:"drivers",    label:`👤 旗下司機 (${drivers.length})` },
            { id:"settlement", label:"📊 結算分析" },
          ] as { id: PortalTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${t.id===tab?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-gray-400" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Month filter */}
        {(tab === "mine" || tab === "available") && (
          <div className="flex gap-2 items-center">
            <Select value={filterMonth || "all"} onValueChange={v => setFilterMonth(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="全部月份" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部月份</SelectItem>
                {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ─── Available routes ─── */}
        {tab === "available" && (
          <div className="space-y-2">
            {available.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                目前沒有可搶的路線
              </div>
            ) : (
              available.map(r => <RouteCard key={r.id} r={r} showGrab />)
            )}
          </div>
        )}

        {/* ─── My routes ─── */}
        {tab === "mine" && (
          <div className="space-y-2">
            {mine.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚未搶單，請到「可搶路線」選擇
              </div>
            ) : (
              mine.map(r => <RouteCard key={r.id} r={r} />)
            )}
          </div>
        )}

        {/* ─── Billing ─── */}
        {tab === "billing" && (
          <div className="space-y-3">
            {months.map(m => {
              const isOpen = expandedMonth === m.month;
              const pct = Number(m.fleet_payout) > 0
                ? Math.round(Number(m.billed_amount) / Number(m.fleet_payout) * 100) : 0;
              return (
                <Card key={m.month} className="overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedMonth(isOpen ? null : m.month)}>
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div>
                        <h3 className="font-bold text-gray-800">{m.month_label}</h3>
                        <p className="text-xs text-gray-400">{m.route_count} 趟 ・完成 {m.completed_count}/{m.route_count} ・已對帳 {m.billed_count}/{m.route_count}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-orange-600">{fmt(m.fleet_payout)}</p>
                      <div className="flex items-center gap-2 justify-end mt-1">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct}% 已收</span>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t">
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-0 border-b bg-orange-50 text-center">
                        {[
                          { label:"應收金額",  val: fmt(m.fleet_payout), cls:"text-orange-700 font-bold" },
                          { label:"已對帳",    val: fmt(m.billed_amount), cls:"text-emerald-700" },
                          { label:"未對帳",    val: fmt(Number(m.fleet_payout)-Number(m.billed_amount)), cls:"text-amber-700" },
                        ].map(k => (
                          <div key={k.label} className="py-2 border-r last:border-0">
                            <p className="text-xs text-gray-500">{k.label}</p>
                            <p className={`text-sm font-semibold ${k.cls}`}>{k.val}</p>
                          </div>
                        ))}
                      </div>
                      {/* Route table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-gray-50 text-gray-500">
                              <th className="text-left p-2">路線</th>
                              <th className="text-right p-2">站點</th>
                              <th className="text-center p-2">完成</th>
                              <th className="text-right p-2">金額</th>
                              <th className="text-center p-2">對帳</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mine.filter(r => r.created_at?.startsWith(m.month)).map(r => (
                              <tr key={r.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-mono">
                                  {r.routeId}
                                  {r.prefix && <Badge className={`ml-1 text-xs ${prefixColor[r.prefix] ?? ""}`}>{r.prefix}</Badge>}
                                </td>
                                <td className="p-2 text-right">{r.stations}</td>
                                <td className="p-2 text-center">
                                  {r.fleet_completed_at || r.completed_at
                                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                    : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                                </td>
                                <td className="p-2 text-right font-mono text-orange-600">{r.fleet_rate ? fmt(r.fleet_rate) : "—"}</td>
                                <td className="p-2 text-center">
                                  {r.driver_payment_status === "paid"
                                    ? <CheckSquare className="h-4 w-4 text-emerald-500 mx-auto" />
                                    : <Square className="h-4 w-4 text-gray-300 mx-auto" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex p-3 border-t bg-gray-50">
                        <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => exportMonthCSV(m)}>
                          <Download className="h-3.5 w-3.5 mr-1" />下載對帳單
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
            {months.length === 0 && <div className="text-center py-8 text-gray-400">尚無對帳記錄</div>}
          </div>
        )}

        {/* ─── Drivers tab ─── */}
        {tab === "drivers" && (
          <div className="space-y-3">
            {/* Add / Edit form */}
            {showDriverForm && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm">{editingDriver ? "編輯司機" : "新增司機"}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">姓名 <span className="text-red-500">*</span></p>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={driverForm.name}
                        onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} placeholder="司機姓名" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">電話</p>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={driverForm.phone}
                        onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} placeholder="09XXXXXXXX" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">車牌號碼</p>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={driverForm.vehicle_plate}
                        onChange={e => setDriverForm(p => ({ ...p, vehicle_plate: e.target.value }))} placeholder="ABC-1234" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">車型</p>
                      <select className="w-full border rounded px-2 py-1 text-sm bg-white" value={driverForm.vehicle_type}
                        onChange={e => setDriverForm(p => ({ ...p, vehicle_type: e.target.value }))}>
                        {["一般","貨車","廂型","機車"].map(v => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={saveDriver}>
                      <Save className="h-3.5 w-3.5 mr-1" />儲存
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowDriverForm(false); setEditingDriver(null); }}>
                      <X className="h-3.5 w-3.5 mr-1" />取消
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!showDriverForm && (
              <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                onClick={() => { setEditingDriver(null); setDriverForm({ name:"", phone:"", vehicle_plate:"", vehicle_type:"一般" }); setShowDriverForm(true); }}>
                <UserPlus className="h-3.5 w-3.5 mr-1" />新增司機
              </Button>
            )}

            {/* Driver list */}
            {drivers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚未新增旗下司機
              </div>
            ) : (
              <div className="space-y-2">
                {drivers.map(d => (
                  <Card key={d.id} className={`overflow-hidden ${!d.is_active ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-3 p-3">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-800">{d.name}</span>
                          {d.vehicle_plate && <span className="text-xs text-gray-400 font-mono">{d.vehicle_plate}</span>}
                          <Badge className={`text-xs ${d.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {d.is_active ? "在職" : "停用"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.phone ?? "—"} ・{d.vehicle_type}
                          ・完成 {d.completed_routes}/{d.total_routes} 趟
                          {Number(d.total_earnings) > 0 && ` ・ ${fmt(d.total_earnings)}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-orange-500"
                          onClick={() => { setEditingDriver(d); setDriverForm({ name:d.name, phone:d.phone??"", vehicle_plate:d.vehicle_plate??"", vehicle_type:d.vehicle_type }); setShowDriverForm(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-gray-600"
                          onClick={() => toggleDriverActive(d)}>
                          {d.is_active ? "停用" : "啟用"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Dispatch Orders tab ─── */}
        {tab === "dispatch" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                平台派車單
              </p>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadDispatchOrders} disabled={dispatchLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${dispatchLoading ? "animate-spin" : ""}`} />
                重新整理
              </Button>
            </div>

            {dispatchOrders.length === 0 && !dispatchLoading && (
              <div className="text-center py-16 text-gray-400">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                <p className="text-sm">尚無派車單</p>
                <p className="text-xs mt-1 text-gray-300">平台發送派車單後，會在這裡顯示</p>
              </div>
            )}

            {dispatchOrders.map(order => {
              const isExpanded = expandedOrder === order.id;
              const routes = orderRoutes[order.id] ?? [];
              const unread = order.status === "sent";
              const statusConfig = {
                sent:         { label: "待確認", cls: "bg-red-100 text-red-700",    icon: Bell },
                acknowledged: { label: "已確認", cls: "bg-amber-100 text-amber-700", icon: Clock },
                assigned:     { label: "已排班", cls: "bg-green-100 text-green-700", icon: CheckCircle2 },
              }[order.status] ?? { label: order.status, cls: "bg-gray-100 text-gray-600", icon: Clock };
              const StatusIcon = statusConfig.icon;

              return (
                <Card key={order.id} className={`overflow-hidden transition-all ${unread ? "ring-2 ring-red-400 ring-offset-1" : ""}`}>
                  {/* Order header */}
                  <button
                    className="w-full flex items-start gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
                    onClick={() => toggleOrderExpand(order.id)}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${statusConfig.cls}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-800">{order.title}</p>
                        {unread && <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">NEW</Badge>}
                        <Badge className={`text-[10px] px-2 py-0 ${statusConfig.cls}`}>{statusConfig.label}</Badge>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {order.week_start} ～ {order.week_end}
                        &nbsp;·&nbsp;{order.route_count} 條路線
                        {order.assigned_count > 0 && <span className="text-purple-600 ml-1">({order.assigned_count} 已排班)</span>}
                      </p>
                      {order.notes && (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 mt-1 inline-block">📌 {order.notes}</p>
                      )}
                    </div>
                    <div className="text-gray-400 mt-0.5 shrink-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>

                  {/* Expanded: route assignments */}
                  {isExpanded && (
                    <CardContent className="p-0 border-t">
                      {routes.length === 0 ? (
                        <div className="flex justify-center py-6">
                          <RefreshCw className="h-4 w-4 animate-spin text-gray-300" />
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b text-gray-500">
                                <th className="text-left px-3 py-2 font-medium">日期</th>
                                <th className="text-left px-3 py-2 font-medium">路線</th>
                                <th className="text-left px-3 py-2 font-medium">指派司機</th>
                                <th className="px-3 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {routes.map(r => (
                                <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.route_date ?? "—"}</td>
                                  <td className="px-3 py-2">
                                    <span className="font-medium text-gray-800">{r.route_label ?? "—"}</span>
                                    {r.prefix && (
                                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{r.prefix}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    {r.assigned_driver_name ? (
                                      <span className="flex items-center gap-1 text-purple-700 font-medium">
                                        <User className="h-3 w-3" />
                                        {r.assigned_driver_name}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300">未指派</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={r.assigned_driver_id ? String(r.assigned_driver_id) : "none"}
                                      onValueChange={v => {
                                        const d = v === "none" ? null : drivers.find(dr => String(dr.id) === v) ?? null;
                                        assignDriverToRoute(order.id, r.id, d);
                                      }}
                                      disabled={assigningRouteItem === r.id}
                                    >
                                      <SelectTrigger className="h-7 w-28 text-[11px]">
                                        <SelectValue placeholder="選擇司機" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">（清除）</SelectItem>
                                        {drivers.filter(d => d.is_active).map(d => (
                                          <SelectItem key={d.id} value={String(d.id)}>
                                            {d.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Progress bar */}
                      {routes.length > 0 && (
                        <div className="px-4 py-2.5 bg-gray-50 border-t flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-purple-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${routes.length > 0 ? (order.assigned_count / routes.length) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-500 shrink-0">
                            {order.assigned_count}/{routes.length} 已排班
                          </span>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ─── Settlement analysis tab ─── */}
        {tab === "settlement" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={settlementMonth || "all"} onValueChange={v => setSettlementMonth(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="全部期間" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部期間</SelectItem>
                  {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadSettlement}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />重新整理
              </Button>
            </div>

            {settlement && (
              <>
                {/* Flow chart */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm text-gray-700">結算鏈</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <p className="text-xs text-blue-500">Shopee 支付</p>
                        <p className="font-bold text-blue-700 text-sm">{fmt(settlement.shopee_income)}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <p className="text-xs text-orange-500">平台抽佣 {settlement.commission_rate}%</p>
                        <p className="font-bold text-orange-700 text-sm">
                          {fmt(Number(settlement.shopee_income) - Number(settlement.fleet_receive))}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
                        <p className="text-xs text-green-500">車隊應收</p>
                        <p className="font-bold text-green-700 text-sm">{fmt(settlement.fleet_receive)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Per-driver breakdown */}
                {driverSettlements.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm text-gray-700 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-orange-500" />司機業績分布
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-gray-50 text-gray-500">
                              <th className="text-left p-3">司機</th>
                              <th className="text-right p-3">路線</th>
                              <th className="text-right p-3">完成</th>
                              <th className="text-right p-3">業績</th>
                            </tr>
                          </thead>
                          <tbody>
                            {driverSettlements.map((d, i) => (
                              <tr key={i} className="border-b hover:bg-gray-50">
                                <td className="p-3 font-medium">
                                  {d.driver_name}
                                  {d.vehicle_plate && <span className="text-gray-400 font-mono ml-1">({d.vehicle_plate})</span>}
                                </td>
                                <td className="p-3 text-right">{d.route_count}</td>
                                <td className="p-3 text-right">{d.completed_count}</td>
                                <td className="p-3 text-right font-mono text-orange-600 font-semibold">{fmt(d.earnings)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {driverSettlements.length === 0 && (
                  <div className="text-center py-6 text-gray-400 text-sm">尚無司機業績資料</div>
                )}
              </>
            )}
            {!settlement && (
              <div className="text-center py-12 text-gray-400">
                <DollarSign className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚無結算資料
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
