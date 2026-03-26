import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  TrendingUp, Star, Truck, Calendar, DollarSign,
  BarChart2, ChevronDown, ChevronRight, Award,
  Trophy, CheckCircle2, XCircle, Target,
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
        <div className="h-10 bg-muted rounded-xl w-40" />
        <div className="h-12 bg-muted rounded-xl" />
        <div className="h-52 bg-muted rounded-2xl" />
        <div className="h-32 bg-muted rounded-2xl" />
      </div>
    );
  }

  const grossEarnings = Number(summary.gross_earnings || 0);
  const netEarnings = Math.max(0, Number(summary.netEarnings || 0));
  const commissionAmt = Number(summary.commissionAmount || 0);
  const affiliationFee = Number(summary.monthlyAffiliationFee || 0);
  const netPct = grossEarnings > 0 ? Math.round(netEarnings / grossEarnings * 100) : 0;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">收入總覽</h1>
          <p className="text-muted-foreground text-sm mt-0.5">您的收入明細與結算紀錄</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">實際到手比例</p>
          <p className={`text-lg font-black ${netPct >= 80 ? "text-emerald-600" : netPct >= 70 ? "text-blue-600" : "text-orange-600"}`}>
            {netPct}%
          </p>
        </div>
      </div>

      {/* Period toggle */}
      <div className="flex gap-2 bg-muted p-1 rounded-xl">
        {(["week", "month", "year"] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {{ week: "本週", month: "本月", year: "本年" }[p]}
          </button>
        ))}
      </div>

      {/* Main earnings card — enhanced */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-12 -mt-12" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8" />
        <div className="relative z-10">
          <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">{periodLabel}運費總計</p>
          <p className="text-4xl font-black text-white mb-4">
            NT${grossEarnings.toLocaleString()}
          </p>

          {/* Visual deduction flow */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-blue-200">抽成（{summary.commissionRate ?? 15}%）</span>
              </div>
              <span className="text-orange-300 font-bold">−NT${commissionAmt.toLocaleString()}</span>
            </div>
            {affiliationFee > 0 && period === "month" && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-blue-200">月靠行費</span>
                </div>
                <span className="text-orange-300 font-bold">−NT${affiliationFee.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Net earnings with progress bar */}
          <div className="border-t border-white/20 pt-4 space-y-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-blue-200 text-xs mb-1">實際到手</p>
                <p className="text-3xl font-black text-green-300">NT${netEarnings.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-blue-300 text-xs">到手率</p>
                <p className="text-xl font-black text-green-300">{netPct}%</p>
              </div>
            </div>
            <div className="bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-300 rounded-full transition-all duration-700"
                style={{ width: `${netPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            icon: Truck, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30",
            value: String(summary.completed_orders ?? 0),
            label: `${periodLabel}完成訂單`, unit: "筆"
          },
          {
            icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30",
            value: `NT$${Math.round(Number(summary.avg_fee_per_order ?? 0)).toLocaleString()}`,
            label: "平均每單收入", unit: ""
          },
          {
            icon: BarChart2, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30",
            value: `${Number(summary.total_km ?? 0).toFixed(0)}`,
            label: `${periodLabel}總里程`, unit: "km"
          },
          {
            icon: Star, color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
            value: ratings.avg_stars ? Number(ratings.avg_stars).toFixed(1) : "—",
            label: `平均評分（${ratings.total_ratings ?? 0}筆）`, unit: "★"
          },
        ].map(({ icon: Icon, color, bg, value, label, unit }) => (
          <div key={label} className="bg-card rounded-2xl p-4 border shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-2xl font-black text-foreground leading-none">
              {value}<span className="text-sm font-medium text-muted-foreground ml-0.5">{unit}</span>
            </p>
            <p className="text-muted-foreground text-xs mt-1">{label}</p>
          </div>
        ))}
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
                    到手 NT${Math.round(Number(d.earnings) * (1 - (summary.commissionRate ?? 15) / 100)).toLocaleString()}
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
                  <p className="font-bold text-blue-700 dark:text-blue-300 text-xs">
                    運費 NT${Number(o.total_fee ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-orange-500">
                    −NT${Number(o.commission_amount ?? 0).toLocaleString()}（{Number(o.commission_rate ?? 15).toFixed(0)}%）
                  </p>
                  <p className="font-black text-emerald-600">
                    到手 NT${Number(o.net_fee ?? 0).toLocaleString()}
                  </p>
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

      {/* ── 達標獎金進度 ── */}
      {user?.id && <BonusProgress driverId={user.id} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 司機獎金進度區塊
// ────────────────────────────────────────────────────────────
const levelColors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  bronze:   { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  icon: "🥉" },
  silver:   { bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-300",   icon: "🥈" },
  gold:     { bg: "bg-yellow-50",  text: "text-yellow-700",  border: "border-yellow-300",  icon: "🥇" },
  platinum: { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-300",  icon: "💎" },
};
const metricLabels: Record<string, string> = {
  completion_rate: "完成率",
  avg_rating:      "平均評分",
  order_count:     "接單數",
  complaint_count: "客訴件數",
};
const metricUnits: Record<string, string> = {
  completion_rate: "%", avg_rating: "星", order_count: "件", complaint_count: "件",
};

function BonusProgress({ driverId }: { driverId: number }) {
  const now = new Date();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["driver-my-bonus", driverId],
    queryFn: () => fetch(`/api/performance/my-bonus/${driverId}?year=${now.getFullYear()}&month=${now.getMonth()+1}`).then(r => r.json()),
  });

  if (isLoading) return null;
  if (!data) return null;

  const { achievementData, targetsMet, overallPct, rules = [], bonuses = [] } = data;

  let currentLevel: any = null;
  let nextLevel: any = null;
  for (const rule of [...rules].reverse()) {
    const pct = parseFloat(rule.achievement_pct);
    if (overallPct >= pct) { currentLevel = rule; break; }
  }
  for (const rule of rules) {
    if (parseFloat(rule.achievement_pct) > overallPct) { nextLevel = rule; break; }
  }

  const lc = currentLevel ? (levelColors[currentLevel.level_color] ?? levelColors.bronze) : null;
  const barColor = overallPct >= 100 ? "bg-emerald-500" : overallPct >= 80 ? "bg-blue-500" : overallPct >= 60 ? "bg-orange-400" : "bg-red-400";

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-4 mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-600" />
        <span className="font-black text-yellow-800">本月達標獎金進度</span>
        <span className="text-xs text-yellow-600">{now.getFullYear()}年{now.getMonth()+1}月</span>
      </div>

      {/* 等級顯示 */}
      <div className="flex items-center justify-between">
        <div>
          {currentLevel ? (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${lc?.bg} ${lc?.border} border`}>
              <span className="text-lg">{lc?.icon}</span>
              <div>
                <p className={`font-black text-sm ${lc?.text}`}>{currentLevel.level_name}達標</p>
                <p className={`text-xs ${lc?.text} opacity-70`}>獎金 NT${Number(currentLevel.bonus_amount).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 border border-gray-200">
              <Target className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-black text-sm text-gray-600">尚未達標</p>
                <p className="text-xs text-gray-400">繼續加油！</p>
              </div>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="font-black text-2xl text-yellow-700">{overallPct}%</p>
          <p className="text-xs text-yellow-600">綜合達成率</p>
        </div>
      </div>

      {/* 進度條 */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">0%</span>
          {rules.slice(0,3).map((r: any) => (
            <span key={r.id} className="text-muted-foreground">{r.achievement_pct}% {levelColors[r.level_color]?.icon}</span>
          ))}
        </div>
        <div className="bg-white rounded-full h-3 overflow-hidden border border-yellow-200">
          <div className={`${barColor} h-3 rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(overallPct, 100)}%` }} />
        </div>
        {nextLevel && (
          <p className="text-xs text-yellow-700 mt-1">
            再達成 {Math.max(0, Math.round(parseFloat(nextLevel.achievement_pct)) - overallPct)}% 可達{levelColors[nextLevel.level_color]?.icon}{nextLevel.level_name}，獎金 NT${Number(nextLevel.bonus_amount).toLocaleString()}
          </p>
        )}
      </div>

      {/* KPI 指標格 */}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(achievementData ?? {}).map(([metric, actual]) => {
          const met = (targetsMet ?? {})[metric];
          const target = (data.targets ?? {})[metric];
          return (
            <div key={metric} className={`rounded-xl p-3 border ${met ? "bg-white border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">{metricLabels[metric] ?? metric}</span>
                {met ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <p className={`font-black text-lg ${met ? "text-emerald-700" : "text-red-600"}`}>
                {typeof actual === "number" ? (actual as number).toFixed(metric === "avg_rating" ? 1 : 0) : String(actual)}
                {metricUnits[metric] ?? ""}
              </p>
              {target != null && (
                <p className="text-xs text-muted-foreground">目標：{target}{metricUnits[metric] ?? ""}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 歷史獎金 */}
      {bonuses.length > 0 && (
        <div>
          <p className="font-bold text-sm text-yellow-800 mb-2">歷史獎金記錄</p>
          <div className="space-y-2">
            {bonuses.slice(0,3).map((b: any) => {
              const blc = levelColors[b.level_name === "白金" ? "platinum" : b.level_name === "金牌" ? "gold" : b.level_name === "銀牌" ? "silver" : "bronze"];
              const statusLabel: Record<string,string> = { pending:"待審", approved:"已核准", paid:"已發放", rejected:"已拒絕" };
              return (
                <div key={b.id} className={`${blc?.bg} ${blc?.border} border rounded-xl px-3 py-2 flex items-center justify-between`}>
                  <div>
                    <span className="font-bold text-sm">{blc?.icon} {b.period_year}年{b.period_month}月</span>
                    <span className={`ml-2 text-xs ${blc?.text}`}>{b.level_name}</span>
                  </div>
                  <div className="text-right">
                    <p className={`font-black ${blc?.text}`}>NT${Number(b.total_bonus).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{statusLabel[b.status] ?? b.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
