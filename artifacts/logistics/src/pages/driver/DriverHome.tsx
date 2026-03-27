import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Truck, ArrowRight, CheckCircle, DollarSign, LogOut, Zap, Star, TrendingUp, ThumbsUp, AlertTriangle, Car, MapPin, Clock, Settings2, Snowflake, Package, X, Plus, Navigation } from "lucide-react";
import { useDriversData } from "@/hooks/use-drivers";
import { useListOrders } from "@workspace/api-client-react";
import { DriverStatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { isToday, format, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
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
  const { user, token, logout } = useAuth();

  useEffect(() => {
    if (!token) return;
    const ping = () => fetch(import.meta.env.BASE_URL + "api/presence/ping", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, [token]);
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
  const [driverProfile, setDriverProfile] = useState<any | null>(null);

  // GPS state
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "success" | "error">("idle");

  // Service area editing state
  const [editingAreas, setEditingAreas] = useState(false);
  const [tempAreas, setTempAreas] = useState<string[]>([]);
  const [newArea, setNewArea] = useState("");
  const areaInputRef = useRef<HTMLInputElement>(null);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    const data = await fetch(apiUrl(`/drivers/${user.id}/profile`)).then(r => r.json()).catch(() => null);
    setDriverProfile(data);
    if (data?.service_areas) setTempAreas(data.service_areas);
  }, [user?.id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const shareLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationStatus("error"); return; }
    setLocationLoading(true);
    setLocationStatus("idle");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch(apiUrl(`/drivers/${user!.id}/location`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          });
          setLocationStatus("success");
          fetchProfile();
        } catch { setLocationStatus("error"); }
        finally { setLocationLoading(false); }
      },
      () => { setLocationLoading(false); setLocationStatus("error"); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [user?.id, fetchProfile]);

  const saveServiceAreas = useCallback(async () => {
    await fetch(apiUrl(`/drivers/${user!.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceAreas: tempAreas }),
    });
    setEditingAreas(false);
    fetchProfile();
  }, [user?.id, tempAreas, fetchProfile]);

  const saveCapability = useCallback(async (field: string, value: boolean) => {
    await fetch(apiUrl(`/drivers/${user!.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchProfile();
  }, [user?.id, fetchProfile]);

  const saveAvailableTime = useCallback(async (start: string, end: string) => {
    await fetch(apiUrl(`/drivers/${user!.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availableTimeStart: start, availableTimeEnd: end }),
    });
    fetchProfile();
  }, [user?.id, fetchProfile]);

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

      {/* Active task urgent banner */}
      {activeTasks.length > 0 && (
        <Link href="/driver/tasks">
          <div className="bg-orange-500 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30">
            <div className="relative">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center text-orange-600 text-[10px] font-black">
                {activeTasks.length}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-black text-white">
                {activeTasks[0].status === "in_transit" ? "🚛 運送中！" : "📦 已接單，待取貨"}
              </p>
              <p className="text-orange-100 text-xs mt-0.5 truncate">
                {activeTasks[0].pickupAddress ?? ""} → {activeTasks[0].deliveryAddress ?? ""}
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/80 shrink-0" />
          </div>
        </Link>
      )}

      {/* Stats card */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(140deg, #071829 0%, #0c2444 55%, #0f2d58 100%)" }}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(217,119,6,0.10) 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />
        <div className="relative z-10 flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/12 border border-white/20 flex items-center justify-center text-white font-black text-xl shrink-0">
            {(user?.name ?? "?").charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">{user?.name}</p>
            {driver && <DriverStatusBadge status={driver.status} />}
          </div>
          {avgStars !== null && (
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <Star className="w-4 h-4 fill-amber-300" style={{ color: "#fcd34d" }} />
                <span className="font-black text-lg" style={{ color: "#fcd34d" }}>{avgStars.toFixed(1)}</span>
              </div>
              <p className="text-slate-400 text-xs">{totalRatings} 筆評分</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/8 border border-white/10 rounded-xl p-3 text-center">
            <CheckCircle className="w-4 h-4 text-emerald-300 mx-auto mb-1" />
            <p className="font-black text-lg text-white">{todayCompleted.length}</p>
            <p className="text-slate-400 text-xs">今日完成</p>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-xl p-3 text-center">
            <Truck className="w-4 h-4 mx-auto mb-1" style={{ color: "#fbbf24" }} />
            <p className="font-black text-lg text-white">{activeTasks.length}</p>
            <p className="text-slate-400 text-xs">進行中</p>
          </div>
          <div className="bg-white/8 border border-white/10 rounded-xl p-3 text-center">
            <DollarSign className="w-4 h-4 text-emerald-300 mx-auto mb-1" />
            <p className="font-black text-base text-white">
              {todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : "—"}
            </p>
            <p className="text-slate-400 text-xs">今日收入</p>
          </div>
        </div>
      </div>

      {/* Rating performance card */}
      {perf && totalRatings > 0 && (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-amber-50 dark:bg-amber-950/30">
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
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50 dark:bg-blue-950/30">
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

      {/* ── 接單能力設定 ── */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-violet-50 dark:bg-violet-950/30">
          <Settings2 className="w-4 h-4 text-violet-600" />
          <span className="font-bold text-sm text-violet-900 dark:text-violet-100">接單能力設定</span>
        </div>
        <div className="p-4 space-y-4">

          {/* GPS 定位 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${locationStatus === "success" ? "bg-emerald-100" : "bg-violet-100"}`}>
                <Navigation className={`w-4 h-4 ${locationStatus === "success" ? "text-emerald-600" : "text-violet-600"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">GPS 定位</p>
                <p className="text-xs text-muted-foreground truncate">
                  {locationStatus === "success" ? "✓ 位置已更新"
                    : locationStatus === "error" ? "⚠ 定位失敗，請重試"
                    : driverProfile?.last_location_at
                    ? `上次：${formatDistanceToNow(new Date(driverProfile.last_location_at), { locale: zhTW, addSuffix: true })}`
                    : "尚未回報位置"}
                </p>
              </div>
            </div>
            <button
              onClick={shareLocation}
              disabled={locationLoading}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                locationStatus === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-violet-600 border-violet-600 text-white hover:bg-violet-700 active:scale-95"
              } disabled:opacity-60`}
            >
              {locationLoading ? "定位中…" : locationStatus === "success" ? "✓ 已更新" : "更新位置"}
            </button>
          </div>

          {/* 服務區域 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold">服務區域</span>
              </div>
              {!editingAreas && (
                <button onClick={() => { setEditingAreas(true); setTempAreas(driverProfile?.service_areas ?? []); setTimeout(() => areaInputRef.current?.focus(), 100); }}
                  className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-2 py-0.5 rounded-full">
                  編輯
                </button>
              )}
            </div>
            {editingAreas ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {tempAreas.map(a => (
                    <span key={a} className="flex items-center gap-1 bg-violet-100 text-violet-800 text-xs px-2 py-0.5 rounded-full font-medium">
                      {a}
                      <button onClick={() => setTempAreas(prev => prev.filter(x => x !== a))} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={areaInputRef}
                    value={newArea}
                    onChange={e => setNewArea(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newArea.trim()) { setTempAreas(p => p.includes(newArea.trim()) ? p : [...p, newArea.trim()]); setNewArea(""); }}}
                    placeholder="輸入區域（如：台北市）按 Enter 新增"
                    className="flex-1 text-xs border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-300 h-8"
                  />
                  <button onClick={() => { if (newArea.trim()) { setTempAreas(p => p.includes(newArea.trim()) ? p : [...p, newArea.trim()]); setNewArea(""); }}}
                    className="bg-violet-100 text-violet-700 rounded-lg px-2 py-1 hover:bg-violet-200 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveServiceAreas} className="flex-1 bg-violet-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-violet-700 transition-colors">儲存</button>
                  <button onClick={() => { setEditingAreas(false); setTempAreas(driverProfile?.service_areas ?? []); }} className="flex-1 border text-xs py-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(driverProfile?.service_areas ?? []).length > 0
                  ? (driverProfile.service_areas as string[]).map(a => (
                    <span key={a} className="bg-violet-100 text-violet-800 text-xs px-2.5 py-1 rounded-full font-medium">{a}</span>
                  ))
                  : <span className="text-xs text-muted-foreground">尚未設定（點「編輯」新增服務區域）</span>
                }
              </div>
            )}
          </div>

          {/* 可接貨型 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold">可接貨型</span>
            </div>
            <div className="flex gap-2">
              {[
                { field: "canColdChain", label: "冷鏈貨物", icon: <Snowflake className="w-3.5 h-3.5" />, active: !!driverProfile?.can_cold_chain },
                { field: "canHeavyCargo", label: "重型貨物", icon: <Truck className="w-3.5 h-3.5" />, active: !!driverProfile?.can_heavy_cargo },
              ].map(opt => (
                <button
                  key={opt.field}
                  onClick={() => saveCapability(opt.field, !opt.active)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                    opt.active ? "bg-violet-600 text-white border-violet-600" : "bg-muted text-muted-foreground border-border hover:border-violet-300"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 可接時段 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold">可接時段</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                defaultValue={driverProfile?.available_time_start ?? "08:00"}
                className="border rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-300"
                id="time-start"
              />
              <span className="text-xs text-muted-foreground">至</span>
              <input
                type="time"
                defaultValue={driverProfile?.available_time_end ?? "20:00"}
                className="border rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-300"
                id="time-end"
              />
              <button
                onClick={() => {
                  const s = (document.getElementById("time-start") as HTMLInputElement)?.value;
                  const e = (document.getElementById("time-end") as HTMLInputElement)?.value;
                  if (s && e) saveAvailableTime(s, e);
                }}
                className="bg-violet-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-violet-700 transition-colors"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/driver/grab">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-start gap-3 cursor-pointer transition-all shadow-lg shadow-orange-500/25 h-full">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-black text-white text-base leading-tight">搶單中心</p>
              <p className="text-orange-100 text-xs mt-0.5">主動出擊接單</p>
            </div>
          </div>
        </Link>
        <Link href="/driver/tasks">
          <div className="bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-start gap-3 cursor-pointer transition-all h-full">
            <div className="bg-white/10 p-2.5 rounded-xl relative">
              <Truck className="w-6 h-6 text-white" />
              {activeTasks.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {activeTasks.length}
                </span>
              )}
            </div>
            <div>
              <p className="font-black text-white text-base leading-tight">我的任務</p>
              <p className="text-slate-300 text-xs mt-0.5">
                {activeTasks.length > 0 ? `${activeTasks.length} 筆進行中` : "查看派車任務"}
              </p>
            </div>
          </div>
        </Link>
        <Link href="/driver/income">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-start gap-3 cursor-pointer transition-all shadow-md shadow-emerald-500/20 h-full">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-black text-white text-base leading-tight">收入報表</p>
              <p className="text-emerald-100 text-xs mt-0.5">查看明細與結算</p>
            </div>
          </div>
        </Link>
        <Link href="/driver">
          <div className="bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-start gap-3 cursor-pointer transition-all shadow-md shadow-violet-500/20 h-full">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-black text-white text-base leading-tight">評分中心</p>
              <p className="text-violet-200 text-xs mt-0.5">查看客戶評分</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
