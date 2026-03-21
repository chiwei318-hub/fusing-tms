import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import {
  MapPin, Package, User, Clock, Truck, Navigation, CheckCircle2,
  XCircle, Camera, AlertCircle, ChevronLeft, Phone, DollarSign,
} from "lucide-react";
import { useOrderDetail, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriverAction, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";
import type { DriverActionType } from "@workspace/api-client-react";

export default function DriverTaskDetail() {
  const [, params] = useRoute("/driver/tasks/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params?.id || "0", 10);

  const { data: order, isLoading, error } = useOrderDetail(id);

  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const { mutateAsync: doDriverAction } = useDriverAction({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetOrderQueryKey(data.id), data);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      }
    }
  });

  const handleAction = async (action: DriverActionType) => {
    if (loading) return;
    setLoading(true);
    try {
      await doDriverAction({
        id,
        data: {
          action,
          signaturePhotoUrl: action === "complete" ? (photoUrl || null) : undefined,
        }
      });

      const actionLabels: Record<DriverActionType, string> = {
        accept: "已接單，請前往取貨地點",
        reject: "已拒單",
        checkin: "到點打卡成功，開始運送",
        complete: "已完成配送！",
      };
      toast({ title: actionLabels[action] });

      if (action === "complete") {
        setTimeout(() => navigate("/driver/tasks"), 1500);
      }
    } catch {
      toast({ title: "操作失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openNavigation = () => {
    if (!order) return;
    const addr = order.status === "in_transit" ? order.deliveryAddress : order.pickupAddress;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
    window.open(url, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="font-semibold text-foreground">找不到此任務</p>
        <Link href="/driver/tasks">
          <Button className="mt-4">返回任務列表</Button>
        </Link>
      </div>
    );
  }

  const isAssigned = order.status === "assigned";
  const isInTransit = order.status === "in_transit";
  const isDone = order.status === "delivered" || order.status === "cancelled";
  const currentDest = isInTransit ? order.deliveryAddress : order.pickupAddress;

  return (
    <div className="space-y-4 pb-6">
      {/* Back + header */}
      <div className="flex items-center gap-2">
        <Link href="/driver/tasks">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-bold text-lg text-foreground">任務 #{order.id}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}
          </p>
        </div>
      </div>

      {/* Main action card */}
      {!isDone && (
        <Card className={`border-2 shadow-md ${isInTransit ? "border-amber-400 bg-amber-50/50" : "border-primary bg-primary/5"}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className={`w-4 h-4 shrink-0 ${isInTransit ? "text-amber-600" : "text-primary"}`} />
              <span className={isInTransit ? "text-amber-800" : "text-primary"}>
                {isInTransit ? "目的地（送貨）" : "取貨地點"}
              </span>
            </div>
            <p className="font-bold text-foreground text-base leading-snug">{currentDest}</p>

            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={openNavigation}
            >
              <Navigation className="w-4 h-4" /> 導航到{isInTransit ? "目的地" : "取貨地點"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {isAssigned && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-14 gap-2 bg-emerald-600 hover:bg-emerald-700 flex-col text-sm"
            onClick={() => handleAction("accept")}
            disabled={loading}
          >
            <CheckCircle2 className="w-5 h-5" />
            接單出發
          </Button>
          <Button
            variant="outline"
            className="h-14 gap-2 border-red-200 text-red-600 hover:bg-red-50 flex-col text-sm"
            onClick={() => handleAction("reject")}
            disabled={loading}
          >
            <XCircle className="w-5 h-5" />
            拒絕接單
          </Button>
        </div>
      )}

      {isInTransit && (
        <div className="space-y-3">
          <Card className="border bg-white">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" /> 上傳簽收照片網址（選填）
              </p>
              <Input
                placeholder="https://... 或貼上圖片連結"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                className="h-11"
              />
              {photoUrl && (
                <img src={photoUrl} alt="簽收照片預覽" className="w-full rounded-lg object-cover max-h-40 border" />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-14 gap-2 bg-blue-600 hover:bg-blue-700 flex-col text-sm"
              onClick={() => handleAction("checkin")}
              disabled={loading}
            >
              <MapPin className="w-5 h-5" />
              到點打卡
            </Button>
            <Button
              className="h-14 gap-2 bg-emerald-600 hover:bg-emerald-700 flex-col text-sm"
              onClick={() => handleAction("complete")}
              disabled={loading}
            >
              <CheckCircle2 className="w-5 h-5" />
              完成配送
            </Button>
          </div>
        </div>
      )}

      {isDone && (
        <div className="text-center py-4 bg-emerald-50 rounded-xl border border-emerald-200">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <p className="font-bold text-emerald-800">
            {order.status === "delivered" ? "配送完成！" : "訂單已取消"}
          </p>
          {order.completedAt && (
            <p className="text-xs text-emerald-600 mt-1">
              完成於 {format(new Date(order.completedAt), "HH:mm")}
            </p>
          )}
        </div>
      )}

      {/* Route info */}
      <Card className="border bg-white">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> 運送路線
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-sm">
          <div>
            <p className="text-xs text-primary font-semibold mb-0.5">取貨地點</p>
            <p className="font-medium">{order.pickupAddress}</p>
            {order.driverAcceptedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">已接單 {format(new Date(order.driverAcceptedAt), "HH:mm")}</p>
            )}
          </div>
          <Separator />
          <div>
            <p className="text-xs text-emerald-600 font-semibold mb-0.5">送貨地點</p>
            <p className="font-medium">{order.deliveryAddress}</p>
            {order.checkInAt && (
              <p className="text-xs text-muted-foreground mt-0.5">到點 {format(new Date(order.checkInAt), "HH:mm")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer info */}
      <Card className="border bg-white">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> 客戶資訊
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">姓名</span>
            <span className="font-semibold">{order.customerName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">電話</span>
            <a href={`tel:${order.customerPhone}`} className="font-mono text-primary font-semibold flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
            </a>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground shrink-0">貨物</span>
            <span className="font-medium text-right">{order.cargoDescription}</span>
          </div>
          {order.notes && (
            <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-100 text-amber-900 text-xs">
              📝 {order.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee info */}
      {order.totalFee != null && (
        <Card className="border bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">應收運費</span>
            </div>
            <span className="text-primary font-bold text-lg">NT${order.totalFee.toLocaleString()}</span>
          </CardContent>
        </Card>
      )}

      {/* Delivery photo */}
      {order.signaturePhotoUrl && (
        <Card className="border bg-white">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" /> 簽收照片
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <img src={order.signaturePhotoUrl} alt="簽收照片" className="w-full rounded-lg object-cover border" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
