import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, RefreshCw, CheckCircle2, Clock, FileText,
  Truck, AlertTriangle, DollarSign, ChevronDown, ChevronRight,
  Download, Tag, Package, MapPin, CheckSquare, Square,
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

type PortalTab = "notify" | "monthly" | "rates";

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
      </div>
    </div>
  );
}
