import { Link } from "wouter";
import { format, isToday } from "date-fns";
import { Truck, MapPin, Package, Clock, ChevronRight, AlertCircle, User, CheckCircle, Zap } from "lucide-react";
import { useListOrders } from "@workspace/api-client-react";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDriversData } from "@/hooks/use-drivers";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

type Tab = "active" | "done";

const STATUS_LABEL: Record<string, string> = {
  assigned: "待接單",
  in_transit: "運送中",
  delivered: "已完成",
  cancelled: "已取消",
  pending: "待派車",
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
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-gray-400" />
        </div>
        <p className="font-bold text-foreground text-lg">請先選擇身份</p>
        <p className="text-sm text-muted-foreground mt-1">返回首頁選擇您的司機帳號</p>
        <Link href="/driver">
          <div className="mt-5 inline-flex items-center px-5 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold gap-2 shadow-lg shadow-orange-500/30">
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

  const todayDone = doneOrders.filter(o => isToday(new Date(o.updatedAt)));
  const todayEarnings = todayDone.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);

  const displayOrders = tab === "active" ? activeOrders : doneOrders;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-foreground">任務中心</h1>
          {selectedDriver && (
            <p className="text-sm text-muted-foreground mt-0.5">{selectedDriver.name}</p>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
          <Zap className="w-4 h-4 text-orange-500 mx-auto mb-1" />
          <p className="text-xl font-black text-orange-600">{activeOrders.length}</p>
          <p className="text-xs text-orange-500 font-medium">進行中</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
          <p className="text-xl font-black text-emerald-700">{todayDone.length}</p>
          <p className="text-xs text-emerald-600 font-medium">今日完成</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <Package className="w-4 h-4 text-blue-600 mx-auto mb-1" />
          <p className="text-base font-black text-blue-700">{todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : "—"}</p>
          <p className="text-xs text-blue-600 font-medium">今日收入</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "active"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          進行中 {activeOrders.length > 0 && (
            <span className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs
              ${tab === "active" ? "bg-orange-500 text-white" : "bg-gray-300 text-gray-600"}`}>
              {activeOrders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("done")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
            tab === "done"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          歷史紀錄
        </button>
      </div>

      {/* Order list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border">
          {tab === "active" ? (
            <>
              <Truck className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="font-bold text-gray-700">目前沒有進行中任務</p>
              <p className="text-sm text-gray-400 mt-1">等待後台指派訂單給您</p>
            </>
          ) : (
            <>
              <CheckCircle className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="font-bold text-gray-700">尚無歷史紀錄</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayOrders.map(order => {
            const isActive = order.status === "assigned" || order.status === "in_transit";
            const isInTransit = order.status === "in_transit";
            return (
              <Link key={order.id} href={`/driver/tasks/${order.id}`}>
                <Card className={`border-2 cursor-pointer active:scale-[0.98] transition-all shadow-sm
                  ${isInTransit ? "border-orange-300 bg-orange-50/50 shadow-orange-100" :
                    order.status === "assigned" ? "border-blue-200 bg-blue-50/30" :
                    order.status === "delivered" ? "border-emerald-100 bg-white" :
                    "border-gray-100 bg-white"}`}>
                  <CardContent className="p-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-foreground text-base">#{order.id}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                            ${isInTransit ? "bg-orange-100 text-orange-700" :
                              order.status === "assigned" ? "bg-blue-100 text-blue-700" :
                              order.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                              "bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABEL[order.status]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {order.pickupDate ? `${order.pickupDate} ${order.pickupTime ?? ""}` : format(new Date(order.createdAt), "MM/dd HH:mm")}
                        </p>
                      </div>
                      {order.totalFee != null && (
                        <span className="font-black text-orange-600 text-base">NT${order.totalFee.toLocaleString()}</span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="space-y-1.5 text-sm mb-3">
                      <div className="flex gap-2 items-start">
                        <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                        <span className="text-gray-700 line-clamp-1">
                          {order.pickupContactName ? `${order.pickupContactName}｜` : ""}{order.pickupAddress}
                        </span>
                      </div>
                      <div className="ml-[3px] w-px h-2 bg-gray-200 ml-[3.5px]" />
                      <div className="flex gap-2 items-start">
                        <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1.5" />
                        <span className="text-gray-700 line-clamp-1">
                          {order.deliveryContactName ? `${order.deliveryContactName}｜` : ""}{order.deliveryAddress}
                        </span>
                      </div>
                    </div>

                    {/* Bottom row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span className="truncate max-w-[180px]">{order.cargoDescription}{order.cargoQuantity ? ` · ${order.cargoQuantity}` : ""}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
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
