import React, { useState, useEffect, useCallback, useId } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Calculator, Settings, Plus, Trash2, ChevronDown, ChevronUp,
  RotateCcw, Printer, TruckIcon, Package, Ruler, Route,
  CheckCircle2, AlertCircle, Info,
} from 'lucide-react';

const VEHICLE_TYPES = ['1.75T', '3.5T', '5T', '8.8T', '17T', '26T', '35T', '43T'] as const;
type VehicleType = typeof VEHICLE_TYPES[number];

interface Tier {
  minVal: number;
  maxVal: number;
  surcharge: number;
}

interface VehicleRule {
  basePrice: number;
  pricePerKm: number;
  weightTiers: Tier[];
  volumeTiers: Tier[];
  waitingFeePerHour: number;
  tollsFixed: number;
  taxRate: number;
  profitRate: number;
}

interface SpecialCargo {
  id: string;
  name: string;
  surcharge: number;
}

interface PricingRules {
  vehicles: Record<VehicleType, VehicleRule>;
  specialCargoes: SpecialCargo[];
}

const DEFAULT_RULES: PricingRules = {
  vehicles: {
    '1.75T': {
      basePrice: 1500, pricePerKm: 15,
      weightTiers: [{ minVal: 0, maxVal: 800, surcharge: 0 }, { minVal: 800, maxVal: 1750, surcharge: 300 }],
      volumeTiers: [{ minVal: 0, maxVal: 6, surcharge: 0 }, { minVal: 6, maxVal: 9, surcharge: 300 }],
      waitingFeePerHour: 200, tollsFixed: 0, taxRate: 5, profitRate: 20,
    },
    '3.5T': {
      basePrice: 2000, pricePerKm: 18,
      weightTiers: [{ minVal: 0, maxVal: 1500, surcharge: 0 }, { minVal: 1500, maxVal: 3500, surcharge: 500 }],
      volumeTiers: [{ minVal: 0, maxVal: 10, surcharge: 0 }, { minVal: 10, maxVal: 18, surcharge: 500 }],
      waitingFeePerHour: 300, tollsFixed: 0, taxRate: 5, profitRate: 20,
    },
    '5T': {
      basePrice: 2800, pricePerKm: 20,
      weightTiers: [{ minVal: 0, maxVal: 2500, surcharge: 0 }, { minVal: 2500, maxVal: 5000, surcharge: 800 }],
      volumeTiers: [{ minVal: 0, maxVal: 15, surcharge: 0 }, { minVal: 15, maxVal: 25, surcharge: 800 }],
      waitingFeePerHour: 400, tollsFixed: 200, taxRate: 5, profitRate: 20,
    },
    '8.8T': {
      basePrice: 3500, pricePerKm: 22,
      weightTiers: [{ minVal: 0, maxVal: 4000, surcharge: 0 }, { minVal: 4000, maxVal: 8800, surcharge: 1200 }],
      volumeTiers: [{ minVal: 0, maxVal: 25, surcharge: 0 }, { minVal: 25, maxVal: 44, surcharge: 1200 }],
      waitingFeePerHour: 500, tollsFixed: 300, taxRate: 5, profitRate: 20,
    },
    '17T': {
      basePrice: 5000, pricePerKm: 25,
      weightTiers: [{ minVal: 0, maxVal: 8000, surcharge: 0 }, { minVal: 8000, maxVal: 17000, surcharge: 2000 }],
      volumeTiers: [{ minVal: 0, maxVal: 45, surcharge: 0 }, { minVal: 45, maxVal: 85, surcharge: 2000 }],
      waitingFeePerHour: 600, tollsFixed: 500, taxRate: 5, profitRate: 20,
    },
    '26T': {
      basePrice: 7000, pricePerKm: 30,
      weightTiers: [{ minVal: 0, maxVal: 13000, surcharge: 0 }, { minVal: 13000, maxVal: 26000, surcharge: 3000 }],
      volumeTiers: [{ minVal: 0, maxVal: 65, surcharge: 0 }, { minVal: 65, maxVal: 130, surcharge: 3000 }],
      waitingFeePerHour: 800, tollsFixed: 800, taxRate: 5, profitRate: 20,
    },
    '35T': {
      basePrice: 9000, pricePerKm: 35,
      weightTiers: [{ minVal: 0, maxVal: 18000, surcharge: 0 }, { minVal: 18000, maxVal: 35000, surcharge: 4000 }],
      volumeTiers: [{ minVal: 0, maxVal: 85, surcharge: 0 }, { minVal: 85, maxVal: 175, surcharge: 4000 }],
      waitingFeePerHour: 1000, tollsFixed: 1000, taxRate: 5, profitRate: 20,
    },
    '43T': {
      basePrice: 11000, pricePerKm: 40,
      weightTiers: [{ minVal: 0, maxVal: 22000, surcharge: 0 }, { minVal: 22000, maxVal: 43000, surcharge: 5000 }],
      volumeTiers: [{ minVal: 0, maxVal: 100, surcharge: 0 }, { minVal: 100, maxVal: 215, surcharge: 5000 }],
      waitingFeePerHour: 1200, tollsFixed: 1200, taxRate: 5, profitRate: 20,
    },
  },
  specialCargoes: [
    { id: '1', name: '易碎品', surcharge: 500 },
    { id: '2', name: '危險品', surcharge: 2000 },
    { id: '3', name: '冷藏貨品', surcharge: 1500 },
    { id: '4', name: '超長貨品(>3m)', surcharge: 800 },
    { id: '5', name: '超重機械', surcharge: 3000 },
  ],
};

const STORAGE_KEY = 'quotation_rules_v1';

function loadRules(): PricingRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_RULES, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_RULES;
}

function saveRules(rules: PricingRules) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

function getSurchargeFromTiers(tiers: Tier[], value: number): number {
  if (!tiers.length) return 0;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (value >= tiers[i].minVal) return tiers[i].surcharge;
  }
  return tiers[0].surcharge;
}

function recommendVehicle(weightKg: number, volumeCbm: number, rules: PricingRules): VehicleType | null {
  const maxWeightCapacity: Record<VehicleType, number> = {
    '1.75T': 1750, '3.5T': 3500, '5T': 5000, '8.8T': 8800,
    '17T': 17000, '26T': 26000, '35T': 35000, '43T': 43000,
  };
  const maxVolumeCapacity: Record<VehicleType, number> = {
    '1.75T': 9, '3.5T': 18, '5T': 25, '8.8T': 44,
    '17T': 85, '26T': 130, '35T': 175, '43T': 215,
  };
  for (const vt of VEHICLE_TYPES) {
    if (weightKg <= maxWeightCapacity[vt] && volumeCbm <= maxVolumeCapacity[vt]) {
      return vt;
    }
  }
  return null;
}

interface QuoteResult {
  vehicleType: VehicleType;
  basePrice: number;
  distanceCharge: number;
  weightSurcharge: number;
  volumeSurcharge: number;
  appliedSurcharge: number;
  appliedBy: 'weight' | 'volume' | 'equal';
  specialSurcharge: number;
  waitingFee: number;
  tolls: number;
  subtotal: number;
  taxAmount: number;
  profitAmount: number;
  grandTotal: number;
}

function calcQuote(
  vehicleType: VehicleType,
  weightKg: number,
  volumeCbm: number,
  distanceKm: number,
  specialSurcharge: number,
  waitingHours: number,
  tollsOverride: number | null,
  rules: PricingRules,
): QuoteResult {
  const rule = rules.vehicles[vehicleType];
  const basePrice = rule.basePrice;
  const distanceCharge = distanceKm * rule.pricePerKm;
  const weightSurcharge = getSurchargeFromTiers(rule.weightTiers, weightKg);
  const volumeSurcharge = getSurchargeFromTiers(rule.volumeTiers, volumeCbm);
  const appliedSurcharge = Math.max(weightSurcharge, volumeSurcharge);
  const appliedBy: 'weight' | 'volume' | 'equal' =
    weightSurcharge > volumeSurcharge ? 'weight' : volumeSurcharge > weightSurcharge ? 'volume' : 'equal';
  const waitingFee = waitingHours * rule.waitingFeePerHour;
  const tolls = tollsOverride !== null ? tollsOverride : rule.tollsFixed;
  const subtotal = basePrice + distanceCharge + appliedSurcharge + specialSurcharge + waitingFee + tolls;
  const taxAmount = Math.round(subtotal * rule.taxRate / 100);
  const profitAmount = Math.round(subtotal * rule.profitRate / 100);
  const grandTotal = subtotal + taxAmount + profitAmount;
  return {
    vehicleType, basePrice, distanceCharge, weightSurcharge, volumeSurcharge,
    appliedSurcharge, appliedBy, specialSurcharge, waitingFee, tolls,
    subtotal, taxAmount, profitAmount, grandTotal,
  };
}

const fmt = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

function TierEditor({ tiers, onChange, unit }: {
  tiers: Tier[];
  onChange: (t: Tier[]) => void;
  unit: string;
}) {
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    onChange([...tiers, { minVal: last?.maxVal ?? 0, maxVal: (last?.maxVal ?? 0) + 1000, surcharge: 0 }]);
  };
  const removeTier = (i: number) => onChange(tiers.filter((_, idx) => idx !== i));
  const updateTier = (i: number, field: keyof Tier, val: number) => {
    const next = tiers.map((t, idx) => idx === i ? { ...t, [field]: val } : t);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {tiers.map((tier, i) => (
        <div key={i} className="flex items-center gap-1.5 text-sm">
          <Input
            type="number" className="w-24 h-7 text-xs"
            value={tier.minVal}
            onChange={e => updateTier(i, 'minVal', +e.target.value)}
          />
          <span className="text-muted-foreground text-xs">~</span>
          <Input
            type="number" className="w-24 h-7 text-xs"
            value={tier.maxVal}
            onChange={e => updateTier(i, 'maxVal', +e.target.value)}
          />
          <span className="text-muted-foreground text-xs">{unit}</span>
          <span className="text-muted-foreground text-xs mx-1">+</span>
          <Input
            type="number" className="w-24 h-7 text-xs"
            value={tier.surcharge}
            onChange={e => updateTier(i, 'surcharge', +e.target.value)}
          />
          <span className="text-muted-foreground text-xs">元</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeTier(i)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addTier}>
        <Plus className="w-3 h-3" /> 新增級距
      </Button>
    </div>
  );
}

function VehicleRuleCard({ vt, rule, onChange }: {
  vt: VehicleType;
  rule: VehicleRule;
  onChange: (r: VehicleRule) => void;
}) {
  const [open, setOpen] = useState(false);
  const upd = (field: keyof VehicleRule, val: unknown) => onChange({ ...rule, [field]: val });

  return (
    <Card className="border-2 hover:border-primary/30 transition-colors">
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-bold text-sm px-3 py-1">{vt}</Badge>
          <div className="text-left">
            <div className="text-sm font-medium">基本價 {fmt(rule.basePrice)}　每公里 {fmt(rule.pricePerKm)}/km</div>
            <div className="text-xs text-muted-foreground">
              稅 {rule.taxRate}%　利潤 {rule.profitRate}%　等待費 {fmt(rule.waitingFeePerHour)}/hr
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <CardContent className="pt-0 pb-5">
          <Separator className="mb-5" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: '基本價（元）', field: 'basePrice' as const },
              { label: '每公里單價（元/km）', field: 'pricePerKm' as const },
              { label: '等待裝卸費（元/hr）', field: 'waitingFeePerHour' as const },
              { label: '過路停車費（元，預設）', field: 'tollsFixed' as const },
              { label: '稅與管理費（%）', field: 'taxRate' as const },
              { label: '利潤（%）', field: 'profitRate' as const },
            ].map(({ label, field }) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number" className="h-8"
                  value={rule[field] as number}
                  onChange={e => upd(field, +e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">重量級距</span>
                <Badge variant="secondary" className="text-xs">kg</Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-2 flex gap-6">
                <span>起始(kg)</span><span>終止(kg)</span><span className="ml-5">加價(元)</span>
              </div>
              <TierEditor
                tiers={rule.weightTiers}
                onChange={t => upd('weightTiers', t)}
                unit="kg"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold">材積級距</span>
                <Badge variant="secondary" className="text-xs">CBM</Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-2 flex gap-6">
                <span>起始(m³)</span><span>終止(m³)</span><span className="ml-5">加價(元)</span>
              </div>
              <TierEditor
                tiers={rule.volumeTiers}
                onChange={t => upd('volumeTiers', t)}
                unit="m³"
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function QuotationTab() {
  const [rules, setRules] = useState<PricingRules>(loadRules);
  const [dirty, setDirty] = useState(false);

  const [vehicleType, setVehicleType] = useState<VehicleType>('3.5T');
  const [cargoName, setCargoName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [volumeCbm, setVolumeCbm] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [selectedSpecial, setSelectedSpecial] = useState('none');
  const [waitingHours, setWaitingHours] = useState('0');
  const [tollsOverride, setTollsOverride] = useState('');
  const [autoVehicle, setAutoVehicle] = useState(true);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [newSpecialName, setNewSpecialName] = useState('');
  const [newSpecialSurcharge, setNewSpecialSurcharge] = useState('');

  const updateRule = useCallback((vt: VehicleType, rule: VehicleRule) => {
    setRules(prev => ({ ...prev, vehicles: { ...prev.vehicles, [vt]: rule } }));
    setDirty(true);
  }, []);

  const saveAllRules = () => {
    saveRules(rules);
    setDirty(false);
  };

  const resetRules = () => {
    setRules(DEFAULT_RULES);
    saveRules(DEFAULT_RULES);
    setDirty(false);
  };

  const handleCalc = () => {
    const wkg = parseFloat(weightKg) || 0;
    const vcbm = parseFloat(volumeCbm) || 0;
    const dkm = parseFloat(distanceKm) || 0;
    const wh = parseFloat(waitingHours) || 0;
    const tollOv = tollsOverride !== '' ? parseFloat(tollsOverride) : null;
    const spec = rules.specialCargoes.find(s => s.id === selectedSpecial);
    const specSurcharge = spec ? spec.surcharge : 0;

    let vt = vehicleType;
    if (autoVehicle) {
      const rec = recommendVehicle(wkg, vcbm, rules);
      if (rec) vt = rec;
    }
    setVehicleType(vt);

    const q = calcQuote(vt, wkg, vcbm, dkm, specSurcharge, wh, tollOv, rules);
    setResult(q);
  };

  const addSpecialCargo = () => {
    if (!newSpecialName.trim() || !newSpecialSurcharge) return;
    const id = Date.now().toString();
    const updated: PricingRules = {
      ...rules,
      specialCargoes: [...rules.specialCargoes, { id, name: newSpecialName.trim(), surcharge: parseFloat(newSpecialSurcharge) }],
    };
    setRules(updated);
    saveRules(updated);
    setNewSpecialName('');
    setNewSpecialSurcharge('');
  };

  const removeSpecialCargo = (id: string) => {
    const updated: PricingRules = { ...rules, specialCargoes: rules.specialCargoes.filter(s => s.id !== id) };
    setRules(updated);
    saveRules(updated);
  };

  const handlePrint = () => {
    if (!result) return;
    const spec = rules.specialCargoes.find(s => s.id === selectedSpecial);
    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>運輸報價單</title>
<style>
body{font-family:'Microsoft JhengHei',sans-serif;padding:40px;max-width:600px;margin:0 auto}
h2{text-align:center;color:#1e3a5f;border-bottom:3px solid #1e3a5f;padding-bottom:12px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0;background:#f8fafc;padding:16px;border-radius:8px}
.info div{font-size:14px}.info .label{color:#64748b}.info .val{font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:20px}
th{background:#1e3a5f;color:white;padding:10px;text-align:left;font-size:13px}
td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}
tr:last-child td{border-bottom:none}
.total-row td{font-weight:700;font-size:15px;background:#f0fdf4;color:#166534}
.note{margin-top:24px;font-size:12px;color:#94a3b8;text-align:center}
</style></head><body>
<h2>運輸報價單</h2>
<div class="info">
  <div><span class="label">貨品名稱：</span><span class="val">${cargoName || '—'}</span></div>
  <div><span class="label">車型：</span><span class="val">${result.vehicleType}</span></div>
  <div><span class="label">重量：</span><span class="val">${weightKg || 0} kg</span></div>
  <div><span class="label">材積：</span><span class="val">${volumeCbm || 0} m³</span></div>
  <div><span class="label">里程：</span><span class="val">${distanceKm || 0} km</span></div>
  <div><span class="label">特殊貨品：</span><span class="val">${spec?.name || '無'}</span></div>
</div>
<table>
<thead><tr><th>項目</th><th style="text-align:right">金額</th></tr></thead>
<tbody>
  <tr><td>基本運費</td><td style="text-align:right">${fmt(result.basePrice)}</td></tr>
  <tr><td>里程費（${distanceKm || 0}km × NT$${rules.vehicles[result.vehicleType].pricePerKm}/km）</td><td style="text-align:right">${fmt(result.distanceCharge)}</td></tr>
  <tr><td>重量/材積加價（${result.appliedBy === 'weight' ? '依重量' : result.appliedBy === 'volume' ? '依材積' : '同額'}）</td><td style="text-align:right">${fmt(result.appliedSurcharge)}</td></tr>
  ${result.specialSurcharge > 0 ? `<tr><td>特殊貨品加價（${spec?.name}）</td><td style="text-align:right">${fmt(result.specialSurcharge)}</td></tr>` : ''}
  ${result.waitingFee > 0 ? `<tr><td>等待裝卸費</td><td style="text-align:right">${fmt(result.waitingFee)}</td></tr>` : ''}
  ${result.tolls > 0 ? `<tr><td>過路停車費</td><td style="text-align:right">${fmt(result.tolls)}</td></tr>` : ''}
  <tr><td>小計</td><td style="text-align:right">${fmt(result.subtotal)}</td></tr>
  <tr><td>稅與管理費（${rules.vehicles[result.vehicleType].taxRate}%）</td><td style="text-align:right">${fmt(result.taxAmount)}</td></tr>
  <tr><td>利潤（${rules.vehicles[result.vehicleType].profitRate}%）</td><td style="text-align:right">${fmt(result.profitAmount)}</td></tr>
  <tr class="total-row"><td>報價合計</td><td style="text-align:right">${fmt(result.grandTotal)}</td></tr>
</tbody>
</table>
<p class="note">本報價單有效期14天　富詠運輸股份有限公司　報價日期：${new Date().toLocaleDateString('zh-TW')}</p>
</body></html>`;
    const w = window.open('', '_blank', 'width=700,height=900');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const recVehicle = (() => {
    const wkg = parseFloat(weightKg) || 0;
    const vcbm = parseFloat(volumeCbm) || 0;
    if (!wkg && !vcbm) return null;
    return recommendVehicle(wkg, vcbm, rules);
  })();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6 text-primary" />
          運輸報價試算
        </h2>
        <p className="text-sm text-muted-foreground mt-1">依貨品重量或材積取較高者自動計算報價，支援全車型規則設定</p>
      </div>

      <Tabs defaultValue="calc">
        <TabsList className="mb-6">
          <TabsTrigger value="calc" className="gap-2">
            <Calculator className="w-4 h-4" />報價試算
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="w-4 h-4" />規則設定
          </TabsTrigger>
        </TabsList>

        {/* ===== 報價試算 ===== */}
        <TabsContent value="calc">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Input Panel */}
            <div className="lg:col-span-2 space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    貨品資訊
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">貨品種類</Label>
                    <Input
                      placeholder="例：電子設備、家具、機械零件…"
                      value={cargoName}
                      onChange={e => setCargoName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">重量（kg）</Label>
                      <Input
                        type="number" placeholder="0"
                        value={weightKg}
                        onChange={e => setWeightKg(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">材積（m³）</Label>
                      <Input
                        type="number" placeholder="0"
                        value={volumeCbm}
                        onChange={e => setVolumeCbm(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">特殊貨品</Label>
                    <Select value={selectedSpecial} onValueChange={setSelectedSpecial}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無特殊要求</SelectItem>
                        {rules.specialCargoes.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}（+{fmt(s.surcharge)}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Route className="w-4 h-4 text-primary" />
                    運輸條件
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">里程（km）</Label>
                    <Input
                      type="number" placeholder="0"
                      value={distanceKm}
                      onChange={e => setDistanceKm(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">等待裝卸時間（hr）</Label>
                      <Input
                        type="number" placeholder="0" step="0.5"
                        value={waitingHours}
                        onChange={e => setWaitingHours(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">過路停車費（留空用預設）</Label>
                      <Input
                        type="number" placeholder="預設"
                        value={tollsOverride}
                        onChange={e => setTollsOverride(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TruckIcon className="w-4 h-4 text-primary" />
                    車型選擇
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted/50 text-sm">
                    <input
                      type="checkbox" id="autoVehicle"
                      className="w-4 h-4 accent-primary"
                      checked={autoVehicle}
                      onChange={e => setAutoVehicle(e.target.checked)}
                    />
                    <label htmlFor="autoVehicle" className="cursor-pointer">自動推薦最適車型</label>
                  </div>
                  {recVehicle && autoVehicle && (
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      推薦車型：<span className="font-bold">{recVehicle}</span>
                    </div>
                  )}
                  {!autoVehicle && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {VEHICLE_TYPES.map(vt => (
                        <button
                          key={vt}
                          onClick={() => setVehicleType(vt)}
                          className={`text-xs rounded-md border py-2 font-medium transition-colors
                            ${vehicleType === vt
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:border-primary/50 text-foreground'
                            }`}
                        >
                          {vt}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button className="w-full gap-2 h-11 text-base" onClick={handleCalc}>
                <Calculator className="w-5 h-5" />
                計算報價
              </Button>
            </div>

            {/* Result Panel */}
            <div className="lg:col-span-3">
              {!result ? (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <div className="text-center text-muted-foreground">
                    <Calculator className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-1">輸入資料後按「計算報價」</p>
                    <p className="text-sm">系統將自動依重量或材積取較高者計算</p>
                  </div>
                </Card>
              ) : (
                <Card className="sticky top-4">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">報價明細</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className="text-sm px-3 py-1">{result.vehicleType}</Badge>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handlePrint}>
                          <Printer className="w-3.5 h-3.5" />列印報價單
                        </Button>
                      </div>
                    </div>
                    {cargoName && (
                      <p className="text-sm text-muted-foreground mt-1">{cargoName}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm py-1.5 border-b">
                        <span className="text-muted-foreground">基本運費</span>
                        <span className="font-medium">{fmt(result.basePrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1.5 border-b">
                        <span className="text-muted-foreground">
                          里程費（{distanceKm || 0}km × {fmt(rules.vehicles[result.vehicleType].pricePerKm)}/km）
                        </span>
                        <span className="font-medium">{fmt(result.distanceCharge)}</span>
                      </div>

                      {/* Weight vs Volume comparison */}
                      <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                        <div className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" />
                          重量／材積加價比較（取較高者）
                        </div>
                        <div className={`flex justify-between text-sm px-2 py-1 rounded ${result.appliedBy === 'weight' || result.appliedBy === 'equal' ? 'bg-green-100 text-green-800' : 'text-muted-foreground'}`}>
                          <span>重量加價（{weightKg || 0}kg）{result.appliedBy === 'weight' ? '✓ 採用' : ''}</span>
                          <span className="font-medium">{fmt(result.weightSurcharge)}</span>
                        </div>
                        <div className={`flex justify-between text-sm px-2 py-1 rounded ${result.appliedBy === 'volume' || result.appliedBy === 'equal' ? 'bg-green-100 text-green-800' : 'text-muted-foreground'}`}>
                          <span>材積加價（{volumeCbm || 0}m³）{result.appliedBy === 'volume' ? '✓ 採用' : ''}{result.appliedBy === 'equal' ? '✓ 同額' : ''}</span>
                          <span className="font-medium">{fmt(result.volumeSurcharge)}</span>
                        </div>
                      </div>

                      {result.specialSurcharge > 0 && (
                        <div className="flex justify-between text-sm py-1.5 border-b">
                          <span className="text-muted-foreground">
                            特殊貨品加價（{rules.specialCargoes.find(s => s.id === selectedSpecial)?.name}）
                          </span>
                          <span className="font-medium text-amber-600">+{fmt(result.specialSurcharge)}</span>
                        </div>
                      )}
                      {result.waitingFee > 0 && (
                        <div className="flex justify-between text-sm py-1.5 border-b">
                          <span className="text-muted-foreground">等待裝卸費（{waitingHours}hr）</span>
                          <span className="font-medium">+{fmt(result.waitingFee)}</span>
                        </div>
                      )}
                      {result.tolls > 0 && (
                        <div className="flex justify-between text-sm py-1.5 border-b">
                          <span className="text-muted-foreground">過路停車費</span>
                          <span className="font-medium">+{fmt(result.tolls)}</span>
                        </div>
                      )}

                      <Separator />
                      <div className="flex justify-between text-sm py-1.5">
                        <span className="text-muted-foreground">小計</span>
                        <span className="font-medium">{fmt(result.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1.5">
                        <span className="text-muted-foreground">
                          稅與管理費（{rules.vehicles[result.vehicleType].taxRate}%）
                        </span>
                        <span className="font-medium">+{fmt(result.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1.5">
                        <span className="text-muted-foreground">
                          利潤（{rules.vehicles[result.vehicleType].profitRate}%）
                        </span>
                        <span className="font-medium">+{fmt(result.profitAmount)}</span>
                      </div>
                      <Separator />

                      <div className="flex justify-between items-center py-2 bg-primary/5 rounded-lg px-3">
                        <span className="text-lg font-bold">報價合計</span>
                        <span className="text-2xl font-bold text-primary">{fmt(result.grandTotal)}</span>
                      </div>

                      {/* All vehicle comparison */}
                      <div className="mt-4 pt-3 border-t">
                        <p className="text-xs text-muted-foreground font-medium mb-2">全車型比較</p>
                        <div className="space-y-1">
                          {VEHICLE_TYPES.map(vt => {
                            const q = calcQuote(
                              vt,
                              parseFloat(weightKg) || 0,
                              parseFloat(volumeCbm) || 0,
                              parseFloat(distanceKm) || 0,
                              result.specialSurcharge,
                              parseFloat(waitingHours) || 0,
                              tollsOverride !== '' ? parseFloat(tollsOverride) : null,
                              rules,
                            );
                            const isSelected = vt === result.vehicleType;
                            return (
                              <div
                                key={vt}
                                className={`flex justify-between items-center text-xs px-2.5 py-1.5 rounded
                                  ${isSelected ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'}`}
                              >
                                <span>{vt}{isSelected ? ' ✓' : ''}</span>
                                <span>{fmt(q.grandTotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== 規則設定 ===== */}
        <TabsContent value="rules">
          <div className="space-y-6">
            {/* Actions bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">點擊車型展開編輯各項費率與級距設定</p>
                {dirty && (
                  <Badge variant="destructive" className="text-xs animate-pulse">未儲存</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={resetRules}>
                  <RotateCcw className="w-3.5 h-3.5" />還原預設
                </Button>
                <Button size="sm" className="gap-1.5" onClick={saveAllRules} disabled={!dirty}>
                  儲存所有設定
                </Button>
              </div>
            </div>

            {/* Vehicle cards */}
            <div className="space-y-3">
              {VEHICLE_TYPES.map(vt => (
                <VehicleRuleCard
                  key={vt}
                  vt={vt}
                  rule={rules.vehicles[vt]}
                  onChange={rule => updateRule(vt, rule)}
                />
              ))}
            </div>

            {/* Special cargo section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  特殊貨品加價設定
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {rules.specialCargoes.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                      <span className="text-sm font-medium flex-1">{s.name}</span>
                      <Badge variant="secondary">+{fmt(s.surcharge)}</Badge>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => removeSpecialCargo(s.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Separator />
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs">貨品名稱</Label>
                    <Input
                      placeholder="例：冷凍品"
                      value={newSpecialName}
                      onChange={e => setNewSpecialName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 w-36">
                    <Label className="text-xs">加價金額（元）</Label>
                    <Input
                      type="number" placeholder="0"
                      value={newSpecialSurcharge}
                      onChange={e => setNewSpecialSurcharge(e.target.value)}
                    />
                  </div>
                  <Button className="gap-1.5" onClick={addSpecialCargo}>
                    <Plus className="w-4 h-4" />新增
                  </Button>
                </div>
              </CardContent>
            </Card>

            {dirty && (
              <div className="flex justify-end">
                <Button size="lg" className="gap-2 px-8" onClick={saveAllRules}>
                  儲存所有設定
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
