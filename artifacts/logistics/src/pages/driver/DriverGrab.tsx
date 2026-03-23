import { useState } from "react";
import { Link, useLocation } from "wouter";
import { format, parseISO, isValid } from "date-fns";
import {
  Zap, Package, Clock, Truck, User,
  RefreshCw, Navigation, AlertCircle,
} from "lucide-react";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDriversData } from "@/hooks/use-drivers";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function getPickupTimestamp(order: any): number {
  if (order.pickupDate) {
    const dt = `${order.pickupDate}${order.pickupTime ? "T" + order.pickupTime : "T00:00"}`;
    const parsed = parseISO(dt);
    if (isValid(parsed)) return parsed.getTime();
  }
  return new Date(order.createdAt).getTime();
}

export default function DriverGrab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: drivers } = useDriversData();
  const selectedDriver = drivers?.find(d => d.id === user?.id);
  const [grabbingId, setGrabbingId] = useState<number | null>(null);

  const { data: orders, isLoading, refetch, isFetching } = useListOrders(
    { status: "pending" } as any,
    { query: { refetchInterval: 8000 } }
  );

  const pendingOrders = (orders ?? [])
    .filter(o => o.status === "pending" && o.driverId == null)
    .sort((a, b) => getPickupTimestamp(a) - getPickupTimestamp(b));

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

  const handleGrab = async (orderId: number) => {
    if (!user?.id || grabbingId != null) return;
    setGrabbingId(orderId);
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${orderId}/grab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "搶單失敗");
      }
      toast({
        title: "搶單成功！",
        description: "訂單已指派給您，請立即前往取貨",
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      navigate(`/driver/tasks/${orderId}`);
    } catch (err: any) {
      toast({ title: "無法搶單", description: err?.message ?? "訂單可能已被接走", variant: "destructive" });
      refetch();
    } finally {
      setGrabbingId(null);
    }
  };

  const isVehicleMatch = (required: string | null | undefined) => {
    if (!required || !selectedDriver) return true;
    return selectedDriver.vehicleType === required;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" /> 搶單中心
          </h1>
          {selectedDriver && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedDriver.name} · {selectedDriver.vehicleType}
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl hover:bg-muted/50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* Live status bar */}
      <div className="flex items-center gap-2 text-xs text-orange-600 font-medium bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
        </span>
        <span>
          每 8 秒自動更新 ·&nbsp;
          {isLoading ? "載入中…" : (
            pendingOrders.length > 0
              ? <strong>{pendingOrders.length} 筆</strong>
              : "目前無"
          )}
          {!isLoading && " 待接訂單"}
        </span>
        {isFetching && !isLoading && <RefreshCw className="w-3 h-3 animate-spin ml-auto" />}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : pendingOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Truck className="w-8 h-8 text-orange-300" />
          </div>
          <p className="font-bold text-foreground">目前無待接訂單</p>
          <p className="text-sm text-muted-foreground mt-1">有新訂單時系統將自動更新</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingOrders.map(order => {
            const matched = isVehicleMatch(order.requiredVehicleType);
            return (
              <Card
                key={order.id}
                className={`rounded-2xl border shadow-sm bg-white overflow-hidden transition-all ${
                  !matched ? "opacity-60" : "border-transparent"
                }`}
              >
                <CardContent className="p-0">
                  {/* Top accent bar - urgent orders show differently */}
                  <div className={`h-1 w-full ${matched ? "bg-orange-400" : "bg-gray-200"}`} />

                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-black text-foreground text-base">#{order.id}</span>
                        {order.requiredVehicleType && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            matched
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}>
                            {order.requiredVehicleType}
                            {!matched && " ⚠ 車型不符"}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {order.pickupDate
                            ? `${order.pickupDate}${order.pickupTime ? " " + order.pickupTime : ""}`
                            : format(new Date(order.createdAt), "MM/dd HH:mm")}
                        </span>
                      </div>
                      {order.totalFee != null ? (
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-black text-orange-500 text-lg leading-tight">NT${order.totalFee.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">預估費用</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground bg-gray-50 px-2 py-1 rounded-lg shrink-0 ml-2">待報價</span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="space-y-1.5 text-sm mb-3 bg-slate-50 rounded-xl p-3">
                      <div className="flex gap-2.5 items-start">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-muted-foreground">取貨地點</p>
                          <p className="text-gray-800 font-medium text-sm line-clamp-1">
                            {order.pickupContactName ? `${order.pickupContactName}｜` : ""}{order.pickupAddress}
                          </p>
                        </div>
                      </div>
                      <div className="ml-[5px] w-px h-2 bg-gray-300" />
                      <div className="flex gap-2.5 items-start">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-muted-foreground">送達地點</p>
                          <p className="text-gray-800 font-medium text-sm line-clamp-1">
                            {order.deliveryContactName ? `${order.deliveryContactName}｜` : ""}{order.deliveryAddress}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Cargo + weight */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                      <span className="flex items-center gap-1 min-w-0 truncate">
                        <Package className="w-3 h-3 shrink-0" />
                        {order.cargoDescription || "—"}
                      </span>
                      {(order.cargoWeight ?? 0) > 0 && (
                        <span className="flex items-center gap-1 shrink-0">
                          <Navigation className="w-3 h-3" />
                          {order.cargoWeight} kg
                        </span>
                      )}
                    </div>

                    {/* Grab button */}
                    {!matched ? (
                      <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        此訂單需要「{order.requiredVehicleType}」，您的車型（{selectedDriver?.vehicleType}）不符
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleGrab(order.id)}
                        disabled={grabbingId != null}
                        className="w-full h-12 text-base font-black bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-md shadow-orange-500/20 active:scale-[0.97] transition-all"
                      >
                        {grabbingId === order.id ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" /> 搶單中…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Zap className="w-4 h-4" /> 我要接單
                          </span>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
