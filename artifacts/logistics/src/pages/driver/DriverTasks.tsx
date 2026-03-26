import { Link } from "wouter";
import { format, isToday } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Truck, MapPin, Package, Clock, ChevronRight, User, CheckCircle, Zap, Navigation, TrendingUp } from "lucide-react";
import { useListOrders } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDriversData } from "@/hooks/use-drivers";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

type Tab = "active" | "done";

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  assigned:   { label: "待取貨", bg: "bg-blue-100",   text: "text-blue-700" },
  in_transit: { label: "運送中", bg: "bg-orange-100", text: "text-orange-700" },
  delivered:  { label: "已完成", bg: "bg-emerald-100",text: "text-emerald-700" },
  cancelled:  { label: "已取消", bg: "bg-gray-100",   text: "text-gray-500" },
  pending:    { label: "待派車", bg: "bg-yellow-100", text: "text-yellow-700" },
};

export default function DriverTasks() {
  const [tab, setTab] = useState<Tab>("active");
  const { user } = useAuth();
  const { data: drivers } = useDriversData();
  const selectedDriver = drivers?.find(d => d.id === user?.id);

  const { data: orders, isLoading } = useListOrders(
    user?.id ? { driverId: user.id } : undefined,
    { query: { enabled: !!user?.id, refetchInterval: 20000 } }
  );

  if (!user?.id) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <p className="font-bold text-foreground text-lg">請先選擇身份</p>
          <p className="text-sm text-muted-foreground mt-1">返回首頁選擇您的司機帳號</p>
        </div>
        <Link href="/driver">
          <div className="mt-2 inline-flex items-center px-6 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold gap-2 shadow-lg shadow-orange-500/30">
            <User className="w-4 h-4" /> 選擇帳號
          </div>
        </Link>
      </div>
    );
  }

  const allOrders = orders ?? [];
  const activeOrders = allOrders
    .filter(o => o.status === "assigned" || o.status === "in_transit")
    .sort((a, b) => {
      if (a.status === "in_transit" && b.status !== "in_transit") return -1;
      if (a.status !== "in_transit" && b.status === "in_transit") return 1;
      return 0;
    });

  const doneOrders = allOrders
    .filter(o => o.status === "delivered" || o.status === "cancelled")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const todayDone = doneOrders.filter(o => o.status === "delivered" && isToday(new Date(o.updatedAt)));
  const todayEarnings = todayDone.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);
  const weekDone = doneOrders.filter(o => o.status === "delivered").slice(0, 30);
  const weekEarnings = weekDone.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);

  const displayOrders = tab === "active" ? activeOrders : doneOrders;

  return (
    <div className="space-y-4">
      {/* Header with driver name */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-foreground">任務中心</h1>
          {selectedDriver && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedDriver.name} · {selectedDriver.licensePlate}
            </p>
          )}
        </div>
        {activeOrders.length > 0 && (
          <span className="inline-flex items-center gap-1 bg-orange-500 text-white text-xs font-black px-2.5 py-1 rounded-full animate-pulse">
            <Zap className="w-3 h-3" /> {activeOrders.length} 任務中
          </span>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
          <Zap className="w-4 h-4 text-orange-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-orange-600">{activeOrders.length}</p>
          <p className="text-xs text-orange-500 font-medium">進行中</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
          <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
          <p className="text-2xl font-black text-emerald-700">{todayDone.length}</p>
          <p className="text-xs text-emerald-600 font-medium">今日完成</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
          <TrendingUp className="w-4 h-4 text-blue-600 mx-auto mb-1" />
          <p className="text-sm font-black text-blue-700 leading-tight">
            {todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : "—"}
          </p>
          <p className="text-xs text-blue-600 font-medium">今日收入</p>
        </div>
      </div>

      {/* Today active banner */}
      {activeOrders.length > 0 && (
        <Link href={`/driver/tasks/${activeOrders[0].id}`}>
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/30">
            <div className="relative">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                {activeOrders[0].status === "in_transit"
                  ? <Navigation className="w-5 h-5 text-white" />
                  : <Package className="w-5 h-5 text-white" />}
              </div>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-white rounded-full border-2 border-orange-500 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-sm">
                {activeOrders[0].status === "in_transit" ? "🚛 運送中 — 前往送貨地點" : "📦 待取貨 — 前往取貨地點"}
              </p>
              <p className="text-orange-100 text-xs mt-0.5 truncate">
                訂單 #{activeOrders[0].id} · {activeOrders[0].pickupAddress}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
          </div>
        </Link>
      )}

      {/* Tabs */}
      <div className="flex bg-muted p-1 rounded-xl gap-1">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "active"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          進行中
          {activeOrders.length > 0 && (
            <span className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs
              ${tab === "active" ? "bg-orange-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
              {activeOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("done")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "done"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          歷史紀錄
          {tab === "done" && doneOrders.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground font-normal">({doneOrders.length})</span>
          )}
        </button>
      </div>

      {/* Weekly earnings in done tab */}
      {tab === "done" && weekDone.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white">
          <p className="text-emerald-200 text-xs font-bold uppercase tracking-wide mb-1">最近完成總收入</p>
          <p className="text-3xl font-black">NT${weekEarnings.toLocaleString()}</p>
          <p className="text-emerald-200 text-xs mt-1">{weekDone.length} 筆完成訂單 · 點訂單查看詳情</p>
        </div>
      )}

      {/* Order list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border">
          {tab === "active" ? (
            <>
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Truck className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="font-bold text-foreground">目前沒有進行中任務</p>
              <p className="text-sm text-muted-foreground mt-1">等待後台指派訂單給您</p>
              <Link href="/driver/grab">
                <div className="mt-4 inline-flex items-center gap-2 bg-orange-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/30">
                  <Zap className="w-4 h-4" /> 前往搶單中心
                </div>
              </Link>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="font-bold text-foreground">尚無歷史紀錄</p>
              <p className="text-sm text-muted-foreground mt-1">完成第一筆訂單後將顯示於此</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayOrders.map(order => {
            const isActive = order.status === "assigned" || order.status === "in_transit";
            const isInTransit = order.status === "in_transit";
            const meta = STATUS_META[order.status] ?? STATUS_META.pending;
            return (
              <Link key={order.id} href={`/driver/tasks/${order.id}`}>
                <Card className={`border-2 cursor-pointer active:scale-[0.98] transition-all shadow-sm
                  ${isInTransit ? "border-orange-300 bg-orange-50/60 dark:bg-orange-950/20 shadow-orange-100" :
                    order.status === "assigned" ? "border-blue-200 bg-blue-50/30 dark:bg-blue-950/10" :
                    order.status === "delivered" ? "border-emerald-100 bg-card" :
                    "border-border bg-card opacity-70"}`}>
                  <CardContent className="p-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-foreground">#{order.id}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                            {meta.label}
                          </span>
                          {isInTransit && (
                            <span className="flex items-center gap-1 text-xs text-orange-600 font-bold animate-pulse">
                              <Navigation className="w-3 h-3" /> 進行中
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {order.pickupDate
                            ? `${order.pickupDate} ${order.pickupTime ?? ""}`
                            : format(new Date(order.createdAt), "MM/dd HH:mm", { locale: zhTW })}
                        </p>
                      </div>
                      {order.totalFee != null && (
                        <div className="text-right shrink-0">
                          <span className="font-black text-orange-600">NT${order.totalFee.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Route with vertical line */}
                    <div className="relative pl-5 space-y-1 mb-3">
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-blue-400 to-orange-400" />
                      <div className="flex gap-2 items-center">
                        <div className="absolute left-[3px] w-2 h-2 rounded-full bg-blue-500 border-2 border-background" />
                        <span className="text-sm text-foreground line-clamp-1">
                          {order.pickupContactName ? `${order.pickupContactName}｜` : ""}{order.pickupAddress}
                        </span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="absolute left-[3px] w-2 h-2 rounded-full bg-orange-500 border-2 border-background" style={{ bottom: "0" }} />
                        <span className="text-sm text-foreground line-clamp-1">
                          {order.deliveryContactName ? `${order.deliveryContactName}｜` : ""}{order.deliveryAddress}
                        </span>
                      </div>
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Package className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[200px]">
                          {order.cargoDescription}{order.cargoQuantity ? ` · ${order.cargoQuantity}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>詳情</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
