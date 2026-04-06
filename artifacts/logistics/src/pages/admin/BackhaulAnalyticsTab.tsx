import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeftRight, TrendingUp, RefreshCw, Truck,
  BarChart3, DollarSign, MapPin, Zap, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

type BackhaulStats = {
  period: string;
  active_drivers: number;
  completed_trips: number;
  total_revenue: number;
  avg_order_fee: number;
  estimated_empty_return_pct: number;
  estimated_backhaul_opportunities: number;
  potential_extra_revenue: number;
  weekly_demand: { day_of_week: number; hour_of_day: number; order_count: number }[];
  top_routes: { pickup: string; delivery: string; trips: number; revenue: number }[];
};

function StatCard({
  label, value, sub, icon: Icon, color, highlight,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-2 border-green-300 bg-green-50" : ""}>
      <CardContent className="p-4">
        <Icon className={`w-5 h-5 ${color} mb-2`} />
        <p className={`text-2xl font-black ${color}`}>{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DemandHeatmap({ data }: { data: { day_of_week: number; hour_of_day: number; order_count: number }[] }) {
  if (!data.length) return (
    <p className="text-center text-gray-400 text-sm py-6">尚無需求數據</p>
  );

  const maxCount = Math.max(...data.map(d => d.order_count), 1);
  const grid: Record<string, number> = {};
  for (const d of data) grid[`${d.day_of_week}-${d.hour_of_day}`] = d.order_count;

  const peakHours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: DAYS.reduce((sum, _, d) => sum + (grid[`${d}-${h}`] ?? 0), 0),
  })).sort((a, b) => b.total - a.total).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Hour labels */}
          <div className="flex mb-1 pl-8">
            {[0, 3, 6, 9, 12, 15, 18, 21, 23].map(h => (
              <div key={h} className="text-[10px] text-gray-400" style={{ width: `${100 / 24 * (h === 23 ? 1 : 3)}%` }}>
                {h}時
              </div>
            ))}
          </div>
          {DAYS.map((day, d) => (
            <div key={d} className="flex items-center gap-1 mb-1">
              <span className="w-7 text-[11px] text-gray-500 text-right flex-shrink-0">週{day}</span>
              <div className="flex flex-1 gap-px">
                {Array.from({ length: 24 }, (_, h) => {
                  const count = grid[`${d}-${h}`] ?? 0;
                  const intensity = count / maxCount;
                  const bg = intensity === 0 ? "bg-gray-100"
                    : intensity < 0.25 ? "bg-green-100"
                    : intensity < 0.5 ? "bg-green-300"
                    : intensity < 0.75 ? "bg-orange-400"
                    : "bg-red-500";
                  return (
                    <div
                      key={h}
                      title={`週${day} ${h}:00 — ${count} 筆`}
                      className={`flex-1 h-6 rounded-sm ${bg} cursor-help transition-transform hover:scale-110`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">需求量：</span>
        {[
          { color: "bg-gray-100", label: "無" },
          { color: "bg-green-100", label: "低" },
          { color: "bg-green-300", label: "中" },
          { color: "bg-orange-400", label: "高" },
          { color: "bg-red-500", label: "尖峰" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${l.color}`} />
            <span className="text-xs text-gray-500">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Peak insights */}
      <div className="flex gap-2 flex-wrap">
        {peakHours.map((ph, i) => (
          <div key={ph.hour} className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-full px-3 py-1">
            <Zap className="w-3 h-3 text-orange-500" />
            <span className="text-xs text-orange-700 font-medium">
              #{i + 1} 尖峰：{ph.hour}:00–{ph.hour + 1}:00（共 {ph.total} 筆）
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BackhaulAnalyticsTab() {
  const [stats, setStats] = useState<BackhaulStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/commission-tiers/backhaul-stats`)
      .then(r => r.json()).then(setStats).catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const emptyPct = stats?.estimated_empty_return_pct ?? 62;
  const backfillPct = 100 - emptyPct;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-700 to-teal-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="w-8 h-8 text-emerald-300 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-black">空車撮合 ROI 分析</h2>
              <p className="text-emerald-200 text-sm mt-1">
                分析司機回程空車率，自動媒合散單填滿空程，將空車利潤從 0 提升至 40%+
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">
                  📅 {stats?.period ?? "近30天"}
                </span>
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">
                  🚛 {stats?.active_drivers ?? 0} 名活躍司機
                </span>
                <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded-full border border-white/20">
                  📦 {stats?.completed_trips ?? 0} 趟已完成
                </span>
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 flex-shrink-0"
            onClick={load}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            重整
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-gray-400 text-sm">分析中...</p>
      ) : !stats ? (
        <p className="text-center py-8 text-gray-400 text-sm">無法取得數據</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="空車回程率（估計）"
              value={`${emptyPct}%`}
              sub="每 100 趟約有 62 趟空車回程"
              icon={AlertTriangle} color="text-red-600"
            />
            <StatCard
              label="回頭車撮合機會"
              value={`${stats.estimated_backhaul_opportunities} 趟`}
              sub="本月可撮合回程訂單"
              icon={ArrowLeftRight} color="text-blue-600"
            />
            <StatCard
              label="潛在額外營收"
              value={`NT$ ${Math.round(stats.potential_extra_revenue / 1000)}K+`}
              sub="若 40% 回程訂單被填滿"
              icon={DollarSign} color="text-green-600"
              highlight
            />
            <StatCard
              label="平均訂單金額"
              value={`NT$ ${Math.round(stats.avg_order_fee).toLocaleString()}`}
              sub="近30天已完成訂單"
              icon={TrendingUp} color="text-purple-600"
            />
          </div>

          {/* Utilization bar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                車輛使用效率視覺化
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>有貨回程（撮合成功）</span>
                  <span className="font-semibold text-green-600">{backfillPct}%</span>
                </div>
                <div className="h-8 w-full bg-red-100 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center pl-3 transition-all"
                    style={{ width: `${backfillPct}%` }}
                  >
                    <span className="text-xs text-white font-bold whitespace-nowrap">
                      有貨回程 {backfillPct}%
                    </span>
                  </div>
                  {backfillPct < 90 && (
                    <div className="absolute right-0 top-0 h-full flex items-center pr-2">
                      <span className="text-xs text-red-600 font-medium">
                        空車浪費 {emptyPct}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">提升空車撮合率的預期效益</p>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {[
                      { target: "40%", revenue: Math.round(stats.potential_extra_revenue * 0.4 / 1000) },
                      { target: "60%", revenue: Math.round(stats.potential_extra_revenue * 0.6 / 1000) },
                      { target: "80%", revenue: Math.round(stats.potential_extra_revenue * 0.8 / 1000) },
                    ].map(s => (
                      <div key={s.target} className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                        <p className="text-lg font-black text-emerald-700">NT$ {s.revenue}K</p>
                        <p className="text-[10px] text-gray-400">填滿率 {s.target}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Routes */}
          {stats.top_routes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  高頻路線 TOP 10（最佳撮合目標）
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-50">
                  {stats.top_routes.slice(0, 10).map((r, i) => (
                    <div key={i} className="px-5 py-3 flex items-center gap-4">
                      <span className={`w-6 text-sm font-black flex-shrink-0
                        ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-gray-300"}`}>
                        #{i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          <span className="text-blue-600">{r.pickup}</span>
                          <span className="text-gray-400 mx-1.5">→</span>
                          <span className="text-green-600">{r.delivery}</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant="outline" className="text-xs">{r.trips} 趟</Badge>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          NT$ {r.revenue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Demand Heatmap */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                週間需求熱力圖（近90天）
                <Badge variant="outline" className="text-[10px] ml-auto">預測性派車依據</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DemandHeatmap data={stats.weekly_demand} />
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                <Zap className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  根據熱力圖可提前預約高需求時段的司機（尖峰期前1-2天推播通知），
                  確保爆單時車源充足，避免接不到單損失訂單。
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
