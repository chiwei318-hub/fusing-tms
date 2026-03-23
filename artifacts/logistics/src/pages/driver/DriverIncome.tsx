import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  TrendingUp, Star, Truck, Calendar, DollarSign,
  BarChart2, ChevronDown, ChevronRight, Award
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";

type Period = "week" | "month" | "year";

function fetchIncome(driverId: number, period: Period) {
  return fetch(apiUrl(`/driver-income/${driverId}?period=${period}`)).then(r => r.json());
}

export default function DriverIncome() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("month");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["driver-income", user?.id, period],
    queryFn: () => fetchIncome(user!.id, period),
    enabled: !!user?.id,
  });

  const { data: settlements } = useQuery({
    queryKey: ["driver-settlements", user?.id],
    queryFn: () => fetch(apiUrl(`/driver-income/${user!.id}/settlements`)).then(r => r.json()),
    enabled: !!user?.id,
  });

  const summary = data?.summary ?? {};
  const daily = data?.dailyBreakdown ?? [];
  const orders = data?.orderHistory ?? [];
  const ratings = data?.ratings ?? {};

  const periodLabel = { week: "本週", month: "本月", year: "本年" }[period];

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
        <div className="h-24 bg-muted rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black">收入總覽</h1>
        <p className="text-muted-foreground text-sm mt-0.5">您的收入明細與結算紀錄</p>
      </div>

      {/* Period toggle */}
      <div className="flex gap-2">
        {(["week", "month", "year"] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              period === p
                ? "bg-blue-600 text-white shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {{ week: "本週", month: "本月", year: "本年" }[p]}
          </button>
        ))}
      </div>

      {/* Main earnings card */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full -ml-6 -mb-6" />
        <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">{periodLabel}總收入（扣前）</p>
        <p className="text-4xl font-black text-white mb-1">
          NT${Number(summary.gross_earnings || 0).toLocaleString()}
        </p>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-blue-300 text-sm">平台抽成 {summary.deductionRate ?? 15}%</span>
          <span className="text-orange-300 text-sm font-bold">
            −NT${Number(summary.deductionAmount || 0).toLocaleString()}
          </span>
        </div>
        <div className="border-t border-white/20 pt-4">
          <p className="text-blue-200 text-xs mb-1">實際到手</p>
          <p className="text-3xl font-black text-green-300">
            NT${Number(summary.netEarnings || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <Truck className="w-5 h-5 text-blue-600 mb-2" />
          <p className="text-2xl font-black">{summary.completed_orders ?? 0}</p>
          <p className="text-muted-foreground text-xs">{periodLabel}完成訂單</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <TrendingUp className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-2xl font-black">
            NT${Math.round(Number(summary.avg_fee_per_order ?? 0)).toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">平均每單收入</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <BarChart2 className="w-5 h-5 text-purple-600 mb-2" />
          <p className="text-2xl font-black">
            {Number(summary.total_km ?? 0).toFixed(0)} km
          </p>
          <p className="text-muted-foreground text-xs">{periodLabel}總里程</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <Star className="w-5 h-5 text-yellow-500 mb-2" />
          <p className="text-2xl font-black">
            {ratings.avg_stars ? Number(ratings.avg_stars).toFixed(1) : "—"}
          </p>
          <p className="text-muted-foreground text-xs">平均評分（{ratings.total_ratings ?? 0}筆）</p>
        </div>
      </div>

      {/* Rating breakdown */}
      {ratings.total_ratings > 0 && (
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-yellow-500" />
            <span className="font-bold text-sm">評分分布</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${((ratings.five_stars ?? 0) / (ratings.total_ratings ?? 1)) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold text-yellow-600">{ratings.five_stars ?? 0} 筆 ⭐⭐⭐⭐⭐</span>
          </div>
          <p className="text-muted-foreground text-xs mt-2">
            4 星以上佔比：{ratings.total_ratings > 0 ? Math.round(((ratings.four_plus_stars ?? 0) / ratings.total_ratings) * 100) : 0}%
          </p>
        </div>
      )}

      {/* Daily breakdown */}
      {daily.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            每日明細
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {daily.map((d: any) => (
              <div key={d.day} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(d.day), "M月d日（EEE）", { locale: zhTW })}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.order_count} 單 · {Number(d.km).toFixed(1)} km</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">
                    +NT${Number(d.earnings).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    到手 NT${Math.round(Number(d.earnings) * 0.85).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order history */}
      {orders.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            訂單收入明細
          </h3>
          <div className="space-y-2">
            {(showAll ? orders : orders.slice(0, 5)).map((o: any) => (
              <div key={o.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-blue-700 dark:text-blue-300">
                  #{o.id}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.pickup_address} → {o.delivery_address}</p>
                  <p className="text-xs text-muted-foreground">{o.cargo_description} · {Number(o.distance_km ?? 0).toFixed(1)} km</p>
                  {o.rating && (
                    <p className="text-xs text-yellow-600 mt-0.5">{"⭐".repeat(Number(o.rating))} {Number(o.rating).toFixed(1)}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-emerald-600">NT${Number(o.total_fee ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.created_at ? format(new Date(o.created_at), "M/d") : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {orders.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full mt-3 text-sm text-blue-600 font-medium flex items-center justify-center gap-1"
            >
              {showAll ? "收起" : `顯示全部 ${orders.length} 筆`}
              {showAll ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}

      {/* Settlement history */}
      {settlements && settlements.length > 0 && (
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <h3 className="font-bold text-sm mb-3">結算紀錄</h3>
          <div className="space-y-2">
            {settlements.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">
                    {format(parseISO(s.period_start), "M月d日")} – {format(parseISO(s.period_end), "M月d日")}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.order_count} 單 · 抽成 {s.deduction_rate}%</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">NT${Number(s.net_earnings).toLocaleString()}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {s.status === "paid" ? "已撥款" : "待結算"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{periodLabel}尚無完成訂單</p>
          <p className="text-sm mt-1">完成訂單後收入將顯示於此</p>
        </div>
      )}
    </div>
  );
}
