import { useState, useEffect, useCallback } from "react";
import { RefreshCw, TrendingUp, Calendar, Coffee, Activity, Car, User } from "lucide-react";
import { apiUrl, authHeaders } from "@/lib/api";

interface DriverStat {
  id: number;
  name: string;
  employee_id: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  phone: string | null;
  is_active: boolean;
  trips_today: number;
  trips_this_week: number;
  trips_this_month: number;
  working_days: number;
  rest_days: number;
  avg_daily_trips: number;
}

interface Fleet {
  id: number;
  fleet_name: string;
  is_active: boolean;
}

export default function DriverDispatchStatsTab() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [selectedFleet, setSelectedFleet] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<DriverStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<"today" | "week" | "month" | "rest" | "avg">("today");

  useEffect(() => {
    fetch(apiUrl("/fusingao/fleets"), { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const active = (d.fleets ?? []).filter((f: Fleet) => f.is_active);
        setFleets(active);
        if (active.length > 0) setSelectedFleet(active[0].id);
      })
      .catch(() => {});
  }, []);

  const fetchStats = useCallback(async (fleetId: number) => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/fusingao/fleets/${fleetId}/driver-dispatch-stats`), {
        headers: authHeaders(),
      });
      const d = await r.json();
      setDrivers(d.drivers ?? []);
      setLastRefresh(new Date());
    } catch {
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedFleet != null) fetchStats(selectedFleet);
  }, [selectedFleet, fetchStats]);

  const sorted = [...drivers].sort((a, b) => {
    if (sortBy === "today")  return Number(b.trips_today)      - Number(a.trips_today);
    if (sortBy === "week")   return Number(b.trips_this_week)  - Number(a.trips_this_week);
    if (sortBy === "month")  return Number(b.trips_this_month) - Number(a.trips_this_month);
    if (sortBy === "rest")   return Number(b.rest_days)        - Number(a.rest_days);
    if (sortBy === "avg")    return Number(b.avg_daily_trips)  - Number(a.avg_daily_trips);
    return 0;
  });

  const activeDrivers  = sorted.filter(d => d.is_active);
  const inactiveDrivers = sorted.filter(d => !d.is_active);
  const orderedDrivers = [...activeDrivers, ...inactiveDrivers];

  const totalToday = drivers.reduce((s, d) => s + Number(d.trips_today), 0);
  const totalMonth = drivers.reduce((s, d) => s + Number(d.trips_this_month), 0);
  const activeCount = drivers.filter(d => d.is_active).length;
  const workingToday = drivers.filter(d => Number(d.trips_today) > 0).length;

  function activityColor(d: DriverStat) {
    if (!d.is_active) return "bg-gray-50 border-gray-200 opacity-60";
    if (Number(d.trips_today) > 0) return "bg-green-50 border-green-200";
    if (Number(d.trips_this_week) > 0) return "bg-blue-50 border-blue-200";
    return "bg-white border-gray-200";
  }

  function statusDot(d: DriverStat) {
    if (!d.is_active) return "bg-gray-300";
    if (Number(d.trips_today) > 0) return "bg-green-500 animate-pulse";
    if (Number(d.trips_this_week) > 0) return "bg-blue-400";
    return "bg-gray-300";
  }

  const sortBtn = (key: typeof sortBy, label: string) => (
    <button
      key={key}
      onClick={() => setSortBy(key)}
      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
        sortBy === key
          ? "bg-orange-500 text-white border-orange-500"
          : "bg-white text-gray-500 border-gray-200 hover:border-orange-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold text-gray-700">派遣參考統計</span>
        </div>

        {/* Fleet selector */}
        <select
          value={selectedFleet ?? ""}
          onChange={e => setSelectedFleet(Number(e.target.value))}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-orange-400"
        >
          {fleets.map(f => (
            <option key={f.id} value={f.id}>{f.fleet_name}</option>
          ))}
        </select>

        <button
          onClick={() => selectedFleet != null && fetchStats(selectedFleet)}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-500 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {lastRefresh ? lastRefresh.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
        </button>
      </div>

      {/* KPI Summary */}
      {drivers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: <Activity className="h-3.5 w-3.5 text-green-500" />, label: "今日出勤", value: `${workingToday} / ${activeCount} 人` },
            { icon: <Car className="h-3.5 w-3.5 text-blue-500" />,       label: "今日趟數合計", value: totalToday },
            { icon: <Calendar className="h-3.5 w-3.5 text-purple-500" />, label: "本月趟數合計", value: totalMonth },
            { icon: <User className="h-3.5 w-3.5 text-orange-500" />,    label: "在職司機", value: `${activeCount} 人` },
          ].map((k, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm">
              {k.icon}
              <div>
                <div className="text-[10px] text-gray-400">{k.label}</div>
                <div className="text-sm font-semibold text-gray-700">{k.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sort bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">排序：</span>
        {sortBtn("today", "今日趟數")}
        {sortBtn("week",  "本週趟數")}
        {sortBtn("month", "本月趟數")}
        {sortBtn("rest",  "休息天數")}
        {sortBtn("avg",   "日均趟數")}
      </div>

      {/* Driver Grid */}
      {loading ? (
        <div className="text-center py-12 text-xs text-gray-400">載入中…</div>
      ) : orderedDrivers.length === 0 ? (
        <div className="text-center py-12 text-xs text-gray-400">此車隊尚無司機資料</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orderedDrivers.map(d => (
            <div
              key={d.id}
              className={`rounded-lg border p-3 transition-all ${activityColor(d)}`}
            >
              {/* Driver header */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(d)}`} />
                <span className="text-sm font-semibold text-gray-800 truncate">{d.name}</span>
                {d.employee_id && (
                  <span className="text-[10px] text-gray-400 shrink-0">#{d.employee_id}</span>
                )}
                {d.vehicle_plate && (
                  <span className="ml-auto text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">
                    {d.vehicle_plate}
                  </span>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-5 gap-1 text-center">
                {/* 今日 */}
                <div className="flex flex-col items-center">
                  <div className={`text-lg font-bold leading-tight ${Number(d.trips_today) > 0 ? "text-green-600" : "text-gray-300"}`}>
                    {d.trips_today}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">今日</div>
                </div>
                {/* 本週 */}
                <div className="flex flex-col items-center">
                  <div className={`text-lg font-bold leading-tight ${Number(d.trips_this_week) > 0 ? "text-blue-600" : "text-gray-300"}`}>
                    {d.trips_this_week}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">本週</div>
                </div>
                {/* 本月 */}
                <div className="flex flex-col items-center">
                  <div className={`text-lg font-bold leading-tight ${Number(d.trips_this_month) > 0 ? "text-indigo-600" : "text-gray-300"}`}>
                    {d.trips_this_month}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">本月</div>
                </div>
                {/* 休息天 */}
                <div className="flex flex-col items-center">
                  <div className={`text-lg font-bold leading-tight flex items-center justify-center gap-0.5 ${Number(d.rest_days) > 7 ? "text-amber-500" : "text-gray-500"}`}>
                    <Coffee className="h-3 w-3 inline-block" />
                    <span>{d.rest_days}</span>
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">休息天</div>
                </div>
                {/* 日均 */}
                <div className="flex flex-col items-center">
                  <div className={`text-lg font-bold leading-tight ${Number(d.avg_daily_trips) >= 1 ? "text-purple-600" : "text-gray-300"}`}>
                    {Number(d.avg_daily_trips).toFixed(1)}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-tight">日均</div>
                </div>
              </div>

              {/* Working days sub-row */}
              <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 border-t border-gray-100 pt-1.5">
                <Calendar className="h-3 w-3" />
                <span>本月出勤 <strong className="text-gray-600">{d.working_days}</strong> 天</span>
                {d.vehicle_type && (
                  <span className="ml-auto bg-gray-100 text-gray-500 rounded px-1">{d.vehicle_type}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 pt-1 border-t border-gray-100">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> 今日已出勤</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> 本週有出勤</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> 本週未出勤</span>
      </div>
    </div>
  );
}
