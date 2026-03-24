import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Truck, ArrowRight, CheckCircle, DollarSign, LogOut, Zap, Star, TrendingUp, ThumbsUp, AlertTriangle, Car } from "lucide-react";
import { useDriversData } from "@/hooks/use-drivers";
import { useListOrders } from "@workspace/api-client-react";
import { DriverStatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { isToday } from "date-fns";
import { apiUrl } from "@/lib/api";

interface RatingPerf {
  stats: {
    total: string; avg_stars: string; five_star: string;
    four_star: string; bad_count: string; bad_month: string;
  } | null;
  recentStars: number[];
  events: any[];
}

interface VehiclePerf {
  stats: {
    total: string; avg_stars: string; five_star: string;
    four_star: string; three_star: string; bad_count: string; bad_month: string;
  } | null;
  recent: any[];
  byDriver: any[];
}

function StarRow({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, count * 10)}%` }} />
      </div>
      <span className="w-4 text-right font-medium">{count}</span>
    </div>
  );
}

export default function DriverHome() {
  const { user, logout } = useAuth();
  const { data: drivers, isLoading } = useDriversData();
  const driver = drivers?.find(d => d.id === user?.id);

  const { data: myOrders } = useListOrders(
    user?.id ? { driverId: user.id } as any : undefined,
    { query: { enabled: !!user?.id } }
  );

  const todayCompleted = myOrders?.filter(o =>
    o.status === "delivered" && isToday(new Date(o.updatedAt))
  ) ?? [];
  const todayEarnings = todayCompleted.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);
  const activeTasks = myOrders?.filter(o => o.status === "assigned" || o.status === "in_transit") ?? [];

  const [perf, setPerf] = useState<RatingPerf | null>(null);
  const [vehiclePerf, setVehiclePerf] = useState<VehiclePerf | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetch(apiUrl(`/ratings/driver/${user.id}/performance`))
      .then(r => r.json())
      .then(setPerf)
      .catch(() => {});
  }, [user?.id]);

  // Fetch vehicle-specific rating when driver's license plate is known
  useEffect(() => {
    const plate = driver?.licensePlate;
    if (!plate) return;
    fetch(apiUrl(`/ratings/vehicle/${encodeURIComponent(plate)}`))
      .then(r => r.json())
      .then(setVehiclePerf)
      .catch(() => {});
  }, [driver?.licensePlate]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  const avgStars = perf?.stats ? parseFloat(perf.stats.avg_stars) : null;
  const totalRatings = perf?.stats ? parseInt(perf.stats.total) : 0;
  const activeEvent = perf?.events?.find(e => !e.is_resolved);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">已登入</p>
          <h1 className="text-2xl font-black text-foreground">歡迎，{user?.name}</h1>
          {driver && <p className="text-muted-foreground text-sm mt-0.5">{driver.vehicleType} · {driver.licensePlate}</p>}
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors mt-1">
          <LogOut className="w-3.5 h-3.5" /> 登出
        </button>
      </div>

      {/* Stats card */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full -mr-8 -mt-8" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-orange-500/20 rounded-full -ml-4 -mb-4" />
        <div className="relative z-10 flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white font-black text-xl shrink-0">
            {(user?.name ?? "?").charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">{user?.name}</p>
            {driver && <DriverStatusBadge status={driver.status} />}
          </div>
          {avgStars !== null && (
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                <span className="text-yellow-300 font-black text-lg">{avgStars.toFixed(1)}</span>
              </div>
              <p className="text-blue-200 text-xs">{totalRatings} 筆評分</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <CheckCircle className="w-4 h-4 text-green-300 mx-auto mb-1" />
            <p className="font-black text-lg text-white">{todayCompleted.length}</p>
            <p className="text-blue-200 text-xs">今日完成</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <Truck className="w-4 h-4 text-orange-300 mx-auto mb-1" />
            <p className="font-black text-lg text-white">{activeTasks.length}</p>
            <p className="text-blue-200 text-xs">進行中</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <DollarSign className="w-4 h-4 text-yellow-300 mx-auto mb-1" />
            <p className="font-black text-base text-white">
              {todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : "—"}
            </p>
            <p className="text-blue-200 text-xs">今日收入</p>
          </div>
        </div>
      </div>

      {/* Rating performance card */}
      {perf && totalRatings > 0 && (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span className="font-bold text-sm">客戶評分回饋</span>
            {avgStars !== null && (
              <span className={`ml-auto text-sm font-black ${avgStars >= 4.5 ? "text-emerald-600" : avgStars >= 3.5 ? "text-blue-600" : "text-red-600"}`}>
                ★ {avgStars.toFixed(2)}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {/* Recent stars trend */}
            {perf.recentStars.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">最近 {perf.recentStars.length} 筆評分趨勢</p>
                <div className="flex gap-1.5 items-end h-8">
                  {perf.recentStars.slice().reverse().map((s, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                      <div
                        className={`w-full rounded-sm transition-all ${s >= 4 ? "bg-emerald-400" : s === 3 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ height: `${(s / 5) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>較早</span><span>最近</span>
                </div>
              </div>
            )}

            {/* Distribution summary */}
            <div className="space-y-1.5">
              <StarRow count={parseInt(perf.stats?.five_star ?? "0")}  label="5 ★★★★★" color="bg-emerald-400" />
              <StarRow count={parseInt(perf.stats?.four_star ?? "0")}  label="4 ★★★★" color="bg-blue-400" />
              <StarRow count={parseInt(perf.stats?.bad_count ?? "0")} label="1-2 ★" color="bg-red-400" />
            </div>

            {/* Active event */}
            {activeEvent && (
              <div className={`rounded-xl px-3 py-2.5 flex items-start gap-2 text-sm ${
                activeEvent.event_level === "reward"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}>
                {activeEvent.event_level === "reward"
                  ? <ThumbsUp className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-bold text-xs">{activeEvent.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{activeEvent.description}</p>
                </div>
              </div>
            )}

            {/* No active events — encouragement */}
            {!activeEvent && avgStars !== null && avgStars >= 4.0 && (
              <div className="rounded-xl px-3 py-2.5 bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-700">
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>服務穩定優良，繼續保持！達到 5 連好評可獲得獎勵。</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No ratings yet */}
      {perf && totalRatings === 0 && (
        <div className="rounded-2xl border bg-amber-50 p-4 flex items-center gap-3">
          <Star className="w-8 h-8 text-amber-400" />
          <div>
            <p className="font-bold text-sm">尚無客戶評分</p>
            <p className="text-xs text-muted-foreground mt-0.5">完成訂單後客戶可為您評分，累積好評可獲得系統獎勵！</p>
          </div>
        </div>
      )}

      {/* Vehicle rating card */}
      {vehiclePerf && driver?.licensePlate && (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50">
            <Car className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-sm text-blue-900">本車評分</span>
            <span className="ml-1 font-mono text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">{driver.licensePlate}</span>
            {vehiclePerf.stats && Number(vehiclePerf.stats.total) > 0 && vehiclePerf.stats.avg_stars && (
              <span className={`ml-auto text-sm font-black ${
                parseFloat(vehiclePerf.stats.avg_stars) >= 4.5 ? "text-emerald-600"
                : parseFloat(vehiclePerf.stats.avg_stars) >= 3.5 ? "text-blue-600"
                : "text-red-600"
              }`}>
                ★ {parseFloat(vehiclePerf.stats.avg_stars).toFixed(2)}
              </span>
            )}
          </div>
          <div className="p-4">
            {vehiclePerf.stats && Number(vehiclePerf.stats.total) > 0 ? (
              <div className="space-y-3">
                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/50 p-2.5 text-center">
                    <p className="font-black text-base">{vehiclePerf.stats.total}</p>
                    <p className="text-xs text-muted-foreground">評分總數</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2.5 text-center">
                    <p className="font-black text-base text-emerald-600">{vehiclePerf.stats.five_star}</p>
                    <p className="text-xs text-muted-foreground">5 星好評</p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-2.5 text-center">
                    <p className={`font-black text-base ${Number(vehiclePerf.stats.bad_count) > 0 ? "text-red-600" : "text-emerald-600"}`}>{vehiclePerf.stats.bad_count}</p>
                    <p className="text-xs text-muted-foreground">差評</p>
                  </div>
                </div>

                {/* Star distribution mini bars */}
                <div className="space-y-1.5">
                  {[
                    { label: "5★", count: Number(vehiclePerf.stats.five_star), color: "bg-emerald-400" },
                    { label: "4★", count: Number(vehiclePerf.stats.four_star), color: "bg-blue-400" },
                    { label: "3★", count: Number(vehiclePerf.stats.three_star), color: "bg-yellow-400" },
                    { label: "1-2★", count: Number(vehiclePerf.stats.bad_count), color: "bg-red-400" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2 text-xs">
                      <span className="w-8 text-muted-foreground shrink-0">{row.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Number(vehiclePerf.stats!.total) > 0 ? Math.round(row.count / Number(vehiclePerf.stats!.total) * 100) : 0}%` }} />
                      </div>
                      <span className="w-4 text-right font-medium">{row.count}</span>
                    </div>
                  ))}
                </div>

                {/* Recent comment */}
                {vehiclePerf.recent[0]?.comment && (
                  <div className={`rounded-xl px-3 py-2 text-xs ${vehiclePerf.recent[0].stars >= 4 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                    <span className="font-bold">最新評語：</span>"{vehiclePerf.recent[0].comment}"
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-1">
                <Car className="w-8 h-8 text-blue-300 shrink-0" />
                <div>
                  <p className="font-bold text-sm">本車尚無評分記錄</p>
                  <p className="text-xs text-muted-foreground mt-0.5">完成訂單後，客戶的評分也會記錄到此車牌。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-1 gap-3">
        <Link href="/driver/grab">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all shadow-lg shadow-orange-500/30">
            <div className="bg-white/20 p-3 rounded-xl shrink-0">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-lg">搶單中心</p>
              <p className="text-orange-100 text-sm">查看待接訂單，主動出擊搶先接單</p>
            </div>
            <div className="bg-white/20 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
        <Link href="/driver/tasks">
          <div className="bg-slate-700 hover:bg-slate-800 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all">
            <div className="bg-white/10 p-3 rounded-xl shrink-0">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-lg">我的任務</p>
              <p className="text-slate-300 text-sm">
                {activeTasks.length > 0 ? `${activeTasks.length} 筆任務進行中` : "查看指派的派車任務"}
              </p>
            </div>
            <div className="bg-white/10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
