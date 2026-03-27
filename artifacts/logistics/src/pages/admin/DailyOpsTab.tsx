import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getApiUrl } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Types ────────────────────────────────────────────────────────────────
interface DailyMetrics {
  date: string;
  zoneId: number | null;
  orders: {
    total: number; completed: number; pending: number; active: number;
    cancelled: number; exception_count: number; revenue: string;
    avg_order_value: string; reassignment_count: number; completion_rate: number | null;
  };
  drivers: {
    total_drivers: number; available: number; busy: number; offline: number;
    empty_car_pct: string; vehicle_utilization_pct: number;
  };
  onTime: { on_time: number; delayed: number; total: number; on_time_pct: number | null };
  exceptions: { exception_code: string; exception_attribution: string; count: number }[];
}

interface WeeklySummary {
  range: { from: string; to: string };
  trend: { period: string; total_orders: number; completed: number; exceptions: number; revenue: string; delayed: number }[];
  perCustomer: { customer: string; total_orders: number; completed: number; revenue: string; completion_rate: string }[];
  perRoute: { route: string; total_orders: number; completed: number; revenue: string; avg_fee: string }[];
  outsource: { total_orders: number; outsourced_count: number; outsource_pct: number };
  arOverdue: { customer: string; credit_days: number; overdue_amount: string; total_revenue: string }[];
}

interface VehicleUtil {
  fleet: { total_vehicles: number; with_trips_today: number; empty_now: number; busy_now: number; utilization_pct: number; empty_car_pct: number };
  vehicles: { id: number; name: string; license_plate: string; vehicle_type: string; status: string; trips_today: number; revenue_today: string; active_orders_now: number }[];
}

interface DriverRanking {
  range: { from: string; to: string };
  drivers: { id: number; name: string; license_plate: string; vehicle_type: string; status: string; total_orders: number; completed: number; revenue: string; avg_rating: string; on_time_pct: string; composite_score: number }[];
}

interface ARaging {
  customers: { id: number; customer: string; short_name: string; credit_days: number; overdue_amount: string; current_30d: string; overdue_30_60d: string; overdue_60_90d: string; overdue_90d_plus: string; total_outstanding: string }[];
  totals: { current_30d: number; overdue_30_60d: number; overdue_60_90d: number; overdue_90d_plus: number; total_outstanding: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n: string | number) { return Number(n).toLocaleString(); }
function fmtMoney(n: string | number) { return `$${Number(n).toLocaleString()}`; }

function PctBar({ pct, color = "bg-blue-500" }: { pct: number; color?: string }) {
  return (
    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? ""}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const TABS = [
  { id: "daily",   label: "每日即時" },
  { id: "weekly",  label: "週期彙總" },
  { id: "vehicle", label: "車輛利用率" },
  { id: "driver",  label: "司機排行" },
  { id: "ar",      label: "應收帳款" },
] as const;
type Tab = typeof TABS[number]["id"];

export function DailyOpsTab() {
  const [tab, setTab] = useState<Tab>("daily");

  // Date / filter state
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [fromDate, setFromDate] = useState(thirtyAgo);
  const [toDate, setToDate] = useState(todayStr);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  const [daily, setDaily] = useState<DailyMetrics | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [vehicle, setVehicle] = useState<VehicleUtil | null>(null);
  const [drivers, setDrivers] = useState<DriverRanking | null>(null);
  const [ar, setAr] = useState<ARaging | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDaily = useCallback(async () => {
    const res = await fetch(getApiUrl(`/api/ops/daily?date=${date}`));
    const data = await res.json() as DailyMetrics;
    setDaily(data);
  }, [date]);

  const fetchWeekly = useCallback(async () => {
    const res = await fetch(getApiUrl(`/api/ops/weekly-summary?from=${fromDate}&to=${toDate}&group_by=${groupBy}`));
    const data = await res.json() as WeeklySummary;
    setWeekly(data);
  }, [fromDate, toDate, groupBy]);

  const fetchVehicle = useCallback(async () => {
    const res = await fetch(getApiUrl(`/api/ops/vehicle-utilization?date=${date}`));
    const data = await res.json() as VehicleUtil;
    setVehicle(data);
  }, [date]);

  const fetchDrivers = useCallback(async () => {
    const res = await fetch(getApiUrl(`/api/ops/driver-ranking?from=${fromDate}&to=${toDate}`));
    const data = await res.json() as DriverRanking;
    setDrivers(data);
  }, [fromDate, toDate]);

  const fetchAr = useCallback(async () => {
    const res = await fetch(getApiUrl("/api/ops/ar-aging"));
    const data = await res.json() as ARaging;
    setAr(data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "daily") await fetchDaily();
      else if (tab === "weekly") await fetchWeekly();
      else if (tab === "vehicle") await fetchVehicle();
      else if (tab === "driver") await fetchDrivers();
      else if (tab === "ar") await fetchAr();
    } catch { /* ignore */ }
    setLoading(false);
  }, [tab, fetchDaily, fetchWeekly, fetchVehicle, fetchDrivers, fetchAr]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">運營 KPI 儀表板</h2>
          <p className="text-sm text-gray-500">每日即時數據、週期彙總、車輛利用率、司機排行與應收帳款追蹤</p>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={refresh}>
          {loading ? "更新中…" : "🔄 重整"}
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1.5 flex-wrap border-b pb-2">
        {TABS.map(t => (
          <button key={t.id}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── DAILY ───────────────────────────────────────────────────────── */}
      {tab === "daily" && (
        <div className="space-y-4">
          {/* Date picker */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">查詢日期</label>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={date}
              onChange={e => setDate(e.target.value)} max={todayStr} />
          </div>

          {daily ? (
            <>
              {/* Order metrics */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 mb-2">📦 訂單狀況</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="完成趟次" value={daily.orders.completed} sub={`共 ${daily.orders.total} 筆訂單`} color="text-green-600" />
                  <MetricCard label="完成率" value={daily.orders.completion_rate != null ? `${daily.orders.completion_rate}%` : "—"} color="text-blue-600" />
                  <MetricCard label="今日營收" value={fmtMoney(daily.orders.revenue)} color="text-purple-600" />
                  <MetricCard label="異常筆數" value={daily.orders.exception_count}
                    sub={`改派 ${daily.orders.reassignment_count} 次`} color={daily.orders.exception_count > 0 ? "text-red-600" : ""} />
                </div>
              </div>

              {/* Driver / fleet metrics */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 mb-2">🚗 車輛狀況</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard label="車輛利用率" value={`${daily.drivers.vehicle_utilization_pct}%`}
                    color={daily.drivers.vehicle_utilization_pct >= 70 ? "text-green-600" : "text-orange-500"} />
                  <MetricCard label="空車率" value={`${daily.drivers.empty_car_pct}%`}
                    color={Number(daily.drivers.empty_car_pct) > 40 ? "text-red-500" : "text-gray-700 dark:text-gray-300"} />
                  <MetricCard label="司機忙碌" value={daily.drivers.busy} sub={`${daily.drivers.available} 可接單`} />
                  <MetricCard label="下線司機" value={daily.drivers.offline} />
                </div>

                {/* Utilization bar */}
                <div className="mt-3 p-3 border rounded-xl bg-white dark:bg-gray-900 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>車輛利用率 {daily.drivers.vehicle_utilization_pct}%</span>
                    <span>空車率 {daily.drivers.empty_car_pct}%</span>
                  </div>
                  <PctBar pct={daily.drivers.vehicle_utilization_pct} color="bg-blue-500" />
                </div>
              </div>

              {/* On-time */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 mb-2">⏱ 準點率</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MetricCard label="準時完成" value={daily.onTime.on_time_pct != null ? `${daily.onTime.on_time_pct}%` : "—"}
                    sub={`${daily.onTime.on_time} / ${daily.onTime.total} 筆`}
                    color={daily.onTime.on_time_pct != null && daily.onTime.on_time_pct >= 90 ? "text-green-600" : "text-orange-500"} />
                  <MetricCard label="逾時" value={daily.onTime.delayed} color={daily.onTime.delayed > 0 ? "text-red-500" : ""} />
                  <MetricCard label="等待中" value={daily.orders.pending} color="text-orange-500" />
                </div>
              </div>

              {/* Exception breakdown */}
              {daily.exceptions.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 mb-2">⚠ 異常分佈（今日）</h3>
                  <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                    <div className="grid grid-cols-3 text-xs font-medium text-gray-500 border-b px-4 py-2">
                      <span>原因碼</span><span>責任</span><span className="text-right">件數</span>
                    </div>
                    {daily.exceptions.map((ex, i) => (
                      <div key={i} className="grid grid-cols-3 px-4 py-2 border-b last:border-0 text-sm">
                        <span className="font-mono">{ex.exception_code}</span>
                        <Badge variant={
                          ex.exception_attribution === "customer" ? "secondary" :
                          ex.exception_attribution === "driver" ? "destructive" : "outline"
                        } className="w-fit text-xs">
                          {ex.exception_attribution === "customer" ? "客戶" :
                           ex.exception_attribution === "driver"   ? "司機" : "公司"}
                        </Badge>
                        <span className="text-right font-semibold">{ex.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          )}
        </div>
      )}

      {/* ── WEEKLY ──────────────────────────────────────────────────────── */}
      {tab === "weekly" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">起始日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={fromDate}
                onChange={e => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">結束日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={toDate}
                onChange={e => setToDate(e.target.value)} max={todayStr} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">分組</label>
              <Select value={groupBy} onValueChange={v => setGroupBy(v as typeof groupBy)}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">每日</SelectItem>
                  <SelectItem value="week">每週</SelectItem>
                  <SelectItem value="month">每月</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {weekly ? (
            <>
              {/* Trend chart */}
              {weekly.trend.length > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">訂單趨勢</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={weekly.trend.map(t => ({
                      period: t.period.slice(0, 10),
                      完成: t.completed,
                      異常: t.exceptions,
                      逾時: t.delayed,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="完成" fill="#10b981" />
                      <Bar dataKey="異常" fill="#ef4444" />
                      <Bar dataKey="逾時" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Revenue trend */}
              {weekly.trend.length > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">營收趨勢</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weekly.trend.map(t => ({
                      period: t.period.slice(0, 10),
                      營收: Math.round(Number(t.revenue)),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [`$${Number(v).toLocaleString()}`, "營收"]} />
                      <Line type="monotone" dataKey="營收" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Outsource + AR summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900 space-y-2">
                  <h3 className="text-sm font-semibold">外包比率</h3>
                  <div className="text-3xl font-bold text-orange-500">{weekly.outsource.outsource_pct}%</div>
                  <div className="text-xs text-gray-500">{fmt(weekly.outsource.outsourced_count)} / {fmt(weekly.outsource.total_orders)} 張</div>
                  <PctBar pct={weekly.outsource.outsource_pct} color={weekly.outsource.outsource_pct > 30 ? "bg-red-400" : "bg-orange-400"} />
                </div>
                {weekly.arOverdue.length > 0 && (
                  <div className="border rounded-xl p-4 bg-white dark:bg-gray-900 space-y-2">
                    <h3 className="text-sm font-semibold">逾期應收最高</h3>
                    {weekly.arOverdue.slice(0, 3).map((a, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600 truncate max-w-32">{a.customer}</span>
                        <span className={`font-semibold ${Number(a.overdue_amount) > 0 ? "text-red-600" : "text-gray-400"}`}>
                          {fmtMoney(a.overdue_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-customer */}
              {weekly.perCustomer.length > 0 && (
                <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <h3 className="text-sm font-semibold">客戶績效 Top {weekly.perCustomer.length}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-gray-500 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left">客戶</th>
                          <th className="px-4 py-2 text-right">訂單數</th>
                          <th className="px-4 py-2 text-right">完成率</th>
                          <th className="px-4 py-2 text-right">營收</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {weekly.perCustomer.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-2 font-medium max-w-32 truncate">{c.customer}</td>
                            <td className="px-4 py-2 text-right">{c.total_orders}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={Number(c.completion_rate) < 80 ? "text-red-500" : "text-green-600"}>
                                {c.completion_rate}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-purple-600">{fmtMoney(c.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per-route */}
              {weekly.perRoute.length > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">路線績效</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weekly.perRoute.slice(0, 10).map(r => ({
                      route: r.route,
                      訂單數: r.total_orders,
                      營收: Math.round(Number(r.revenue) / 1000),
                    }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="route" tick={{ fontSize: 11 }} width={70} />
                      <Tooltip />
                      <Bar dataKey="訂單數" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          )}
        </div>
      )}

      {/* ── VEHICLE UTILIZATION ─────────────────────────────────────────── */}
      {tab === "vehicle" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">查詢日期</label>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={date}
              onChange={e => setDate(e.target.value)} max={todayStr} />
          </div>

          {vehicle ? (
            <>
              {/* Fleet summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard label="車輛利用率" value={`${vehicle.fleet.utilization_pct}%`}
                  color={vehicle.fleet.utilization_pct >= 70 ? "text-green-600" : "text-orange-500"}
                  sub={`${vehicle.fleet.with_trips_today} / ${vehicle.fleet.total_vehicles} 台有趟次`} />
                <MetricCard label="空車率（現在）" value={`${vehicle.fleet.empty_car_pct}%`}
                  color={vehicle.fleet.empty_car_pct > 40 ? "text-red-500" : "text-gray-700 dark:text-gray-300"}
                  sub={`${vehicle.fleet.empty_now} 台空車`} />
                <MetricCard label="出車中" value={vehicle.fleet.busy_now}
                  sub={`共 ${vehicle.fleet.total_vehicles} 台`} color="text-blue-600" />
              </div>

              {/* Chart: trips per driver */}
              {vehicle.vehicles.length > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">今日趟次分佈</h3>
                  <ResponsiveContainer width="100%" height={Math.min(300, vehicle.vehicles.length * 28 + 40)}>
                    <BarChart data={vehicle.vehicles.map(v => ({
                      name: v.name.length > 5 ? v.name.slice(0, 5) + "…" : v.name,
                      趟次: v.trips_today,
                      status: v.status,
                    }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="趟次" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Per-vehicle table */}
              <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">司機</th>
                        <th className="px-4 py-2 text-left">車牌</th>
                        <th className="px-4 py-2 text-center">狀態</th>
                        <th className="px-4 py-2 text-right">今日趟次</th>
                        <th className="px-4 py-2 text-right">進行中</th>
                        <th className="px-4 py-2 text-right">今日營收</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {vehicle.vehicles.map(v => (
                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-2 font-medium">{v.name}</td>
                          <td className="px-4 py-2 font-mono text-xs">{v.license_plate}</td>
                          <td className="px-4 py-2 text-center">
                            <Badge variant={v.status === "available" ? "secondary" : v.status === "busy" ? "default" : "outline"}
                              className="text-xs">
                              {v.status === "available" ? "可接單" : v.status === "busy" ? "忙碌" : "下線"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right">{v.trips_today}</td>
                          <td className="px-4 py-2 text-right">{v.active_orders_now}</td>
                          <td className="px-4 py-2 text-right text-purple-600">{fmtMoney(v.revenue_today)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          )}
        </div>
      )}

      {/* ── DRIVER RANKING ──────────────────────────────────────────────── */}
      {tab === "driver" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">起始日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={fromDate}
                onChange={e => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">結束日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={toDate}
                onChange={e => setToDate(e.target.value)} max={todayStr} />
            </div>
          </div>

          {drivers ? (
            <>
              {/* Score chart */}
              {drivers.drivers.length > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">綜合評分排行</h3>
                  <ResponsiveContainer width="100%" height={Math.min(280, drivers.drivers.length * 28 + 40)}>
                    <BarChart data={drivers.drivers.slice(0, 15).map(d => ({
                      name: d.name.length > 5 ? d.name.slice(0, 5) + "…" : d.name,
                      評分: d.composite_score,
                    }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="評分" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">排名</th>
                        <th className="px-3 py-2 text-left">司機</th>
                        <th className="px-3 py-2 text-right">完成單</th>
                        <th className="px-3 py-2 text-right">準點率</th>
                        <th className="px-3 py-2 text-right">平均星數</th>
                        <th className="px-3 py-2 text-right">營收</th>
                        <th className="px-3 py-2 text-right">綜合分</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {drivers.drivers.map((d, i) => (
                        <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-2 text-center">
                            <span className={`font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-400" : "text-gray-500"}`}>
                              {i < 3 ? ["🥇","🥈","🥉"][i] : `#${i+1}`}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-gray-400 font-mono">{d.license_plate}</div>
                          </td>
                          <td className="px-3 py-2 text-right">{d.completed}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={Number(d.on_time_pct) >= 90 ? "text-green-600" : "text-orange-500"}>
                              {d.on_time_pct ?? "—"}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            ⭐ {Number(d.avg_rating).toFixed(1)}
                            <span className="text-xs text-gray-400 ml-1">({d.rating_count})</span>
                          </td>
                          <td className="px-3 py-2 text-right text-purple-600">{fmtMoney(d.revenue)}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-600">{d.composite_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          )}
        </div>
      )}

      {/* ── AR AGING ────────────────────────────────────────────────────── */}
      {tab === "ar" && (
        <div className="space-y-4">
          {ar ? (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "30天內", value: ar.totals.current_30d, color: "text-gray-700 dark:text-gray-300" },
                  { label: "逾期 30-60天", value: ar.totals.overdue_30_60d, color: "text-orange-500" },
                  { label: "逾期 60-90天", value: ar.totals.overdue_60_90d, color: "text-red-500" },
                  { label: "逾期 90天以上", value: ar.totals.overdue_90d_plus, color: "text-red-700" },
                ].map(m => (
                  <div key={m.label} className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                    <p className="text-xs text-gray-500">{m.label}</p>
                    <p className={`text-xl font-bold mt-1 ${m.color}`}>{fmtMoney(m.value)}</p>
                  </div>
                ))}
              </div>

              {/* AR pie chart */}
              {(ar.totals.current_30d + ar.totals.overdue_30_60d + ar.totals.overdue_60_90d + ar.totals.overdue_90d_plus) > 0 && (
                <div className="border rounded-xl p-4 bg-white dark:bg-gray-900">
                  <h3 className="text-sm font-semibold mb-3">應收帳款帳齡分佈</h3>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={[
                          { name: "30天內", value: ar.totals.current_30d },
                          { name: "30-60天", value: ar.totals.overdue_30_60d },
                          { name: "60-90天", value: ar.totals.overdue_60_90d },
                          { name: "90天+", value: ar.totals.overdue_90d_plus },
                        ].filter(d => d.value > 0)} cx={85} cy={85} outerRadius={70} dataKey="value">
                          {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip formatter={v => fmtMoney(v as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {[
                        { label: "30天內", value: ar.totals.current_30d, color: "#3b82f6" },
                        { label: "30–60天逾期", value: ar.totals.overdue_30_60d, color: "#10b981" },
                        { label: "60–90天逾期", value: ar.totals.overdue_60_90d, color: "#f59e0b" },
                        { label: "90天以上", value: ar.totals.overdue_90d_plus, color: "#ef4444" },
                      ].map(m => (
                        <div key={m.label} className="flex items-center gap-2 text-xs">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: m.color }} />
                          <span className="text-gray-600 flex-1">{m.label}</span>
                          <span className="font-semibold">{fmtMoney(m.value)}</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 flex items-center gap-2 text-xs">
                        <span className="flex-1 font-medium">合計</span>
                        <span className="font-bold text-red-600">{fmtMoney(ar.totals.total_outstanding)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Per customer */}
              <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b">
                  <h3 className="text-sm font-semibold">客戶帳齡明細</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left">客戶</th>
                        <th className="px-4 py-2 text-right">信用天數</th>
                        <th className="px-4 py-2 text-right">30天內</th>
                        <th className="px-4 py-2 text-right">30-60天</th>
                        <th className="px-4 py-2 text-right">60-90天</th>
                        <th className="px-4 py-2 text-right text-red-600">90天+</th>
                        <th className="px-4 py-2 text-right">合計應收</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ar.customers.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-2">
                            <div className="font-medium">{c.customer}</div>
                            {c.short_name && <div className="text-xs text-gray-400">{c.short_name}</div>}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">{c.credit_days ?? "—"}</td>
                          <td className="px-4 py-2 text-right">{fmtMoney(c.current_30d)}</td>
                          <td className="px-4 py-2 text-right text-orange-500">{fmtMoney(c.overdue_30_60d)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{fmtMoney(c.overdue_60_90d)}</td>
                          <td className="px-4 py-2 text-right font-bold text-red-700">{fmtMoney(c.overdue_90d_plus)}</td>
                          <td className="px-4 py-2 text-right font-semibold">{fmtMoney(c.total_outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">載入中…</div>
          )}
        </div>
      )}
    </div>
  );
}
