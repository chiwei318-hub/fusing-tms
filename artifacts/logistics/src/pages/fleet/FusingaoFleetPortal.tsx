import { useState, useEffect, useCallback } from "react";
import {
  Truck, LogOut, RefreshCw, CheckCircle2, Clock, Package,
  DollarSign, ChevronDown, ChevronRight, Zap, Download,
  CheckSquare, Square, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const fapi = (path: string) => `${BASE_URL}/api${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface RouteItem {
  id: number; status: string; notes: string;
  completed_at: string | null; fleet_completed_at: string | null;
  driver_payment_status: string | null; created_at: string;
  fleet_grabbed_at: string | null;
  driver_name: string | null; vehicle_plate: string | null;
  shopee_rate: number | null; fleet_rate: number | null; service_type: string | null;
  routeId: string; dock: string | null; driverId: string | null;
  stations: number; prefix: string | null; stopList: string[];
}
interface MonthRow {
  month: string; month_label: string; route_count: string;
  completed_count: string; billed_count: string;
  fleet_payout: string; billed_amount: string;
}

type PortalTab = "available" | "mine" | "billing";

const fmt = (n: number | string) => `NT$ ${Math.round(Number(n)).toLocaleString()}`;

const prefixColor: Record<string, string> = {
  FN: "bg-blue-100 text-blue-700", FM: "bg-violet-100 text-violet-700",
  A3: "bg-cyan-100 text-cyan-700", NB: "bg-orange-100 text-orange-700",
  WB: "bg-indigo-100 text-indigo-700", WD: "bg-pink-100 text-pink-700",
};

export default function FusingaoFleetPortal() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fleetId = user?.fleetId ?? user?.id;

  const [tab, setTab]           = useState<PortalTab>("available");
  const [loading, setLoading]   = useState(false);
  const [grabbingId, setGrabbingId] = useState<number | null>(null);

  const [available, setAvailable] = useState<RouteItem[]>([]);
  const [mine, setMine]           = useState<RouteItem[]>([]);
  const [months, setMonths]       = useState<MonthRow[]>([]);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("");

  const load = useCallback(async () => {
    if (!fleetId) return;
    setLoading(true);
    try {
      const params = filterMonth ? `?month=${filterMonth}` : "";
      const [r1, r2, r3] = await Promise.all([
        fetch(fapi(`/fusingao/available${params}`)).then(x => x.json()),
        fetch(fapi(`/fusingao/fleets/${fleetId}/routes${params}`)).then(x => x.json()),
        fetch(fapi(`/fusingao/fleets/${fleetId}/monthly`)).then(x => x.json()),
      ]);
      if (r1.ok) setAvailable(r1.routes ?? []);
      if (r2.ok) setMine(r2.routes ?? []);
      if (r3.ok) setMonths(r3.months ?? []);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [fleetId, filterMonth]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => { logout(); setLocation("/login/fleet"); };

  const grab = async (routeId: number) => {
    if (grabbingId) return;
    setGrabbingId(routeId);
    try {
      const res = await fetch(fapi(`/fusingao/routes/${routeId}/grab`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "搶單成功！路線已加入我的任務" });
      await load();
      setTab("mine");
    } catch (err: any) {
      toast({ title: "搶單失敗", description: err.message, variant: "destructive" });
    } finally { setGrabbingId(null); }
  };

  const release = async (routeId: number) => {
    await fetch(fapi(`/fusingao/routes/${routeId}/grab`), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleetId }),
    });
    toast({ title: "已放棄路線" });
    await load();
  };

  const markComplete = async (routeId: number, done: boolean) => {
    await fetch(fapi(`/fusingao/routes/${routeId}/fleet-complete`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleetId, completed: done }),
    });
    await load();
    toast({ title: done ? "已標記完成" : "已取消完成" });
  };

  const exportMonthCSV = (m: MonthRow) => {
    const myRoutes = mine.filter(r => r.created_at?.startsWith(m.month));
    const lines = [
      "路線編號,服務,站點數,司機,完成狀態,金額",
      ...myRoutes.map(r =>
        `${r.routeId},${r.service_type ?? ""},${r.stations},${r.driver_name ?? r.driverId ?? ""},${r.fleet_completed_at ? "已完成" : "進行中"},${r.fleet_rate ?? r.shopee_rate ?? ""}`
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `車隊對帳_${m.month}.csv`; a.click();
  };

  // ── Month options
  const monthOptions = months.map(m => ({ value: m.month, label: m.month_label }));

  // ── Route card component
  const RouteCard = ({ r, showGrab }: { r: RouteItem; showGrab?: boolean }) => {
    const isOpen = expandedRoute === r.id;
    const isDone = !!r.fleet_completed_at || !!r.completed_at;
    return (
      <Card className={`overflow-hidden ${isDone ? "border-green-200" : ""}`}>
        <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
          onClick={() => setExpandedRoute(isOpen ? null : r.id)}>
          {!showGrab && (
            <button className="shrink-0" onClick={e => { e.stopPropagation(); markComplete(r.id, !isDone); }}>
              {isDone ? <CheckSquare className="h-5 w-5 text-green-500" /> : <Square className="h-5 w-5 text-gray-300" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-gray-800 text-sm">{r.routeId}</span>
              {r.prefix && <Badge className={`text-xs ${prefixColor[r.prefix] ?? "bg-gray-100"}`}>{r.prefix}</Badge>}
              {r.service_type && <span className="text-xs text-gray-500">{r.service_type}</span>}
              {!showGrab && (isDone
                ? <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1 inline"/>已完成</Badge>
                : <Badge className="bg-amber-100 text-amber-700 text-xs"><Clock className="h-3 w-3 mr-1 inline"/>進行中</Badge>)}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {r.stations} 站 {r.dock && r.dock !== "—" ? `・碼頭 ${r.dock}` : ""}
              {(r.driver_name || (r.driverId && r.driverId !== "—")) && ` ・ 司機：${r.driver_name ?? "工號"+r.driverId}`}
              {r.vehicle_plate && ` (${r.vehicle_plate})`}
              {" ・ "}{new Date(r.created_at).toLocaleDateString("zh-TW")}
            </p>
          </div>
          <div className="text-right shrink-0">
            {showGrab ? (
              <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                disabled={!!grabbingId}
                onClick={e => { e.stopPropagation(); grab(r.id); }}>
                <Zap className="h-3.5 w-3.5 mr-1" />{grabbingId === r.id ? "搶中…" : "搶單"}
              </Button>
            ) : (
              <div>
                <p className="font-bold text-orange-600 text-sm">{r.fleet_rate ? fmt(r.fleet_rate) : r.shopee_rate ? fmt(r.shopee_rate) : "—"}</p>
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-auto mt-1" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 ml-auto mt-1" />}
              </div>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="border-t bg-gray-50 px-4 pb-3 pt-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600">配送站點（{r.stations} 站）</p>
              <div className="flex gap-2">
                {!showGrab && !isDone && (
                  <Button size="sm" className="h-6 text-xs bg-green-600 hover:bg-green-700"
                    onClick={() => markComplete(r.id, true)}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />標記完成
                  </Button>
                )}
                {!showGrab && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-red-400 hover:text-red-600"
                    onClick={() => release(r.id)}>放棄此路線</Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {r.stopList.map((stop, i) => (
                <div key={i} className="flex items-center gap-1 text-xs text-gray-600 bg-white rounded px-2 py-1 border">
                  <span className="text-gray-300 font-mono text-xs w-4 shrink-0">{i+1}.</span>
                  {stop}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const totalMine = mine.length;
  const doneMine  = mine.filter(r => !!r.fleet_completed_at || !!r.completed_at).length;
  const totalPay  = mine.reduce((s, r) => s + Number(r.fleet_rate ?? r.shopee_rate ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-orange-700 shadow">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 rounded-lg p-2"><Truck className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-white font-bold">{user?.name}</h1>
              <p className="text-orange-200 text-xs">福興高合作車隊 · 富詠運輸蝦皮路線</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-orange-200 hover:text-white hover:bg-white/10 h-8"
            onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />登出
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Package className="h-4 w-4 text-orange-500"/>, label:"我的路線", val: `${totalMine} 趟` },
            { icon: <CheckCircle2 className="h-4 w-4 text-green-500"/>, label:"已完成", val: `${doneMine}/${totalMine}` },
            { icon: <DollarSign className="h-4 w-4 text-blue-500"/>, label:"合計金額", val: fmt(totalPay) },
          ].map(k => (
            <Card key={k.label}><CardContent className="p-3">
              {k.icon}
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
              <p className="font-bold text-gray-800">{k.val}</p>
            </CardContent></Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b bg-white rounded-t-lg px-3 pt-2">
          {([
            { id:"available", label:`🔥 可搶路線 (${available.length})` },
            { id:"mine",      label:`📦 我的任務 (${mine.length})` },
            { id:"billing",   label:"💰 月結帳單" },
          ] as { id: PortalTab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${t.id===tab?"border-orange-500 text-orange-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-gray-400" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Month filter */}
        {(tab === "mine" || tab === "available") && (
          <div className="flex gap-2 items-center">
            <Select value={filterMonth || "all"} onValueChange={v => setFilterMonth(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="全部月份" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部月份</SelectItem>
                {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* ─── Available routes ─── */}
        {tab === "available" && (
          <div className="space-y-2">
            {available.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                目前沒有可搶的路線
              </div>
            ) : (
              available.map(r => <RouteCard key={r.id} r={r} showGrab />)
            )}
          </div>
        )}

        {/* ─── My routes ─── */}
        {tab === "mine" && (
          <div className="space-y-2">
            {mine.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                尚未搶單，請到「可搶路線」選擇
              </div>
            ) : (
              mine.map(r => <RouteCard key={r.id} r={r} />)
            )}
          </div>
        )}

        {/* ─── Billing ─── */}
        {tab === "billing" && (
          <div className="space-y-3">
            {months.map(m => {
              const isOpen = expandedMonth === m.month;
              const pct = Number(m.fleet_payout) > 0
                ? Math.round(Number(m.billed_amount) / Number(m.fleet_payout) * 100) : 0;
              return (
                <Card key={m.month} className="overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedMonth(isOpen ? null : m.month)}>
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <div>
                        <h3 className="font-bold text-gray-800">{m.month_label}</h3>
                        <p className="text-xs text-gray-400">{m.route_count} 趟 ・完成 {m.completed_count}/{m.route_count} ・已對帳 {m.billed_count}/{m.route_count}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl text-orange-600">{fmt(m.fleet_payout)}</p>
                      <div className="flex items-center gap-2 justify-end mt-1">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{pct}% 已收</span>
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t">
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-0 border-b bg-orange-50 text-center">
                        {[
                          { label:"應收金額",  val: fmt(m.fleet_payout), cls:"text-orange-700 font-bold" },
                          { label:"已對帳",    val: fmt(m.billed_amount), cls:"text-emerald-700" },
                          { label:"未對帳",    val: fmt(Number(m.fleet_payout)-Number(m.billed_amount)), cls:"text-amber-700" },
                        ].map(k => (
                          <div key={k.label} className="py-2 border-r last:border-0">
                            <p className="text-xs text-gray-500">{k.label}</p>
                            <p className={`text-sm font-semibold ${k.cls}`}>{k.val}</p>
                          </div>
                        ))}
                      </div>
                      {/* Route table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-gray-50 text-gray-500">
                              <th className="text-left p-2">路線</th>
                              <th className="text-right p-2">站點</th>
                              <th className="text-center p-2">完成</th>
                              <th className="text-right p-2">金額</th>
                              <th className="text-center p-2">對帳</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mine.filter(r => r.created_at?.startsWith(m.month)).map(r => (
                              <tr key={r.id} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-mono">
                                  {r.routeId}
                                  {r.prefix && <Badge className={`ml-1 text-xs ${prefixColor[r.prefix] ?? ""}`}>{r.prefix}</Badge>}
                                </td>
                                <td className="p-2 text-right">{r.stations}</td>
                                <td className="p-2 text-center">
                                  {r.fleet_completed_at || r.completed_at
                                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                    : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                                </td>
                                <td className="p-2 text-right font-mono text-orange-600">{r.fleet_rate ? fmt(r.fleet_rate) : "—"}</td>
                                <td className="p-2 text-center">
                                  {r.driver_payment_status === "paid"
                                    ? <CheckSquare className="h-4 w-4 text-emerald-500 mx-auto" />
                                    : <Square className="h-4 w-4 text-gray-300 mx-auto" />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex p-3 border-t bg-gray-50">
                        <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => exportMonthCSV(m)}>
                          <Download className="h-3.5 w-3.5 mr-1" />下載對帳單
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
            {months.length === 0 && <div className="text-center py-8 text-gray-400">尚無對帳記錄</div>}
          </div>
        )}
      </div>
    </div>
  );
}
