import { useState, useEffect, useCallback } from "react";
import {
  Truck, LogOut, RefreshCw, CheckCircle2, Clock, Package,
  DollarSign, ChevronDown, ChevronRight, Zap, Download,
  CheckSquare, Square, AlertCircle, UserPlus, User, Edit2, Save, X,
  TrendingUp, ArrowRight, ClipboardList, Send, Bell, Shield, Key, Trash2, UserCheck, Eye, EyeOff,
  Link, Copy, Check, Fuel, Settings2,
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

interface FleetSubAccount {
  id: number; fleet_id: number; fleet_driver_id: number | null;
  username: string; display_name: string; shopee_driver_id: string | null;
  role: string; is_active: boolean; created_at: string;
  driver_name: string | null; vehicle_plate: string | null;
}
interface SubAccountForm {
  display_name: string; username: string; password: string;
  shopee_driver_id: string; role: string; fleet_driver_id: string;
}
const DEFAULT_SUB_FORM: SubAccountForm = {
  display_name: "", username: "", password: "",
  shopee_driver_id: "", role: "driver", fleet_driver_id: "",
};

type PortalTab = "available" | "mine" | "billing" | "drivers" | "settlement" | "dispatch" | "sub-accounts";

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
  const isSubAccount   = user?.role === "fleet_sub";
  const shopeeDriverId = (user as any)?.shopeeDriverId as string | null;

  const [tab, setTab]           = useState<PortalTab>(isSubAccount ? "mine" : "available");
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
  const [adjustment, setAdjustment] = useState<{
    extra_deduct_rate: number; fuel_amount: number; other_amount: number; other_label: string; note: string;
  }>({ extra_deduct_rate: 0, fuel_amount: 0, other_amount: 0, other_label: "", note: "" });
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjExpanded, setAdjExpanded] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // ── Dispatch orders state ──────────────────────────────────────────────────
  const [dispatchOrders, setDispatchOrders]   = useState<DispatchOrder[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [expandedOrder, setExpandedOrder]     = useState<number | null>(null);
  const [orderRoutes, setOrderRoutes]         = useState<Record<number, DispatchOrderRoute[]>>({});
  const [assigningRouteItem, setAssigningRouteItem] = useState<number | null>(null);

  // ── Sub-accounts state ────────────────────────────────────────────────────
  const [subAccounts, setSubAccounts]           = useState<FleetSubAccount[]>([]);
  const [showSubForm, setShowSubForm]           = useState(false);
  const [editingSub, setEditingSub]             = useState<FleetSubAccount | null>(null);
  const [subForm, setSubForm]                   = useState<SubAccountForm>(DEFAULT_SUB_FORM);
  const [showPw, setShowPw]                     = useState(false);
  const [resetPwId, setResetPwId]               = useState<number | null>(null);
  const [resetPwVal, setResetPwVal]             = useState("");
  const [subLoading, setSubLoading]             = useState(false);

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

  const handleLogout = () => { logout(); setLocation("/"); };

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
    if (d.ok) {
      setSettlement(d.summary);
      setDriverSettlements(d.drivers ?? []);
      if (d.adjustment) {
        setAdjustment({
          extra_deduct_rate: Number(d.adjustment.extra_deduct_rate ?? 0),
          fuel_amount: Number(d.adjustment.fuel_amount ?? 0),
          other_amount: Number(d.adjustment.other_amount ?? 0),
          other_label: d.adjustment.other_label ?? "",
          note: d.adjustment.note ?? "",
        });
      } else {
        setAdjustment({ extra_deduct_rate: 0, fuel_amount: 0, other_amount: 0, other_label: "", note: "" });
      }
    }
    setShareLink(""); // reset share link when month changes
  }, [fleetId, settlementMonth]); // eslint-disable-line

  useEffect(() => { if (tab === "settlement") loadSettlement(); }, [tab, settlementMonth]); // eslint-disable-line

  const saveAdjustment = async () => {
    if (!fleetId || !settlementMonth) return;
    setAdjSaving(true);
    try {
      const r = await fetch(fapi(`/fusingao/fleets/${fleetId}/adjustments`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: settlementMonth, ...adjustment }),
      });
      const d = await r.json();
      if (d.ok) toast({ title: "已儲存扣除設定" });
      else throw new Error(d.error);
    } catch (err: any) {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    } finally { setAdjSaving(false); }
  };

  const generateShareLink = async () => {
    if (!fleetId || !settlementMonth) return;
    setShareLinkLoading(true);
    try {
      const r = await fetch(fapi(`/fusingao/fleets/${fleetId}/report-token`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: settlementMonth }),
      });
      const d = await r.json();
      if (d.ok) {
        const base = window.location.origin + (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
        setShareLink(`${base}/fleet/report/${d.token}`);
      } else throw new Error(d.error);
    } catch (err: any) {
      toast({ title: "產生連結失敗", description: err.message, variant: "destructive" });
    } finally { setShareLinkLoading(false); }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

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

  // ── Sub-accounts handlers ─────────────────────────────────────────────────
  const loadSubAccounts = useCallback(async () => {
    if (!fleetId) return;
    setSubLoading(true);
    try {
      const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts`)).then(x => x.json());
      if (d.ok) setSubAccounts(d.subAccounts ?? []);
    } finally { setSubLoading(false); }
  }, [fleetId]); // eslint-disable-line

  useEffect(() => { if (tab === "sub-accounts") loadSubAccounts(); }, [tab]); // eslint-disable-line

  const saveSub = async () => {
    if (!subForm.display_name || !subForm.username || (!editingSub && !subForm.password)) {
      return toast({ title: "請填入顯示名稱、帳號" + (!editingSub ? "、密碼" : ""), variant: "destructive" });
    }
    setSubLoading(true);
    try {
      if (editingSub) {
        const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts/${editingSub.id}`), {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            display_name: subForm.display_name,
            shopee_driver_id: subForm.shopee_driver_id || null,
            role: subForm.role,
            fleet_driver_id: subForm.fleet_driver_id ? Number(subForm.fleet_driver_id) : null,
          }),
        }).then(x => x.json());
        if (!d.ok) return toast({ title: d.error ?? "更新失敗", variant: "destructive" });
        toast({ title: "子帳號已更新" });
      } else {
        const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts`), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: subForm.username.trim(),
            password: subForm.password,
            display_name: subForm.display_name.trim(),
            shopee_driver_id: subForm.shopee_driver_id || null,
            role: subForm.role,
            fleet_driver_id: subForm.fleet_driver_id ? Number(subForm.fleet_driver_id) : null,
          }),
        }).then(x => x.json());
        if (!d.ok) return toast({ title: d.error ?? "建立失敗", variant: "destructive" });
        toast({ title: "子帳號已建立", description: `帳號：${subForm.username}` });
      }
      setShowSubForm(false); setEditingSub(null); setSubForm(DEFAULT_SUB_FORM);
      loadSubAccounts();
    } finally { setSubLoading(false); }
  };

  const deleteSub = async (sub: FleetSubAccount) => {
    if (!confirm(`確定要刪除子帳號「${sub.display_name}」(${sub.username})？`)) return;
    await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts/${sub.id}`), { method: "DELETE" });
    toast({ title: "子帳號已刪除" });
    loadSubAccounts();
  };

  const toggleSubActive = async (sub: FleetSubAccount) => {
    await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts/${sub.id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !sub.is_active }),
    });
    loadSubAccounts();
  };

  const doResetPw = async (subId: number) => {
    if (!resetPwVal || resetPwVal.length < 4) {
      return toast({ title: "密碼至少 4 個字元", variant: "destructive" });
    }
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/sub-accounts/${subId}/reset-password`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPwVal }),
    }).then(x => x.json());
    if (!d.ok) return toast({ title: d.error ?? "重設失敗", variant: "destructive" });
    toast({ title: "密碼已重設" });
    setResetPwId(null); setResetPwVal("");
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

  // For sub-accounts, only show routes assigned to their driverId
  const visibleMine = isSubAccount && shopeeDriverId
    ? mine.filter(r => r.driverId === shopeeDriverId)
    : mine;
  const totalMine = visibleMine.length;
  const doneMine  = visibleMine.filter(r => !!r.fleet_completed_at || !!r.completed_at).length;
  const totalPay  = visibleMine.reduce((s, r) => s + Number(r.fleet_rate ?? r.shopee_rate ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-orange-700 shadow">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 rounded-lg p-2"><Truck className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-white font-bold">{user?.name}</h1>
              <p className="text-orange-200 text-xs">
                {isSubAccount
                  ? `司機帳號 · ${(user as any)?.fleetName ?? "合作車隊"}`
                  : "福興高合作車隊 · 富詠運輸蝦皮路線"
                }
              </p>
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
        <div className="flex flex-wrap gap-x-0.5 gap-y-0 border-b bg-white rounded-t-lg px-2 pt-1.5">
          {(isSubAccount ? [
            { id:"mine",     label:`📦 我的路線 (${mine.filter(r => !shopeeDriverId || r.driverId === shopeeDriverId).length})` },
            { id:"billing",  label:"💰 月結帳單" },
          ] : [
            { id:"dispatch",      label:`📋 派車單${dispatchOrders.filter(o=>o.status==="sent").length > 0 ? ` 🔴` : dispatchOrders.length > 0 ? ` (${dispatchOrders.length})` : ""}` },
            { id:"available",     label:`🔥 可搶路線 (${available.length})` },
            { id:"mine",          label:`📦 我的任務 (${mine.length})` },
            { id:"billing",       label:"💰 月結帳單" },
            { id:"drivers",       label:`👤 旗下司機 (${drivers.length})` },
            { id:"settlement",    label:"📊 結算分析" },
            { id:"sub-accounts",  label:`🔑 子帳號${subAccounts.length > 0 ? ` (${subAccounts.length})` : ""}` },
          ] as { id: PortalTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${t.id===tab?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-gray-400" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
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
            {visibleMine.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                {isSubAccount ? "目前沒有指派給您的路線" : "尚未搶單，請到「可搶路線」選擇"}
              </div>
            ) : (
              visibleMine.map(r => <RouteCard key={r.id} r={r} />)
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
        {tab === "settlement" && (() => {
          const shopeeIncome  = Number(settlement?.shopee_income ?? 0);
          const fleetReceive  = Number(settlement?.fleet_receive ?? 0);
          const commRate      = Number(settlement?.commission_rate ?? 15);
          const commAmt       = shopeeIncome - fleetReceive;
          const extraDeductAmt = fleetReceive * adjustment.extra_deduct_rate / 100;
          const netPayout     = fleetReceive - extraDeductAmt - adjustment.fuel_amount - adjustment.other_amount;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={settlementMonth || "all"} onValueChange={v => { setSettlementMonth(v === "all" ? "" : v); setShareLink(""); }}>
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
                  {/* Payout summary card */}
                  <Card className="border-orange-200 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
                    <CardHeader className="pb-1 pt-3 px-4">
                      <CardTitle className="text-sm text-gray-700">實付金額明細</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 space-y-2">
                      {/* Line items */}
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between items-center py-1 border-b text-gray-700">
                          <span className="text-gray-500">蝦皮運費總額</span>
                          <span className="font-mono font-semibold text-blue-700">{fmt(shopeeIncome)}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b text-orange-700">
                          <span className="text-xs">− 平台服務費（{commRate}%）</span>
                          <span className="font-mono text-xs">− {fmt(commAmt)}</span>
                        </div>
                        {adjustment.extra_deduct_rate > 0 && (
                          <div className="flex justify-between items-center py-1 border-b text-red-600">
                            <span className="text-xs">− 額外扣除（{adjustment.extra_deduct_rate}%）</span>
                            <span className="font-mono text-xs">− {fmt(extraDeductAmt)}</span>
                          </div>
                        )}
                        {adjustment.fuel_amount > 0 && (
                          <div className="flex justify-between items-center py-1 border-b text-red-600">
                            <span className="text-xs">− 油費代付</span>
                            <span className="font-mono text-xs">− {fmt(adjustment.fuel_amount)}</span>
                          </div>
                        )}
                        {adjustment.other_amount > 0 && (
                          <div className="flex justify-between items-center py-1 border-b text-red-600">
                            <span className="text-xs">− {adjustment.other_label || "其他代付"}</span>
                            <span className="font-mono text-xs">− {fmt(adjustment.other_amount)}</span>
                          </div>
                        )}
                      </div>
                      {/* Net */}
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between mt-1">
                        <div>
                          <p className="text-xs text-green-600 font-semibold">實付給加盟主</p>
                          {adjustment.note && <p className="text-[10px] text-green-500 mt-0.5">備注：{adjustment.note}</p>}
                        </div>
                        <p className="text-xl font-bold text-green-700 font-mono">{fmt(netPayout)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Adjustment panel ── */}
                  {settlementMonth && (
                    <Card className="border-dashed border-gray-300">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 rounded-t-lg"
                        onClick={() => setAdjExpanded(p => !p)}
                      >
                        <span className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-gray-400" />
                          扣除項目設定
                        </span>
                        {adjExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      {adjExpanded && (
                        <CardContent className="px-4 pb-4 space-y-3 border-t">
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">額外扣除百分比（%）</p>
                              <input
                                type="number" min="0" max="100" step="0.5"
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={adjustment.extra_deduct_rate}
                                onChange={e => setAdjustment(p => ({ ...p, extra_deduct_rate: Number(e.target.value) }))}
                                placeholder="例：5（表示5%）"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">油費代付（固定金額）</p>
                              <input
                                type="number" min="0" step="1"
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={adjustment.fuel_amount}
                                onChange={e => setAdjustment(p => ({ ...p, fuel_amount: Number(e.target.value) }))}
                                placeholder="例：3000"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">其他代付（固定金額）</p>
                              <input
                                type="number" min="0" step="1"
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={adjustment.other_amount}
                                onChange={e => setAdjustment(p => ({ ...p, other_amount: Number(e.target.value) }))}
                                placeholder="例：2000"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">其他代付說明</p>
                              <input
                                type="text"
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={adjustment.other_label}
                                onChange={e => setAdjustment(p => ({ ...p, other_label: e.target.value }))}
                                placeholder="例：保費代付"
                              />
                            </div>
                            <div className="col-span-2">
                              <p className="text-xs text-gray-500 mb-1">備注說明</p>
                              <input
                                type="text"
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={adjustment.note}
                                onChange={e => setAdjustment(p => ({ ...p, note: e.target.value }))}
                                placeholder="可選填"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                            onClick={saveAdjustment}
                            disabled={adjSaving}
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />{adjSaving ? "儲存中…" : "儲存扣除設定"}
                          </Button>
                        </CardContent>
                      )}
                    </Card>
                  )}

                  {/* ── Share link ── */}
                  {settlementMonth && (
                    <Card className="border-blue-200 bg-blue-50/40">
                      <CardContent className="px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                          <Link className="h-3.5 w-3.5" />可分享報表連結（給加盟夥伴）
                        </p>
                        {!shareLink ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                            onClick={generateShareLink}
                            disabled={shareLinkLoading}
                          >
                            <Link className="h-3.5 w-3.5 mr-1" />{shareLinkLoading ? "產生中…" : "產生報表連結"}
                          </Button>
                        ) : (
                          <div className="flex gap-2 items-center">
                            <input
                              readOnly
                              className="flex-1 border border-blue-200 rounded px-2 py-1 text-xs font-mono bg-white text-blue-800 min-w-0"
                              value={shareLink}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs shrink-0 ${shareCopied ? "border-green-400 text-green-600" : "border-blue-300 text-blue-700"}`}
                              onClick={copyShareLink}
                            >
                              {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        )}
                        <p className="text-[10px] text-blue-500">連結有效期 90 天，收到者無需登入即可查看報表</p>
                      </CardContent>
                    </Card>
                  )}

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
          );
        })()}

        {/* ─── Sub-accounts tab ─── */}
        {tab === "sub-accounts" && (
          <div className="space-y-3">
            {/* Create / Edit form */}
            {showSubForm && (
              <Card className="border-orange-200">
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-orange-500" />
                    {editingSub ? "編輯子帳號" : "新增司機子帳號"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">顯示名稱 <span className="text-red-500">*</span></p>
                      <input className="w-full border rounded px-2 py-1.5 text-sm"
                        value={subForm.display_name}
                        onChange={e => setSubForm(p => ({ ...p, display_name: e.target.value }))}
                        placeholder="例：王大明" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">登入帳號 <span className="text-red-500">*</span></p>
                      <input className="w-full border rounded px-2 py-1.5 text-sm"
                        value={subForm.username}
                        onChange={e => setSubForm(p => ({ ...p, username: e.target.value }))}
                        placeholder="英數字，登入用"
                        disabled={!!editingSub} />
                    </div>
                    {!editingSub && (
                      <div className="relative">
                        <p className="text-xs text-gray-500 mb-1">初始密碼 <span className="text-red-500">*</span></p>
                        <input
                          type={showPw ? "text" : "password"}
                          className="w-full border rounded px-2 py-1.5 text-sm pr-8"
                          value={subForm.password}
                          onChange={e => setSubForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="至少 4 個字元" />
                        <button className="absolute right-2 top-6 text-gray-400" onClick={() => setShowPw(p => !p)}>
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">蝦皮司機 ID</p>
                      <input className="w-full border rounded px-2 py-1.5 text-sm"
                        value={subForm.shopee_driver_id}
                        onChange={e => setSubForm(p => ({ ...p, shopee_driver_id: e.target.value }))}
                        placeholder="例：14681（過濾路線用）" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">角色</p>
                      <select className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                        value={subForm.role}
                        onChange={e => setSubForm(p => ({ ...p, role: e.target.value }))}>
                        <option value="driver">司機</option>
                        <option value="manager">主管（可看全部）</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">對應旗下司機</p>
                      <select className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                        value={subForm.fleet_driver_id}
                        onChange={e => setSubForm(p => ({ ...p, fleet_driver_id: e.target.value }))}>
                        <option value="">— 不連結 —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={String(d.id)}>{d.name}{d.vehicle_plate ? ` (${d.vehicle_plate})` : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={saveSub} disabled={subLoading}>
                      <Save className="h-3.5 w-3.5 mr-1" />{editingSub ? "更新" : "建立帳號"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowSubForm(false); setEditingSub(null); setSubForm(DEFAULT_SUB_FORM); }}>
                      <X className="h-3.5 w-3.5 mr-1" />取消
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!showSubForm && (
              <div className="flex gap-2">
                <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                  onClick={() => { setEditingSub(null); setSubForm(DEFAULT_SUB_FORM); setShowSubForm(true); loadDrivers(); }}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />新增司機子帳號
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadSubAccounts} disabled={subLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${subLoading ? "animate-spin" : ""}`} />重新整理
                </Button>
              </div>
            )}

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex gap-2">
              <Shield className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
              <div>
                <strong>關於子帳號：</strong>子帳號使用同一個「車隊入口」網址登入。司機登入後只能看到自己的路線與收益，不會看到車隊管理功能。
              </div>
            </div>

            {/* Sub-accounts list */}
            {subAccounts.length === 0 && !subLoading ? (
              <div className="text-center py-12 text-gray-400">
                <Key className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>尚未建立司機子帳號</p>
                <p className="text-xs mt-1">建立後司機可用自己的帳號密碼登入查看路線</p>
              </div>
            ) : (
              <div className="space-y-2">
                {subAccounts.map(sub => (
                  <Card key={sub.id} className={`overflow-hidden ${!sub.is_active ? "opacity-60" : ""}`}>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="shrink-0 w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center">
                            <UserCheck className="h-4 w-4 text-orange-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{sub.display_name}</p>
                            <p className="text-xs text-gray-500 font-mono">@{sub.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={`text-xs ${sub.role === "manager" ? "border-purple-300 text-purple-600" : "border-gray-300 text-gray-600"}`}>
                            {sub.role === "manager" ? "主管" : "司機"}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${sub.is_active ? "border-green-300 text-green-600" : "border-red-300 text-red-500"}`}>
                            {sub.is_active ? "啟用" : "停用"}
                          </Badge>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 pl-11">
                        {sub.shopee_driver_id && (
                          <span>蝦皮ID：<span className="font-mono text-orange-600">{sub.shopee_driver_id}</span></span>
                        )}
                        {sub.driver_name && (
                          <span>連結司機：{sub.driver_name}{sub.vehicle_plate ? ` (${sub.vehicle_plate})` : ""}</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 pl-11 flex-wrap">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                          onClick={() => { setEditingSub(sub); setSubForm({ display_name: sub.display_name, username: sub.username, password: "", shopee_driver_id: sub.shopee_driver_id ?? "", role: sub.role, fleet_driver_id: sub.fleet_driver_id ? String(sub.fleet_driver_id) : "" }); setShowSubForm(true); loadDrivers(); }}>
                          <Edit2 className="h-3 w-3 mr-1" />編輯
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                          onClick={() => { setResetPwId(sub.id); setResetPwVal(""); }}>
                          <Key className="h-3 w-3 mr-1" />重設密碼
                        </Button>
                        <Button size="sm" variant="outline" className={`h-6 text-xs px-2 ${sub.is_active ? "text-red-500 hover:text-red-600" : "text-green-600 hover:text-green-700"}`}
                          onClick={() => toggleSubActive(sub)}>
                          {sub.is_active ? "停用" : "啟用"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-400 hover:text-red-600"
                          onClick={() => deleteSub(sub)}>
                          <Trash2 className="h-3 w-3 mr-1" />刪除
                        </Button>
                      </div>

                      {/* Reset password inline form */}
                      {resetPwId === sub.id && (
                        <div className="pl-11 flex gap-2 items-center">
                          <input
                            type="password"
                            className="border rounded px-2 py-1 text-sm flex-1 max-w-[180px]"
                            placeholder="輸入新密碼（至少 4 字元）"
                            value={resetPwVal}
                            onChange={e => setResetPwVal(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && doResetPw(sub.id)}
                          />
                          <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => doResetPw(sub.id)}>確認</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setResetPwId(null); setResetPwVal(""); }}>取消</Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
