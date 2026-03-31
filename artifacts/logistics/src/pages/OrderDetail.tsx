import { useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Package, User, Clock, Truck, DollarSign, CheckCircle2, AlertCircle, Leaf, FileText, Printer } from "lucide-react";
import { Link } from "wouter";
import { useOrderDetail } from "@/hooks/use-orders";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { carbonLabel, getFuelEfficiency, calcCarbonFromKmAndEfficiency } from "@/lib/carbon";

const STATUS_STEPS = [
  { key: "pending",    label: "待派車",  icon: Clock },
  { key: "assigned",   label: "已派車",  icon: Truck },
  { key: "in_transit", label: "運送中",  icon: Truck },
  { key: "delivered",  label: "已完成",  icon: CheckCircle2 },
];

const FEE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unpaid:   { label: "未收款", color: "bg-orange-100 text-orange-700 border-orange-200" },
  paid:     { label: "已收款", color: "bg-green-100 text-green-700 border-green-200" },
  invoiced: { label: "已開票", color: "bg-blue-100 text-blue-700 border-blue-200" },
};

function InvoiceSection({ orderId }: { orderId: number }) {
  const [, navigate] = useLocation();
  const { data: invoices = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["invoices-for-order", orderId],
    queryFn: () => fetch(apiUrl(`/invoices?orderId=${orderId}`)).then(r => r.json()),
  });
  const autoMut = useMutation({
    mutationFn: () => fetch(apiUrl(`/invoices/order/${orderId}/auto`), { method: "POST" }).then(r => r.json()),
    onSuccess: () => refetch(),
  });

  if (isLoading) return null;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="bg-muted/30 border-b pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" /> 電子發票
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {invoices.length === 0 ? (
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground mb-3">尚未開立發票</p>
            <Button
              size="sm"
              variant="outline"
              disabled={autoMut.isPending}
              onClick={() => autoMut.mutate()}
              className="gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              {autoMut.isPending ? "開立中..." : "立即開立發票"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((inv: any) => (
              <div key={inv.id} className={`rounded-lg border p-3 ${inv.status === "voided" ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-sm text-blue-700">{inv.invoice_number}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{inv.buyer_name}</div>
                    {inv.buyer_tax_id && <div className="text-xs text-muted-foreground">統編：{inv.buyer_tax_id}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-emerald-600">NT${Number(inv.total_amount).toLocaleString()}</div>
                    <Badge variant="outline" className={`text-[10px] mt-0.5 ${inv.status === "voided" ? "border-red-300 text-red-600" : "border-green-300 text-green-700"}`}>
                      {inv.status === "voided" ? "已作廢" : "已開立"}
                    </Badge>
                  </div>
                </div>
                {inv.status !== "voided" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 gap-1.5 text-xs h-7 px-2"
                    onClick={() => navigate(`/invoice-print/${inv.id}`)}
                  >
                    <Printer className="w-3 h-3" /> 列印 / PDF
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const id = parseInt(params?.id || "0", 10);
  const { data: order, isLoading, error } = useOrderDetail(id);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
        <h2 className="text-xl font-bold text-foreground">找不到此訂單</h2>
        <p className="text-muted-foreground mt-2 text-sm">請確認訂單編號是否正確</p>
        <Button asChild className="mt-6"><Link href="/orders">返回訂單列表</Link></Button>
      </div>
    );
  }

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === order.status);
  const isCancelled = order.status === "cancelled";
  const feeConfig = FEE_STATUS_LABELS[order.feeStatus ?? "unpaid"];
  const vehicleType = order.requiredVehicleType ?? order.driver?.vehicleType;
  const kmPerL = getFuelEfficiency(vehicleType);
  const fuelCalc = order.distanceKm && order.distanceKm > 0
    ? calcCarbonFromKmAndEfficiency(order.distanceKm, kmPerL)
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="rounded-full mt-1 shrink-0">
          <Link href="/orders"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">訂單 #{order.id}</h1>
            <OrderStatusBadge status={order.status} />
            {order.totalFee != null && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${feeConfig.color}`}>
                {feeConfig.label}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            建立於 {format(new Date(order.createdAt), "yyyy-MM-dd HH:mm")}
          </p>
        </div>
      </div>

      {/* Progress Timeline (not shown for cancelled) */}
      {!isCancelled && (
        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center">
              {STATUS_STEPS.map((step, idx) => {
                const done = idx <= currentStepIdx;
                const active = idx === currentStepIdx;
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                        ${active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
                          done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <step.icon className="w-4 h-4" />
                      </div>
                      <span className={`text-xs font-medium whitespace-nowrap ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors ${idx < currentStepIdx ? "bg-primary" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {/* Route */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> 運送路線
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 relative">
              <div className="absolute left-9 top-8 bottom-8 w-0.5 bg-border"></div>
              <div className="relative flex gap-5 mb-6">
                <div className="w-5 h-5 mt-0.5 rounded-full bg-blue-100 border-2 border-primary flex-shrink-0 z-10"></div>
                <div>
                  <p className="text-xs font-semibold text-primary mb-1">取貨地點</p>
                  <p className="font-medium text-foreground">{order.pickupAddress}</p>
                </div>
              </div>
              <div className="relative flex gap-5">
                <div className="w-5 h-5 mt-0.5 rounded-full bg-emerald-100 border-2 border-emerald-500 flex-shrink-0 z-10"></div>
                <div>
                  <p className="text-xs font-semibold text-emerald-600 mb-1">送貨地點</p>
                  <p className="font-medium text-foreground">{order.deliveryAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cargo */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> 貨物資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">貨物描述</dt>
                  <dd className="font-medium text-foreground">{order.cargoDescription}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs mb-1">預估重量</dt>
                  <dd className="font-medium text-foreground">{order.cargoWeight ? `${order.cargoWeight} kg` : "未提供"}</dd>
                </div>
                {order.notes && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs mb-1">備註說明</dt>
                    <dd className="bg-muted/50 p-3 rounded-lg text-foreground border text-sm">{order.notes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Fee info */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" /> 費用資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {order.totalFee != null ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">基本運費</p>
                      <p className="font-bold text-foreground">
                        {order.basePrice != null ? `NT$${order.basePrice.toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">附加費用</p>
                      <p className="font-bold text-foreground">
                        {order.extraFee != null && order.extraFee > 0 ? `+NT$${order.extraFee.toLocaleString()}` : "—"}
                      </p>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                      <p className="text-xs text-primary mb-1 font-semibold">應收總額</p>
                      <p className="font-bold text-primary text-lg">NT${order.totalFee.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">收款狀態：</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${feeConfig.color}`}>
                      {feeConfig.label}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-sm">尚未設定運費</p>
                  <p className="text-xs text-muted-foreground mt-1">請至費用管理頁面設定</p>
                </div>
              )}
            </CardContent>
          </Card>
          {/* Carbon */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-emerald-50/60 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-600" /> 碳排放資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {fuelCalc !== null ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">行駛距離</p>
                      <p className="font-bold text-foreground">{order.distanceKm?.toFixed(1)} km</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-700 mb-1">估算用油量</p>
                      <p className="font-bold text-blue-700">{fuelCalc.liters.toFixed(2)} L</p>
                      <p className="text-[10px] text-blue-500">{kmPerL} km/L</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-emerald-700 mb-1 font-semibold">碳排放量</p>
                      <p className="font-bold text-emerald-700 text-lg">{carbonLabel(fuelCalc.co2)}</p>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {order.distanceKm?.toFixed(1)} km ÷ {kmPerL} km/L ＝ {fuelCalc.liters.toFixed(2)} L　×　2.68 ＝ <strong className="text-emerald-700">{fuelCalc.co2.toFixed(1)} kg CO₂</strong>
                    </span>
                    {vehicleType && (
                      <span className="ml-3">
                        <Badge variant="outline" className="text-xs">{vehicleType}</Badge>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Leaf className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-sm">距離資料不足，無法計算碳排放</p>
                  <p className="text-xs text-muted-foreground mt-1">請設定行駛距離後自動計算</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Customer */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> 客戶資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">聯絡人</p>
                <p className="font-semibold text-foreground">{order.customerName}</p>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">電話</p>
                <p className="font-medium font-mono text-foreground">{order.customerPhone}</p>
              </div>
            </CardContent>
          </Card>

          {/* Driver */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-muted/30 border-b pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" /> 負責司機
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {order.driver ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                      {order.driver.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{order.driver.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{order.driver.phone}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">車型</p>
                      <p className="font-medium">{order.driver.vehicleType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">車牌</p>
                      <p className="font-mono bg-muted border px-2 py-0.5 rounded text-xs text-center uppercase">{order.driver.licensePlate}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="w-10 h-10 rounded-full bg-muted mx-auto flex items-center justify-center mb-2">
                    <Truck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">尚未指派司機</p>
                  <p className="text-xs text-muted-foreground mt-1">請至後台派車</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice */}
          <InvoiceSection orderId={order.id} />

          {/* Last updated */}
          <Card className="border shadow-sm bg-muted/20">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">最後更新</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {format(new Date(order.updatedAt), "yyyy-MM-dd HH:mm")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
