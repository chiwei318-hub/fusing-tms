import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Truck, MapPin, Phone, Clock, CheckCircle2,
  Package, RefreshCw, ArrowLeft, AlertCircle
} from "lucide-react";

interface OrderStatus {
  order_id: number;
  status: string;
  pickup_address: string;
  delivery_address: string;
  total_fee: number;
  payment_method: string;
  payment_required: boolean;
  dispatch_blocked: boolean;
  fee_status: string;
  pickup_date: string;
  created_at: string;
  customer_name: string;
  driver: {
    name: string;
    phone: string;
    plate: string;
  } | null;
}

const STATUS_STEPS = [
  { key: "pending", label: "等待派車", icon: Clock, color: "text-yellow-500" },
  { key: "assigned", label: "司機出發中", icon: Truck, color: "text-blue-500" },
  { key: "in_transit", label: "運送中", icon: Truck, color: "text-indigo-500" },
  { key: "delivered", label: "已送達", icon: CheckCircle2, color: "text-green-500" },
];

const PAYMENT_LABEL: Record<string, string> = {
  cash: "現金",
  line_pay: "LINE Pay",
  credit_card: "信用卡",
  bank_transfer: "銀行轉帳",
};

export default function QuickTrack() {
  const [, params] = useRoute("/quick/track/:token");
  const [, setLocation] = useLocation();
  const token = params?.token ?? "";

  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  async function fetchOrder() {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/quick-order/${token}`));
      if (!res.ok) throw new Error("找不到訂單");
      const data = await res.json();
      setOrder(data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 15000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Truck className="h-12 w-12 text-blue-400 animate-bounce mx-auto" />
          <p className="text-gray-500">載入中…</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <p className="text-gray-600">{error || "找不到訂單資訊"}</p>
            <Button onClick={() => setLocation("/quick")}>返回接單頁面</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const isFinalDelivered = order.status === "delivered";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Truck className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">富詠運輸</span>
          </div>
          <p className="text-gray-400 text-xs">訂單即時追蹤</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">訂單 #{order.order_id}</CardTitle>
              <div className="flex items-center gap-2">
                {isFinalDelivered ? (
                  <Badge className="bg-green-100 text-green-700">已送達 ✓</Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 animate-pulse">即時追蹤中</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <div className="flex justify-between items-start">
                {STATUS_STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const active = i <= currentStepIndex;
                  const current = i === currentStepIndex;
                  return (
                    <div key={s.key} className="flex flex-col items-center flex-1">
                      <div className={`rounded-full p-2 mb-1 transition-all ${
                        active ? "bg-blue-100" : "bg-gray-100"
                      } ${current ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}>
                        <Icon className={`h-4 w-4 ${active ? s.color : "text-gray-300"}`} />
                      </div>
                      <span className={`text-xs text-center leading-tight ${
                        active ? "text-gray-700 font-medium" : "text-gray-400"
                      }`}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-4 left-[12.5%] right-[12.5%] h-0.5 -z-10">
                <div className="h-full bg-gray-200 rounded-full" />
                <div
                  className="h-full bg-blue-400 rounded-full absolute top-0 left-0 transition-all duration-700"
                  style={{ width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {order.dispatch_blocked && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="py-3 flex items-center gap-3 text-orange-700 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span>尚未確認付款，系統將在付款後自動派車。</span>
            </CardContent>
          </Card>
        )}

        {order.driver && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 rounded-full p-3">
                  <Truck className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">{order.driver.name} 司機</div>
                  <div className="text-sm text-gray-500">車牌：{order.driver.plate || "—"}</div>
                </div>
                {order.driver.phone && (
                  <a href={`tel:${order.driver.phone}`}>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Phone className="h-3 w-3" /> 聯絡
                    </Button>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="bg-green-100 rounded-full p-1.5 mt-0.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">取貨地址</div>
                <div className="font-medium text-gray-800">{order.pickup_address}</div>
              </div>
            </div>
            <div className="ml-4 border-l-2 border-dashed border-gray-200 h-4" />
            <div className="flex items-start gap-3">
              <div className="bg-red-100 rounded-full p-1.5 mt-0.5">
                <MapPin className="h-3 w-3 text-red-500" />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">送達地址</div>
                <div className="font-medium text-gray-800">{order.delivery_address}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 flex items-center gap-1"><Package className="h-3 w-3" /> 費用</span>
              <span className="font-semibold text-blue-600">NT${Number(order.total_fee).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">付款方式</span>
              <span>{PAYMENT_LABEL[order.payment_method] ?? order.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">付款狀態</span>
              <span className={order.fee_status === "paid" ? "text-green-600 font-medium" : "text-orange-500"}>
                {order.fee_status === "paid" ? "✓ 已付款" : "待付款"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 flex items-center gap-1"><Clock className="h-3 w-3" /> 下單時間</span>
              <span>{new Date(order.created_at).toLocaleString("zh-TW")}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>更新時間：{lastUpdated.toLocaleTimeString("zh-TW")}（每 15 秒自動刷新）</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={fetchOrder}>
            <RefreshCw className="h-3 w-3" /> 刷新
          </Button>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={() => setLocation("/quick")}>
          <ArrowLeft className="h-4 w-4" /> 返回快速接單
        </Button>
      </div>
    </div>
  );
}
