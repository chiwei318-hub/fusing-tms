import { useMemo } from "react";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import {
  ClipboardList, Truck, Users, BarChart2, DollarSign,
  CheckCircle, Clock, AlertTriangle, TrendingUp, Zap,
  Layers, Map, Brain, Package, ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface AdminHomeProp {
  onTabChange: (tab: string) => void;
}

export default function AdminHome({ onTabChange }: AdminHomeProp) {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const { data: customers = [] } = useCustomersData();

  const today = useMemo(() => orders.filter(o => isToday(new Date(o.createdAt))), [orders]);
  const pending = useMemo(() => orders.filter(o => o.status === "pending"), [orders]);
  const inTransit = useMemo(() => orders.filter(o => o.status === "in_transit"), [orders]);
  const delivered = useMemo(() => orders.filter(o => o.status === "delivered"), [orders]);
  const weekRevenue = useMemo(() =>
    orders.filter(o => isThisWeek(new Date(o.createdAt), { weekStartsOn: 1 }))
      .reduce((s, o) => s + (o.totalFee ?? 0), 0), [orders]);
  const monthRevenue = useMemo(() =>
    orders.filter(o => isThisMonth(new Date(o.createdAt)))
      .reduce((s, o) => s + (o.totalFee ?? 0), 0), [orders]);

  const availableDrivers = drivers.filter(d => d.status === "available");
  const busyDrivers = drivers.filter(d => d.status === "busy");
  const offlineDrivers = drivers.filter(d => d.status === "offline");

  const recentOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const shortcuts = [
    { icon: ClipboardList, label: "訂單管理", sub: `${orders.length} 筆訂單`, tab: "orders", color: "bg-blue-600" },
    { icon: Truck, label: "司機管理", sub: `${drivers.length} 位司機`, tab: "drivers", color: "bg-orange-500" },
    { icon: Users, label: "客戶管理", sub: `${customers.length} 位客戶`, tab: "customers", color: "bg-purple-600" },
    { icon: BarChart2, label: "報表中心", sub: "匯出・列印", tab: "report", color: "bg-emerald-600" },
    { icon: Layers, label: "智慧調度", sub: "混載・回頭車", tab: "smart", color: "bg-cyan-600" },
    { icon: Brain, label: "AI 分析", sub: "預測・成本", tab: "ai", color: "bg-violet-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-[#1a3a8f] to-[#0d2060] rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-orange-500/10 rounded-full -mb-10" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-orange-500 p-1.5 rounded-lg">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="text-orange-300 text-xs font-bold uppercase tracking-widest">富詠運輸後台</span>
          </div>
          <h1 className="text-2xl font-black leading-tight">派車管理中心</h1>
          <p className="text-blue-200 text-sm mt-1.5">{format(new Date(), "yyyy年MM月dd日")} · 今日 {today.length} 筆訂單</p>
        </div>

        {/* Alert strip if pending */}
        {pending.length > 0 && (
          <div
            className="mt-4 bg-orange-500/20 border border-orange-400/40 rounded-xl px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-orange-500/30 transition-colors"
            onClick={() => onTabChange("orders")}
          >
            <AlertTriangle className="w-4 h-4 text-orange-300 shrink-0" />
            <span className="text-orange-100 text-sm font-semibold">
              {pending.length} 筆訂單待派車
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-orange-300 ml-auto" />
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: ClipboardList, label: "本週訂單", value: orders.filter(o => isThisWeek(new Date(o.createdAt), { weekStartsOn: 1 })).length, sub: "筆", color: "text-blue-600 bg-blue-50" },
          { icon: DollarSign, label: "本月營收", value: `NT$${(monthRevenue / 1000).toFixed(1)}k`, sub: "", color: "text-emerald-600 bg-emerald-50" },
          { icon: Clock, label: "待派車", value: pending.length, sub: "筆", color: pending.length > 0 ? "text-orange-600 bg-orange-50" : "text-muted-foreground bg-muted/30" },
          { icon: Truck, label: "運送中", value: inTransit.length, sub: "筆", color: "text-primary bg-primary/10" },
        ].map(m => (
          <Card key={m.label} className={`p-4 ${m.color.split(" ")[1]}`}>
            <div className="flex items-center gap-2 mb-1">
              <m.icon className={`w-4 h-4 ${m.color.split(" ")[0]}`} />
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            <div className={`text-2xl font-black ${m.color.split(" ")[0]}`}>
              {m.value}<span className="text-sm font-normal ml-0.5">{m.sub}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Driver status + Recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Driver status */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-primary" /> 司機狀態
            </h3>
            <button className="text-xs text-primary hover:underline" onClick={() => onTabChange("drivers")}>
              全部 →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "可接單", count: availableDrivers.length, color: "bg-emerald-50 text-emerald-700" },
              { label: "忙碌中", count: busyDrivers.length, color: "bg-orange-50 text-orange-700" },
              { label: "下線", count: offlineDrivers.length, color: "bg-slate-50 text-slate-500" },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
                <div className="text-2xl font-black">{s.count}</div>
                <div className="text-xs font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {drivers.slice(0, 6).map(d => (
              <div key={d.id} className="flex items-center gap-3 text-sm py-1 border-b border-muted last:border-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs shrink-0">
                  {d.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{d.vehicleType} · {d.licensePlate}</div>
                </div>
                <Badge className={`text-xs shrink-0 ${d.status === "available" ? "bg-emerald-100 text-emerald-800" : d.status === "busy" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-500"}`}>
                  {d.status === "available" ? "可接單" : d.status === "busy" ? "忙碌" : "下線"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent orders */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-primary" /> 最新訂單
            </h3>
            <button className="text-xs text-primary hover:underline" onClick={() => onTabChange("orders")}>
              全部 →
            </button>
          </div>
          <div className="space-y-2">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">尚無訂單</p>
            ) : recentOrders.map(o => (
              <div key={o.id} className="flex items-center gap-3 py-2 border-b border-muted last:border-0">
                <span className="font-mono text-xs text-muted-foreground w-7">#{o.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{o.customerName}</div>
                  <div className="text-xs text-muted-foreground truncate">{o.cargoDescription}</div>
                </div>
                <Badge className={`text-xs shrink-0 ${STATUS_COLORS[o.status] ?? ""}`}>
                  {STATUS_LABELS[o.status] ?? o.status}
                </Badge>
                {o.totalFee && (
                  <span className="text-xs font-bold text-primary shrink-0">NT${o.totalFee.toLocaleString()}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick shortcuts */}
      <div>
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-widest mb-3">功能快捷</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {shortcuts.map(s => (
            <button
              key={s.tab}
              onClick={() => onTabChange(s.tab)}
              className="flex items-center gap-3 p-4 bg-white rounded-2xl border hover:border-primary/30 hover:shadow-md transition-all active:scale-[0.98] text-left"
            >
              <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-sm">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Order status breakdown */}
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" /> 訂單狀態分佈
        </h3>
        <div className="space-y-2">
          {Object.entries(STATUS_LABELS).map(([status, label]) => {
            const count = orders.filter(o => o.status === status).length;
            const pct = orders.length > 0 ? Math.round((count / orders.length) * 100) : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold w-16 text-center shrink-0 ${STATUS_COLORS[status]}`}>{label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-14 text-right shrink-0">{count} 筆 ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
