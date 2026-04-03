import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, ChevronDown, ChevronRight, FileText, AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api/fusingao/${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });

const fmt = (n: number | null | undefined) =>
  n != null ? `NT$ ${Number(n).toLocaleString()}` : "—";

interface MonthStat {
  billing_month: string; store_delivery_count: number; ndd_count: number;
  whndd_count: number; total_amount: number;
}
interface BillingSummary {
  billing_month: string; company_name: string; pretax_total: number; tax_amount: number;
  invoice_total: number; store_delivery_total: number; ndd_total: number; whndd_total: number;
  commission_rate: number; split_note: string; billing_period_start: string; billing_period_end: string;
}
interface TripRow {
  billing_type: string; fleet_name: string; warehouse: string; area: string;
  route_no: string; vehicle_size: string; driver_id: string; trip_date: string; amount: number;
}
interface PenaltyRow {
  incident_date: string; soc: string; store_name: string; violation_type: string;
  fleet_name: string; driver_id: string; amount: number; notes: string;
}
interface AggRow {
  billing_type: string; route_no: string; driver_id: string; total: number; trip_count: number;
}

export default function FusingaoBillingDetailTab() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [months, setMonths] = useState<MonthStat[]>([]);
  const [summaries, setSummaries] = useState<BillingSummary[]>([]);
  const [penaltyTotals, setPenaltyTotals] = useState<Record<string, { penalty_total: number; penalty_count: number }>>({});
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ trips: TripRow[]; penalties: PenaltyRow[]; summary: BillingSummary | null; aggregated: AggRow[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeType, setActiveType] = useState<"all" | "店配車" | "NDD" | "WHNDD">("all");
  const [detailView, setDetailView] = useState<"summary" | "trips" | "penalties">("summary");

  const loadMonths = async () => {
    const data = await api("billing-detail/months").then(r => r.json());
    if (data.ok) {
      setMonths(data.months ?? []);
      setSummaries(data.summaries ?? []);
      const pt: Record<string, any> = {};
      for (const p of data.penaltyTotals ?? []) pt[p.billing_month] = p;
      setPenaltyTotals(pt);
    }
  };

  useEffect(() => { loadMonths(); }, []);

  const loadDetail = async (month: string) => {
    if (selectedMonth === month) { setSelectedMonth(null); setDetail(null); return; }
    setSelectedMonth(month);
    setLoadingDetail(true);
    const data = await api(`billing-detail/${month}`).then(r => r.json());
    setDetail(data.ok ? { trips: data.trips, penalties: data.penalties, summary: data.summary, aggregated: data.aggregated } : null);
    setLoadingDetail(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("year", String(new Date().getFullYear()));
    const res = await fetch(`${BASE}api/fusingao/billing-detail/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: fd,
    }).then(r => r.json());
    setUploading(false);
    if (res.ok) {
      toast({ title: "✅ 對帳明細匯入成功", description: `已匯入 ${res.totalMonths} 個月份、${res.totalTrips} 筆趟次資料` });
      loadMonths();
    } else {
      toast({ title: "匯入失敗", description: res.error, variant: "destructive" });
    }
    e.target.value = "";
  };

  const filteredAgg = (detail?.aggregated ?? []).filter(r =>
    activeType === "all" ? true : r.billing_type === activeType
  );

  const typeColor: Record<string, string> = {
    "店配車": "bg-green-100 text-green-700", "NDD": "bg-orange-100 text-orange-700",
    "WHNDD": "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" /> 富詠每月對帳明細
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">匯入蝦皮對帳明細 Excel（店配車、NDD、WHNDD、罰款、補助）</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <Upload className="w-4 h-4 mr-1" />
            {uploading ? "匯入中..." : "匯入對帳明細"}
          </Button>
        </div>
      </div>

      {/* Month list */}
      {months.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">尚未匯入對帳明細</p>
            <p className="text-xs text-gray-400 mt-1">請上傳富詠每月對帳明細 Excel 檔案</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {months.map(m => {
            const sm = summaries.find(s => s.billing_month === m.billing_month);
            const pt = penaltyTotals[m.billing_month];
            const isOpen = selectedMonth === m.billing_month;
            return (
              <div key={m.billing_month} className="border rounded-lg overflow-hidden bg-white">
                <button
                  onClick={() => loadDetail(m.billing_month)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span className="font-bold text-gray-800 text-sm min-w-[70px]">{m.billing_month}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.store_delivery_count > 0 && <Badge className="text-[10px] bg-green-100 text-green-700">店配車 {m.store_delivery_count}</Badge>}
                    {m.ndd_count > 0 && <Badge className="text-[10px] bg-orange-100 text-orange-700">NDD {m.ndd_count}</Badge>}
                    {m.whndd_count > 0 && <Badge className="text-[10px] bg-purple-100 text-purple-700">WHNDD {m.whndd_count}</Badge>}
                    {pt && pt.penalty_count > 0 && <Badge className="text-[10px] bg-red-100 text-red-700"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> 罰款 {pt.penalty_count} 筆</Badge>}
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-bold text-gray-800">{fmt(m.total_amount)}</p>
                    {pt && <p className="text-xs text-red-500">罰款 -{fmt(pt.penalty_total)}</p>}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t">
                    {loadingDetail ? (
                      <div className="p-6 text-center text-sm text-gray-400">載入中...</div>
                    ) : (
                      <div className="p-4 space-y-4">
                        {/* Sub-nav */}
                        <div className="flex gap-2 border-b pb-2">
                          {["summary","trips","penalties"].map(v => (
                            <button key={v} onClick={() => setDetailView(v as any)}
                              className={`px-3 py-1 text-xs font-medium rounded border-b-2 ${detailView === v ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500"}`}>
                              {v === "summary" ? "📊 帳務總覽" : v === "trips" ? "🚛 趟次明細" : "⚠️ 罰款明細"}
                            </button>
                          ))}
                        </div>

                        {/* Summary view */}
                        {detailView === "summary" && (
                          <div className="space-y-3">
                            {sm ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {[
                                  { label: "未稅總計", value: sm.pretax_total, icon: TrendingUp, color: "text-blue-600 bg-blue-50" },
                                  { label: "稅額 (5%)", value: sm.tax_amount, icon: TrendingUp, color: "text-gray-600 bg-gray-50" },
                                  { label: "請款含稅總計", value: sm.invoice_total, icon: TrendingUp, color: "text-green-600 bg-green-50" },
                                  { label: "店配車費用", value: sm.store_delivery_total, icon: TrendingUp, color: "text-green-600 bg-green-50" },
                                  { label: "NDD 費用", value: sm.ndd_total, icon: TrendingUp, color: "text-orange-600 bg-orange-50" },
                                  { label: "WHNDD 費用", value: sm.whndd_total, icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
                                ].map(({ label, value, color }) => (
                                  <div key={label} className={`rounded-lg p-3 ${color.split(" ")[1]}`}>
                                    <p className="text-xs text-gray-500">{label}</p>
                                    <p className={`text-sm font-bold mt-0.5 ${color.split(" ")[0]}`}>{fmt(value)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">此月份無請款總表資料</p>
                            )}

                            {/* Per-type trip aggregate */}
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-2">路線趟次匯總</p>
                              <div className="flex gap-2 mb-2">
                                {["all", "店配車", "NDD", "WHNDD"].map(t => (
                                  <button key={t} onClick={() => setActiveType(t as any)}
                                    className={`text-xs px-2 py-0.5 rounded border ${activeType === t ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600"}`}>
                                    {t === "all" ? "全部" : t}
                                  </button>
                                ))}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 border-b">
                                    <th className="text-left py-1 pr-2">類型</th>
                                    <th className="text-left py-1 pr-2">Route No.</th>
                                    <th className="text-left py-1 pr-2">司機工號</th>
                                    <th className="text-right py-1 pr-2">趟次</th>
                                    <th className="text-right py-1">金額</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredAgg.map((r, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                      <td className="py-1 pr-2"><Badge className={`text-[10px] ${typeColor[r.billing_type] ?? "bg-gray-100 text-gray-600"}`}>{r.billing_type}</Badge></td>
                                      <td className="py-1 pr-2 font-mono text-gray-700">{r.route_no}</td>
                                      <td className="py-1 pr-2 text-gray-500">{r.driver_id || "—"}</td>
                                      <td className="py-1 pr-2 text-right text-gray-700">{r.trip_count}</td>
                                      <td className="py-1 text-right font-medium text-gray-800">{fmt(r.total)}</td>
                                    </tr>
                                  ))}
                                  {filteredAgg.length === 0 && (
                                    <tr><td colSpan={5} className="text-center py-4 text-gray-400">無資料</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Trip detail view */}
                        {detailView === "trips" && (
                          <div>
                            <div className="flex gap-2 mb-2">
                              {["all", "店配車", "NDD", "WHNDD"].map(t => (
                                <button key={t} onClick={() => setActiveType(t as any)}
                                  className={`text-xs px-2 py-0.5 rounded border ${activeType === t ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600"}`}>
                                  {t === "all" ? "全部" : t}
                                </button>
                              ))}
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500 border-b bg-gray-50">
                                  <th className="text-left py-1.5 px-2">類型</th>
                                  <th className="text-left py-1.5 px-2">車隊</th>
                                  <th className="text-left py-1.5 px-2">倉別</th>
                                  <th className="text-left py-1.5 px-2">Route No.</th>
                                  <th className="text-left py-1.5 px-2">車型</th>
                                  <th className="text-left py-1.5 px-2">司機工號</th>
                                  <th className="text-left py-1.5 px-2">出車日期</th>
                                  <th className="text-right py-1.5 px-2">金額</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(detail?.trips ?? [])
                                  .filter(t => activeType === "all" || t.billing_type === activeType)
                                  .map((t, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                      <td className="py-1.5 px-2"><Badge className={`text-[10px] ${typeColor[t.billing_type] ?? "bg-gray-100 text-gray-600"}`}>{t.billing_type}</Badge></td>
                                      <td className="py-1.5 px-2 text-gray-600">{t.fleet_name || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-500">{t.warehouse || "—"}</td>
                                      <td className="py-1.5 px-2 font-mono text-gray-700">{t.route_no}</td>
                                      <td className="py-1.5 px-2 text-gray-500">{t.vehicle_size || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-500">{t.driver_id || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-500">{t.trip_date?.substring(0, 10)}</td>
                                      <td className="py-1.5 px-2 text-right font-medium text-gray-800">{fmt(t.amount)}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Penalties view */}
                        {detailView === "penalties" && (
                          <div>
                            {(detail?.penalties ?? []).length === 0 ? (
                              <p className="text-sm text-gray-400 text-center py-6">本月無罰款紀錄</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 border-b bg-gray-50">
                                    <th className="text-left py-1.5 px-2">案件日期</th>
                                    <th className="text-left py-1.5 px-2">SOC</th>
                                    <th className="text-left py-1.5 px-2">門市</th>
                                    <th className="text-left py-1.5 px-2">違規類型</th>
                                    <th className="text-left py-1.5 px-2">車隊</th>
                                    <th className="text-left py-1.5 px-2">司機工號</th>
                                    <th className="text-right py-1.5 px-2">罰款金額</th>
                                    <th className="text-left py-1.5 px-2">說明</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(detail?.penalties ?? []).map((p, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-red-50">
                                      <td className="py-1.5 px-2 text-gray-500">{p.incident_date?.substring(0, 10) || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-600">{p.soc || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-600">{p.store_name || "—"}</td>
                                      <td className="py-1.5 px-2"><Badge variant="outline" className="text-[10px] border-red-300 text-red-600">{p.violation_type || "—"}</Badge></td>
                                      <td className="py-1.5 px-2 text-gray-500">{p.fleet_name || "—"}</td>
                                      <td className="py-1.5 px-2 text-gray-500">{p.driver_id || "—"}</td>
                                      <td className="py-1.5 px-2 text-right font-medium text-red-600">-{fmt(p.amount)}</td>
                                      <td className="py-1.5 px-2 text-gray-400 text-[10px]">{p.notes || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
