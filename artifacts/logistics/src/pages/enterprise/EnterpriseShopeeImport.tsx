import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown, ChevronRight, RefreshCw, Package, CheckCircle2,
  Clock, FileText, DollarSign, TrendingUp, AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number | string | undefined) {
  const v = Number(n ?? 0);
  return isNaN(v) ? "NT$ 0" : `NT$ ${v.toLocaleString("zh-TW")}`;
}

const prefixColor: Record<string, string> = {
  FN: "bg-blue-100 text-blue-700",
  FM: "bg-violet-100 text-violet-700",
  A3: "bg-cyan-100 text-cyan-700",
  NB: "bg-orange-100 text-orange-700",
  WB: "bg-indigo-100 text-indigo-700",
  WD: "bg-pink-100 text-pink-700",
};

const SERVICE_LABEL: Record<string, string> = {
  "店配車": "店配車",
  "NDD": "NDD",
  "WHNDD": "WHNDD",
};

interface RouteDetail {
  id: number;
  route_id: string;
  route_prefix: string | null;
  station_count: number | null;
  service_type: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  shopee_rate: string | null;
  status: string | null;
  completed_at: string | null;
  driver_payment_status: string | null;
  created_at: string;
}

interface MonthData {
  month: string;
  month_label: string;
  route_count: string;
  completed_count: string;
  billed_count: string;
  shopee_income: string;
  billed_amount: string;
  unbilled_amount: string;
  penalty_deduction: string;
  net_amount: number;
  routes: RouteDetail[];
}

interface Props {
  session: EnterpriseSession;
}

export default function EnterpriseShopeeImport({ session: _session }: Props) {
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BASE}/api/fusingao/monthly`);
      const data = await resp.json();
      if (data.ok) {
        setMonths(data.months ?? []);
        setLastRefresh(new Date());
        if (data.months?.length > 0 && !expandedMonth) {
          setExpandedMonth(data.months[0].month);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, []); // eslint-disable-line

  const totalIncome = months.reduce((s, m) => s + Number(m.shopee_income), 0);
  const totalBilled = months.reduce((s, m) => s + Number(m.billed_amount), 0);
  const totalRoutes = months.reduce((s, m) => s + Number(m.route_count), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">蝦皮對帳明細</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            資料來源：富詠運輸調度系統
            {lastRefresh && <span className="ml-2">・最後更新 {lastRefresh.toLocaleTimeString("zh-TW")}</span>}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />重新整理
        </Button>
      </div>

      {/* Total summary cards */}
      {months.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <Package className="h-5 w-5 text-orange-500" />, label: "累計路線", val: `${totalRoutes} 趟`, sub: `共 ${months.length} 個月` },
            { icon: <TrendingUp className="h-5 w-5 text-blue-500" />, label: "累計應收", val: fmt(totalIncome), sub: "蝦皮費率合計" },
            { icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, label: "已對帳金額", val: fmt(totalBilled), sub: `${totalIncome > 0 ? Math.round(totalBilled / totalIncome * 100) : 0}% 對帳率` },
            { icon: <AlertCircle className="h-5 w-5 text-amber-500" />, label: "未對帳金額", val: fmt(totalIncome - totalBilled), sub: "待富詠確認" },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                {k.icon}
                <p className="text-xs text-gray-500 mt-2">{k.label}</p>
                <p className="text-lg font-bold text-gray-800">{k.val}</p>
                <p className="text-xs text-gray-400">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Notice */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
        <FileText className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <span>以下資料由富詠運輸調度系統即時同步。「對帳」狀態由富詠後台標記，如有疑問請聯繫業務人員。</span>
      </div>

      {/* Monthly cards */}
      {loading && months.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />載入中…
        </div>
      ) : months.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Package className="h-10 w-10 opacity-30" />
          <p className="text-sm">尚無派車記錄</p>
        </div>
      ) : (
        <div className="space-y-3">
          {months.map(m => {
            const isOpen = expandedMonth === m.month;
            const billedPct = Number(m.shopee_income) > 0
              ? Math.round(Number(m.billed_amount) / Number(m.shopee_income) * 100)
              : 0;
            const completedPct = Number(m.route_count) > 0
              ? Math.round(Number(m.completed_count) / Number(m.route_count) * 100)
              : 0;

            return (
              <Card key={m.month} className="overflow-hidden">
                {/* Month header — clickable */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedMonth(isOpen ? null : m.month)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                    <div>
                      <h3 className="font-bold text-gray-800">{m.month_label}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.route_count} 趟
                        ・完成 {m.completed_count}/{m.route_count}
                        ・對帳 {m.billed_count}/{m.route_count}
                        {Number(m.penalty_deduction) > 0 && (
                          <span className="text-red-500 ml-2">罰款 {fmt(m.penalty_deduction)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl text-orange-600">{fmt(m.net_amount)}</p>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${billedPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{billedPct}% 對帳</span>
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t">
                    {/* Summary strip */}
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-0 border-b bg-orange-50 text-center">
                      {[
                        { label: "蝦皮應收",  val: fmt(m.shopee_income),      cls: "text-blue-700" },
                        { label: "已對帳",    val: fmt(m.billed_amount),      cls: "text-emerald-700" },
                        { label: "未對帳",    val: fmt(m.unbilled_amount),    cls: "text-amber-700" },
                        { label: "罰款扣除",  val: Number(m.penalty_deduction) > 0 ? fmt(m.penalty_deduction) : "—", cls: "text-red-500" },
                        { label: "淨應收",    val: fmt(m.net_amount),         cls: "text-orange-600 font-bold" },
                      ].map(k => (
                        <div key={k.label} className="py-2.5 px-1 border-r last:border-0">
                          <p className="text-xs text-gray-500">{k.label}</p>
                          <p className={`text-sm font-semibold ${k.cls}`}>{k.val}</p>
                        </div>
                      ))}
                    </div>

                    {/* Progress bars */}
                    <div className="grid grid-cols-2 gap-0 border-b bg-gray-50 px-4 py-2">
                      <div className="pr-4">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>完成率</span>
                          <span className="font-medium">{completedPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${completedPct >= 80 ? "bg-green-500" : completedPct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${completedPct}%` }} />
                        </div>
                      </div>
                      <div className="pl-4 border-l">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>對帳率</span>
                          <span className="font-medium">{billedPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${billedPct >= 80 ? "bg-emerald-500" : billedPct >= 50 ? "bg-blue-400" : "bg-gray-300"}`}
                            style={{ width: `${billedPct}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Route table */}
                    {m.routes.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-6">本月無路線資料</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-gray-50 text-gray-500">
                              <th className="text-left p-2 pl-4">路線</th>
                              <th className="text-left p-2 hidden sm:table-cell">服務類型</th>
                              <th className="text-right p-2">站點</th>
                              <th className="text-right p-2">蝦皮費率</th>
                              <th className="text-center p-2">完成</th>
                              <th className="text-center p-2 pr-4">對帳</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {m.routes.map(r => {
                              const isDone = r.status === "completed" || !!r.completed_at;
                              const isPaid = r.driver_payment_status === "paid";
                              return (
                                <tr key={r.id} className="hover:bg-gray-50">
                                  <td className="p-2 pl-4">
                                    <span className="font-mono font-bold text-gray-800">{r.route_id}</span>
                                    {r.route_prefix && (
                                      <Badge className={`ml-1 text-[10px] px-1 py-0 ${prefixColor[r.route_prefix] ?? "bg-gray-100"}`}>
                                        {r.route_prefix}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2 hidden sm:table-cell text-gray-500">
                                    {r.service_type ? (SERVICE_LABEL[r.service_type] ?? r.service_type) : "—"}
                                  </td>
                                  <td className="p-2 text-right text-gray-600">{r.station_count ?? "—"}</td>
                                  <td className="p-2 text-right font-mono font-semibold text-orange-700">
                                    {r.shopee_rate ? fmt(r.shopee_rate) : "—"}
                                  </td>
                                  <td className="p-2 text-center">
                                    {isDone
                                      ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                                      : <Clock className="h-4 w-4 text-gray-300 mx-auto" />}
                                  </td>
                                  <td className="p-2 text-center pr-4">
                                    {isPaid
                                      ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5">已對帳</Badge>
                                      : <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">待對帳</Badge>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
