import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  Target, TrendingUp, TrendingDown, Zap,
  ArrowLeftRight, DollarSign, RefreshCw, ChevronRight,
  CheckCircle2, AlertTriangle, XCircle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type KpiMetric = {
  label: string;
  current: number;
  target: number;
  unit: string;
  direction: "up" | "down";
  description: string;
  action: string;
  trend: { label: string; value: number; [k: string]: unknown }[];
  [k: string]: unknown;
};

type StrategicData = {
  as_of: string;
  kpis: {
    automation_rate: KpiMetric;
    empty_return_rate: KpiMetric;
    collection_cycle: KpiMetric;
  };
};

function getStatus(current: number, target: number, direction: "up" | "down") {
  const ratio = direction === "up" ? current / target : target / current;
  if (ratio >= 0.95) return "achieved";
  if (ratio >= 0.70) return "progress";
  return "critical";
}

const STATUS_CONFIG = {
  achieved: {
    icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    label: "達標",
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    bar: "bg-green-500",
    badge: "bg-green-100 text-green-700 border-green-200",
  },
  progress: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    label: "努力中",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  critical: {
    icon: <XCircle className="w-5 h-5 text-red-500" />,
    label: "需關注",
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-500",
    badge: "bg-red-100 text-red-700 border-red-200",
  },
};

const KPI_META = {
  automation_rate: {
    icon: <Zap className="w-6 h-6" />,
    gradient: "from-blue-600 to-indigo-700",
    chartColor: "#6366f1",
    chartArea: "#e0e7ff",
  },
  empty_return_rate: {
    icon: <ArrowLeftRight className="w-6 h-6" />,
    gradient: "from-emerald-600 to-teal-700",
    chartColor: "#10b981",
    chartArea: "#d1fae5",
  },
  collection_cycle: {
    icon: <DollarSign className="w-6 h-6" />,
    gradient: "from-violet-600 to-purple-700",
    chartColor: "#8b5cf6",
    chartArea: "#ede9fe",
  },
};

function ProgressGauge({
  current, target, direction, unit, status,
}: {
  current: number; target: number; direction: "up" | "down";
  unit: string; status: "achieved" | "progress" | "critical";
}) {
  const pct = direction === "up"
    ? Math.min(100, (current / target) * 100)
    : Math.min(100, (target / current) * 100);

  const gap = direction === "up"
    ? target - current
    : current - target;

  const cfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <span className={`text-4xl font-black ${cfg.color}`}>{current}</span>
          <span className={`text-lg font-semibold ml-1 ${cfg.color}`}>{unit}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400">目標</span>
          <div className="flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-base font-bold text-gray-600">{target}{unit}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${cfg.bar}`}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-400"
            style={{ left: "100%" }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>0</span>
          <span className={cfg.color}>進度 {pct.toFixed(0)}%</span>
          <span>目標 {target}{unit}</span>
        </div>
      </div>

      {gap > 0 && status !== "achieved" && (
        <div className={`${cfg.bg} border ${cfg.border} rounded-lg px-3 py-2 flex items-center gap-2`}>
          {direction === "up" ? (
            <TrendingUp className={`w-3.5 h-3.5 ${cfg.color} flex-shrink-0`} />
          ) : (
            <TrendingDown className={`w-3.5 h-3.5 ${cfg.color} flex-shrink-0`} />
          )}
          <span className={`text-xs font-medium ${cfg.color}`}>
            還需{direction === "up" ? "提升" : "降低"} <strong>{Math.abs(gap).toFixed(1)}{unit}</strong> 才達目標
          </span>
        </div>
      )}
    </div>
  );
}

function TrendChart({
  data, target, direction, color, areaColor, unit,
}: {
  data: { label: string; value: number }[];
  target: number; direction: "up" | "down";
  color: string; areaColor: string; unit: string;
}) {
  const max = Math.max(...data.map(d => d.value), target) * 1.15;
  const min = Math.max(0, Math.min(...data.map(d => d.value), target) * 0.85);

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={areaColor} stopOpacity={0.8} />
            <stop offset="95%" stopColor={areaColor} stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
        <YAxis domain={[min, max]} hide />
        <Tooltip
          formatter={(v: number) => [`${v}${unit}`, "實際"]}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <ReferenceLine
          y={target}
          stroke="#ef4444"
          strokeDasharray="4 2"
          strokeWidth={1.5}
          label={{ value: `目標 ${target}${unit}`, position: "insideTopRight", fontSize: 9, fill: "#ef4444" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${color.replace("#", "")})`}
          dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function KpiCard({
  metaKey, kpi,
}: { metaKey: "automation_rate" | "empty_return_rate" | "collection_cycle"; kpi: KpiMetric }) {
  const meta = KPI_META[metaKey];
  const status = getStatus(kpi.current, kpi.target, kpi.direction);
  const cfg = STATUS_CONFIG[status];

  return (
    <Card className={`border-2 ${cfg.border} overflow-hidden`}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${meta.gradient} p-5 text-white`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {meta.icon}
            <div>
              <h3 className="font-black text-lg leading-tight">{kpi.label}</h3>
              <p className="text-white/70 text-xs mt-0.5">{kpi.description}</p>
            </div>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
            ${cfg.badge}`}>
            {cfg.icon}
            {cfg.label}
          </span>
        </div>
      </div>

      <CardContent className="p-5 space-y-5">
        {/* Gauge */}
        <ProgressGauge
          current={kpi.current}
          target={kpi.target}
          direction={kpi.direction}
          unit={kpi.unit}
          status={status}
        />

        {/* Trend chart */}
        {kpi.trend.length > 1 && (
          <div>
            <p className="text-xs text-gray-500 mb-2 font-medium">週趨勢（紅虛線 = 目標）</p>
            <TrendChart
              data={kpi.trend}
              target={kpi.target}
              direction={kpi.direction}
              color={meta.chartColor}
              areaColor={meta.chartArea}
              unit={kpi.unit}
            />
          </div>
        )}

        {/* Action */}
        <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2.5">
          <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-600">改善行動</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.action}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverallProgressBar({ kpis }: { kpis: StrategicData["kpis"] }) {
  const items = [
    { key: "automation_rate" as const, kpi: kpis.automation_rate },
    { key: "empty_return_rate" as const, kpi: kpis.empty_return_rate },
    { key: "collection_cycle" as const, kpi: kpis.collection_cycle },
  ];

  const scores = items.map(({ kpi }) => {
    const s = getStatus(kpi.current, kpi.target, kpi.direction);
    return s === "achieved" ? 2 : s === "progress" ? 1 : 0;
  });
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const maxScore = items.length * 2;
  const overallPct = Math.round((totalScore / maxScore) * 100);

  const achievedCount = scores.filter(s => s === 2).length;
  const progressCount = scores.filter(s => s === 1).length;

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Target className="w-8 h-8 text-yellow-400 flex-shrink-0" />
          <div>
            <h2 className="text-xl font-black">戰略 KPI 追蹤儀表板</h2>
            <p className="text-slate-400 text-sm mt-0.5">
              富詠運輸 Phase 1 核心指標 — 三項目標進度追蹤
            </p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="text-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
            <p className="text-2xl font-black text-green-400">{achievedCount}</p>
            <p className="text-xs text-slate-400">已達標</p>
          </div>
          <div className="text-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
            <p className="text-2xl font-black text-amber-400">{progressCount}</p>
            <p className="text-xs text-slate-400">努力中</p>
          </div>
          <div className="text-center bg-white/10 rounded-xl px-4 py-2 border border-white/10">
            <p className="text-2xl font-black text-blue-300">{items.length - achievedCount - progressCount}</p>
            <p className="text-xs text-slate-400">需關注</p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>整體目標達成進度</span>
          <span className="font-bold text-white">{overallPct}%</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${overallPct}%`,
              background: overallPct >= 80 ? "#22c55e" : overallPct >= 50 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {items.map(({ kpi }, i) => (
          <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/10">
            <p className="text-xs text-slate-400 truncate">{kpi.label}</p>
            <p className="text-base font-black text-white mt-0.5">
              {kpi.current}{kpi.unit}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">目標 {kpi.target}{kpi.unit}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 bg-blue-500/10 border border-blue-400/20 rounded-xl p-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200">
          數據每次重整時更新。自動化率以近30天已派車訂單計算；空車回程率為估算值（基於歷史路線分析）；回款週期以實際入帳紀錄為準。
        </p>
      </div>
    </div>
  );
}

export default function StrategicKPITab() {
  const [data, setData] = useState<StrategicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/kpi/strategic`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLastUpdated(new Date().toLocaleTimeString("zh-TW"));
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      {data && <OverallProgressBar kpis={data.kpis} />}

      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {lastUpdated ? `最後更新：${lastUpdated}` : ""}
        </p>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          重整數據
        </Button>
      </div>

      {loading && !data ? (
        <p className="text-center py-12 text-gray-400">分析中...</p>
      ) : !data ? (
        <p className="text-center py-12 text-gray-400">無法載入數據</p>
      ) : (
        <>
          {/* 3 KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <KpiCard metaKey="automation_rate" kpi={data.kpis.automation_rate} />
            <KpiCard metaKey="empty_return_rate" kpi={data.kpis.empty_return_rate} />
            <KpiCard metaKey="collection_cycle" kpi={data.kpis.collection_cycle} />
          </div>

          {/* Deep dive: Automation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-500" />
                自動化率 — 詳細分析
                <Badge variant="outline" className="ml-auto text-[10px]">目標 80%</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "今日自動派車",
                    value: String(data.kpis.automation_rate.today_auto ?? 0),
                    sub: `共派 ${data.kpis.automation_rate.today_assigned ?? 0} 單`,
                    color: "text-indigo-600",
                  },
                  {
                    label: "本月自動派車",
                    value: String(data.kpis.automation_rate.month_auto ?? 0),
                    sub: `共派 ${data.kpis.automation_rate.month_assigned ?? 0} 單`,
                    color: "text-blue-600",
                  },
                  {
                    label: "本月自動化率",
                    value: `${data.kpis.automation_rate.current}%`,
                    sub: "AI 智慧派車佔比",
                    color: data.kpis.automation_rate.current >= 80 ? "text-green-600" : "text-amber-600",
                  },
                  {
                    label: "距目標差距",
                    value: `${Math.max(0, 80 - data.kpis.automation_rate.current).toFixed(1)}%`,
                    sub: "需提升的比例",
                    color: "text-gray-600",
                  },
                ].map(stat => (
                  <div key={stat.label} className="bg-gray-50 rounded-xl p-4">
                    <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{stat.sub}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Deep dive: Collection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-violet-500" />
                回款週期 — 加速路徑
                <Badge variant="outline" className="ml-auto text-[10px]">目標 30 天</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    phase: "當前狀態",
                    days: data.kpis.collection_cycle.current,
                    action: "紙本簽單 → 人工對帳 → 月底寄發票",
                    color: "border-red-200 bg-red-50 text-red-700",
                  },
                  {
                    phase: "短期目標 (3個月)",
                    days: 45,
                    action: "電子簽單 → OCR 自動對帳 → 即時開立",
                    color: "border-amber-200 bg-amber-50 text-amber-700",
                  },
                  {
                    phase: "終極目標",
                    days: 30,
                    action: "貨到確認即開帳 → 電子簽單作債權憑證 → 快速提現",
                    color: "border-green-200 bg-green-50 text-green-700",
                  },
                ].map((row, i) => (
                  <div key={i} className={`border rounded-xl p-4 ${row.color}`}>
                    <p className="text-xs font-bold mb-2">{row.phase}</p>
                    <p className="text-3xl font-black">{row.days} 天</p>
                    <p className="text-xs mt-2 leading-relaxed opacity-80">{row.action}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
