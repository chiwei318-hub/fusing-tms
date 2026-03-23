import { useState } from "react";
import { useLocation } from "wouter";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Truck, MapPin, Package, Phone, CreditCard,
  ChevronRight, ChevronLeft, CheckCircle2,
  Banknote, Clock, Star, AlertCircle, Copy
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const VEHICLE_TYPES = [
  { id: 1, name: "小貨車", desc: "適合小型貨物、搬家少量物品", base_fee: 1200, icon: "🚐" },
  { id: 2, name: "3.5噸廂型車", desc: "一般貨運、家具搬遷", base_fee: 2200, icon: "🚚" },
  { id: 3, name: "5噸貨車", desc: "大型貨運、整批商品", base_fee: 3500, icon: "🚛" },
  { id: 4, name: "冷藏車", desc: "生鮮食品、低溫貨物", base_fee: 4500, icon: "❄️" },
  { id: 5, name: "曳引車", desc: "超重大件、工程貨物", base_fee: 8000, icon: "🏗️" },
];

const PAYMENT_METHODS = [
  { id: "line_pay", label: "LINE Pay", icon: "💚", desc: "掃碼即付，最快捷" },
  { id: "credit_card", label: "信用卡", icon: "💳", desc: "Visa / Mastercard" },
  { id: "bank_transfer", label: "銀行轉帳", icon: "🏦", desc: "ATM / 網銀轉帳" },
  { id: "cash", label: "現金付款", icon: "💵", desc: "司機到達時繳付" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "等待派車", color: "bg-yellow-100 text-yellow-800" },
  assigned: { label: "已派車", color: "bg-blue-100 text-blue-800" },
  in_transit: { label: "運送中", color: "bg-indigo-100 text-indigo-800" },
  delivered: { label: "已送達", color: "bg-green-100 text-green-800" },
};

interface QuoteResult {
  vehicle_type: { id: number; name: string };
  base_fee: number;
  distance_fee: number;
  distance_km: number;
  multiplier: number;
  multiplier_label: string;
  total_fee: number;
  expires_at: string;
}

interface OrderResult {
  ok: boolean;
  order_id: number;
  token: string;
  track_url: string;
  payment_required: boolean;
  total_fee: number;
  payment_instructions: string;
}

type Step = "address" | "contact" | "quote" | "payment" | "success";

export default function QuickOrder() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("address");

  const [pickupAddress, setPickupAddress] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState<number>(1);
  const [distanceKm, setDistanceKm] = useState<number>(10);
  const [cargoDesc, setCargoDesc] = useState("");
  const [pickupTime, setPickupTime] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("line_pay");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const [loading, setLoading] = useState(false);

  const steps: Step[] = ["address", "contact", "quote", "payment", "success"];
  const stepIndex = steps.indexOf(step);
  const progress = ((stepIndex) / (steps.length - 1)) * 100;

  const stepLabels = ["地址貨物", "聯絡資訊", "即時報價", "確認付款", "預訂完成"];

  async function handleGetQuote() {
    if (!pickupAddress.trim() || !deliveryAddress.trim()) {
      toast({ title: "請填寫起訖地址", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/quick-order/quote"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_type_id: vehicleTypeId,
          distance_km: distanceKm,
          pickup_time: new Date(pickupTime).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "報價失敗");
      setQuote(data);
      setStep("quote");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrder() {
    if (!paymentMethod) {
      toast({ title: "請選擇付款方式", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/quick-order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_name: guestName,
          guest_phone: guestPhone,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          vehicle_type_id: vehicleTypeId,
          distance_km: distanceKm,
          cargo_description: cargoDesc,
          pickup_time: new Date(pickupTime).toISOString(),
          payment_method: paymentMethod,
          total_fee: quote?.total_fee ?? 0,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立訂單失敗");
      setOrderResult(data);
      setStep("payment");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPayment() {
    if (!orderResult) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/quick-order/${orderResult.token}/pay`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "確認失敗");
      setStep("success");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function copyTrackUrl() {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}quick/track/${orderResult?.token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "追蹤連結已複製" });
  }

  const selectedVehicle = VEHICLE_TYPES.find((v) => v.id === vehicleTypeId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Truck className="h-7 w-7 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">富詠運輸</span>
          </div>
          <p className="text-gray-500 text-sm">零散客快速接單 · 免註冊 · 即時報價</p>
        </div>

        {step !== "success" && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              {stepLabels.slice(0, 4).map((label, i) => (
                <span
                  key={i}
                  className={i <= stepIndex ? "text-blue-600 font-medium" : ""}
                >
                  {label}
                </span>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {step === "address" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-blue-600" /> 起迄地址與貨物資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">起點地址 *</Label>
                <Input
                  placeholder="例：台北市信義區信義路五段7號"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">目的地 *</Label>
                <Input
                  placeholder="例：新北市板橋區縣民大道二段7號"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">預估距離（公里）</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(Number(e.target.value))}
                    className="w-28"
                  />
                  <span className="text-sm text-gray-500">km（不確定可先估計，最終以實際里程計算）</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">希望取貨時間</Label>
                <Input
                  type="datetime-local"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Package className="h-4 w-4" /> 選擇車型
                </Label>
                <div className="grid grid-cols-1 gap-2">
                  {VEHICLE_TYPES.map((vt) => (
                    <button
                      key={vt.id}
                      onClick={() => setVehicleTypeId(vt.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        vehicleTypeId === vt.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <span className="text-2xl">{vt.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{vt.name}</div>
                        <div className="text-xs text-gray-500">{vt.desc}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-blue-600">起跳 NT${vt.base_fee.toLocaleString()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">貨物描述（選填）</Label>
                <Textarea
                  placeholder="例：家具3件、紙箱20箱、易碎品等"
                  value={cargoDesc}
                  onChange={(e) => setCargoDesc(e.target.value)}
                  rows={2}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (!pickupAddress.trim() || !deliveryAddress.trim()) {
                    toast({ title: "請填寫起訖地址", variant: "destructive" });
                    return;
                  }
                  setStep("contact");
                }}
              >
                下一步：填寫聯絡資訊 <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "contact" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone className="h-5 w-5 text-blue-600" /> 聯絡資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>免註冊！輸入姓名與手機號碼即可完成預訂，我們會透過 LINE 通知進度。</span>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">您的姓名 *</Label>
                <Input
                  placeholder="請輸入姓名"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">手機號碼 *</Label>
                <Input
                  placeholder="09XXXXXXXX"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">備註（選填）</Label>
                <Textarea
                  placeholder="特殊需求、注意事項等"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("address")} className="flex-1">
                  <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
                </Button>
                <Button
                  className="flex-1"
                  disabled={loading}
                  onClick={() => {
                    if (!guestName.trim() || !guestPhone.trim()) {
                      toast({ title: "請填寫姓名與手機號碼", variant: "destructive" });
                      return;
                    }
                    handleGetQuote();
                  }}
                >
                  {loading ? "計算中…" : "取得即時報價"} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "quote" && quote && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="h-5 w-5 text-yellow-500" /> 即時報價結果
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-5 text-white text-center">
                <div className="text-sm opacity-80 mb-1">{selectedVehicle?.icon} {quote.vehicle_type.name} · {quote.distance_km} km</div>
                <div className="text-4xl font-bold mb-1">NT${quote.total_fee.toLocaleString()}</div>
                {quote.multiplier_label && (
                  <Badge className="bg-yellow-400 text-yellow-900 text-xs">{quote.multiplier_label}</Badge>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">車型起跳費</span>
                  <span className="font-medium">NT${quote.base_fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">距離費用（{quote.distance_km} km × NT$35）</span>
                  <span className="font-medium">NT${quote.distance_fee.toLocaleString()}</span>
                </div>
                {quote.multiplier > 1 && (
                  <div className="flex justify-between py-2 border-b text-orange-600">
                    <span>時段加成</span>
                    <span>×{quote.multiplier}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 font-bold text-base">
                  <span>總計</span>
                  <span className="text-blue-600">NT${quote.total_fee.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> 選擇付款方式
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-center transition-all ${
                        paymentMethod === pm.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <span className="text-xl">{pm.icon}</span>
                      <span className="text-xs font-semibold">{pm.label}</span>
                      <span className="text-xs text-gray-400">{pm.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>報價有效至 {new Date(quote.expires_at).toLocaleTimeString("zh-TW")}</span>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("contact")} className="flex-1">
                  <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
                </Button>
                <Button className="flex-1" disabled={loading} onClick={handleCreateOrder}>
                  {loading ? "處理中…" : "確認預訂"} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "payment" && orderResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Banknote className="h-5 w-5 text-green-600" /> 付款確認
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">訂單編號</span>
                  <span className="font-bold">#{orderResult.order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">付款金額</span>
                  <span className="font-bold text-blue-600 text-lg">NT${orderResult.total_fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">付款方式</span>
                  <span className="font-medium">{PAYMENT_METHODS.find((p) => p.id === paymentMethod)?.label}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                {orderResult.payment_instructions}
              </div>

              {paymentMethod === "line_pay" && (
                <div className="text-center">
                  <div className="bg-green-100 rounded-xl p-6 inline-block mb-3">
                    <div className="text-6xl">💚</div>
                    <div className="text-sm text-green-700 mt-2 font-medium">LINE Pay QR Code</div>
                    <div className="text-xs text-gray-400 mt-1">（整合後顯示正式 QR Code）</div>
                  </div>
                </div>
              )}

              {paymentMethod === "credit_card" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm">卡號</Label>
                    <Input placeholder="1234 5678 9012 3456" disabled className="font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-sm">有效期限</Label>
                      <Input placeholder="MM/YY" disabled />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">CVV</Label>
                      <Input placeholder="123" disabled />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">（整合金流後啟用刷卡功能）</p>
                </div>
              )}

              <Button
                className="w-full h-12 text-base"
                disabled={loading}
                onClick={paymentMethod === "cash" ? () => setStep("success") : handleConfirmPayment}
              >
                {loading ? "處理中…" : paymentMethod === "cash" ? "完成預訂（現金到付）" : "確認已完成付款"}
              </Button>
              <p className="text-center text-xs text-gray-400">
                付款確認後系統將立即自動派車，並透過 LINE 發送通知
              </p>
            </CardContent>
          </Card>
        )}

        {step === "success" && orderResult && (
          <Card>
            <CardContent className="py-10">
              <div className="text-center space-y-4">
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                <h2 className="text-2xl font-bold text-gray-900">預訂成功！</h2>
                <p className="text-gray-500">訂單 #{orderResult.order_id} 已建立，系統正在為您尋找最近的司機</p>
                <div className="bg-green-50 rounded-xl p-5 space-y-3 text-sm text-left">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <Truck className="h-4 w-4" /> 接下來的流程
                  </div>
                  <ol className="space-y-2 text-gray-600 ml-4 list-decimal">
                    <li>系統自動媒合最近可用司機</li>
                    <li>派車後您的手機會收到 LINE 通知</li>
                    <li>司機出發後您可即時追蹤進度</li>
                    <li>貨物送達後確認收貨完成</li>
                  </ol>
                </div>
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="text-sm font-medium text-gray-700">追蹤連結（可分享給收件人）</div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 break-all">
                    {window.location.origin}{import.meta.env.BASE_URL}quick/track/{orderResult.token}
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={copyTrackUrl}>
                    <Copy className="h-3 w-3" /> 複製追蹤連結
                  </Button>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setLocation(`/quick/track/${orderResult.token}`)}
                  >
                    查看訂單追蹤
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setStep("address");
                      setOrderResult(null);
                      setQuote(null);
                      setPickupAddress("");
                      setDeliveryAddress("");
                      setGuestName("");
                      setGuestPhone("");
                      setCargoDesc("");
                      setNotes("");
                    }}
                  >
                    再下一單
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          富詠運輸 · 24/7 全天候服務 · 0800-000-000
        </p>
      </div>
    </div>
  );
}
