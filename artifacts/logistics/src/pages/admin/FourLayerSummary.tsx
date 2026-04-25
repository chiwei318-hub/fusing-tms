import { useState, useCallback, useRef } from "react";
import {
  ChevronDown, ChevronUp, RefreshCw, Printer, TrendingUp, TrendingDown,
  Building2, Truck, Users, BarChart3, Download, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── helpers ─────────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("auth-jwt");
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function fmt(v: number | string | null | undefined, decimals = 0) {
  const n = Number(v ?? 0);
  return `NT$\u00A0${n.toLocaleString("zh-TW", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

function nowPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function recentMonths(n = 18) {
  const res: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return res;
}

function periodLabel(p: string) {
  const [y, m] = p.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  NDD: "NDD",
  WHNDD: "WHNDD",
  store_delivery: "店配車",
  SD: "店配車",
  pickup: "上收",
  up_collect: "上收",
  other: "其他",
  null: "未分類",
};
function stLabel(s: string) { return SERVICE_TYPE_LABELS[s] ?? s; }

// ─── Types ───────────────────────────────────────────────────────────────────
interface ServiceTypeRow  { service_type: string; trip_count: number; amount: number }
interface FleetRow        { fleet_id: number; fleet_name: string; contact_name: string | null; commission_rate: number; trip_count: number; shopee_income: number; fleet_receive: number; commission_retained: number }
interface DriverRow       { id: number; name: string; employee_id: string | null; trip_count: number; base_salary: string; per_trip_bonus: string; meal_allowance: string; other_deduction: string; net_salary: string }
interface FleetDriverGroup { fleet_id: number; fleet_name: string; drivers: DriverRow[]; total_salary: number }

interface SummaryData {
  month: string;
  layer1: {
    total_gross: number; by_service_type: ServiceTypeRow[];
    fusingao_commission_rate: number; fusingao_commission_amt: number;
    cpc_rebate_rate: number; cpc_rebate_amt: number;
    fuel_card_total: number; fuying_receive: number;
  };
  layer2: {
    fleets: FleetRow[];
    total_fleet_receive: number; total_commission_retained: number;
  };
  layer3: { by_fleet: FleetDriverGroup[]; total_salary: number };
  layer4: {
    total_income: number; total_fleet_cost: number; total_fuel_advance: number;
    cpc_rebate: number; gross_profit: number; gross_margin: number;
    estimated_tax: number; estimated_net_profit: number;
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function LayerCard({
  num, title, subtitle, accentColor, children, defaultOpen = true,
}: {
  num: string; title: string; subtitle?: string; accentColor: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderClass: Record<string, string> = {
    blue:   "border-blue-500/40",
    green:  "border-green-500/40",
    purple: "border-purple-500/40",
    orange: "border-orange-500/40",
  };
  const headerClass: Record<string, string> = {
    blue:   "from-blue-900/60 to-gray-900",
    green:  "from-green-900/60 to-gray-900",
    purple: "from-purple-900/60 to-gray-900",
    orange: "from-orange-900/60 to-gray-900",
  };
  const badgeClass: Record<string, string> = {
    blue:   "bg-blue-500/20 text-blue-300 border-blue-500/40",
    green:  "bg-green-500/20 text-green-300 border-green-500/40",
    purple: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    orange: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  };

  return (
    <div className={`rounded-xl border ${borderClass[accentColor]} overflow-hidden`} style={{ background: "#111827" }}>
      <button
        type="button"
        className={`w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r ${headerClass[accentColor]} hover:brightness-110 transition-all`}
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeClass[accentColor]}`}>{num}</span>
          <div className="text-left">
            <p className="text-white font-bold text-base leading-tight">{title}</p>
            {subtitle && <p className="text-gray-400 text-xs mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" /> : <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />}
      </button>
      {open && <div className="px-6 pb-6 pt-4">{children}</div>}
    </div>
  );
}

function StatRow({ label, value, sub, accent = false, deduct = false }: { label: string; value: string; sub?: string; accent?: boolean; deduct?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0 ${accent ? "bg-gray-800/50 rounded-lg px-3 -mx-3 my-1" : ""}`}>
      <div>
        <span className={`text-sm ${accent ? "text-white font-semibold" : "text-gray-300"}`}>{label}</span>
        {sub && <span className="ml-2 text-[10px] text-gray-500">{sub}</span>}
      </div>
      <span className={`font-mono text-sm font-semibold ${accent ? "text-white text-base" : deduct ? "text-red-400" : "text-gray-100"}`}>
        {deduct ? `− ${value}` : value}
      </span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function FourLayerSummary() {
  const { toast } = useToast();
  const slipRef = useRef<HTMLDivElement>(null);

  const [month, setMonth]           = useState(nowPeriod());
  const [fusingaoRate, setFusingaoRate] = useState(7);
  const [cpcRate, setCpcRate]       = useState(1);
  const [data, setData]             = useState<SummaryData | null>(null);
  const [loading, setLoading]       = useState(false);

  const monthOptions = recentMonths();

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const r = await fetch(
        apiUrl(`/fusingao/admin/four-layer-summary?month=${month}&fusingao_rate=${fusingaoRate}&cpc_rebate_rate=${cpcRate}`),
        { headers: authHeaders() }
      );
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setData(d);
    } catch (err: any) {
      toast({ title: "載入失敗", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [month, fusingaoRate, cpcRate]); // eslint-disable-line

  const handlePrint = () => window.print();

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "#0a0f1a", color: "#e5e7eb" }}>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          #four-layer-report { background: white !important; color: black !important; }
          #four-layer-report * { color: black !important; border-color: #ddd !important; background: transparent !important; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-30 border-b border-gray-800/80 backdrop-blur-sm" style={{ background: "rgba(10,15,26,0.95)" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            <span className="font-bold text-base text-white">四層財務結算彙總</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-2">
            {/* Month */}
            <select
              className="h-9 rounded-lg px-3 text-sm border border-gray-700 focus:outline-none focus:border-blue-500 bg-gray-900 text-gray-100"
              value={month}
              onChange={e => setMonth(e.target.value)}
            >
              {monthOptions.map(m => <option key={m} value={m}>{periodLabel(m)}</option>)}
            </select>

            {/* Fusingao commission rate */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 shrink-0">福興高抽成</span>
              <input
                type="number" min="0" max="30" step="0.5"
                className="w-16 h-9 rounded-lg px-2 text-sm border border-gray-700 bg-gray-900 text-gray-100 font-mono text-center"
                value={fusingaoRate}
                onChange={e => setFusingaoRate(Number(e.target.value))}
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            {/* CPC rebate rate */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 shrink-0">中油退款</span>
              <input
                type="number" min="0" max="5" step="0.1"
                className="w-14 h-9 rounded-lg px-2 text-sm border border-gray-700 bg-gray-900 text-gray-100 font-mono text-center"
                value={cpcRate}
                onChange={e => setCpcRate(Number(e.target.value))}
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "載入中…" : "重新計算"}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {data && (
              <>
                <button
                  onClick={handlePrint}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />列印
                </button>
                <button
                  onClick={handlePrint}
                  className="h-9 px-5 rounded-lg text-sm font-semibold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white flex items-center gap-1.5 transition-all shadow-lg shadow-orange-900/30"
                >
                  <Download className="h-3.5 w-3.5" />產生月結報表
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 gap-4">
          <BarChart3 className="h-14 w-14 text-gray-700" />
          <p className="text-sm">請選擇月份後點擊「重新計算」</p>
          <button
            onClick={load}
            className="h-10 px-6 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />載入 {periodLabel(month)} 資料
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 gap-3">
          <RefreshCw className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm">計算中，請稍候…</p>
        </div>
      )}

      {/* ── Report ── */}
      {data && !loading && (
        <div id="four-layer-report" className="max-w-6xl mx-auto px-6 py-6 space-y-5" ref={slipRef}>

          {/* Print header */}
          <div className="hidden print:block text-center mb-6 border-b pb-4">
            <p className="text-sm text-gray-500">富詠運輸股份有限公司</p>
            <h1 className="text-2xl font-bold mt-1">四層財務結算彙總報表</h1>
            <p className="text-sm text-gray-500 mt-1">結算月份：{periodLabel(data.month)}</p>
          </div>

          {/* ── Layer 1: Fusingao → Fuying ── */}
          <LayerCard
            num="Layer 1"
            title="福興高 → 富詠"
            subtitle={`${periodLabel(data.month)}　福興高應付富詠金額`}
            accentColor="blue"
          >
            {/* Service type breakdown */}
            {data.layer1.by_service_type.length > 0 ? (
              <div className="mb-4 rounded-lg overflow-hidden border border-gray-700/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-xs text-gray-400" style={{ background: "#1f2937" }}>
                      <th className="text-left px-4 py-2.5">車型 / 服務</th>
                      <th className="text-right px-4 py-2.5">趟次</th>
                      <th className="text-right px-4 py-2.5">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.layer1.by_service_type.map((r, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-gray-200">{stLabel(r.service_type)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-300">{Number(r.trip_count).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-blue-300">{fmt(r.amount)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "#1e3a5f40" }}>
                      <td className="px-4 py-2.5 font-semibold text-white">合計</td>
                      <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                        {data.layer1.by_service_type.reduce((s, r) => s + Number(r.trip_count), 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-200 font-bold">{fmt(data.layer1.total_gross)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 py-3">
                <AlertCircle className="h-4 w-4" />{periodLabel(data.month)} 尚無蝦皮帳單資料
              </div>
            )}

            {/* Calculation */}
            <div className="rounded-lg border border-gray-700/50 p-4 space-y-0" style={{ background: "#111827" }}>
              <StatRow label={`福興高應付總額`} value={fmt(data.layer1.total_gross)} />
              <StatRow
                label={`− 福興高服務費（${data.layer1.fusingao_commission_rate}%）`}
                value={fmt(data.layer1.fusingao_commission_amt)}
                deduct
              />
              <StatRow
                label={`＋ 中油退款收益（${data.layer1.cpc_rebate_rate}%）`}
                sub={`加油卡總額 ${fmt(data.layer1.fuel_card_total)}`}
                value={`＋ ${fmt(data.layer1.cpc_rebate_amt)}`}
              />
              <StatRow
                label="富詠實收金額"
                value={fmt(data.layer1.fuying_receive)}
                accent
              />
            </div>
          </LayerCard>

          {/* ── Layer 2: Fuying → Fleets ── */}
          <LayerCard
            num="Layer 2"
            title="富詠 → 各車隊"
            subtitle={`共 ${data.layer2.fleets.filter(f => f.trip_count > 0).length} 支活躍車隊`}
            accentColor="green"
          >
            <div className="rounded-lg overflow-hidden border border-gray-700/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400" style={{ background: "#1f2937" }}>
                    <th className="text-left px-4 py-2.5">車隊名稱</th>
                    <th className="text-right px-4 py-2.5">趟次</th>
                    <th className="text-right px-4 py-2.5">蝦皮趟費</th>
                    <th className="text-right px-4 py-2.5">富詠抽成%</th>
                    <th className="text-right px-4 py-2.5">富詠留存</th>
                    <th className="text-right px-4 py-2.5">車隊應收</th>
                  </tr>
                </thead>
                <tbody>
                  {data.layer2.fleets.map((f, i) => (
                    <tr key={i} className={`border-b border-gray-800 hover:bg-gray-800/40 transition-colors ${f.trip_count === 0 ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 text-gray-200 font-medium">{f.fleet_name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300">{Number(f.trip_count).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300">{fmt(f.shopee_income)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-400">{f.commission_rate}%</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-300">{fmt(f.commission_retained)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-green-300 font-semibold">{fmt(f.fleet_receive)}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{ background: "#14532d40" }}>
                    <td className="px-4 py-2.5 font-bold text-white">合計</td>
                    <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                      {data.layer2.fleets.reduce((s, f) => s + Number(f.trip_count), 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-white font-semibold">
                      {fmt(data.layer2.fleets.reduce((s, f) => s + f.shopee_income, 0))}
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-right font-mono text-orange-200 font-bold">
                      {fmt(data.layer2.total_commission_retained)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-200 font-bold">
                      {fmt(data.layer2.total_fleet_receive)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </LayerCard>

          {/* ── Layer 3: Fleet → Drivers ── */}
          <LayerCard
            num="Layer 3"
            title="車隊 → 司機"
            subtitle={`薪資合計 ${fmt(data.layer3.total_salary)}`}
            accentColor="purple"
            defaultOpen={false}
          >
            {data.layer3.by_fleet.length === 0 ? (
              <p className="text-sm text-gray-500 py-3">本月無司機薪資記錄</p>
            ) : (
              <div className="space-y-4">
                {data.layer3.by_fleet.map((fleetGroup, gi) => (
                  <div key={gi} className="rounded-lg overflow-hidden border border-gray-700/50">
                    <div className="px-4 py-2 flex items-center justify-between" style={{ background: "#2e1065" }}>
                      <span className="text-purple-200 font-semibold text-sm flex items-center gap-2">
                        <Truck className="h-3.5 w-3.5" />{fleetGroup.fleet_name}
                      </span>
                      <span className="font-mono text-purple-300 text-sm">小計：{fmt(fleetGroup.total_salary)}</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-800 text-gray-500" style={{ background: "#1a0936" }}>
                          <th className="text-left px-4 py-2">司機</th>
                          <th className="text-right px-3 py-2">趟次</th>
                          <th className="text-right px-3 py-2">底薪</th>
                          <th className="text-right px-3 py-2">趟次獎金</th>
                          <th className="text-right px-3 py-2">餐補</th>
                          <th className="text-right px-3 py-2">扣款</th>
                          <th className="text-right px-4 py-2">實領</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleetGroup.drivers.map((d, di) => (
                          <tr key={di} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="px-4 py-2 text-gray-200">{d.name}{d.employee_id && <span className="text-gray-500 ml-1">#{d.employee_id}</span>}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{d.trip_count}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{fmt(Number(d.base_salary))}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{d.trip_count}×{fmt(Number(d.per_trip_bonus))}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-300">{fmt(Number(d.meal_allowance))}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-400">−{fmt(Number(d.other_deduction))}</td>
                            <td className="px-4 py-2 text-right font-mono text-purple-300 font-semibold">{fmt(Number(d.net_salary))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {/* Total */}
                <div className="flex justify-between items-center px-4 py-3 rounded-lg border border-purple-500/30" style={{ background: "#1e1036" }}>
                  <span className="text-purple-200 font-semibold flex items-center gap-2"><Users className="h-4 w-4" />司機薪資總計</span>
                  <span className="font-mono text-purple-200 font-bold text-lg">{fmt(data.layer3.total_salary)}</span>
                </div>
              </div>
            )}
          </LayerCard>

          {/* ── Layer 4: P&L ── */}
          <LayerCard
            num="Layer 4"
            title="富詠平台損益"
            subtitle={`${periodLabel(data.month)} 月度損益核算`}
            accentColor="orange"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Income & Costs */}
              <div className="rounded-lg border border-gray-700/50 p-4 space-y-0" style={{ background: "#111827" }}>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">收入 / 成本</p>
                <StatRow
                  label="總收入（Layer 1 富詠實收）"
                  value={fmt(data.layer4.total_income)}
                />
                <StatRow
                  label="− 付給各車隊（Layer 2 合計）"
                  value={fmt(data.layer4.total_fleet_cost)}
                  deduct
                />
                <StatRow
                  label="− 加油卡代墊總額"
                  value={fmt(data.layer4.total_fuel_advance)}
                  deduct
                />
                <StatRow
                  label="＋ 中油退款收益（已含於收入）"
                  value={`＋ ${fmt(data.layer4.cpc_rebate)}`}
                />
              </div>

              {/* Right: Profit summary */}
              <div className="rounded-lg border border-orange-500/30 p-4 space-y-0" style={{ background: "#111827" }}>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">損益核算</p>
                <StatRow
                  label="毛利"
                  value={fmt(data.layer4.gross_profit)}
                  accent={false}
                />
                <StatRow
                  label="毛利率"
                  value={pct(data.layer4.gross_margin)}
                />
                <StatRow
                  label="− 預估營業稅（5%）"
                  value={fmt(data.layer4.estimated_tax)}
                  deduct
                />
                <div className={`mt-3 flex items-center justify-between rounded-lg px-4 py-3 ${data.layer4.estimated_net_profit >= 0 ? "bg-green-900/30 border border-green-500/30" : "bg-red-900/30 border border-red-500/30"}`}>
                  <div className="flex items-center gap-2">
                    {data.layer4.estimated_net_profit >= 0
                      ? <TrendingUp className="h-5 w-5 text-green-400" />
                      : <TrendingDown className="h-5 w-5 text-red-400" />
                    }
                    <span className={`font-bold text-sm ${data.layer4.estimated_net_profit >= 0 ? "text-green-300" : "text-red-300"}`}>
                      預估淨利
                    </span>
                  </div>
                  <span className={`font-mono font-bold text-xl ${data.layer4.estimated_net_profit >= 0 ? "text-green-300" : "text-red-400"}`}>
                    {fmt(data.layer4.estimated_net_profit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Summary KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {[
                { label: "平台總收入", value: fmt(data.layer4.total_income), color: "text-blue-400" },
                { label: "車隊總成本", value: fmt(data.layer4.total_fleet_cost), color: "text-red-400" },
                { label: "毛利", value: fmt(data.layer4.gross_profit), color: data.layer4.gross_profit >= 0 ? "text-green-400" : "text-red-400" },
                { label: "淨利（稅後）", value: fmt(data.layer4.estimated_net_profit), color: data.layer4.estimated_net_profit >= 0 ? "text-emerald-400" : "text-red-400" },
              ].map((k, i) => (
                <div key={i} className="rounded-lg border border-gray-700/50 px-4 py-3 text-center" style={{ background: "#1f2937" }}>
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <p className={`font-mono font-bold text-sm ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          </LayerCard>

          {/* ── Footer ── */}
          <div className="text-center text-xs text-gray-600 pt-2 pb-8 no-print">
            富詠運輸 四層財務彙總 · {periodLabel(data.month)} · 系統自動計算，數據僅供參考
          </div>
          <div className="hidden print:block text-center text-xs text-gray-400 pt-4">
            富詠運輸股份有限公司 · {periodLabel(data.month)} 月結報表 · 列印時間：{new Date().toLocaleString("zh-TW")}
          </div>
        </div>
      )}
    </div>
  );
}
