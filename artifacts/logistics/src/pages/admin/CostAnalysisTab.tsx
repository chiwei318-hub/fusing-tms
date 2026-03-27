import { useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  TrendingUp, Fuel, RefreshCw, Search, Download,
  DollarSign, Truck, MapPin, User, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
interface CostSummary {
  period: string; trips: number; revenue: number; total_km: number;
  cost: { fuel: number; toll: number; depreciation: number; labor: number; overhead: number; wait: number; surcharge: number; total: number };
  gross_profit: number; margin: number; per_km_profit: number; per_trip_profit: number;
  rates: Record<string, number>;
}
interface PerCustomer {
  customer_name: string; customer_phone: string; trips: number;
  revenue: number; avg_fee: number; total_km: number;
  total_cost: number; gross_profit: number; margin: number; per_km_profit: number | null;
  unpaid_orders: number; unpaid_amount: number;
  fuel: number; toll: number; labor: number; depr: number;
}
interface PerRoute {
  route: string; trips: number; revenue: number; avg_fee: number;
  total_km: number; avg_km: number;
  fuel: number; toll: number; depreciation: number; labor: number; overhead: number;
  wait_cost: number; surcharge_cost: number;
  total_cost: number; gross_profit: number; margin: number; per_km_profit: number | null;
}
interface PerOrder {
  id: number; created_at: string; customer_name: string; driver_name: string;
  vehicle_type: string; region: string; distance_km: number;
  revenue: number; fuel: number; toll: number; depr: number; labor: number;
  overhead: number; wait: number; surcharge: number; totalCost: number;
  gross_profit: number; margin: number; per_km_profit: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString("zh-TW");
const fmtM = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;
const pct  = (n: number) => `${n}%`;
const COLORS = ["#2563eb","#f59e0b","#10b981","#7c3aed","#ef4444","#06b6d4","#f97316"];

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function MarginBadge({ v }: { v: number }) {
  const color = v >= 30 ? "bg-emerald-100 text-emerald-700"
              : v >= 15 ? "bg-amber-100 text-amber-700"
              : v >= 0  ? "bg-orange-100 text-orange-700"
              : "bg-red-100 text-red-700";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${color}`}>{v}%</span>;
}

// ── Summary Section ───────────────────────────────────────────────────────
function SummarySection() {
  const [data, setData]       = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod]   = useState<"today"|"week"|"month">("month");

  const load = useCallback(async (p = period) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/cost-analysis/summary?period=${p}`));
      setData(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [period]);

  useState(() => { load(); });

  const costItems = data ? [
    { name: "油費",    value: data.cost.fuel,         color: "#f97316" },
    { name: "過路費",  value: data.cost.toll,         color: "#eab308" },
    { name: "折舊",    value: data.cost.depreciation, color: "#8b5cf6" },
    { name: "人事",    value: data.cost.labor,        color: "#3b82f6" },
    { name: "管銷",    value: data.cost.overhead,     color: "#6b7280" },
    { name: "等候費",  value: data.cost.wait,         color: "#ef4444" },
    { name: "附加費",  value: data.cost.surcharge,    color: "#ec4899" },
  ] : [];

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex gap-2">
        {(["today","week","month"] as const).map(p => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"}
            onClick={() => { setPeriod(p); load(p); }} className="text-xs h-8">
            {p === "today" ? "今日" : p === "week" ? "本週" : "本月"}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => load(period)} className="ml-auto gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {!data ? (
        <div className="text-center py-12 text-muted-foreground">載入中…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-blue-100 bg-blue-50">
              <CardContent className="p-4">
                <p className="text-xs text-blue-600">總收入</p>
                <p className="text-xl font-bold text-blue-700">{fmtM(data.revenue)}</p>
                <p className="text-xs text-blue-500">{data.trips} 趟次</p>
              </CardContent>
            </Card>
            <Card className="border-red-100 bg-red-50">
              <CardContent className="p-4">
                <p className="text-xs text-red-600">總成本</p>
                <p className="text-xl font-bold text-red-700">{fmtM(data.cost.total)}</p>
                <p className="text-xs text-red-500">含油路人折</p>
              </CardContent>
            </Card>
            <Card className={data.gross_profit >= 0 ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"}>
              <CardContent className="p-4">
                <p className={`text-xs ${data.gross_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>毛利</p>
                <p className={`text-xl font-bold ${data.gross_profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtM(data.gross_profit)}
                </p>
                <p className={`text-xs ${data.gross_profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  毛利率 {data.margin}%
                </p>
              </CardContent>
            </Card>
            <Card className="border-violet-100 bg-violet-50">
              <CardContent className="p-4">
                <p className="text-xs text-violet-600">每公里毛利</p>
                <p className="text-xl font-bold text-violet-700">NT$ {data.per_km_profit}</p>
                <p className="text-xs text-violet-500">每趟 NT$ {data.per_trip_profit}</p>
              </CardContent>
            </Card>
          </div>

          {/* Cost breakdown chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">成本結構</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={costItems.filter(c => c.value > 0)} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {costItems.map((c, i) => <Cell key={c.name} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtM(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">成本明細</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {costItems.filter(c => c.value > 0).map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span className="w-14 text-xs text-muted-foreground">{c.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{
                          width: `${Math.min(100, c.value / data.cost.total * 100)}%`,
                          backgroundColor: c.color,
                        }} />
                      </div>
                      <span className="text-xs font-mono w-24 text-right">{fmtM(c.value)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {Math.round(c.value / data.cost.total * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t flex justify-between text-xs">
                  <span className="font-semibold">總成本</span>
                  <span className="font-bold">{fmtM(data.cost.total)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rates note */}
          <p className="text-xs text-muted-foreground text-center">
            成本採用動態估算：油費 NT${data.rates.fuel_base}+{data.rates.fuel_per_km}/km，
            過路費 NT${data.rates.toll_base}+{data.rates.toll_per_km}/km，
            人事 {(data.rates.labor_pct * 100).toFixed(0)}% 趟費，
            管銷 {(data.rates.overhead_pct * 100).toFixed(0)}% 趟費
          </p>
        </>
      )}
    </div>
  );
}

// ── Per Customer Section ──────────────────────────────────────────────────
function PerCustomerSection() {
  const [data, setData]     = useState<PerCustomer[]>([]);
  const [loading, setLoad]  = useState(false);
  const [month, setMonth]   = useState(thisMonth());
  const [sortBy, setSortBy] = useState<"revenue"|"gross_profit"|"margin">("gross_profit");

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const res = await fetch(apiUrl(`/api/cost-analysis/per-customer?date_from=${month}-01&limit=20`));
      setData(await res.json());
    } catch { /* ignore */ } finally { setLoad(false); }
  }, [month]);
  useState(() => { load(); });

  const sorted = [...data].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));

  const downloadCSV = () => {
    window.open(apiUrl(`/api/settlement/export/cost-analysis?month=${month}&type=customer`), "_blank");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">月份</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36 text-xs h-8" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">排序依據</Label>
          <div className="flex gap-1">
            {([["gross_profit","毛利"],["revenue","營收"],["margin","毛利率"]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant={sortBy === k ? "default" : "outline"}
                onClick={() => setSortBy(k)} className="text-xs h-8">{l}</Button>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={load} disabled={loading} className="gap-1.5 ml-auto">
          <Search className="w-3.5 h-3.5" /> 查詢
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> 匯出 CSV
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          {loading ? "載入中…" : "本月無資料"}
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sorted.slice(0, 10)} margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="customer_name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtM(v)} />
                  <Bar dataKey="gross_profit" name="毛利" radius={[3,3,0,0]}>
                    {sorted.slice(0, 10).map((d, i) => (
                      <Cell key={i} fill={d.gross_profit >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {["客戶","趟次","總收入","總成本","毛利","毛利率","每公里毛利","未收款"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, i) => (
                  <tr key={c.customer_name} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                    <td className="px-3 py-2 font-medium max-w-[100px] truncate">{c.customer_name}</td>
                    <td className="px-3 py-2 text-center">{c.trips}</td>
                    <td className="px-3 py-2">{fmtM(c.revenue)}</td>
                    <td className="px-3 py-2 text-red-600">{fmtM(c.total_cost)}</td>
                    <td className={`px-3 py-2 font-semibold ${c.gross_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtM(c.gross_profit)}
                    </td>
                    <td className="px-3 py-2"><MarginBadge v={c.margin} /></td>
                    <td className="px-3 py-2">
                      {c.per_km_profit != null ? `NT$ ${c.per_km_profit}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.unpaid_amount > 0
                        ? <span className="text-orange-600">{fmtM(c.unpaid_amount)}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Per Route Section ─────────────────────────────────────────────────────
function PerRouteSection() {
  const [data, setData]    = useState<PerRoute[]>([]);
  const [loading, setLoad] = useState(false);
  const [month, setMonth]  = useState(thisMonth());

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const res = await fetch(apiUrl(`/api/cost-analysis/per-route?date_from=${month}-01`));
      setData(await res.json());
    } catch { /* ignore */ } finally { setLoad(false); }
  }, [month]);
  useState(() => { load(); });

  const downloadCSV = () => {
    window.open(apiUrl(`/api/settlement/export/cost-analysis?month=${month}&type=route`), "_blank");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">月份</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36 text-xs h-8" />
        </div>
        <Button size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <Search className="w-3.5 h-3.5" /> 查詢
        </Button>
        <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> 匯出 CSV
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">{loading ? "載入中…" : "本月無資料"}</div>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data} margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="route" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtM(v)} />
                  <Bar dataKey="revenue"      name="收入" fill="#3b82f6" radius={[3,3,0,0]} />
                  <Bar dataKey="total_cost"   name="成本" fill="#ef4444" radius={[3,3,0,0]} />
                  <Bar dataKey="gross_profit" name="毛利" fill="#10b981" radius={[3,3,0,0]} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {["路線/地區","趟次","均距km","收入","油費","過路","人事","折舊","總成本","毛利","毛利率","km毛利"].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.route} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                    <td className="px-2 py-2 font-medium">{r.route}</td>
                    <td className="px-2 py-2 text-center">{r.trips}</td>
                    <td className="px-2 py-2 text-center">{r.avg_km.toFixed(1)}</td>
                    <td className="px-2 py-2">{fmtM(r.revenue)}</td>
                    <td className="px-2 py-2 text-orange-600">{fmtM(r.fuel)}</td>
                    <td className="px-2 py-2 text-yellow-600">{fmtM(r.toll)}</td>
                    <td className="px-2 py-2 text-blue-600">{fmtM(r.labor)}</td>
                    <td className="px-2 py-2 text-violet-600">{fmtM(r.depreciation)}</td>
                    <td className="px-2 py-2 text-red-600">{fmtM(r.total_cost)}</td>
                    <td className={`px-2 py-2 font-semibold ${r.gross_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {fmtM(r.gross_profit)}
                    </td>
                    <td className="px-2 py-2"><MarginBadge v={r.margin} /></td>
                    <td className="px-2 py-2">
                      {r.per_km_profit != null ? `NT$${r.per_km_profit}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Per Order Section ─────────────────────────────────────────────────────
function PerOrderSection() {
  const [data, setData]       = useState<PerOrder[]>([]);
  const [loading, setLoad]    = useState(false);
  const [customer, setCustomer] = useState("");
  const [dateFrom, setDateFrom] = useState(`${thisMonth()}-01`);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const params = new URLSearchParams({ limit: "50", date_from: dateFrom });
      if (customer) params.append("customer_name", customer);
      const res = await fetch(apiUrl(`/api/cost-analysis/per-order?${params}`));
      const j = await res.json();
      setData(Array.isArray(j.rows) ? j.rows : []);
    } catch { /* ignore */ } finally { setLoad(false); }
  }, [customer, dateFrom]);
  useState(() => { load(); });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">起始日期</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-xs h-8" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">客戶名稱</Label>
          <Input placeholder="搜尋…" value={customer} onChange={e => setCustomer(e.target.value)} className="w-32 text-xs h-8" />
        </div>
        <Button size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <Search className="w-3.5 h-3.5" /> 查詢
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">{loading ? "載入中…" : "無資料"}</div>
      ) : (
        <div className="rounded-xl border overflow-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["訂單","客戶","司機","地區","公里","收入","油費","過路","人事","折舊","毛利","毛利率","km毛利"].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((o, i) => (
                <tr key={o.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-2 py-2 font-mono">#{o.id}</td>
                  <td className="px-2 py-2 max-w-[80px] truncate">{o.customer_name ?? "—"}</td>
                  <td className="px-2 py-2 max-w-[70px] truncate">{o.driver_name ?? "—"}</td>
                  <td className="px-2 py-2">{o.region ?? "—"}</td>
                  <td className="px-2 py-2 text-center">{o.distance_km > 0 ? o.distance_km.toFixed(1) : "—"}</td>
                  <td className="px-2 py-2">{fmtM(o.revenue)}</td>
                  <td className="px-2 py-2 text-orange-600">{fmtM(o.fuel)}</td>
                  <td className="px-2 py-2 text-yellow-600">{fmtM(o.toll)}</td>
                  <td className="px-2 py-2 text-blue-600">{fmtM(o.labor)}</td>
                  <td className="px-2 py-2 text-violet-600">{fmtM(o.depr)}</td>
                  <td className={`px-2 py-2 font-semibold ${o.gross_profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtM(o.gross_profit)}
                  </td>
                  <td className="px-2 py-2"><MarginBadge v={o.margin} /></td>
                  <td className="px-2 py-2">
                    {o.per_km_profit != null ? `NT$${o.per_km_profit}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function CostAnalysisTab() {
  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="text-lg font-bold">成本與毛利分析</h2>
        <p className="text-xs text-muted-foreground">
          油費 · 過路費 · 人事 · 折舊 · 等候費，精算每單 / 每路線 / 每客戶毛利
        </p>
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="w-full">
          <TabsTrigger value="summary"   className="flex-1 gap-1 text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> 整體概覽
          </TabsTrigger>
          <TabsTrigger value="customer"  className="flex-1 gap-1 text-xs">
            <User className="w-3.5 h-3.5" /> 每客戶
          </TabsTrigger>
          <TabsTrigger value="route"     className="flex-1 gap-1 text-xs">
            <MapPin className="w-3.5 h-3.5" /> 每路線
          </TabsTrigger>
          <TabsTrigger value="order"     className="flex-1 gap-1 text-xs">
            <Truck className="w-3.5 h-3.5" /> 每單明細
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary"  className="mt-4"><SummarySection /></TabsContent>
        <TabsContent value="customer" className="mt-4"><PerCustomerSection /></TabsContent>
        <TabsContent value="route"    className="mt-4"><PerRouteSection /></TabsContent>
        <TabsContent value="order"    className="mt-4"><PerOrderSection /></TabsContent>
      </Tabs>
    </div>
  );
}
