import { useState } from "react";
import { format } from "date-fns";
import { Search, Package, MapPin, Truck, DollarSign, CheckCircle2, Clock, AlertCircle, CreditCard, Star, Leaf } from "lucide-react";
import { calcCarbonKg, carbonLabel } from "@/lib/carbon";
import DriverRatingDialog from "@/components/DriverRatingDialog";
import { useTrackOrder, useConfirmPayment, getTrackOrderQueryKey } from "@workspace/api-client-react";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_STEPS = [
  { key: "pending", label: "待派車" },
  { key: "assigned", label: "已派車" },
  { key: "in_transit", label: "運送中" },
  { key: "delivered", label: "已完成" },
];

function ProgressBar({ status }: { status: string }) {
  const stepIdx = STATUS_STEPS.findIndex(s => s.key === status);
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-700 font-medium">訂單已取消</span>
      </div>
    );
  }
  return (
    <div className="flex items-center">
      {STATUS_STEPS.map((step, idx) => {
        const done = idx <= stepIdx;
        const active = idx === stepIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${active ? "bg-primary text-white ring-4 ring-primary/20" :
                  done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {done && !active ? "✓" : idx + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${active ? "text-primary font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${idx < stepIdx ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order, onPayment }: { order: Order; onPayment: (order: Order) => void }) {
  const alreadyPaid = order.feeStatus === "paid" || !!order.paymentConfirmedAt;
  const [ratingOpen, setRatingOpen] = useState(false);
  const [rated, setRated] = useState(false);
  const vehicleType = order.requiredVehicleType ?? order.driver?.vehicleType;
  const carbonKg = calcCarbonKg(order.distanceKm, vehicleType);
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              訂單 #{order.id}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              <Clock className="inline w-3 h-3 mr-1" />
              {format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <ProgressBar status={order.status} />

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">取貨地點</p>
              <p className="font-medium">{order.pickupAddress}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">送達地點</p>
              <p className="font-medium">{order.deliveryAddress}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Package className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">貨物</p>
              <p className="font-medium">{order.cargoDescription}</p>
            </div>
          </div>
        </div>

        {carbonKg !== null && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
            <Leaf className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1">
              <span className="text-emerald-800 text-xs">本次運送碳排放量</span>
            </div>
            <div className="text-right">
              <span className="font-bold text-emerald-700">{carbonLabel(carbonKg)}</span>
              {order.distanceKm && (
                <span className="text-[10px] text-emerald-600 ml-1.5">/ {order.distanceKm.toFixed(0)} km</span>
              )}
            </div>
          </div>
        )}

        {order.driver && (
          <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3 border border-blue-100">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
              {order.driver.name.charAt(0)}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">負責司機</p>
              <p className="font-semibold text-sm text-foreground">{order.driver.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{order.driver.phone}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-foreground">車牌</p>
              <p className="text-xs font-mono bg-white border px-2 py-0.5 rounded">{order.driver.licensePlate}</p>
            </div>
          </div>
        )}

        {order.totalFee != null && (
          <div className="bg-muted/40 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">應付運費</span>
            </div>
            <div className="text-right">
              <p className="font-bold text-primary text-lg">NT${order.totalFee.toLocaleString()}</p>
              {alreadyPaid ? (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 justify-end">
                  <CheckCircle2 className="w-3 h-3" /> 已確認付款
                </span>
              ) : (
                <Button size="sm" variant="default" onClick={() => onPayment(order)} className="mt-1 h-7 text-xs">
                  <CreditCard className="w-3 h-3 mr-1" /> 回報付款
                </Button>
              )}
            </div>
          </div>
        )}
        {/* Rating button for delivered orders */}
        {order.status === "delivered" && order.driver && (
          rated ? (
            <div className="flex items-center gap-2 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">已完成評分，感謝您的回饋！</span>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setRatingOpen(true)}
              className="w-full border-yellow-300 text-yellow-700 hover:bg-yellow-50">
              <Star className="w-3.5 h-3.5 mr-1.5 text-yellow-500" />
              為司機 {order.driver.name} 評分
            </Button>
          )
        )}
      </CardContent>

      {order.driver && (
        <DriverRatingDialog
          open={ratingOpen}
          onClose={() => { setRatingOpen(false); setRated(true); }}
          orderId={order.id}
          driverId={order.driver.id}
          driverName={order.driver.name}
        />
      )}
    </Card>
  );
}

export default function CustomerTrack() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [searchParams, setSearchParams] = useState<{ phone: string; orderId?: number } | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentNote, setPaymentNote] = useState("");

  const { data: orders, isLoading, error } = useTrackOrder(
    searchParams ?? { phone: "" },
    { query: { enabled: !!searchParams } }
  );

  const { mutateAsync: confirmPayment, isPending: confirmingPayment } = useConfirmPayment({
    mutation: {
      onSuccess: () => {
        if (searchParams) {
          queryClient.invalidateQueries({ queryKey: getTrackOrderQueryKey(searchParams) });
        }
      }
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearchParams({
      phone: phone.trim(),
      orderId: orderId ? parseInt(orderId, 10) : undefined,
    });
  };

  const handlePayment = async () => {
    if (!paymentOrder) return;
    try {
      await confirmPayment({ id: paymentOrder.id, data: { paymentNote: paymentNote || null } });
      toast({ title: "付款回報成功", description: "我們已收到您的付款通知" });
      setPaymentOrder(null);
      setPaymentNote("");
    } catch {
      toast({ title: "失敗", description: "付款回報失敗，請稍後再試", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">查詢訂單</h1>
        <p className="text-muted-foreground text-sm mt-1">輸入您的聯絡電話查詢訂單狀態</p>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm">聯絡電話 <span className="text-destructive">*</span></Label>
              <Input
                id="phone"
                type="tel"
                placeholder="請輸入下單時的電話號碼"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orderId" className="text-sm">訂單編號 <span className="text-muted-foreground">(選填)</span></Label>
              <Input
                id="orderId"
                type="number"
                placeholder="例如：5"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 gap-2">
              <Search className="w-4 h-4" /> 查詢訂單
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
          查詢中...
        </div>
      )}

      {error && (
        <div className="text-center py-6">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-destructive text-sm">查詢失敗，請稍後再試</p>
        </div>
      )}

      {orders && orders.length === 0 && searchParams && (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">找不到相符的訂單</p>
          <p className="text-xs mt-1">請確認電話號碼是否正確</p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">共找到 {orders.length} 筆訂單</p>
          {orders.map(order => (
            <OrderCard key={order.id} order={order} onPayment={setPaymentOrder} />
          ))}
        </div>
      )}

      {/* Payment dialog */}
      <Dialog open={!!paymentOrder} onOpenChange={open => !open && setPaymentOrder(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" /> 回報付款
            </DialogTitle>
            <DialogDescription>
              訂單 #{paymentOrder?.id}・應付 NT${paymentOrder?.totalFee?.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>付款備註 <span className="text-muted-foreground text-xs">(選填)</span></Label>
              <Textarea
                placeholder="例如：已轉帳、現金付清..."
                value={paymentNote}
                onChange={e => setPaymentNote(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOrder(null)}>取消</Button>
            <Button onClick={handlePayment} disabled={confirmingPayment} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {confirmingPayment ? "送出中..." : "確認送出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
