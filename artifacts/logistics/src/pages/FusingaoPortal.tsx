import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, CheckCircle2, Clock, FileText,
  Truck, AlertTriangle, DollarSign, ChevronDown, ChevronRight,
  Download, Tag, Package, MapPin, CheckSquare, Square,
  Users, Plus, Edit2, Save, X, ShieldCheck, ShieldOff, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

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

type PortalTab = "notify" | "monthly" | "rates" | "fleets";

interface FleetRow {
  id: number; fleet_name: string; contact_name: string | null; contact_phone: string | null;
  username: string; vehicle_types: string | null; notes: string | null; is_active: boolean;
  created_at: string; total_routes: string; completed_routes: string; billed_routes: string;
  fleet_payout: string;
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
  const [tab, setTab]           = useState<PortalTab>("notify");
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
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterMonth) params.set("month", filterMonth);
      const [s, r, m] = await Promise.all([
        fetch(getApiUrl("/fusingao/summary")).then(x => x.json()),
        fetch(getApiUrl(`/fusingao/routes?${params}`)).then(x => x.json()),
        fetch(getApiUrl("/fusingao/monthly")).then(x => x.json()),
      ]);
      if (s.ok) setSummary(s.summary);
      if (r.ok) setRoutes(r.routes);
      if (m.ok) setMonths(m.months);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [filterStatus, filterMonth]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const markComplete = async (id: number, completed: boolean) => {
    await fetch(getApiUrl(`/fusingao/routes/${id}/complete`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    await load();
    toast({ title: completed ? "已標記完成" : "已取消完成" });
  };

  const markBilling = async (id: number, status: string) => {
    await fetch(getApiUrl(`/fusingao/routes/${id}/billing`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
    toast({ title: status === "paid" ? "已標記對帳" : "已取消對帳" });
  };

  const billAllMonth = async (month: string) => {
    await fetch(getApiUrl(`/fusingao/monthly/${encodeURIComponent(month)}/bill-all`), { method: "PUT" });
    await load();
    toast({ title: `${month} 整月對帳完成` });
  };

  // ── Fleet management handlers ──────────────────────────────────────────────
  const loadFleets = useCallback(async () => {
    setFleetLoading(true);
    try {
      const d = await fetch(getApiUrl("/fusingao/fleets")).then(x => x.json());
      if (d.ok) setFleets(d.fleets ?? []);
    } catch { toast({ title: "車隊載入失敗", variant: "destructive" }); }
    finally { setFleetLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { if (tab === "fleets") loadFleets(); }, [tab]); // eslint-disable-line

  const openNewFleet = () => {
    setEditingFleet(null);
    setFleetForm({ fleet_name:"", contact_name:"", contact_phone:"", username:"", password:"", vehicle_types:"", notes:"", rate_override:"" });
    setShowFleetForm(true);
  };

  const openEditFleet = (f: FleetRow) => {
    setEditingFleet(f);
    setFleetForm({ fleet_name:f.fleet_name, contact_name:f.contact_name??"", contact_phone:f.contact_phone??"", username:f.username, password:"", vehicle_types:f.vehicle_types??"", notes:f.notes??"", rate_override:"" });
    setShowFleetForm(true);
  };

  const saveFleet = async () => {
    if (!fleetForm.fleet_name || !fleetForm.username) return toast({ title: "請填寫車隊名稱與帳號", variant: "destructive" });
    if (!editingFleet && !fleetForm.password) return toast({ title: "請設定初始密碼", variant: "destructive" });
    const body = { ...fleetForm, rate_override: fleetForm.rate_override ? Number(fleetForm.rate_override) : undefined };
    const url  = editingFleet ? getApiUrl(`/fusingao/fleets/${editingFleet.id}`) : getApiUrl("/fusingao/fleets");
    const method = editingFleet ? "PUT" : "POST";
    const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(x => x.json());
    if (!d.ok) return toast({ title: d.error ?? "儲存失敗", variant: "destructive" });
    toast({ title: editingFleet ? "車隊更新成功" : "新增車隊成功" });
    setShowFleetForm(false);
    loadFleets();
  };

  const toggleFleetActive = async (f: FleetRow) => {
    await fetch(getApiUrl(`/fusingao/fleets/${f.id}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, is_active: !f.is_active }),
    });
    loadFleets();
  };

  const exportMonthCSV = (m: MonthRow) => {
    const lines = [
      "路線編號,服務模式,日期,站點數,司機,車號,蝦皮費率,完成狀態,對帳狀態",
      ...m.routes.map(r =>
        `${r.routeId},${r.service_type ?? ""},${new Date(r.created_at).toLocaleDateString("zh-TW")},${r.stations},${r.driver_name ?? r.driverId ?? ""},${r.vehicle_plate ?? ""},${r.shopee_rate ?? ""},${r.status === "completed" || r.completed_at ? "已完成" : "進行中"},${r.driver_payment_status === "paid" ? "已對帳" : "未對帳"}`
      ),
      `,,,,,,合計 NT$${Math.round(Number(m.shopee_income)).toLocaleString()},${m.completed_count}/${m.route_count} 完成,${m.billed_count}/${m.route_count} 對帳`,
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `福興高對帳_${m.month}.csv`; a.click();
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
              { icon: <Package className="h-5 w-5 text-orange-500"/>, label:"本月路線", val: summary.this_month_routes + " 趟", sub:"總計 "+summary.total_routes+" 趟" },
              { icon: <CheckCircle2 className="h-5 w-5 text-green-500"/>, label:"已完成", val: summary.completed + " 趟", sub: summary.in_progress + " 趟進行中" },
              { icon: <FileText className="h-5 w-5 text-blue-500"/>, label:"已對帳", val: summary.billed + " 趟", sub: summary.unbilled + " 趟待對帳" },
              { icon: <DollarSign className="h-5 w-5 text-emerald-500"/>, label:"本月金額", val: fmt(summary.this_month_income), sub: "全期 "+fmt(summary.total_shopee_income) },
            ].map(k => (
              <Card key={k.label}>
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
        <div className="flex gap-1 border-b bg-white rounded-t-lg px-4 pt-2">
          {([
            { id:"notify",  label:"🔔 車趟完成通知", desc:"即時狀態" },
            { id:"monthly", label:"📋 月度對帳",    desc:"逐月結算" },
            { id:"fleets",  label:"🚚 合作車隊管理", desc:"帳號管理" },
          ] as { id: PortalTab; label: string; desc: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${t.id===tab?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

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
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => exportMonthCSV(m)}>
                          <Download className="h-3.5 w-3.5 mr-1" />匯出 CSV
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
                        <div className="flex gap-1 shrink-0">
                          <a href={`/fleet`} target="_blank" rel="noreferrer"
                            className="h-7 w-7 flex items-center justify-center rounded border text-gray-400 hover:text-orange-500 hover:border-orange-300 text-xs"
                            title="開啟車隊入口預覽">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
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
      </div>
    </div>
  );
}
