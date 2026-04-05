import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Truck, Users, AlertTriangle,
  RefreshCw, Edit2, Save, X, ChevronDown, ChevronRight, Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintSaveBar } from "@/components/PrintSaveBar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OverviewTotals {
  route_count: number; shopee_income: number; driver_cost: number;
  gross_profit: number; total_penalty: number; penalty_count: number;
  net_profit: number; margin_pct: number;
}
interface PrefixRow { prefix: string; description: string; service_type: string; route_od: string; route_count: number; shopee_income: number; driver_cost: number; gross_profit: number; }
interface VehicleRow { shopee_id: string; driver_name: string | null; vehicle_plate: string | null; fleet_name: string | null; route_count: number; shopee_income: number; driver_cost: number; gross_profit: number; net_profit: number; margin_pct: number; penalty_deduction: number; paid_routes: number; routes: RouteDetail[]; }
interface RouteDetail { id: number; route_id: string; prefix: string; service_type: string; shopee_rate: number; driver_rate: number; profit: number; payment_status: string; created_at: string; }
interface FleetRow { fleet_name: string; driver_count: number; route_count: number; shopee_income: number; driver_cost: number; gross_profit: number; net_profit: number; margin_pct: number; penalty_deduction: number; }
interface PrefixRate { id: number; prefix: string; description: string; service_type: string; route_od: string; rate_per_trip: number; driver_pay_rate: number; pay_notes: string | null; }
interface ShopeeDriver { shopee_id: string; name: string | null; vehicle_plate: string | null; vehicle_type: string; fleet_name: string | null; route_count: string; }

type ViewTab = "overview" | "vehicle" | "fleet" | "settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number | string) => `NT$ ${Math.round(Number(n)).toLocaleString()}`;
const pctBadge = (p: number) => {
  const cls = p >= 20 ? "bg-green-100 text-green-700" : p >= 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  return <Badge className={`${cls} text-xs font-mono`}>{p.toFixed(1)}%</Badge>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PnLTab() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewTab>("overview");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<{ totals: OverviewTotals; byPrefix: PrefixRow[] } | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [fleets, setFleets] = useState<FleetRow[]>([]);
  const [prefixRates, setPrefixRates] = useState<PrefixRate[]>([]);
  const [shopeeDrivers, setShopeeDrivers] = useState<ShopeeDriver[]>([]);

  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [editingPrefix, setEditingPrefix] = useState<string | null>(null);
  const [editPrefixData, setEditPrefixData] = useState<Partial<PrefixRate>>({});
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editDriverData, setEditDriverData] = useState<Partial<ShopeeDriver>>({});

  const params = () => { const p = new URLSearchParams(); if (from) p.set("from", from); if (to) p.set("to", to); return p.toString(); };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(apiUrl(`/pnl/overview?${params()}`)).then(r => r.json()),
        fetch(apiUrl(`/pnl/by-vehicle?${params()}`)).then(r => r.json()),
        fetch(apiUrl(`/pnl/by-fleet?${params()}`)).then(r => r.json()),
        fetch(apiUrl("/driver-earnings/prefix-rates")).then(r => r.json()),
        fetch(apiUrl("/driver-earnings/shopee-drivers")).then(r => r.json()),
      ]);
      if (r1.ok) setOverview(r1);
      if (r2.ok) setVehicles(r2.vehicles ?? []);
      if (r3.ok) setFleets(r3.fleets ?? []);
      if (r4.ok) setPrefixRates(r4.items ?? []);
      if (r5.ok) setShopeeDrivers(r5.items ?? []);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [from, to]); // eslint-disable-line

  useEffect(() => { loadAll(); }, [loadAll]);

  const savePrefixRate = async (prefix: string) => {
    await fetch(apiUrl(`/pnl/prefix-rates/${encodeURIComponent(prefix)}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editPrefixData),
    });
    setEditingPrefix(null);
    await loadAll();
    toast({ title: `${prefix} 費率已儲存` });
  };

  const saveDriver = async (sid: string) => {
    await fetch(apiUrl(`/driver-earnings/shopee-drivers/${encodeURIComponent(sid)}`), {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDriverData),
    });
    setEditingDriver(null);
    await loadAll();
    toast({ title: `工號 ${sid} 已更新` });
  };

  const driverPayRateSet = prefixRates.some(p => p.driver_pay_rate > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Not-configured warning */}
      {!driverPayRateSet && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>司機費用尚未設定——請到「費率設定」分頁填入各路線的<b>司機支付費率</b>，才能看到正確盈虧數字。</span>
          <Button size="sm" variant="outline" className="h-6 ml-auto shrink-0 text-xs" onClick={() => setView("settings")}>前往設定</Button>
        </div>
      )}

      {/* ── View tabs */}
      <div className="flex gap-1 border-b">
        {(["overview","vehicle","fleet","settings"] as ViewTab[]).map(t => {
          const labels: Record<ViewTab,string> = { overview:"平台總覽", vehicle:"依車輛", fleet:"依車隊", settings:"費率設定" };
          return (
            <button key={t} onClick={() => setView(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${t===view ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* ── Date filter */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-sm text-gray-500">日期：</span>
        <Input type="date" className="h-8 w-36 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
        <span className="text-gray-400 text-sm">至</span>
        <Input type="date" className="h-8 w-36 text-sm" value={to} onChange={e => setTo(e.target.value)} />
        <Button variant="outline" size="sm" className="h-8" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />試算
        </Button>
        <PrintSaveBar title="損益分析" subtitle={`${from} ～ ${to}`} />
      </div>

      {/* ═══════════════════════════════ OVERVIEW ═══════════════════════════ */}
      {view === "overview" && overview && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"蝦皮收入",   value: fmt(overview.totals.shopee_income), sub: `${overview.totals.route_count} 趟`, icon:<DollarSign className="h-5 w-5 text-blue-500"/>, color:"text-blue-700" },
              { label:"司機費用",   value: fmt(overview.totals.driver_cost),   sub: driverPayRateSet ? "" : "⚠ 未設定",  icon:<Truck className="h-5 w-5 text-orange-500"/>, color:"text-orange-700" },
              { label:"蝦皮罰款",   value: fmt(overview.totals.total_penalty), sub: `${overview.totals.penalty_count} 件`, icon:<AlertTriangle className="h-5 w-5 text-red-400"/>, color:"text-red-600" },
              { label:"淨利潤",     value: fmt(overview.totals.net_profit),    sub: `利潤率 ${overview.totals.margin_pct.toFixed(1)}%`, icon:<TrendingUp className="h-5 w-5 text-green-500"/>, color: overview.totals.net_profit >= 0 ? "text-green-700" : "text-red-600" },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    {k.icon}
                    {k.label === "淨利潤" && pctBadge(overview.totals.margin_pct)}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{k.label}</p>
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                  {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* By-prefix breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">依路線類型拆解</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 bg-gray-50">
                    <th className="text-left p-2">前綴</th>
                    <th className="text-left p-2 hidden sm:table-cell">服務模式</th>
                    <th className="text-right p-2">趟數</th>
                    <th className="text-right p-2">蝦皮收入</th>
                    <th className="text-right p-2">司機費用</th>
                    <th className="text-right p-2">毛利</th>
                    <th className="text-right p-2 hidden md:table-cell">利潤率</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.byPrefix.map(r => {
                    const margin = r.shopee_income > 0 ? (r.gross_profit / r.shopee_income * 100) : 0;
                    return (
                      <tr key={r.prefix} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-mono font-bold text-blue-700">{r.prefix}</td>
                        <td className="p-2 text-xs text-gray-500 hidden sm:table-cell">{r.service_type}</td>
                        <td className="p-2 text-right">{r.route_count}</td>
                        <td className="p-2 text-right font-mono text-blue-700">{fmt(r.shopee_income)}</td>
                        <td className="p-2 text-right font-mono text-orange-600">{r.driver_cost > 0 ? fmt(r.driver_cost) : <span className="text-gray-300">未設定</span>}</td>
                        <td className="p-2 text-right font-mono font-semibold">{r.driver_cost > 0 ? <span className={r.gross_profit >= 0 ? "text-green-700" : "text-red-600"}>{fmt(r.gross_profit)}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.driver_cost > 0 ? pctBadge(margin) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold">
                    <td colSpan={2} className="p-2 text-right text-sm">合計</td>
                    <td className="p-2 text-right">{overview.totals.route_count}</td>
                    <td className="p-2 text-right font-mono text-blue-700">{fmt(overview.totals.shopee_income)}</td>
                    <td className="p-2 text-right font-mono text-orange-600">{fmt(overview.totals.driver_cost)}</td>
                    <td className="p-2 text-right font-mono">
                      <span className={overview.totals.net_profit >= 0 ? "text-green-700" : "text-red-600"}>{fmt(overview.totals.net_profit)}</span>
                    </td>
                    <td className="p-2 text-right hidden md:table-cell">{pctBadge(overview.totals.margin_pct)}</td>
                  </tr>
                </tfoot>
              </table>
              {overview.totals.total_penalty > 0 && (
                <p className="text-xs text-red-500 mt-2 text-right">
                  * 淨利潤已扣除蝦皮罰款 {fmt(overview.totals.total_penalty)}（{overview.totals.penalty_count} 件）
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ═══════════════════════════════ BY VEHICLE ══════════════════════════ */}
      {view === "vehicle" && (
        <div className="space-y-2">
          {vehicles.map(v => {
            const isOpen = expandedVehicle === v.shopee_id;
            return (
              <Card key={v.shopee_id} className="overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedVehicle(isOpen ? null : v.shopee_id)}>
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">工號 {v.shopee_id}</span>
                        {v.driver_name && <Badge variant="outline" className="text-xs">{v.driver_name}</Badge>}
                        {v.vehicle_plate
                          ? <Badge className="bg-slate-100 text-slate-700 text-xs font-mono"><Truck className="h-3 w-3 mr-1"/>{v.vehicle_plate}</Badge>
                          : <span className="text-xs text-gray-300">車號未設定</span>}
                        {v.fleet_name && <Badge className="bg-purple-100 text-purple-700 text-xs">{v.fleet_name}</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {v.route_count} 趟 ・收入 {fmt(v.shopee_income)} ・費用 {v.driver_cost > 0 ? fmt(v.driver_cost) : "未設定"}
                        {v.penalty_deduction > 0 && <span className="text-red-500 ml-1">・罰款 {fmt(v.penalty_deduction)}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${v.net_profit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(v.net_profit)}</p>
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      {pctBadge(v.margin_pct)}
                      <span className="text-xs text-gray-400">利潤率</span>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t bg-gray-50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-gray-100 text-gray-500">
                          <th className="text-left p-2">路線</th>
                          <th className="text-left p-2 hidden sm:table-cell">服務</th>
                          <th className="text-right p-2">蝦皮收</th>
                          <th className="text-right p-2">司機付</th>
                          <th className="text-right p-2">毛利</th>
                          <th className="text-left p-2">付款</th>
                          <th className="text-left p-2 hidden md:table-cell">日期</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(v.routes ?? []).map(r => (
                          <tr key={r.id} className="border-b hover:bg-white">
                            <td className="p-2 font-mono">{r.route_id}</td>
                            <td className="p-2 text-gray-500 hidden sm:table-cell">{r.service_type ?? "—"}</td>
                            <td className="p-2 text-right text-blue-700">{r.shopee_rate ? fmt(r.shopee_rate) : "—"}</td>
                            <td className="p-2 text-right text-orange-600">{r.driver_rate > 0 ? fmt(r.driver_rate) : <span className="text-gray-300">—</span>}</td>
                            <td className="p-2 text-right font-medium">
                              {r.driver_rate > 0 ? <span className={r.profit >= 0 ? "text-green-700" : "text-red-600"}>{fmt(r.profit)}</span> : "—"}
                            </td>
                            <td className="p-2">{r.payment_status === "paid" ? <Badge className="bg-green-100 text-green-700 text-xs">已付</Badge> : <Badge variant="outline" className="text-xs text-gray-400">未付</Badge>}</td>
                            <td className="p-2 text-gray-400 hidden md:table-cell">{r.created_at ? new Date(r.created_at).toLocaleDateString("zh-TW") : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-blue-50 font-semibold text-sm">
                          <td colSpan={2} className="p-2 text-right">小計</td>
                          <td className="p-2 text-right text-blue-700">{fmt(v.shopee_income)}</td>
                          <td className="p-2 text-right text-orange-600">{fmt(v.driver_cost)}</td>
                          <td className="p-2 text-right">
                            <span className={v.net_profit >= 0 ? "text-green-700" : "text-red-600"}>{fmt(v.net_profit)}</span>
                          </td>
                          <td colSpan={2}>{v.penalty_deduction > 0 && <span className="text-xs text-red-500">罰款 {fmt(v.penalty_deduction)}</span>}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
          {vehicles.length === 0 && <p className="text-center py-8 text-gray-400">尚無資料</p>}
        </div>
      )}

      {/* ═══════════════════════════════ BY FLEET ════════════════════════════ */}
      {view === "fleet" && (
        <Card>
          <CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 bg-gray-50">
                  <th className="text-left p-2">車隊</th>
                  <th className="text-right p-2 hidden sm:table-cell">司機數</th>
                  <th className="text-right p-2">趟數</th>
                  <th className="text-right p-2">蝦皮收入</th>
                  <th className="text-right p-2">司機費用</th>
                  <th className="text-right p-2 hidden sm:table-cell">罰款</th>
                  <th className="text-right p-2">淨利潤</th>
                  <th className="text-right p-2">利潤率</th>
                </tr>
              </thead>
              <tbody>
                {fleets.map(f => (
                  <tr key={f.fleet_name} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-medium">
                      <Badge className="bg-purple-100 text-purple-700 text-xs">{f.fleet_name}</Badge>
                    </td>
                    <td className="p-2 text-right text-gray-500 hidden sm:table-cell">{f.driver_count}</td>
                    <td className="p-2 text-right">{f.route_count}</td>
                    <td className="p-2 text-right font-mono text-blue-700">{fmt(f.shopee_income)}</td>
                    <td className="p-2 text-right font-mono text-orange-600">{f.driver_cost > 0 ? fmt(f.driver_cost) : <span className="text-gray-300">—</span>}</td>
                    <td className="p-2 text-right text-red-500 hidden sm:table-cell">{f.penalty_deduction > 0 ? fmt(f.penalty_deduction) : "—"}</td>
                    <td className="p-2 text-right font-bold">
                      <span className={f.net_profit >= 0 ? "text-green-700" : "text-red-600"}>{fmt(f.net_profit)}</span>
                    </td>
                    <td className="p-2 text-right">{pctBadge(f.margin_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">
              * 車隊分組請到「費率設定 → 司機設定」中填入車隊名稱
            </p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════ SETTINGS ════════════════════════════ */}
      {view === "settings" && (
        <div className="space-y-4">
          {/* Prefix rate settings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> 路線費率設定（蝦皮收入 vs 司機費用）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 bg-gray-50">
                    <th className="text-left p-2">前綴</th>
                    <th className="text-left p-2 hidden sm:table-cell">說明</th>
                    <th className="text-right p-2 text-blue-700">蝦皮收/趟</th>
                    <th className="text-right p-2 text-orange-600">司機付/趟</th>
                    <th className="text-right p-2 text-green-700">毛利/趟</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {prefixRates.map(pr => (
                    <tr key={pr.prefix} className="border-b hover:bg-gray-50">
                      {editingPrefix === pr.prefix ? (
                        <>
                          <td className="p-2 font-mono font-bold text-blue-700">{pr.prefix}</td>
                          <td className="p-2 hidden sm:table-cell">
                            <Input className="h-7 text-xs" value={editPrefixData.description ?? ""} onChange={e => setEditPrefixData(p => ({ ...p, description: e.target.value }))} />
                          </td>
                          <td className="p-2">
                            <Input type="number" className="h-7 text-xs text-right w-24" value={editPrefixData.rate_per_trip ?? 0} onChange={e => setEditPrefixData(p => ({ ...p, rate_per_trip: Number(e.target.value) }))} />
                          </td>
                          <td className="p-2">
                            <Input type="number" className="h-7 text-xs text-right w-24" placeholder="填入司機費用" value={editPrefixData.driver_pay_rate ?? 0} onChange={e => setEditPrefixData(p => ({ ...p, driver_pay_rate: Number(e.target.value) }))} />
                          </td>
                          <td className="p-2 text-right text-xs text-green-700 font-mono">
                            {((editPrefixData.rate_per_trip ?? 0) - (editPrefixData.driver_pay_rate ?? 0)).toLocaleString()}
                          </td>
                          <td className="p-2 flex gap-1">
                            <Button size="sm" className="h-6 px-2" onClick={() => savePrefixRate(pr.prefix)}><Save className="h-3 w-3" /></Button>
                            <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => setEditingPrefix(null)}><X className="h-3 w-3" /></Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 font-mono font-bold text-blue-700">{pr.prefix}</td>
                          <td className="p-2 text-xs text-gray-500 hidden sm:table-cell">{pr.description}</td>
                          <td className="p-2 text-right font-mono text-blue-700">{pr.rate_per_trip.toLocaleString()}</td>
                          <td className="p-2 text-right font-mono text-orange-600">
                            {pr.driver_pay_rate > 0 ? pr.driver_pay_rate.toLocaleString() : <span className="text-red-400 text-xs font-normal">⚠ 未設定</span>}
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-green-700">
                            {pr.driver_pay_rate > 0 ? (pr.rate_per_trip - pr.driver_pay_rate).toLocaleString() : "—"}
                          </td>
                          <td className="p-2">
                            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { setEditingPrefix(pr.prefix); setEditPrefixData(pr); }}><Edit2 className="h-3 w-3" /></Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Driver setup */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" /> 司機資料設定（工號 / 車號 / 車隊）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 bg-gray-50">
                    <th className="text-left p-2">工號</th>
                    <th className="text-left p-2">姓名</th>
                    <th className="text-left p-2">車號</th>
                    <th className="text-left p-2 hidden sm:table-cell">車隊</th>
                    <th className="text-right p-2">跑單</th>
                    <th className="p-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {shopeeDrivers.map(sd => (
                    <tr key={sd.shopee_id} className="border-b hover:bg-gray-50">
                      {editingDriver === sd.shopee_id ? (
                        <>
                          <td className="p-2 font-mono font-bold">{sd.shopee_id}</td>
                          <td className="p-2"><Input className="h-7 text-xs" placeholder="姓名" value={editDriverData.name ?? ""} onChange={e => setEditDriverData(p => ({ ...p, name: e.target.value }))} /></td>
                          <td className="p-2"><Input className="h-7 text-xs" placeholder="ABC-1234" value={editDriverData.vehicle_plate ?? ""} onChange={e => setEditDriverData(p => ({ ...p, vehicle_plate: e.target.value }))} /></td>
                          <td className="p-2 hidden sm:table-cell"><Input className="h-7 text-xs" placeholder="車隊名稱" value={editDriverData.fleet_name ?? ""} onChange={e => setEditDriverData(p => ({ ...p, fleet_name: e.target.value }))} /></td>
                          <td className="p-2 text-right text-gray-400">{sd.route_count}</td>
                          <td className="p-2 flex gap-1">
                            <Button size="sm" className="h-6 px-2" onClick={() => saveDriver(sd.shopee_id)}><Save className="h-3 w-3" /></Button>
                            <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => setEditingDriver(null)}><X className="h-3 w-3" /></Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 font-mono font-bold text-blue-700">{sd.shopee_id}</td>
                          <td className="p-2 text-gray-700">{sd.name || <span className="text-gray-300 text-xs">未設定</span>}</td>
                          <td className="p-2">{sd.vehicle_plate ? <Badge className="bg-slate-100 text-slate-700 text-xs font-mono">{sd.vehicle_plate}</Badge> : <span className="text-gray-300 text-xs">未設定</span>}</td>
                          <td className="p-2 hidden sm:table-cell">{sd.fleet_name ? <Badge className="bg-purple-100 text-purple-700 text-xs">{sd.fleet_name}</Badge> : <span className="text-gray-300 text-xs">未分配</span>}</td>
                          <td className="p-2 text-right">{sd.route_count} 趟</td>
                          <td className="p-2"><Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { setEditingDriver(sd.shopee_id); setEditDriverData(sd); }}><Edit2 className="h-3 w-3" /></Button></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
