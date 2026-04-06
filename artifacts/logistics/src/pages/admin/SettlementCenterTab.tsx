import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import {
  DollarSign, Users, Truck, RefreshCw, CheckCircle,
  Download, AlertCircle, FileText, Building2, Package,
  TrendingUp, CreditCard, Clock, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintSaveBar } from "@/components/PrintSaveBar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import { useOrdersData } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { useCustomersData } from "@/hooks/use-customers";

// ── Types ─────────────────────────────────────────────────────────────────
interface CustomerAR {
  customer_name: string;
  customer_phone: string;
  unpaid_count: number;
  total_unpaid: number;
}

interface DriverPayroll {
  driver_id: number;
  name: string;
  license_plate: string;
  order_count: number;
  gross_earnings: number;
  is_settled?: boolean;
}

interface CostEventRow {
  id: number;
  order_id: number;
  event_type: string;
  amount: number;
  responsibility: string;
  deduction_target: string | null;
  description: string | null;
  customer_name?: string;
  driver_name?: string;
  is_settled: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  wait_fee: "等候費", re_delivery: "二次配送", cargo_damage: "貨損賠償",
  return_cargo: "退貨費用", overtime: "加班費", other: "其他",
};
const RESP_LABELS: Record<string, { label: string; color: string }> = {
  driver:   { label: "司機負擔", color: "bg-orange-100 text-orange-700" },
  customer: { label: "客戶負擔", color: "bg-blue-100 text-blue-700" },
  company:  { label: "公司吸收", color: "bg-gray-100 text-gray-600" },
};

function fmtMoney(n: number) { return `NT$ ${Number(n).toLocaleString("zh-TW")}`; }
function thisMonth() { return format(new Date(), "yyyy-MM"); }

// ══════════════════════════════════════════════════════════════════════════
// Section 1 — Customer Statements
// ══════════════════════════════════════════════════════════════════════════
function CustomerStatements() {
  const { toast } = useToast();
  const { data: orders = [] } = useOrdersData();
  const { data: customers = [] } = useCustomersData();
  const [generating, setGenerating] = useState(false);
  const [month, setMonth] = useState(thisMonth());

  // Derive unpaid amounts from orders data (client-side aggregation)
  const arMap: Record<string, CustomerAR> = {};
  for (const o of orders) {
    if (o.status !== "delivered") continue;
    if ((o.feeStatus ?? "unpaid") !== "unpaid") continue;
    const key = o.customerName ?? o.customerPhone ?? "unknown";
    if (!arMap[key]) {
      arMap[key] = {
        customer_name: o.customerName ?? "—",
        customer_phone: o.customerPhone ?? "—",
        unpaid_count: 0,
        total_unpaid: 0,
      };
    }
    arMap[key].unpaid_count++;
    arMap[key].total_unpaid += Number(o.totalFee ?? 0);
  }
  const arList = Object.values(arMap).sort((a, b) => b.total_unpaid - a.total_unpaid);

  const totalUnpaid = arList.reduce((s, r) => s + r.total_unpaid, 0);

  const generateBulk = async () => {
    setGenerating(true);
    try {
      const res = await fetch(apiUrl("/api/invoices/bulk-monthly"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = await res.json();
      toast({
        title: "✅ 月結帳單已生成",
        description: `已生成 ${data.generated ?? 0} 張帳單`,
      });
    } catch (e) {
      toast({ title: "生成失敗", description: String(e), variant: "destructive" });
    } finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-orange-100 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-xs text-orange-600 mb-1">未結總金額</p>
            <p className="text-xl font-bold text-orange-700">{fmtMoney(totalUnpaid)}</p>
            <p className="text-xs text-orange-500 mt-0.5">{arList.length} 位客戶</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 mb-1">月結客戶數</p>
            <p className="text-xl font-bold text-blue-700">
              {customers.filter((c: Record<string, unknown>) => c.paymentType === "monthly" || c.billingCycle === "monthly").length}
            </p>
            <p className="text-xs text-blue-500 mt-0.5">合約月結</p>
          </CardContent>
        </Card>
        <Card className="border-gray-100 bg-gray-50">
          <CardContent className="p-4">
            <p className="text-xs text-gray-600 mb-1">本月對帳月份</p>
            <p className="text-xl font-bold text-gray-700">{month}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">對帳月份</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="w-40 text-sm" />
        </div>
        <Button
          onClick={generateBulk}
          disabled={generating}
          className="bg-blue-600 hover:bg-blue-700 gap-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          {generating ? "生成中…" : "一鍵生成月結帳單"}
        </Button>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => window.open(apiUrl(`/api/settlement/export/customer-ar?month=${month}`), "_blank")}
        >
          <Download className="w-3.5 h-3.5" /> 匯出 CSV
        </Button>
        <p className="text-xs text-muted-foreground self-end">
          自動為所有月結客戶生成該月帳單
        </p>
      </div>

      {/* AR table */}
      {arList.length > 0 ? (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["客戶名稱", "電話", "未結單數", "應收金額", "狀態"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {arList.map((c, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-3 py-2 font-medium">{c.customer_name}</td>
                  <td className="px-3 py-2 font-mono">{c.customer_phone}</td>
                  <td className="px-3 py-2 text-center">{c.unpaid_count}</td>
                  <td className="px-3 py-2 font-semibold text-orange-600">{fmtMoney(c.total_unpaid)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600">待收款</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          目前無未結帳款
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Section 2 — Driver Payroll
// ══════════════════════════════════════════════════════════════════════════
function DriverPayroll() {
  const { toast } = useToast();
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const [settling, setSettling] = useState(false);
  const [period, setPeriod] = useState("month");

  // Derive driver earnings from orders (client-side)
  const earningsMap: Record<number, DriverPayroll> = {};
  for (const o of orders) {
    if (o.status !== "delivered" || !o.driverId) continue;
    const id = o.driverId as number;
    if (!earningsMap[id]) {
      const drv = (drivers as Record<string, unknown>[]).find((d: Record<string, unknown>) => d.id === id);
      earningsMap[id] = {
        driver_id: id,
        name: (drv as Record<string, unknown>)?.name as string ?? `司機 #${id}`,
        license_plate: (drv as Record<string, unknown>)?.licensePlate as string ?? "—",
        order_count: 0,
        gross_earnings: 0,
      };
    }
    earningsMap[id].order_count++;
    earningsMap[id].gross_earnings += Number(o.totalFee ?? 0);
  }

  const payrollList = Object.values(earningsMap)
    .filter(d => d.gross_earnings > 0)
    .sort((a, b) => b.gross_earnings - a.gross_earnings);

  const totalPayable = payrollList.reduce((s, d) => s + d.gross_earnings * 0.85, 0);

  const settleAll = async () => {
    setSettling(true);
    try {
      const res = await fetch(apiUrl("/api/driver-income/settle"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "✅ 司機薪資結算完成", description: `本${period === "month" ? "月" : "期"}薪資已結算` });
    } catch (e) {
      toast({ title: "結算失敗", description: String(e), variant: "destructive" });
    } finally { setSettling(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-100 bg-emerald-50">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-600 mb-1">本月應付薪資（估）</p>
            <p className="text-xl font-bold text-emerald-700">{fmtMoney(totalPayable)}</p>
            <p className="text-xs text-emerald-500 mt-0.5">扣 15% 佣金後</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600 mb-1">有收入司機數</p>
            <p className="text-xl font-bold text-blue-700">{payrollList.length}</p>
          </CardContent>
        </Card>
        <Card className="border-violet-100 bg-violet-50">
          <CardContent className="p-4">
            <p className="text-xs text-violet-600 mb-1">總趟次收入</p>
            <p className="text-xl font-bold text-violet-700">
              {fmtMoney(payrollList.reduce((s, d) => s + d.gross_earnings, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/40 rounded-xl border">
        <Button onClick={settleAll} disabled={settling}
          className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" />
          {settling ? "結算中…" : "一鍵結算本月薪資"}
        </Button>
        <Button variant="outline" className="gap-1.5"
          onClick={() => {
            const m = format(new Date(), "yyyy-MM");
            window.open(apiUrl(`/api/settlement/export/driver-payroll?month=${m}`), "_blank");
          }}>
          <Download className="w-3.5 h-3.5" /> 匯出薪資表 CSV
        </Button>
        <p className="text-xs text-muted-foreground">
          依各司機完成趟次自動計算，扣除佣金後入帳
        </p>
      </div>

      {payrollList.length > 0 ? (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["司機", "車牌", "本月趟次", "總收入", "應付薪資（85%）"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payrollList.map((d, i) => (
                <tr key={d.driver_id} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 font-mono">{d.license_plate}</td>
                  <td className="px-3 py-2 text-center">{d.order_count}</td>
                  <td className="px-3 py-2">{fmtMoney(d.gross_earnings)}</td>
                  <td className="px-3 py-2 font-semibold text-emerald-700">
                    {fmtMoney(Math.round(d.gross_earnings * 0.85))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">本月尚無司機收入紀錄</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Section 3 — Abnormal Cost Settlement
// ══════════════════════════════════════════════════════════════════════════
function AbnormalCostSettlement() {
  const { toast } = useToast();
  const [events, setEvents]     = useState<CostEventRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [settling, setSettling] = useState<number | null>(null);
  const [filter, setFilter]     = useState<"all" | "driver" | "customer" | "company">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = apiUrl(filter === "all"
        ? "/api/cost-events/by-order"
        : `/api/cost-events/by-order?responsibility=${filter}`);
      const res = await fetch(url);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filter]);

  useState(() => { load(); });

  const settle = async (id: number) => {
    setSettling(id);
    try {
      await fetch(apiUrl(`/api/cost-events/${id}/settle`), { method: "PATCH" });
      toast({ title: "✅ 已標記結算", duration: 1500 });
      await load();
    } catch (e) {
      toast({ title: "操作失敗", description: String(e), variant: "destructive" });
    } finally { setSettling(null); }
  };

  const unsettled = events.filter(e => !e.is_settled);
  const totalUnsettled = unsettled.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {["driver", "customer", "company"].map(resp => {
          const items = events.filter(e => e.responsibility === resp && !e.is_settled);
          const total = items.reduce((s, e) => s + Number(e.amount), 0);
          const cfg = RESP_LABELS[resp];
          return (
            <Card key={resp} className="border-gray-100">
              <CardContent className="p-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <p className="text-lg font-bold mt-1">{fmtMoney(total)}</p>
                <p className="text-xs text-muted-foreground">{items.length} 筆未結</p>
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-red-100 bg-red-50">
          <CardContent className="p-3">
            <p className="text-xs text-red-600">未結總金額</p>
            <p className="text-lg font-bold text-red-700">{fmtMoney(totalUnsettled)}</p>
            <p className="text-xs text-red-500">{unsettled.length} 筆</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-xl border">
        {(["all", "driver", "customer", "company"] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
            onClick={() => { setFilter(f); setTimeout(load, 0); }}
            className="text-xs h-7">
            {f === "all" ? "全部" : RESP_LABELS[f].label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={load} className="ml-auto gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">本月無異常成本紀錄</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["訂單", "客戶/司機", "類型", "金額", "責任方", "說明", "狀態", "操作"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => {
                const cfg = RESP_LABELS[e.responsibility] ?? RESP_LABELS.company;
                return (
                  <tr key={e.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                    <td className="px-3 py-2 font-mono">#{e.order_id}</td>
                    <td className="px-3 py-2">{e.customer_name ?? e.driver_name ?? "—"}</td>
                    <td className="px-3 py-2">{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</td>
                    <td className="px-3 py-2 font-semibold text-red-600">{fmtMoney(Number(e.amount))}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{e.description ?? "—"}</td>
                    <td className="px-3 py-2">
                      {e.is_settled
                        ? <Badge variant="outline" className="border-emerald-300 text-emerald-600 text-[10px]">已結算</Badge>
                        : <Badge variant="outline" className="border-orange-300 text-orange-600 text-[10px]">未結算</Badge>
                      }
                    </td>
                    <td className="px-3 py-2">
                      {!e.is_settled && (
                        <Button size="sm" variant="outline" className="text-[10px] h-6 px-2"
                          disabled={settling === e.id}
                          onClick={() => settle(e.id)}>
                          標記結算
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Section 5 — 訂單結算明細 (Order Settlements)
// ══════════════════════════════════════════════════════════════════════════
interface OrderSettlementRow {
  id: number; order_id: number; order_no: string; driver_id: number | null;
  driver_name: string | null; pickup_address: string; delivery_address: string;
  total_amount: string; commission_rate: string;
  commission_amount: string; platform_revenue: string; driver_payout: string;
  payment_status: "unpaid" | "processing" | "paid" | "cancelled";
  paid_at: string | null; payment_ref: string | null; created_at: string;
}
interface SettlementSummary {
  total_orders: number; gross_revenue: string; platform_revenue: string;
  driver_payout_total: string; avg_commission_rate: string;
  paid_count: number; unpaid_count: number; pending_payout: string;
}
function OrderSettlementsPanel() {
  const { toast } = useToast();
  const [rows, setRows]         = useState<OrderSettlementRow[]>([]);
  const [summary, setSummary]   = useState<SettlementSummary | null>(null);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter !== "all" ? `?payment_status=${filter}` : "";
      const [listRes, sumRes] = await Promise.all([
        fetch(apiUrl(`/api/order-settlements${qs}&limit=100`)),
        fetch(apiUrl("/api/order-settlements/summary")),
      ]);
      const list = await listRes.json();
      const sum  = await sumRes.json();
      setRows(list.data ?? []);
      setSummary(sum);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const nt = (n: string | number) => `NT$${Number(n).toLocaleString("zh-TW")}`;
  const pct = (n: string | number) => `${Number(n).toFixed(1)}%`;

  const handlePay = async (id: number) => {
    try {
      const r = await fetch(apiUrl(`/api/order-settlements/${id}/pay`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) throw new Error();
      toast({ title: "✅ 已標記付款" });
      load();
    } catch { toast({ title: "操作失敗", variant: "destructive" }); }
  };

  const handleBatchPay = async () => {
    if (selected.size === 0) return;
    try {
      const r = await fetch(apiUrl("/api/order-settlements/batch-pay"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      toast({ title: `✅ 批次付款完成，共 ${data.updated} 筆` });
      setSelected(new Set());
      load();
    } catch { toast({ title: "批次操作失敗", variant: "destructive" }); }
  };

  const toggleSelect = (id: number) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
    unpaid:     { label: "待付款", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    processing: { label: "處理中", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    paid:       { label: "已付款", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    cancelled:  { label: "已取消", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  };

  return (
    <div className="space-y-4">
      {/* 摘要卡 */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: BarChart3,   label: "總運費",   value: nt(summary.gross_revenue),     cls: "text-slate-800" },
            { icon: TrendingUp,  label: "平台利潤", value: nt(summary.platform_revenue),  cls: "text-emerald-700" },
            { icon: Truck,       label: "司機應付", value: nt(summary.pending_payout),    cls: "text-orange-700" },
            { icon: Clock,       label: "待付款筆", value: `${summary.unpaid_count} 筆`,  cls: "text-amber-700" },
          ].map(({ icon: Icon, label, value, cls }) => (
            <Card key={label} className="border shadow-sm">
              <CardContent className="p-3 flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${cls}`} />
                <div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className={`font-bold text-sm ${cls}`}>{value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 操作列 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {[["all","全部"],["unpaid","待付款"],["paid","已付款"]].map(([v,l]) => (
            <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} className="text-xs h-7" onClick={() => setFilter(v)}>{l}</Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1 ml-auto" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> 重整
        </Button>
        {selected.size > 0 && (
          <Button size="sm" className="text-xs h-7 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleBatchPay}>
            <CreditCard className="w-3 h-3" /> 批次付款 ({selected.size})
          </Button>
        )}
      </div>

      {/* 明細表 */}
      {rows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border rounded-xl bg-muted/20">
          {loading ? "載入中…" : "暫無結算記錄"}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const cfg = STATUS_CONFIG[row.payment_status] ?? STATUS_CONFIG.unpaid;
            const isSelected = selected.has(row.id);
            return (
              <div key={row.id} className={`border rounded-xl p-3 bg-white shadow-sm transition-colors ${isSelected ? "border-emerald-300 bg-emerald-50/30" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.payment_status === "unpaid" && (
                      <input type="checkbox" className="w-3.5 h-3.5 accent-emerald-600 flex-shrink-0"
                        checked={isSelected} onChange={() => toggleSelect(row.id)} />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{row.order_no ?? `#${row.order_id}`}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {row.driver_name ?? "—"} · {row.pickup_address?.substring(0,8)}→{row.delivery_address?.substring(0,8)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${cfg.cls}`}>{cfg.label}</Badge>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <div className="text-muted-foreground">總運費</div>
                    <div className="font-bold text-slate-800">{nt(row.total_amount)}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2 text-center">
                    <div className="text-muted-foreground">平台抽成 {pct(row.commission_rate)}</div>
                    <div className="font-bold text-emerald-700">{nt(row.platform_revenue)}</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2 text-center">
                    <div className="text-muted-foreground">司機應得</div>
                    <div className="font-bold text-orange-700">{nt(row.driver_payout)}</div>
                  </div>
                </div>

                {row.payment_status === "unpaid" && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" className="text-xs h-6 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handlePay(row.id)}>
                      <CheckCircle className="w-3 h-3" /> 標記已付款
                    </Button>
                  </div>
                )}
                {row.payment_status === "paid" && row.paid_at && (
                  <div className="mt-1 text-[10px] text-muted-foreground text-right">
                    已於 {format(new Date(row.paid_at), "yyyy/MM/dd HH:mm")} 付款
                    {row.payment_ref && ` · ${row.payment_ref}`}
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

// ══════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════
export default function SettlementCenterTab() {
  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">結算中心</h2>
          <p className="text-xs text-muted-foreground">客戶對帳單 · 司機趟次薪資 · 異常成本結算，一鍵生成</p>
        </div>
        <PrintSaveBar title="結算中心" subtitle="客戶對帳單 · 司機趟次薪資 · 異常成本結算" />
      </div>

      <Tabs defaultValue="customer">
        <TabsList className="w-full">
          <TabsTrigger value="customer" className="flex-1 gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5" /> 客戶對帳單
          </TabsTrigger>
          <TabsTrigger value="driver" className="flex-1 gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" /> 司機薪資
          </TabsTrigger>
          <TabsTrigger value="abnormal" className="flex-1 gap-1.5 text-xs">
            <AlertCircle className="w-3.5 h-3.5" /> 異常成本
          </TabsTrigger>
          <TabsTrigger value="outsourcer" className="flex-1 gap-1.5 text-xs">
            <Package className="w-3.5 h-3.5" /> 外包請款
          </TabsTrigger>
          <TabsTrigger value="settlements" className="flex-1 gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> 訂單利潤
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer"     className="mt-4"><CustomerStatements /></TabsContent>
        <TabsContent value="driver"       className="mt-4"><DriverPayroll /></TabsContent>
        <TabsContent value="abnormal"     className="mt-4"><AbnormalCostSettlement /></TabsContent>
        <TabsContent value="outsourcer"   className="mt-4"><OutsourcerInvoices /></TabsContent>
        <TabsContent value="settlements"  className="mt-4"><OrderSettlementsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Section 4 — Outsourcer Invoices
// ══════════════════════════════════════════════════════════════════════════
function OutsourcerInvoices() {
  const { toast } = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows]   = useState<Record<string, unknown>[]>([]);
  const [loading, setLoad] = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const res = await fetch(apiUrl(`/api/approvals?action_type=outsource_order&status=approved&limit=100`));
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { /* ignore */ } finally { setLoad(false); }
  }, []);

  useState(() => { load(); });

  const downloadCSV = () => {
    window.open(apiUrl(`/api/settlement/export/outsourcer?month=${month}`), "_blank");
  };

  // Group by fleet_name
  const grouped: Record<string, { fleet: string; orders: number; total: number }> = {};
  for (const r of rows) {
    const payload = r.payload as Record<string, unknown>;
    const fleet = String(payload?.fleet_name ?? "未知外包商");
    const fee   = Number(payload?.outsource_fee ?? 0);
    if (!grouped[fleet]) grouped[fleet] = { fleet, orders: 0, total: 0 };
    grouped[fleet].orders++;
    grouped[fleet].total += fee;
  }
  const fleetList = Object.values(grouped).sort((a, b) => b.total - a.total);
  const grandTotal = fleetList.reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-cyan-100 bg-cyan-50">
          <CardContent className="p-4">
            <p className="text-xs text-cyan-600">外包商請款總計</p>
            <p className="text-xl font-bold text-cyan-700">{fmtMoney(grandTotal)}</p>
            <p className="text-xs text-cyan-500">{fleetList.length} 家廠商</p>
          </CardContent>
        </Card>
        <Card className="border-gray-100 bg-gray-50">
          <CardContent className="p-4">
            <p className="text-xs text-gray-600">外包單量</p>
            <p className="text-xl font-bold text-gray-700">{rows.length}</p>
            <p className="text-xs text-gray-500">已核准</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">篩選月份</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36 text-sm" />
        </div>
        <Button onClick={load} disabled={loading} size="sm" variant="outline" className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 重整
        </Button>
        <Button onClick={downloadCSV} size="sm" className="gap-1.5 bg-cyan-600 hover:bg-cyan-700">
          <Download className="w-3.5 h-3.5" /> 匯出請款 CSV
        </Button>
      </div>

      {fleetList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">尚無外包請款紀錄</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {["外包商名稱","外包單量","請款金額","平均每單"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleetList.map((f, i) => (
                <tr key={f.fleet} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                  <td className="px-3 py-2 font-medium">{f.fleet}</td>
                  <td className="px-3 py-2 text-center">{f.orders}</td>
                  <td className="px-3 py-2 font-semibold text-cyan-700">{fmtMoney(f.total)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {f.orders > 0 ? fmtMoney(Math.round(f.total / f.orders)) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted font-semibold">
                <td className="px-3 py-2">合計</td>
                <td className="px-3 py-2 text-center">{rows.length}</td>
                <td className="px-3 py-2 text-cyan-700">{fmtMoney(grandTotal)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
