import { useEffect, useState, useMemo } from "react";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import {
  ClipboardList, Truck, Users, BarChart2, DollarSign,
  CheckCircle, Clock, AlertTriangle, TrendingUp, Zap,
  Layers, Map, Brain, Package, Star, Settings,
  Activity, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrdersData } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { useCustomersData } from "@/hooks/use-customers";

const STATUS_LABELS: Record<string, string> = {
  pending: "待派車", assigned: "已派車", in_transit: "運送中",
  delivered: "已完成", cancelled: "已取消",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  assigned: "bg-blue-100 text-blue-800",
  in_transit: "bg-orange-100 text-orange-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-500",
};
const CHART_COLORS = ["#1a3a8f", "#f97316", "#10b981", "#a855f7", "#06b6d4", "#ef4444"];

interface StatsOverview {
  orders: {
    today_orders: string; pending_orders: string; in_transit_orders: string;
    today_delivered: string; today_revenue: string; month_revenue: string; month_delivered: string;
  };
  drivers: { available: string; busy: string; offline: string; total: string };
  trend: { day: string; order_count: string; revenue: string }[];
  vehicleBreakdown: { vehicle_type: string; order_count: string; revenue: string }[];
  ratings: { avg_rating: string; total_ratings: string } | null;
}

interface AdminHomeProp { onTabChange: (tab: string) => void }

export default function AdminHome({ onTabChange }: AdminHomeProp) {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const { data: customers = [] } = useCustomersData();
  const [stats, setStats] = useState<StatsOverview | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/system-config/stats/overview");
      const data = await res.json();
      setStats(data);
    } catch { /* silent */ }
  };
  useEffect(() => { fetchStats(); }, []);

  const today = useMemo(() => orders.filter(o => isToday(new Date(o.createdAt))), [orders]);
  const pending = useMemo(() => orders.filter(o => o.status === "pending"), [orders]);
  const inTransit = useMemo(() => orders.filter(o => o.status === "in_transit"), [orders]);
  const weekRevenue = useMemo(() =>
    orders.filter(o => isThisWeek(new Date(o.createdAt), { weekStartsOn: 1 }))
      .reduce((s, o) => s + (o.totalFee ?? 0), 0), [orders]);
  const monthRevenue = useMemo(() =>
    orders.filter(o => isThisMonth(new Date(o.createdAt)))
      .reduce((s, o) => s + (o.totalFee ?? 0), 0), [orders]);

  const availableDrivers = drivers.filter(d => d.status === "available");
  const busyDrivers = drivers.filter(d => d.status === "busy");
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const trendData = stats?.trend.map(t => ({
    date: t.day?.slice(5) ?? "",
    訂單數: Number(t.order_count),
    營收: Math.round(Number(t.revenue)),
  })) ?? [];
  const vehicleData = (stats?.vehicleBreakdown ?? []).map(v => ({
    name: v.vehicle_type || "未指定", value: Number(v.order_count), revenue: Number(v.revenue),
  }));
  const driverPieData = [
    { name: "可接單", value: availableDrivers.length, color: "#10b981" },
    { name: "派送中", value: busyDrivers.length, color: "#f97316" },
    { name: "離線", value: drivers.filter(d => d.status === "offline").length, color: "#6b7280" },
  ].filter(d => d.value > 0);

  const shortcuts = [
    { icon: ClipboardList, label: "訂單管理", sub: `${orders.length} 筆`, tab: "orders", color: "bg-blue-600" },
    { icon: Truck, label: "司機管理", sub: `${drivers.length} 位`, tab: "drivers", color: "bg-orange-500" },
    { icon: Users, label: "客戶管理", sub: `${customers.length} 位`, tab: "customers", color: "bg-purple-600" },
    { icon: BarChart2, label: "報表中心", sub: "匯出・列印", tab: "report", color: "bg-emerald-600" },
    { icon: Layers, label: "智慧調度", sub: "混載・回頭車", tab: "smart", color: "bg-cyan-600" },
    { icon: Brain, label: "AI 分析", sub: "預測・成本", tab: "ai", color: "bg-violet-600" },
    { icon: Settings, label: "系統設定", sub: "費率・自動派車", tab: "system", color: "bg-gray-600" },
    { icon: Map, label: "車隊地圖", sub: "即時位置", tab: "fleetmap", color: "bg-teal-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#1a3a8f] to-[#0d2060] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-orange-500/10 rounded-full -mb-10" />
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-orange-500 p-1.5 rounded-lg"><Truck className="w-4 h-4 text-white" /></div>
              <span className="text-orange-300 text-xs font-bold uppercase tracking-widest">富詠運輸後台</span>
            </div>
            <h1 className="text-2xl font-black leading-tight">全自動物流管理中心</h1>
            <p className="text-blue-200 text-sm mt-1.5">
              {format(new Date(), "yyyy年MM月dd日")} · 今日 {today.length} 筆訂單
            </p>
          </div>
          <Button size="sm" variant="ghost" className="text-blue-200 hover:text-white hover:bg-white/10" onClick={fetchStats}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />更新
          </Button>
        </div>
        {pending.length > 0 && (
          <div className="relative z-10 mt-4 flex items-center gap-2 bg-yellow-400/20 border border-yellow-400/40 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-yellow-300 shrink-0" />
            <span className="text-yellow-200 text-xs font-medium">
              {pending.length} 筆訂單待派車 —{" "}
              <button className="underline hover:text-white" onClick={() => onTabChange("dispatcher")}>
                立即前往派單
              </button>
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "今日訂單", value: today.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50", sub: `待派車 ${pending.length}` },
          { label: "運送中", value: inTransit.length, icon: Truck, color: "text-orange-500", bg: "bg-orange-50", sub: `可用司機 ${availableDrivers.length}` },
          { label: "本週接單金額", value: `NT$ ${weekRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50", sub: "本週所有訂單運費合計" },
          { label: "本月接單金額", value: `NT$ ${monthRevenue.toLocaleString()}`, icon: DollarSign, color: "text-violet-600", bg: "bg-violet-50", sub: `${stats ? Number(stats.orders.month_delivered) : 0} 筆已完成‧含進行中` },
        ].map(({ label, value, icon: Icon, color, bg, sub }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-xl font-black mt-0.5">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
                </div>
                <div className={`p-2.5 rounded-xl ${bg}`}><Icon className={`w-5 h-5 ${color}`} /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />近 7 日訂單 &amp; 營收趨勢
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">暫無趨勢資料</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number, name: string) =>
                    name === "營收" ? [`NT$ ${value.toLocaleString()}`, name] : [value, name]} />
                  <Line yAxisId="left" type="monotone" dataKey="訂單數" stroke="#1a3a8f" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="營收" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-500" />司機狀態分佈
            </CardTitle>
          </CardHeader>
          <CardContent>
            {driverPieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">暫無司機資料</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={driverPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                      dataKey="value" paddingAngle={3}>
                      {driverPieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {driverPieData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name} <span className="font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {vehicleData.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-600" />本月各車型訂單數量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={vehicleData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v: number) => [v, "訂單數"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {vehicleData.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Shortcuts */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">快速導航</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {shortcuts.map(({ icon: Icon, label, sub, tab, color }) => (
            <button key={label} onClick={() => onTabChange(tab)}
              className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all text-left">
              <div className={`${color} p-2 rounded-lg`}><Icon className="w-4 h-4 text-white" /></div>
              <div>
                <p className="text-sm font-semibold leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent + Platform KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">最新訂單</h3>
          <div className="space-y-2">
            {recentOrders.map(o => (
              <div key={o.id} className="flex items-center gap-3 p-3 bg-card border border-border/50 rounded-xl">
                <div className="text-xs font-mono text-muted-foreground w-10 shrink-0">#{o.id}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.pickupAddress} → {o.deliveryAddress}</p>
                  <p className="text-xs text-muted-foreground">{o.customerName} · {format(new Date(o.createdAt), "MM/dd HH:mm")}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100"}`}>
                  {STATUS_LABELS[o.status] ?? o.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">平台指標</h3>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-4">
              {[
                {
                  label: "司機平均評分",
                  value: stats?.ratings?.avg_rating ? `${Number(stats.ratings.avg_rating).toFixed(1)} ★` : "尚無評分",
                  sub: `共 ${stats?.ratings?.total_ratings ?? 0} 則評價`,
                  icon: Star, color: "text-yellow-500",
                },
                {
                  label: "今日完成率",
                  value: today.length > 0
                    ? `${Math.round((today.filter(o => o.status === "delivered").length / today.length) * 100)}%`
                    : "—",
                  sub: `${today.filter(o => o.status === "delivered").length} / ${today.length} 筆`,
                  icon: CheckCircle, color: "text-emerald-600",
                },
                {
                  label: "可用司機比例",
                  value: drivers.length > 0
                    ? `${Math.round((availableDrivers.length / drivers.length) * 100)}%`
                    : "—",
                  sub: `${availableDrivers.length} 位可接單`,
                  icon: Zap, color: "text-blue-600",
                },
              ].map(({ label, value, sub, icon: Icon, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color} shrink-0`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-base font-bold">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
