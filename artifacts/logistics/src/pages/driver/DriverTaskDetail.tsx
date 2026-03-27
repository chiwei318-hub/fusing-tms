import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import {
  MapPin, Package, User, Clock, Truck, Navigation, CheckCircle2,
  XCircle, Camera, AlertCircle, ChevronLeft, Phone, DollarSign,
  ImagePlus, Calendar, AlertTriangle, WrenchIcon, PlayCircle,
} from "lucide-react";
import PricingPanel from "@/components/PricingPanel";
import { useOrderDetail, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriverAction, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { DriverActionType } from "@workspace/api-client-react";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";

const EXCEPTION_CODES: Record<string, string> = {
  E01: "客戶不在現場",
  E02: "貨物未備妥",
  E03: "地址錯誤/無法進入",
  E04: "貨物超重/超尺寸",
  E05: "道路塞車/管制",
  E06: "車輛故障",
  E07: "氣候因素",
  E08: "司機健康因素",
  E09: "貨物損毀（司機責任）",
  E10: "交通事故",
  E11: "等候費（超過15分鐘）",
  E99: "其他（備註說明）",
};

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface ExtraStop {
  address: string;
  contactName?: string;
  phone?: string;
  company?: string;
  notes?: string;
  quantity?: number;
  weight?: number;
  signStatus?: string;
}

function parseStops(raw: unknown): ExtraStop[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function CashReportButton({ orderId, amount, onReported }: { orderId: number; amount: number; onReported: () => void }) {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/driver-cash-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driverName: "司機", amount, note }),
    }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "✅ 現金已回報", description: "等待管理員確認" });
      setShow(false);
      onReported();
    },
    onError: () => toast({ title: "回報失敗", variant: "destructive" }),
  });

  return (
    <div>
      {!show ? (
        <button
          onClick={() => setShow(true)}
          className="w-full h-16 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl flex items-center justify-center gap-3 font-black text-base shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
        >
          <DollarSign className="w-6 h-6" />
          回報現金收款 NT${amount.toLocaleString()}
        </button>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
          <p className="font-bold text-orange-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> 確認現金收款回報
          </p>
          <div className="bg-white rounded-xl p-3 text-center border">
            <p className="text-xs text-muted-foreground">收款金額</p>
            <p className="font-black text-2xl text-orange-700">NT${amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-bold mb-1">備注（可選）</p>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="如：客戶要求找零 XX 元"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShow(false)}
              className="py-3 border rounded-xl font-bold hover:bg-muted text-sm">取消</button>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 disabled:opacity-60 text-sm"
            >
              {mut.isPending ? "回報中..." : "確認回報"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DriverTaskDetail() {
  const [, params] = useRoute("/driver/tasks/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params?.id || "0", 10);

  const { data: order, isLoading, error } = useOrderDetail(id);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [signingStopIdx, setSigningStopIdx] = useState<number | null>(null);
  const [showExceptionDialog, setShowExceptionDialog] = useState(false);
  const [selectedExCode, setSelectedExCode] = useState("E01");
  const [exceptionNote, setExceptionNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();

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

  const handleStatusEvent = async (
    event: "arrive" | "start_loading" | "exception" | "resolve_exception",
    extra?: { exception_code?: string; note?: string }
  ) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${id}/status-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, actor: "driver", ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作失敗");

      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["order-timeline", id] });

      const labels: Record<string, string> = {
        arrive: "到點打卡成功！",
        start_loading: "開始裝貨，請確認貨物",
        exception: "異常已回報，等待調度",
        resolve_exception: "已繼續配送",
      };
      toast({ title: labels[event] ?? "操作成功" });

      if (event === "exception") {
        setShowExceptionDialog(false);
        setExceptionNote("");
      }
    } catch (err) {
      toast({ title: "操作失敗", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openNavigation = (addr?: string) => {
    if (!order) return;
    const inTransitOrLater = ["in_transit", "delivered"].includes(order.status);
    const dest = addr ?? (inTransitOrLater ? order.deliveryAddress : order.pickupAddress);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, "_blank");
  };

  const handleSignStop = async (idx: number, stops: ExtraStop[]) => {
    if (!order || signingStopIdx !== null) return;
    setSigningStopIdx(idx);
    try {
      const updated = stops.map((s, i) =>
        i === idx ? { ...s, signStatus: s.signStatus === "signed" ? "pending" : "signed" } : s
      );
      await updateOrder({
        id: order.id,
        data: { extraDeliveryAddresses: JSON.stringify(updated) } as any,
      });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
      toast({ title: updated[idx].signStatus === "signed" ? `✅ 站點 ${idx + 1} 已簽收` : `↩ 站點 ${idx + 1} 已取消簽收` });
    } catch {
      toast({ title: "簽收失敗", variant: "destructive" });
    } finally {
      setSigningStopIdx(null);
    }
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

  // Status helpers
  const isAssigned   = order.status === "assigned";
  const isArrived    = order.status === "arrived";
  const isCargoLoading = order.status === "loading";
  const isInTransit  = order.status === "in_transit";
  const isException  = order.status === "exception";
  const isDone       = order.status === "delivered" || order.status === "cancelled";
  const hasAccepted  = !!(order as any).driverAcceptedAt;

  // isWaiting = driver hasn't tapped "accept" yet
  const isWaitingAcceptance = isAssigned && !hasAccepted;
  // isEnRoute = driver has accepted, now travelling to pickup
  const isEnRoute = isAssigned && hasAccepted;

  const showPickupAddr = isEnRoute || isArrived || isCargoLoading || isAssigned;
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

      {/* Status Timeline */}
      <div className="rounded-2xl border bg-white p-3">
        <OrderStatusTimeline orderId={id} />
      </div>

      {/* Active destination card */}
      {!isDone && !isException && (
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
            onClick={() => openNavigation()}
          >
            <Navigation className="w-4 h-4" />
            導航到{isInTransit ? "目的地" : "取貨地點"}
          </button>
        </div>
      )}

      {/* ── 等待接單 ── */}
      {isWaitingAcceptance && (
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

      {/* ── 前往取貨（已接單）── */}
      {isEnRoute && (
        <div className="space-y-2">
          <button
            className="w-full h-20 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-blue-600/20 disabled:opacity-60 transition-all"
            onClick={() => handleStatusEvent("arrive")}
            disabled={loading}
          >
            <MapPin className="w-7 h-7" />
            <span>到點打卡（司機已到取貨點）</span>
          </button>
          <button
            className="w-full py-3 border-2 border-orange-300 text-orange-600 rounded-xl font-bold hover:bg-orange-50 disabled:opacity-60 text-sm"
            onClick={() => setShowExceptionDialog(true)}
            disabled={loading}
          >
            <AlertTriangle className="w-4 h-4 inline mr-1.5" />回報異常
          </button>
        </div>
      )}

      {/* ── 已到點，準備裝貨 ── */}
      {isArrived && (
        <div className="space-y-2">
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
            <MapPin className="w-8 h-8 text-blue-600 mx-auto mb-1" />
            <p className="font-bold text-blue-800">已到取貨地點</p>
            <p className="text-xs text-blue-600 mt-0.5">確認貨物後請點擊「開始裝貨」</p>
          </div>
          <button
            className="w-full h-20 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-amber-500/20 disabled:opacity-60 transition-all"
            onClick={() => handleStatusEvent("start_loading")}
            disabled={loading}
          >
            <Package className="w-7 h-7" />
            <span>開始裝貨</span>
          </button>
          <button
            className="w-full py-3 border-2 border-orange-300 text-orange-600 rounded-xl font-bold hover:bg-orange-50 disabled:opacity-60 text-sm"
            onClick={() => setShowExceptionDialog(true)}
            disabled={loading}
          >
            <AlertTriangle className="w-4 h-4 inline mr-1.5" />回報異常
          </button>
        </div>
      )}

      {/* ── 裝貨中，出發配送 ── */}
      {isCargoLoading && (
        <div className="space-y-2">
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-center">
            <Package className="w-8 h-8 text-amber-600 mx-auto mb-1" />
            <p className="font-bold text-amber-800">裝貨中</p>
            <p className="text-xs text-amber-600 mt-0.5">裝貨完畢後點擊「出發配送」</p>
          </div>
          <button
            className="w-full h-20 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-60 transition-all"
            onClick={() => handleAction("checkin")}
            disabled={loading}
          >
            <Truck className="w-7 h-7" />
            <span>出發配送</span>
          </button>
          <button
            className="w-full py-3 border-2 border-orange-300 text-orange-600 rounded-xl font-bold hover:bg-orange-50 disabled:opacity-60 text-sm"
            onClick={() => setShowExceptionDialog(true)}
            disabled={loading}
          >
            <AlertTriangle className="w-4 h-4 inline mr-1.5" />回報異常
          </button>
        </div>
      )}

      {/* ── 配送中 ── */}
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

          <div className="space-y-2">
            <button
              className="w-full h-20 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white rounded-2xl flex flex-col items-center justify-center gap-1.5 font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-60 transition-all"
              onClick={() => handleAction("complete")}
              disabled={loading}
            >
              <CheckCircle2 className="w-7 h-7" />
              <span>完成配送</span>
            </button>
            <button
              className="w-full py-3 border-2 border-orange-300 text-orange-600 rounded-xl font-bold hover:bg-orange-50 disabled:opacity-60 text-sm"
              onClick={() => setShowExceptionDialog(true)}
              disabled={loading}
            >
              <AlertTriangle className="w-4 h-4 inline mr-1.5" />回報異常
            </button>
          </div>
        </div>
      )}

      {/* ── 異常狀態 ── */}
      {isException && (
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-5">
            <div className="flex items-center gap-2 font-black text-orange-700 text-lg mb-1">
              <AlertTriangle className="w-6 h-6" />訂單異常
            </div>
            {(order as any).exceptionCode && (
              <p className="text-orange-800 font-semibold text-sm">
                [{(order as any).exceptionCode}] {EXCEPTION_CODES[(order as any).exceptionCode] ?? (order as any).exceptionCode}
              </p>
            )}
            {(order as any).exceptionNote && (
              <p className="text-orange-700 text-sm mt-1">{(order as any).exceptionNote}</p>
            )}
            <p className="text-xs text-orange-500 mt-2">已通知管理員，請等待調度指示</p>
          </div>
          <button
            className="w-full h-16 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-2xl flex items-center justify-center gap-2 font-bold disabled:opacity-60 transition-all"
            onClick={() => handleStatusEvent("resolve_exception")}
            disabled={loading}
          >
            <PlayCircle className="w-5 h-5" />
            繼續配送
          </button>
          <button
            className="w-full py-3 border-2 border-orange-300 text-orange-600 rounded-xl font-bold hover:bg-orange-50 text-sm"
            onClick={() => setShowExceptionDialog(true)}
          >
            <WrenchIcon className="w-4 h-4 inline mr-1.5" />更新異常資訊
          </button>
        </div>
      )}

      {/* Done state */}
      {isDone && (
        <div className="space-y-3">
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
          {/* 現金收款回報 */}
          {order.status === "delivered" && (order as any).paymentMethod === "cash" && !(order as any).cashReportedAt && (
            <CashReportButton orderId={order.id} amount={order.totalFee ?? 0} onReported={() => queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) })} />
          )}
          {(order as any).cashReportedAt && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <DollarSign className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
              <p className="font-bold text-emerald-800 text-sm">現金已回報</p>
              <p className="text-xs text-emerald-600">等待管理員確認</p>
            </div>
          )}
        </div>
      )}

      {/* Multi-stop delivery list */}
      {(() => {
        const extraStops = parseStops((order as any).extraDeliveryAddresses);
        if (extraStops.length === 0) return null;
        const signedCount = extraStops.filter(s => s.signStatus === "signed").length;
        return (
          <Card className="border-2 border-violet-200 bg-white">
            <CardHeader className="pb-2 border-b border-violet-100">
              <CardTitle className="text-sm flex items-center gap-2 text-violet-800">
                <MapPin className="w-4 h-4 text-violet-600" /> 多站送貨清單
                <Badge variant="outline" className="ml-auto text-xs border-violet-300 text-violet-700">
                  {signedCount}/{extraStops.length} 已簽收
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {extraStops.map((stop, idx) => {
                const signed = stop.signStatus === "signed";
                return (
                  <div key={idx} className={`p-4 flex gap-3 ${idx < extraStops.length - 1 ? "border-b" : ""} ${signed ? "bg-emerald-50/50" : ""}`}>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${signed ? "bg-emerald-500 text-white" : "bg-violet-100 text-violet-800"}`}>
                        {signed ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>
                      {idx < extraStops.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 min-h-[8px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm leading-snug ${signed ? "text-emerald-800 line-through opacity-70" : "text-foreground"}`}>
                        {stop.address}
                      </p>
                      {stop.company && <p className="text-xs text-muted-foreground mt-0.5">{stop.company}</p>}
                      {stop.contactName && (
                        <p className="text-xs text-gray-500 mt-0.5">{stop.contactName}{stop.phone ? ` · ${stop.phone}` : ""}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {stop.quantity != null && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{stop.quantity} 件</span>
                        )}
                        {stop.weight != null && (
                          <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-medium">{stop.weight} kg</span>
                        )}
                        {stop.notes && (
                          <span className="text-xs text-muted-foreground">📝 {stop.notes}</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 font-medium flex items-center gap-1 active:scale-[0.97] transition-all"
                          onClick={() => openNavigation(stop.address)}
                        >
                          <Navigation className="w-3 h-3" /> 導航
                        </button>
                        {isInTransit && (
                          <button
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 active:scale-[0.97] transition-all disabled:opacity-60 ${signed ? "border border-gray-200 text-gray-500 hover:bg-gray-50" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"}`}
                            onClick={() => handleSignStop(idx, extraStops)}
                            disabled={signingStopIdx !== null}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {signed ? "取消簽收" : "簽收"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

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

      {/* Pricing Panel */}
      {!isDone && (
        <PricingPanel
          order={order as any}
          mode="driver"
        />
      )}

      {/* Fee summary (done state) */}
      {isDone && order.totalFee != null && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-white/80" />
            <span className="font-bold">應收運費{order.priceLocked ? " 🔒" : ""}</span>
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

      {/* ── Exception Report Dialog ── */}
      {showExceptionDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={() => setShowExceptionDialog(false)}>
          <div className="w-full max-w-md bg-white rounded-3xl p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 font-black text-orange-700 text-lg">
              <AlertTriangle className="w-5 h-5" />回報異常
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">異常原因</p>
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto">
                {Object.entries(EXCEPTION_CODES).map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => setSelectedExCode(code)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm font-medium transition-all
                      ${selectedExCode === code
                        ? "border-orange-400 bg-orange-50 text-orange-700"
                        : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 text-gray-700"}`}
                  >
                    <span className="font-mono text-xs text-gray-400 mr-1.5">[{code}]</span>{label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">補充說明（選填）</p>
              <textarea
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none"
                rows={2}
                placeholder="如：客戶電話未接通，等候20分鐘"
                value={exceptionNote}
                onChange={e => setExceptionNote(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="py-3 border rounded-xl font-bold hover:bg-muted text-sm"
                onClick={() => setShowExceptionDialog(false)}
              >取消</button>
              <button
                className="py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 disabled:opacity-60 text-sm"
                disabled={loading}
                onClick={() => handleStatusEvent("exception", {
                  exception_code: selectedExCode,
                  note: exceptionNote || undefined,
                })}
              >
                {loading ? "回報中..." : "確認回報"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
