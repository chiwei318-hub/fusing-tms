import { useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Flame, Snowflake, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface QuoteBreakdown {
  base: number;
  coldChainSurcharge: number;
  urgencyMultiplier: number;
  peakMultiplier: number;
  isPeakHour: boolean;
  profitMargin: number;
  suggested: number;
  min: number;
  peak: number | null;
  withTax: number;
}

interface Historical {
  count: number;
  avg: number;
  min: number;
  max: number;
  marketPosition: "below" | "market" | "above";
}

interface QuoteResult {
  estimatedDistanceKm: number;
  distanceSource?: "google" | "haversine" | "provided";
  breakdown: QuoteBreakdown;
  historical: Historical | null;
}

const VEHICLE_TYPES = [
  "機車", "1.75T", "3.5T", "5T", "8.8T", "10.5T", "15T", "17T", "26T", "35T", "43T", "箱型車", "小貨車", "貨車",
];

export default function SmartQuotePanel({ initialPickup = "", initialDelivery = "" }: {
  initialPickup?: string;
  initialDelivery?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [form, setForm] = useState({
    pickupAddress: initialPickup,
    deliveryAddress: initialDelivery,
    vehicleType: "箱型車",
    distanceKm: "",
    cargoWeightKg: "",
    waitingHours: "",
    needTailgate: false,
    needHydraulicPallet: false,
    isColdChain: false,
    urgencyFactor: 1,
    pickupTime: "",
  });

  const upd = (key: keyof typeof form, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  async function handleQuote() {
    setLoading(true);
    try {
      const body: Record<string, any> = {
        vehicleType: form.vehicleType,
        needTailgate: form.needTailgate,
        needHydraulicPallet: form.needHydraulicPallet,
        isColdChain: form.isColdChain,
        urgencyFactor: form.urgencyFactor,
      };
      if (form.distanceKm) body.distanceKm = parseFloat(form.distanceKm);
      if (form.cargoWeightKg) body.cargoWeightKg = parseFloat(form.cargoWeightKg);
      if (form.waitingHours) body.waitingHours = parseFloat(form.waitingHours);
      if (form.pickupAddress) body.pickupAddress = form.pickupAddress;
      if (form.deliveryAddress) body.deliveryAddress = form.deliveryAddress;
      if (form.pickupTime) body.pickupTime = form.pickupTime;

      const data = await fetch(apiUrl("/smart-quote/v2"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());

      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "報價失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const MarketBadge = ({ pos }: { pos?: "below" | "market" | "above" }) => {
    if (!pos) return null;
    const cfg = {
      below: { label: "低於市場", icon: <TrendingDown className="w-3 h-3" />, cls: "bg-green-100 text-green-700" },
      market: { label: "符合市場", icon: <Minus className="w-3 h-3" />, cls: "bg-blue-100 text-blue-700" },
      above: { label: "高於市場", icon: <TrendingUp className="w-3 h-3" />, cls: "bg-amber-100 text-amber-700" },
    }[pos];
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
        {cfg.icon}{cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Input form */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">取貨地址</Label>
            <Input
              placeholder="台北市信義區..."
              value={form.pickupAddress}
              onChange={e => upd("pickupAddress", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">送達地址</Label>
            <Input
              placeholder="桃園市中壢區..."
              value={form.deliveryAddress}
              onChange={e => upd("deliveryAddress", e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">車種</Label>
          <Select value={form.vehicleType} onValueChange={v => upd("vehicleType", v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">距離 km（選填，可自動估算）</Label>
          <Input
            type="number" min={0} placeholder="自動計算"
            value={form.distanceKm}
            onChange={e => upd("distanceKm", e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">貨重 kg</Label>
          <Input
            type="number" min={0} placeholder="0"
            value={form.cargoWeightKg}
            onChange={e => upd("cargoWeightKg", e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">取貨時間</Label>
          <Input
            type="datetime-local"
            value={form.pickupTime}
            onChange={e => upd("pickupTime", e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Toggles */}
        <div className="col-span-2 flex flex-wrap gap-4 pt-1">
          {[
            { key: "needTailgate", label: "尾板", icon: null },
            { key: "needHydraulicPallet", label: "液壓台車", icon: null },
            { key: "isColdChain", label: "冷鏈", icon: <Snowflake className="w-3.5 h-3.5 text-sky-500" /> },
          ].map(({ key, label, icon }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <Switch
                checked={form[key as keyof typeof form] as boolean}
                onCheckedChange={v => upd(key as keyof typeof form, v)}
              />
              <span className="text-sm flex items-center gap-1">{icon}{label}</span>
            </label>
          ))}
        </div>

        {/* Urgency factor */}
        <div className="col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              急單係數
            </Label>
            <span className="text-xs font-mono text-amber-600 font-semibold">×{form.urgencyFactor.toFixed(1)}</span>
          </div>
          <Slider
            value={[form.urgencyFactor]}
            onValueChange={([v]) => upd("urgencyFactor", v)}
            min={1} max={2} step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>一般</span><span>急單 ×1.5</span><span>緊急 ×2.0</span>
          </div>
        </div>
      </div>

      <Button onClick={handleQuote} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700">
        {loading
          ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />計算中…</>
          : <><Sparkles className="w-4 h-4 mr-2" />AI 智慧報價</>
        }
      </Button>

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Main price card */}
          <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">建議報價</p>
                  <p className="text-3xl font-bold text-violet-700">
                    NT${result.breakdown.suggested.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    含稅 NT${result.breakdown.withTax.toLocaleString()}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  {result.breakdown.isPeakHour && (
                    <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      <Flame className="w-3 h-3" />尖峰時段 ×{result.breakdown.peakMultiplier.toFixed(1)}
                    </div>
                  )}
                  {form.isColdChain && (
                    <div className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                      <Snowflake className="w-3 h-3" />冷鏈 +NT$1,500
                    </div>
                  )}
                  {form.urgencyFactor > 1 && (
                    <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Zap className="w-3 h-3" />急單 ×{form.urgencyFactor.toFixed(1)}
                    </div>
                  )}
                  {result.historical && <MarketBadge pos={result.historical.marketPosition} />}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-violet-100">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">底標</p>
                  <p className="text-sm font-bold text-gray-700">NT${result.breakdown.min.toLocaleString()}</p>
                </div>
                <div className="text-center border-x border-violet-100">
                  <p className="text-[10px] text-gray-400">建議</p>
                  <p className="text-sm font-bold text-violet-600">NT${result.breakdown.suggested.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">
                    估算里程
                    {result.distanceSource === "google" && (
                      <span className="ml-1 text-green-600">🗺️</span>
                    )}
                  </p>
                  <p className="text-sm font-bold text-gray-700">{result.estimatedDistanceKm} km</p>
                  {result.distanceSource && result.distanceSource !== "provided" && (
                    <p className="text-[9px] text-gray-400">
                      {result.distanceSource === "google" ? "Google Maps路線" : "直線估算×1.25"}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historical comparison */}
          {result.historical && (
            <Card className="border-0 bg-gray-50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-600">歷史成交參考（近 90 天，{result.historical.count} 筆）</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center bg-white rounded p-2">
                    <p className="text-[10px] text-gray-400">最低</p>
                    <p className="text-sm font-bold text-green-600">NT${result.historical.min.toLocaleString()}</p>
                  </div>
                  <div className="text-center bg-white rounded p-2">
                    <p className="text-[10px] text-gray-400">平均</p>
                    <p className="text-sm font-bold text-blue-600">NT${result.historical.avg.toLocaleString()}</p>
                  </div>
                  <div className="text-center bg-white rounded p-2">
                    <p className="text-[10px] text-gray-400">最高</p>
                    <p className="text-sm font-bold text-red-500">NT${result.historical.max.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Breakdown toggle */}
          <button
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mx-auto"
            onClick={() => setShowDetail(!showDetail)}
          >
            {showDetail ? <><ChevronUp className="w-3 h-3" />隱藏明細</> : <><ChevronDown className="w-3 h-3" />查看費用明細</>}
          </button>

          {showDetail && (
            <div className="text-xs space-y-1 bg-gray-50 rounded-lg p-3">
              {[
                ["基本運費", `NT$${result.breakdown.base.toLocaleString()}`],
                form.isColdChain && ["冷鏈附加費", `NT$${result.breakdown.coldChainSurcharge.toLocaleString()}`],
                ["利潤加成", `NT$${result.breakdown.profitMargin.toLocaleString()}`],
                result.breakdown.isPeakHour && ["尖峰加乘", `×${result.breakdown.peakMultiplier.toFixed(1)}`],
                form.urgencyFactor > 1 && ["急單係數", `×${result.breakdown.urgencyMultiplier.toFixed(1)}`],
                ["建議報價（未稅）", `NT$${result.breakdown.suggested.toLocaleString()}`],
                ["含稅（5%）", `NT$${result.breakdown.withTax.toLocaleString()}`],
              ].filter(Boolean).map(([label, val]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
