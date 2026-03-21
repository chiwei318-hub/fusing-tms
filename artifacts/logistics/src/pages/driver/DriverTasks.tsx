import { Link } from "wouter";
import { format } from "date-fns";
import { Truck, MapPin, Package, Clock, ChevronRight, AlertCircle, User } from "lucide-react";
import { useListOrders } from "@workspace/api-client-react";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/use-mobile";
import { useDriversData } from "@/hooks/use-drivers";

const STATUS_PRIORITY: Record<string, number> = {
  assigned: 0,
  in_transit: 1,
  pending: 2,
  delivered: 3,
  cancelled: 4,
};

export default function DriverTasks() {
  const [selectedId] = useLocalStorage<number | null>("driver-session-id", null);
  const { data: drivers } = useDriversData();
  const selectedDriver = drivers?.find(d => d.id === selectedId);

  const { data: orders, isLoading } = useListOrders(
    selectedId ? { driverId: selectedId } : undefined,
    { query: { enabled: !!selectedId, refetchInterval: 30000 } }
  );

  const sortedOrders = orders
    ? [...orders].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99))
    : [];

  if (!selectedId) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="font-semibold text-foreground">請先選擇身份</p>
        <p className="text-sm text-muted-foreground mt-1">返回首頁選擇您的司機帳號</p>
        <Link href="/driver">
          <div className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium gap-2">
            <User className="w-4 h-4" /> 前往選擇
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">我的任務</h1>
          {selectedDriver && (
            <p className="text-sm text-muted-foreground mt-0.5">{selectedDriver.name} 的派車紀錄</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{sortedOrders.length}</p>
          <p className="text-xs text-muted-foreground">筆任務</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "待接單", count: sortedOrders.filter(o => o.status === "assigned").length, color: "bg-blue-50 text-blue-700" },
          { label: "運送中", count: sortedOrders.filter(o => o.status === "in_transit").length, color: "bg-amber-50 text-amber-700" },
          { label: "已完成", count: sortedOrders.filter(o => o.status === "delivered").length, color: "bg-emerald-50 text-emerald-700" },
        ].map(({ label, count, color }) => (
          <div key={label} className={`${color} rounded-xl p-3 text-center`}>
            <p className="text-xl font-bold">{count}</p>
            <p className="text-xs font-medium">{label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : sortedOrders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border">
          <Truck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-foreground">目前沒有派車任務</p>
          <p className="text-sm text-muted-foreground mt-1">等待後台分配訂單給您</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOrders.map(order => (
            <Link key={order.id} href={`/driver/tasks/${order.id}`}>
              <Card className={`border cursor-pointer hover:shadow-md transition-all
                ${order.status === "assigned" ? "border-blue-200 bg-blue-50/30" :
                  order.status === "in_transit" ? "border-amber-200 bg-amber-50/30" :
                  "border bg-white"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <span className="font-mono font-bold text-foreground">訂單 #{order.id}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(order.createdAt), "MM/dd HH:mm")}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <div className="space-y-1.5 text-sm mb-3">
                    <div className="flex gap-2 items-start">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground line-clamp-1">{order.pickupAddress}</span>
                    </div>
                    <div className="flex gap-2 items-start">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground line-clamp-1">{order.deliveryAddress}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Package className="w-3 h-3" />
                      <span className="truncate max-w-[160px]">{order.cargoDescription}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
