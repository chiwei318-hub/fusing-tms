/**
 * FinanceReportsTab.tsx
 * 財務報表：應收帳齡 / 司機抽成 / 毛利分析
 */
import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Download, RefreshCw, BarChart2,
  TrendingUp, Users, DollarSign, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

const API = import.meta.env.VITE_API_BASE_URL ?? "";
function apiFetch(path: string) {
  const token = localStorage.getItem("auth-jwt") ?? "";
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function fmtAmt(n: number) {
  if (!n) return "—";
  return `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

function ageBadge(days: number) {
  if (days <= 30)  return <Badge className="bg-green-100 text-green-700">0–30天</Badge>;
  if (days <= 60)  return <Badge className="bg-yellow-100 text-yellow-700">31–60天</Badge>;
  if (days <= 90)  return <Badge className="bg-orange-100 text-orange-700">61–90天</Badge>;
  return <Badge className="bg-red-100 text-red-700">90天以上</Badge>;
}

// ── 應收帳齡 ─────────────────────────────────────────────────────────────────
function ARAgingPanel() {
  const [data, setData] = useState<{ rows: any[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/reports/ar-aging");
      setData(await r.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sum = data?.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800">應收帳款帳齡分析</h3>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          重新整理
        </Button>
      </div>

      {/* 彙總 KPI */}
      {sum && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "合計未收", value: sum.total,          color: "text-gray-800" },
            { label: "0–30 天",  value: sum.bucket_0_30,    color: "text-green-600" },
            { label: "31–60 天", value: sum.bucket_31_60,   color: "text-yellow-600" },
            { label: "61–90 天", value: sum.bucket_61_90,   color: "text-orange-600" },
            { label: "90+ 天",   value: sum.bucket_91_plus, color: "text-red-600" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-base font-bold ${color}`}>{fmtAmt(Number(value))}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 長條圖 */}
      {data && (
        <Card>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.rows.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="entity_name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `NT$ ${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="bucket_0_30"    name="0–30天"  fill="#22c55e" stackId="a" />
                <Bar dataKey="bucket_31_60"   name="31–60天" fill="#eab308" stackId="a" />
                <Bar dataKey="bucket_61_90"   name="61–90天" fill="#f97316" stackId="a" />
                <Bar dataKey="bucket_91_plus" name="90+天"   fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 明細列表 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {["客戶 / 企業","代號","帳單類型","筆數","0–30天","31–60天","61–90天","90+天","合計未收","最老帳齡"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.entity_name}</td>
                    <td className="px-3 py-2 text-gray-400">{r.account_code}</td>
                    <td className="px-3 py-2">{r.billing_type === "monthly" ? "月結" : "現結"}</td>
                    <td className="px-3 py-2">{r.invoice_count}</td>
                    <td className="px-3 py-2 text-green-600">{fmtAmt(Number(r.bucket_0_30))}</td>
                    <td className="px-3 py-2 text-yellow-600">{fmtAmt(Number(r.bucket_31_60))}</td>
                    <td className="px-3 py-2 text-orange-600">{fmtAmt(Number(r.bucket_61_90))}</td>
                    <td className="px-3 py-2 text-red-600">{fmtAmt(Number(r.bucket_91_plus))}</td>
                    <td className="px-3 py-2 font-semibold">{fmtAmt(Number(r.total_outstanding))}</td>
                    <td className="px-3 py-2">{ageBadge(Number(r.max_age_days ?? 0))}</td>
                  </tr>
                ))}
                {(!data?.rows?.length) && (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">目前無未收帳款</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 司機抽成報表 ──────────────────────────────────────────────────────────────
function DriverCommissionPanel() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData]   = useState<{ rows: any[]; totals: any; year: number; month: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/reports/driver-commission?year=${year}&month=${month}`);
      setData(await r.json());
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;

  function driverTypeLabel(t: string) {
    if (t === "franchise") return "加盟";
    if (t === "outsource") return "外包";
    return "自僱";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-gray-800 flex-1">司機抽成報表</h3>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024,2025,2026].map(y => <SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading?"animate-spin":""}`}/> 查詢
        </Button>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "趟次", value: t.trips, fmt: (v: number) => `${v} 趟`, icon: <Users className="w-4 h-4 text-blue-500" /> },
            { label: "總收入", value: t.revenue, fmt: fmtAmt, icon: <DollarSign className="w-4 h-4 text-green-500" /> },
            { label: "抽成合計", value: t.commission, fmt: fmtAmt, icon: <TrendingUp className="w-4 h-4 text-orange-500" /> },
            { label: "平台淨收", value: t.platform_net, fmt: fmtAmt, icon: <BarChart2 className="w-4 h-4 text-indigo-500" /> },
          ].map(({ label, value, fmt, icon }) => (
            <Card key={label}>
              <CardContent className="p-3 flex items-center gap-3">
                {icon}
                <div>
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className="text-base font-bold">{fmt(Number(value ?? 0))}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.rows.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="driver_name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `NT$ ${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="total_revenue"    name="訂單收入" fill="#3b82f6" />
                <Bar dataKey="commission_amount" name="抽成金額" fill="#f97316" />
                <Bar dataKey="platform_net"      name="平台淨收" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {["司機姓名","抽成模式","費率","趟次","訂單收入","抽成金額","有效費率","平台淨收"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.driver_name}</td>
                    <td className="px-3 py-2">{driverTypeLabel(r.driver_type)}</td>
                    <td className="px-3 py-2">{Number(r.commission_rate ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-2">{r.trip_count}</td>
                    <td className="px-3 py-2">{fmtAmt(Number(r.total_revenue))}</td>
                    <td className="px-3 py-2 text-orange-600 font-medium">{fmtAmt(Number(r.commission_amount))}</td>
                    <td className="px-3 py-2">{Number(r.effective_rate_pct ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-green-600 font-medium">{fmtAmt(Number(r.platform_net))}</td>
                  </tr>
                ))}
                {(!data?.rows?.length) && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">本期無已完成訂單</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 毛利報表 ──────────────────────────────────────────────────────────────────
function GrossMarginPanel() {
  const [months, setMonths] = useState(6);
  const [data, setData]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/reports/gross-margin?months=${months}`);
      setData(await r.json());
    } finally { setLoading(false); }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  const chartData = [...data].reverse().map((r: any) => ({
    month:           r.month,
    gross_revenue:   Number(r.gross_revenue ?? 0),
    driver_cost:     Number(r.driver_cost ?? 0),
    gross_profit:    Number(r.gross_profit ?? 0),
    margin_pct:      Number(r.gross_margin_pct ?? 0),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-gray-800 flex-1">毛利報表（月度）</h3>
        <Select value={String(months)} onValueChange={v => setMonths(Number(v))}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[3,6,9,12].map(m => <SelectItem key={m} value={String(m)}>近{m}個月</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading?"animate-spin":""}`}/> 重整
        </Button>
      </div>

      {chartData.length > 0 && (
        <>
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-gray-600">月度營收 vs. 毛利</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any, name: string) => [`NT$ ${Number(v).toLocaleString()}`, name]} />
                  <Legend />
                  <Bar dataKey="gross_revenue" name="總收入"   fill="#3b82f6" />
                  <Bar dataKey="driver_cost"   name="司機成本" fill="#f97316" />
                  <Bar dataKey="gross_profit"  name="毛利"    fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm text-gray-600">毛利率趨勢</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis unit="%" domain={[0,100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Line dataKey="margin_pct" name="毛利率" stroke="#6366f1" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  {["月份","訂單數","總收入","司機成本","加盟主成本","毛利","毛利率","企業訂單","散客訂單"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.month} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.month}</td>
                    <td className="px-3 py-2">{r.order_count}</td>
                    <td className="px-3 py-2">{fmtAmt(Number(r.gross_revenue))}</td>
                    <td className="px-3 py-2 text-orange-600">{fmtAmt(Number(r.driver_cost))}</td>
                    <td className="px-3 py-2 text-purple-600">{fmtAmt(Number(r.franchise_cost))}</td>
                    <td className="px-3 py-2 font-semibold text-green-600">{fmtAmt(Number(r.gross_profit))}</td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold ${Number(r.gross_margin_pct)>=30?"text-green-600":Number(r.gross_margin_pct)>=15?"text-yellow-600":"text-red-500"}`}>
                        {Number(r.gross_margin_pct ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.enterprise_orders}</td>
                    <td className="px-3 py-2">{r.retail_orders}</td>
                  </tr>
                ))}
                {!data.length && (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">無已完成訂單資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 主元件 ───────────────────────────────────────────────────────────────────
export default function FinanceReportsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">財務報表</h2>
        <p className="text-sm text-gray-500 mt-0.5">應收帳齡 · 司機抽成 · 毛利分析</p>
      </div>

      <Tabs defaultValue="aging">
        <TabsList className="h-8">
          <TabsTrigger value="aging"      className="text-xs h-7"><Clock className="w-3.5 h-3.5 mr-1" />應收帳齡</TabsTrigger>
          <TabsTrigger value="commission" className="text-xs h-7"><Users className="w-3.5 h-3.5 mr-1" />司機抽成</TabsTrigger>
          <TabsTrigger value="margin"     className="text-xs h-7"><TrendingUp className="w-3.5 h-3.5 mr-1" />毛利分析</TabsTrigger>
        </TabsList>

        <TabsContent value="aging"      className="mt-4"><ARAgingPanel /></TabsContent>
        <TabsContent value="commission" className="mt-4"><DriverCommissionPanel /></TabsContent>
        <TabsContent value="margin"     className="mt-4"><GrossMarginPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
