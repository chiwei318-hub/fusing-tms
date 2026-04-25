import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, CheckCircle2, Clock, FileText,
  Truck, AlertTriangle, DollarSign, ChevronDown, ChevronRight,
  Download, Tag, Package, MapPin, CheckSquare, Square,
  Users, Plus, Edit2, Save, X, ShieldCheck, ShieldOff, ExternalLink,
  LayoutDashboard, Upload,
} from "lucide-react";
import ControlTowerTab from "./fusingao/ControlTowerTab";
import DispatchTab from "./fusingao/DispatchTab";
import InvoiceTab from "./fusingao/InvoiceTab";
import ShopeeRatesTab from "./admin/ShopeeRatesTab";
import PenaltiesTab from "./admin/PenaltiesTab";
import RouteImportTab from "./admin/RouteImportTab";
import SheetSyncTab from "./admin/SheetSyncTab";
import PnLTab from "./admin/PnLTab";
import DriverEarningsTab from "./admin/DriverEarningsTab";
import ShopeeDriversTab from "./fusingao/ShopeeDriversTab";
import SettlementChainTab from "./fusingao/SettlementChainTab";
import FusingaoScheduleTab from "./fusingao/FusingaoScheduleTab";
import FusingaoBillingDetailTab from "./fusingao/FusingaoBillingDetailTab";
import FusingaoSheetSyncTab from "./fusingao/FusingaoSheetSyncTab";
import OrderManageTab from "./fusingao/OrderManageTab";
import ContractQuoteTab from "./fusingao/ContractQuoteTab";
import SupplierTab from "./fusingao/SupplierTab";
import VehicleTab from "./fusingao/VehicleTab";
import FuelTab from "./fusingao/FuelTab";
import DriverBonusTab from "./fusingao/DriverBonusTab";
import AutoDispatchTab from "./fusingao/AutoDispatchTab";
import TownshipTab from "./fusingao/TownshipTab";
import DriverDispatchStatsTab from "./fusingao/DriverDispatchStatsTab";
import NotificationConfirmTab from "./fusingao/NotificationConfirmTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  total_routes: string; completed: string; in_progress: string;
  billed: string; unbilled: string;
  this_month_routes: string; this_month_income: string;
  total_shopee_income: string;
}
interface RouteItem {
  id: number; status: string; notes: string;
  completed_at: string | null; driver_payment_status: string | null;
  created_at: string; required_vehicle_type: string;
  driver_name: string | null; vehicle_plate: string | null;
  shopee_rate: number | null; service_type: string | null; route_od: string | null;
  routeId: string; dock: string | null; driverId: string | null;
  stations: number; prefix: string | null; stopList: string[];
}
interface MonthRow {
  month: string; month_label: string; route_count: string; completed_count: string;
  billed_count: string; shopee_income: string; billed_amount: string;
  unbilled_amount: string; penalty_deduction: string; net_amount: number;
  routes: RouteItem[];
}

type PortalTab = "control" | "dispatch" | "invoice" | "notify" | "monthly" | "rates" | "fleets" | "settlement" | "penalties" | "routeimport" | "sheetsync" | "pnl" | "earnings" | "drivers" | "schedule" | "billingdetail" | "dbsync" | "ordermanage" | "contractquote" | "supplier" | "glory" | "vehicles" | "fuel" | "driverbonus" | "township" | "autodispatch" | "dispatchref" | "confirmations";

interface FleetRow {
  id: number; fleet_name: string; contact_name: string | null; contact_phone: string | null;
  username: string; vehicle_types: string | null; notes: string | null; is_active: boolean;
  created_at: string; total_routes: string; completed_routes: string; billed_routes: string;
  fleet_payout: string;
}
interface FleetDriver {
  id: number; name: string; phone: string | null; vehicle_plate: string | null;
  vehicle_type: string | null; is_active: boolean; total_routes: string; completed_routes: string;
}
interface FleetDetail {
  routes: RouteItem[]; drivers: FleetDriver[]; loading: boolean; tab: "routes" | "drivers";
}

const fmt = (n: number | string) => `NT$ ${Math.round(Number(n)).toLocaleString()}`;

const statusBadge = (r: RouteItem) => {
  if (r.status === "completed" || r.completed_at)
    return <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1 inline" />已完成</Badge>;
  if (r.status === "dispatched")
    return <Badge className="bg-blue-100 text-blue-700 text-xs"><Truck className="h-3 w-3 mr-1 inline" />派車中</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 text-xs"><Clock className="h-3 w-3 mr-1 inline" />待出發</Badge>;
};

const billingBadge = (s: string | null) => {
  if (s === "paid") return <Badge className="bg-emerald-100 text-emerald-700 text-xs">已對帳</Badge>;
  return <Badge variant="outline" className="text-xs text-gray-400">未對帳</Badge>;
};

const prefixColor: Record<string, string> = {
  FN: "bg-blue-100 text-blue-700", FM: "bg-violet-100 text-violet-700",
  A3: "bg-cyan-100 text-cyan-700", NB: "bg-orange-100 text-orange-700",
  WB: "bg-indigo-100 text-indigo-700", WD: "bg-pink-100 text-pink-700",
};

export default function FusingaoPortal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab]           = useState<PortalTab>("control");
  const [loading, setLoading]   = useState(false);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [routes, setRoutes]     = useState<RouteItem[]>([]);
  const [months, setMonths]     = useState<MonthRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth]   = useState("");
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // ── Fleet management state ─────────────────────────────────────────────────
  const [fleets, setFleets]             = useState<FleetRow[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [editingFleet, setEditingFleet]   = useState<FleetRow | null>(null);
  const [fleetForm, setFleetForm]         = useState({
    fleet_name: "", contact_name: "", contact_phone: "",
    username: "", password: "", vehicle_types: "", notes: "", rate_override: "",
    commission_rate: "15", bank_account: "", bank_name: "",
  });
  const [fleetDetails, setFleetDetails]   = useState<Record<number, FleetDetail>>({});
  const [resetPwFleet, setResetPwFleet]   = useState<number | null>(null);
  const [resetPwValue, setResetPwValue]   = useState("");
  const [addDriverFleet, setAddDriverFleet] = useState<number | null>(null);
  const [addDriverForm, setAddDriverForm]   = useState({ name: "", phone: "", vehicle_plate: "", vehicle_type: "一般" });
  const [importDriverFleet, setImportDriverFleet] = useState<number | null>(null);
  const [importDriverLoading, setImportDriverLoading] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterMonth) params.set("month", filterMonth);
      const [s, r, m] = await Promise.all([
        fetch(apiUrl("/fusingao/summary")).then(x => x.json()),
        fetch(apiUrl(`/fusingao/routes?${params}`)).then(x => x.json()),
        fetch(apiUrl("/fusingao/monthly")).then(x => x.json()),
      ]);
      if (s.ok) setSummary(s.summary);
      if (r.ok) setRoutes(r.routes);
      if (m.ok) setMonths(m.months);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [filterStatus, filterMonth]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const markComplete = async (id: number, completed: boolean) => {
    await fetch(apiUrl(`/fusingao/routes/${id}/complete`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    await load();
    toast({ title: completed ? "已標記完成" : "已取消完成" });
  };

  const markBilling = async (id: number, status: string) => {
    await fetch(apiUrl(`/fusingao/routes/${id}/billing`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    toast({ title: status === "paid" ? "已標記對帳" : "已取消對帳" });
  };

  const billAllMonth = async (month: string) => {
    await fetch(apiUrl(`/fusingao/monthly/${encodeURIComponent(month)}/bill-all`), { method: "PUT" });
    await load();
    toast({ title: `${month} 整月對帳完成` });
  };

  // ── Fleet management handlers ──────────────────────────────────────────────
  const loadFleets = useCallback(async () => {
    setFleetLoading(true);
    try {
      const d = await fetch(apiUrl("/fusingao/fleets")).then(x => x.json());
      if (d.ok) setFleets(d.fleets ?? []);
    } catch { toast({ title: "車隊載入失敗", variant: "destructive" }); }
    finally { setFleetLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { if (tab === "fleets") loadFleets(); }, [tab]); // eslint-disable-line

  const toggleFleetDetail = async (id: number) => {
    if (fleetDetails[id]) {
      setFleetDetails(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setFleetDetails(prev => ({ ...prev, [id]: { routes: [], drivers: [], loading: true, tab: "routes" } }));
    try {
      const [r, d] = await Promise.all([
        fetch(apiUrl(`/fusingao/fleets/${id}/routes`)).then(x => x.json()),
        fetch(apiUrl(`/fusingao/fleets/${id}/drivers`)).then(x => x.json()),
      ]);
      setFleetDetails(prev => ({
        ...prev,
        [id]: { routes: r.routes ?? [], drivers: d.drivers ?? [], loading: false, tab: "routes" },
      }));
    } catch {
      toast({ title: "載入車隊詳情失敗", variant: "destructive" });
      setFleetDetails(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const setFleetDetailTab = (id: number, t: "routes" | "drivers") =>
    setFleetDetails(prev => ({ ...prev, [id]: { ...prev[id], tab: t } }));

  const enterFleetManagement = async (id: number) => {
    try {
      const r = await fetch(apiUrl(`/fusingao/fleets/${id}/admin-access-token`), { method: "POST" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ token: d.token, user: d.user }))));
      window.location.href = `/fleet/auto-login?t=${payload}`;
    } catch {
      toast({ title: "無法取得車隊存取憑證", variant: "destructive" });
    }
  };

  const doAddDriver = async (fleetId: number) => {
    if (!addDriverForm.name.trim()) return toast({ title: "請填寫司機姓名", variant: "destructive" });
    try {
      const r = await fetch(apiUrl(`/fusingao/fleets/${fleetId}/drivers`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addDriverForm }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: `✅ 已新增司機：${addDriverForm.name}` });
      setAddDriverForm({ name: "", phone: "", vehicle_plate: "", vehicle_type: "一般" });
      setAddDriverFleet(null);
      // Refresh driver list
      const dr = await fetch(apiUrl(`/fusingao/fleets/${fleetId}/drivers`)).then(x => x.json());
      setFleetDetails(prev => ({ ...prev, [fleetId]: { ...prev[fleetId], drivers: dr.drivers ?? [] } }));
    } catch (err: any) {
      toast({ title: `新增失敗：${err.message}`, variant: "destructive" });
    }
  };

  const doDeleteDriver = async (fleetId: number, driverId: number, driverName: string) => {
    if (!window.confirm(`確定要移除司機「${driverName}」？`)) return;
    try {
      await fetch(apiUrl(`/fusingao/fleets/${fleetId}/drivers/${driverId}`), { method: "DELETE" });
      toast({ title: `已移除 ${driverName}` });
      setFleetDetails(prev => ({
        ...prev,
        [fleetId]: { ...prev[fleetId], drivers: prev[fleetId].drivers.filter(d => d.id !== driverId) },
      }));
    } catch {
      toast({ title: "移除失敗", variant: "destructive" });
    }
  };

  const doImportDriverFile = async (fleetId: number, file: File) => {
    setImportDriverLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(apiUrl(`/fusingao/fleets/${fleetId}/import-file`), {
        method: "POST",
        body: fd,
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: `已匯入 ${d.inserted} 位司機${d.skipped > 0 ? `（跳過重複 ${d.skipped} 位）` : ""}` });
      setFleetDetails(prev => ({
        ...prev,
        [fleetId]: { ...prev[fleetId], drivers: d.drivers ?? [] },
      }));
    } catch (err: any) {
      toast({ title: `匯入失敗：${err.message}`, variant: "destructive" });
    } finally {
      setImportDriverLoading(false);
      setImportDriverFleet(null);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const doResetPassword = async (id: number, name: string) => {
    if (!resetPwValue.trim()) return toast({ title: "請輸入新密碼", variant: "destructive" });
    if (resetPwValue.length < 4) return toast({ title: "密碼至少 4 個字元", variant: "destructive" });
    try {
      const fleet = fleets.find(f => f.id === id)!;
      await fetch(apiUrl(`/fusingao/fleets/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleet_name: fleet.fleet_name,
          contact_name: fleet.contact_name,
          contact_phone: fleet.contact_phone,
          vehicle_types: fleet.vehicle_types,
          notes: fleet.notes,
          is_active: fleet.is_active,
          password: resetPwValue,
        }),
      });
      toast({ title: `✅ ${name} 密碼已重設` });
      setResetPwFleet(null);
      setResetPwValue("");
    } catch {
      toast({ title: "重設失敗", variant: "destructive" });
    }
  };

  const openNewFleet = () => {
    setEditingFleet(null);
    setFleetForm({ fleet_name:"", contact_name:"", contact_phone:"", username:"", password:"", vehicle_types:"", notes:"", rate_override:"", commission_rate:"15", bank_account:"", bank_name:"" });
    setShowFleetForm(true);
  };

  const openEditFleet = (f: FleetRow) => {
    setEditingFleet(f);
    setFleetForm({ fleet_name:f.fleet_name, contact_name:f.contact_name??"", contact_phone:f.contact_phone??"", username:f.username, password:"", vehicle_types:f.vehicle_types??"", notes:f.notes??"", rate_override:String((f as any).rate_override??""), commission_rate:String((f as any).commission_rate??15), bank_account:(f as any).bank_account??"", bank_name:(f as any).bank_name??"" });
    setShowFleetForm(true);
  };

  const saveFleet = async () => {
    if (!fleetForm.fleet_name || !fleetForm.username) return toast({ title: "請填寫車隊名稱與帳號", variant: "destructive" });
    if (!editingFleet && !fleetForm.password) return toast({ title: "請設定初始密碼", variant: "destructive" });
    const body = { ...fleetForm, rate_override: fleetForm.rate_override ? Number(fleetForm.rate_override) : undefined };
    const url  = editingFleet ? apiUrl(`/fusingao/fleets/${editingFleet.id}`) : apiUrl("/fusingao/fleets");
    const method = editingFleet ? "PUT" : "POST";
    const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(x => x.json());
    if (!d.ok) return toast({ title: d.error ?? "儲存失敗", variant: "destructive" });
    toast({ title: editingFleet ? "車隊更新成功" : "新增車隊成功" });
    setShowFleetForm(false);
    loadFleets();
  };

  const toggleFleetActive = async (f: FleetRow) => {
    await fetch(apiUrl(`/fusingao/fleets/${f.id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, is_active: !f.is_active }),
    });
    loadFleets();
  };

  const [exporting, setExporting] = useState<string | null>(null);

  const exportMonthCSV = async (m: MonthRow) => {
    setExporting(m.month);
    try {
      const pkg = await fetch(apiUrl(`/fusingao/accounting-package?month=${m.month}`)).then(r => r.json());
      if (!pkg.ok) throw new Error(pkg.error ?? "匯出失敗");

      const {
        routes: pkgRoutes = [],
        billing_trips = [],
        fleet_summary = [],
        penalties = [],
        tax_info,
        month,
      } = pkg;

      const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const n = (v: unknown) => v != null ? String(v) : "";

      const sections: string[][] = [];

      sections.push(
        [`=== 福興高 ${month} 月度帳務明細 ===`],
        [],
        ["【路線列表】"],
        ["路線編號", "前綴", "服務模式", "站點數", "蝦皮費率", "完成狀態", "對帳狀態", "完成日期"],
        ...pkgRoutes.map((r: RouteItem) => [
          q(r.routeId), q(r.prefix), q(r.service_type), n(r.stations),
          n(r.shopee_rate),
          r.status === "completed" || r.completed_at ? "已完成" : "進行中",
          r.driver_payment_status === "paid" ? "已對帳" : "未對帳",
          r.completed_at ? new Date(r.completed_at).toLocaleDateString("zh-TW") : "",
        ]),
        [],
      );

      if (billing_trips.length > 0) {
        sections.push(
          ["【帳務趟次明細（Google Sheets 同步）】"],
          ["趟次日期", "路線編號", "金額", "帳務類型"],
          ...billing_trips.map((t: { trip_date: string; route_no: string; amount: number; billing_type: string }) => [
            q(t.trip_date), q(t.route_no), n(t.amount), q(t.billing_type),
          ]),
          [],
        );
      }

      if (fleet_summary.length > 0) {
        sections.push(
          ["【車隊彙總】"],
          ["車隊", "趟次", "金額 (NT$)"],
          ...fleet_summary.map((f: { fleet_name: string; trip_count: number; total_amount: number }) => [
            q(f.fleet_name), n(f.trip_count), n(Math.round(f.total_amount)),
          ]),
          [],
        );
      }

      if (penalties.length > 0) {
        sections.push(
          ["【罰款扣款】"],
          ["路線", "金額", "說明"],
          ...penalties.map((p: { route_id: string; amount: number; reason: string }) => [
            q(p.route_id), n(p.amount), q(p.reason),
          ]),
          [],
        );
      }

      if (tax_info) {
        sections.push(
          ["【稅務試算（台灣 VAT 5% 內含）】"],
          ["含稅總收入 (NT$)", "稅額 (NT$)", "未稅金額 (NT$)", "申報月份"],
          [
            n(Math.round(tax_info.total_with_tax)),
            n(Math.round(tax_info.sales_tax)),
            n(Math.round(tax_info.net_before_tax)),
            q(tax_info.filing_period),
          ],
          [],
        );
      }

      const csvLines = sections.map(row => row.join(","));
      const blob = new Blob(["\uFEFF" + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `福興高帳務包_${m.month}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "✅ 帳務包匯出完成", description: `${m.month} 完整帳務已下載` });
    } catch (e: unknown) {
      toast({ title: "匯出失敗", description: e instanceof Error ? e.message : "未知錯誤", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  // ── Available month options (from data)
  const monthOptions = months.map(m => ({ value: m.month, label: m.month_label }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 shadow">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="text-white hover:bg-orange-700 h-8 px-2"
                onClick={() => setLocation("/admin")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> 返回後台
              </Button>
              <div>
                <h1 className="text-white font-bold text-xl leading-tight">福興高 Shopee 專屬窗口</h1>
                <p className="text-orange-100 text-xs">富詠運輸 × 蝦皮物流合作夥伴</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8 bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />重新整理
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {/* ── KPI Summary ─────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Package className="h-5 w-5 text-orange-500"/>, label:"本月路線", val: summary.this_month_routes + " 趟", sub:"總計 "+summary.total_routes+" 趟", targetTab:"dispatch" as PortalTab },
              { icon: <CheckCircle2 className="h-5 w-5 text-green-500"/>, label:"已完成", val: summary.completed + " 趟", sub: summary.in_progress + " 趟進行中", targetTab:"notify" as PortalTab },
              { icon: <FileText className="h-5 w-5 text-blue-500"/>, label:"已對帳", val: summary.billed + " 趟", sub: summary.unbilled + " 趟待對帳", targetTab:"monthly" as PortalTab },
              { icon: <DollarSign className="h-5 w-5 text-emerald-500"/>, label:"本月金額", val: fmt(summary.this_month_income), sub: "全期 "+fmt(summary.total_shopee_income), targetTab:"settlement" as PortalTab },
            ].map(k => (
              <Card key={k.label}
                className="cursor-pointer hover:shadow-md hover:border-orange-300 transition-all"
                onClick={() => setTab(k.targetTab)}>
                <CardContent className="p-4">
                  {k.icon}
                  <p className="text-xs text-gray-500 mt-2">{k.label}</p>
                  <p className="text-xl font-bold text-gray-800">{k.val}</p>
                  <p className="text-xs text-gray-400">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Tab nav ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-t-lg border-b px-3 pt-2">
          {/* Group 1: 派車營運 */}
          <div className="flex flex-wrap gap-x-0.5 gap-y-0">
            {([
              { id:"control",     label:"🗼 控制中心",    group:1 },
              { id:"ordermanage", label:"📦 訂單維護",    group:1 },
              { id:"dispatch",    label:"📅 派車管理",    group:1 },
              { id:"invoice",     label:"🧾 請款單",      group:1 },
              { id:"notify",      label:"🔔 完成通知",    group:1 },
              { id:"monthly",     label:"📋 月度對帳",    group:1 },
              { id:"fleets",      label:"🚚 車隊管理",    group:1 },
              { id:"drivers",      label:"👤 司機管理",    group:1 },
              { id:"dispatchref",    label:"📊 派遣參考",    group:1 },
              { id:"confirmations",  label:"✅ 接單確認",    group:1 },
            ] as { id: PortalTab; label: string; group: number }[]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  t.id===tab ? "border-orange-500 text-orange-600 bg-orange-50/50" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}>
                {t.label}
              </button>
            ))}
            <div className="border-r border-gray-200 mx-1 my-1" />
            {([
              { id:"settlement",  label:"📊 結算總覽",    group:2 },
              { id:"rates",       label:"🏷️ Shopee費率",  group:2 },
              { id:"penalties",   label:"⚠️ Shopee罰款",  group:2 },
              { id:"earnings",    label:"💰 運費試算",    group:2 },
              { id:"pnl",         label:"📈 盈虧分析",    group:2 },
              { id:"routeimport",   label:"📤 路線匯入",    group:2 },
              { id:"sheetsync",     label:"🔄 試算表同步",  group:2 },
              { id:"schedule",      label:"🗺️ 班表地址",    group:2 },
              { id:"billingdetail", label:"💹 對帳明細",    group:2 },
              { id:"dbsync",        label:"💾 DB同步設定",  group:2 },
              { id:"autodispatch",  label:"🚀 自動派車",    group:2 },
            ] as { id: PortalTab; label: string; group: number }[]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  t.id===tab ? "border-blue-500 text-blue-600 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}>
                {t.label}
              </button>
            ))}
            <div className="border-r border-gray-200 mx-1 my-1" />
            <button onClick={() => setLocation("/cash-settlement")}
              className="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent transition-colors whitespace-nowrap text-purple-600 hover:text-purple-700 hover:bg-purple-50">
              💵 現金結算
            </button>
            <button onClick={() => setLocation("/four-layer-summary")}
              className="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent transition-colors whitespace-nowrap text-purple-600 hover:text-purple-700 hover:bg-purple-50">
              📊 四層總覽
            </button>
          </div>
        </div>

        {/* ═══════════════ 調度控制中心 ══════════════════════════════════════ */}
        {tab === "control" && <ControlTowerTab />}

        {/* ═══════════════ 訂單維護查詢 ════════════════════════════════════ */}
        {tab === "ordermanage" && <OrderManageTab />}

        {/* ═══════════════ 派車管理 ════════════════════════════════════════ */}
        {tab === "dispatch" && (
          <DispatchTab
            onViewSchedule={(routeId) => {
              setTab("schedule");
              sessionStorage.setItem("schedule_search", routeId);
            }}
          />
        )}

        {/* ═══════════════ 請款單 ══════════════════════════════════════════ */}
        {tab === "invoice" && <InvoiceTab />}

        {/* ═══════════════ 車趟完成通知 ═══════════════════════════════════ */}
        {tab === "notify" && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={filterStatus} onValueChange={v => setFilterStatus(v)}>
                <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="in_progress">進行中</SelectItem>
                  <SelectItem value="unbilled">未對帳</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMonth || "all"} onValueChange={v => setFilterMonth(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="選擇月份" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部月份</SelectItem>
                  {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-gray-400 ml-1">{routes.length} 筆</span>
            </div>

            {/* Route cards */}
            {routes.map(r => {
              const isOpen = expandedRoute === r.id;
              const isDone = r.status === "completed" || !!r.completed_at;
              return (
                <Card key={r.id} className={`overflow-hidden transition-shadow ${isDone ? "border-green-200" : ""}`}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRoute(isOpen ? null : r.id)}>
                    {/* Complete toggle */}
                    <button className="shrink-0" onClick={e => { e.stopPropagation(); markComplete(r.id, !isDone); }}>
                      {isDone
                        ? <CheckSquare className="h-5 w-5 text-green-500" />
                        : <Square className="h-5 w-5 text-gray-300" />}
                    </button>

                    {/* Route info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-gray-800">{r.routeId}</span>
                        {r.prefix && <Badge className={`text-xs ${prefixColor[r.prefix] ?? "bg-gray-100 text-gray-600"}`}>{r.prefix}</Badge>}
                        {r.service_type && <span className="text-xs text-gray-500">{r.service_type}</span>}
                        {statusBadge(r)}
                        {billingBadge(r.driver_payment_status)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-2">
                        <span><MapPin className="h-3 w-3 inline mr-0.5" />{r.stations} 站</span>
                        {r.dock && r.dock !== "—" && <span>碼頭 {r.dock}</span>}
                        <span><Truck className="h-3 w-3 inline mr-0.5" />
                          {r.driver_name ?? (r.driverId && r.driverId !== "—" ? `工號${r.driverId}` : "未指派")}
                          {r.vehicle_plate && ` ・ ${r.vehicle_plate}`}
                        </span>
                        <span>{new Date(r.created_at).toLocaleDateString("zh-TW")} 派車</span>
                        {r.completed_at && <span className="text-green-600">完成 {new Date(r.completed_at).toLocaleString("zh-TW")}</span>}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-orange-600 text-sm">{r.shopee_rate ? fmt(r.shopee_rate) : "—"}</p>
                      <div className="flex items-center gap-1 mt-1 justify-end">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400"/> : <ChevronRight className="h-3.5 w-3.5 text-gray-400"/>}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: stop list + billing button */}
                  {isOpen && (
                    <div className="border-t bg-gray-50 px-4 pb-3 pt-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-600">配送站點（{r.stations} 站）</p>
                        <div className="flex gap-2">
                          {!isDone && (
                            <Button size="sm" className="h-6 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => markComplete(r.id, true)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />標記完成
                            </Button>
                          )}
                          {r.driver_payment_status !== "paid" ? (
                            <Button size="sm" variant="outline" className="h-6 text-xs"
                              onClick={() => markBilling(r.id, "paid")}>
                              <FileText className="h-3 w-3 mr-1" />確認對帳
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-400"
                              onClick={() => markBilling(r.id, "unpaid")}>取消對帳</Button>
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
            })}
            {routes.length === 0 && <div className="text-center py-12 text-gray-400">無符合條件的路線</div>}
          </div>
        )}

        {/* ═══════════════ 月度對帳 ═══════════════════════════════════════ */}
        {tab === "monthly" && (
          <div className="space-y-3">
            {months.map(m => {
              const isOpen = expandedMonth === m.month;
              const pct = Number(m.shopee_income) > 0
                ? Math.round(Number(m.billed_amount) / Number(m.shopee_income) * 100)
                : 0;
              return (
                <Card key={m.month} className="overflow-hidden">
                  {/* Month header */}
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedMonth(isOpen ? null : m.month)}>
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400"/> : <ChevronRight className="h-4 w-4 text-gray-400"/>}
                      <div>
                        <h3 className="font-bold text-gray-800">{m.month_label}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {m.route_count} 趟 ・完成 {m.completed_count}/{m.route_count} ・對帳 {m.billed_count}/{m.route_count}
                          {Number(m.penalty_deduction) > 0 && <span className="text-red-500 ml-2">罰款 {fmt(m.penalty_deduction)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-orange-600">{fmt(m.net_amount)}</p>
                      <div className="flex items-center gap-2 justify-end mt-1">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct}% 對帳</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded month detail */}
                  {isOpen && (
                    <div className="border-t">
                      {/* Summary row */}
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-0 border-b bg-orange-50 text-center">
                        {[
                          { label:"蝦皮應收",  val: fmt(m.shopee_income), cls:"text-blue-700" },
                          { label:"已對帳",    val: fmt(m.billed_amount),  cls:"text-emerald-700" },
                          { label:"未對帳",    val: fmt(m.unbilled_amount), cls:"text-amber-700" },
                          { label:"罰款扣除",  val: Number(m.penalty_deduction) > 0 ? fmt(m.penalty_deduction) : "—", cls:"text-red-500" },
                          { label:"淨應收",    val: fmt(m.net_amount), cls:"text-orange-600 font-bold" },
                        ].map(k => (
                          <div key={k.label} className="py-2 px-1 border-r last:border-0">
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
                              <th className="text-left p-2 hidden sm:table-cell">服務</th>
                              <th className="text-right p-2">站點</th>
                              <th className="text-left p-2 hidden md:table-cell">司機</th>
                              <th className="text-right p-2">金額</th>
                              <th className="text-center p-2">完成</th>
                              <th className="text-center p-2">對帳</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.routes.map(r => (
                              <tr key={r.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-mono text-gray-800">{r.routeId}
                                  {r.prefix && <Badge className={`ml-1 text-xs ${prefixColor[r.prefix] ?? "bg-gray-100"}`}>{r.prefix}</Badge>}
                                </td>
                                <td className="p-2 text-gray-500 hidden sm:table-cell">{r.service_type ?? "—"}</td>
                                <td className="p-2 text-right">{r.stations}</td>
                                <td className="p-2 hidden md:table-cell text-gray-500">
                                  {r.driver_name ?? (r.driverId && r.driverId !== "—" ? `工號${r.driverId}` : "—")}
                                  {r.vehicle_plate && <span className="ml-1 text-gray-400">{r.vehicle_plate}</span>}
                                </td>
                                <td className="p-2 text-right font-mono text-orange-700">{r.shopee_rate ? fmt(r.shopee_rate) : "—"}</td>
                                <td className="p-2 text-center">
                                  <button onClick={() => markComplete(r.id, !(r.status==="completed"||!!r.completed_at))}>
                                    {r.status==="completed"||r.completed_at
                                      ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto"/>
                                      : <Clock className="h-4 w-4 text-gray-300 mx-auto"/>}
                                  </button>
                                </td>
                                <td className="p-2 text-center">
                                  <button onClick={() => markBilling(r.id, r.driver_payment_status==="paid" ? "unpaid" : "paid")}>
                                    {r.driver_payment_status==="paid"
                                      ? <CheckSquare className="h-4 w-4 text-emerald-500 mx-auto"/>
                                      : <Square className="h-4 w-4 text-gray-300 mx-auto"/>}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Month actions */}
                      <div className="flex gap-2 p-3 border-t bg-gray-50 flex-wrap">
                        {Number(m.billed_count) < Number(m.route_count) && (
                          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => billAllMonth(m.month)}>
                            <CheckSquare className="h-3.5 w-3.5 mr-1" />整月全部確認對帳
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => exportMonthCSV(m)}
                          disabled={exporting === m.month}>
                          {exporting === m.month
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Download className="h-3.5 w-3.5" />}
                          {exporting === m.month ? "匯出中…" : "匯出完整帳務包"}
                        </Button>
                        <span className="text-xs text-gray-400 self-center ml-auto">
                          {m.route_count} 趟 ・ 應收 {fmt(m.shopee_income)}
                          {Number(m.penalty_deduction) > 0 && <> ・ 罰款 −{fmt(m.penalty_deduction)}</>}
                          {" "}= <strong className="text-orange-600">{fmt(m.net_amount)}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
            {months.length === 0 && <div className="text-center py-12 text-gray-400">尚無對帳資料</div>}
          </div>
        )}

        {/* ═══════════════ 合作車隊管理 ════════════════════════════════════════ */}
        {tab === "fleets" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">合作車隊帳號</h2>
                <p className="text-xs text-gray-400">管理各車隊登入帳號、費率及查看歷史路線</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadFleets} disabled={fleetLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${fleetLoading ? "animate-spin" : ""}`} />刷新
                </Button>
                <Button size="sm" className="h-8 text-xs bg-orange-600 hover:bg-orange-700" onClick={openNewFleet}>
                  <Plus className="h-3.5 w-3.5 mr-1" />新增車隊
                </Button>
              </div>
            </div>

            {/* Fleet form modal */}
            {showFleetForm && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{editingFleet ? `編輯：${editingFleet.fleet_name}` : "新增合作車隊"}</CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowFleetForm(false)}><X className="h-4 w-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label:"車隊名稱 *", key:"fleet_name",    type:"text", placeholder:"例：台北物流車隊" },
                      { label:"帳號 *",     key:"username",      type:"text", placeholder:"login username" },
                      { label:"聯絡人",     key:"contact_name",  type:"text", placeholder:"負責人姓名" },
                      { label:"聯絡電話",   key:"contact_phone", type:"text", placeholder:"09xx-xxx-xxx" },
                      { label:"車輛類型",   key:"vehicle_types", type:"text", placeholder:"例：一般, 冷藏" },
                      { label:`密碼${editingFleet?" (留空保持不變)":""}`,  key:"password",     type:"password", placeholder:editingFleet?"不改請留空":"設定初始密碼" },
                      { label:"每趟費率覆蓋 (NT$)", key:"rate_override", type:"number", placeholder:"留空使用路線預設" },
                      { label:"平台抽佣率 (%)", key:"commission_rate", type:"number", placeholder:"預設 15" },
                      { label:"銀行名稱", key:"bank_name", type:"text", placeholder:"例：台灣銀行" },
                      { label:"匯款帳號", key:"bank_account", type:"text", placeholder:"帳戶號碼" },
                      { label:"備註",       key:"notes",         type:"text", placeholder:"內部備註" },
                    ].map(f => (
                      <div key={f.key} className={f.key === "notes" ? "col-span-2" : ""}>
                        <label className="text-xs font-medium text-gray-600">{f.label}</label>
                        <input
                          type={f.type}
                          placeholder={f.placeholder}
                          className="w-full h-8 px-2 border rounded text-sm bg-white mt-1"
                          value={(fleetForm as any)[f.key]}
                          onChange={e => setFleetForm(p => ({ ...p, [f.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowFleetForm(false)}>取消</Button>
                    <Button size="sm" className="h-8 text-xs bg-orange-600 hover:bg-orange-700" onClick={saveFleet}>
                      <Save className="h-3.5 w-3.5 mr-1" />{editingFleet ? "儲存變更" : "建立車隊"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fleet list */}
            {fleets.length === 0 && !fleetLoading ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚無合作車隊，點「新增車隊」開始建立
              </div>
            ) : (
              <div className="space-y-2">
                {fleets.map(f => (
                  <Card key={f.id} className={`overflow-hidden ${!f.is_active ? "opacity-60" : ""}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-800">{f.fleet_name}</span>
                            {f.is_active
                              ? <Badge className="bg-green-100 text-green-700 text-xs"><ShieldCheck className="h-3 w-3 mr-1 inline"/>啟用</Badge>
                              : <Badge className="bg-gray-100 text-gray-500 text-xs"><ShieldOff className="h-3 w-3 mr-1 inline"/>停用</Badge>}
                            {f.vehicle_types && <span className="text-xs text-gray-400">{f.vehicle_types}</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            帳號：<span className="font-mono font-medium text-gray-700">{f.username}</span>
                            {f.contact_name && <> ・ {f.contact_name}</>}
                            {f.contact_phone && <> ・ {f.contact_phone}</>}
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                            <span><Package className="h-3 w-3 inline mr-1 text-orange-400"/>路線 {f.total_routes} 趟</span>
                            <span><CheckCircle2 className="h-3 w-3 inline mr-1 text-green-500"/>完成 {f.completed_routes} 趟</span>
                            <span><DollarSign className="h-3 w-3 inline mr-1 text-blue-400"/>應付 {fmt(f.fleet_payout)}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                          <Button size="sm"
                            className="h-11 px-4 text-sm gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                            onClick={() => enterFleetManagement(f.id)}
                            title="以管理員身份進入車隊操作介面">
                            <LayoutDashboard className="h-4 w-4" />進入管理
                          </Button>
                          <Button variant="ghost" size="sm"
                            className={`h-7 px-2 text-xs gap-1 ${fleetDetails[f.id] ? "text-orange-600 bg-orange-50" : "text-gray-400 hover:text-orange-500"}`}
                            onClick={() => toggleFleetDetail(f.id)}>
                            {fleetDetails[f.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            詳情
                          </Button>
                          <Button variant="ghost" size="sm"
                            className={`h-7 px-2 text-xs gap-1 ${resetPwFleet === f.id ? "text-amber-600 bg-amber-50" : "text-gray-400 hover:text-amber-500"}`}
                            onClick={() => { setResetPwFleet(resetPwFleet === f.id ? null : f.id); setResetPwValue(""); }}>
                            🔑 密碼
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600"
                            onClick={() => openEditFleet(f)} title="編輯">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 p-1.5 text-xs text-gray-400 hover:text-orange-600"
                            onClick={() => toggleFleetActive(f)}>
                            {f.is_active ? "停用" : "啟用"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {/* ── Inline password reset ── */}
                    {resetPwFleet === f.id && (
                      <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 flex items-center gap-2">
                        <span className="text-xs text-amber-700 shrink-0">新密碼：</span>
                        <input
                          type="password"
                          value={resetPwValue}
                          onChange={e => setResetPwValue(e.target.value)}
                          placeholder="輸入新密碼（至少4字元）"
                          className="flex-1 h-7 px-2 border border-amber-200 rounded text-xs bg-white"
                          onKeyDown={e => e.key === "Enter" && doResetPassword(f.id, f.fleet_name)}
                          autoFocus
                        />
                        <Button size="sm" className="h-7 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                          onClick={() => doResetPassword(f.id, f.fleet_name)}>
                          確認重設
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400"
                          onClick={() => { setResetPwFleet(null); setResetPwValue(""); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {/* ── Fleet Detail Expansion ── */}
                    {fleetDetails[f.id] && (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                        {fleetDetails[f.id].loading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />載入中…
                          </div>
                        ) : (
                          <>
                            {/* Sub-tab switcher */}
                            <div className="flex gap-1 mb-3">
                              <button
                                onClick={() => setFleetDetailTab(f.id, "routes")}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${fleetDetails[f.id].tab === "routes" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-500 border-gray-200 hover:border-orange-300"}`}>
                                路線 ({fleetDetails[f.id].routes.length})
                              </button>
                              <button
                                onClick={() => setFleetDetailTab(f.id, "drivers")}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${fleetDetails[f.id].tab === "drivers" ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-500 border-gray-200 hover:border-orange-300"}`}>
                                司機 ({fleetDetails[f.id].drivers.length})
                              </button>
                            </div>

                            {/* Routes list */}
                            {fleetDetails[f.id].tab === "routes" && (
                              fleetDetails[f.id].routes.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">尚無路線資料</p>
                              ) : (
                                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                  {fleetDetails[f.id].routes.map(r => (
                                    <div key={r.id} className="flex items-center gap-2 bg-white rounded border border-gray-100 px-3 py-2 text-xs">
                                      {statusBadge(r)}
                                      <span className="font-mono text-gray-600">{r.routeId || `#${r.id}`}</span>
                                      {r.route_od && <span className="text-gray-500 truncate max-w-[140px]">{r.route_od}</span>}
                                      {r.driver_name && <span className="text-blue-500">👤 {r.driver_name}</span>}
                                      {r.shopee_rate != null && <span className="ml-auto text-emerald-600 font-medium shrink-0">NT$ {r.shopee_rate.toLocaleString()}</span>}
                                    </div>
                                  ))}
                                </div>
                              )
                            )}

                            {/* Drivers list */}
                            {fleetDetails[f.id].tab === "drivers" && (
                              <div>
                                {/* Hidden global file input */}
                                <input
                                  ref={importFileRef}
                                  type="file"
                                  accept=".csv,.xlsx,.xls"
                                  className="hidden"
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file && importDriverFleet != null) doImportDriverFile(importDriverFleet, file);
                                  }}
                                />
                                {/* Add / Import driver buttons */}
                                {addDriverFleet !== f.id && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <button
                                      onClick={() => { setAddDriverFleet(f.id); setAddDriverForm({ name: "", phone: "", vehicle_plate: "", vehicle_type: "一般" }); }}
                                      className="flex items-center gap-1.5 text-sm px-4 h-11 rounded border border-dashed border-orange-300 text-orange-500 hover:bg-orange-50 transition-colors">
                                      <Plus className="h-4 w-4" />新增司機
                                    </button>
                                    <button
                                      disabled={importDriverLoading}
                                      onClick={() => { setImportDriverFleet(f.id); importFileRef.current?.click(); }}
                                      className="flex items-center gap-1.5 text-sm px-4 h-11 rounded border border-dashed border-blue-300 text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50">
                                      {importDriverLoading && importDriverFleet === f.id
                                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                                        : <Upload className="h-4 w-4" />}
                                      匯入司機
                                    </button>
                                  </div>
                                )}
                                {/* Inline add form */}
                                {addDriverFleet === f.id && (
                                  <div className="mb-3 p-3 bg-white rounded border border-orange-200 space-y-2">
                                    <p className="text-xs font-medium text-orange-700">新增司機</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {[
                                        { key: "name", placeholder: "姓名 *" },
                                        { key: "phone", placeholder: "電話" },
                                        { key: "vehicle_plate", placeholder: "車牌號碼" },
                                      ].map(field => (
                                        <input key={field.key} type="text" placeholder={field.placeholder}
                                          value={(addDriverForm as any)[field.key]}
                                          onChange={e => setAddDriverForm(p => ({ ...p, [field.key]: e.target.value }))}
                                          className="h-7 px-2 border border-gray-200 rounded text-xs" />
                                      ))}
                                      <select value={addDriverForm.vehicle_type}
                                        onChange={e => setAddDriverForm(p => ({ ...p, vehicle_type: e.target.value }))}
                                        className="h-7 px-2 border border-gray-200 rounded text-xs bg-white">
                                        {["一般","小發財","1.75噸","3.5噸","8.5噸","冷藏","冷凍"].map(t => <option key={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button size="sm" className="h-7 px-3 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                                        onClick={() => doAddDriver(f.id)}>確認新增</Button>
                                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                        onClick={() => setAddDriverFleet(null)}>取消</Button>
                                    </div>
                                  </div>
                                )}
                                {fleetDetails[f.id].drivers.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-2">尚無司機，點上方按鈕新增</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                    {fleetDetails[f.id].drivers.map(d => (
                                      <div key={d.id} className="flex items-center gap-3 bg-white rounded border border-gray-100 px-3 py-2 text-xs group">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.is_active ? "bg-green-400" : "bg-gray-300"}`} />
                                        <span className="font-medium text-gray-700">{d.name}</span>
                                        {d.vehicle_plate && <span className="font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{d.vehicle_plate}</span>}
                                        {d.vehicle_type && <span className="text-gray-400">{d.vehicle_type}</span>}
                                        {d.phone && <span className="text-gray-400">{d.phone}</span>}
                                        <span className="ml-auto text-gray-400 shrink-0">完成 {d.completed_routes}/{d.total_routes}</span>
                                        <button
                                          onClick={() => doDeleteDriver(f.id, d.id, d.name)}
                                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity ml-1"
                                          title="移除司機">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-600 flex gap-2">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              <span>車隊帳號建立後，合作夥伴可從 <strong>/login/fleet</strong> 登入，搶取可用路線並回報完成狀態。</span>
            </div>
          </div>
        )}

        {/* ═══════════════ 結算總覽 ═══════════════════════════════════════════ */}
        {tab === "settlement" && <SettlementChainTab months={months} />}
        {/* ═══════════════ Shopee費率 ════════════════════════════════════════ */}
        {tab === "rates" && <ShopeeRatesTab />}

        {/* ═══════════════ Shopee罰款 ════════════════════════════════════════ */}
        {tab === "penalties" && <PenaltiesTab />}

        {/* ═══════════════ 運費試算 ══════════════════════════════════════════ */}
        {tab === "earnings" && <DriverEarningsTab />}

        {/* ═══════════════ 盈虧分析 ══════════════════════════════════════════ */}
        {tab === "pnl" && <PnLTab />}

        {/* ═══════════════ 路線匯入 ══════════════════════════════════════════ */}
        {tab === "routeimport" && <RouteImportTab />}

        {/* ═══════════════ 試算表同步 ═══════════════════════════════════════ */}
        {tab === "sheetsync" && <SheetSyncTab />}
        {tab === "drivers" && <ShopeeDriversTab />}
        {tab === "dispatchref"   && <DriverDispatchStatsTab />}
        {tab === "confirmations" && <NotificationConfirmTab />}

        {/* ═══════════════ 班表地址 ═══════════════════════════════════════════ */}
        {tab === "schedule" && <FusingaoScheduleTab />}

        {/* ═══════════════ 對帳明細 ════════════════════════════════════════════ */}
        {tab === "billingdetail" && <FusingaoBillingDetailTab />}

        {/* ═══════════════ DB同步設定 ══════════════════════════════════════════ */}
        {tab === "dbsync" && <FusingaoSheetSyncTab />}

        {/* ═══════════════ 自動派車 ═════════════════════════════════════════════ */}
        {tab === "autodispatch" && (
          <div className="p-4">
            <AutoDispatchTab />
          </div>
        )}

        {/* ═══════════════ 合約報價維護 ════════════════════════════════════════ */}
        {tab === "contractquote" && (
          <div className="p-4">
            <ContractQuoteTab />
          </div>
        )}

        {/* ═══════════════ 供應商管理 ══════════════════════════════════════════ */}
        {tab === "supplier" && (
          <div className="p-4">
            <SupplierTab />
          </div>
        )}

        {/* ═══════════════ 車輛管理 ════════════════════════════════════════ */}
        {tab === "vehicles" && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">🚛 車輛基本資料管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">車輛資料、稅務、保險、eTag 維護查詢</p>
            </div>
            <VehicleTab />
          </div>
        )}

        {/* ═══════════════ 油料管理 ════════════════════════════════════════ */}
        {tab === "fuel" && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">⛽ 油料管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">加油記錄、油料比較報表、油耗統計分析</p>
            </div>
            <FuelTab />
          </div>
        )}

        {/* ═══════════════ 司機獎金 ════════════════════════════════════════ */}
        {tab === "driverbonus" && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">💰 司機獎金管理</h2>
              <p className="text-xs text-muted-foreground mt-0.5">司機獎金明細查詢與管理</p>
            </div>
            <DriverBonusTab />
          </div>
        )}

        {/* ═══════════════ 鄉鎮市區 ════════════════════════════════════════ */}
        {tab === "township" && (
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">🗺️ 鄉鎮市區資料</h2>
              <p className="text-xs text-muted-foreground mt-0.5">台灣行政區域資料維護（已預載全台資料）</p>
            </div>
            <TownshipTab />
          </div>
        )}
      </div>
    </div>
  );
}
