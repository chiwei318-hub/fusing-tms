import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Leaf, Truck, TrendingDown, Wind, BarChart2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrdersData } from "@/hooks/use-orders";
import { calcCarbonKg, carbonLabel, getEmissionFactor, VEHICLE_EMISSION_FACTOR, equivalentTrees } from "@/lib/carbon";
import type { Order } from "@workspace/api-client-react";

const PERIOD_OPTIONS = [
  { label: "本月", value: "this_month" },
  { label: "上月", value: "last_month" },
  { label: "全部", value: "all" },
];

function getPeriodRange(period: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  if (period === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (period === "last_month") {
    const last = subMonths(now, 1);
    return { start: startOfMonth(last), end: endOfMonth(last) };
  }
  return { start: null, end: null };
}

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CarbonReportTab() {
  const { data: orders = [] } = useOrdersData();
  const [period, setPeriod] = useState("this_month");

  const filtered = useMemo(() => {
    const { start, end } = getPeriodRange(period);
    return (orders as Order[]).filter(o => {
      if (!start || !end) return true;
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    });
  }, [orders, period]);

  const ordersWithCarbon = useMemo(() =>
    filtered
      .map(o => ({
        ...o,
        carbonKg: calcCarbonKg(o.distanceKm, o.requiredVehicleType ?? o.driver?.vehicleType),
      }))
      .filter(o => o.carbonKg !== null)
      .sort((a, b) => (b.carbonKg ?? 0) - (a.carbonKg ?? 0)),
    [filtered],
  );

  const totalCarbon = useMemo(
    () => ordersWithCarbon.reduce((s, o) => s + (o.carbonKg ?? 0), 0),
    [ordersWithCarbon],
  );

  const totalDistance = useMemo(
    () => filtered.reduce((s, o) => s + (o.distanceKm ?? 0), 0),
    [filtered],
  );

  const avgCarbon = ordersWithCarbon.length > 0
    ? totalCarbon / ordersWithCarbon.length
    : 0;

  const byVehicle = useMemo(() => {
    const map: Record<string, { count: number; totalKm: number; totalCo2: number }> = {};
    for (const o of ordersWithCarbon) {
      const vt = o.requiredVehicleType ?? o.driver?.vehicleType ?? "未知";
      if (!map[vt]) map[vt] = { count: 0, totalKm: 0, totalCo2: 0 };
      map[vt].count++;
      map[vt].totalKm += o.distanceKm ?? 0;
      map[vt].totalCo2 += o.carbonKg ?? 0;
    }
    return Object.entries(map)
      .map(([vt, v]) => ({ vt, ...v, factor: getEmissionFactor(vt) }))
      .sort((a, b) => b.totalCo2 - a.totalCo2);
  }, [ordersWithCarbon]);

  const maxCo2 = byVehicle[0]?.totalCo2 ?? 1;

  function handleExport() {
    const rows = [
      ["訂單號", "日期", "起點", "終點", "車型", "距離(km)", "排放係數(kg/km)", "碳排量(kg)"],
      ...ordersWithCarbon.map(o => [
        `#${o.id}`,
        format(new Date(o.createdAt), "yyyy-MM-dd"),
        o.pickupAddress,
        o.deliveryAddress,
        o.requiredVehicleType ?? o.driver?.vehicleType ?? "未知",
        o.distanceKm?.toFixed(1) ?? "",
        getEmissionFactor(o.requiredVehicleType ?? o.driver?.vehicleType).toFixed(2),
        o.carbonKg?.toFixed(1) ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `碳排報表_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Leaf className="w-5 h-5 text-emerald-600" /> 碳排放報表
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            依車型及距離估算，柴油每公升 2.68 kg CO₂
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden text-xs">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  period === opt.value
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> 匯出 CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Wind className="w-5 h-5 text-emerald-700" />}
          label="總碳排放量"
          value={carbonLabel(Math.round(totalCarbon * 10) / 10)}
          sub={`${ordersWithCarbon.length} 筆有效訂單`}
          color="bg-emerald-100"
        />
        <StatCard
          icon={<BarChart2 className="w-5 h-5 text-blue-700" />}
          label="平均每單碳排"
          value={`${avgCarbon.toFixed(1)} kg`}
          sub="CO₂ / 單"
          color="bg-blue-100"
        />
        <StatCard
          icon={<Truck className="w-5 h-5 text-orange-700" />}
          label="總行駛距離"
          value={`${Math.round(totalDistance).toLocaleString()} km`}
          sub={`${filtered.filter(o => o.distanceKm).length} 筆有距離資料`}
          color="bg-orange-100"
        />
        <StatCard
          icon={<Leaf className="w-5 h-5 text-green-700" />}
          label="等效需植樹數"
          value={`${equivalentTrees(totalCarbon).toLocaleString()} 棵`}
          sub="每棵每年吸收 21.77 kg"
          color="bg-green-100"
        />
      </div>

      {/* Vehicle type breakdown */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" /> 車型碳排分析
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {byVehicle.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">此區間無有距離資料的訂單</p>
          ) : (
            <div className="space-y-3">
              {/* Emission factor reference */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {Object.entries(VEHICLE_EMISSION_FACTOR).slice(0, 8).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[10px] bg-muted/60 border rounded px-2 py-0.5 text-muted-foreground">
                    {k}: <strong className="text-foreground">{v} kg/km</strong>
                  </span>
                ))}
              </div>
              {byVehicle.map(row => (
                <div key={row.vt} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{row.vt}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {row.factor} kg/km
                      </Badge>
                      <span className="text-xs text-muted-foreground">{row.count} 單</span>
                    </div>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {carbonLabel(Math.round(row.totalCo2 * 10) / 10)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.round((row.totalCo2 / maxCo2) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    累計 {Math.round(row.totalKm).toLocaleString()} km
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order list */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary" /> 各單碳排明細
            <span className="text-xs text-muted-foreground font-normal ml-1">（由高至低）</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordersWithCarbon.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              此區間無含距離資料的訂單
            </p>
          ) : (
            <div className="divide-y">
              {ordersWithCarbon.slice(0, 50).map(o => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center shrink-0">
                    <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[9px] text-emerald-700 font-bold leading-none mt-0.5">CO₂</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">#{o.id}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(o.createdAt), "MM/dd")}
                      </span>
                      {(o.requiredVehicleType ?? o.driver?.vehicleType) && (
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {o.requiredVehicleType ?? o.driver?.vehicleType}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {o.pickupAddress} → {o.deliveryAddress}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-emerald-700">
                      {carbonLabel(o.carbonKg)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {o.distanceKm?.toFixed(0)} km
                    </p>
                  </div>
                </div>
              ))}
              {ordersWithCarbon.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  僅顯示前 50 筆，請匯出 CSV 查看全部
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground text-center">
        本數據依車型排放係數估算（kg CO₂/km），實際排放量以加油量 × 2.68 為準。
        重車（17T/曳引車）係數 1.2 kg/km，輕型車 0.25 kg/km。
      </p>
    </div>
  );
}
