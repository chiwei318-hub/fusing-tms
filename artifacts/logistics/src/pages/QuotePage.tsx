import React, { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calculator, Truck, Package, Thermometer, CheckCircle2,
  Phone, Mail, Building2, Copy, Clock, MapPin, ArrowRight,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

const VEHICLE_TYPES = [
  { value: "1.75T", label: "1.75噸小貨車", capacity: "載重1.75噸 / 6m³" },
  { value: "3.5T", label: "3.5噸廂型車", capacity: "載重3.5噸 / 18m³" },
  { value: "5T", label: "5噸貨車", capacity: "載重5噸 / 25m³" },
  { value: "8.8T", label: "8.8噸貨車", capacity: "載重8.8噸 / 44m³" },
  { value: "17T", label: "17噸聯結車", capacity: "載重17噸 / 85m³" },
  { value: "26T", label: "26噸聯結車", capacity: "載重26噸 / 130m³" },
  { value: "35T", label: "35噸聯結車", capacity: "載重35噸 / 175m³" },
  { value: "43T", label: "43噸聯結車", capacity: "載重43噸 / 215m³" },
];

const SPECIAL_CARGOES = [
  { id: "1", name: "易碎品", icon: "⚠️" },
  { id: "2", name: "危險品", icon: "☣️" },
  { id: "3", name: "冷藏貨品", icon: "❄️" },
  { id: "4", name: "超長貨品(>3m)", icon: "📏" },
  { id: "5", name: "超重機械", icon: "⚙️" },
];

const COLD_CHAIN_OPTIONS = [
  { value: "冷凍(-18°C以下)", label: "冷凍（-18°C 以下）", fee: 3000 },
  { value: "冷藏(0~5°C)", label: "冷藏（0~5°C）", fee: 2000 },
  { value: "恆溫(15~25°C)", label: "恆溫（15~25°C）", fee: 1200 },
];

interface Breakdown {
  vehicleType: string;
  distanceKm: number;
  cargoWeight: number;
  volumeCbm: number;
  basePrice: number;
  distanceCharge: number;
  weightSurcharge: number;
  volumeSurcharge: number;
  coldChainFee: number;
  specialSurcharge: number;
  waitingFee: number;
  tolls: number;
  fuelSurcharge: number;
  fuelSurchargeRate: number;
  fuelSurchargeEnabled: boolean;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  profitRate: number;
  profitAmount: number;
  totalAmount: number;
  pricePerKm: number;
  waitingFeePerHour: number;
}

function fmt(n: number) {
  return `NT$${n.toLocaleString()}`;
}

export default function QuotePage() {
  const { toast } = useToast();

  const [vehicleType, setVehicleType] = useState("3.5T");
  const [distanceKm, setDistanceKm] = useState("");
  const [cargoWeight, setCargoWeight] = useState("");
  const [volumeCbm, setVolumeCbm] = useState("");
  const [pickupTime, setPickupTime] = useState("09:00");
  const [waitingHours, setWaitingHours] = useState("0");
  const [tollsFixed, setTollsFixed] = useState("0");
  const [needColdChain, setNeedColdChain] = useState(false);
  const [coldChainTemp, setColdChainTemp] = useState("");
  const [selectedSpecials, setSelectedSpecials] = useState<string[]>([]);
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [pickupDate, setPickupDate] = useState("");

  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"calc" | "contact" | "done">("calc");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [quoteToken, setQuoteToken] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleSpecial(name: string) {
    setSelectedSpecials((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  const estimate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("quotes/estimate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType,
          distanceKm: parseFloat(distanceKm) || 0,
          cargoWeight: parseFloat(cargoWeight) || 0,
          volumeCbm: parseFloat(volumeCbm) || 0,
          pickupTime,
          waitingHours: parseFloat(waitingHours) || 0,
          tollsFixed: parseInt(tollsFixed) || 0,
          needColdChain,
          coldChainTemp: needColdChain ? coldChainTemp : undefined,
          specialCargoes: selectedSpecials,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setBreakdown(data.breakdown);
        setStep("calc");
      } else {
        toast({ title: "報價失敗", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "連線失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [vehicleType, distanceKm, cargoWeight, volumeCbm, pickupTime, waitingHours, tollsFixed, needColdChain, coldChainTemp, selectedSpecials]);

  const saveQuote = useCallback(async () => {
    if (!breakdown) return;
    setSaving(true);
    try {
      const res = await fetch(getApiUrl("quotes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType,
          distanceKm: parseFloat(distanceKm) || 0,
          cargoWeight: parseFloat(cargoWeight) || 0,
          volumeCbm: parseFloat(volumeCbm) || 0,
          pickupTime,
          waitingHours: parseFloat(waitingHours) || 0,
          tollsFixed: parseInt(tollsFixed) || 0,
          needColdChain,
          coldChainTemp: needColdChain ? coldChainTemp : undefined,
          specialCargoes: selectedSpecials,
          fromAddress, toAddress, pickupDate,
          customerName, customerPhone, customerEmail, companyName,
          source: "quote-page",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setQuoteToken(data.token);
        setStep("done");
      } else {
        toast({ title: "儲存失敗", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "連線失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [breakdown, vehicleType, distanceKm, cargoWeight, volumeCbm, pickupTime, waitingHours, tollsFixed, needColdChain, coldChainTemp, selectedSpecials, fromAddress, toAddress, pickupDate, customerName, customerPhone, customerEmail, companyName]);

  const resetAll = () => {
    setBreakdown(null);
    setStep("calc");
    setQuoteToken("");
    setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setCompanyName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/30 backdrop-blur-sm px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm">富詠運輸</div>
              <div className="text-xs text-blue-300">即時報價系統</div>
            </div>
          </div>
          <div className="text-xs text-white/50">24小時線上報價 · 30分鐘報價有效</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Title */}
        <div className="text-center space-y-2 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center justify-center gap-2">
            <Calculator className="w-8 h-8 text-blue-400" />
            立即報價試算
          </h1>
          <p className="text-blue-300 text-sm">填入貨物與路線資訊，立即獲得精準報價</p>
        </div>

        {step === "done" ? (
          <div className="bg-white/10 backdrop-blur-sm border border-green-500/30 rounded-2xl p-8 text-center space-y-6">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">報價已儲存！</h2>
              <p className="text-white/70">我們的業務人員將在1小時內與您聯絡確認細節</p>
            </div>
            <div className="bg-black/30 rounded-xl p-4 space-y-2">
              <div className="text-white/60 text-sm">您的報價編號</div>
              <div className="flex items-center justify-center gap-2">
                <code className="text-blue-300 text-lg font-mono">{quoteToken}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(quoteToken); toast({ title: "已複製！" }); }}
                  className="text-white/40 hover:text-white/80 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="text-white/50 text-xs">請截圖保存此編號以便後續查詢</div>
            </div>
            {breakdown && (
              <div className="bg-blue-950/50 rounded-xl p-4 text-left space-y-2">
                <div className="text-white font-semibold text-center mb-3">報價摘要</div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">車型</span>
                  <span className="text-white">{breakdown.vehicleType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">預估總金額</span>
                  <span className="text-green-400 font-bold text-lg">{fmt(breakdown.totalAmount)}</span>
                </div>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={resetAll} variant="outline" className="border-white/20 text-white hover:bg-white/10">
                重新試算
              </Button>
              <Button
                onClick={() => window.open("tel:+886-3-000-0000")}
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                <Phone className="w-4 h-4 mr-2" />
                立即致電
              </Button>
            </div>
          </div>
        ) : step === "contact" ? (
          <div className="space-y-6">
            {/* Quote summary bar */}
            {breakdown && (
              <div className="bg-blue-600/20 border border-blue-500/30 rounded-xl px-5 py-3 flex items-center justify-between">
                <div className="text-white/80 text-sm">估算報價</div>
                <div className="text-2xl font-bold text-green-400">{fmt(breakdown.totalAmount)}</div>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-400" />
                聯絡資料（選填）
              </h2>
              <p className="text-white/60 text-sm">提供聯絡資料後，業務將主動與您確認報價細節</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">您的姓名</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="王小明"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">聯絡電話</Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0912-345-678"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">Email</Label>
                  <Input
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">公司名稱</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="XX企業有限公司"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">起點地址</Label>
                  <Input
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder="台北市中正區..."
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">終點地址</Label>
                  <Input
                    value={toAddress}
                    onChange={(e) => setToAddress(e.target.value)}
                    placeholder="桃園市平鎮區..."
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80 text-sm">預計取貨日期</Label>
                  <Input
                    type="date"
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="bg-white/10 border-white/20 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("calc")}
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                  返回修改
                </Button>
                <Button
                  onClick={saveQuote}
                  disabled={saving}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold"
                >
                  {saving ? "儲存中..." : "確認取得報價"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Calculator Step ─── */
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Form */}
            <div className="lg:col-span-3 space-y-4">

              {/* Vehicle Type */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-400" />
                  選擇車型
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {VEHICLE_TYPES.map((v) => (
                    <button
                      key={v.value}
                      onClick={() => setVehicleType(v.value)}
                      className={`rounded-xl p-3 text-left transition-all border ${
                        vehicleType === v.value
                          ? "bg-blue-600/30 border-blue-400 shadow-lg shadow-blue-500/20"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-white text-sm font-medium">{v.label}</div>
                      <div className="text-white/50 text-xs mt-0.5">{v.capacity}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cargo & Distance */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  貨物與路線
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">距離（公里）</Label>
                    <Input
                      type="number"
                      value={distanceKm}
                      onChange={(e) => setDistanceKm(e.target.value)}
                      placeholder="50"
                      min="0"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">貨物重量（kg）</Label>
                    <Input
                      type="number"
                      value={cargoWeight}
                      onChange={(e) => setCargoWeight(e.target.value)}
                      placeholder="500"
                      min="0"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">貨物體積（m³）</Label>
                    <Input
                      type="number"
                      value={volumeCbm}
                      onChange={(e) => setVolumeCbm(e.target.value)}
                      placeholder="5"
                      min="0"
                      step="0.1"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">取貨時間</Label>
                    <Input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="bg-white/10 border-white/20 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">等候時間（小時）</Label>
                    <Input
                      type="number"
                      value={waitingHours}
                      onChange={(e) => setWaitingHours(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.5"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80 text-sm">過路費（NT$）</Label>
                    <Input
                      type="number"
                      value={tollsFixed}
                      onChange={(e) => setTollsFixed(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
              </div>

              {/* Cold Chain */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-bold flex items-center gap-2">
                    <Thermometer className="w-5 h-5 text-blue-400" />
                    冷鏈溫控
                  </h2>
                  <button
                    onClick={() => { setNeedColdChain(!needColdChain); if (needColdChain) setColdChainTemp(""); }}
                    className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${
                      needColdChain ? "bg-blue-500" : "bg-white/20"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                        needColdChain ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
                {needColdChain && (
                  <div className="grid grid-cols-1 gap-2">
                    {COLD_CHAIN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setColdChainTemp(opt.value)}
                        className={`flex items-center justify-between rounded-lg p-3 border transition-all ${
                          coldChainTemp === opt.value
                            ? "bg-blue-600/30 border-blue-400"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-white text-sm">{opt.label}</span>
                        <Badge className="bg-blue-600/50 text-blue-200 text-xs">+{fmt(opt.fee)}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Special Cargo */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 space-y-4">
                <h2 className="text-white font-bold flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  特殊貨物（可複選）
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {SPECIAL_CARGOES.map((cargo) => (
                    <button
                      key={cargo.id}
                      onClick={() => toggleSpecial(cargo.name)}
                      className={`flex items-center gap-2 rounded-lg p-3 border text-left transition-all ${
                        selectedSpecials.includes(cargo.name)
                          ? "bg-orange-600/30 border-orange-400"
                          : "bg-white/5 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <span className="text-lg">{cargo.icon}</span>
                      <span className="text-white text-sm">{cargo.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={estimate}
                disabled={loading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold text-base rounded-xl"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    計算中...
                  </span>
                ) : (
                  <>
                    <Calculator className="w-5 h-5 mr-2" />
                    立即試算報價
                  </>
                )}
              </Button>
            </div>

            {/* Right: Result */}
            <div className="lg:col-span-2">
              <div className="sticky top-6 space-y-4">
                {breakdown ? (
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-4">
                      <div className="text-white/80 text-sm">估算報價</div>
                      <div className="text-3xl font-bold text-white mt-1">
                        {fmt(breakdown.totalAmount)}
                      </div>
                      <div className="text-blue-200 text-xs mt-1">含稅 · 含利潤 · 30分鐘有效</div>
                    </div>

                    <div className="p-5 space-y-2 text-sm">
                      {[
                        { label: `基本費（${breakdown.vehicleType}）`, val: breakdown.basePrice },
                        { label: `里程費（${breakdown.distanceKm}km × NT$${breakdown.pricePerKm}）`, val: breakdown.distanceCharge },
                        ...(breakdown.weightSurcharge > 0 ? [{ label: "重量附加費", val: breakdown.weightSurcharge }] : []),
                        ...(breakdown.volumeSurcharge > 0 ? [{ label: "體積附加費", val: breakdown.volumeSurcharge }] : []),
                        ...(breakdown.coldChainFee > 0 ? [{ label: `冷鏈溫控費（${breakdown.coldChainTemp ?? ""}）`, val: breakdown.coldChainFee }] : []),
                        ...(breakdown.specialSurcharge > 0 ? [{ label: "特殊貨物附加費", val: breakdown.specialSurcharge }] : []),
                        ...(breakdown.waitingFee > 0 ? [{ label: `等候費（${breakdown.waitingFeePerHour}/小時）`, val: breakdown.waitingFee }] : []),
                        ...(breakdown.tolls > 0 ? [{ label: "過路費", val: breakdown.tolls }] : []),
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-white/60">{row.label}</span>
                          <span className="text-white">{fmt(row.val)}</span>
                        </div>
                      ))}
                      {(breakdown.fuelSurcharge ?? 0) > 0 && (
                        <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                          <span className="text-amber-300 flex items-center gap-1.5">
                            ⛽ 燃油附加費（{breakdown.fuelSurchargeRate}%）
                          </span>
                          <span className="text-amber-200 font-medium">+{fmt(breakdown.fuelSurcharge)}</span>
                        </div>
                      )}

                      <Separator className="bg-white/10 my-2" />
                      <div className="flex justify-between">
                        <span className="text-white/60">小計</span>
                        <span className="text-white">{fmt(breakdown.subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">稅費（{breakdown.taxRate}%）</span>
                        <span className="text-white">{fmt(breakdown.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">管理費（{breakdown.profitRate}%）</span>
                        <span className="text-white">{fmt(breakdown.profitAmount)}</span>
                      </div>
                      <Separator className="bg-white/10 my-2" />
                      <div className="flex justify-between font-bold">
                        <span className="text-white">合計</span>
                        <span className="text-green-400 text-lg">{fmt(breakdown.totalAmount)}</span>
                      </div>
                    </div>

                    <div className="px-5 pb-5 space-y-2">
                      <Button
                        onClick={() => setStep("contact")}
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        儲存此報價
                      </Button>
                      <div className="text-center text-white/40 text-xs">
                        儲存後我們將在1小時內與您聯絡
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
                    <Calculator className="w-12 h-12 text-white/20 mx-auto" />
                    <p className="text-white/40 text-sm">填入資料後點擊「立即試算」查看報價</p>
                    <div className="space-y-2 text-xs text-white/30">
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="w-3 h-3" />即時計算
                      </div>
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="w-3 h-3" />透明費用明細
                      </div>
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="w-3 h-3" />冷鏈溫控加成
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact CTA */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="text-white/70 text-sm font-medium text-center">需要人工報價？</div>
                  <a
                    href="tel:+886300000000"
                    className="flex items-center justify-center gap-2 w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl py-2.5 text-white text-sm transition-colors"
                  >
                    <Phone className="w-4 h-4 text-blue-400" />
                    0800-000-000
                  </a>
                  <div className="text-white/30 text-xs text-center">週一至週日 7:00 ~ 22:00</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
