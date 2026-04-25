import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Truck, LogOut, RefreshCw, CheckCircle2, Clock, Package,
  DollarSign, ChevronDown, ChevronRight, Zap, Download,
  CheckSquare, Square, AlertCircle, UserPlus, User, Edit2, Save, X,
  TrendingUp, ArrowRight, ClipboardList, Send, Bell, Shield, Key, Trash2, UserCheck, Eye, EyeOff,
  Link, Copy, Check, Fuel, Settings2, Printer, FileText,
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
  monthly_routes: string; monthly_completed: string; monthly_salary_estimate: string;
  atoms_account: string | null; employee_id: string | null;
  base_salary?: number; per_trip_bonus?: number; meal_allowance?: number; other_deduction?: number;
}
interface SettlementSummary {
  shopee_income: string; fleet_receive: string; commission_rate: string; trip_count?: string;
}
interface FuelBreakdownItem { vehicle_plate: string; total: string; }
interface DriverSalaryItem {
  id: number; name: string; employee_id: string | null;
  base_salary: string; per_trip_bonus: string; meal_allowance: string; other_deduction: string;
  completed_trips: number; total_salary: string;
}
interface PenaltyItem { id: number; reason: string; amount: string; order_no: string | null; }
interface DriverSettlement {
  driver_name: string; vehicle_plate: string | null;
  route_count: string; completed_count: string; earnings: string;
}
interface DriverSuggestion { shopee_driver_id: string; vehicle_type: string; route_count: number; }
interface MainDriver {
  id: number; name: string; phone: string|null; license_plate: string|null;
  vehicle_type: string; employee_id: string|null; driver_type: string; status: string;
  already_imported: boolean;
}
interface PayrollRecord {
  id: number; driver_id: number; driver_name: string; employee_id: string | null;
  month: string; completed_trips: number; base_salary: number; per_trip_bonus: number;
  meal_allowance: number; other_deduction: number; net_salary: number; locked: boolean; note: string | null;
}
interface SchedWeek { week_label: string; route_count: number; total_stops: number; imported_at: string; }
interface SchedRoute {
  id: number; route_no: string; route_type: string; vehicle_type: string;
  shopee_driver_id: string; departure_time: string; dock_no: string; stop_count: number;
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

type PortalTab = "available" | "mine" | "billing" | "drivers" | "settlement" | "dispatch" | "sub-accounts" | "schedule";

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

  // ── Grab-with-driver modal state ──────────────────────────────────────────
  const [grabModalRoute, setGrabModalRoute] = useState<RouteItem | null>(null);
  const [grabDriverId, setGrabDriverId]     = useState<string>("none");
  const [grabVehicle, setGrabVehicle]       = useState("");

  // ── Quick add driver state (from home) ───────────────────────────────────
  const [quickDriverForm, setQuickDriverForm] = useState(false);

  // ── Import drivers from schedule ─────────────────────────────────────────
  const [importModal, setImportModal]           = useState(false);
  const [importSuggestions, setImportSuggestions] = useState<DriverSuggestion[]>([]);
  const [importSelected, setImportSelected]     = useState<Set<string>>(new Set());
  const [importNames, setImportNames]           = useState<Record<string, string>>({});
  const [importLoading, setImportLoading]       = useState(false);
  const [importMsg, setImportMsg]               = useState("");

  const openImportModal = useCallback(async () => {
    if (!fleetId) return;
    setImportLoading(true); setImportModal(true); setImportMsg(""); setImportSelected(new Set()); setImportNames({});
    try {
      const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/schedule-driver-suggestions`)).then(x => x.json());
      if (d.ok) setImportSuggestions(d.suggestions ?? []);
    } finally { setImportLoading(false); }
  }, [fleetId]); // eslint-disable-line

  const doImportDrivers = useCallback(async () => {
    if (!fleetId || importSelected.size === 0) return;
    setImportLoading(true);
    const payload = Array.from(importSelected).map(sid => ({
      shopee_driver_id: sid,
      name: importNames[sid]?.trim() || sid,
      vehicle_type: importSuggestions.find(s => s.shopee_driver_id === sid)?.vehicle_type || "一般",
    }));
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/import-schedule-drivers`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drivers: payload }),
    }).then(x => x.json());
    setImportLoading(false);
    if (d.ok) {
      setImportMsg(`✅ 成功匯入 ${d.inserted} 位司機`);
      loadDrivers();
      setTimeout(() => { setImportModal(false); setImportMsg(""); }, 1500);
    } else {
      setImportMsg(`❌ ${d.error}`);
    }
  }, [fleetId, importSelected, importNames, importSuggestions]); // eslint-disable-line

  // ── Import drivers from main driver list ─────────────────────────────────
  const [mainImportModal, setMainImportModal]       = useState(false);
  const [mainImportTab, setMainImportTab]           = useState<"main"|"shopee">("main");
  const [mainDrivers, setMainDrivers]               = useState<MainDriver[]>([]);
  const [mainImportQ, setMainImportQ]               = useState("");
  const [mainImportSelected, setMainImportSelected] = useState<Set<number>>(new Set());
  const [mainImportLoading, setMainImportLoading]   = useState(false);
  const [mainImportMsg, setMainImportMsg]           = useState("");
  // Shopee driver import
  const [shopeeDrivers, setShopeeDrivers]           = useState<any[]>([]);
  const [shopeeImportQ, setShopeeImportQ]           = useState("");
  const [shopeeImportSelected, setShopeeImportSelected] = useState<Set<string>>(new Set());

  const searchMainDrivers = useCallback(async (q: string) => {
    if (!fleetId) return;
    setMainImportLoading(true);
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/available-main-drivers?q=${encodeURIComponent(q)}`)).then(x => x.json());
    setMainImportLoading(false);
    if (d.ok) setMainDrivers(d.drivers ?? []);
  }, [fleetId]); // eslint-disable-line

  const searchShopeeDrivers = useCallback(async (q: string) => {
    if (!fleetId) return;
    setMainImportLoading(true);
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/available-shopee-drivers?q=${encodeURIComponent(q)}`)).then(x => x.json());
    setMainImportLoading(false);
    if (d.ok) setShopeeDrivers(d.drivers ?? []);
  }, [fleetId]); // eslint-disable-line

  const openMainImportModal = useCallback(async () => {
    setMainImportModal(true); setMainImportMsg(""); setMainImportSelected(new Set());
    setShopeeImportSelected(new Set()); setMainImportQ(""); setShopeeImportQ("");
    setMainImportTab("main");
    searchMainDrivers("");
  }, [searchMainDrivers]); // eslint-disable-line

  const doMainImport = useCallback(async () => {
    if (!fleetId || mainImportSelected.size === 0) return;
    setMainImportLoading(true); setMainImportMsg("");
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/import-main-drivers`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_ids: [...mainImportSelected] }),
    }).then(x => x.json());
    setMainImportLoading(false);
    if (d.ok) {
      setMainImportMsg(`✅ 已匯入 ${d.inserted} 筆司機`);
      loadDrivers();
      searchMainDrivers(mainImportQ);
      setMainImportSelected(new Set());
    } else {
      setMainImportMsg(`❌ ${d.error}`);
    }
  }, [fleetId, mainImportSelected, mainImportQ, searchMainDrivers]); // eslint-disable-line

  const doShopeeImport = useCallback(async () => {
    if (!fleetId || shopeeImportSelected.size === 0) return;
    setMainImportLoading(true); setMainImportMsg("");
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/import-shopee-drivers`), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopee_ids: [...shopeeImportSelected] }),
    }).then(x => x.json());
    setMainImportLoading(false);
    if (d.ok) {
      setMainImportMsg(`✅ 已匯入 ${d.inserted} 筆蝦皮司機`);
      loadDrivers();
      searchShopeeDrivers(shopeeImportQ);
      setShopeeImportSelected(new Set());
    } else {
      setMainImportMsg(`❌ ${d.error}`);
    }
  }, [fleetId, shopeeImportSelected, shopeeImportQ, searchShopeeDrivers]); // eslint-disable-line

  // ── Payroll state ──────────────────────────────────────────────────────────
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [payrollMonth, setPayrollMonth]     = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  });
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollMsg, setPayrollMsg]         = useState("");
  const [showPayroll, setShowPayroll]       = useState(false);

  const loadPayroll = useCallback(async (month: string) => {
    if (!fleetId) return;
    setPayrollLoading(true);
    try {
      const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/payroll?month=${encodeURIComponent(month)}`)).then(x => x.json());
      if (d.ok) setPayrollRecords(d.records ?? []);
    } finally { setPayrollLoading(false); }
  }, [fleetId]); // eslint-disable-line

  const generatePayroll = useCallback(async () => {
    if (!fleetId) return;
    setPayrollLoading(true); setPayrollMsg("");
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/payroll`), {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ month: payrollMonth }),
    }).then(x => x.json());
    setPayrollLoading(false);
    if (d.ok) {
      setPayrollMsg(`✅ 已產生 ${d.records?.length ?? 0} 筆薪資記錄`);
      setPayrollRecords(d.records ?? []);
    } else {
      setPayrollMsg(`❌ ${d.error}`);
    }
  }, [fleetId, payrollMonth]); // eslint-disable-line

  // ── Schedule tab state ────────────────────────────────────────────────────
  const [schedWeeks, setSchedWeeks]     = useState<SchedWeek[]>([]);
  const [schedSelWeek, setSchedSelWeek] = useState("");
  const [schedRoutes, setSchedRoutes]   = useState<SchedRoute[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedImporting, setSchedImporting] = useState(false);
  const [schedImportMsg, setSchedImportMsg] = useState("");
  const schedFileRef = useRef<HTMLInputElement>(null);

  const loadSchedWeeks = useCallback(async () => {
    const d = await fetch(fapi("/shopee-schedules/weeks")).then(x => x.json()).catch(() => ({ ok: false }));
    if (d.ok) { setSchedWeeks(d.weeks ?? []); if (d.weeks?.length) setSchedSelWeek(d.weeks[0].week_label); }
  }, []); // eslint-disable-line

  const loadSchedRoutes = useCallback(async (week: string) => {
    if (!week) return;
    setSchedLoading(true);
    try {
      const d = await fetch(fapi(`/shopee-schedules?week=${encodeURIComponent(week)}&limit=500`)).then(x => x.json());
      if (d.ok) setSchedRoutes(d.routes ?? []);
    } finally { setSchedLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { if (tab === "schedule") loadSchedWeeks(); }, [tab]); // eslint-disable-line
  useEffect(() => { if (schedSelWeek) loadSchedRoutes(schedSelWeek); }, [schedSelWeek]); // eslint-disable-line

  const importSchedExcel = async (file: File) => {
    setSchedImporting(true); setSchedImportMsg("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const d = await fetch(fapi("/shopee-schedules/import"), { method: "POST", body: fd }).then(x => x.json());
      if (d.ok) {
        setSchedImportMsg(`✅ 匯入完成：${d.routes ?? 0} 條路線、${d.stops ?? 0} 站點`);
        await loadSchedWeeks();
      } else { setSchedImportMsg(`❌ ${d.error ?? "匯入失敗"}`); }
    } catch (e: any) { setSchedImportMsg(`❌ ${e.message}`); }
    finally { setSchedImporting(false); if (schedFileRef.current) schedFileRef.current.value = ""; }
  };

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
  const [driverForm, setDriverForm]         = useState({ name:"", phone:"", vehicle_plate:"", vehicle_type:"一般", atoms_account:"", atoms_password:"", employee_id:"", base_salary:"", per_trip_bonus:"", meal_allowance:"", other_deduction:"" });
  const [assigningRoute, setAssigningRoute] = useState<number | null>(null);
  // ── 蝦皮工號匯入 dialog ────────────────────────────────────────────────────
  const [showIdImport, setShowIdImport]     = useState(false);
  const [idImportText, setIdImportText]     = useState("");
  const [idImporting, setIdImporting]       = useState(false);
  const [idImportResult, setIdImportResult] = useState<{inserted:number;skipped:number;not_found:number;results:any[]} | null>(null);
  const idImportFileRef = useRef<HTMLInputElement>(null);

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
  const [fuelBreakdown, setFuelBreakdown]   = useState<FuelBreakdownItem[]>([]);
  const [driverSalaries, setDriverSalaries] = useState<DriverSalaryItem[]>([]);
  const [penaltiesDetail, setPenaltiesDetail] = useState<PenaltyItem[]>([]);
  const [settlementFleetName, setSettlementFleetName] = useState("");
  const [settlementContactName, setSettlementContactName] = useState("");
  const [printSlipOpen, setPrintSlipOpen] = useState(false);
  const [printPayDate, setPrintPayDate]   = useState("");
  const [printHandler, setPrintHandler]   = useState("");
  const [printOwnerSig, setPrintOwnerSig] = useState("");

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

  // Open grab modal (loads drivers list first if needed)
  const openGrabModal = (r: RouteItem) => {
    if (drivers.length === 0) loadDrivers();
    setGrabModalRoute(r);
    setGrabDriverId("none");
    setGrabVehicle("");
  };

  const grab = async () => {
    if (!grabModalRoute) return;
    const routeId = grabModalRoute.id;
    if (grabbingId) return;
    setGrabbingId(routeId);
    try {
      // Find selected driver info
      const selDriver = grabDriverId !== "none"
        ? drivers.find(d => String(d.id) === grabDriverId)
        : null;
      const res = await fetch(fapi(`/fusingao/routes/${routeId}/grab`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId,
          driverId: selDriver ? selDriver.id : null,
          driverName: selDriver ? selDriver.name : null,
          vehiclePlate: grabVehicle || (selDriver?.vehicle_plate ?? null),
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "搶單成功！路線已加入我的任務" });
      setGrabModalRoute(null);
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

  // Load drivers when tab changes to "drivers", or on mount for grab modal
  useEffect(() => { if (tab === "drivers" || !isSubAccount) loadDrivers(); }, [tab]); // eslint-disable-line

  // ── 蝦皮工號匯入 ─────────────────────────────────────────────────────────
  const importByShopeeIds = async (ids: string[]) => {
    if (!fleetId || !ids.length) return;
    setIdImporting(true); setIdImportResult(null);
    try {
      const resp = await fetch(fapi(`/fusingao/fleets/${fleetId}/drivers/import`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopee_ids: ids }),
      });
      const d = await resp.json();
      if (d.ok) { setIdImportResult(d); await loadDrivers(); }
      else toast({ title: `匯入失敗：${d.error}`, variant: "destructive" });
    } catch (e: any) { toast({ title: `匯入失敗：${e.message}`, variant: "destructive" }); }
    finally { setIdImporting(false); }
  };

  const handleIdImportExcel = async (file: File) => {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const ids: string[] = [];
    for (const row of rows) {
      for (const cell of row) {
        const s = String(cell ?? "").trim();
        if (/^\d{4,6}$/.test(s)) ids.push(s);
      }
    }
    if (!ids.length) { toast({ title: "Excel 中未找到有效工號（4-6位數字）", variant: "destructive" }); return; }
    setIdImportText(ids.join(", "));
    await importByShopeeIds(ids);
  };

  const loadSettlement = useCallback(async () => {
    if (!fleetId) return;
    const params = settlementMonth ? `?month=${settlementMonth}` : "";
    const d = await fetch(fapi(`/fusingao/fleets/${fleetId}/settlement${params}`)).then(x => x.json());
    if (d.ok) {
      setSettlement(d.summary);
      setDriverSettlements(d.drivers ?? []);
      setFuelBreakdown(d.fuel_breakdown ?? []);
      setDriverSalaries(d.driver_salaries ?? []);
      setPenaltiesDetail(d.penalties_detail ?? []);
      setSettlementFleetName(d.fleet_name ?? "");
      setSettlementContactName(d.contact_name ?? "");
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
                onClick={e => { e.stopPropagation(); openGrabModal(r); }}>
                <Zap className="h-3.5 w-3.5 mr-1" />搶車
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

        {/* Quick actions (fleet owners only) */}
        {!isSubAccount && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              onClick={() => {
                setEditingDriver(null);
                setDriverForm({ name: "", phone: "", vehicle_plate: "", vehicle_type: "一般", atoms_account: "", atoms_password: "", employee_id: "", base_salary:"", per_trip_bonus:"", meal_allowance:"", other_deduction:"" });
                setQuickDriverForm(true);
              }}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />新增旗下司機
            </Button>
            {drivers.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => setTab("drivers")}>
                <User className="h-3.5 w-3.5 mr-1" />管理旗下司機（{drivers.length} 人）
              </Button>
            )}
          </div>
        )}

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
            { id:"schedule",      label:`📅 蝦皮班表${schedWeeks.length > 0 ? ` (${schedWeeks.length}週)` : ""}` },
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
                      <p className="text-xs text-gray-500 mb-1">工號</p>
                      <input className="w-full border rounded px-2 py-1 text-sm" value={driverForm.employee_id}
                        onChange={e => setDriverForm(p => ({ ...p, employee_id: e.target.value }))} placeholder="例：D001" />
                    </div>
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
                  <div className="border-t pt-2 mt-1">
                    <p className="text-xs font-semibold text-indigo-600 mb-1.5">ATOMS 帳號設定</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">ATOMS 帳號</p>
                        <input className="w-full border rounded px-2 py-1 text-sm" value={driverForm.atoms_account}
                          onChange={e => setDriverForm(p => ({ ...p, atoms_account: e.target.value }))} placeholder="ATOMS 登入帳號" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">ATOMS 密碼</p>
                        <input type="password" className="w-full border rounded px-2 py-1 text-sm" value={driverForm.atoms_password}
                          onChange={e => setDriverForm(p => ({ ...p, atoms_password: e.target.value }))} placeholder="（如需變更請輸入）" />
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-2 mt-1">
                    <p className="text-xs font-semibold text-green-700 mb-1.5">💰 薪資試算設定</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">底薪（月）</p>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm" value={driverForm.base_salary}
                          onChange={e => setDriverForm(p => ({ ...p, base_salary: e.target.value }))} placeholder="0" min="0" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">每趟獎金</p>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm" value={driverForm.per_trip_bonus}
                          onChange={e => setDriverForm(p => ({ ...p, per_trip_bonus: e.target.value }))} placeholder="0" min="0" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">餐費補貼（月）</p>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm" value={driverForm.meal_allowance}
                          onChange={e => setDriverForm(p => ({ ...p, meal_allowance: e.target.value }))} placeholder="0" min="0" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">其他扣除（月）</p>
                        <input type="number" className="w-full border rounded px-2 py-1 text-sm" value={driverForm.other_deduction}
                          onChange={e => setDriverForm(p => ({ ...p, other_deduction: e.target.value }))} placeholder="0" min="0" />
                      </div>
                    </div>
                    {/* Real-time salary preview */}
                    {(Number(driverForm.base_salary)||Number(driverForm.per_trip_bonus)||Number(driverForm.meal_allowance)) > 0 && (
                      <div className="mt-2 bg-green-50 rounded px-3 py-2 text-xs text-green-800">
                        試算（以完成趟數計）：底薪 {fmt(driverForm.base_salary||0)} ＋ 趟數×{fmt(driverForm.per_trip_bonus||0)} ＋ 餐費 {fmt(driverForm.meal_allowance||0)} − 扣除 {fmt(driverForm.other_deduction||0)}
                      </div>
                    )}
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
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                  onClick={() => { setEditingDriver(null); setDriverForm({ name:"", phone:"", vehicle_plate:"", vehicle_type:"一般", atoms_account:"", atoms_password:"", employee_id:"", base_salary:"", per_trip_bonus:"", meal_allowance:"", other_deduction:"" }); setShowDriverForm(true); }}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />新增司機
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-sky-400 text-sky-700 hover:bg-sky-50"
                  onClick={() => { setShowIdImport(true); setIdImportText(""); setIdImportResult(null); }}>
                  🔢 從蝦皮工號匯入
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={openMainImportModal}>
                  👥 從司機名單匯入
                </Button>
                {schedWeeks.length > 0 && (
                  <Button size="sm" variant="outline" className="h-8 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    onClick={openImportModal}>
                    📥 從班表匯入司機
                  </Button>
                )}
              </div>
            )}

            {/* ── 蝦皮工號匯入 dialog ─────────────────────────────────────────── */}
            {showIdImport && (
              <Card className="border-sky-200 bg-sky-50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-sky-800">🔢 從蝦皮工號匯入司機</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowIdImport(false)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div>
                    <label className="text-xs text-sky-700 font-medium">輸入蝦皮工號（逗號或換行分隔）</label>
                    <textarea
                      className="w-full mt-1 rounded border border-sky-200 bg-white px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-sky-400"
                      rows={3}
                      placeholder="例：14681, 14774, 15079, 15080..."
                      value={idImportText}
                      onChange={e => setIdImportText(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                      disabled={idImporting || !idImportText.trim()}
                      onClick={() => {
                        const ids = idImportText.split(/[\s,，\n]+/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
                        importByShopeeIds(ids);
                      }}>
                      {idImporting ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                      {idImporting ? "匯入中…" : "確認匯入"}
                    </Button>
                    <span className="text-xs text-sky-600">或</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-sky-300 text-sky-700"
                      onClick={() => idImportFileRef.current?.click()} disabled={idImporting}>
                      <Download className="h-3 w-3 mr-1" />上傳 Excel
                    </Button>
                    <input ref={idImportFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                      onChange={e => { const f=e.target.files?.[0]; if(f) handleIdImportExcel(f); e.target.value=""; }} />
                  </div>
                  {idImportResult && (
                    <div className="rounded bg-white border border-sky-200 p-2.5 space-y-1.5">
                      <div className="flex gap-3 text-xs">
                        <span className="text-green-700 font-semibold">✅ 新增：{idImportResult.inserted} 人</span>
                        <span className="text-gray-500">已存在：{idImportResult.skipped} 人</span>
                        {idImportResult.not_found > 0 && <span className="text-red-600">找不到：{idImportResult.not_found} 個工號</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {idImportResult.results.map((r: any, i: number) => (
                          <span key={i} className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                            r.status === "inserted" ? "bg-green-100 text-green-700" :
                            r.status === "already_exists" ? "bg-gray-100 text-gray-500" :
                            "bg-red-100 text-red-600"
                          }`}>
                            {r.shopee_id}{r.name ? ` ${r.name}` : ""}
                            {r.status === "inserted" ? " ✓" : r.status === "not_found" ? " ✗" : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Driver list ── 表格式顯示 */}
            {drivers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚未新增旗下司機
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                      <th className="text-left px-3 py-2.5">姓名</th>
                      <th className="text-left px-3 py-2.5">蝦皮工號</th>
                      <th className="text-left px-3 py-2.5">電話</th>
                      <th className="text-left px-3 py-2.5">車型</th>
                      <th className="text-right px-3 py-2.5">本月趟次</th>
                      <th className="text-right px-3 py-2.5">本月薪資（預估）</th>
                      <th className="text-center px-3 py-2.5">狀態</th>
                      <th className="text-center px-3 py-2.5">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map(d => (
                      <tr key={d.id} className={`border-b border-gray-100 hover:bg-orange-50/40 transition-colors ${!d.is_active ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2.5 font-semibold text-gray-800">{d.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-sky-700 font-semibold">
                          {d.employee_id ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{d.phone ?? "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{d.vehicle_type}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold text-gray-800">{d.monthly_completed ?? d.completed_routes}</span>
                          <span className="text-gray-400 text-xs">/{d.monthly_routes ?? d.total_routes}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {Number(d.monthly_salary_estimate ?? 0) > 0
                            ? <span className="text-green-700 font-semibold text-xs">{fmt(d.monthly_salary_estimate)}</span>
                            : <span className="text-gray-300 text-xs">未設定</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge className={`text-xs ${d.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {d.is_active ? "在職" : "停用"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-orange-500"
                              onClick={() => { setEditingDriver(d); setDriverForm({ name:d.name, phone:d.phone??"", vehicle_plate:d.vehicle_plate??"", vehicle_type:d.vehicle_type, atoms_account:d.atoms_account??"", atoms_password:"", employee_id:d.employee_id??"", base_salary:String(d.base_salary??0), per_trip_bonus:String(d.per_trip_bonus??0), meal_allowance:String(d.meal_allowance??0), other_deduction:String(d.other_deduction??0) }); setShowDriverForm(true); }}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-gray-400 hover:text-gray-600"
                              onClick={() => toggleDriverActive(d)}>
                              {d.is_active ? "停用" : "啟用"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── 月薪資匯入區塊 ── */}
            <div className="border-t pt-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                  💰 月薪資計算
                </p>
                <button
                  className="text-xs text-green-700 underline"
                  onClick={() => { setShowPayroll(v => !v); if (!showPayroll) loadPayroll(payrollMonth); }}>
                  {showPayroll ? "收起" : "展開"}
                </button>
              </div>
              {showPayroll && (
                <div className="space-y-3">
                  <div className="flex gap-2 items-center flex-wrap">
                    <input type="month" className="border rounded px-2 py-1 text-sm"
                      value={payrollMonth}
                      onChange={e => { setPayrollMonth(e.target.value); loadPayroll(e.target.value); }} />
                    <button
                      disabled={payrollLoading}
                      className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50"
                      onClick={generatePayroll}>
                      {payrollLoading ? "計算中…" : "📊 產生/更新當月薪資"}
                    </button>
                    {payrollMsg && <span className="text-xs font-medium">{payrollMsg}</span>}
                  </div>
                  {payrollRecords.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-green-700 text-white">
                            {["工號","姓名","完成趟數","底薪","趟數獎金","餐費","扣除","實領薪資"].map(h => (
                              <th key={h} className="text-left px-3 py-2 font-semibold text-xs whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {payrollRecords.map((r, i) => (
                            <tr key={r.id} className={i%2===0?"bg-white":"bg-gray-50"}>
                              <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.employee_id || "—"}</td>
                              <td className="px-3 py-2 font-semibold text-gray-800">{r.driver_name}</td>
                              <td className="px-3 py-2 text-center font-bold text-blue-700">{r.completed_trips}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{fmt(r.base_salary)}</td>
                              <td className="px-3 py-2 text-right text-orange-600">{fmt(Number(r.completed_trips)*Number(r.per_trip_bonus))}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{fmt(r.meal_allowance)}</td>
                              <td className="px-3 py-2 text-right text-red-500">{r.other_deduction > 0 ? `−${fmt(r.other_deduction)}` : "—"}</td>
                              <td className="px-3 py-2 text-right font-bold text-green-700 text-base">{fmt(r.net_salary)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-green-50 border-t-2 border-green-200">
                            <td colSpan={7} className="px-3 py-2 text-sm font-semibold text-gray-600">合計</td>
                            <td className="px-3 py-2 text-right font-bold text-green-800 text-base">
                              {fmt(payrollRecords.reduce((s,r) => s + Number(r.net_salary), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                  {payrollRecords.length === 0 && !payrollLoading && (
                    <div className="text-center py-6 text-gray-400 text-sm">尚無薪資記錄，請點「產生/更新當月薪資」</div>
                  )}
                </div>
              )}
            </div>
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

        {/* ─── 蝦皮班表 tab ─── */}
        {tab === "schedule" && (
          <div className="space-y-3">
            {/* 工具列 */}
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
              padding:"12px 16px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:10 }}>
              {/* 週別選擇 */}
              <select
                value={schedSelWeek}
                onChange={e => setSchedSelWeek(e.target.value)}
                style={{ padding:"7px 12px", border:"1px solid #d1d5db", borderRadius:8,
                  fontSize:14, background:"#fff", maxWidth:240 }}>
                {schedWeeks.length === 0
                  ? <option value="">— 尚無班表資料 —</option>
                  : schedWeeks.map(w => (
                      <option key={w.week_label} value={w.week_label}>
                        {w.week_label}（{w.route_count} 路線）
                      </option>
                    ))}
              </select>
              <button
                onClick={() => loadSchedRoutes(schedSelWeek)}
                disabled={schedLoading}
                style={{ padding:"7px 14px", border:"1px solid #d1d5db", borderRadius:8,
                  fontSize:13, cursor:"pointer", background:"#fff" }}>
                🔄 刷新
              </button>
              {/* 隱藏 file input */}
              <input ref={schedFileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importSchedExcel(f); }} />
              <button
                onClick={() => schedFileRef.current?.click()}
                disabled={schedImporting}
                style={{ padding:"7px 16px", border:"none", borderRadius:8,
                  fontSize:14, fontWeight:600, cursor: schedImporting ? "default" : "pointer",
                  background: schedImporting ? "#9ca3af" : "#1d4ed8", color:"#fff",
                  display:"flex", alignItems:"center", gap:6 }}>
                📥 {schedImporting ? "匯入中…" : "匯入班表 Excel"}
              </button>
              {schedImportMsg && (
                <div style={{ fontSize:13, padding:"6px 12px", borderRadius:6,
                  background: schedImportMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
                  color: schedImportMsg.startsWith("✅") ? "#166534" : "#dc2626",
                  border:`1px solid ${schedImportMsg.startsWith("✅") ? "#bbf7d0" : "#fecaca"}` }}>
                  {schedImportMsg}
                </div>
              )}
            </div>

            {/* 統計摘要 */}
            {schedWeeks.length > 0 && (() => {
              const cw = schedWeeks.find(w => w.week_label === schedSelWeek);
              if (!cw) return null;
              return (
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {[
                    { icon:"📋", label:"路線數", val: cw.route_count, color:"#2563eb", bg:"#eff6ff" },
                    { icon:"🏪", label:"站點總數", val: cw.total_stops, color:"#7c3aed", bg:"#faf5ff" },
                    { icon:"📦", label:"顯示中", val: schedRoutes.length, color:"#ea580c", bg:"#fff7ed" },
                  ].map(s => (
                    <div key={s.label} style={{ flex:1, minWidth:120, padding:"12px 14px",
                      background:s.bg, borderRadius:10, border:`1px solid ${s.color}22` }}>
                      <div style={{ fontSize:20 }}>{s.icon}</div>
                      <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.val.toLocaleString()}</div>
                      <div style={{ fontSize:13, color:"#6b7280" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 路線表格 */}
            {schedLoading ? (
              <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>⏳ 載入中…</div>
            ) : schedRoutes.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>
                {schedWeeks.length === 0 ? "尚未匯入班表，請點「匯入班表 Excel」" : "此週無路線資料"}
              </div>
            ) : (
              <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #e5e7eb" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:16 }}>
                  <thead>
                    <tr style={{ background:"linear-gradient(135deg,#1e3a8a,#1d4ed8)" }}>
                      {["路線編號","類型","車型","司機工號","出車時段","碼頭","站點數"].map(h => (
                        <th key={h} style={{ padding:"12px 16px", textAlign:"left",
                          color:"#fff", fontWeight:600, fontSize:15, whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedRoutes.map((r, i) => {
                      const typeColor: Record<string,{bg:string;color:string}> = {
                        "WH NDD":  { bg:"#ede9fe", color:"#6d28d9" },
                        "快速到貨":{ bg:"#dcfce7", color:"#15803d" },
                        "流水線":  { bg:"#dbeafe", color:"#1e40af" },
                        "NDD":     { bg:"#fef3c7", color:"#b45309" },
                        "一般":    { bg:"#f3f4f6", color:"#374151" },
                      };
                      const tc = typeColor[r.route_type] ?? { bg:"#f3f4f6", color:"#374151" };
                      return (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb",
                          borderBottom:"1px solid #f3f4f6" }}>
                          <td style={{ padding:"11px 16px", fontWeight:700, color:"#1e3a8a", fontFamily:"monospace", fontSize:16 }}>
                            {r.route_no}
                          </td>
                          <td style={{ padding:"11px 16px" }}>
                            <span style={{ padding:"4px 12px", borderRadius:20, fontSize:15,
                              background:tc.bg, color:tc.color, fontWeight:600 }}>
                              {r.route_type || "—"}
                            </span>
                          </td>
                          <td style={{ padding:"11px 16px", fontSize:15, color:"#374151" }}>
                            {r.vehicle_type || "—"}
                          </td>
                          <td style={{ padding:"11px 16px", fontFamily:"monospace", fontSize:15, color:"#0284c7" }}>
                            {r.shopee_driver_id || <span style={{ color:"#9ca3af" }}>—</span>}
                          </td>
                          <td style={{ padding:"11px 16px" }}>
                            {r.departure_time
                              ? <span style={{ padding:"4px 12px", borderRadius:20, fontSize:15,
                                  background:"#dbeafe", color:"#1e40af", fontWeight:600 }}>
                                  {r.departure_time}
                                </span>
                              : <span style={{ color:"#9ca3af" }}>—</span>}
                          </td>
                          <td style={{ padding:"11px 16px", fontFamily:"monospace", fontSize:15 }}>
                            {r.dock_no || "—"}
                          </td>
                          <td style={{ padding:"11px 16px" }}>
                            <span style={{ padding:"4px 12px", borderRadius:20, fontSize:15,
                              background:"#f0fdf4", color:"#15803d", fontWeight:600 }}>
                              {r.stop_count} 站
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding:"10px 16px", fontSize:14, color:"#9ca3af", borderTop:"1px solid #f3f4f6" }}>
                  共 {schedRoutes.length} 條路線
                </div>
              </div>
            )}
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
                {settlement && settlementMonth && (
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-gray-800 hover:bg-gray-900 text-white"
                    onClick={() => setPrintSlipOpen(true)}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1" />列印結算單
                  </Button>
                )}
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

              {/* ── Print Settlement Slip Modal ── */}
              {printSlipOpen && settlement && (() => {
                const shopeeIncome2 = Number(settlement.shopee_income ?? 0);
                const commRate2     = Number(settlement.commission_rate ?? 15);
                const commAmt2      = shopeeIncome2 * commRate2 / 100;
                const fleetReceive2 = shopeeIncome2 - commAmt2;
                const fuelTotal     = fuelBreakdown.reduce((s, r) => s + Number(r.total ?? 0), 0);
                const salaryTotal   = driverSalaries.reduce((s, r) => s + Number(r.total_salary ?? 0), 0);
                const penaltyTotal  = penaltiesDetail.reduce((s, r) => s + Number(r.amount ?? 0), 0);
                const cashDue       = fleetReceive2 - fuelTotal - salaryTotal - penaltyTotal;
                const tripCount     = Number(settlement.trip_count ?? 0);
                const monthLabel    = settlementMonth
                  ? `${settlementMonth.slice(0, 4)} 年 ${settlementMonth.slice(5, 7)} 月`
                  : "—";

                return (
                  <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-6 px-4">
                    <style>{`
                      @media print {
                        body > * { display: none !important; }
                        #cash-settlement-slip { display: block !important; position: static !important; }
                        .no-print { display: none !important; }
                      }
                    `}</style>
                    <div id="cash-settlement-slip" className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden">
                      {/* Modal action bar — hidden when printing */}
                      <div className="no-print flex items-center justify-between px-5 py-3 bg-gray-100 border-b">
                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <FileText className="h-4 w-4" />車主現金結算單預覽
                        </span>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-8 text-xs bg-gray-800 hover:bg-gray-900 text-white" onClick={() => window.print()}>
                            <Printer className="h-3.5 w-3.5 mr-1" />列印 / 存PDF
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPrintSlipOpen(false)}>
                            <X className="h-3.5 w-3.5 mr-1" />關閉
                          </Button>
                        </div>
                      </div>

                      {/* ── Slip content ── */}
                      <div className="p-8 space-y-5 text-sm text-gray-800" style={{ fontFamily: "'Noto Sans TC', 'Microsoft JhengHei', sans-serif" }}>
                        {/* Header */}
                        <div className="text-center border-b pb-4">
                          <p className="text-xs text-gray-400 mb-0.5">富詠運輸股份有限公司</p>
                          <h1 className="text-xl font-bold tracking-wide">車 主 現 金 結 算 單</h1>
                          <p className="text-xs text-gray-500 mt-1">結算月份：{monthLabel}</p>
                        </div>

                        {/* Basic info */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                          <div className="flex gap-2">
                            <span className="text-gray-500 shrink-0">車隊名稱：</span>
                            <span className="font-semibold">{settlementFleetName || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-500 shrink-0">聯絡人：</span>
                            <span className="font-semibold">{settlementContactName || "—"}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-500 shrink-0">結算期間：</span>
                            <span className="font-semibold">{monthLabel}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-500 shrink-0">總趟次：</span>
                            <span className="font-semibold">{tripCount.toLocaleString()} 趟</span>
                          </div>
                        </div>

                        {/* ① Shopee income */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-blue-50 px-4 py-2 font-semibold text-blue-800 text-xs uppercase tracking-wide">① 蝦皮收入</div>
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="border-b">
                                <td className="px-4 py-2 text-gray-600">蝦皮運費總額</td>
                                <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700">{fmt(shopeeIncome2)}</td>
                              </tr>
                              <tr className="border-b">
                                <td className="px-4 py-2 text-gray-600">− 平台服務費（{commRate2}%）</td>
                                <td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(commAmt2)}</td>
                              </tr>
                              <tr className="bg-blue-50/60">
                                <td className="px-4 py-2 font-semibold">車隊實際收款</td>
                                <td className="px-4 py-2 text-right font-mono font-bold text-blue-800">{fmt(fleetReceive2)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* ② Fuel cost */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-orange-50 px-4 py-2 font-semibold text-orange-800 text-xs uppercase tracking-wide flex justify-between">
                            <span>② 油費支出（依車牌）</span>
                            <span className="font-mono">合計：{fmt(fuelTotal)}</span>
                          </div>
                          {fuelBreakdown.length > 0 ? (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                                  <th className="px-4 py-1.5 text-left">車牌號碼</th>
                                  <th className="px-4 py-1.5 text-right">油費金額</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fuelBreakdown.map((r, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="px-4 py-2 font-mono">{r.vehicle_plate}</td>
                                    <td className="px-4 py-2 text-right font-mono">{fmt(Number(r.total))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-4 py-3 text-gray-400 text-xs">本月無油費記錄</p>
                          )}
                        </div>

                        {/* ③ Driver salaries */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-purple-50 px-4 py-2 font-semibold text-purple-800 text-xs uppercase tracking-wide flex justify-between">
                            <span>③ 司機薪資</span>
                            <span className="font-mono">合計：{fmt(salaryTotal)}</span>
                          </div>
                          {driverSalaries.length > 0 ? (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                                  <th className="px-4 py-1.5 text-left">司機</th>
                                  <th className="px-4 py-1.5 text-right">底薪</th>
                                  <th className="px-4 py-1.5 text-right">趟次獎金</th>
                                  <th className="px-4 py-1.5 text-right">餐補</th>
                                  <th className="px-4 py-1.5 text-right">扣款</th>
                                  <th className="px-4 py-1.5 text-right">應付薪資</th>
                                </tr>
                              </thead>
                              <tbody>
                                {driverSalaries.map((r, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="px-4 py-2">
                                      {r.name}
                                      {r.employee_id && <span className="text-gray-400 font-mono text-xs ml-1">#{r.employee_id}</span>}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(Number(r.base_salary))}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">{r.completed_trips} × {fmt(Number(r.per_trip_bonus))}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">{fmt(Number(r.meal_allowance))}</td>
                                    <td className="px-4 py-2 text-right font-mono text-xs text-red-600">− {fmt(Number(r.other_deduction))}</td>
                                    <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(Number(r.total_salary))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-4 py-3 text-gray-400 text-xs">本月無司機薪資記錄</p>
                          )}
                        </div>

                        {/* ④ Penalties */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-red-50 px-4 py-2 font-semibold text-red-800 text-xs uppercase tracking-wide flex justify-between">
                            <span>④ 罰款 / 扣款明細</span>
                            <span className="font-mono">合計：{fmt(penaltyTotal)}</span>
                          </div>
                          {penaltiesDetail.length > 0 ? (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                                  <th className="px-4 py-1.5 text-left">原因</th>
                                  <th className="px-4 py-1.5 text-left">訂單號</th>
                                  <th className="px-4 py-1.5 text-right">金額</th>
                                </tr>
                              </thead>
                              <tbody>
                                {penaltiesDetail.map((r, i) => (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="px-4 py-2">{r.reason}</td>
                                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.order_no || "—"}</td>
                                    <td className="px-4 py-2 text-right font-mono text-red-600">{fmt(Number(r.amount))}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-4 py-3 text-gray-400 text-xs">本月無罰款記錄</p>
                          )}
                        </div>

                        {/* ⑤ Cash settlement total */}
                        <div className="border-2 border-green-400 rounded-lg overflow-hidden">
                          <div className="bg-green-50 px-4 py-2 font-semibold text-green-800 text-xs uppercase tracking-wide">⑤ 現金結算</div>
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="border-b">
                                <td className="px-4 py-2 text-gray-600">車隊實際收款</td>
                                <td className="px-4 py-2 text-right font-mono">{fmt(fleetReceive2)}</td>
                              </tr>
                              {fuelTotal > 0 && (
                                <tr className="border-b">
                                  <td className="px-4 py-2 text-gray-600">− 油費</td>
                                  <td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(fuelTotal)}</td>
                                </tr>
                              )}
                              {salaryTotal > 0 && (
                                <tr className="border-b">
                                  <td className="px-4 py-2 text-gray-600">− 司機薪資</td>
                                  <td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(salaryTotal)}</td>
                                </tr>
                              )}
                              {penaltyTotal > 0 && (
                                <tr className="border-b">
                                  <td className="px-4 py-2 text-gray-600">− 罰款扣款</td>
                                  <td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(penaltyTotal)}</td>
                                </tr>
                              )}
                              <tr className="bg-green-100">
                                <td className="px-4 py-3 font-bold text-green-800 text-base">應付車主現金</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-green-800 text-xl">{fmt(cashDue)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* ⑥ Signature fields */}
                        <div className="border rounded-lg p-4 space-y-3">
                          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">⑥ 確認簽署</p>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">付款日期</p>
                              <input
                                type="date"
                                className="no-print w-full border rounded px-2 py-1.5 text-sm"
                                value={printPayDate}
                                onChange={e => setPrintPayDate(e.target.value)}
                              />
                              <div className="hidden print:block border-b border-gray-400 h-7 text-sm px-1 pt-1">{printPayDate || " "}</div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">經手人</p>
                              <input
                                type="text"
                                className="no-print w-full border rounded px-2 py-1.5 text-sm"
                                value={printHandler}
                                onChange={e => setPrintHandler(e.target.value)}
                                placeholder="姓名"
                              />
                              <div className="hidden print:block border-b border-gray-400 h-7 text-sm px-1 pt-1">{printHandler || " "}</div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">車主簽名</p>
                              <div className="border-b border-gray-400 h-8" />
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 pt-1">
                            本結算單由系統自動生成，如有疑問請聯繫富詠運輸管理部門。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
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

      {/* ══ Grab modal: 搶車時選司機 ══════════════════════════════════════════ */}
      {grabModalRoute && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
          onClick={() => { if (!grabbingId) setGrabModalRoute(null); }}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
          }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#ea580c,#f97316)", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Zap style={{ color: "#fff", width: 20, height: 20 }} />
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>搶車確認</div>
                  <div style={{ color: "#fed7aa", fontSize: 12 }}>
                    路線 {grabModalRoute.routeId} ・{grabModalRoute.stations} 站
                    {grabModalRoute.dock ? ` ・碼頭 ${grabModalRoute.dock}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "20px" }}>
              {/* 選司機 */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  指派給旗下司機（選填）
                </label>
                <select
                  value={grabDriverId}
                  onChange={e => {
                    const v = e.target.value;
                    setGrabDriverId(v);
                    if (v !== "none") {
                      const drv = drivers.find(d => String(d.id) === v);
                      if (drv?.vehicle_plate) setGrabVehicle(drv.vehicle_plate);
                    } else {
                      setGrabVehicle("");
                    }
                  }}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
                    borderRadius: 8, fontSize: 14, background: "#fff", outline: "none" }}>
                  <option value="none">— 暫不指派 —</option>
                  {drivers.filter(d => d.is_active).map(d => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}{d.vehicle_plate ? ` (${d.vehicle_plate})` : ""}{d.vehicle_type ? ` · ${d.vehicle_type}` : ""}
                    </option>
                  ))}
                </select>
                {drivers.filter(d => d.is_active).length === 0 && (
                  <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                    尚無旗下司機，可在「旗下司機」tab 新增後再搶車
                  </p>
                )}
              </div>

              {/* 車牌 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>
                  車牌號碼（選填）
                </label>
                <input
                  value={grabVehicle}
                  onChange={e => setGrabVehicle(e.target.value)}
                  placeholder="例：ABC-1234"
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
                    borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>

              {/* 站點預覽 */}
              {grabModalRoute.stopList.length > 0 && (
                <div style={{ marginBottom: 20, padding: "12px", background: "#f9fafb",
                  borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>
                    配送站點（{grabModalRoute.stations} 站）
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {grabModalRoute.stopList.slice(0, 12).map((s, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#fff",
                        border: "1px solid #e5e7eb", borderRadius: 20, color: "#374151" }}>
                        {i + 1}. {s}
                      </span>
                    ))}
                    {grabModalRoute.stopList.length > 12 && (
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        …還有 {grabModalRoute.stopList.length - 12} 站
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 按鈕 */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  disabled={!!grabbingId}
                  onClick={() => setGrabModalRoute(null)}
                  style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: 8,
                    fontSize: 14, cursor: "pointer", background: "#fff", color: "#374151" }}>
                  取消
                </button>
                <button
                  disabled={!!grabbingId}
                  onClick={grab}
                  style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 700, cursor: grabbingId ? "default" : "pointer",
                    background: grabbingId ? "#9ca3af" : "#ea580c", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Zap style={{ width: 16, height: 16 }} />
                  {grabbingId ? "搶車中…" : "確認搶車"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Import Drivers from Main Driver List modal ══════════════════════ */}
      {mainImportModal && (
        <div style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,0.5)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={() => setMainImportModal(false)}>
          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:580,
            maxHeight:"88vh", display:"flex", flexDirection:"column",
            boxShadow:"0 20px 60px rgba(0,0,0,0.3)", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding:"16px 20px 0", borderBottom:"1px solid #e5e7eb" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontSize:17, fontWeight:700, color:"#1d4ed8" }}>👥 從司機名單匯入</div>
                <button onClick={() => setMainImportModal(false)}
                  style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#9ca3af" }}>✕</button>
              </div>
              {/* Tabs */}
              <div style={{ display:"flex", gap:0, borderBottom:"2px solid #e5e7eb", marginBottom:0 }}>
                {([["main","🗂️ 系統司機名單"],["shopee","🛒 蝦皮車隊名單"]] as const).map(([tab, label]) => (
                  <button key={tab}
                    onClick={() => {
                      setMainImportTab(tab);
                      setMainImportMsg("");
                      if (tab === "shopee" && shopeeDrivers.length === 0) searchShopeeDrivers("");
                    }}
                    style={{
                      padding:"8px 18px", fontSize:13, fontWeight:600, border:"none",
                      background:"none", cursor:"pointer", borderBottom:`2px solid ${mainImportTab===tab ? "#1d4ed8" : "transparent"}`,
                      color: mainImportTab===tab ? "#1d4ed8" : "#6b7280", marginBottom:-2,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Search bar */}
              <div style={{ padding:"10px 0 12px", position:"relative" }}>
                <input
                  style={{ width:"100%", border:"1px solid #d1d5db", borderRadius:8, padding:"8px 12px 8px 36px",
                    fontSize:14, outline:"none", boxSizing:"border-box" }}
                  placeholder={mainImportTab === "main" ? "搜尋工號 / 姓名 / 手機..." : "搜尋工號 / 姓名..."}
                  value={mainImportTab === "main" ? mainImportQ : shopeeImportQ}
                  onChange={e => {
                    if (mainImportTab === "main") { setMainImportQ(e.target.value); searchMainDrivers(e.target.value); }
                    else { setShopeeImportQ(e.target.value); searchShopeeDrivers(e.target.value); }
                  }}
                />
                <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9ca3af", fontSize:14 }}>🔍</span>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:"auto", padding:16 }}>
              {mainImportLoading && (
                <div style={{ textAlign:"center", padding:32, color:"#6b7280" }}>載入中…</div>
              )}

              {/* ── Main drivers tab ── */}
              {mainImportTab === "main" && !mainImportLoading && (
                <>
                  {mainDrivers.length === 0 ? (
                    <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>找不到符合的司機</div>
                  ) : (
                    <>
                      <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                        <button style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #3b82f6",
                          background:"#eff6ff", color:"#1d4ed8", cursor:"pointer" }}
                          onClick={() => setMainImportSelected(new Set(mainDrivers.filter(d => !d.already_imported).map(d => d.id)))}>
                          全選可匯入
                        </button>
                        <button style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb",
                          background:"#f9fafb", cursor:"pointer" }}
                          onClick={() => setMainImportSelected(new Set())}>
                          取消全選
                        </button>
                        <span style={{ fontSize:12, color:"#6b7280", marginLeft:"auto" }}>
                          已選 {mainImportSelected.size} 筆 / 共 {mainDrivers.length} 筆
                        </span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {mainDrivers.map(d => (
                          <div key={d.id} style={{
                            display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                            borderRadius:8, border:"1px solid #e5e7eb",
                            background: d.already_imported ? "#f0fdf4" : mainImportSelected.has(d.id) ? "#eff6ff" : "#fafafa",
                            opacity: d.already_imported ? 0.7 : 1,
                          }}>
                            <input type="checkbox" style={{ width:16, height:16, cursor:"pointer" }}
                              checked={mainImportSelected.has(d.id)} disabled={d.already_imported}
                              onChange={e => setMainImportSelected(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(d.id) : next.delete(d.id);
                                return next;
                              })} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                {d.employee_id && <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:13, color:"#0284c7" }}>{d.employee_id}</span>}
                                <span style={{ fontWeight:600, fontSize:14 }}>{d.name}</span>
                                <span style={{ fontSize:11, color:"#6b7280", background:"#f3f4f6", padding:"1px 7px", borderRadius:10 }}>
                                  {d.vehicle_type} · {d.driver_type}
                                </span>
                                {d.already_imported && <span style={{ fontSize:11, color:"#16a34a", background:"#dcfce7", padding:"1px 7px", borderRadius:10 }}>✓ 已匯入</span>}
                              </div>
                              <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>
                                {d.phone ?? "—"}{d.license_plate && ` ・ ${d.license_plate}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Shopee drivers tab ── */}
              {mainImportTab === "shopee" && !mainImportLoading && (
                <>
                  {shopeeDrivers.length === 0 ? (
                    <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>找不到蝦皮司機資料</div>
                  ) : (
                    <>
                      <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                        <button style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #f97316",
                          background:"#fff7ed", color:"#c2410c", cursor:"pointer" }}
                          onClick={() => setShopeeImportSelected(new Set(shopeeDrivers.filter(d => !d.already_imported).map(d => d.shopee_id)))}>
                          全選可匯入
                        </button>
                        <button style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb",
                          background:"#f9fafb", cursor:"pointer" }}
                          onClick={() => setShopeeImportSelected(new Set())}>
                          取消全選
                        </button>
                        <span style={{ fontSize:12, color:"#6b7280", marginLeft:"auto" }}>
                          已選 {shopeeImportSelected.size} 筆 / 共 {shopeeDrivers.length} 筆
                        </span>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {shopeeDrivers.map(d => (
                          <div key={d.shopee_id} style={{
                            display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                            borderRadius:8, border:"1px solid #e5e7eb",
                            background: d.already_imported ? "#f0fdf4" : shopeeImportSelected.has(d.shopee_id) ? "#fff7ed" : "#fafafa",
                            opacity: d.already_imported ? 0.7 : 1,
                          }}>
                            <input type="checkbox" style={{ width:16, height:16, cursor:"pointer" }}
                              checked={shopeeImportSelected.has(d.shopee_id)} disabled={d.already_imported}
                              onChange={e => setShopeeImportSelected(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(d.shopee_id) : next.delete(d.shopee_id);
                                return next;
                              })} />
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:13, color:"#ea580c" }}>{d.shopee_id}</span>
                                <span style={{ fontWeight:600, fontSize:14 }}>{d.name ?? "—"}</span>
                                <span style={{ fontSize:11, color:"#6b7280", background:"#f3f4f6", padding:"1px 7px", borderRadius:10 }}>
                                  {d.vehicle_type ?? "—"} · {d.is_own_driver ? "自有" : "外包"}
                                </span>
                                {d.fleet_name && <span style={{ fontSize:11, color:"#7c3aed", background:"#ede9fe", padding:"1px 7px", borderRadius:10 }}>{d.fleet_name}</span>}
                                {d.already_imported && <span style={{ fontSize:11, color:"#16a34a", background:"#dcfce7", padding:"1px 7px", borderRadius:10 }}>✓ 已匯入</span>}
                              </div>
                              {d.vehicle_plate && <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{d.vehicle_plate}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {mainImportMsg && (
                <div style={{ marginTop:12, textAlign:"center", fontSize:14, fontWeight:600,
                  color: mainImportMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                  {mainImportMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            {(mainImportTab === "main" ? mainImportSelected.size : shopeeImportSelected.size) > 0 && (
              <div style={{ padding:"12px 16px", borderTop:"1px solid #e5e7eb", display:"flex", gap:10 }}>
                <button onClick={() => setMainImportModal(false)}
                  style={{ flex:1, padding:"10px", border:"1px solid #d1d5db", borderRadius:8,
                    fontSize:14, cursor:"pointer", background:"#fff", color:"#374151" }}>
                  取消
                </button>
                <button
                  onClick={mainImportTab === "main" ? doMainImport : doShopeeImport}
                  disabled={mainImportLoading}
                  style={{ flex:2, padding:"10px", border:"none", borderRadius:8,
                    fontSize:14, fontWeight:700, cursor:"pointer",
                    background: mainImportLoading ? "#9ca3af"
                      : mainImportTab === "main" ? "#1d4ed8" : "#ea580c",
                    color:"#fff" }}>
                  {mainImportLoading ? "匯入中…"
                    : mainImportTab === "main"
                      ? `匯入選取的 ${mainImportSelected.size} 位系統司機`
                      : `匯入選取的 ${shopeeImportSelected.size} 位蝦皮司機`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Import Drivers from Schedule modal ══════════════════════════════ */}
      {importModal && (
        <div style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,0.5)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={() => setImportModal(false)}>
          <div style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:520,
            maxHeight:"80vh", display:"flex", flexDirection:"column",
            boxShadow:"0 20px 60px rgba(0,0,0,0.3)", overflow:"hidden" }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ background:"linear-gradient(135deg,#4f46e5,#6366f1)", padding:"16px 20px" }}>
              <div style={{ color:"#fff", fontWeight:700, fontSize:16 }}>📥 從班表匯入司機</div>
              <div style={{ color:"#c7d2fe", fontSize:13, marginTop:3 }}>
                以下工號出現在班表但尚未建立司機資料，請填入姓名後勾選匯入
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
              {importLoading && importSuggestions.length === 0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>⏳ 讀取中…</div>
              ) : importSuggestions.length === 0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#9ca3af" }}>
                  ✅ 班表中所有司機工號已匯入，無需額外操作
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                    <button
                      style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb",
                        background:"#f9fafb", cursor:"pointer" }}
                      onClick={() => setImportSelected(new Set(importSuggestions.map(s => s.shopee_driver_id)))}>
                      全選
                    </button>
                    <button
                      style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb",
                        background:"#f9fafb", cursor:"pointer" }}
                      onClick={() => setImportSelected(new Set())}>
                      取消全選
                    </button>
                    <span style={{ fontSize:12, color:"#6b7280", marginLeft:"auto", lineHeight:"28px" }}>
                      已選 {importSelected.size} / {importSuggestions.length}
                    </span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {importSuggestions.map(s => (
                      <div key={s.shopee_driver_id} style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"10px 12px", borderRadius:8, border:"1px solid #e5e7eb",
                        background: importSelected.has(s.shopee_driver_id) ? "#eef2ff" : "#fafafa",
                      }}>
                        <input type="checkbox" style={{ width:16, height:16, cursor:"pointer" }}
                          checked={importSelected.has(s.shopee_driver_id)}
                          onChange={e => {
                            setImportSelected(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(s.shopee_driver_id) : next.delete(s.shopee_driver_id);
                              return next;
                            });
                          }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:15, color:"#0284c7" }}>
                              {s.shopee_driver_id}
                            </span>
                            <span style={{ fontSize:12, color:"#6b7280", background:"#f3f4f6",
                              padding:"2px 8px", borderRadius:12 }}>
                              {s.vehicle_type || "一般"} · {s.route_count} 趟
                            </span>
                          </div>
                        </div>
                        <input
                          style={{ width:120, border:"1px solid #d1d5db", borderRadius:6,
                            padding:"5px 8px", fontSize:13 }}
                          placeholder="輸入姓名"
                          value={importNames[s.shopee_driver_id] ?? ""}
                          onChange={e => setImportNames(prev => ({ ...prev, [s.shopee_driver_id]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {importMsg && (
                <div style={{ marginTop:12, textAlign:"center", fontSize:14, fontWeight:600,
                  color: importMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                  {importMsg}
                </div>
              )}
            </div>

            {/* Footer */}
            {importSuggestions.length > 0 && (
              <div style={{ borderTop:"1px solid #e5e7eb", padding:"12px 20px",
                display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button
                  style={{ padding:"8px 18px", borderRadius:8, border:"1px solid #d1d5db",
                    background:"#fff", cursor:"pointer", fontSize:14 }}
                  onClick={() => setImportModal(false)}>取消</button>
                <button
                  disabled={importSelected.size === 0 || importLoading}
                  style={{ padding:"8px 18px", borderRadius:8, border:"none",
                    background: importSelected.size === 0 ? "#a5b4fc" : "#4f46e5",
                    color:"#fff", cursor: importSelected.size === 0 ? "not-allowed" : "pointer",
                    fontSize:14, fontWeight:600 }}
                  onClick={doImportDrivers}>
                  {importLoading ? "匯入中…" : `匯入 ${importSelected.size} 位司機`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Quick Add Driver modal ════════════════════════════════════════════ */}
      {quickDriverForm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
          onClick={() => setQuickDriverForm(false)}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
          }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <UserPlus style={{ color: "#fff", width: 20, height: 20 }} />
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>快速新增司機</div>
              </div>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>工號</label>
                  <input className="w-full border rounded px-2 py-1.5 text-sm"
                    value={driverForm.employee_id}
                    onChange={e => setDriverForm(p => ({ ...p, employee_id: e.target.value }))}
                    placeholder="例：D001" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>
                    姓名 <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input className="w-full border rounded px-2 py-1.5 text-sm"
                    value={driverForm.name}
                    onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="司機姓名" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>電話</label>
                  <input className="w-full border rounded px-2 py-1.5 text-sm"
                    value={driverForm.phone}
                    onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="09XXXXXXXX" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>車牌號碼</label>
                  <input className="w-full border rounded px-2 py-1.5 text-sm"
                    value={driverForm.vehicle_plate}
                    onChange={e => setDriverForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                    placeholder="ABC-1234" />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>車型</label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                    value={driverForm.vehicle_type}
                    onChange={e => setDriverForm(p => ({ ...p, vehicle_type: e.target.value }))}>
                    {["一般", "貨車", "廂型", "機車"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", marginBottom: 8 }}>ATOMS 帳號設定（指派時自動傳送）</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>ATOMS 帳號</label>
                    <input className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.atoms_account}
                      onChange={e => setDriverForm(p => ({ ...p, atoms_account: e.target.value }))}
                      placeholder="ATOMS 登入帳號" />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>ATOMS 密碼</label>
                    <input type="password" className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.atoms_password}
                      onChange={e => setDriverForm(p => ({ ...p, atoms_password: e.target.value }))}
                      placeholder="ATOMS 登入密碼" />
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>💰 薪資試算設定</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>底薪（月）</label>
                    <input type="number" className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.base_salary} placeholder="0" min="0"
                      onChange={e => setDriverForm(p => ({ ...p, base_salary: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>每趟獎金</label>
                    <input type="number" className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.per_trip_bonus} placeholder="0" min="0"
                      onChange={e => setDriverForm(p => ({ ...p, per_trip_bonus: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>餐費補貼（月）</label>
                    <input type="number" className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.meal_allowance} placeholder="0" min="0"
                      onChange={e => setDriverForm(p => ({ ...p, meal_allowance: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>其他扣除（月）</label>
                    <input type="number" className="w-full border rounded px-2 py-1.5 text-sm"
                      value={driverForm.other_deduction} placeholder="0" min="0"
                      onChange={e => setDriverForm(p => ({ ...p, other_deduction: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setQuickDriverForm(false)}
                  style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: 8,
                    fontSize: 14, cursor: "pointer", background: "#fff", color: "#374151" }}>
                  取消
                </button>
                <button
                  onClick={async () => {
                    await saveDriver();
                    setQuickDriverForm(false);
                  }}
                  style={{ flex: 2, padding: "10px", border: "none", borderRadius: 8,
                    fontSize: 14, fontWeight: 700, cursor: "pointer",
                    background: "#2563eb", color: "#fff" }}>
                  儲存司機
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
