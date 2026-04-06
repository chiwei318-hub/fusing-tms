import { useState, useEffect, useCallback } from "react";
import {
  Snowflake, Package, Zap, BadgeDollarSign, RefreshCw,
  Save, ChevronDown, ChevronUp, Calculator, TrendingUp,
  AlertCircle, RotateCcw, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tier = {
  id: number;
  tier_type: string;
  label: string;
  description: string;
  min_pct: number;
  max_pct: number;
  platform_pct: number;
  driver_pct: number;
  urgency_surcharge_pct: number;
  dispatch_fee: number;
  active: boolean;
};

type CalcResult = {
  order_amount: number;
  tier_type: string;
  is_urgent: boolean;
  base_commission_pct: number;
  platform_commission: number;
  driver_net: number;
  urgent_surcharge_total: number;
  urgent_platform_cut: number;
  urgent_driver_bonus: number;
  dispatch_fee: number;
  total_platform_revenue: number;
  total_driver_payout: number;
};

const TIER_META: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  cold_chain: {
    icon: <Snowflake className="w-5 h-5" />,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  regular: {
    icon: <Package className="w-5 h-5" />,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
  },
  urgent: {
    icon: <Zap className="w-5 h-5" />,
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
  dispatch_fee: {
    icon: <BadgeDollarSign className="w-5 h-5" />,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
};

function PctBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function TierCard({
  tier, onSave,
}: { tier: Tier; onSave: (t: Tier) => Promise<void> }) {
  const [draft, setDraft] = useState<Tier>(tier);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const meta = TIER_META[tier.tier_type] ?? TIER_META["regular"];
  const isUrgent = tier.tier_type === "urgent";
  const isDispatch = tier.tier_type === "dispatch_fee";
  const changed = JSON.stringify(draft) !== JSON.stringify(tier);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      toast({ title: "✅ 已儲存", description: `${tier.label} 設定已更新` });
    } catch {
      toast({ title: "❌ 儲存失敗", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`border-2 transition-all ${meta.border} ${draft.active ? "" : "opacity-60"}`}>
      <CardHeader className={`${meta.bg} rounded-t-xl pb-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className={`flex items-center gap-2 ${meta.color} font-bold`}>
            {meta.icon}
            <span className="text-base">{tier.label}</span>
            {isUrgent && (
              <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">加成</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
                className="w-3.5 h-3.5 accent-current"
              />
              <span className="text-xs text-gray-500">啟用</span>
            </label>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">{draft.description}</p>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Quick summary */}
        {!isDispatch ? (
          <div className="grid grid-cols-2 gap-3">
            {isUrgent ? (
              <>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-orange-600">+{draft.urgency_surcharge_pct}%</p>
                  <p className="text-xs text-gray-500 mt-1">急單自動加價</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>司機拆 {draft.driver_pct}%</span>
                    <span>平台拆 {draft.platform_pct}%</span>
                  </div>
                  <PctBar pct={draft.driver_pct} color="bg-orange-400" />
                  <p className="text-[10px] text-gray-400 mt-1">加價部分的分潤比例</p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-gray-800">
                    {draft.min_pct}–{draft.max_pct}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">平台抽成區間</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>平台 {draft.platform_pct}%</span>
                    <span>司機 {draft.driver_pct}%</span>
                  </div>
                  <PctBar pct={draft.platform_pct} color={meta.color.includes("blue") ? "bg-blue-400" : "bg-green-400"} />
                  <p className="text-[10px] text-gray-400 mt-1">抽成金額的分潤</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-purple-50 rounded-xl p-3 flex items-center gap-3">
            <BadgeDollarSign className="w-8 h-8 text-purple-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-black text-purple-700">NT$ {draft.dispatch_fee}</p>
              <p className="text-xs text-gray-500">每趟成功派車後收取固定手續費</p>
            </div>
          </div>
        )}

        {/* Editable form (expanded) */}
        {expanded && (
          <div className="space-y-3 border-t pt-4">
            {isDispatch ? (
              <div className="space-y-1.5">
                <Label className="text-xs">每趟手續費（NT$）</Label>
                <Input
                  type="number"
                  min={0}
                  max={500}
                  value={draft.dispatch_fee}
                  onChange={e => setDraft(d => ({ ...d, dispatch_fee: Number(e.target.value) }))}
                  className="w-32 h-8 text-sm font-mono"
                />
              </div>
            ) : isUrgent ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">急單加價 %</Label>
                  <Input
                    type="number" min={0} max={50}
                    value={draft.urgency_surcharge_pct}
                    onChange={e => setDraft(d => ({ ...d, urgency_surcharge_pct: Number(e.target.value) }))}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">司機分潤 %</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={draft.driver_pct}
                    onChange={e => setDraft(d => ({
                      ...d,
                      driver_pct: Number(e.target.value),
                      platform_pct: 100 - Number(e.target.value),
                    }))}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">平台分潤 %</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={draft.platform_pct}
                    onChange={e => setDraft(d => ({
                      ...d,
                      platform_pct: Number(e.target.value),
                      driver_pct: 100 - Number(e.target.value),
                    }))}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">最低抽成 %</Label>
                  <Input
                    type="number" min={0} max={50}
                    value={draft.min_pct}
                    onChange={e => setDraft(d => ({ ...d, min_pct: Number(e.target.value) }))}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">最高抽成 %</Label>
                  <Input
                    type="number" min={0} max={50}
                    value={draft.max_pct}
                    onChange={e => setDraft(d => ({ ...d, max_pct: Number(e.target.value) }))}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">規則說明</Label>
              <Input
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {changed && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm" onClick={handleSave} disabled={saving}
              className={`flex-1 text-white ${meta.color.includes("blue") ? "bg-blue-600 hover:bg-blue-700" : meta.color.includes("green") ? "bg-green-600 hover:bg-green-700" : meta.color.includes("orange") ? "bg-orange-600 hover:bg-orange-700" : "bg-purple-600 hover:bg-purple-700"}`}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "儲存中..." : "儲存"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(tier)}>取消</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommissionCalculator({ tiers }: { tiers: Tier[] }) {
  const [amount, setAmount] = useState("10000");
  const [tierType, setTierType] = useState("regular");
  const [isUrgent, setIsUrgent] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);

  const calculate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/commission-tiers/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_amount: Number(amount),
          tier_type: tierType,
          is_urgent: isUrgent,
        }),
      });
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  };

  const baseOptions = tiers.filter(t => t.tier_type !== "dispatch_fee");

  return (
    <Card>
      <CardHeader className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-t-xl">
        <CardTitle className="flex items-center gap-2 text-white text-base">
          <Calculator className="w-5 h-5 text-yellow-400" />
          分潤試算器
        </CardTitle>
        <p className="text-gray-400 text-xs">輸入訂單金額，即時試算平台與司機各得多少</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">訂單金額（NT$）</Label>
            <Input
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="font-mono"
              placeholder="10000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">貨物類型</Label>
            <select
              className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm"
              value={tierType}
              onChange={e => setTierType(e.target.value)}
            >
              {baseOptions.map(t => (
                <option key={t.tier_type} value={t.tier_type}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">急單加成</Label>
            <div className="flex items-center h-10">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={isUrgent}
                  onChange={e => setIsUrgent(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">24小時急單</span>
              </label>
            </div>
          </div>
        </div>

        <Button onClick={calculate} disabled={loading} className="w-full">
          <Calculator className="w-4 h-4 mr-2" />
          {loading ? "計算中..." : "試算分潤"}
        </Button>

        {result && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
                <p className="text-xs text-gray-500 mb-1">平台總收入</p>
                <p className="text-2xl font-black text-blue-700">
                  NT$ {result.total_platform_revenue.toLocaleString()}
                </p>
                <div className="text-[11px] text-gray-400 mt-2 space-y-0.5">
                  <p>抽成 NT$ {result.platform_commission.toLocaleString()}</p>
                  {result.urgent_platform_cut > 0 && (
                    <p className="text-orange-500">急單分潤 NT$ {result.urgent_platform_cut.toLocaleString()}</p>
                  )}
                  <p>手續費 NT$ {result.dispatch_fee.toLocaleString()}</p>
                </div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
                <p className="text-xs text-gray-500 mb-1">司機總收入</p>
                <p className="text-2xl font-black text-green-700">
                  NT$ {result.total_driver_payout.toLocaleString()}
                </p>
                <div className="text-[11px] text-gray-400 mt-2 space-y-0.5">
                  <p>基本收入 NT$ {result.driver_net.toLocaleString()}</p>
                  {result.urgent_driver_bonus > 0 && (
                    <p className="text-orange-500">急單獎金 NT$ {result.urgent_driver_bonus.toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>

            {result.is_urgent && result.urgent_surcharge_total > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-start gap-2">
                <Zap className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-orange-700">急單加成說明</p>
                  <p className="text-gray-600 mt-0.5">
                    系統自動將訂單加價 NT$ {result.urgent_surcharge_total.toLocaleString()}（{result.urgent_surcharge_total / result.order_amount * 100}%），
                    其中司機獲得 NT$ {result.urgent_driver_bonus.toLocaleString()}（70%），
                    平台獲得 NT$ {result.urgent_platform_cut.toLocaleString()}（30%）。
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex justify-between text-xs text-gray-500">
                <span>基本抽成率</span>
                <span className="font-mono font-semibold">{result.base_commission_pct.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>訂單總金額（含急單加成）</span>
                <span className="font-mono font-semibold">
                  NT$ {(result.order_amount + result.urgent_surcharge_total).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommissionTiersTab() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/commission-tiers`)
      .then(r => r.json()).then(setTiers).catch(() => setTiers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (t: Tier) => {
    const r = await fetch(`${BASE}/api/commission-tiers/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (!r.ok) throw new Error("save failed");
    load();
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await fetch(`${BASE}/api/commission-tiers/reset`, { method: "POST" });
      load();
      toast({ title: "✅ 已重置為預設值" });
    } finally {
      setResetting(false);
    }
  };

  const orderedTiers = ["cold_chain", "regular", "urgent", "dispatch_fee"]
    .map(type => tiers.find(t => t.tier_type === type))
    .filter(Boolean) as Tier[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-8 h-8 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-black">階梯式抽成引擎</h2>
              <p className="text-slate-300 text-sm mt-1">
                依貨物類型與急迫程度自動計算平台抽成，最大化獲利同時保持司機誘因。
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-blue-500/20 text-blue-200 text-xs px-2 py-0.5 rounded-full border border-blue-400/30">
                  🧊 冷鏈高標 15–20%
                </span>
                <span className="bg-green-500/20 text-green-200 text-xs px-2 py-0.5 rounded-full border border-green-400/30">
                  📦 常溫大宗 8–12%
                </span>
                <span className="bg-orange-500/20 text-orange-200 text-xs px-2 py-0.5 rounded-full border border-orange-400/30">
                  ⚡ 急單加成 +15% / 7:3
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={load}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              重整
            </Button>
            <Button size="sm" variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={handleReset}
              disabled={resetting}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              重置
            </Button>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-700">
          每趟派單手續費取代月租費制，司機「有跑才有付」，降低加盟門檻；
          急單加成中司機獲 70% 作為誘因，確保緊急配送有足夠車源。
        </p>
      </div>

      {loading ? (
        <p className="text-center py-8 text-gray-400 text-sm">載入中...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {orderedTiers.map(t => (
            <TierCard key={t.id} tier={t} onSave={handleSave} />
          ))}
        </div>
      )}

      {/* Calculator */}
      {!loading && tiers.length > 0 && (
        <CommissionCalculator tiers={tiers} />
      )}
    </div>
  );
}
