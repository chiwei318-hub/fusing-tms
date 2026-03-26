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
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";

const CARGO_CATEGORIES = [
  "家具 / 辦公家具",
  "家電 / 3C 電器",
  "辦公設備 / 文儀",
  "建材 / 裝潢材料",
  "食品飲料 / 生鮮",
  "服飾 / 紡織品",
  "書籍 / 文件 / 紙張",
  "電子零件 / PCB",
  "機械 / 工業零件",
  "金屬材料 / 鐵件",
  "化工原料 / 危險品",
  "醫療器材 / 藥品",
  "農產品 / 水果",
  "包裹 / 快遞物品",
  "藝術品 / 骨董",
  "展覽器材 / 展示品",
  "汽機車 / 輪胎",
  "重型機械 / 工程設備",
  "廢棄物 / 回收物",
  "原物料 / 半成品",
  "其他（備註說明）",
];

const VEHICLE_TYPES = [
  { id: 1, name: "小貨車", desc: "適合小型貨物、文件包裹", base_fee: 1200, icon: "🚐" },
  { id: 2, name: "3.5噸廂型車", desc: "一般貨運、辦公設備", base_fee: 2200, icon: "🚚" },
  { id: 3, name: "5噸貨車", desc: "大型貨運、整批商品", base_fee: 3500, icon: "🚛" },
  { id: 4, name: "冷藏車", desc: "生鮮食品、低溫貨物", base_fee: 4500, icon: "❄️" },
  { id: 5, name: "曳引車", desc: "超重大件、工程貨物", base_fee: 8000, icon: "🏗️" },
];

const PAYMENT_TYPES = [
  {
    id: "instant",
    label: "即時付款",
    icon: "⚡",
    desc: "LINE Pay · 信用卡 · 轉帳",
    note: "付款確認後才派車",
    badge: "推薦",
    badgeColor: "bg-blue-500 text-white",
    sub: [
      { id: "line_pay",      label: "LINE Pay",  icon: "💚", desc: "掃碼即付" },
      { id: "credit_card",   label: "信用卡",    icon: "💳", desc: "Visa / Master" },
      { id: "bank_transfer", label: "銀行轉帳",  icon: "🏦", desc: "ATM / 網銀" },
    ],
  },
  {
    id: "cash",
    label: "現金付款",
    icon: "💵",
    desc: "司機到達時收款",
    note: "司機確認後系統回報",
    badge: "",
    badgeColor: "",
    sub: [],
  },
  {
    id: "monthly",
    label: "月結帳款",
    icon: "📋",
    desc: "企業客戶對帳付款",
    note: "需事先申請月結資格",
    badge: "企業",
    badgeColor: "bg-violet-500 text-white",
    sub: [],
  },
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
  const [cargoCategory, setCargoCategory] = useState("");
  const [cargoNotes, setCargoNotes] = useState("");
  const [pickupTime, setPickupTime] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState("");

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [paymentType, setPaymentType] = useState<"instant" | "cash" | "monthly">("instant");
  const [instantMethod, setInstantMethod] = useState<"line_pay" | "credit_card" | "bank_transfer">("line_pay");
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
          cargo_description: [cargoCategory, cargoNotes].filter(Boolean).join(" — ") || null,
          pickup_time: new Date(pickupTime).toISOString(),
          payment_method: paymentType === "instant" ? instantMethod : paymentType,
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
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-blue-500" /> 起點地址 *
                </Label>
                <TaiwanAddressInput
                  value={pickupAddress}
                  onChange={setPickupAddress}
                  historyKey="quick-pickup"
                  placeholder="選擇縣市區域後填寫路段門牌"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" /> 送貨地址 *
                </Label>
                <TaiwanAddressInput
                  value={deliveryAddress}
                  onChange={setDeliveryAddress}
                  historyKey="quick-delivery"
                  placeholder="選擇縣市區域後填寫路段門牌"
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
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Package className="h-4 w-4 text-indigo-500" /> 貨物類型（選填）
                </Label>
                <Select value={cargoCategory} onValueChange={setCargoCategory}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="選擇貨物類型…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARGO_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">貨物補充說明（選填）</Label>
                <Textarea
                  placeholder="例：家具3件、紙箱20箱、易碎品請小心搬運"
                  value={cargoNotes}
                  onChange={(e) => setCargoNotes(e.target.value)}
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
              {/* ── 三種主付款類型 ── */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <CreditCard className="h-4 w-4" /> 選擇付款方式
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_TYPES.map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() => setPaymentType(pt.id as any)}
                      className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                        paymentType === pt.id
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      {pt.badge && (
                        <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${pt.badgeColor}`}>
                          {pt.badge}
                        </span>
                      )}
                      <span className="text-2xl mt-1">{pt.icon}</span>
                      <span className="text-xs font-bold">{pt.label}</span>
                      <span className="text-[10px] text-gray-400 leading-tight">{pt.desc}</span>
                    </button>
                  ))}
                </div>
                {/* ── 即時付款子選項 ── */}
                {paymentType === "instant" && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {PAYMENT_TYPES[0].sub.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setInstantMethod(s.id as any)}
                        className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border-2 text-center transition-all ${
                          instantMethod === s.id
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <span className="text-lg">{s.icon}</span>
                        <span className="text-[11px] font-semibold">{s.label}</span>
                        <span className="text-[10px] text-gray-400">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* ── 付款說明提示 ── */}
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 mt-1 ${
                  paymentType === "instant" ? "bg-blue-50 text-blue-700" :
                  paymentType === "cash"    ? "bg-amber-50 text-amber-700" :
                                             "bg-violet-50 text-violet-700"
                }`}>
                  <span className="text-base">
                    {paymentType === "instant" ? "⚡" : paymentType === "cash" ? "💵" : "📋"}
                  </span>
                  <span>{PAYMENT_TYPES.find(p => p.id === paymentType)?.note}</span>
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
              {/* ── 訂單摘要 ── */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">訂單編號</span>
                  <span className="font-bold">#{orderResult.order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">應付金額</span>
                  <span className="font-bold text-blue-600 text-lg">NT${orderResult.total_fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">付款方式</span>
                  <span className="font-medium">
                    {paymentType === "instant"
                      ? `即時付款 · ${PAYMENT_TYPES[0].sub.find(s => s.id === instantMethod)?.label}`
                      : paymentType === "cash" ? "現金付款" : "月結帳款"}
                  </span>
                </div>
              </div>

              {/* ── 即時付款：LINE Pay ── */}
              {paymentType === "instant" && instantMethod === "line_pay" && (
                <div className="text-center space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 inline-block">
                    <div className="text-6xl">💚</div>
                    <div className="text-sm text-green-700 mt-2 font-bold">LINE Pay 掃碼付款</div>
                    <div className="text-xs text-gray-400 mt-1">（金流整合後顯示正式 QR Code）</div>
                  </div>
                  <p className="text-xs text-blue-600 font-medium">⚡ 付款完成後系統立即自動派車</p>
                </div>
              )}

              {/* ── 即時付款：信用卡 ── */}
              {paymentType === "instant" && instantMethod === "credit_card" && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">卡號</Label>
                      <Input placeholder="1234 5678 9012 3456" disabled className="font-mono bg-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-sm">有效期限</Label>
                        <Input placeholder="MM / YY" disabled className="bg-white" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">安全碼</Label>
                        <Input placeholder="CVV" disabled className="bg-white" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">（金流整合後啟用刷卡功能）</p>
                  </div>
                  <p className="text-xs text-blue-600 font-medium">⚡ 付款完成後系統立即自動派車</p>
                </div>
              )}

              {/* ── 即時付款：銀行轉帳 ── */}
              {paymentType === "instant" && instantMethod === "bank_transfer" && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 text-sm">
                  <div className="font-bold text-blue-800 mb-1">🏦 匯款資訊</div>
                  <div className="flex justify-between"><span className="text-gray-500">銀行</span><span className="font-mono font-bold">台灣銀行 004</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">帳號</span><span className="font-mono font-bold">012-345-678901</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">戶名</span><span className="font-mono font-bold">富詠運輸有限公司</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">金額</span><span className="font-bold text-blue-700">NT${orderResult.total_fee.toLocaleString()}</span></div>
                  <p className="text-xs text-amber-600 pt-1">※ 請於 2 小時內完成匯款，並來電告知末 5 碼</p>
                  <p className="text-xs text-blue-600 font-medium">⚡ 確認入帳後系統立即派車</p>
                </div>
              )}

              {/* ── 現金 ── */}
              {paymentType === "cash" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-800"><span>💵</span> 現金到付說明</div>
                  <ul className="text-amber-700 space-y-1 text-xs ml-4 list-disc">
                    <li>司機送達後向您收取 NT${orderResult.total_fee.toLocaleString()}</li>
                    <li>請事先備好現金，司機不找零超過 NT$500</li>
                    <li>司機完成收款後，系統自動回報已付款狀態</li>
                  </ul>
                </div>
              )}

              {/* ── 月結 ── */}
              {paymentType === "monthly" && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-bold text-violet-800"><span>📋</span> 月結帳款說明</div>
                  <ul className="text-violet-700 space-y-1 text-xs ml-4 list-disc">
                    <li>本單費用 NT${orderResult.total_fee.toLocaleString()} 將列入月結帳單</li>
                    <li>每月 {new Date().getDate() <= 15 ? "15" : "月底"} 日前統一對帳開立發票</li>
                    <li>月結資格需事先向業務申請，未申請者將改為現金收款</li>
                  </ul>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
                {orderResult.payment_instructions}
              </div>

              <Button
                className={`w-full h-12 text-base font-bold ${
                  paymentType === "instant" ? "bg-blue-600 hover:bg-blue-700" :
                  paymentType === "cash"    ? "bg-amber-500 hover:bg-amber-600" :
                                             "bg-violet-600 hover:bg-violet-700"
                }`}
                disabled={loading}
                onClick={paymentType === "instant" ? handleConfirmPayment : () => setStep("success")}
              >
                {loading ? "處理中…" :
                  paymentType === "instant" ? "確認已完成付款 → 立即派車" :
                  paymentType === "cash"    ? "確認預訂（現金到付）" :
                                             "確認預訂（月結入帳）"}
              </Button>
              <p className="text-center text-xs text-gray-400">
                {paymentType === "instant"
                  ? "付款確認後系統將立即自動派車，並透過 LINE 發送通知"
                  : paymentType === "cash"
                  ? "訂單成立後系統將自動派車，司機到達時請備妥現金"
                  : "訂單成立後系統將自動派車，費用列入月結帳單"}
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
