import { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Search, Printer, FileDown, Calendar, User, Truck,
  Filter, RotateCcw, InboxIcon, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const API = (path: string) => `${BASE_URL}/api${path}`;
const authHeaders = () => {
  const t = localStorage.getItem("auth-jwt");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待處理", assigned: "已指派", in_transit: "運送中",
  delivered: "已送達", cancelled: "已取消",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  assigned: "bg-blue-100 text-blue-700",
  in_transit: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};
const FEE_LABEL: Record<string, string> = {
  unpaid: "未收款", paid: "已收款", invoiced: "已開票",
};
const FEE_COLOR: Record<string, string> = {
  unpaid: "text-orange-600", paid: "text-green-600", invoiced: "text-blue-600",
};

interface FilterState {
  customerName: string;
  driverId: string;
  dateFrom: string;
  dateTo: string;
  dateField: "pickup" | "created";
  status: string;
}

const ALL = "__all__";
const EMPTY_FILTER: FilterState = {
  customerName: "", driverId: ALL, dateFrom: "", dateTo: "",
  dateField: "pickup", status: ALL,
};

function buildParams(f: FilterState) {
  const p = new URLSearchParams();
  if (f.customerName)              p.set("customerName", f.customerName);
  if (f.driverId && f.driverId !== ALL)  p.set("driverId", f.driverId);
  if (f.dateFrom)                  p.set("dateFrom", f.dateFrom);
  if (f.dateTo)                    p.set("dateTo", f.dateTo);
  if (f.dateField)                 p.set("dateField", f.dateField === "created" ? "created" : "pickup");
  if (f.status && f.status !== ALL) p.set("status", f.status);
  return p.toString();
}

export default function OrderReport() {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [applied, setApplied] = useState<FilterState | null>(null);
  const [exporting, setExporting] = useState(false);

  const set = (key: keyof FilterState) => (val: string) =>
    setFilter(f => ({ ...f, [key]: val }));

  // Drivers list
  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-list"],
    queryFn: async () => {
      const r = await fetch(API("/drivers"), { headers: authHeaders() });
      return r.ok ? r.json() : [];
    },
  });

  // Orders query (only when applied)
  const params = applied ? buildParams(applied) : null;
  const { data: orders, isLoading, isFetching } = useQuery({
    queryKey: ["order-report", params],
    queryFn: async () => {
      const r = await fetch(API(`/orders?${params}`), { headers: authHeaders() });
      if (!r.ok) throw new Error("查詢失敗");
      return r.json() as Promise<any[]>;
    },
    enabled: params !== null,
  });

  const totalFee = useMemo(() =>
    (orders ?? []).reduce((s, o) => s + (o.totalFee ?? 0), 0), [orders]);

  const handleSearch = () => setApplied({ ...filter });
  const handleReset = () => { setFilter(EMPTY_FILTER); setApplied(null); };

  const handlePrint = () => window.print();

  const handleExcel = async () => {
    if (!applied) return;
    setExporting(true);
    try {
      const token = localStorage.getItem("auth-jwt");
      const url = `${BASE_URL}/api/orders/report/excel?${buildParams(applied)}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("匯出失敗");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const date = format(new Date(), "yyyyMMdd");
      a.download = `訂單報表_${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Excel 匯出成功", description: `共 ${orders?.length ?? 0} 筆訂單` });
    } catch (err: any) {
      toast({ title: "匯出失敗", description: err?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const filterSummary = applied
    ? [
        applied.customerName && `客戶：${applied.customerName}`,
        applied.driverId && applied.driverId !== ALL && `司機：${(drivers as any[]).find((d: any) => String(d.id) === applied.driverId)?.name ?? applied.driverId}`,
        applied.status && applied.status !== ALL && `狀態：${STATUS_LABEL[applied.status] ?? applied.status}`,
        (applied.dateFrom || applied.dateTo) && `${applied.dateField === "created" ? "建單" : "提貨"}日期：${applied.dateFrom || "∞"} ～ ${applied.dateTo || "∞"}`,
      ].filter(Boolean)
    : [];

  return (
    <>
      {/* ── 列印樣式（僅印表機可見） ── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: fixed; inset: 0; padding: 20px; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 4px 6px; }
          th { background: #2563eb; color: white; }
          tr:nth-child(even) td { background: #f0f4ff; }
        }
      `}</style>

      <div className="space-y-5 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary">富詠運輸</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">訂單報表</h1>
            <p className="text-muted-foreground text-sm mt-1">依客戶、司機、日期篩選並匯出</p>
          </div>
          <div className="flex gap-2 no-print">
            <Button variant="outline" className="gap-2" onClick={handlePrint} disabled={!orders?.length}>
              <Printer className="w-4 h-4" /> 列印
            </Button>
            <Button className="gap-2" onClick={handleExcel} disabled={!orders?.length || exporting}>
              <FileDown className="w-4 h-4" />
              {exporting ? "匯出中…" : "匯出 Excel"}
            </Button>
          </div>
        </div>

        {/* Filter Panel */}
        <Card className="p-5 no-print">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* 客戶名稱 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <User className="w-3 h-3" /> 客戶名稱
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder="輸入客戶名稱（留空為全部）"
                  value={filter.customerName}
                  onChange={e => set("customerName")(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
              </div>
            </div>

            {/* 選擇司機 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Truck className="w-3 h-3" /> 選擇司機
              </Label>
              <Select value={filter.driverId} onValueChange={set("driverId")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="全部司機" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部司機</SelectItem>
                  {(drivers as any[]).map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 訂單狀態 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Filter className="w-3 h-3" /> 訂單狀態
              </Label>
              <Select value={filter.status} onValueChange={set("status")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="全部狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部狀態</SelectItem>
                  <SelectItem value="pending">待處理</SelectItem>
                  <SelectItem value="assigned">已指派</SelectItem>
                  <SelectItem value="in_transit">運送中</SelectItem>
                  <SelectItem value="delivered">已送達</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 日期欄位類型 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 日期依據
              </Label>
              <Select value={filter.dateField} onValueChange={v => set("dateField")(v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">提貨日期</SelectItem>
                  <SelectItem value="created">建單日期</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 起始日期 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">開始日期</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filter.dateFrom}
                onChange={e => set("dateFrom")(e.target.value)}
              />
            </div>

            {/* 結束日期 */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">結束日期</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={filter.dateTo}
                onChange={e => set("dateTo")(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Button className="gap-2 px-6" onClick={handleSearch}>
              <Search className="w-4 h-4" /> 查詢
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" /> 重設
            </Button>
            {filterSummary.length > 0 && (
              <div className="flex flex-wrap gap-1.5 ml-2">
                {filterSummary.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Results */}
        {applied === null ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ChevronDown className="w-10 h-10 mb-3 text-muted-foreground/30" />
            <p className="font-medium">設定篩選條件後點「查詢」顯示訂單</p>
            <p className="text-xs mt-1">可留空所有條件查詢全部訂單</p>
          </div>
        ) : (isLoading || isFetching) ? (
          <Card className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </Card>
        ) : !orders?.length ? (
          <Card className="py-16 text-center text-muted-foreground">
            <InboxIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">沒有符合條件的訂單</p>
            <p className="text-xs mt-1">請調整篩選條件後重新查詢</p>
          </Card>
        ) : (
          <div id="print-area" ref={printRef}>
            {/* 列印標題（僅列印時顯示） */}
            <div className="hidden print:block mb-4">
              <h2 className="text-xl font-bold">富詠運輸 — 訂單報表</h2>
              <p className="text-sm text-gray-500">列印時間：{format(new Date(), "yyyy/MM/dd HH:mm", { locale: zhTW })}</p>
              {filterSummary.length > 0 && (
                <p className="text-sm">篩選條件：{filterSummary.join("、")}</p>
              )}
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 mb-3 no-print">
              <div className="text-sm text-muted-foreground">
                共 <span className="font-bold text-foreground text-base">{orders.length}</span> 筆訂單
              </div>
              {totalFee > 0 && (
                <div className="text-sm text-muted-foreground">
                  運費合計 <span className="font-bold text-primary text-base">NT${totalFee.toLocaleString()}</span>
                </div>
              )}
            </div>

            <Card className="border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left" style={{ minWidth: "1000px" }}>
                  <thead className="text-xs bg-primary text-white">
                    <tr>
                      <th className="px-3 py-3 font-semibold">單號</th>
                      <th className="px-3 py-3 font-semibold">狀態</th>
                      <th className="px-3 py-3 font-semibold">客戶名稱</th>
                      <th className="px-3 py-3 font-semibold">客戶電話</th>
                      <th className="px-3 py-3 font-semibold">司機</th>
                      <th className="px-3 py-3 font-semibold">提貨日期／時間</th>
                      <th className="px-3 py-3 font-semibold">提貨地址</th>
                      <th className="px-3 py-3 font-semibold">到貨日期／時間</th>
                      <th className="px-3 py-3 font-semibold">到貨地址</th>
                      <th className="px-3 py-3 font-semibold text-right">運費</th>
                      <th className="px-3 py-3 font-semibold">收款</th>
                      <th className="px-3 py-3 font-semibold">建單時間</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-card">
                    {orders.map((o: any, idx: number) => (
                      <tr key={o.id} className={idx % 2 === 1 ? "bg-blue-50/40" : ""}>
                        <td className="px-3 py-2.5 font-mono font-bold text-foreground">#{o.id}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLOR[o.status] ?? ""}`}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-medium">{o.customerName}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{o.customerPhone}</td>
                        <td className="px-3 py-2.5">
                          {o.driver?.name ?? <span className="text-muted-foreground italic text-xs">未指派</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          {o.pickupDate ? (
                            <><span className="font-medium">{o.pickupDate}</span>{o.pickupTime && <span className="text-primary ml-1">{o.pickupTime}</span>}</>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs max-w-[160px]">
                          <span className="line-clamp-2">{o.pickupAddress || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          {o.deliveryDate ? (
                            <><span className="font-medium">{o.deliveryDate}</span>{o.deliveryTime && <span className="text-emerald-600 ml-1">{o.deliveryTime}</span>}</>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs max-w-[160px]">
                          <span className="line-clamp-2">{o.deliveryAddress || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-sm">
                          {o.totalFee != null ? `NT$${o.totalFee.toLocaleString()}` : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold ${FEE_COLOR[o.feeStatus ?? "unpaid"] ?? ""}`}>
                            {FEE_LABEL[o.feeStatus ?? "unpaid"] ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {o.createdAt ? format(new Date(o.createdAt), "yyyy/MM/dd HH:mm") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* 合計列 */}
                  {totalFee > 0 && (
                    <tfoot>
                      <tr className="bg-muted/50 border-t-2">
                        <td colSpan={9} className="px-3 py-2.5 text-right text-sm font-semibold text-muted-foreground">
                          合計 {orders.length} 筆
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-primary">
                          NT${totalFee.toLocaleString()}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
