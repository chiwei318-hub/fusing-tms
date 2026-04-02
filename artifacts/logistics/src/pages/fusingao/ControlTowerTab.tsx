import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, AlertCircle, CheckCircle2, Clock, Zap,
  TrendingUp, TrendingDown, Truck, RefreshCw, ChevronRight,
  Users, Package, XCircle, ArrowRight, Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPI {
  total: string; completed: string; in_progress: string;
  unassigned: string; overdue: string;
}
interface ExceptionRoute {
  id: number; route_id: string; stations: number; prefix: string | null;
  fusingao_fleet_id: number | null; fleet_name: string | null;
  created_at: string; fleet_completed_at: string | null; completed_at: string | null;
  service_type: string | null; status: "unassigned" | "overdue" | "warning" | "done";
}
interface FleetPerf {
  id: number; fleet_name: string; commission_rate: string; is_active: boolean;
  total_routes: string; grabbed: string; completed: string;
  overdue_count: string; completion_rate: string | null; last_activity: string | null;
}
interface UnassignedRoute {
  id: number; route_id: string; stations: number; prefix: string | null;
  service_type: string | null; created_at: string; shopee_rate: string | null;
}

const prefixColor: Record<string, string> = {
  FN: "bg-blue-100 text-blue-700", FM: "bg-violet-100 text-violet-700",
  A3: "bg-cyan-100 text-cyan-700", NB: "bg-orange-100 text-orange-700",
  WB: "bg-indigo-100 text-indigo-700", WD: "bg-pink-100 text-pink-700",
};

const statusConfig = {
  unassigned: { label: "未分配", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: XCircle },
  overdue:    { label: "已逾時", color: "bg-red-100 text-red-700 border-red-200",  dot: "bg-red-500", icon: AlertTriangle },
  warning:    { label: "接近截止", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400", icon: AlertCircle },
  done:       { label: "已完成", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", icon: CheckCircle2 },
};

function fmt(n: number | string) { return `NT$ ${Math.round(Number(n)).toLocaleString()}`; }
function age(dt: string) {
  const h = (Date.now() - new Date(dt).getTime()) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}分鐘前`;
  if (h < 24) return `${Math.round(h)}小時前`;
  return `${Math.round(h / 24)}天前`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ControlTowerTab() {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(false);
  const [kpi, setKpi]           = useState<KPI | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRoute[]>([]);
  const [fleetPerf, setFleetPerf]   = useState<FleetPerf[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedRoute[]>([]);
  const [fleets, setFleets]         = useState<{ id: number; fleet_name: string }[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ct, fl] = await Promise.all([
        fetch(apiUrl("/fusingao/control-tower")).then(r => r.json()),
        fetch(apiUrl("/fusingao/fleets")).then(r => r.json()),
      ]);
      if (ct.ok) {
        setKpi(ct.kpi);
        setExceptions(ct.exceptions ?? []);
        setFleetPerf(ct.fleet_performance ?? []);
        setUnassigned(ct.unassigned_routes ?? []);
      }
      if (fl.ok) setFleets(fl.fleets ?? []);
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const assignFleet = async (routeId: number, fleetId: number, fleetName: string) => {
    setAssigningId(routeId);
    try {
      await fetch(apiUrl(`/fusingao/routes/${routeId}/grab`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
      });
      toast({ title: `已分配給 ${fleetName}` });
      await load();
    } catch { toast({ title: "分配失敗", variant: "destructive" }); }
    finally { setAssigningId(null); }
  };

  const completionPct = kpi ? Math.round(Number(kpi.completed) / Math.max(Number(kpi.total), 1) * 100) : 0;
  const exceptionCount = Number(kpi?.overdue ?? 0) + Number(kpi?.unassigned ?? 0);

  return (
    <div className="space-y-5">
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">調度控制中心</h2>
          <p className="text-xs text-gray-400">最後更新：{lastRefresh.toLocaleTimeString("zh-TW")}・每 60 秒自動刷新</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新
        </Button>
      </div>

      {/* ── Today's progress bar ───────────────────────────────────────────── */}
      {kpi && (
        <Card className="border-0 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-slate-300 text-xs">近 30 天整體進度</p>
                <p className="text-2xl font-black">{completionPct}%<span className="text-sm font-normal text-slate-300 ml-1">完成率</span></p>
              </div>
              <div className="text-right">
                {exceptionCount > 0 ? (
                  <div className="flex items-center gap-1.5 bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-300 font-bold text-sm">{exceptionCount} 件待處理</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <span className="text-green-300 font-bold text-sm">全部正常</span>
                  </div>
                )}
              </div>
            </div>
            <div className="w-full bg-slate-600 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${completionPct >= 80 ? "bg-green-400" : completionPct >= 50 ? "bg-amber-400" : "bg-orange-500"}`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              {[
                { label: "總路線",   val: kpi.total,       icon: Package,     cls: "text-slate-200" },
                { label: "已完成",   val: kpi.completed,   icon: CheckCircle2, cls: "text-green-300" },
                { label: "進行中",   val: kpi.in_progress, icon: Activity,     cls: "text-blue-300" },
                { label: "未分配",   val: kpi.unassigned,  icon: AlertTriangle, cls: Number(kpi.unassigned) > 0 ? "text-red-300" : "text-slate-400" },
              ].map(k => (
                <div key={k.label} className="text-center">
                  <k.icon className={`h-4 w-4 mx-auto mb-0.5 ${k.cls}`} />
                  <p className={`text-xl font-black ${k.cls}`}>{k.val}</p>
                  <p className="text-xs text-slate-400">{k.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Exception panel ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                例外事件
                {exceptionCount > 0 && (
                  <Badge className="bg-red-500 text-white text-xs px-1.5">{exceptionCount}</Badge>
                )}
              </span>
              <span className="text-xs font-normal text-gray-400">須立即處理</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {exceptions.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">目前無例外事件，狀況良好！</span>
              </div>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {exceptions.map(e => {
                  const sc = statusConfig[e.status] ?? statusConfig.warning;
                  const Icon = sc.icon;
                  return (
                    <div key={e.id} className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50`}>
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sc.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-xs text-gray-800">{e.route_id}</span>
                          {e.prefix && <Badge className={`text-xs px-1 py-0 ${prefixColor[e.prefix] ?? "bg-gray-100"}`}>{e.prefix}</Badge>}
                          <Badge className={`text-xs px-1.5 py-0 border ${sc.color}`}>
                            <Icon className="h-2.5 w-2.5 mr-0.5 inline" />{sc.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {e.stations} 站 ・{age(e.created_at)}
                          {e.fleet_name && ` ・ ${e.fleet_name}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Fleet performance ranking ────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />車隊效能排名
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {fleetPerf.length === 0 ? (
              <div className="px-4 py-6 text-gray-400 text-sm text-center">尚無車隊資料</div>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {fleetPerf.map((f, i) => {
                  const rate = Number(f.completion_rate ?? 0);
                  const isTop = i === 0 && Number(f.total_routes) > 0;
                  return (
                    <div key={f.id} className="px-4 py-2.5 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-50 text-orange-600" : "bg-gray-50 text-gray-400"
                        }`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{f.fleet_name}</span>
                            {isTop && <Badge className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0">最佳</Badge>}
                            {Number(f.overdue_count) > 0 && (
                              <Badge className="text-xs bg-red-100 text-red-600 px-1.5 py-0">{f.overdue_count} 逾時</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold w-9 text-right ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                              {f.total_routes === "0" ? "—" : `${rate}%`}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">{f.completed}/{f.total_routes} 趟</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Unassigned routes with auto fleet recommendation ──────────────── */}
      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                待分配路線
                <Badge className="bg-orange-500 text-white text-xs px-1.5">{unassigned.length}</Badge>
              </span>
              <span className="text-xs font-normal text-gray-400">一鍵推薦最適車隊</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {unassigned.map(r => {
                const topFleets = fleetPerf
                  .filter(f => f.is_active && Number(f.total_routes) >= 0)
                  .slice(0, 3);
                return (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-gray-800">{r.route_id}</span>
                          {r.prefix && <Badge className={`text-xs ${prefixColor[r.prefix] ?? "bg-gray-100"}`}>{r.prefix}</Badge>}
                          {r.service_type && <span className="text-xs text-gray-400">{r.service_type}</span>}
                          {r.shopee_rate && <span className="text-xs font-semibold text-orange-600">{fmt(r.shopee_rate)}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{r.stations} 站 ・建立 {age(r.created_at)}</p>
                        {/* Recommended fleet buttons */}
                        {topFleets.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-xs text-gray-400">推薦：</span>
                            {topFleets.map(f => (
                              <button
                                key={f.id}
                                disabled={assigningId === r.id}
                                onClick={() => assignFleet(r.id, f.id, f.fleet_name)}
                                className="inline-flex items-center gap-1 text-xs bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-full px-2.5 py-0.5 transition-colors disabled:opacity-50">
                                <Truck className="h-3 w-3" />
                                {f.fleet_name}
                                {f.completion_rate && <span className="text-orange-400">{Number(f.completion_rate).toFixed(0)}%</span>}
                                <ArrowRight className="h-2.5 w-2.5" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Fleet load overview ──────────────────────────────────────────────── */}
      {fleetPerf.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />車隊負載概況
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {fleetPerf.map(f => {
                const rate = Number(f.completion_rate ?? 0);
                const active = Number(f.in_progress ?? 0);
                return (
                  <div key={f.id} className="border rounded-lg p-3 hover:border-orange-200 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700 truncate">{f.fleet_name}</span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ml-1 ${f.is_active ? "bg-green-400" : "bg-gray-300"}`} />
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                      <div
                        className={`h-full rounded-full ${rate >= 80 ? "bg-green-400" : rate >= 50 ? "bg-amber-400" : Number(f.total_routes) === 0 ? "bg-gray-200" : "bg-red-400"}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>{f.completed}/{f.total_routes} 趟</span>
                      {Number(f.overdue_count) > 0
                        ? <span className="text-red-500 font-medium">{f.overdue_count} 逾時</span>
                        : <span className="text-green-500">{rate >= 80 ? "優" : rate >= 50 ? "良" : Number(f.total_routes) === 0 ? "待接" : "差"}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
