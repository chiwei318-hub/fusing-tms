import { useState, useEffect } from "react";
import {
  Truck, MapPin, Calculator, ShoppingCart, ChevronRight,
  CheckCircle2, Loader2, Building2, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Partner { id: number; partner_id: string; partner_name: string; tier: string }

interface QuoteResult {
  ok: boolean;
  client_name: string;
  price: number;
  profit: number;
  distance: string;
  applied_surcharges: string[];
  breakdown: {
    distance_km: number;
    base_price: number;
    rate_per_km: number;
    distance_fee: number;
    surcharge_total: number;
    profit_margin: number;
    total_price: number;
    detail: string;
    distance_source: string;
  };
}

const VEHICLE_TYPES = [
  { value: "3.5t",  label: "3.5噸貨車", icon: "🚚" },
  { value: "8.5t",  label: "8.5噸貨車", icon: "🚛" },
  { value: "17t",   label: "17噸貨車",  icon: "🚛" },
  { value: "35t",   label: "35噸聯結車",icon: "🏗️" },
];

const TIER_BADGE: Record<string, string> = {
  VIP: "bg-yellow-100 text-yellow-800 border-yellow-300",
  一般: "bg-blue-100 text-blue-800 border-blue-300",
  加盟商: "bg-purple-100 text-purple-800 border-purple-300",
};

export default function PartnerQuotePage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState({
    partner_id: "",
    origin: "",
    destination: "",
    car_type: "3.5t",
    tailgate: false,
    cold_chain: false,
    gull_wing: false,
  });
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${API}/api/freight-quote/partners`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPartners(d.partners.filter((p: any) => p.active)); })
      .catch(() => {});
  }, []);

  const calculate = async () => {
    if (!form.partner_id || !form.origin || !form.destination) {
      toast({ title: "請填入廠商、起點和終點", variant: "destructive" });
      return;
    }
    setCalculating(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/api/freight-quote/partner-calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id:  form.partner_id,
          origin:      form.origin,
          destination: form.destination,
          car_type:    form.car_type,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setResult(d);
    } catch (e: any) {
      toast({ title: "報價計算失敗", description: e.message, variant: "destructive" });
    } finally { setCalculating(false); }
  };

  const placeOrder = () => {
    const params = new URLSearchParams({
      pickup:   form.origin,
      delivery: form.destination,
      vehicle:  form.car_type,
    });
    window.location.href = `${import.meta.env.BASE_URL}order-form?${params}`;
  };

  const selectedPartner = partners.find(p => p.partner_id === form.partner_id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">富詠全智慧物流</h1>
            <p className="text-blue-300 text-xs mt-0.5">廠商合約報價入口</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* ─ 左側：報價表單 ─────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-white">即時報價計算</h2>
            <p className="text-blue-200/70 text-sm mt-1">依您的合約等級即時顯示專屬報價</p>
          </div>

          <div className="bg-white/8 backdrop-blur rounded-2xl border border-white/10 p-6 space-y-5">

            {/* 廠商選擇 */}
            <div className="space-y-2">
              <Label className="text-white/90 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                廠商合約
              </Label>
              <Select value={form.partner_id} onValueChange={v => setForm(f => ({ ...f, partner_id: v }))}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="選擇您的廠商合約" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map(p => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>
                      <span className="flex items-center gap-2">
                        <span>{p.partner_name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${TIER_BADGE[p.tier] ?? ""}`}>{p.tier}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 起點 */}
            <div className="space-y-2">
              <Label className="text-white/90 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-400" />
                取貨地址
              </Label>
              <Input
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                placeholder="如：台北市信義區松仁路100號"
                value={form.origin}
                onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
              />
            </div>

            {/* 終點 */}
            <div className="space-y-2">
              <Label className="text-white/90 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-400" />
                送貨地址
              </Label>
              <Input
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                placeholder="如：新北市板橋區縣民大道一段100號"
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
              />
            </div>

            {/* 車型 */}
            <div className="space-y-2">
              <Label className="text-white/90 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-400" />
                車型選擇
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {VEHICLE_TYPES.map(v => (
                  <button
                    key={v.value}
                    onClick={() => setForm(f => ({ ...f, car_type: v.value }))}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                      form.car_type === v.value
                        ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20"
                        : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-lg">{v.icon}</span>
                    <span className="text-sm font-medium">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 特殊設備 */}
            <div className="space-y-2">
              <Label className="text-white/90 flex items-center gap-2">
                <Package className="w-4 h-4 text-yellow-400" />
                特殊設備加成
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "tailgate", label: "尾門", note: "+$500" },
                  { key: "cold_chain", label: "冷凍", note: "×1.5" },
                  { key: "gull_wing", label: "鷗翼", note: "+$300" },
                ].map(eq => (
                  <label key={eq.key} className={`flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all gap-1 ${
                    form[eq.key as keyof typeof form]
                      ? "bg-yellow-500/20 border-yellow-400 text-yellow-300"
                      : "bg-white/5 border-white/15 text-white/60 hover:bg-white/10"
                  }`}>
                    <Checkbox
                      checked={!!form[eq.key as keyof typeof form]}
                      onCheckedChange={v => setForm(f => ({ ...f, [eq.key]: !!v }))}
                      className="hidden"
                    />
                    <span className="text-sm font-medium">{eq.label}</span>
                    <span className="text-xs opacity-75">{eq.note}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30"
              onClick={calculate}
              disabled={calculating}
            >
              {calculating ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />計算中…</>
              ) : (
                <><Calculator className="w-5 h-5 mr-2" />即時計算合約報價</>
              )}
            </Button>
          </div>
        </div>

        {/* ─ 右側：報價結果 ─────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {selectedPartner && (
            <div className={`rounded-xl border px-4 py-3 ${TIER_BADGE[selectedPartner.tier] ?? "bg-gray-100"}`}>
              <p className="text-xs font-semibold opacity-70">合約廠商</p>
              <p className="font-bold text-sm">{selectedPartner.partner_name}</p>
              <p className="text-xs mt-0.5">{selectedPartner.tier} 等級合約</p>
            </div>
          )}

          {result ? (
            <div className="bg-white rounded-2xl shadow-2xl shadow-blue-900/40 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">合約報價結果</span>
                </div>
                <div className="text-4xl font-black mt-1">
                  ${result.price.toLocaleString()}
                </div>
                <div className="text-blue-200 text-sm mt-1">（含稅前合約價）</div>
              </div>

              <div className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">費用明細</h3>
                {[
                  { label: "起步價", value: `$${result.breakdown.base_price.toLocaleString()}` },
                  { label: `里程費（${result.distance}）`, value: `$${result.breakdown.distance_fee.toLocaleString()}` },
                  ...(result.breakdown.surcharge_total > 0 ? [{ label: "特殊區域加成", value: `+$${result.breakdown.surcharge_total.toLocaleString()}` }] : []),
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono font-medium">{row.value}</span>
                  </div>
                ))}

                {result.applied_surcharges.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {result.applied_surcharges.map(s => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}

                <div className="border-t pt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">路線來源</span>
                  <span className="text-xs text-muted-foreground">
                    {result.breakdown.distance_source === "google" ? "Google Maps 精算" : "Haversine 估算"}
                  </span>
                </div>

                <Button
                  className="w-full mt-2 bg-green-600 hover:bg-green-500 text-white font-semibold shadow"
                  onClick={placeOrder}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  立即下單
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-white/40 text-center min-h-[300px]">
              <Calculator className="w-12 h-12" />
              <p className="text-sm">填入廠商與地址後<br />點擊計算即時查看您的合約報價</p>
            </div>
          )}

          {/* 車型權重說明 */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-white/70 text-xs font-semibold mb-2">車型計費權重</p>
            <div className="space-y-1">
              {[
                { name: "3.5t", weight: "× 1.0" },
                { name: "8.5t", weight: "× 1.6" },
                { name: "17t",  weight: "× 2.8" },
                { name: "35t",  weight: "× 4.2" },
              ].map(r => (
                <div key={r.name} className="flex justify-between text-xs text-white/50">
                  <span>{r.name} 貨車</span>
                  <span className="font-mono">{r.weight}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
