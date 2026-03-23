import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy, Target, AlertTriangle, CheckCircle2, XCircle, TrendingUp,
  Star, Package, Clock, Award, ChevronDown, ChevronUp, Settings,
  Shield, DollarSign, Users, Building2, FileCheck, Gavel,
  BadgeCheck, Coins, ListChecks, Flame,
} from "lucide-react";

// ── 顏色對照 ──────────────────────────────────────────────────
const levelColors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  bronze:   { bg: "bg-orange-50",   text: "text-orange-700",  border: "border-orange-200",  icon: "🥉" },
  silver:   { bg: "bg-slate-50",    text: "text-slate-700",   border: "border-slate-300",   icon: "🥈" },
  gold:     { bg: "bg-yellow-50",   text: "text-yellow-700",  border: "border-yellow-300",  icon: "🥇" },
  platinum: { bg: "bg-purple-50",   text: "text-purple-700",  border: "border-purple-300",  icon: "💎" },
};

const metricLabels: Record<string, string> = {
  completion_rate:    "訂單完成率",
  avg_rating:         "平均評分",
  order_count:        "接單數量",
  on_time_rate:       "準時送達率",
  cash_on_time_rate:  "準時付款率",
  km_total:           "行駛里程",
  complaint_count:    "客訴件數",
};

const metricUnits: Record<string, string> = {
  completion_rate:   "%",
  avg_rating:        "星",
  order_count:       "件",
  on_time_rate:      "%",
  km_total:          "km",
  complaint_count:   "件",
};

const violationTypeLabels: Record<string, string> = {
  late_delivery:      "延遲送達",
  customer_complaint: "客戶投訴",
  no_show:            "未到場",
  damage:             "貨物損毀",
  forged_signature:   "偽造簽收",
  other:              "其他缺失",
};

const severityColors: Record<string, string> = {
  minor:    "bg-yellow-100 text-yellow-800",
  major:    "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

// ════════════════════════════════════════════════════════════════
// 主元件
// ════════════════════════════════════════════════════════════════
export default function PerformanceAuditTab() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab,   setTab]   = useState("drivers");

  return (
    <div className="space-y-4">
      {/* 頂部統計 */}
      <PerformanceStats />

      {/* 期間選擇 */}
      <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
        <TrendingUp className="w-5 h-5 text-blue-600" />
        <span className="font-bold text-sm">稽核期間</span>
        <select className="border rounded-lg px-2 py-1 text-sm bg-background"
          value={year} onChange={e => setYear(Number(e.target.value))}>
          {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y =>
            <option key={y} value={y}>{y}年</option>
          )}
        </select>
        <select className="border rounded-lg px-2 py-1 text-sm bg-background"
          value={month} onChange={e => setMonth(Number(e.target.value))}>
          {Array.from({length:12},(_,i)=>i+1).map(m =>
            <option key={m} value={m}>{m}月</option>
          )}
        </select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 gap-1 h-auto p-1">
          <TabsTrigger value="drivers"   className="text-xs py-2 gap-1 flex-col sm:flex-row"><Users className="w-3.5 h-3.5"/>司機稽核</TabsTrigger>
          <TabsTrigger value="fleets"    className="text-xs py-2 gap-1 flex-col sm:flex-row"><Building2 className="w-3.5 h-3.5"/>車隊稽核</TabsTrigger>
          <TabsTrigger value="bonuses"   className="text-xs py-2 gap-1 flex-col sm:flex-row"><Trophy className="w-3.5 h-3.5"/>獎金管理</TabsTrigger>
          <TabsTrigger value="violations" className="text-xs py-2 gap-1 flex-col sm:flex-row"><Shield className="w-3.5 h-3.5"/>違規記錄</TabsTrigger>
          <TabsTrigger value="settings"  className="text-xs py-2 gap-1 flex-col sm:flex-row"><Settings className="w-3.5 h-3.5"/>規則設定</TabsTrigger>
        </TabsList>

        <TabsContent value="drivers"   className="mt-4"><DriverAuditTab   year={year} month={month} /></TabsContent>
        <TabsContent value="fleets"    className="mt-4"><FleetAuditTab    year={year} month={month} /></TabsContent>
        <TabsContent value="bonuses"   className="mt-4"><BonusManageTab   year={year} month={month} /></TabsContent>
        <TabsContent value="violations" className="mt-4"><ViolationsTab   /></TabsContent>
        <TabsContent value="settings"  className="mt-4"><SettingsTab      /></TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 頂部總覽卡
// ────────────────────────────────────────────────────────────────
function PerformanceStats() {
  const { data: stats } = useQuery<any>({
    queryKey: ["perf-stats"],
    queryFn: () => fetch("/api/performance/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
  const cards = [
    { label: "待審獎金",   value: stats?.pending_bonuses  ?? 0, icon: <Coins className="w-5 h-5 text-yellow-600" />,  color: "text-yellow-700" },
    { label: "已核准獎金", value: stats?.approved_bonuses ?? 0, icon: <BadgeCheck className="w-5 h-5 text-green-600" />, color: "text-green-700" },
    { label: "本月核准金額",value: `NT$${Number(stats?.this_month_approved ?? 0).toLocaleString()}`, icon: <Award className="w-5 h-5 text-blue-600" />, color: "text-blue-700" },
    { label: "待處理違規", value: stats?.open_violations  ?? 0, icon: <AlertTriangle className="w-5 h-5 text-red-600" />,  color: "text-red-700" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c,i) => (
        <Card key={i} className="border bg-white">
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            {c.icon}
            <p className={`font-black text-xl ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 司機稽核
// ────────────────────────────────────────────────────────────────
function DriverAuditTab({ year, month }: { year: number; month: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["driver-audit", year, month],
    queryFn: () => fetch(`/api/performance/audit/drivers?year=${year}&month=${month}`).then(r => r.json()),
  });

  const approveMut = useMutation({
    mutationFn: (bonuses: any[]) => fetch("/api/performance/bonuses/approve-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, entity_type: "driver", bonuses }),
    }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: `✅ 已核准 ${d.created} 筆獎金`, description: `${year}年${month}月 司機達標獎金` });
      setCalcResult(null); setShowCalc(false);
      qc.invalidateQueries({ queryKey: ["perf-stats"] });
    },
  });

  const handleCalc = async () => {
    setCalcLoading(true);
    const r = await fetch("/api/performance/calculate-bonuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, entity_type: "driver" }),
    });
    const d = await r.json();
    setCalcResult(d);
    setCalcLoading(false);
    setShowCalc(true);
  };

  const drivers = data?.drivers ?? [];
  const targets = data?.targets ?? {};

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">載入中...</div>;

  return (
    <div className="space-y-4">
      {/* 操作列 */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={handleCalc} disabled={calcLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          {calcLoading ? "計算中..." : "試算本期獎金"}
        </button>
        <div className="text-sm text-muted-foreground self-center">{year}年{month}月 共 {drivers.length} 位司機</div>
      </div>

      {/* 獎金試算結果 */}
      {showCalc && calcResult && (
        <Card className="border-2 border-yellow-300 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-600" />
              獎金試算結果 — {calcResult.count} 位司機達標
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {calcResult.preview.length === 0 && (
              <p className="text-muted-foreground text-sm">本期無司機達標（可能接單量不足或目標設定較高）</p>
            )}
            {calcResult.preview.map((b: any) => {
              const lc = levelColors[b.level_color] ?? levelColors.bronze;
              return (
                <div key={b.driver_id} className={`${lc.bg} ${lc.border} border rounded-xl p-3 flex items-center justify-between`}>
                  <div>
                    <span className="font-bold">{lc.icon} {b.driver_name}</span>
                    <span className={`ml-2 text-xs ${lc.text} font-bold`}>{b.level_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">達成 {b.overallPct}%</span>
                  </div>
                  <span className={`font-black text-lg ${lc.text}`}>NT${b.total_bonus.toLocaleString()}</span>
                </div>
              );
            })}
            {calcResult.preview.length > 0 && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => approveMut.mutate(calcResult.preview)}
                  disabled={approveMut.isPending}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-60">
                  {approveMut.isPending ? "核准中..." : `核准全部 ${calcResult.preview.length} 筆獎金`}
                </button>
                <button onClick={() => setShowCalc(false)} className="border px-4 py-2 rounded-xl text-sm hover:bg-muted">取消</button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI 目標說明 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(targets).map(([metric, val]) => (
          <div key={metric} className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">{metricLabels[metric] ?? metric}</p>
            <p className="font-black text-blue-700">{String(val)}{metricUnits[metric] ?? ""}</p>
            <p className="text-[10px] text-blue-500">目標值</p>
          </div>
        ))}
      </div>

      {/* 司機列表 */}
      <div className="space-y-2">
        {drivers.map((d: any) => {
          const pct = d.overallPct;
          const color = pct >= 100 ? "text-emerald-700" : pct >= 80 ? "text-blue-700" : pct >= 60 ? "text-orange-600" : "text-red-600";
          const bgBar = pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-blue-500" : pct >= 60 ? "bg-orange-500" : "bg-red-500";
          const isOpen = expanded === d.id;

          return (
            <Card key={d.id} className="border">
              <div className="p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : d.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${pct >= 100 ? "bg-emerald-100 text-emerald-700" : pct >= 80 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {pct}%
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.vehicle_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{d.metCount}/{d.totalChecks} 達標</span>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
                {/* 進度條 */}
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div className={`${bgBar} h-2 rounded-full transition-all`} style={{ width: `${Math.min(pct,100)}%` }} />
                </div>
              </div>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(d.checks as Record<string, any>).map(([metric, check]) => (
                      <div key={metric} className={`rounded-xl p-3 border ${check.met ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{metricLabels[metric] ?? metric}</span>
                          {check.met ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        <p className={`font-black text-lg ${check.met ? "text-emerald-700" : "text-red-600"}`}>
                          {typeof check.actual === "number" ? check.actual.toFixed(metric === "avg_rating" ? 1 : 0) : check.actual}
                          {metricUnits[metric] ?? ""}
                        </p>
                        <p className="text-xs text-muted-foreground">目標：{check.target}{metricUnits[metric] ?? ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <ViolationDialog driverId={d.id} driverName={d.name} onCreated={() => qc.invalidateQueries({ queryKey: ["driver-audit"] })} />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {drivers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>本期無司機資料</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 車隊稽核
// ────────────────────────────────────────────────────────────────
function FleetAuditTab({ year, month }: { year: number; month: number }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["fleet-audit", year, month],
    queryFn: () => fetch(`/api/performance/audit/fleets?year=${year}&month=${month}`).then(r => r.json()),
  });

  const fleets = data?.fleets ?? [];
  const targets = data?.targets ?? {};

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">載入中...</div>;

  return (
    <div className="space-y-4">
      {/* KPI 目標 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(targets).map(([metric, val]) => (
          <div key={metric} className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
            <p className="text-xs text-muted-foreground">{metricLabels[metric] ?? metric}</p>
            <p className="font-black text-indigo-700">{String(val)}{metricUnits[metric] ?? ""}</p>
            <p className="text-[10px] text-indigo-400">車隊目標</p>
          </div>
        ))}
      </div>

      {/* 車隊列表 */}
      <div className="space-y-2">
        {fleets.map((f: any) => {
          const pct = f.overallPct;
          const bgBar = pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-blue-500" : pct >= 60 ? "bg-orange-500" : "bg-red-500";
          const isOpen = expanded === f.id;
          return (
            <Card key={f.id} className="border">
              <div className="p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : f.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${pct>=100 ? "bg-emerald-100 text-emerald-700" : pct>=80 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                      {pct}%
                    </div>
                    <div>
                      <p className="font-bold text-sm">{f.company_name}</p>
                      <div className="flex gap-2">
                        <p className="text-xs text-muted-foreground">聯絡：{f.contact_name}</p>
                        {f.risk_score != null && (
                          <Badge className={`text-[10px] ${f.risk_score<=30 ? "bg-emerald-100 text-emerald-800" : f.risk_score<=60 ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"}`}>
                            風險 {f.risk_score}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{f.metCount}/{f.totalChecks} 達標</span>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div className={`${bgBar} h-2 rounded-full`} style={{ width: `${Math.min(pct,100)}%` }} />
                </div>
              </div>

              {isOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(f.checks as Record<string, any>).map(([metric, check]) => (
                      <div key={metric} className={`rounded-xl p-3 border ${check.met ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{metricLabels[metric] ?? metric}</span>
                          {check.met ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        <p className={`font-black text-lg ${check.met ? "text-emerald-700" : "text-red-600"}`}>
                          {typeof check.actual === "number" ? check.actual.toFixed(1) : check.actual}
                          {metricUnits[metric] ?? ""}
                        </p>
                        <p className="text-xs text-muted-foreground">目標：{check.target}{metricUnits[metric] ?? ""}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {fleets.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>目前無已核准車隊</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 獎金管理
// ────────────────────────────────────────────────────────────────
function BonusManageTab({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: bonuses = [], isLoading } = useQuery<any[]>({
    queryKey: ["performance-bonuses", year, month, filter],
    queryFn: () => fetch(`/api/performance/bonuses?year=${year}&month=${month}${filter !== "all" ? `&type=${filter}` : ""}`).then(r => r.json()),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note?: string }) =>
      fetch(`/api/performance/bonuses/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      }).then(r => r.json()),
    onSuccess: (_, vars) => {
      toast({ title: vars.status === "paid" ? "✅ 已標記發放" : "狀態已更新" });
      qc.invalidateQueries({ queryKey: ["performance-bonuses"] });
      qc.invalidateQueries({ queryKey: ["perf-stats"] });
    },
  });

  const total = bonuses.reduce((s, b: any) => s + (b.total_bonus ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* 摘要 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border bg-white">
          <CardContent className="p-4 text-center">
            <p className="font-black text-2xl text-blue-700">{bonuses.length}</p>
            <p className="text-xs text-muted-foreground">獎金記錄</p>
          </CardContent>
        </Card>
        <Card className="border bg-white">
          <CardContent className="p-4 text-center">
            <p className="font-black text-2xl text-emerald-700">NT${total.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">合計金額</p>
          </CardContent>
        </Card>
        <Card className="border bg-white">
          <CardContent className="p-4 text-center">
            <p className="font-black text-2xl text-orange-700">{bonuses.filter((b: any) => b.status === "pending").length}</p>
            <p className="text-xs text-muted-foreground">待審核</p>
          </CardContent>
        </Card>
      </div>

      {/* 篩選 */}
      <div className="flex gap-2 flex-wrap">
        {["all","driver","fleet"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-lg text-sm font-bold border transition-colors ${filter===f ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted"}`}>
            {f === "all" ? "全部" : f === "driver" ? "司機" : "車隊"}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">載入中...</div>}

      {/* 獎金列表 */}
      <div className="space-y-2">
        {bonuses.map((b: any) => {
          const lc = levelColors[b.level_name === "白金" ? "platinum" : b.level_name === "金牌" ? "gold" : b.level_name === "銀牌" ? "silver" : "bronze"];
          const statusBadge: Record<string, string> = {
            pending:  "bg-yellow-100 text-yellow-800",
            approved: "bg-blue-100 text-blue-800",
            paid:     "bg-emerald-100 text-emerald-800",
            rejected: "bg-red-100 text-red-800",
          };
          return (
            <Card key={b.id} className={`border-l-4 ${lc?.border ?? "border-gray-200"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{b.driver_name ?? b.fleet_name}</span>
                      <Badge className={`text-[10px] ${statusBadge[b.status] ?? ""}`}>{b.status}</Badge>
                      {b.level_name && <Badge className={`text-[10px] ${lc?.bg} ${lc?.text}`}>{b.level_name}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.period_year}年{b.period_month}月 · 達成率 {b.overall_pct}%
                      {b.entity_type === "fleet" ? " · 車隊" : " · 司機"}
                    </p>
                    {b.note && <p className="text-xs text-muted-foreground mt-1">備注：{b.note}</p>}
                  </div>
                  <p className={`font-black text-xl ${lc?.text ?? "text-gray-700"} flex-shrink-0`}>
                    NT${Number(b.total_bonus).toLocaleString()}
                  </p>
                </div>
                {(b.status === "approved" || b.status === "pending") && (
                  <div className="flex gap-2 mt-3">
                    {b.status === "pending" && (
                      <button onClick={() => statusMut.mutate({ id: b.id, status: "approved" })}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700">
                        核准
                      </button>
                    )}
                    {b.status === "approved" && (
                      <button onClick={() => statusMut.mutate({ id: b.id, status: "paid" })}
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700">
                        標記已發放
                      </button>
                    )}
                    <button onClick={() => statusMut.mutate({ id: b.id, status: "rejected", note: "不符合資格" })}
                      className="border text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50">
                      拒絕
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && bonuses.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>本期尚無獎金記錄，請先至司機稽核頁面試算</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 違規記錄
// ────────────────────────────────────────────────────────────────
function ViolationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("open");

  const { data: violations = [], isLoading } = useQuery<any[]>({
    queryKey: ["audit-violations", statusFilter],
    queryFn: () => fetch(`/api/performance/violations?status=${statusFilter}`).then(r => r.json()),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/performance/violations/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolved_by: "admin" }),
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "✅ 違規狀態已更新" });
      qc.invalidateQueries({ queryKey: ["audit-violations"] });
      qc.invalidateQueries({ queryKey: ["perf-stats"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["open","appealing","resolved","waived"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${statusFilter===s ? "bg-red-600 text-white border-red-600" : "bg-background hover:bg-muted"}`}>
            {s === "open" ? "待處理" : s === "appealing" ? "申訴中" : s === "resolved" ? "已處理" : "已豁免"}
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">載入中...</div>}
      <div className="space-y-2">
        {violations.map((v: any) => (
          <Card key={v.id} className={`border-l-4 ${v.severity === "critical" ? "border-red-500" : v.severity === "major" ? "border-orange-400" : "border-yellow-300"}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{v.driver_name ?? v.fleet_name}</span>
                    <Badge className={`text-[10px] ${severityColors[v.severity]}`}>
                      {v.severity === "critical" ? "重大" : v.severity === "major" ? "重要" : "輕微"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{violationTypeLabels[v.violation_type] ?? v.violation_type}</span>
                    {v.order_no && <span className="text-xs text-muted-foreground">訂單#{v.order_no}</span>}
                  </div>
                  <p className="text-sm mt-1">{v.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(v.created_at).toLocaleDateString("zh-TW")}
                    {v.penalty_amount > 0 && ` · 罰款 NT$${v.penalty_amount.toLocaleString()}`}
                    {v.penalty_points > 0 && ` · 扣 ${v.penalty_points} 點`}
                  </p>
                </div>
              </div>
              {v.status === "open" && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => resolveMut.mutate({ id: v.id, status: "resolved" })}
                    className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700">
                    標記已處理
                  </button>
                  <button onClick={() => resolveMut.mutate({ id: v.id, status: "waived" })}
                    className="border px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-muted">
                    豁免
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && violations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>目前無{statusFilter === "open" ? "待處理" : ""}違規記錄</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// KPI目標 + 獎金規則設定
// ────────────────────────────────────────────────────────────────
function SettingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [settingType, setSettingType] = useState<"driver"|"fleet">("driver");
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editRule,   setEditRule]   = useState<any>(null);
  const [newTargetForm, setNewTargetForm] = useState({ metric: "completion_rate", target_value: "", description: "" });
  const [newRuleForm, setNewRuleForm] = useState({ rule_name: "", level_name: "", level_color: "bronze", achievement_pct: "80", bonus_amount: "1000" });
  const [showNewTarget, setShowNewTarget] = useState(false);
  const [showNewRule,   setShowNewRule]   = useState(false);

  const { data: targets = [] } = useQuery<any[]>({
    queryKey: ["perf-targets", settingType],
    queryFn: () => fetch(`/api/performance/targets?type=${settingType}`).then(r => r.json()),
  });
  const { data: rules = [] } = useQuery<any[]>({
    queryKey: ["bonus-rules", settingType],
    queryFn: () => fetch(`/api/performance/bonus-rules?type=${settingType}`).then(r => r.json()),
  });

  const updateTarget = async (id: number, updates: any) => {
    await fetch(`/api/performance/targets/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    toast({ title: "✅ 目標已更新" });
    qc.invalidateQueries({ queryKey: ["perf-targets"] });
    setEditTarget(null);
  };

  const createTarget = async () => {
    if (!newTargetForm.target_value) return;
    await fetch("/api/performance/targets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newTargetForm, target_type: settingType }),
    });
    toast({ title: "✅ 已新增KPI目標" });
    qc.invalidateQueries({ queryKey: ["perf-targets"] });
    setShowNewTarget(false);
    setNewTargetForm({ metric: "completion_rate", target_value: "", description: "" });
  };

  const updateRule = async (id: number, updates: any) => {
    await fetch(`/api/performance/bonus-rules/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    toast({ title: "✅ 獎金規則已更新" });
    qc.invalidateQueries({ queryKey: ["bonus-rules"] });
    setEditRule(null);
  };

  const createRule = async () => {
    if (!newRuleForm.rule_name || !newRuleForm.level_name) return;
    await fetch("/api/performance/bonus-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newRuleForm, target_type: settingType }),
    });
    toast({ title: "✅ 已新增獎金規則" });
    qc.invalidateQueries({ queryKey: ["bonus-rules"] });
    setShowNewRule(false);
  };

  return (
    <div className="space-y-5">
      {/* 切換類型 */}
      <div className="flex gap-2">
        {["driver","fleet"].map(t => (
          <button key={t} onClick={() => setSettingType(t as any)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${settingType===t ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted"}`}>
            {t === "driver" ? "司機" : "車隊"} 設定
          </button>
        ))}
      </div>

      {/* KPI 目標 */}
      <Card className="border">
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" /> KPI 目標設定
            </CardTitle>
            <button onClick={() => setShowNewTarget(t => !t)}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700">
              + 新增
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {showNewTarget && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <select className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
                value={newTargetForm.metric} onChange={e => setNewTargetForm(f => ({ ...f, metric: e.target.value }))}>
                {Object.entries(metricLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" placeholder="目標值" className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
                value={newTargetForm.target_value} onChange={e => setNewTargetForm(f => ({ ...f, target_value: e.target.value }))} />
              <input type="text" placeholder="說明（可選）" className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
                value={newTargetForm.description} onChange={e => setNewTargetForm(f => ({ ...f, description: e.target.value }))} />
              <div className="flex gap-2">
                <button onClick={createTarget} className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold">儲存</button>
                <button onClick={() => setShowNewTarget(false)} className="border px-3 py-1 rounded-lg text-xs">取消</button>
              </div>
            </div>
          )}
          {targets.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
              <div>
                <span className="font-bold text-sm">{metricLabels[t.metric] ?? t.metric}</span>
                {t.description && <span className="text-xs text-muted-foreground ml-2">{t.description}</span>}
              </div>
              {editTarget === t.id ? (
                <div className="flex items-center gap-2">
                  <input type="number" defaultValue={t.target_value} id={`target-${t.id}`}
                    className="w-20 border rounded px-2 py-1 text-sm bg-background" />
                  <button onClick={() => updateTarget(t.id, { target_value: (document.getElementById(`target-${t.id}`) as HTMLInputElement)?.value })}
                    className="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold">儲存</button>
                  <button onClick={() => setEditTarget(null)} className="text-xs border px-2 py-1 rounded">取消</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-black text-blue-700">{t.target_value}{metricUnits[t.metric] ?? ""}</span>
                  <button onClick={() => setEditTarget(t.id)} className="text-xs border px-2 py-1 rounded hover:bg-background">編輯</button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 獎金規則 */}
      <Card className="border">
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-600" /> 獎金規則設定
            </CardTitle>
            <button onClick={() => setShowNewRule(t => !t)}
              className="bg-yellow-500 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-yellow-600">
              + 新增
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {showNewRule && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
              <input type="text" placeholder="規則名稱" className="w-full border rounded-lg px-2 py-1.5 text-sm bg-background"
                value={newRuleForm.rule_name} onChange={e => setNewRuleForm(f => ({ ...f, rule_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="等級名稱（如銀牌）" className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                  value={newRuleForm.level_name} onChange={e => setNewRuleForm(f => ({ ...f, level_name: e.target.value }))} />
                <select className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                  value={newRuleForm.level_color} onChange={e => setNewRuleForm(f => ({ ...f, level_color: e.target.value }))}>
                  <option value="bronze">銅 🥉</option>
                  <option value="silver">銀 🥈</option>
                  <option value="gold">金 🥇</option>
                  <option value="platinum">白金 💎</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="達成率門檻 (%)" className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                  value={newRuleForm.achievement_pct} onChange={e => setNewRuleForm(f => ({ ...f, achievement_pct: e.target.value }))} />
                <input type="number" placeholder="獎金金額 (NT$)" className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                  value={newRuleForm.bonus_amount} onChange={e => setNewRuleForm(f => ({ ...f, bonus_amount: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={createRule} className="bg-yellow-600 text-white px-3 py-1 rounded-lg text-xs font-bold">儲存</button>
                <button onClick={() => setShowNewRule(false)} className="border px-3 py-1 rounded-lg text-xs">取消</button>
              </div>
            </div>
          )}
          {rules.map((r: any) => {
            const lc = levelColors[r.level_color] ?? levelColors.bronze;
            return (
              <div key={r.id} className={`flex items-center justify-between ${lc.bg} ${lc.border} border rounded-xl px-3 py-2`}>
                <div>
                  <span className={`font-bold text-sm ${lc.text}`}>{lc.icon} {r.level_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">達成 ≥{r.achievement_pct}%</span>
                  {r.require_all && <span className="text-xs text-muted-foreground ml-1">（全部達標）</span>}
                </div>
                {editRule === r.id ? (
                  <div className="flex items-center gap-2">
                    <input type="number" defaultValue={r.bonus_amount} id={`rule-${r.id}`}
                      className="w-24 border rounded px-2 py-1 text-sm bg-background" />
                    <button onClick={() => updateRule(r.id, { bonus_amount: (document.getElementById(`rule-${r.id}`) as HTMLInputElement)?.value })}
                      className="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold">儲存</button>
                    <button onClick={() => setEditRule(null)} className="text-xs border px-2 py-1 rounded">取消</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${lc.text}`}>NT${Number(r.bonus_amount).toLocaleString()}</span>
                    <button onClick={() => setEditRule(r.id)} className="text-xs border px-2 py-1 rounded bg-white/80 hover:bg-white">編輯</button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 違規登記 Dialog (inline)
// ────────────────────────────────────────────────────────────────
function ViolationDialog({ driverId, driverName, onCreated }: { driverId: number; driverName: string; onCreated: () => void }) {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ violation_type: "customer_complaint", severity: "minor", description: "", penalty_amount: "0" });

  const submit = async () => {
    if (!form.description) return;
    await fetch("/api/performance/violations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: "driver", driver_id: driverId, ...form }),
    });
    toast({ title: "✅ 違規記錄已登記" });
    setShow(false);
    onCreated();
  };

  return (
    <>
      <button onClick={() => setShow(t => !t)}
        className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" /> 登記違規
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm border-2 border-red-200">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-base text-red-700">登記違規 — {driverName}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-xs font-bold mb-1">違規類型</p>
                <select className="w-full border rounded-lg px-2 py-2 text-sm bg-background"
                  value={form.violation_type} onChange={e => setForm(f => ({ ...f, violation_type: e.target.value }))}>
                  {Object.entries(violationTypeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-bold mb-1">嚴重程度</p>
                <select className="w-full border rounded-lg px-2 py-2 text-sm bg-background"
                  value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  <option value="minor">輕微</option>
                  <option value="major">重要</option>
                  <option value="critical">重大</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-bold mb-1">說明 *</p>
                <textarea className="w-full border rounded-lg px-2 py-2 text-sm bg-background resize-none" rows={3}
                  placeholder="請描述違規情形..." value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs font-bold mb-1">罰款金額 (NT$)</p>
                <input type="number" className="w-full border rounded-lg px-2 py-2 text-sm bg-background"
                  value={form.penalty_amount} onChange={e => setForm(f => ({ ...f, penalty_amount: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button onClick={submit} className="flex-1 bg-red-600 text-white py-2 rounded-xl font-bold text-sm hover:bg-red-700">登記</button>
                <button onClick={() => setShow(false)} className="flex-1 border py-2 rounded-xl text-sm hover:bg-muted">取消</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
