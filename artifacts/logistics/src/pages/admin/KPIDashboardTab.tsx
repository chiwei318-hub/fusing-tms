import { useEffect, useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, Truck, Users, AlertTriangle, DollarSign,
  Clock, CheckCircle, Activity, RefreshCw, Star,
  Percent, Ban, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
interface KpiData {
  summary: {
    today_completed: number; today_total: number; today_completion_rate: number;
    week_completed: number;  week_total: number;
    week_ontime: number;     week_ontime_rate: number;
    overdue_count: number;   week_anomaly: number;
  };
  vehicleUtil: {
    drivers: { id: string; name: string; license_plate: string; vehicle_type: string;
               status: string; total_trips: number; today_trips: number;
               week_trips: number; avg_daily_trips: number }[];
    total: number; available: number; busy: number; offline: number; idle_rate: number;
  };
  profit: {
    month_revenue: number; month_cost: number; month_profit: number;
    month_margin: number;  per_km_profit: number;
    by_route: { route: string; trips: number; revenue: number; avg_fee: number; avg_km: number }[];
  };
  costBreakdown: {
    month_trips: number; month_revenue: number;
    fuel: number; toll: number; depreciation: number; commission: number; surcharge: number; total: number;
  };
  ar: {
    unpaid_count: number; unpaid_amount: number; current: number;
    d30_count: number; d30_amount: number;
    d60_count: number; d60_amount: number;
    d90_count: number; d90_amount: number;
    top_customers: { customer_name: string; customer_phone: string; unpaid_orders: number;
                     exposure: number; oldest_unpaid: string }[];
  };
  driverPerf: {
    id: string; name: string; license_plate: string; vehicle_type: string;
    completed: number; cancelled: number; ontime: number; ontime_rate: number;
    avg_rating: number; revenue: number;
  }[];
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("zh-TW");
const fmtMoney = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const pct = (n: number) => `${n}%`;

const CHART_COLORS = ["#1d4ed8", "#d97706", "#10b981", "#7c3aed", "#ef4444", "#06b6d4", "#f97316"];

function KpiCard({
  icon: Icon, label, value, sub, color = "blue", badge, badgeColor,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  color?: string; badge?: string; badgeColor?: "green" | "red" | "yellow" | "gray";
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-emerald-50 text-emerald-600 border-emerald-100",
    yellow: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    purple: "bg-violet-50 text-violet-600 border-violet-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
  };
  const badgeVariantMap: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-amber-100 text-amber-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <Card className={`border ${colorMap[color] ?? colorMap.blue}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`rounded-lg p-2 mt-0.5 ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold mt-0.5 leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          {badge && badgeColor && (
            <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${badgeVariantMap[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ icon: Icon, title, color = "text-gray-700" }: {
  icon: React.ElementType; title: string; color?: string;
}) {
  return (
    <div className={`flex items-center gap-2 font-semibold text-base mb-3 ${color}`}>
      <Icon className="w-4 h-4" />
      {title}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  available: "空車", busy: "配送中", offline: "離線",
};
const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700",
  busy: "bg-blue-100 text-blue-700",
  offline: "bg-gray-100 text-gray-500",
};

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────
export default function KPIDashboardTab() {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/kpi/dashboard"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        載入 KPI 資料中…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500">{error ?? "資料錯誤"}</p>
        <Button variant="outline" size="sm" onClick={load}>重試</Button>
      </div>
    );
  }

  const { summary, vehicleUtil, profit, costBreakdown, ar, driverPerf } = data;

  // ── Cost pie data ──
  const costPie = [
    { name: "油費",   value: costBreakdown.fuel },
    { name: "過路費", value: costBreakdown.toll },
    { name: "折舊",   value: costBreakdown.depreciation },
    { name: "佣金",   value: costBreakdown.commission },
    { name: "加班/等候費", value: costBreakdown.surcharge },
  ].filter(d => d.value > 0);

  // ── AR aging bar data ──
  const arBars = [
    { label: "0–30 天",  amount: ar.current,    count: ar.unpaid_count - ar.d30_count },
    { label: "30–60 天", amount: ar.d30_amount - ar.d60_amount, count: ar.d30_count - ar.d60_count },
    { label: "60–90 天", amount: ar.d60_amount - ar.d90_amount, count: ar.d60_count - ar.d90_count },
    { label: "90 天以上", amount: ar.d90_amount, count: ar.d90_count },
  ].map(d => ({ ...d, amount: Math.max(0, d.amount), count: Math.max(0, d.count) }));

  // ── Route profit bar ──
  const routeBars = profit.by_route.map(r => ({
    route: r.route,
    趟次: r.trips,
    平均費用: Math.round(Number(r.avg_fee)),
  }));

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">KPI 經營儀表板</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastUpdated ? `更新於 ${lastUpdated.toLocaleTimeString("zh-TW")}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          重新整理
        </Button>
      </div>

      {/* ── Section 1: 今日 / 本週 ─────────────────────────── */}
      <section>
        <SectionHeader icon={Activity} title="今日 / 本週 概覽" color="text-blue-700" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={CheckCircle} label="今日完成趟次"
            value={fmt(summary.today_completed)}
            sub={`共 ${summary.today_total} 趟`}
            color="green"
            badge={summary.today_total > 0 ? `完成率 ${summary.today_completion_rate}%` : undefined}
            badgeColor={summary.today_completion_rate >= 80 ? "green" : "yellow"}
          />
          <KpiCard
            icon={TrendingUp} label="本週完成趟次"
            value={fmt(summary.week_completed)}
            sub={`共 ${summary.week_total} 趟`}
            color="blue"
          />
          <KpiCard
            icon={Percent} label="本週準點率"
            value={pct(summary.week_ontime_rate)}
            sub={`${summary.week_ontime} / ${summary.week_completed} 趟`}
            color={summary.week_ontime_rate >= 90 ? "green" : summary.week_ontime_rate >= 75 ? "yellow" : "red"}
            badge={summary.week_ontime_rate >= 90 ? "優良" : summary.week_ontime_rate >= 75 ? "待改善" : "需關注"}
            badgeColor={summary.week_ontime_rate >= 90 ? "green" : summary.week_ontime_rate >= 75 ? "yellow" : "red"}
          />
          <KpiCard
            icon={Clock} label="逾時未送單"
            value={fmt(summary.overdue_count)}
            sub="超過預定取貨日"
            color={summary.overdue_count > 0 ? "red" : "green"}
            badge={summary.overdue_count > 0 ? "需立即處理" : "無逾時"}
            badgeColor={summary.overdue_count > 0 ? "red" : "green"}
          />
          <KpiCard
            icon={AlertTriangle} label="本週異常單"
            value={fmt(summary.week_anomaly)}
            sub="有附加費用備註"
            color={summary.week_anomaly > 0 ? "yellow" : "green"}
          />
          <KpiCard
            icon={DollarSign} label="本月毛利率"
            value={pct(profit.month_margin)}
            sub={`毛利 ${fmtMoney(profit.month_profit)}`}
            color={profit.month_margin >= 20 ? "green" : profit.month_margin >= 10 ? "yellow" : "red"}
            badge={profit.month_margin >= 20 ? "健康" : profit.month_margin >= 10 ? "偏低" : "虧損風險"}
            badgeColor={profit.month_margin >= 20 ? "green" : profit.month_margin >= 10 ? "yellow" : "red"}
          />
        </div>
      </section>

      {/* ── Section 2: 車輛利用率 ──────────────────────────── */}
      <section>
        <SectionHeader icon={Truck} title="車輛利用率" color="text-orange-700" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Status overview */}
          <div className="grid grid-cols-3 gap-3 content-start">
            <KpiCard icon={Truck} label="空車（可派）" value={vehicleUtil.available} color="green"
              badge={`${vehicleUtil.idle_rate}% 空車率`}
              badgeColor={vehicleUtil.idle_rate > 40 ? "red" : vehicleUtil.idle_rate > 20 ? "yellow" : "green"}
            />
            <KpiCard icon={Activity} label="配送中" value={vehicleUtil.busy} color="blue" />
            <KpiCard icon={Ban} label="離線" value={vehicleUtil.offline} color="gray" />
          </div>
          {/* Per-driver today/week trip bar */}
          <div className="lg:col-span-2">
            <p className="text-xs text-muted-foreground mb-2">司機本週趟次（Top 10）</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vehicleUtil.drivers.slice(0, 10).map(d => ({
                name: d.name.length > 4 ? d.name.slice(0, 4) : d.name,
                本週: d.week_trips,
                今日: d.today_trips,
              }))} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="本週" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="今日" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Driver detail table */}
        <div className="mt-4 rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["司機", "車牌", "車型", "狀態", "今日趟次", "本週趟次", "日均趟次", "累計趟次"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicleUtil.drivers.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 font-mono">{d.license_plate || "—"}</td>
                  <td className="px-3 py-2">{d.vehicle_type || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">{d.today_trips}</td>
                  <td className="px-3 py-2 text-center">{d.week_trips}</td>
                  <td className="px-3 py-2 text-center">{Number(d.avg_daily_trips).toFixed(1)}</td>
                  <td className="px-3 py-2 text-center font-semibold">{d.total_trips}</td>
                </tr>
              ))}
              {vehicleUtil.drivers.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">尚無司機資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 3: 毛利分析 ───────────────────────────── */}
      <section>
        <SectionHeader icon={TrendingUp} title="毛利分析（本月）" color="text-emerald-700" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={DollarSign} label="本月營收"   value={fmtMoney(profit.month_revenue)} color="blue" />
          <KpiCard icon={DollarSign} label="估算總成本" value={fmtMoney(profit.month_cost)}    color="orange" />
          <KpiCard icon={TrendingUp} label="毛利"       value={fmtMoney(profit.month_profit)}
            color={profit.month_profit >= 0 ? "green" : "red"}
            badge={`毛利率 ${profit.month_margin}%`}
            badgeColor={profit.month_margin >= 20 ? "green" : profit.month_margin >= 10 ? "yellow" : "red"}
          />
          <KpiCard icon={Activity} label="每公里毛利" value={`NT$ ${profit.per_km_profit}`} color="purple" />
        </div>

        {/* Route chart */}
        {routeBars.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground mb-2">各區域趟次 & 平均費用（本月）</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={routeBars} margin={{ top: 0, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="route" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number, name: string) =>
                  name === "平均費用" ? [`NT$ ${v.toLocaleString()}`, name] : [v, name]
                } />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left"  dataKey="趟次"   fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="平均費用" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </section>

      {/* ── Section 4: 成本結構 ────────────────────────────── */}
      <section>
        <SectionHeader icon={BarChart2} title="成本結構（本月估算）" color="text-violet-700" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie chart */}
          <div>
            {costPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={costPie} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {costPie.map((_e, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`NT$ ${v.toLocaleString()}`, ""]} />
                  <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                本月尚無成本資料
              </div>
            )}
          </div>

          {/* Cost detail table */}
          <div className="space-y-2">
            {[
              { label: "油費（估算）",      val: costBreakdown.fuel,        color: "bg-blue-500" },
              { label: "過路費（估算）",    val: costBreakdown.toll,        color: "bg-amber-500" },
              { label: "折舊（估算）",      val: costBreakdown.depreciation, color: "bg-emerald-500" },
              { label: "佣金 15%",         val: costBreakdown.commission,   color: "bg-violet-500" },
              { label: "加班/等候費（實際）", val: costBreakdown.surcharge, color: "bg-red-500" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${item.color}`} />
                <span className="text-sm flex-1">{item.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {fmtMoney(item.val)}
                </span>
                <div className="w-24 bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${item.color}`}
                    style={{ width: costBreakdown.total > 0
                      ? `${Math.round(item.val / costBreakdown.total * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span>估算總成本</span>
              <span>{fmtMoney(costBreakdown.total)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              * 油費/過路費/折舊為依趟次估算；加班費為實際附加費用
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 5: 應收帳款 ─────────────────────────────── */}
      <section>
        <SectionHeader icon={DollarSign} title="應收帳款" color="text-red-700" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={DollarSign} label="未結總金額" value={fmtMoney(ar.unpaid_amount)}
            sub={`${ar.unpaid_count} 張訂單`} color="orange"
            badge={ar.unpaid_count > 0 ? "未收款" : "全部結清"}
            badgeColor={ar.unpaid_count > 0 ? "yellow" : "green"}
          />
          <KpiCard icon={Clock} label="30 天以上逾期" value={fmtMoney(ar.d30_amount)}
            sub={`${ar.d30_count} 張`} color={ar.d30_count > 0 ? "red" : "green"}
            badge={ar.d30_count > 0 ? "需跟催" : "無"}
            badgeColor={ar.d30_count > 0 ? "red" : "green"}
          />
          <KpiCard icon={AlertTriangle} label="60 天以上逾期" value={fmtMoney(ar.d60_amount)}
            sub={`${ar.d60_count} 張`} color={ar.d60_count > 0 ? "red" : "green"}
          />
          <KpiCard icon={AlertTriangle} label="90 天以上逾期" value={fmtMoney(ar.d90_amount)}
            sub={`${ar.d90_count} 張`} color={ar.d90_count > 0 ? "red" : "green"}
            badge={ar.d90_count > 0 ? "壞帳風險" : "無"}
            badgeColor={ar.d90_count > 0 ? "red" : "green"}
          />
        </div>

        {/* AR aging bar */}
        {arBars.some(b => b.amount > 0) && (
          <>
            <p className="text-xs text-muted-foreground mb-2">帳齡分佈</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={arBars} margin={{ top: 0, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`NT$ ${v.toLocaleString()}`, "應收金額"]} />
                <Bar dataKey="amount" name="應收金額" radius={[4, 4, 0, 0]}>
                  {arBars.map((_, i) => (
                    <Cell key={i} fill={["#10b981", "#d97706", "#ef4444", "#7c3aed"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Top exposure customers */}
        {ar.top_customers.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">信用暴露前十客戶</p>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    {["客戶名稱", "電話", "未結單數", "未收金額", "最老帳齡"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ar.top_customers.map((c, i) => {
                    const days = c.oldest_unpaid
                      ? Math.floor((Date.now() - new Date(c.oldest_unpaid).getTime()) / 86400000) : 0;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                        <td className="px-3 py-2 font-medium">{c.customer_name}</td>
                        <td className="px-3 py-2 font-mono">{c.customer_phone}</td>
                        <td className="px-3 py-2 text-center">{c.unpaid_orders}</td>
                        <td className="px-3 py-2 font-semibold text-red-600">
                          {fmtMoney(Number(c.exposure))}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline"
                            className={days > 60 ? "border-red-300 text-red-600" : days > 30 ? "border-amber-300 text-amber-600" : "border-gray-300 text-gray-500"}>
                            {days} 天
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 6: 司機績效 ─────────────────────────────── */}
      <section>
        <SectionHeader icon={Users} title="司機績效（本月）" color="text-indigo-700" />
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["司機", "車牌", "完成趟", "取消趟", "準點率", "評分", "本月收入"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driverPerf.map((d, i) => (
                <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 font-mono">{d.license_plate || "—"}</td>
                  <td className="px-3 py-2 text-center font-semibold text-emerald-700">{d.completed}</td>
                  <td className="px-3 py-2 text-center text-red-500">{d.cancelled}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[40px]">
                        <div
                          className={`h-1.5 rounded-full ${d.ontime_rate >= 90 ? "bg-emerald-500" : d.ontime_rate >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${d.ontime_rate}%` }}
                        />
                      </div>
                      <span className={`font-medium tabular-nums ${d.ontime_rate >= 90 ? "text-emerald-600" : d.ontime_rate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                        {d.ontime_rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span className={`font-medium ${d.avg_rating >= 4 ? "text-emerald-600" : d.avg_rating >= 3 ? "text-amber-600" : "text-gray-400"}`}>
                        {d.avg_rating > 0 ? d.avg_rating.toFixed(1) : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold tabular-nums">
                    {d.revenue > 0 ? fmtMoney(d.revenue) : "—"}
                  </td>
                </tr>
              ))}
              {driverPerf.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    本月尚無績效資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
