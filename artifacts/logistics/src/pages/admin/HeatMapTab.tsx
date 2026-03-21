import { useMemo, useState } from "react";
import { Map, TrendingUp, Clock, DollarSign, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useOrdersData } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { isToday, isThisWeek, isThisMonth, getHours } from "date-fns";
import type { Order } from "@workspace/api-client-react";

const REGIONS = ["北部", "桃竹苗", "中部", "雲嘉南", "南部", "東部"];
const REGION_COLORS = ["#1a3a8f", "#3b5fc0", "#F97316", "#fb923c", "#dc2626", "#16a34a"];

// Region grid layout (row, col, span) for visual map
const REGION_GRID: Record<string, { r: number; c: number; label: string }> = {
  "北部": { r: 0, c: 2, label: "北部\n(台北/新北/基隆)" },
  "桃竹苗": { r: 1, c: 1, label: "桃竹苗\n(桃園/新竹/苗栗)" },
  "中部": { r: 2, c: 1, label: "中部\n(台中/彰化/南投)" },
  "雲嘉南": { r: 3, c: 1, label: "雲嘉南\n(雲林/嘉義/台南)" },
  "南部": { r: 4, c: 1, label: "南部\n(高雄/屏東)" },
  "東部": { r: 1, c: 3, label: "東部\n(宜蘭/花蓮/台東)" },
};

function extractRegion(addr: string): string {
  const regions: Record<string, string[]> = {
    "北部": ["台北", "臺北", "新北", "基隆", "淡水", "板橋", "中和", "永和", "新莊", "三重"],
    "桃竹苗": ["桃園", "新竹", "苗栗", "中壢"],
    "中部": ["台中", "臺中", "彰化", "南投", "豐原"],
    "雲嘉南": ["雲林", "嘉義", "台南", "臺南"],
    "南部": ["高雄", "屏東", "鳳山"],
    "東部": ["宜蘭", "花蓮", "台東", "臺東"],
  };
  for (const [region, keywords] of Object.entries(regions)) {
    if (keywords.some(k => addr.includes(k))) return region;
  }
  return "其他";
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color ?? "bg-primary/10"}`}>
        <Icon className={`w-5 h-5 ${color ? "text-white" : "text-primary"}`} />
      </div>
      <div>
        <div className="text-lg font-black">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-xs text-orange-600 font-semibold">{sub}</div>}
      </div>
    </Card>
  );
}

export default function HeatMapTab() {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const [range, setRange] = useState<"today" | "week" | "month">("week");

  const filtered = useMemo(() => {
    return (orders as Order[]).filter(o => {
      const d = new Date(o.createdAt);
      if (range === "today") return isToday(d);
      if (range === "week") return isThisWeek(d, { weekStartsOn: 1 });
      return isThisMonth(d);
    });
  }, [orders, range]);

  // Region heat data
  const regionData = useMemo(() => {
    const counts: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    for (const o of filtered) {
      const r = extractRegion(o.deliveryAddress ?? "");
      counts[r] = (counts[r] ?? 0) + 1;
      revenue[r] = (revenue[r] ?? 0) + (o.totalFee ?? 0);
    }
    const max = Math.max(...Object.values(counts), 1);
    return REGIONS.map((r, i) => ({
      name: r,
      count: counts[r] ?? 0,
      revenue: revenue[r] ?? 0,
      intensity: ((counts[r] ?? 0) / max),
      color: REGION_COLORS[i],
    }));
  }, [filtered]);

  // Hourly distribution
  const hourlyData = useMemo(() => {
    const counts = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}時`, count: 0 }));
    for (const o of filtered) {
      const h = getHours(new Date(o.createdAt));
      counts[h].count++;
    }
    return counts.filter((_, i) => i >= 6 && i <= 22);
  }, [filtered]);

  const peakHour = hourlyData.reduce((best, h) => h.count > best.count ? h : best, { hour: "—", count: 0 });
  const topRegion = [...regionData].sort((a, b) => b.count - a.count)[0];
  const totalRevenue = filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const avgFee = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;
  const availableDrivers = drivers.filter(d => d.status === "available").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2"><Map className="w-5 h-5" /> 地圖熱區分析</h2>
          <p className="text-sm text-muted-foreground">訂單密集區域、尖峰時段、司機引導</p>
        </div>
        <Select value={range} onValueChange={v => setRange(v as any)}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">今日</SelectItem>
            <SelectItem value="week">本週</SelectItem>
            <SelectItem value="month">本月</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} label="訂單量" value={`${filtered.length} 筆`} sub={topRegion?.count ? `熱區：${topRegion.name}` : undefined} />
        <StatCard icon={Clock} label="尖峰時段" value={peakHour.count > 0 ? peakHour.hour : "—"} sub={peakHour.count > 0 ? `${peakHour.count} 筆` : undefined} />
        <StatCard icon={DollarSign} label="平均單價" value={avgFee > 0 ? `NT$${avgFee.toLocaleString()}` : "—"} />
        <StatCard icon={Users} label="可用司機" value={`${availableDrivers} 位`} sub={`/ ${drivers.length} 位`} color="bg-orange-500" />
      </div>

      {/* Heat map grid */}
      <Card className="p-4">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Map className="w-4 h-4" /> 台灣區域訂單熱區</h3>
        <div className="grid grid-cols-4 gap-2" style={{ gridTemplateRows: "repeat(5, 80px)" }}>
          {regionData.map((r, i) => {
            const pos = REGION_GRID[r.name];
            if (!pos) return null;
            const alpha = 0.15 + r.intensity * 0.85;
            const bg = r.count === 0
              ? "bg-muted/30 border-muted"
              : r.intensity > 0.7 ? "border-orange-300" : r.intensity > 0.3 ? "border-blue-200" : "border-blue-100";
            return (
              <div
                key={r.name}
                className={`rounded-xl border-2 ${bg} p-2 flex flex-col items-center justify-center text-center transition-all`}
                style={{
                  gridRow: pos.r + 1,
                  gridColumn: pos.c + 1,
                  backgroundColor: r.count > 0 ? `${r.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : undefined,
                }}
              >
                <div className="text-xs font-bold text-foreground leading-tight">
                  {r.name}
                </div>
                <div className={`text-lg font-black mt-1 ${r.count > 0 ? "text-white" : "text-muted-foreground"}`}>
                  {r.count}
                </div>
                <div className={`text-xs ${r.count > 0 ? "text-white/80" : "text-muted-foreground"}`}>筆</div>
                {r.intensity > 0.6 && (
                  <Badge className="mt-1 bg-orange-500 text-white text-xs px-1 py-0">🔥 熱區</Badge>
                )}
              </div>
            );
          })}
          {/* Legend label */}
          <div className="rounded-xl border-2 border-dashed border-muted/50 flex items-center justify-center text-xs text-muted-foreground" style={{ gridRow: 1, gridColumn: 1 }}>
            台灣<br />地圖
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/80 inline-block" /> 高需求</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600/50 inline-block" /> 中需求</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400/20 border inline-block" /> 低需求</span>
        </div>
      </Card>

      {/* Hourly distribution chart */}
      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> 訂單時段分佈</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" name="訂單數" radius={[4, 4, 0, 0]}>
              {hourlyData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.count === peakHour.count && entry.count > 0 ? "#F97316" : "#1a3a8f"}
                  opacity={0.7 + (entry.count / (peakHour.count || 1)) * 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {peakHour.count > 0 && (
          <p className="text-xs text-orange-600 font-semibold mt-2">
            🔥 尖峰時段：{peakHour.hour}（{peakHour.count} 筆）— 建議備妥充足車輛
          </p>
        )}
      </Card>

      {/* Regional revenue chart */}
      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" /> 各區域營收</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={regionData} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
            <Bar dataKey="revenue" name="營收" radius={[0, 4, 4, 0]} fill="#1a3a8f" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Driver guidance */}
      <Card className="p-4 bg-orange-50 border-orange-200">
        <h3 className="font-bold text-orange-800 mb-3">📍 司機引導建議</h3>
        <div className="space-y-2">
          {regionData.filter(r => r.intensity > 0).sort((a, b) => b.intensity - a.intensity).slice(0, 3).map((r, i) => (
            <div key={r.name} className="flex items-center gap-3 bg-white rounded-lg p-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-sm ${i === 0 ? "bg-orange-500" : i === 1 ? "bg-primary" : "bg-slate-500"}`}>
                {i + 1}
              </div>
              <div className="flex-1">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{r.count} 筆訂單 · NT${r.revenue.toLocaleString()} 總收益</span>
              </div>
              <Badge className={i === 0 ? "bg-orange-500 text-white" : "bg-primary text-white"}>
                {i === 0 ? "最推薦" : i === 1 ? "次推薦" : "可前往"}
              </Badge>
            </div>
          ))}
          {regionData.every(r => r.count === 0) && (
            <p className="text-muted-foreground text-sm">此期間尚無訂單資料</p>
          )}
        </div>
      </Card>
    </div>
  );
}
