/**
 * DemandForecastTab — Demand analysis, fleet recommendation, dispatch suggestion
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Truck, Clock, MapPin, Zap, AlertTriangle, BarChart2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DispatchSuggestPanel } from "./DispatchSuggestPanel";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#84cc16","#f97316"];

function useForecast() {
  return useQuery<Record<string, unknown>>({
    queryKey: ["demand-forecast"],
    queryFn: () => fetch(`${API}/analytics/demand-forecast`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useFleetRec() {
  return useQuery<Record<string, unknown>>({
    queryKey: ["fleet-recommendation"],
    queryFn: () => fetch(`${API}/analytics/fleet-recommendation`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useExceptionStats() {
  return useQuery<Record<string, unknown>[]>({
    queryKey: ["exception-stats"],
    queryFn: () => fetch(`${API}/exception-stats`).then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

// ── Hourly chart ──────────────────────────────────────────────────────────
function HourlyChart({ data }: { data: { hour: number; order_count: number }[] }) {
  const filled = Array.from({ length: 24 }, (_, h) => {
    const found = data.find(d => d.hour === h);
    return { hour: `${h}:00`, count: found?.order_count ?? 0 };
  });
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={filled} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={3} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v) => [`${v} 筆`, "訂單"]} />
        <Bar dataKey="count" fill="#3b82f6" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Day of week chart ─────────────────────────────────────────────────────
function DowChart({ data }: { data: { dow: number; dow_zh: string; order_count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
        <XAxis dataKey="dow_zh" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v) => [`${v} 筆`, "訂單"]} />
        <Bar dataKey="order_count" fill="#10b981" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Monthly trend chart ───────────────────────────────────────────────────
function MonthlyChart({ data }: { data: { month: string; order_count: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tick={{ fontSize: 9 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
        <Tooltip
          formatter={(v, name) => name === "revenue" ? [`NT$${Number(v).toLocaleString()}`, "營收"] : [`${v}`, "訂單數"]}
        />
        <Legend formatter={name => name === "revenue" ? "營收" : "訂單數"} />
        <Line yAxisId="left" type="monotone" dataKey="order_count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="order_count" />
        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="revenue" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Exception pie ─────────────────────────────────────────────────────────
function ExceptionPie({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={140} height={140}>
        <PieChart>
          <Pie data={data} dataKey="count" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v, _n, p) => [`${v} 筆`, p.payload?.label]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1">
        {data.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="font-bold text-foreground">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Forecast tab ──────────────────────────────────────────────────────────
function ForecastSubTab() {
  const { data, isLoading } = useForecast();
  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入分析中...</div>;
  if (!data) return null;

  const insight = data.insight as Record<string, string>;
  const hourly  = (data.hourly  as { hour: number; order_count: number }[]) ?? [];
  const dow     = (data.dayOfWeek as { dow: number; dow_zh: string; order_count: number }[]) ?? [];
  const monthly = (data.monthly as { month: string; order_count: number; revenue: number }[]) ?? [];
  const routes  = (data.topRoutes as { route: string; order_count: number; revenue: number }[]) ?? [];

  return (
    <div className="space-y-4">
      {/* Insight cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">高峰時段</p>
            <p className="font-black text-foreground text-sm">{insight?.peak_hours_label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <BarChart2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">高峰星期</p>
            <p className="font-black text-foreground text-sm">{insight?.peak_days_label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <MapPin className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">最活躍路線</p>
            <p className="font-black text-foreground text-sm truncate">{insight?.busiest_route}</p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly pattern */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" /> 每日時段訂單分佈（近90天）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {hourly.length > 0 ? <HourlyChart data={hourly} /> : <p className="text-xs text-muted-foreground py-4 text-center">暫無資料</p>}
        </CardContent>
      </Card>

      {/* Day of week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-600" /> 星期訂單分佈（近90天）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {dow.length > 0 ? <DowChart data={dow} /> : <p className="text-xs text-muted-foreground py-4 text-center">暫無資料</p>}
        </CardContent>
      </Card>

      {/* Monthly trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-600" /> 月度趨勢（近12個月）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {monthly.length > 0 ? <MonthlyChart data={monthly} /> : <p className="text-xs text-muted-foreground py-4 text-center">暫無資料</p>}
        </CardContent>
      </Card>

      {/* Top routes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-600" /> 熱門路線（近30天）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {routes.length > 0 ? (
            <div className="space-y-2">
              {routes.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-black text-muted-foreground w-4">{i+1}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full"
                      style={{ width: `${Math.round(r.order_count / (routes[0]?.order_count || 1) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold w-20 truncate">{r.route}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{r.order_count}筆</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground py-4 text-center">暫無資料</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Fleet recommendation sub-tab ──────────────────────────────────────────
function FleetRecSubTab() {
  const { data, isLoading } = useFleetRec();
  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入建議中...</div>;
  if (!data) return null;

  const fleet   = (data.fleetCapacity   as Record<string, unknown>[]) ?? [];
  const gaps    = (data.coverageGaps    as Record<string, unknown>[]) ?? [];
  const recs    = (data.recommendations as string[]) ?? [];
  const outsource = data.outsourceRatio as number ?? 0;

  return (
    <div className="space-y-4">
      {/* Recommendations */}
      {recs.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800 flex items-center gap-2">
              <Info className="w-4 h-4" /> AI 車隊建議
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-1.5">
            {recs.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-blue-700">
                <span className="mt-0.5 text-blue-400">•</span>{r}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fleet capacity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" /> 車型產能分析（本月）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left py-1">車型</th>
                <th className="text-right py-1">司機數</th>
                <th className="text-right py-1">本月訂單</th>
                <th className="text-right py-1">週均趟/人</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((f: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 font-medium">{String(f.vehicle_type ?? "—")}</td>
                  <td className="py-1.5 text-right">{String(f.driver_count)}</td>
                  <td className="py-1.5 text-right">{String(f.month_orders)}</td>
                  <td className={`py-1.5 text-right font-bold ${Number(f.avg_weekly_trips_per_driver) > 15 ? "text-emerald-600" : Number(f.avg_weekly_trips_per_driver) < 3 ? "text-red-500" : "text-foreground"}`}>
                    {f.avg_weekly_trips_per_driver}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Outsource ratio */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-blue-200 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-blue-700">{outsource}%</span>
          </div>
          <div>
            <p className="font-bold text-foreground">本月外包率</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {outsource > 20 ? "外包率偏高，建議補充自有車隊" :
               outsource > 10 ? "外包比例適中" :
               "自有車隊充足"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Coverage gaps */}
      {gaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" /> 各區待派車狀況
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-1.5">
            {gaps.map((g: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground font-medium">{String(g.region)}</span>
                <div className="flex items-center gap-3 text-xs">
                  {Number(g.pending_now) > 0 && (
                    <span className="text-orange-600 font-bold">待派 {String(g.pending_now)} 筆</span>
                  )}
                  {Number(g.cancelled_no_driver) > 0 && (
                    <span className="text-red-500">無司機取消 {String(g.cancelled_no_driver)}</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Exception analysis sub-tab ────────────────────────────────────────────
function ExceptionSubTab() {
  const { data, isLoading } = useExceptionStats();
  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入中...</div>;
  const exData = data ?? [];
  const total = exData.reduce((s, r) => s + Number(r.count), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <AlertTriangle className="w-5 h-5 text-orange-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">異常總筆數</p>
            <p className="font-black text-2xl text-foreground">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Info className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">異常類型數</p>
            <p className="font-black text-2xl text-foreground">{exData.length}</p>
          </CardContent>
        </Card>
      </div>

      {exData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">異常類型分佈</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ExceptionPie data={exData.map(d => ({
              label: String(d.label ?? d.exception_code),
              count: Number(d.count),
            }))} />
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-left p-3">原因</th>
                <th className="text-center p-3">責任方</th>
                <th className="text-right p-3">筆數</th>
              </tr>
            </thead>
            <tbody>
              {exData.length === 0 && (
                <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">暫無異常記錄</td></tr>
              )}
              {exData.map((d: Record<string, unknown>, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 font-medium">{String(d.label ?? d.exception_code)}</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className="text-xs">
                      {d.exception_attribution === "customer" ? "客戶"
                       : d.exception_attribution === "driver" ? "司機"
                       : "公司"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-bold">{String(d.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dispatch suggestion sub-tab ───────────────────────────────────────────
function DispatchSubTab() {
  const [orderId, setOrderId] = useState<string>("");
  const [searched, setSearched] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" /> 輸入訂單號取得派車建議
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="訂單 ID..."
              className="flex-1 border rounded-xl px-3 py-2 text-sm bg-background"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && orderId) setSearched(true); }}
            />
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
              disabled={!orderId}
              onClick={() => setSearched(true)}
            >
              查詢
            </button>
          </div>
        </CardContent>
      </Card>

      {searched && orderId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" /> 訂單 #{orderId} 派車建議排名
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <DispatchSuggestPanel orderId={Number(orderId)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────
export function DemandForecastTab() {
  return (
    <div className="space-y-4 p-4 pb-16 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 font-black text-xl text-foreground">
        <TrendingUp className="w-5 h-5 text-violet-600" /> 預測分析
      </div>

      <Tabs defaultValue="forecast">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="forecast">需求預測</TabsTrigger>
          <TabsTrigger value="fleet">車隊建議</TabsTrigger>
          <TabsTrigger value="exception">異常分析</TabsTrigger>
          <TabsTrigger value="dispatch">派車引擎</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="forecast"><ForecastSubTab /></TabsContent>
          <TabsContent value="fleet"><FleetRecSubTab /></TabsContent>
          <TabsContent value="exception"><ExceptionSubTab /></TabsContent>
          <TabsContent value="dispatch"><DispatchSubTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
