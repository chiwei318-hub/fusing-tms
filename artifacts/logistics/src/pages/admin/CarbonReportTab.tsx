import { useMemo, useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  Leaf, Truck, TrendingDown, Wind, BarChart2, Download,
  Plus, Trash2, Fuel, FlaskConical, Calculator, Droplets,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrdersData } from "@/hooks/use-orders";
import {
  calcCarbonKg, calcCarbonFromFuel, calcFuelLiters, calcCarbonFromKmAndEfficiency,
  carbonLabel, getEmissionFactor, getFuelEfficiency,
  VEHICLE_EMISSION_FACTOR, VEHICLE_FUEL_EFFICIENCY, equivalentTrees,
  DIESEL_CO2_PER_LITER,
} from "@/lib/carbon";
import type { Order } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FuelEntry {
  id: string;
  date: string;
  vehicle: string;
  km: number;
  kmPerL: number;   // 0 = not set
  liters: number;
  co2: number;
  note: string;
}

const FUEL_LOG_KEY = "carbon_fuel_log_v2";
function loadFuelLog(): FuelEntry[] {
  try { return JSON.parse(localStorage.getItem(FUEL_LOG_KEY) ?? "[]"); } catch { return []; }
}
function saveFuelLog(entries: FuelEntry[]) {
  localStorage.setItem(FUEL_LOG_KEY, JSON.stringify(entries));
}

// ─── Period ───────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "本月", value: "this_month" },
  { label: "上月", value: "last_month" },
  { label: "全部", value: "all" },
];
function getPeriodRange(period: string) {
  const now = new Date();
  if (period === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (period === "last_month") { const last = subMonths(now, 1); return { start: startOfMonth(last), end: endOfMonth(last) }; }
  return { start: null, end: null };
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── FuelLogTab ───────────────────────────────────────────────────────────────

function FuelLogTab() {
  const [entries, setEntries] = useState<FuelEntry[]>(loadFuelLog);
  const [form, setForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    vehicle: "", km: "", kmPerL: "", liters: "", note: "",
  });

  useEffect(() => { saveFuelLog(entries); }, [entries]);

  // Derive liters from km + km/L when available; else from direct liters input
  const derived = useMemo(() => {
    const km = parseFloat(form.km);
    const kmPerL = parseFloat(form.kmPerL);
    const liters = parseFloat(form.liters);
    const hasKmMethod = !isNaN(km) && km > 0 && !isNaN(kmPerL) && kmPerL > 0;
    const hasDirectLiters = !isNaN(liters) && liters > 0;

    if (hasKmMethod) {
      const result = calcCarbonFromKmAndEfficiency(km, kmPerL);
      return { liters: result.liters, co2: result.co2, method: "km" as const };
    }
    if (hasDirectLiters) {
      return { liters, co2: calcCarbonFromFuel(liters), method: "direct" as const };
    }
    return null;
  }, [form.km, form.kmPerL, form.liters]);

  function handleAdd() {
    if (!form.vehicle.trim() || !derived) return;
    const km = parseFloat(form.km);
    const kmPerL = parseFloat(form.kmPerL);
    const entry: FuelEntry = {
      id: Date.now().toString(),
      date: form.date,
      vehicle: form.vehicle.trim(),
      km: isNaN(km) ? 0 : km,
      kmPerL: isNaN(kmPerL) ? 0 : kmPerL,
      liters: derived.liters,
      co2: derived.co2,
      note: form.note.trim(),
    };
    setEntries(prev => [entry, ...prev]);
    setForm(f => ({ ...f, vehicle: "", km: "", kmPerL: "", liters: "", note: "" }));
  }

  function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function handleExport() {
    const rows = [
      ["日期", "車牌/車號", "行駛公里", "油耗(km/L)", "用油量(L)", "碳排(kg)", "計算式", "備註"],
      ...entries.map(e => [
        e.date, e.vehicle,
        e.km > 0 ? e.km.toString() : "",
        e.kmPerL > 0 ? e.kmPerL.toString() : "",
        e.liters.toFixed(2),
        e.co2.toFixed(1),
        e.kmPerL > 0
          ? `${e.km}km ÷ ${e.kmPerL}km/L = ${e.liters.toFixed(2)}L × 2.68 = ${e.co2.toFixed(1)}kg`
          : `${e.liters.toFixed(2)}L × 2.68 = ${e.co2.toFixed(1)}kg`,
        e.note,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `燃油碳排記錄_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalCo2 = entries.reduce((s, e) => s + e.co2, 0);
  const totalLiters = entries.reduce((s, e) => s + e.liters, 0);
  const totalKm = entries.reduce((s, e) => s + e.km, 0);

  const byVehicle = useMemo(() => {
    const map: Record<string, { liters: number; co2: number; km: number; count: number }> = {};
    for (const e of entries) {
      if (!map[e.vehicle]) map[e.vehicle] = { liters: 0, co2: 0, km: 0, count: 0 };
      map[e.vehicle].liters += e.liters;
      map[e.vehicle].co2 += e.co2;
      map[e.vehicle].km += e.km;
      map[e.vehicle].count++;
    }
    return Object.entries(map).map(([v, d]) => ({ vehicle: v, ...d })).sort((a, b) => b.co2 - a.co2);
  }, [entries]);

  const maxCo2 = byVehicle[0]?.co2 ?? 1;

  return (
    <div className="space-y-5">
      {/* Formula banner */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Fuel className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">方法一：直接輸入加油量</p>
            <p className="text-xs text-amber-700 mt-0.5">碳排 (kg) ＝ 加油量 (L) × <strong>2.68</strong></p>
            <p className="text-[10px] text-amber-600 mt-1">例：50 L × 2.68 ＝ 134 kg</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Calculator className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">方法二：公里 + 油耗推算</p>
            <p className="text-xs text-blue-700 mt-0.5">用油 (L) ＝ 公里 ÷ 油耗 (km/L)　→ × <strong>2.68</strong></p>
            <p className="text-[10px] text-blue-600 mt-1">例：80 km ÷ 8 km/L ＝ 10 L × 2.68 ＝ 26.8 kg</p>
          </div>
        </div>
      </div>

      {/* Input form */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> 新增燃油記錄
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Row 1: date + vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">日期</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">車牌 / 車號 <span className="text-red-500">*</span></Label>
              <Input placeholder="例：ABC-1234" value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} className="h-8 text-sm" />
            </div>
          </div>

          {/* Row 2: method A vs B */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1 rounded">方法一</span>
                加油量（公升）
              </Label>
              <div className="relative">
                <Input type="number" min={0} step={0.1} placeholder="例：50"
                  value={form.liters}
                  onChange={e => { setForm(f => ({ ...f, liters: e.target.value, km: "", kmPerL: "" })); }}
                  disabled={!!form.km || !!form.kmPerL}
                  className="h-8 text-sm pr-6" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">L</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1 rounded">方法二</span>
                行駛公里
              </Label>
              <div className="relative">
                <Input type="number" min={0} placeholder="例：80"
                  value={form.km}
                  onChange={e => { setForm(f => ({ ...f, km: e.target.value, liters: "" })); }}
                  disabled={!!form.liters}
                  className="h-8 text-sm pr-8" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1 rounded">方法二</span>
                油耗（km/L）
              </Label>
              <div className="relative">
                <Input type="number" min={0} step={0.1} placeholder="例：8"
                  value={form.kmPerL}
                  onChange={e => { setForm(f => ({ ...f, kmPerL: e.target.value, liters: "" })); }}
                  disabled={!!form.liters}
                  className="h-8 text-sm pr-10" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">km/L</span>
              </div>
            </div>
          </div>

          {/* Real-time preview */}
          {derived && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <FlaskConical className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-800 space-y-0.5">
                {derived.method === "km" ? (
                  <>
                    <p><strong>{form.km} km ÷ {form.kmPerL} km/L</strong> ＝ <strong>{derived.liters.toFixed(2)} 公升</strong></p>
                    <p><strong>{derived.liters.toFixed(2)} L × 2.68</strong> ＝ <span className="text-emerald-700 font-bold text-sm">{derived.co2.toFixed(1)} kg CO₂</span></p>
                  </>
                ) : (
                  <p><strong>{form.liters} L × 2.68</strong> ＝ <span className="text-emerald-700 font-bold text-sm">{derived.co2.toFixed(1)} kg CO₂</span></p>
                )}
              </div>
            </div>
          )}

          {/* Notes + Add button */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">備註（選填）</Label>
              <Input placeholder="例：台北→高雄" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex flex-col justify-end">
              <Button size="sm" onClick={handleAdd} disabled={!form.vehicle.trim() || !derived}
                className="h-8 text-xs gap-1.5 px-5">
                <Plus className="w-3.5 h-3.5" /> 新增
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Fuel className="w-5 h-5 text-amber-700" />} label="總用油量" value={`${totalLiters.toFixed(1)} L`} sub={`${entries.length} 筆記錄`} color="bg-amber-100" />
            <StatCard icon={<Wind className="w-5 h-5 text-emerald-700" />} label="實際總碳排" value={carbonLabel(Math.round(totalCo2 * 10) / 10)} sub="油量 × 2.68" color="bg-emerald-100" />
            <StatCard icon={<Truck className="w-5 h-5 text-blue-700" />} label="總行駛里程" value={totalKm > 0 ? `${Math.round(totalKm).toLocaleString()} km` : "—"} sub="有填寫的記錄" color="bg-blue-100" />
            <StatCard icon={<Leaf className="w-5 h-5 text-green-700" />} label="等效需植樹數" value={`${equivalentTrees(totalCo2).toLocaleString()} 棵`} sub="每棵/年吸 21.77 kg" color="bg-green-100" />
          </div>

          {/* Per vehicle */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/30">
              <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> 各車碳排分析</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {byVehicle.map(row => (
                <div key={row.vehicle} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">{row.vehicle}</span>
                      <span className="text-xs text-muted-foreground">{row.count} 筆 · {row.liters.toFixed(1)} L</span>
                    </div>
                    <span className="font-bold text-emerald-700 tabular-nums">{carbonLabel(Math.round(row.co2 * 10) / 10)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.round((row.co2 / maxCo2) * 100)}%` }} />
                  </div>
                  {row.km > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      累計 {Math.round(row.km).toLocaleString()} km · 平均油耗 {(row.liters / row.km * 100).toFixed(1)} L/100km
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Log table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/30 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Fuel className="w-4 h-4 text-primary" /> 燃油記錄明細</CardTitle>
              <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 text-xs h-7">
                <Download className="w-3 h-3" /> 匯出 CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {entries.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center justify-center shrink-0">
                      <Fuel className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-[9px] text-amber-700 font-bold leading-none mt-0.5">{e.liters.toFixed(0)}L</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold font-mono text-foreground">{e.vehicle}</span>
                        <span className="text-[10px] text-muted-foreground">{e.date}</span>
                        {e.km > 0 && <span className="text-[10px] text-muted-foreground">{e.km} km</span>}
                        {e.kmPerL > 0 && <Badge variant="outline" className="text-[10px] px-1">{e.kmPerL} km/L</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {e.kmPerL > 0
                          ? <>{e.km} km ÷ {e.kmPerL} km/L ＝ {e.liters.toFixed(2)} L × 2.68 ＝ </>
                          : <>{e.liters.toFixed(2)} L × 2.68 ＝ </>
                        }
                        <strong className="text-emerald-700">{e.co2.toFixed(1)} kg CO₂</strong>
                        {e.note && <span className="ml-2 text-muted-foreground">· {e.note}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-700">{carbonLabel(e.co2)}</p>
                      <button onClick={() => handleDelete(e.id)}
                        className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-0.5 ml-auto mt-0.5 transition-colors">
                        <Trash2 className="w-3 h-3" /> 刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Fuel className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-medium">尚未有燃油記錄</p>
          <p className="text-xs mt-1">選擇方法一（直接填加油量）或方法二（填公里 + 油耗），即可自動計算 CO₂</p>
        </div>
      )}
    </div>
  );
}

// ─── EstimatedTab ──────────────────────────────────────────────────────────────

function EstimatedTab({ period, setPeriod }: { period: string; setPeriod: (v: string) => void }) {
  const { data: orders = [] } = useOrdersData();

  const filtered = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    return (orders as Order[]).filter(o => {
      if (!start || !end) return true;
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    });
  }, [orders, period]);

  const ordersWithData = useMemo(() =>
    filtered
      .filter(o => o.distanceKm && o.distanceKm > 0)
      .map(o => {
        const vt = o.requiredVehicleType ?? o.driver?.vehicleType;
        const kmPerL = getFuelEfficiency(vt);
        const { liters, co2 } = calcCarbonFromKmAndEfficiency(o.distanceKm!, kmPerL);
        return { ...o, vt, kmPerL, liters, co2 };
      })
      .sort((a, b) => b.co2 - a.co2),
    [filtered],
  );

  const totalCo2 = useMemo(() => ordersWithData.reduce((s, o) => s + o.co2, 0), [ordersWithData]);
  const totalLiters = useMemo(() => ordersWithData.reduce((s, o) => s + o.liters, 0), [ordersWithData]);
  const totalDistance = useMemo(() => ordersWithData.reduce((s, o) => s + (o.distanceKm ?? 0), 0), [ordersWithData]);
  const avgCo2 = ordersWithData.length > 0 ? totalCo2 / ordersWithData.length : 0;

  const byVehicle = useMemo(() => {
    const map: Record<string, { count: number; totalKm: number; totalLiters: number; totalCo2: number; kmPerL: number }> = {};
    for (const o of ordersWithData) {
      const vt = o.vt ?? "未知";
      if (!map[vt]) map[vt] = { count: 0, totalKm: 0, totalLiters: 0, totalCo2: 0, kmPerL: o.kmPerL };
      map[vt].count++;
      map[vt].totalKm += o.distanceKm ?? 0;
      map[vt].totalLiters += o.liters;
      map[vt].totalCo2 += o.co2;
    }
    return Object.entries(map).map(([vt, v]) => ({ vt, ...v })).sort((a, b) => b.totalCo2 - a.totalCo2);
  }, [ordersWithData]);

  const maxCo2 = byVehicle[0]?.totalCo2 ?? 1;

  function handleExport() {
    const rows = [
      ["訂單號", "日期", "起點", "終點", "車型", "距離(km)", "油耗(km/L)", "估算用油(L)", "碳排(kg)", "計算式"],
      ...ordersWithData.map(o => [
        `#${o.id}`,
        format(new Date(o.createdAt), "yyyy-MM-dd"),
        o.pickupAddress,
        o.deliveryAddress,
        o.vt ?? "未知",
        o.distanceKm?.toFixed(1) ?? "",
        o.kmPerL.toString(),
        o.liters.toFixed(2),
        o.co2.toFixed(1),
        `${o.distanceKm?.toFixed(1)}km ÷ ${o.kmPerL}km/L = ${o.liters.toFixed(2)}L × 2.68 = ${o.co2.toFixed(1)}kg`,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `碳排估算報表_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Formula hint */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Calculator className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-0.5">
          <p className="font-semibold">估算公式：公里 ÷ 油耗 (km/L) ＝ 用油量 (L)　→　用油量 × 2.68 ＝ 碳排 (kg)</p>
          <p className="text-blue-600">每筆訂單依車型預設油耗估算，實際數值請用「燃油記錄」頁輸入。</p>
        </div>
      </div>

      {/* Period + Export */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-lg border overflow-hidden text-xs">
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 font-medium transition-colors ${period === opt.value ? "bg-emerald-600 text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> 匯出 CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Droplets className="w-5 h-5 text-blue-700" />} label="估算總用油量" value={`${totalLiters.toFixed(1)} L`} sub={`${ordersWithData.length} 筆有距離資料`} color="bg-blue-100" />
        <StatCard icon={<Wind className="w-5 h-5 text-emerald-700" />} label="估算總碳排" value={carbonLabel(Math.round(totalCo2 * 10) / 10)} sub="油量 × 2.68" color="bg-emerald-100" />
        <StatCard icon={<Truck className="w-5 h-5 text-orange-700" />} label="總行駛距離" value={`${Math.round(totalDistance).toLocaleString()} km`} sub="有距離資料的訂單" color="bg-orange-100" />
        <StatCard icon={<BarChart2 className="w-5 h-5 text-purple-700" />} label="平均每單碳排" value={`${avgCo2.toFixed(1)} kg`} sub="CO₂ / 單" color="bg-purple-100" />
      </div>

      {/* Vehicle breakdown */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /> 車型碳排分析</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {byVehicle.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">此區間無有距離資料的訂單</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 mb-4">
                {Object.entries(VEHICLE_FUEL_EFFICIENCY).slice(0, 8).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[10px] bg-muted/60 border rounded px-2 py-0.5 text-muted-foreground">
                    {k}: <strong className="text-foreground">{v} km/L</strong>
                  </span>
                ))}
              </div>
              {byVehicle.map(row => (
                <div key={row.vt} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.vt}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">{row.kmPerL} km/L</Badge>
                      <span className="text-xs text-muted-foreground">{row.count} 單</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-700 tabular-nums">{carbonLabel(Math.round(row.totalCo2 * 10) / 10)}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{row.totalLiters.toFixed(1)} L</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.round((row.totalCo2 / maxCo2) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">累計 {Math.round(row.totalKm).toLocaleString()} km</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-order list */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary" /> 各單明細
            <span className="text-xs text-muted-foreground font-normal ml-1">距離 · 用油 · 碳排（由高至低）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordersWithData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">此區間無含距離資料的訂單</p>
          ) : (
            <div className="divide-y">
              {ordersWithData.slice(0, 50).map(o => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center shrink-0">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[9px] text-emerald-700 font-bold leading-none mt-0.5">CO₂</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">#{o.id}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(o.createdAt), "MM/dd")}</span>
                      {o.vt && <Badge variant="outline" className="text-[10px] px-1.5">{o.vt}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{o.pickupAddress} → {o.deliveryAddress}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {o.distanceKm?.toFixed(1)} km ÷ {o.kmPerL} km/L ＝ {o.liters.toFixed(2)} L × 2.68 ＝ <strong className="text-emerald-700">{o.co2.toFixed(1)} kg</strong>
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-bold text-emerald-700">{carbonLabel(o.co2)}</p>
                    <p className="text-[10px] text-muted-foreground">{o.liters.toFixed(1)} L</p>
                    <p className="text-[10px] text-muted-foreground">{o.distanceKm?.toFixed(0)} km</p>
                  </div>
                </div>
              ))}
              {ordersWithData.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-3">僅顯示前 50 筆，請匯出 CSV 查看全部</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        各車型預設油耗（km/L）：小貨車 12、3.5T 8、5T 6、冷藏車 5、17T/曳引車 3.5。如需修正，請切換至「燃油記錄」手動輸入。
      </p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CarbonReportTab() {
  const [tab, setTab] = useState<"estimated" | "fuel">("estimated");
  const [period, setPeriod] = useState("this_month");

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Leaf className="w-5 h-5 text-emerald-600" /> 碳排放報表
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            估算：公里 ÷ 油耗 ＝ 用油量　→　用油量 × 2.68 ＝ 碳排
          </p>
        </div>
        <div className="flex rounded-lg border overflow-hidden text-xs self-start">
          <button onClick={() => setTab("estimated")}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${tab === "estimated" ? "bg-emerald-600 text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}>
            <BarChart2 className="w-3.5 h-3.5" /> 訂單估算
          </button>
          <button onClick={() => setTab("fuel")}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${tab === "fuel" ? "bg-amber-500 text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}>
            <Fuel className="w-3.5 h-3.5" /> 燃油記錄
          </button>
        </div>
      </div>

      {tab === "estimated"
        ? <EstimatedTab period={period} setPeriod={setPeriod} />
        : <FuelLogTab />
      }
    </div>
  );
}
