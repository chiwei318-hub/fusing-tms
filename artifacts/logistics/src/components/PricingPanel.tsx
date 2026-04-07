import { useState, useEffect } from "react";
import {
  Calculator, Lock, Bell, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Clock, Weight, Box, Zap, Star, Plus,
  User, Percent, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Breakdown {
  distanceKm: number;
  base: number;
  weightFee: number;
  volumeFee: number;
  timeFee: number;
  timeSlot: "peak" | "night" | "normal";
  specialFee: number;
  specialItems: string[];
  anomalyFee: number;
  anomalyItems: string[];
  subtotal: number;
  discountPct?: number;
  discountAmount?: number;
  total: number;
}

interface CustomerPricing {
  customerId?: number;
  customerName?: string;
  priceLevel?: string;
  priceLevelLabel?: string;
  discountPct: number;
}

interface PricingPanelProps {
  order: {
    id: number;
    distanceKm?: number | null;
    cargoWeight?: number | null;
    cargoLengthM?: number | null;
    cargoWidthM?: number | null;
    cargoHeightM?: number | null;
    pickupTime?: string | null;
    needTailgate?: string | null;
    needHydraulicPallet?: string | null;
    specialRequirements?: string | null;
    totalFee?: number | null;
    basePrice?: number | null;
    priceLocked?: boolean | null;
    priceLockedAt?: string | null;
    priceLockedBy?: string | null;
    pricingBreakdown?: string | null;
    arrivalNotifiedAt?: string | null;
    waitMinutes?: number | null;
    surchargeAmount?: number | null;
    surchargeReason?: string | null;
    customerPhone?: string | null;
    customerName?: string | null;
    status?: string;
  };
  mode?: "admin" | "driver";
  onRefresh?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseBd(raw: unknown): Breakdown | null {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw as Breakdown; } catch { return null; }
}

const slotLabel: Record<string, string> = {
  peak: "⚡ 尖峰時段 (+20%)",
  night: "🌙 夜間時段 (+30%)",
  normal: "一般時段",
};

const LEVEL_STYLE: Record<string, string> = {
  vip: "bg-yellow-100 text-yellow-800 border-yellow-300",
  enterprise: "bg-blue-100 text-blue-800 border-blue-300",
  custom: "bg-purple-100 text-purple-800 border-purple-300",
  standard: "bg-gray-100 text-gray-700 border-gray-200",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function PricingPanel({ order, mode = "admin", onRefresh }: PricingPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(parseBd(order.pricingBreakdown));
  const [distKm, setDistKm] = useState<string>(String(order.distanceKm ?? ""));
  const [waitMin, setWaitMin] = useState<string>(String(order.waitMinutes ?? "0"));
  const [overKg, setOverKg] = useState<string>("0");
  const [excessItems, setExcessItems] = useState<string>("0");
  const [surchargeReason, setSurchargeReason] = useState<string>("");
  const [surchargeAmt, setSurchargeAmt] = useState<string>("0");
  const [showSurcharge, setShowSurcharge] = useState(false);

  // Customer pricing
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing | null>(null);
  const [discountOverride, setDiscountOverride] = useState<string>("");
  const [showDiscountOverride, setShowDiscountOverride] = useState(false);

  const isLocked = !!order.priceLocked;
  const wasNotified = !!order.arrivalNotifiedAt;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
  };

  // Load customer pricing when panel opens
  useEffect(() => {
    if (!open || customerPricing !== null) return;
    fetch(`${BASE_URL}/api/orders/${order.id}/customer-pricing`)
      .then(r => r.ok ? r.json() : null)
      .then((data: CustomerPricing | null) => {
        if (data) {
          setCustomerPricing(data);
          if (discountOverride === "") setDiscountOverride(String(data.discountPct ?? 0));
        }
      })
      .catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveDiscount = discountOverride !== "" ? parseFloat(discountOverride) || 0 : (customerPricing?.discountPct ?? 0);

  const handleCalculate = async (save = false) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${order.id}/calculate-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceKm: distKm ? parseFloat(distKm) : undefined,
          waitMinutes: parseFloat(waitMin) || 0,
          overweightKg: parseFloat(overKg) || 0,
          excessItems: parseFloat(excessItems) || 0,
          discountPct: effectiveDiscount,
          save,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBreakdown(data.breakdown);
      if (data.customerPricing && !customerPricing) setCustomerPricing(data.customerPricing);
      if (save) { toast({ title: "✅ 運費已計算並儲存" }); invalidate(); onRefresh?.(); }
      else setOpen(true);
    } catch (e: unknown) {
      toast({ title: "計算失敗", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleNotify = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${order.id}/notify-arrival`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "📲 已發送到達通知", description: data.message });
      invalidate(); onRefresh?.();
    } catch (e: unknown) {
      toast({ title: "通知失敗", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleLock = async (by: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${order.id}/lock-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lockedBy: by }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "🔒 價格已鎖定", description: `由 ${by} 確認，NT$${breakdown?.total ?? order.totalFee ?? "—"}` });
      invalidate(); onRefresh?.();
    } catch (e: unknown) {
      toast({ title: "鎖定失敗", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleAddSurcharge = async () => {
    const amt = parseFloat(surchargeAmt);
    if (!amt || !surchargeReason.trim()) {
      toast({ title: "請填寫金額與原因", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${order.id}/add-surcharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, reason: surchargeReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `⚠️ 已加計異常費 NT$${amt}`, description: surchargeReason });
      setSurchargeAmt("0"); setSurchargeReason(""); setShowSurcharge(false);
      invalidate(); onRefresh?.();
    } catch (e: unknown) {
      toast({ title: "加計失敗", description: String((e as Error).message), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const displayBd = breakdown;
  const displayTotal = displayBd?.total ?? order.totalFee ?? null;

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-700 to-blue-800 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-white" />
          <span className="text-sm font-bold text-white">計價系統</span>
          {isLocked && <Lock className="w-3.5 h-3.5 text-yellow-300" />}
        </div>
        <div className="flex items-center gap-2">
          {displayTotal != null && (
            <span className="text-orange-300 font-black text-base">NT${displayTotal.toLocaleString()}</span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-4">

          {/* ── Customer Pricing Info ─────────────── */}
          {customerPricing?.customerName ? (
            <div className="rounded-xl border bg-gradient-to-br from-slate-50 to-blue-50 p-3 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <User className="w-3 h-3" /> 客戶批價設定
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">{customerPricing.customerName}</span>
                {customerPricing.priceLevel && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${LEVEL_STYLE[customerPricing.priceLevel] ?? LEVEL_STYLE.standard}`}
                  >
                    <Tag className="w-2.5 h-2.5 mr-1" />
                    {customerPricing.priceLevelLabel ?? customerPricing.priceLevel}
                  </Badge>
                )}
                {customerPricing.discountPct > 0 && (
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-300">
                    <Percent className="w-2.5 h-2.5 mr-1" />
                    折扣 {customerPricing.discountPct}%
                  </Badge>
                )}
              </div>

              {/* Discount override (admin only) */}
              {mode === "admin" && !isLocked && (
                <div>
                  <button
                    className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1"
                    onClick={() => setShowDiscountOverride(v => !v)}
                  >
                    <Percent className="w-3 h-3" />
                    {showDiscountOverride ? "收起" : "調整折扣"}
                  </button>
                  {showDiscountOverride && (
                    <div className="mt-2 flex items-center gap-2">
                      <Label className="text-xs shrink-0">折扣（%）</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={discountOverride}
                        onChange={e => setDiscountOverride(e.target.value)}
                        placeholder={String(customerPricing.discountPct)}
                        className="h-7 text-sm w-24"
                      />
                      <span className="text-xs text-muted-foreground">套用至本次計算</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No customer found */
            order.customerPhone && (
              <div className="rounded-xl border border-dashed border-muted p-3 flex items-center gap-2 text-xs text-muted-foreground">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span>{order.customerName ?? order.customerPhone} · 無特定批價設定（使用標準定價）</span>
              </div>
            )
          )}

          {/* ── Arrival Notification ──────────────── */}
          <div className={`rounded-xl p-3 border ${wasNotified ? "bg-emerald-50 border-emerald-200" : "bg-blue-50 border-blue-200"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-blue-600" />
                  到達取貨通知
                </p>
                {wasNotified ? (
                  <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    已通知（{new Date(order.arrivalNotifiedAt!).toLocaleString("zh-TW", { timeStyle: "short" })}）
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">通知客戶司機、車牌及到達時間</p>
                )}
              </div>
              <Button
                size="sm"
                variant={wasNotified ? "outline" : "default"}
                className={`text-xs h-8 gap-1 ${wasNotified ? "border-emerald-300 text-emerald-700" : "bg-blue-600 hover:bg-blue-700"}`}
                onClick={handleNotify}
                disabled={loading}
              >
                <Bell className="w-3 h-3" />
                {wasNotified ? "重新通知" : "發送通知"}
              </Button>
            </div>
            {wasNotified && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-emerald-800">
                <div className="bg-white/60 rounded p-1.5 text-center"><span className="block font-bold text-base">📞</span>{order.customerPhone ?? "—"}</div>
                <div className="bg-white/60 rounded p-1.5 text-center"><span className="block font-bold text-base">🚛</span>司機已派</div>
                <div className="bg-white/60 rounded p-1.5 text-center"><span className="block font-bold text-base">📍</span>正在前往</div>
              </div>
            )}
          </div>

          {/* ── Price Lock Status ─────────────────── */}
          {isLocked && (
            <div className="rounded-xl p-3 bg-yellow-50 border border-yellow-200 flex items-center gap-3">
              <Lock className="w-5 h-5 text-yellow-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-yellow-800">價格已鎖定</p>
                <p className="text-xs text-yellow-700">
                  {order.priceLockedBy} 確認 · {order.priceLockedAt ? new Date(order.priceLockedAt).toLocaleString("zh-TW") : ""}
                </p>
              </div>
              <span className="ml-auto text-orange-600 font-black text-xl">NT${(order.totalFee ?? 0).toLocaleString()}</span>
            </div>
          )}

          {/* ── Inputs ───────────────────────────── */}
          {!isLocked && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">計價參數</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Zap className="w-3 h-3" />距離（公里）</Label>
                  <Input type="number" min="0" step="0.1" value={distKm} onChange={e => setDistKm(e.target.value)} placeholder="e.g. 25" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" />等候（分鐘）</Label>
                  <Input type="number" min="0" step="1" value={waitMin} onChange={e => setWaitMin(e.target.value)} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Weight className="w-3 h-3" />超重（公斤）</Label>
                  <Input type="number" min="0" value={overKg} onChange={e => setOverKg(e.target.value)} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Box className="w-3 h-3" />超件（件數）</Label>
                  <Input type="number" min="0" value={excessItems} onChange={e => setExcessItems(e.target.value)} placeholder="0" className="h-8 text-sm" />
                </div>
              </div>
              {effectiveDiscount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                  <Percent className="w-3 h-3" />
                  已套用客戶折扣 <strong>{effectiveDiscount}%</strong>（將減扣運費小計）
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs h-9 gap-1" onClick={() => handleCalculate(false)} disabled={loading}>
                  <Calculator className="w-3.5 h-3.5" /> 試算
                </Button>
                <Button size="sm" className="flex-1 text-xs h-9 gap-1 bg-blue-700 hover:bg-blue-800" onClick={() => handleCalculate(true)} disabled={loading}>
                  <Calculator className="w-3.5 h-3.5" /> 計算並儲存
                </Button>
              </div>
            </div>
          )}

          {/* ── Breakdown ────────────────────────── */}
          {displayBd && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">費用明細</p>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" />基本運費（{displayBd.distanceKm}km）</span>
                  <span className="font-medium">NT${displayBd.base.toLocaleString()}</span>
                </div>
                {displayBd.weightFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Weight className="w-3 h-3" />重量費</span>
                    <span className="font-medium">+NT${displayBd.weightFee.toLocaleString()}</span>
                  </div>
                )}
                {displayBd.volumeFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Box className="w-3 h-3" />材積費</span>
                    <span className="font-medium">+NT${displayBd.volumeFee.toLocaleString()}</span>
                  </div>
                )}
                {displayBd.timeFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" />{slotLabel[displayBd.timeSlot]}</span>
                    <span className="font-medium text-amber-600">+NT${displayBd.timeFee.toLocaleString()}</span>
                  </div>
                )}
                {displayBd.specialFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-600 flex items-center gap-1"><Star className="w-3 h-3" />特殊需求費</span>
                    <span className="font-medium text-blue-600">+NT${displayBd.specialFee.toLocaleString()}</span>
                  </div>
                )}
                {displayBd.specialItems.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-4">
                    {displayBd.specialItems.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs border-blue-200 text-blue-700">{s}</Badge>
                    ))}
                  </div>
                )}

                {/* 小計 (before discount) */}
                {(displayBd.discountPct ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-muted-foreground border-t pt-1.5">
                      <span>小計</span>
                      <span>NT${displayBd.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        客戶折扣 {displayBd.discountPct}%
                      </span>
                      <span className="font-medium">−NT${(displayBd.discountAmount ?? 0).toLocaleString()}</span>
                    </div>
                  </>
                )}

                {displayBd.anomalyFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />異常加價</span>
                    <span className="font-medium text-red-600">+NT${displayBd.anomalyFee.toLocaleString()}</span>
                  </div>
                )}
                {displayBd.anomalyItems.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-4">
                    {displayBd.anomalyItems.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs border-red-200 text-red-700">{s}</Badge>
                    ))}
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-black text-base">
                  <span>合計</span>
                  <span className="text-orange-600">NT${displayBd.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Lock Buttons */}
              {!isLocked && (
                <div className={`grid gap-2 ${mode === "admin" ? "grid-cols-3" : "grid-cols-2"}`}>
                  {mode === "admin" && (
                    <Button variant="outline" size="sm" className="text-xs h-9 gap-1 border-blue-200 text-blue-700"
                      onClick={() => handleLock("admin")} disabled={loading}>
                      <Lock className="w-3 h-3" /> 管理員確認
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="text-xs h-9 gap-1 border-emerald-300 text-emerald-700"
                    onClick={() => handleLock("driver")} disabled={loading}>
                    <Lock className="w-3 h-3" /> 司機確認
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-9 gap-1 border-orange-300 text-orange-700"
                    onClick={() => handleLock("customer")} disabled={loading}>
                    <Lock className="w-3 h-3" /> 客戶確認
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Existing surcharges ───────────────── */}
          {(order.surchargeAmount ?? 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" /> 已加計異常費用
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{order.surchargeReason || "—"}</span>
                <span className="font-bold text-red-600">+NT${(order.surchargeAmount ?? 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* ── Anomaly Surcharge Form ────────────── */}
          {!isLocked && (
            <div>
              <button
                className="flex items-center gap-1 text-xs text-red-600 font-semibold hover:text-red-700"
                onClick={() => setShowSurcharge(!showSurcharge)}
              >
                <Plus className="w-3.5 h-3.5" /> 新增異常加價
              </button>
              {showSurcharge && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 space-y-3">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> 異常加價（等待/超重/超件）
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">加價金額（NT$）</Label>
                      <Input type="number" min="0" value={surchargeAmt} onChange={e => setSurchargeAmt(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">原因說明</Label>
                      <Input value={surchargeReason} onChange={e => setSurchargeReason(e.target.value)} placeholder="e.g. 等候45分鐘、超重20kg" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 bg-white/70 rounded p-2">
                    <p>⏱ 等候費：前30分鐘免費，之後每30分鐘+NT$200</p>
                    <p>⚖ 超重費：每超重1公斤 +NT$8</p>
                    <p>📦 超件費：每超10件 +NT$300</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => setShowSurcharge(false)}>取消</Button>
                    <Button size="sm" className="flex-1 text-xs h-8 bg-red-500 hover:bg-red-600 text-white gap-1" onClick={handleAddSurcharge} disabled={loading}>
                      <Plus className="w-3 h-3" /> 加計
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
