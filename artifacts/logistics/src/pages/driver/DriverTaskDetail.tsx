import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import {
  MapPin, Package, User, Clock, Truck, Navigation, CheckCircle2,
  XCircle, Camera, AlertCircle, ChevronLeft, Phone, DollarSign,
  ImagePlus, Calendar,
} from "lucide-react";
import { useOrderDetail, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriverAction, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { Link } from "wouter";
import type { DriverActionType } from "@workspace/api-client-react";

export default function DriverTaskDetail() {
  const [, params] = useRoute("/driver/tasks/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params?.id || "0", 10);

  const { data: order, isLoading, error } = useOrderDetail(id);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: doDriverAction } = useDriverAction({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetOrderQueryKey(data.id), data);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      }
    }
  });

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPhotoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAction = async (action: DriverActionType) => {
    if (loading) return;
    setLoading(true);
    try {
      await doDriverAction({
        id,
        data: {
          action,
          signaturePhotoUrl: action === "complete" ? (photoPreview || null) : undefined,
        }
      });

      const actionLabels: Record<DriverActionType, string> = {
        accept: "已接單，請前往取貨地點",
        reject: "已拒單",
        checkin: "到點打卡成功，開始運送",
        complete: "配送完成！",
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
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="font-bold text-foreground text-lg">找不到此任務</p>
        <Link href="/driver/tasks">
          <Button className="mt-4 bg-orange-500 hover:bg-orange-600">返回任務列表</Button>
        </Link>
      </div>
    );
  }

  const isAssigned = order.status === "assigned";
  const isInTransit = order.status === "in_transit";
  const isDone = order.status === "delivered" || order.status === "cancelled";
  const currentDest = isInTransit ? order.deliveryAddress : order.pickupAddress;
  const currentContactName = isInTransit ? order.deliveryContactName : order.pickupContactName;
  const currentContactPerson = isInTransit ? order.deliveryContactPerson : order.pickupContactPerson;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/driver/tasks">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2 rounded-xl">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-black text-xl text-foreground">任務 #{order.id}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" />
            {format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}
          </p>
        </div>
      </div>

      {/* Active destination card */}
      {!isDone && (
        <div className={`rounded-2xl p-5 ${isInTransit ? "bg-orange-500" : "bg-blue-700"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-white/80 mb-2">
            <MapPin className="w-4 h-4 shrink-0" />
            {isInTransit ? "目的地（到貨地點）" : "取貨地點"}
          </div>
          {currentContactName && (
            <p className="text-white/80 text-sm mb-1">{currentContactName}</p>
          )}
          <p className="font-black text-white text-lg leading-snug mb-1">{currentDest}</p>
          {currentContactPerson && (
            <p className="text-white/70 text-sm mb-3">{currentContactPerson}</p>
          )}
          {order.pickupDate && !isInTransit && (
            <div className="flex items-center gap-1.5 text-white/70 text-xs mb-3">
              <Calendar className="w-3.5 h-3.5" />
              {order.pickupDate} {order.pickupTime}
            </div>
          )}
          {order.deliveryDate && isInTransit && (
            <div className="flex items-center gap-1.5 text-white/70 text-xs mb-3">
              <Calendar className="w-3.5 h-3.5" />
              {order.deliveryDate} {order.deliveryTime}
            </div>
          )}
          <button
            className="w-full bg-white/25 hover:bg-white/35 active:scale-[0.98] transition-all rounded-xl py-3 text-white font-bold flex items-center justify-center gap-2"
            onClick={openNavigation}
          >
            <Navigation className="w-4 h-4" />
            導航到{isInTransit ? "目的地" : "取貨地點"}
          </button>
        </div>
      )}

      {/* Action buttons — assigned */}
      {isAssigned && (
        <div className="grid grid-cols-2 gap-3">
          <button
            className="h-20 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-60 transition-all"
            onClick={() => handleAction("accept")}
            disabled={loading}
          >
            <CheckCircle2 className="w-7 h-7" />
            <span>接單出發</span>
          </button>
          <button
            className="h-20 bg-white border-2 border-red-200 hover:bg-red-50 active:scale-[0.98] text-red-500 rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold disabled:opacity-60 transition-all"
            onClick={() => handleAction("reject")}
            disabled={loading}
          >
            <XCircle className="w-7 h-7" />
            <span>拒絕接單</span>
          </button>
        </div>
      )}

      {/* Action buttons — in transit */}
      {isInTransit && (
        <div className="space-y-3">
          {/* Photo capture */}
          <Card className="border-2 border-dashed border-gray-200 bg-white">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-bold text-foreground flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" /> 拍照簽收（POD）
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
              {photoPreview ? (
                <div className="space-y-2">
                  <img src={photoPreview} alt="簽收照片" className="w-full rounded-xl object-cover max-h-48 border" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full text-xs text-blue-600 font-semibold py-2 rounded-lg border border-blue-200 hover:bg-blue-50"
                  >
                    重新拍攝
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50/50 active:scale-[0.98] transition-all"
                >
                  <ImagePlus className="w-6 h-6 text-gray-400" />
                  <span className="text-sm text-gray-500 font-medium">點擊拍照或選擇圖片</span>
                </button>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <button
              className="h-20 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-blue-600/20 disabled:opacity-60 transition-all"
              onClick={() => handleAction("checkin")}
              disabled={loading}
            >
              <MapPin className="w-7 h-7" />
              <span>到點打卡</span>
            </button>
            <button
              className="h-20 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-60 transition-all"
              onClick={() => handleAction("complete")}
              disabled={loading}
            >
              <CheckCircle2 className="w-7 h-7" />
              <span>完成配送</span>
            </button>
          </div>
        </div>
      )}

      {/* Done state */}
      {isDone && (
        <div className={`text-center py-6 rounded-2xl ${order.status === "delivered" ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50 border"}`}>
          <CheckCircle2 className={`w-12 h-12 mx-auto mb-2 ${order.status === "delivered" ? "text-emerald-500" : "text-gray-400"}`} />
          <p className="font-black text-lg text-emerald-800">
            {order.status === "delivered" ? "配送完成！" : "訂單已取消"}
          </p>
          {order.completedAt && (
            <p className="text-sm text-emerald-600 mt-1">完成於 {format(new Date(order.completedAt), "HH:mm")}</p>
          )}
          {order.totalFee != null && (
            <p className="text-orange-600 font-black text-xl mt-2">NT${order.totalFee.toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Route info */}
      <Card className="border bg-white">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" /> 運送路線
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-sm">
          <div>
            <p className="text-xs text-blue-600 font-bold mb-1 uppercase">收貨地點</p>
            {order.pickupContactName && <p className="font-semibold text-foreground">{order.pickupContactName}</p>}
            <p className="text-gray-700">{order.pickupAddress}</p>
            {order.pickupContactPerson && <p className="text-xs text-gray-500 mt-0.5">{order.pickupContactPerson}</p>}
            {order.pickupDate && <p className="text-xs text-gray-400 mt-0.5">{order.pickupDate} {order.pickupTime}</p>}
            {order.driverAcceptedAt && (
              <p className="text-xs text-muted-foreground mt-1">已接單 {format(new Date(order.driverAcceptedAt), "HH:mm")}</p>
            )}
          </div>
          <Separator />
          <div>
            <p className="text-xs text-orange-600 font-bold mb-1 uppercase">到貨地點</p>
            {order.deliveryContactName && <p className="font-semibold text-foreground">{order.deliveryContactName}</p>}
            <p className="text-gray-700">{order.deliveryAddress}</p>
            {order.deliveryContactPerson && <p className="text-xs text-gray-500 mt-0.5">{order.deliveryContactPerson}</p>}
            {order.deliveryDate && <p className="text-xs text-gray-400 mt-0.5">{order.deliveryDate} {order.deliveryTime}</p>}
            {order.checkInAt && (
              <p className="text-xs text-muted-foreground mt-1">到點 {format(new Date(order.checkInAt), "HH:mm")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cargo info */}
      <Card className="border bg-white">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" /> 貨物資訊
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">貨物描述</span>
            <span className="font-semibold text-right max-w-[60%]">{order.cargoDescription}</span>
          </div>
          {order.cargoQuantity && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">數量</span>
              <span className="font-semibold">{order.cargoQuantity}</span>
            </div>
          )}
          {order.cargoWeight != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">重量</span>
              <span className="font-semibold">{order.cargoWeight} kg</span>
            </div>
          )}
          {order.requiredVehicleType && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">車型需求</span>
              <span className="font-semibold">{order.requiredVehicleType}</span>
            </div>
          )}
          {order.needTailgate === "yes" && (
            <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
              <span className="text-amber-700 text-xs font-semibold">⚠ 需尾門</span>
            </div>
          )}
          {order.needHydraulicPallet === "yes" && (
            <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
              <span className="text-amber-700 text-xs font-semibold">⚠ 需油壓板車</span>
            </div>
          )}
          {order.specialRequirements && (
            <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100 text-blue-900 text-xs">
              📋 {order.specialRequirements}
            </div>
          )}
          {order.notes && (
            <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-100 text-amber-900 text-xs">
              📝 {order.notes}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer info */}
      <Card className="border bg-white">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" /> 委託方資訊
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">姓名</span>
            <span className="font-semibold">{order.customerName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">電話</span>
            <a href={`tel:${order.customerPhone}`} className="font-mono text-blue-600 font-bold flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Fee */}
      {order.totalFee != null && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-white/80" />
            <span className="font-bold">應收運費</span>
          </div>
          <span className="font-black text-2xl">NT${order.totalFee.toLocaleString()}</span>
        </div>
      )}

      {/* Signature photo */}
      {order.signaturePhotoUrl && (
        <Card className="border bg-white">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-600" /> 簽收照片
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <img src={order.signaturePhotoUrl} alt="簽收照片" className="w-full rounded-xl object-cover border" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
