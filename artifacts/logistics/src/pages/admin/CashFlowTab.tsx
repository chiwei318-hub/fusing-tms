import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, DollarSign, Users, Building2, RefreshCw,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight,
  Truck, Layers, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
interface MonthlySummary {
  year: number; month: number;
  order_count: number; delivered_count: number; cancelled_count: number;
  total_revenue: number; enterprise_revenue: number; retail_revenue: number;
  driver_payout: number; franchise_payout: number;
  vehicle_cost: number; platform_profit: number; profit_margin: number;
  franchise_settlement_count: number;
}

interface TrendPoint {
  period: string; total_revenue: number; driver_payout: number;
  franchise_payout: number; platform_profit: number;
  order_count: number; delivered_count: number;
}

interface OrderFlow {
  id: number; created_at: string; status: string;
  customer_name: string; customer_phone: string;
  total_fee: number; driver_name: string | null;
  driver_commission_rate: number; driver_payout: number; platform_net: number;
  enterprise_name: string | null;
}

interface DriverFlow {
  id: number; name: string; vehicle_type: string; license_plate: string;
  commission_rate: number; delivered_count: number;
  gross_revenue: number; driver_payout: number; platform_net: number;
}

interface FranchiseeFlow {
  id: number; code: string; name: string; commission_rate: number;
  order_count: number | null; gross_revenue: number | null;
  franchisee_payout: number | null; platform_fee: number | null;
  net_payout: number | null; status: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const NT  = (v: number | null | undefined) => `NT$ ${Number(v ?? 0).toLocaleString()}`;
const PCT = (v: number) => `${v}%`;

const FLOW_COLORS = {
  driver:    "#6366f1",
  franchise: "#f59e0b",
  platform:  "#10b981",
  vehicle:   "#ef4444",
};

const PIE_COLORS = [FLOW_COLORS.driver, FLOW_COLORS.franchise, FLOW_COLORS.vehicle, FLOW_COLORS.platform];

const STATUS_BADGE: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  pending:   "bg-amber-100 text-amber-700",
  assigned:  "bg-blue-100 text-blue-700",
  in_transit:"bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_TW: Record<string, string> = {
  delivered: "已完成", pending: "待處理", assigned: "已派車",
  in_transit: "配送中", cancelled: "已取消",
};

function authHeaders() {
  const t = localStorage.getItem("auth-jwt");
  return t ? { Authorization: `Bearer ${t}` } : {} as any;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <Card className={`border-0 ${bg}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`${color} opacity-50`}><Icon className="w-6 h-6" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CashTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg rounded-xl border p-3 text-xs space-y-1.5 min-w-[160px]">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{NT(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CashFlowTab() {
  const { toast } = useToast();
  const now   = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary, setSummary]         = useState<MonthlySummary | null>(null);
  const [trend, setTrend]             = useState<TrendPoint[]>([]);
  const [orders, setOrders]           = useState<OrderFlow[]>([]);
  const [driverFlows, setDriverFlows] = useState<DriverFlow[]>([]);
  const [franFlows, setFranFlows]     = useState<FranchiseeFlow[]>([]);
  const [orderTotal, setOrderTotal]   = useState(0);
  const [orderPage, setOrderPage]     = useState(1);
  const [loading, setLoading]         = useState(true);
  const [subTab, setSubTab]           = useState("overview");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, trendRes, drRes, frRes] = await Promise.all([
        fetch(getApiUrl(`cash-flow/monthly?year=${year}&month=${month}`), { headers: authHeaders() }),
        fetch(getApiUrl(`cash-flow/trend?months=6`), { headers: authHeaders() }),
        fetch(getApiUrl(`cash-flow/by-driver?year=${year}&month=${month}`), { headers: authHeaders() }),
        fetch(getApiUrl(`cash-flow/by-franchisee?year=${year}&month=${month}`), { headers: authHeaders() }),
      ]);
      setSummary(await sumRes.json());
      setTrend(await trendRes.json());
      setDriverFlows(await drRes.json());
      setFranFlows(await frRes.json());
      setOrderPage(1);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const fetchOrders = useCallback(async (page: number) => {
    const res = await fetch(getApiUrl(`cash-flow/orders?year=${year}&month=${month}&page=${page}&limit=20`), { headers: authHeaders() });
    const data = await res.json();
    setOrders(data.data ?? []);
    setOrderTotal(data.total ?? 0);
  }, [year, month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (subTab === "orders") fetchOrders(orderPage); }, [subTab, orderPage, fetchOrders]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    if (isCurrentMonth) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  // ── Derived pie data ────────────────────────────────────────────────────
  const pieData = summary ? [
    { name: "司機薪資", value: summary.driver_payout },
    { name: "加盟主分潤", value: summary.franchise_payout },
    { name: "車輛/其他成本", value: summary.vehicle_cost },
    { name: "平台淨利", value: Math.max(0, summary.platform_profit) },
  ].filter(d => d.value > 0) : [];

  const trendFormatted = trend.map(t => ({
    ...t,
    period: t.period.substring(5),
  }));

  if (loading && !summary) {
    return <div className="flex justify-center items-center h-40 text-muted-foreground">載入中...</div>;
  }

  const s = summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            金流拆解中心
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">逐筆訂單收入追蹤：司機薪資・加盟主分潤・平台淨利</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="min-w-[90px] text-center font-semibold text-sm">{year} 年 {month} 月</div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}
            disabled={year === now.getFullYear() && month === now.getMonth() + 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />重新整理
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="訂單收入"     value={NT(s.total_revenue)}     sub={`${s.delivered_count} 筆完成`}       icon={DollarSign}  color="text-blue-600"    bg="bg-blue-50" />
          <KpiCard label="司機薪資"     value={NT(s.driver_payout)}     sub={`平均佔收入 ${s.total_revenue > 0 ? Math.round(s.driver_payout / s.total_revenue * 100) : 0}%`} icon={Users}   color="text-indigo-600"  bg="bg-indigo-50" />
          <KpiCard label="加盟主分潤"   value={NT(s.franchise_payout)}  sub={`${s.franchise_settlement_count} 筆結算`}        icon={Building2}   color="text-amber-600"   bg="bg-amber-50" />
          <KpiCard label="平台淨利"     value={NT(s.platform_profit)}   sub={`毛利率 ${PCT(s.profit_margin)}`}  icon={TrendingUp}  color={s.platform_profit >= 0 ? "text-green-600" : "text-red-600"} bg={s.platform_profit >= 0 ? "bg-green-50" : "bg-red-50"} />
        </div>
      )}

      {/* Revenue breakdown bar */}
      {s && s.total_revenue > 0 && (
        <Card className="border">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-muted-foreground mb-3">收入分配（{NT(s.total_revenue)}）</p>
            <div className="flex rounded-lg overflow-hidden h-7 text-xs font-medium">
              {[
                { label: "司機", v: s.driver_payout,    c: "bg-indigo-500" },
                { label: "加盟", v: s.franchise_payout, c: "bg-amber-400" },
                { label: "成本", v: s.vehicle_cost,     c: "bg-red-400" },
                { label: "淨利", v: Math.max(0, s.platform_profit), c: "bg-emerald-500" },
              ].filter(item => item.v > 0).map(item => {
                const pct = Math.round((item.v / s.total_revenue) * 100);
                return (
                  <div key={item.label} className={`${item.c} flex items-center justify-center text-white`}
                    style={{ width: `${pct}%`, minWidth: pct > 5 ? undefined : 0 }}
                    title={`${item.label}: ${NT(item.v)} (${pct}%)`}>
                    {pct >= 8 ? `${item.label} ${pct}%` : ""}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              {[
                { label: "司機薪資", v: s.driver_payout,    c: "bg-indigo-500" },
                { label: "加盟主分潤", v: s.franchise_payout, c: "bg-amber-400" },
                { label: "車輛/其他", v: s.vehicle_cost,     c: "bg-red-400" },
                { label: "平台淨利", v: Math.max(0, s.platform_profit), c: "bg-emerald-500" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${item.c}`} />
                  <span>{item.label}</span>
                  <span className="font-medium text-foreground">{NT(item.v)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="h-8 gap-1">
          <TabsTrigger value="overview" className="h-7 text-xs px-3">趨勢圖表</TabsTrigger>
          <TabsTrigger value="orders"   className="h-7 text-xs px-3">訂單明細</TabsTrigger>
          <TabsTrigger value="drivers"  className="h-7 text-xs px-3">按司機</TabsTrigger>
          <TabsTrigger value="franchisees" className="h-7 text-xs px-3">按加盟主</TabsTrigger>
        </TabsList>

        {/* ─── Overview charts ─── */}
        <TabsContent value="overview" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Trend bar chart */}
            <Card className="lg:col-span-2 border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  近 6 個月金流趨勢
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trendFormatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<CashTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="driver_payout"    name="司機薪資"   stackId="a" fill={FLOW_COLORS.driver}    radius={[0,0,0,0]} />
                    <Bar dataKey="franchise_payout" name="加盟主分潤" stackId="a" fill={FLOW_COLORS.franchise}  radius={[0,0,0,0]} />
                    <Bar dataKey="platform_profit"  name="平台淨利"   stackId="a" fill={FLOW_COLORS.platform}   radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie chart */}
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  本月收入結構
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">本月無收入資料</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%"
                        outerRadius={80} innerRadius={40}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => NT(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Revenue type split */}
          {s && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border bg-blue-50/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">企業客戶收入</p>
                  <p className="text-xl font-bold text-blue-600">{NT(s.enterprise_revenue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    佔比 {s.total_revenue > 0 ? Math.round(s.enterprise_revenue / s.total_revenue * 100) : 0}%
                  </p>
                </CardContent>
              </Card>
              <Card className="border bg-orange-50/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">散客收入</p>
                  <p className="text-xl font-bold text-orange-600">{NT(s.retail_revenue)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    佔比 {s.total_revenue > 0 ? Math.round(s.retail_revenue / s.total_revenue * 100) : 0}%
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Area chart — revenue vs platform profit */}
          {trend.length > 0 && (
            <Card className="border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-green-500" />
                  收入 vs 平台淨利走勢
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={trendFormatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<CashTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="total_revenue"  name="總收入"   stroke="#3b82f6" fill="#bfdbfe" fillOpacity={0.5} />
                    <Area type="monotone" dataKey="platform_profit" name="平台淨利" stroke="#10b981" fill="#a7f3d0" fillOpacity={0.7} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Order breakdown ─── */}
        <TabsContent value="orders" className="mt-4">
          <Card className="border">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">訂單金流明細</CardTitle>
              <span className="text-xs text-muted-foreground">共 {orderTotal} 筆有收費訂單</span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["訂單","狀態","客戶","司機","訂單金額","司機薪資","平台淨額","類型"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">本月無有效訂單資料</td></tr>
                    )}
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-muted/25 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">#{o.id}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {STATUS_TW[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[120px] truncate">{o.customer_name}</td>
                        <td className="px-3 py-2.5">{o.driver_name ?? <span className="text-muted-foreground">未派</span>}</td>
                        <td className="px-3 py-2.5 font-medium text-right">{NT(o.total_fee)}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-600">
                          {NT(o.driver_payout)}
                          <span className="text-muted-foreground ml-1">({o.driver_commission_rate}%)</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">{NT(o.platform_net)}</td>
                        <td className="px-3 py-2.5">
                          {o.enterprise_name
                            ? <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0">{o.enterprise_name}</Badge>
                            : <span className="text-muted-foreground">散客</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {orderTotal > 20 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
                  <span className="text-muted-foreground">第 {orderPage} 頁，共 {Math.ceil(orderTotal / 20)} 頁</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7" disabled={orderPage === 1}
                      onClick={() => { setOrderPage(p => p - 1); }}>上一頁</Button>
                    <Button variant="outline" size="sm" className="h-7" disabled={orderPage >= Math.ceil(orderTotal / 20)}
                      onClick={() => { setOrderPage(p => p + 1); }}>下一頁</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── By driver ─── */}
        <TabsContent value="drivers" className="mt-4">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                司機金流彙總 — {year}年{month}月
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {["司機","車型","車牌","完成訂單","業績總額","薪資比例","應得薪資","平台淨額"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {driverFlows.filter(d => Number(d.gross_revenue) > 0 || Number(d.delivered_count) > 0).map(d => (
                      <tr key={d.id} className="hover:bg-muted/25">
                        <td className="px-3 py-2.5 font-medium">{d.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{d.vehicle_type}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{d.license_plate}</td>
                        <td className="px-3 py-2.5 text-center">{d.delivered_count}</td>
                        <td className="px-3 py-2.5 text-right font-medium">{NT(d.gross_revenue)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge variant="outline" className="text-xs">{d.commission_rate}%</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right text-indigo-600 font-medium">{NT(d.driver_payout)}</td>
                        <td className="px-3 py-2.5 text-right text-green-700 font-bold">{NT(d.platform_net)}</td>
                      </tr>
                    ))}
                    {driverFlows.filter(d => Number(d.gross_revenue) > 0).length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">本月無完成訂單</td></tr>
                    )}
                  </tbody>
                  {driverFlows.filter(d => Number(d.gross_revenue) > 0).length > 0 && (
                    <tfoot className="border-t bg-muted/30">
                      <tr className="font-bold">
                        <td className="px-3 py-2.5" colSpan={4}>合計</td>
                        <td className="px-3 py-2.5 text-right">{NT(driverFlows.reduce((a, d) => a + Number(d.gross_revenue), 0))}</td>
                        <td />
                        <td className="px-3 py-2.5 text-right text-indigo-600">{NT(driverFlows.reduce((a, d) => a + Number(d.driver_payout), 0))}</td>
                        <td className="px-3 py-2.5 text-right text-green-700">{NT(driverFlows.reduce((a, d) => a + Number(d.platform_net), 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── By franchisee ─── */}
        <TabsContent value="franchisees" className="mt-4">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-500" />
                加盟主金流彙總 — {year}年{month}月
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {franFlows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Building2 className="w-8 h-8 opacity-30" />
                  <p className="text-sm">尚無合作加盟主</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        {["代碼","加盟主","分潤比","訂單數","業績總額","加盟主分潤","平台留存","月費","實際撥款","結算狀態"].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {franFlows.map(f => {
                        const settled = !!f.gross_revenue;
                        const statusColor: Record<string, string> = {
                          pending: "bg-amber-100 text-amber-700",
                          confirmed: "bg-blue-100 text-blue-700",
                          paid: "bg-green-100 text-green-700",
                        };
                        const statusTW: Record<string, string> = { pending: "待確認", confirmed: "已確認", paid: "已撥款" };
                        return (
                          <tr key={f.id} className="hover:bg-muted/25">
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{f.code}</td>
                            <td className="px-3 py-2.5 font-medium">{f.name}</td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge variant="outline" className="text-xs">{f.commission_rate}%</Badge>
                            </td>
                            <td className="px-3 py-2.5 text-center">{settled ? f.order_count ?? 0 : <span className="text-muted-foreground">未結算</span>}</td>
                            <td className="px-3 py-2.5 text-right">{settled ? NT(f.gross_revenue) : "—"}</td>
                            <td className="px-3 py-2.5 text-right text-amber-600 font-medium">{settled ? NT(f.franchisee_payout) : "—"}</td>
                            <td className="px-3 py-2.5 text-right text-muted-foreground">{settled ? NT(f.platform_fee) : "—"}</td>
                            <td className="px-3 py-2.5 text-right text-orange-500">{settled ? NT(f.net_payout !== null ? Number(f.gross_revenue ?? 0) - Number(f.net_payout ?? 0) : 0) : "—"}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-blue-700">{settled ? NT(f.net_payout) : "—"}</td>
                            <td className="px-3 py-2.5">
                              {f.status
                                ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[f.status] ?? ""}`}>{statusTW[f.status] ?? f.status}</span>
                                : <span className="text-muted-foreground text-xs">未產出</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>加盟主結算需至「加盟主」頁面手動產出月結帳單後，資料才會顯示於此處。</span>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
