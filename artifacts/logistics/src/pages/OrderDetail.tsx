import { useRoute } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Package, User, Clock, Truck, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useOrderDetail } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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
