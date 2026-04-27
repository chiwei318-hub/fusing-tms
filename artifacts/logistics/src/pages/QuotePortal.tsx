/**
 * 模組 5：廠商查價入口（公開頁）
 * 路由：/quote/:partnerId?t=<token>
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Truck, MapPin, Calculator, ShoppingCart, ChevronRight,
  CheckCircle2, Loader2, Package, Building2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

const VEHICLE_TYPES = [
  { value: "3.5t",  label: "3.5噸小貨車", factor: "× 1.0" },
  { value: "8.5t",  label: "8.5噸中貨車", factor: "× 1.6" },
  { value: "17t",   label: "17噸大貨車",   factor: "× 2.8" },
  { value: "35t",   label: "35噸聯結車",   factor: "× 4.2" },
];

const EQUIPMENT_LIST = [
  { code: "tailgate", label: "尾門",  note: "+$500" },
  { code: "frozen",   label: "冷凍",  note: "×1.5"  },
  { code: "gullwing", label: "鷗翼",  note: "+$300" },
];

interface QuoteSummary {
  distance_km: number;
  duration_min: number;
  vehicle_type: string;
  partner_price: number;
  equipment: { name: string; surcharge: number; multiplier: number }[];
  distance_source: string;
}

interface Breakdown {
  base_price: number;
  km_fee: number;
  weight_factor: number;
  equipment_list: { name: string; surcharge: number; multiplier: number }[];
  total: number;
}

export default function QuotePortal() {
  const [location] = useLocation();

  // Extract partnerId from path /quote/:partnerId
  const match = location.match(/\/quote\/(\d+)/);
  const pathPartnerId = match ? match[1] : null;
  const searchParams = new URLSearchParams(window.location.search);
  const tokenParam = searchParams.get("t") ?? "";

  const [partner, setPartner] = useState<{ id: number; name: string; contract_type: string } | null>(null);
  const [token, setToken] = useState(tokenParam);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState("");

  const [form, setForm] = useState({
    pickup: "",
    delivery: "",
    vehicle_type: "3.5t",
    equipment: [] as string[],
    contact_name: "",
    contact_phone: "",
    notes: "",
  });

  const [quote, setQuote] = useState<{ summary: QuoteSummary; breakdown: Breakdown } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [ordered, setOrdered] = useState<{ id: number; order_no: string } | null>(null);
  const { toast } = useToast();

  // Verify token or partner_id on mount
  const verify = useCallback(async () => {
    if (!pathPartnerId && !token) { setAuthError("請使用廠商專屬連結進入本頁面"); return; }
    setVerifying(true);
    try {
      const r = await fetch(`${API}/api/quote-portal/verify-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token || undefined, partner_id: pathPartnerId ? parseInt(pathPartnerId) : undefined }),
      });
      const d = await r.json();
      if (!d.ok) { setAuthError(d.error ?? "驗證失敗"); return; }
      setPartner(d.partner);
      setToken(d.token);
      setVerified(true);
    } catch { setAuthError("連線失敗，請稍後再試"); }
    finally { setVerifying(false); }
  }, [pathPartnerId, token]);

  useEffect(() => { verify(); }, [verify]);

  const toggleEquipment = (code: string) =>
    setForm(f => ({
      ...f,
      equipment: f.equipment.includes(code)
        ? f.equipment.filter(c => c !== code)
        : [...f.equipment, code],
    }));

  const calculate = async () => {
    if (!form.pickup || !form.delivery) {
      toast({ title: "請輸入取貨和送貨地址", variant: "destructive" });
      return;
    }
    setCalculating(true);
    setQuote(null);
    try {
      const r = await fetch(`${API}/api/quote-portal/get-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          partner_id: pathPartnerId,
          pickup: form.pickup,
          delivery: form.delivery,
          vehicle_type: form.vehicle_type,
          equipment: form.equipment,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setQuote({ summary: d.quote_summary, breakdown: d.breakdown });
    } catch (e: any) {
      toast({ title: "報價計算失敗", description: e.message, variant: "destructive" });
    } finally { setCalculating(false); }
  };

  const placeOrder = async () => {
    if (!quote) return;
    setOrdering(true);
    try {
      const r = await fetch(`${API}/api/quote-portal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          partner_id: pathPartnerId,
          pickup: form.pickup,
          delivery: form.delivery,
          vehicle_type: form.vehicle_type,
          total_quote: quote.summary.partner_price,
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          notes: form.notes,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setOrdered(d.order);
    } catch (e: any) {
      toast({ title: "下單失敗", description: e.message, variant: "destructive" });
    } finally { setOrdering(false); }
  };

  // ── 驗證中 / 失敗畫面 ──────────────────────────────────────────────────────
  if (verifying) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-500 text-sm">驗證廠商身份中…</p>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-800">無法驗證廠商身份</h2>
          <p className="text-gray-500 text-sm">{authError}</p>
          <p className="text-xs text-gray-400">請聯繫富詠運輸取得您的專屬查價連結</p>
        </div>
      </div>
    );
  }

  // ── 下單成功畫面 ────────────────────────────────────────────────────────────
  if (ordered) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">訂單已成立！</h2>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">訂單號</span>
              <span className="font-mono font-bold">{ordered.order_no ?? `#${ordered.id}`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">取貨</span>
              <span className="text-right max-w-[180px] text-xs">{form.pickup}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">送貨</span>
              <span className="text-right max-w-[180px] text-xs">{form.delivery}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">報價</span>
              <span className="font-bold text-blue-700">${quote?.summary.partner_price.toLocaleString()}</span>
            </div>
          </div>
          <p className="text-sm text-gray-500">富詠運輸將盡快聯繫您確認時間</p>
          <Button variant="outline" className="w-full" onClick={() => { setOrdered(null); setQuote(null); }}>
            繼續新增報價
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-gray-900 leading-none">富詠全智慧物流</p>
            <p className="text-blue-600 text-xs mt-0.5">廠商查價入口</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">{partner?.name}</span>
            </div>
            <Badge variant="outline" className="text-xs">{partner?.contract_type ?? "standard"} 合約</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">

        {/* 地址輸入 */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            配送地址
          </h2>
          <div className="space-y-3">
            <div>
              <Label className="text-sm text-gray-600 mb-1.5 block">取貨地址</Label>
              <Input
                placeholder="如：台北市信義區松仁路100號"
                value={form.pickup}
                onChange={e => setForm(f => ({ ...f, pickup: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-sm text-gray-600 mb-1.5 block">送貨地址</Label>
              <Input
                placeholder="如：新北市板橋區縣民大道一段100號"
                value={form.delivery}
                onChange={e => setForm(f => ({ ...f, delivery: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* 車型 */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            車型選擇
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map(v => (
              <button
                key={v.value}
                onClick={() => setForm(f => ({ ...f, vehicle_type: v.value }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  form.vehicle_type === v.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className="font-semibold text-sm text-gray-800">{v.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">權重 {v.factor}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 特殊設備 */}
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            特殊設備（選填）
          </h2>
          <div className="flex gap-3">
            {EQUIPMENT_LIST.map(eq => {
              const active = form.equipment.includes(eq.code);
              return (
                <button
                  key={eq.code}
                  onClick={() => toggleEquipment(eq.code)}
                  className={`flex-1 py-3 px-2 rounded-xl border-2 transition-all text-center ${
                    active ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <p className={`font-semibold text-sm ${active ? "text-amber-700" : "text-gray-700"}`}>{eq.label}</p>
                  <p className={`text-xs mt-0.5 ${active ? "text-amber-500" : "text-gray-400"}`}>{eq.note}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 計算按鈕 */}
        <Button
          className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md"
          onClick={calculate}
          disabled={calculating}
        >
          {calculating
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />計算中…</>
            : <><Calculator className="w-5 h-5 mr-2" />即時計算合約報價</>
          }
        </Button>

        {/* 報價結果 */}
        {quote && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 text-white">
              <p className="text-blue-200 text-sm">合約報價（{partner?.name}）</p>
              <p className="text-4xl font-black mt-1">${quote.summary.partner_price.toLocaleString()}</p>
              <p className="text-blue-200 text-xs mt-1">
                {quote.summary.distance_km} km｜{quote.summary.duration_min ?? "-"} 分鐘
                {quote.summary.distance_source === "google" ? "｜Google Maps 精算" : ""}
              </p>
            </div>

            <div className="p-5 space-y-3">
              {[
                { label: "起步費", val: quote.breakdown.base_price },
                { label: `里程費 (${quote.summary.distance_km}km)`, val: quote.breakdown.km_fee },
                ...(quote.breakdown.equipment_list.map(eq => ({
                  label: eq.name + (eq.surcharge > 0 ? ` +$${eq.surcharge}` : "") + (eq.multiplier > 1 ? ` ×${eq.multiplier}` : ""),
                  val: null as number | null,
                }))),
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  {row.val !== null && <span className="font-mono font-medium text-gray-800">${row.val.toLocaleString()}</span>}
                </div>
              ))}

              <div className="border-t pt-3 flex justify-between font-bold text-blue-700">
                <span>廠商合約價</span>
                <span>${quote.summary.partner_price.toLocaleString()}</span>
              </div>

              {/* 聯絡資訊 */}
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-gray-500">下單聯絡資訊（選填）</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="聯絡人姓名"
                    className="text-sm"
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  />
                  <Input
                    placeholder="聯絡電話"
                    className="text-sm"
                    value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                  />
                </div>
                <Input
                  placeholder="備注（選填）"
                  className="text-sm"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <Button
                className="w-full h-11 bg-green-600 hover:bg-green-500 text-white font-semibold shadow"
                onClick={placeOrder}
                disabled={ordering}
              >
                {ordering
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />下單中…</>
                  : <><ShoppingCart className="w-4 h-4 mr-2" />立即下單<ChevronRight className="w-4 h-4 ml-1" /></>
                }
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
