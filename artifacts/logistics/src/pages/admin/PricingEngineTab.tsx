/**
 * PricingEngineTab — 透明公式報價引擎管理介面
 * TypeScript 移植自 Python LogisticsPricing 類別
 */
import { useState, useEffect, useCallback } from "react";
import { getApiUrl } from "@/lib/api";
import { Calculator, Settings2, RefreshCw, Save, TrendingUp, Snowflake, Thermometer, Zap, Building2 } from "lucide-react";

interface PEConfig {
  base_fee: number;
  per_km_cold: number;
  per_km_dry: number;
  urgent_multiplier: number;
  commission_pct: number;
  min_distance_km: number;
  remote_threshold: number;
  remote_surcharge: number;
}

interface CalcResult {
  inputs: { distance_km: number; is_cold_chain: boolean; is_urgent: boolean };
  formula: {
    step1: string;
    step2: string | null;
    step3: string | null;
    step4: string;
  };
  steps: {
    base_fare: number;
    unit_price: number;
    mileage_fee: number;
    subtotal_before_urgent: number;
    remote_surcharge: number;
    urgent_surcharge: number;
    urgent_multiplier: number | null;
    commission_pct: number;
  };
  result: {
    total_quote: number;
    driver_pay: number;
    platform_revenue: number;
    total_with_tax: number;
  };
  config: PEConfig;
}

interface SimRow {
  distance_km: number;
  cold_normal: { total_quote: number; driver_pay: number; platform_revenue: number };
  cold_urgent: { total_quote: number; driver_pay: number; platform_revenue: number };
  dry_normal:  { total_quote: number; driver_pay: number; platform_revenue: number };
  dry_urgent:  { total_quote: number; driver_pay: number; platform_revenue: number };
}

const DEFAULT_CFG: PEConfig = {
  base_fee: 500, per_km_cold: 35, per_km_dry: 25,
  urgent_multiplier: 1.2, commission_pct: 15,
  min_distance_km: 5, remote_threshold: 100, remote_surcharge: 500,
};

const PARAM_META: {
  key: keyof PEConfig; label: string; unit: string; step: number; min: number; icon: string;
}[] = [
  { key: "base_fee",          label: "起步價",         unit: "NT$",  step: 50,  min: 0,    icon: "🏠" },
  { key: "per_km_cold",       label: "冷鏈 每公里",    unit: "NT$/km", step: 1, min: 0,    icon: "❄️" },
  { key: "per_km_dry",        label: "常溫 每公里",    unit: "NT$/km", step: 1, min: 0,    icon: "📦" },
  { key: "urgent_multiplier", label: "急單加成倍數",   unit: "×",    step: 0.05, min: 1,   icon: "⚡" },
  { key: "commission_pct",    label: "平台抽成",       unit: "%",    step: 0.5, min: 0,    icon: "💰" },
  { key: "min_distance_km",   label: "最低計費距離",   unit: "km",   step: 1,   min: 0,    icon: "📏" },
  { key: "remote_threshold",  label: "偏遠門檻距離",   unit: "km",   step: 10,  min: 0,    icon: "🗺️" },
  { key: "remote_surcharge",  label: "偏遠附加費",     unit: "NT$",  step: 100, min: 0,    icon: "🏔️" },
];

export default function PricingEngineTab() {
  const [cfg, setCfg] = useState<PEConfig>(DEFAULT_CFG);
  const [editCfg, setEditCfg] = useState<PEConfig>(DEFAULT_CFG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [distKm, setDistKm] = useState(120);
  const [isCold, setIsCold] = useState(true);
  const [isUrgent, setIsUrgent] = useState(true);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const [simTable, setSimTable] = useState<SimRow[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [customDists, setCustomDists] = useState("10,20,50,100,150,200,300");

  // ─── 載入設定 ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(getApiUrl("/api/pe/config"))
      .then(r => r.json())
      .then(d => {
        setCfg(d.config);
        setEditCfg(d.config);
      })
      .finally(() => setLoading(false));
  }, []);

  // ─── 即時試算 ─────────────────────────────────────────────────────────────
  const calculate = useCallback(() => {
    setCalcLoading(true);
    fetch(getApiUrl("/api/pe/calculate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distance_km: distKm, is_cold_chain: isCold, is_urgent: isUrgent }),
    })
      .then(r => r.json())
      .then(d => setCalcResult(d))
      .finally(() => setCalcLoading(false));
  }, [distKm, isCold, isUrgent]);

  useEffect(() => { calculate(); }, [calculate]);

  // ─── 儲存設定 ─────────────────────────────────────────────────────────────
  const saveConfig = async () => {
    setSaving(true);
    const body: Record<string, number> = {};
    for (const m of PARAM_META) body[`pe_${m.key}`] = editCfg[m.key];
    const res = await fetch(getApiUrl("/api/pe/config"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setCfg(d.config);
    setEditCfg(d.config);
    setSaveMsg("✓ 已儲存");
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 2000);
    calculate();
  };

  // ─── 批次模擬 ─────────────────────────────────────────────────────────────
  const runSimulation = () => {
    const steps = customDists.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    setSimLoading(true);
    fetch(getApiUrl("/api/pe/simulate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distance_steps: steps }),
    })
      .then(r => r.json())
      .then(d => setSimTable(d.table ?? []))
      .finally(() => setSimLoading(false));
  };

  useEffect(() => { runSimulation(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 載入中…
      </div>
    );
  }

  const hasChanges = JSON.stringify(cfg) !== JSON.stringify(editCfg);

  return (
    <div className="space-y-6 pb-10">

      {/* ── 標題 ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-50 border border-blue-100">
          <Calculator className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-bold text-lg">透明公式報價引擎</h2>
          <p className="text-xs text-muted-foreground">起步價 + 里程費 × 加成 — 對應 Python LogisticsPricing</p>
        </div>
      </div>

      {/* ── 公式說明卡 ── */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white font-mono text-sm shadow-lg">
        <div className="text-xs text-slate-400 mb-2 font-sans">📐 定價公式</div>
        <div className="space-y-1">
          <div><span className="text-blue-300">base</span>  = NT${editCfg.base_fee}</div>
          <div><span className="text-blue-300">rate</span>  = {editCfg.per_km_cold} (冷鏈) / {editCfg.per_km_dry} (常溫) <span className="text-slate-400">NT$/km</span></div>
          <div><span className="text-green-300">subtotal</span> = base + km × rate</div>
          <div><span className="text-yellow-300">total</span>   = subtotal × {editCfg.urgent_multiplier} <span className="text-slate-400">(if urgent)</span></div>
          <div><span className="text-red-300">platform</span> = total × {editCfg.commission_pct}%</div>
          <div><span className="text-emerald-300">driver</span>  = total − platform</div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-400 font-sans">
          測試案例：120km 冷鏈急單 →
          <span className="text-white font-bold ml-1">
            NT${Math.round(Math.round((editCfg.base_fee + 120 * editCfg.per_km_cold) * editCfg.urgent_multiplier))} 元
          </span>
          （平台賺：NT${Math.round(Math.round((editCfg.base_fee + 120 * editCfg.per_km_cold) * editCfg.urgent_multiplier) * editCfg.commission_pct / 100)}）
        </div>
      </div>

      {/* ── 參數設定 ── */}
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">引擎參數設定</span>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && <span className="text-xs text-green-600 font-medium">{saveMsg}</span>}
            {hasChanges && (
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                儲存
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-y">
          {PARAM_META.map(m => (
            <div key={m.key} className="p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{m.icon}</span>
                <div>
                  <div className="text-xs font-semibold text-foreground">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">{m.unit}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={m.step}
                  min={m.min}
                  value={editCfg[m.key]}
                  onChange={e => setEditCfg(prev => ({ ...prev, [m.key]: Number(e.target.value) }))}
                  className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono font-semibold"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{m.unit}</span>
              </div>
              {editCfg[m.key] !== cfg[m.key] && (
                <div className="text-[10px] text-amber-600 mt-1">原值：{cfg[m.key]}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 即時試算器 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 左：輸入 */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">即時試算</span>
          </div>
          <div className="p-4 space-y-4">

            {/* 距離 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                配送距離
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={1} max={500} step={1}
                  value={distKm}
                  onChange={e => setDistKm(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={1} max={999} step={1}
                    value={distKm}
                    onChange={e => setDistKm(Math.max(1, Number(e.target.value)))}
                    className="w-20 text-sm border rounded-lg px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="text-xs text-muted-foreground">km</span>
                </div>
              </div>
            </div>

            {/* 車種 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">貨物類型</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCold(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${isCold ? "bg-blue-600 text-white border-blue-600 shadow" : "hover:bg-muted/40"}`}
                >
                  <Snowflake className="w-4 h-4" /> 冷鏈
                </button>
                <button
                  onClick={() => setIsCold(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${!isCold ? "bg-orange-500 text-white border-orange-500 shadow" : "hover:bg-muted/40"}`}
                >
                  <Thermometer className="w-4 h-4" /> 常溫
                </button>
              </div>
            </div>

            {/* 急單 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">加急（24h 內）</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsUrgent(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${isUrgent ? "bg-red-500 text-white border-red-500 shadow" : "hover:bg-muted/40"}`}
                >
                  <Zap className="w-4 h-4" /> 急單 ×{editCfg.urgent_multiplier}
                </button>
                <button
                  onClick={() => setIsUrgent(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-all ${!isUrgent ? "bg-slate-600 text-white border-slate-600 shadow" : "hover:bg-muted/40"}`}
                >
                  一般配送
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* 右：輸出（Python 對應格式） */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">計算明細</span>
            {calcLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
          </div>

          {calcResult ? (
            <div className="p-4 space-y-3">

              {/* 步驟拆解 */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">起步價</span>
                  <span className="font-mono">NT$ {calcResult.steps.base_fare.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    里程費（{calcResult.inputs.distance_km} km × NT${calcResult.steps.unit_price}）
                  </span>
                  <span className="font-mono">NT$ {calcResult.steps.mileage_fee.toLocaleString()}</span>
                </div>
                {calcResult.steps.remote_surcharge > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">偏遠地區附加費</span>
                    <span className="font-mono text-amber-600">+ NT$ {calcResult.steps.remote_surcharge.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs border-t pt-1.5">
                  <span className="text-muted-foreground">小計</span>
                  <span className="font-mono">NT$ {calcResult.steps.subtotal_before_urgent.toLocaleString()}</span>
                </div>
                {calcResult.steps.urgent_surcharge > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-red-600">急單加成（×{calcResult.steps.urgent_multiplier}）</span>
                    <span className="font-mono text-red-600">+ NT$ {calcResult.steps.urgent_surcharge.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* 主要報價輸出（Python 格式） */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100 mt-2">
                <div className="text-xs text-blue-600 font-medium mb-3">建議報價</div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-black text-blue-700">
                    NT$ {calcResult.result.total_quote.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground mb-1">元</span>
                </div>
                <div className="text-xs text-muted-foreground">含稅：NT$ {calcResult.result.total_with_tax.toLocaleString()}</div>

                <div className="mt-3 pt-3 border-t border-blue-100 grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-2.5 border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Building2 className="w-3 h-3 text-blue-500" />
                      <span className="text-[10px] text-muted-foreground">平台賺</span>
                    </div>
                    <div className="font-bold text-blue-600 text-sm">
                      NT$ {calcResult.result.platform_revenue.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{calcResult.steps.commission_pct}% 抽成</div>
                  </div>
                  <div className="bg-white rounded-lg p-2.5 border border-emerald-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs">🚛</span>
                      <span className="text-[10px] text-muted-foreground">司機實得</span>
                    </div>
                    <div className="font-bold text-emerald-600 text-sm">
                      NT$ {calcResult.result.driver_pay.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{100 - calcResult.steps.commission_pct}% 分潤</div>
                  </div>
                </div>
              </div>

              {/* Python 對應輸出 */}
              <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs text-slate-600 border">
                <div className="text-[10px] text-slate-400 mb-1 font-sans">🐍 Python 輸出對應</div>
                {`{`}<br />
                &nbsp;&nbsp;<span className="text-green-600">"total_quote"</span>: <span className="text-blue-600">{calcResult.result.total_quote}</span>,<br />
                &nbsp;&nbsp;<span className="text-green-600">"driver_pay"</span>: <span className="text-blue-600">{calcResult.result.driver_pay}</span>,<br />
                &nbsp;&nbsp;<span className="text-green-600">"platform_revenue"</span>: <span className="text-blue-600">{calcResult.result.platform_revenue}</span><br />
                {`}`}
              </div>

            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              計算中…
            </div>
          )}
        </div>
      </div>

      {/* ── 批次試算表 ── */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">報價試算表</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              value={customDists}
              onChange={e => setCustomDists(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1 w-52 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              placeholder="距離 km，逗號分隔"
            />
            <button
              onClick={runSimulation}
              disabled={simLoading}
              className="px-3 py-1 bg-slate-700 text-white rounded-lg text-xs font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1"
            >
              {simLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              重算
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">距離</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-600">❄️ 冷鏈 一般</th>
                <th className="px-3 py-2 text-right font-semibold text-red-500">❄️⚡ 冷鏈 急單</th>
                <th className="px-3 py-2 text-right font-semibold text-orange-500">📦 常溫 一般</th>
                <th className="px-3 py-2 text-right font-semibold text-rose-400">📦⚡ 常溫 急單</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {simTable.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/10"}>
                  <td className="px-3 py-2 font-mono font-semibold">{row.distance_km} km</td>
                  {[row.cold_normal, row.cold_urgent, row.dry_normal, row.dry_urgent].map((r, j) => (
                    <td key={j} className="px-3 py-2 text-right">
                      <div className="font-bold">NT$ {r.total_quote.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground">
                        司機 {r.driver_pay.toLocaleString()} ／ 平台 {r.platform_revenue.toLocaleString()}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {simTable.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    {simLoading ? "計算中…" : "尚無資料"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
