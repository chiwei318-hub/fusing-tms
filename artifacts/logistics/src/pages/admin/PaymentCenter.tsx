import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import {
  CreditCard, Banknote, Smartphone, Building2, CheckCircle2,
  AlertCircle, Clock, Search, Plus, Download, Printer, X,
  Bell, ReceiptText, TrendingUp, DollarSign, FileText, BarChart2,
  Zap, Lock, Check, Send, CalendarDays, RefreshCw, Link2,
  Ban, AlertTriangle, Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Order } from "@workspace/api-client-react";

const COMPANY = "富詠運輸股份有限公司";
const COMPANY_ADDR = "台北市中山區XX路XX號";
const COMPANY_TEL = "02-XXXX-XXXX";
const COMPANY_TAX = "12345678";

const METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  bank_transfer: "銀行轉帳",
  line_pay: "LINE Pay",
  credit_card: "信用卡",
};
const METHOD_ICONS: Record<string, React.ElementType> = {
  cash: Banknote,
  bank_transfer: Building2,
  line_pay: Smartphone,
  credit_card: CreditCard,
};
const METHOD_COLORS: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-700 border-emerald-200",
  bank_transfer: "bg-blue-100 text-blue-700 border-blue-200",
  line_pay: "bg-green-100 text-green-700 border-green-200",
  credit_card: "bg-violet-100 text-violet-700 border-violet-200",
};

interface Payment {
  id: number;
  orderId: number;
  amount: number;
  method: string;
  note: string | null;
  collectedBy: string | null;
  receiptNumber: string | null;
  receiptCompanyTitle: string | null;
  receiptTaxId: string | null;
  isVoided: boolean;
  voidReason: string | null;
  createdAt: string;
}

interface OrderWithPaid extends Order {
  paidAmount: number;
}

interface ReportRow {
  date: string;
  count: number;
  total: number;
  byMethod: Record<string, number>;
}

interface ReportData {
  rows: ReportRow[];
  grandTotal: number;
  byMethod: Record<string, number>;
  count: number;
}

function nt(v: number) { return `NT$${Math.round(v).toLocaleString()}`; }

function MethodBadge({ method }: { method: string }) {
  const label = METHOD_LABELS[method] ?? method;
  const color = METHOD_COLORS[method] ?? "bg-gray-100 text-gray-700";
  const Icon = METHOD_ICONS[method] ?? Banknote;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function PaymentStatusBadge({ order }: { order: OrderWithPaid }) {
  const total = order.totalFee ?? 0;
  const paid = order.paidAmount ?? 0;
  if (paid <= 0) return <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50 text-xs">未付款</Badge>;
  if (paid >= total && total > 0) return <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 text-xs">已付清</Badge>;
  return <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">部分付款</Badge>;
}

function printReceipt(payment: Payment, order: Order) {
  const win = window.open("", "_blank");
  if (!win) return;
  const companyTitle = payment.receiptCompanyTitle || "（個人）";
  const taxId = payment.receiptTaxId || "—";
  win.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"/><title>收據 ${payment.receiptNumber}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; font-family: "Microsoft JhengHei","PingFang TC",sans-serif; }
  body { font-size: 10pt; color: #1a1a1a; }
  .header { text-align: center; border-bottom: 2px solid #1a3a8f; padding-bottom: 6px; margin-bottom: 10px; }
  .company { font-size: 16pt; font-weight: 900; color: #1a3a8f; }
  .sub { font-size: 8pt; color: #666; margin-top: 2px; }
  .title { font-size: 14pt; font-weight: 700; text-align: center; margin: 10px 0; letter-spacing: 2px; }
  .info { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .info td { padding: 4px 6px; border-bottom: 1px dotted #ccc; }
  .info .label { color: #666; width: 35%; }
  .amount { font-size: 18pt; font-weight: 900; color: #1a3a8f; text-align: center; margin: 12px 0; padding: 10px; border: 2px solid #1a3a8f; border-radius: 8px; }
  .footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 8pt; color: #888; display: flex; justify-content: space-between; }
  .seal { text-align: right; margin-top: 16px; font-size: 9pt; }
</style></head><body>
<div class="header">
  <div class="company">${COMPANY}</div>
  <div class="sub">${COMPANY_ADDR} | ${COMPANY_TEL} | 統編：${COMPANY_TAX}</div>
</div>
<div class="title">收　　款　　收　　據</div>
<table class="info">
  <tr><td class="label">收據號碼</td><td><strong>${payment.receiptNumber}</strong></td></tr>
  <tr><td class="label">收款日期</td><td>${format(new Date(payment.createdAt), "yyyy 年 MM 月 dd 日")}</td></tr>
  <tr><td class="label">訂單號碼</td><td>#${order.id}</td></tr>
  <tr><td class="label">客戶名稱</td><td>${order.customerName}</td></tr>
  <tr><td class="label">公司抬頭</td><td>${companyTitle}</td></tr>
  <tr><td class="label">統一編號</td><td>${taxId}</td></tr>
  <tr><td class="label">付款方式</td><td>${METHOD_LABELS[payment.method] ?? payment.method}</td></tr>
  <tr><td class="label">貨物描述</td><td>${order.cargoDescription}</td></tr>
  ${payment.note ? `<tr><td class="label">備　　註</td><td>${payment.note}</td></tr>` : ""}
</table>
<div class="amount">收款金額：${nt(payment.amount)}</div>
<div class="seal">
  <div>收款人簽章：________________</div>
  <div style="margin-top:8px">客戶簽收：________________</div>
</div>
<div class="footer">
  <span>由 ${payment.collectedBy ?? "管理員"} 收款</span>
  <span>${COMPANY} · 系統自動產生</span>
</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function RecordPaymentDialog({
  order,
  open,
  onClose,
  onSuccess,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [taxId, setTaxId] = useState("");
  const [sendNotification, setSendNotification] = useState(false);

  const remaining = order ? (order.totalFee ?? 0) - ((order as any).paidAmount ?? 0) : 0;

  const { data: bankInfo } = useQuery({
    queryKey: ["bank-info"],
    queryFn: async () => {
      const r = await fetch("/api/payments/bank-info");
      return r.json() as Promise<{ bank: string; branch: string; account: string; name: string }>;
    },
  });

  const { data: orderPayments } = useQuery({
    queryKey: ["order-payments", order?.id],
    queryFn: async () => {
      const r = await fetch(`/api/payments/order/${order!.id}`);
      return r.json() as Promise<{ payments: Payment[]; paidAmount: number }>;
    },
    enabled: !!order,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order!.id,
          amount: parseFloat(amount),
          method,
          note: note || undefined,
          collectedBy: "admin",
          receiptCompanyTitle: companyTitle || undefined,
          receiptTaxId: taxId || undefined,
          sendNotification,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ payment: Payment; receiptNumber: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "✅ 收款成功", description: `收據號碼：${data.receiptNumber}` });
      qc.invalidateQueries({ queryKey: ["unpaid-orders"] });
      qc.invalidateQueries({ queryKey: ["all-payments"] });
      qc.invalidateQueries({ queryKey: ["order-payments", order?.id] });
      setAmount("");
      setNote("");
      onSuccess();
    },
    onError: () => {
      toast({ title: "收款失敗", variant: "destructive" });
    },
  });

  if (!order) return null;
  const total = order.totalFee ?? 0;
  const paid = orderPayments?.paidAmount ?? 0;
  const rem = Math.max(0, total - paid);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            收款 — 訂單 #{order.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-sm bg-muted/30 rounded-lg p-3">
            <div><p className="text-xs text-muted-foreground">應收金額</p><p className="font-bold">{nt(total)}</p></div>
            <div><p className="text-xs text-muted-foreground">已收金額</p><p className="font-bold text-emerald-600">{nt(paid)}</p></div>
            <div><p className="text-xs text-muted-foreground">尚欠金額</p><p className={`font-bold ${rem > 0 ? "text-orange-600" : "text-emerald-600"}`}>{nt(rem)}</p></div>
          </div>

          <div className="text-xs text-muted-foreground">
            <span className="font-medium">客戶：</span>{order.customerName} · {order.customerPhone}
          </div>

          {orderPayments?.payments.filter(p => !p.isVoided).length ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">既有收款紀錄</p>
              {orderPayments.payments.filter(p => !p.isVoided).map(p => (
                <div key={p.id} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">{format(new Date(p.createdAt), "MM/dd HH:mm")}</span>
                  <MethodBadge method={p.method} />
                  <span className="font-bold text-emerald-700">{nt(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="border-t pt-3 space-y-3">
            <div>
              <Label className="text-xs font-semibold">付款方式</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {(["cash", "bank_transfer", "line_pay", "credit_card"] as const).map(m => {
                  const Icon = METHOD_ICONS[m];
                  return (
                    <button key={m} type="button"
                      onClick={() => setMethod(m)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${method === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"}`}>
                      <Icon className="w-4 h-4" /> {METHOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {method === "bank_transfer" && bankInfo && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs space-y-1">
                <p className="font-semibold text-blue-800 flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> 銀行轉帳帳號</p>
                <p><span className="text-blue-600">銀行：</span>{bankInfo.bank} {bankInfo.branch}</p>
                <p><span className="text-blue-600">帳號：</span><span className="font-mono font-bold">{bankInfo.account}</span></p>
                <p><span className="text-blue-600">戶名：</span>{bankInfo.name}</p>
              </div>
            )}

            <div>
              <Label className="text-xs font-semibold">收款金額 (NT$)</Label>
              <div className="flex gap-2 mt-1">
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="輸入金額" className="text-sm" min={1} />
                {rem > 0 && (
                  <Button variant="outline" size="sm" type="button" onClick={() => setAmount(String(rem))} className="text-xs whitespace-nowrap">
                    全額 {nt(rem)}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">發票 / 收據資訊（選填）</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Input value={companyTitle} onChange={e => setCompanyTitle(e.target.value)} placeholder="公司抬頭" className="text-xs" />
                <Input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="統一編號" className="text-xs" maxLength={8} />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">備註（選填）</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="收款備註" className="text-xs mt-1" />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <input type="checkbox" id="sendNotif" checked={sendNotification} onChange={e => setSendNotification(e.target.checked)} className="rounded" />
              <label htmlFor="sendNotif" className="text-muted-foreground cursor-pointer">發送付款確認通知給客戶（LINE/簡訊）</label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700">
            {mutation.isPending ? "處理中..." : "確認收款"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrderPaymentTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [feeFilter, setFeeFilter] = useState("all");
  const [collectOrder, setCollectOrder] = useState<OrderWithPaid | null>(null);
  const [viewPaymentsOrder, setViewPaymentsOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery<OrderWithPaid[]>({
    queryKey: ["all-orders-with-payments"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      if (!r.ok) throw new Error("Failed");
      const raw = await r.json() as Order[];
      const withPaid = await Promise.all(raw.map(async o => {
        try {
          const pr = await fetch(`/api/payments/order/${o.id}`);
          const pd = await pr.json() as { paidAmount: number };
          return { ...o, paidAmount: pd.paidAmount };
        } catch { return { ...o, paidAmount: 0 }; }
      }));
      return withPaid;
    },
    staleTime: 15000,
  });

  const { data: orderPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["order-payments", viewPaymentsOrder?.id],
    queryFn: async () => {
      const r = await fetch(`/api/payments/order/${viewPaymentsOrder!.id}`);
      return r.json() as Promise<{ payments: Payment[]; paidAmount: number }>;
    },
    enabled: !!viewPaymentsOrder,
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await fetch(`/api/payments/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "已作廢收款紀錄" });
      qc.invalidateQueries({ queryKey: ["order-payments", viewPaymentsOrder?.id] });
      qc.invalidateQueries({ queryKey: ["all-orders-with-payments"] });
      qc.invalidateQueries({ queryKey: ["unpaid-orders"] });
    },
  });

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const total = o.totalFee ?? 0;
      const paid = o.paidAmount ?? 0;
      if (feeFilter === "unpaid" && paid >= total && total > 0) return false;
      if (feeFilter === "paid" && (paid < total || total === 0)) return false;
      if (feeFilter === "partial" && !(paid > 0 && paid < total)) return false;
      if (search) {
        const kw = search.toLowerCase();
        return [o.customerName, o.customerPhone, o.cargoDescription, String(o.id)].some(v => v?.toLowerCase().includes(kw));
      }
      return true;
    });
  }, [orders, feeFilter, search]);

  const totalAmount = orders.reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const totalPaid = orders.reduce((s, o) => s + (o.paidAmount ?? 0), 0);
  const totalUnpaid = totalAmount - totalPaid;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "總應收", value: nt(totalAmount), color: "text-foreground", bg: "bg-muted/30" },
          { label: "已收款", value: nt(totalPaid), color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "未收款", value: nt(totalUnpaid), color: "text-orange-600", bg: "bg-orange-50" },
        ].map(c => (
          <Card key={c.label} className={`${c.bg} border-0 shadow-sm`}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-black mt-0.5 ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="搜尋客戶/訂單…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={feeFilter} onValueChange={setFeeFilter}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="unpaid">未付款</SelectItem>
            <SelectItem value="partial">部分付款</SelectItem>
            <SelectItem value="paid">已付清</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-primary text-white text-xs">
              <tr>
                <th className="px-3 py-2.5 text-left">訂單</th>
                <th className="px-3 py-2.5 text-left">客戶</th>
                <th className="px-3 py-2.5 text-right">應收</th>
                <th className="px-3 py-2.5 text-right">已收</th>
                <th className="px-3 py-2.5 text-right">尚欠</th>
                <th className="px-3 py-2.5 text-center">狀態</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">暫無資料</td></tr>
              ) : filtered.map((o, i) => {
                const total = o.totalFee ?? 0;
                const paid = o.paidAmount ?? 0;
                const rem = Math.max(0, total - paid);
                return (
                  <tr key={o.id} className={i % 2 === 0 ? "" : "bg-muted/10"}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-bold text-xs">#{o.id}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(o.createdAt), "MM/dd HH:mm")}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-xs">{o.customerName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{o.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-xs">{total > 0 ? nt(total) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-emerald-600 font-semibold">{paid > 0 ? nt(paid) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-orange-600">{rem > 0 ? nt(rem) : "—"}</td>
                    <td className="px-3 py-2.5 text-center"><PaymentStatusBadge order={o} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setViewPaymentsOrder(o)}>
                          <ReceiptText className="w-3 h-3" />
                        </Button>
                        {(total === 0 || paid < total) && (
                          <Button size="sm" className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => setCollectOrder(o)}>
                            <Plus className="w-3 h-3" /> 收款
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <RecordPaymentDialog
        order={collectOrder}
        open={!!collectOrder}
        onClose={() => setCollectOrder(null)}
        onSuccess={() => {
          setCollectOrder(null);
          qc.invalidateQueries({ queryKey: ["all-orders-with-payments"] });
        }}
      />

      <Dialog open={!!viewPaymentsOrder} onOpenChange={o => { if (!o) setViewPaymentsOrder(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ReceiptText className="w-4 h-4" /> 收款紀錄 — 訂單 #{viewPaymentsOrder?.id}
            </DialogTitle>
          </DialogHeader>
          {paymentsLoading ? (
            <p className="text-center text-muted-foreground text-xs py-6">載入中...</p>
          ) : orderPayments?.payments.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-6">尚無收款紀錄</p>
          ) : (
            <div className="space-y-2">
              {orderPayments?.payments.map(p => (
                <div key={p.id} className={`rounded-lg border p-3 text-xs ${p.isVoided ? "opacity-50 bg-muted/20" : "bg-card"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <MethodBadge method={p.method} />
                      {p.isVoided && <Badge variant="destructive" className="text-xs">已作廢</Badge>}
                    </div>
                    <span className="font-black text-base text-emerald-700">{nt(p.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{format(new Date(p.createdAt), "yyyy/MM/dd HH:mm")}</span>
                    <span className="font-mono">{p.receiptNumber}</span>
                  </div>
                  {p.receiptCompanyTitle && <div className="text-muted-foreground mt-1">抬頭：{p.receiptCompanyTitle} · 統編：{p.receiptTaxId || "—"}</div>}
                  {p.note && <div className="text-muted-foreground mt-0.5">備註：{p.note}</div>}
                  {p.isVoided && p.voidReason && <div className="text-red-600 mt-0.5">作廢原因：{p.voidReason}</div>}
                  {!p.isVoided && (
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => printReceipt(p, viewPaymentsOrder!)}>
                        <Printer className="w-3 h-3 mr-0.5" /> 列印收據
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-600 hover:text-red-700"
                        onClick={() => {
                          const reason = prompt("作廢原因（選填）") ?? "管理員作廢";
                          voidMutation.mutate({ id: p.id, reason });
                        }}>
                        <X className="w-3 h-3 mr-0.5" /> 作廢
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportTab() {
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["payment-report", mode, year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ mode, year: String(year), month: String(month) });
      const r = await fetch(`/api/payments/report?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  function exportCSV() {
    if (!data) return;
    const header = mode === "daily" ? "日期,收款筆數,總金額,現金,轉帳,LINE Pay,信用卡" : "月份,收款筆數,總金額,現金,轉帳,LINE Pay,信用卡";
    const rows = data.rows.map(r =>
      [r.date, r.count, Math.round(r.total),
       Math.round(r.byMethod.cash ?? 0), Math.round(r.byMethod.bank_transfer ?? 0),
       Math.round(r.byMethod.line_pay ?? 0), Math.round(r.byMethod.credit_card ?? 0)].join(",")
    );
    const csv = [header, ...rows, `合計,,${Math.round(data.grandTotal)}`].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `收款報表_${year}${mode === "daily" ? String(month).padStart(2, "0") : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex border rounded-lg overflow-hidden">
          {(["daily", "monthly"] as const).map(m => (
            <button key={m} type="button"
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? "bg-primary text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}
              onClick={() => setMode(m)}>
              {m === "daily" ? "月報（日明細）" : "年報（月摘要）"}
            </button>
          ))}
        </div>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2023, 2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>)}
          </SelectContent>
        </Select>
        {mode === "daily" && (
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1 ml-auto" onClick={exportCSV} disabled={!data}>
          <Download className="w-3.5 h-3.5" /> 匯出 CSV
        </Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Card className="bg-primary/5 border-primary/20 col-span-2 sm:col-span-1">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">合計收款</p>
              <p className="text-lg font-black text-primary">{nt(data.grandTotal)}</p>
              <p className="text-xs text-muted-foreground">{data.count} 筆</p>
            </CardContent>
          </Card>
          {Object.entries(METHOD_LABELS).map(([key, label]) => (
            <Card key={key} className="border-0 bg-muted/20">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-bold text-sm">{nt(data.byMethod[key] ?? 0)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead className="bg-primary text-white">
              <tr>
                <th className="px-3 py-2.5 text-left">{mode === "daily" ? "日期" : "月份"}</th>
                <th className="px-3 py-2.5 text-right">筆數</th>
                <th className="px-3 py-2.5 text-right">總金額</th>
                <th className="px-3 py-2.5 text-right">現金</th>
                <th className="px-3 py-2.5 text-right">轉帳</th>
                <th className="px-3 py-2.5 text-right">LINE Pay</th>
                <th className="px-3 py-2.5 text-right">信用卡</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">載入中...</td></tr>
              ) : !data?.rows.length ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">該期間無收款紀錄</td></tr>
              ) : data.rows.map((r, i) => (
                <tr key={r.date} className={i % 2 === 0 ? "" : "bg-muted/10"}>
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  <td className="px-3 py-2 text-right">{r.count}</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700">{nt(r.total)}</td>
                  <td className="px-3 py-2 text-right">{r.byMethod.cash ? nt(r.byMethod.cash) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.byMethod.bank_transfer ? nt(r.byMethod.bank_transfer) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.byMethod.line_pay ? nt(r.byMethod.line_pay) : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.byMethod.credit_card ? nt(r.byMethod.credit_card) : "—"}</td>
                </tr>
              ))}
            </tbody>
            {data?.rows.length ? (
              <tfoot>
                <tr className="bg-amber-50 border-t-2 border-orange-300 font-black">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-right">{data.count}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{nt(data.grandTotal)}</td>
                  <td className="px-3 py-2 text-right">{nt(data.byMethod.cash ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{nt(data.byMethod.bank_transfer ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{nt(data.byMethod.line_pay ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{nt(data.byMethod.credit_card ?? 0)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
    </div>
  );
}

function UnpaidTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [collectOrder, setCollectOrder] = useState<OrderWithPaid | null>(null);

  const { data: unpaid = [], isLoading } = useQuery<OrderWithPaid[]>({
    queryKey: ["unpaid-orders"],
    queryFn: async () => {
      const r = await fetch("/api/payments/unpaid");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const notifyMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch("/api/payments/notify-unpaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ message: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "提醒已發送", description: data.message });
    },
    onError: () => {
      toast({ title: "發送失敗", variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!search) return unpaid;
    const kw = search.toLowerCase();
    return unpaid.filter(o =>
      [o.customerName, o.customerPhone, String(o.id), o.cargoDescription].some(v => v?.toLowerCase().includes(kw))
    );
  }, [unpaid, search]);

  const totalUnpaid = filtered.reduce((s, o) => s + Math.max(0, (o.totalFee ?? 0) - (o.paidAmount ?? 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
        <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
        <div>
          <span className="font-semibold text-orange-800">{filtered.length} 筆未收款訂單</span>
          <span className="text-orange-600 ml-2">合計應收 {nt(totalUnpaid)}</span>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-xs" placeholder="搜尋客戶/訂單…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead className="bg-orange-600 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left">訂單</th>
                <th className="px-3 py-2.5 text-left">客戶</th>
                <th className="px-3 py-2.5 text-right">應收</th>
                <th className="px-3 py-2.5 text-right">已收</th>
                <th className="px-3 py-2.5 text-right">尚欠</th>
                <th className="px-3 py-2.5 text-center">訂單狀態</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">目前無未收款訂單</td></tr>
              ) : filtered.map((o, i) => {
                const total = o.totalFee ?? 0;
                const paid = o.paidAmount ?? 0;
                const rem = Math.max(0, total - paid);
                return (
                  <tr key={o.id} className={i % 2 === 0 ? "" : "bg-muted/10"}>
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold">#{o.id}</div>
                      <div className="text-muted-foreground">{format(new Date(o.createdAt), "MM/dd")}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-muted-foreground font-mono">{o.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{total > 0 ? nt(total) : "未報價"}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{paid > 0 ? nt(paid) : "—"}</td>
                    <td className="px-3 py-2 text-right font-black text-orange-700">{rem > 0 ? nt(rem) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className="text-xs">{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
                          onClick={() => notifyMutation.mutate(o.id)}
                          disabled={notifyMutation.isPending}>
                          <Bell className="w-3 h-3" /> 提醒
                        </Button>
                        <Button size="sm" className="h-6 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => setCollectOrder(o)}>
                          <Plus className="w-3 h-3" /> 收款
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <RecordPaymentDialog
        order={collectOrder}
        open={!!collectOrder}
        onClose={() => setCollectOrder(null)}
        onSuccess={() => {
          setCollectOrder(null);
          qc.invalidateQueries({ queryKey: ["unpaid-orders"] });
          qc.invalidateQueries({ queryKey: ["all-orders-with-payments"] });
        }}
      />
    </div>
  );
}

function AllPaymentsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const r = await fetch("/api/payments");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const voidMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const r = await fetch(`/api/payments/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "已作廢" });
      qc.invalidateQueries({ queryKey: ["all-payments"] });
      qc.invalidateQueries({ queryKey: ["unpaid-orders"] });
      qc.invalidateQueries({ queryKey: ["all-orders-with-payments"] });
    },
    onError: () => toast({ title: "作廢失敗", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return payments.filter(p => {
      if (methodFilter !== "all" && p.method !== methodFilter) return false;
      if (dateFrom) { try { if (new Date(p.createdAt) < startOfDay(parseISO(dateFrom))) return false; } catch { /* skip */ } }
      if (dateTo) { try { if (new Date(p.createdAt) > endOfDay(parseISO(dateTo))) return false; } catch { /* skip */ } }
      if (search) {
        const kw = search.toLowerCase();
        return [p.receiptNumber, String(p.orderId), p.method, p.note, p.receiptCompanyTitle].some(v => v?.toLowerCase().includes(kw));
      }
      return true;
    });
  }, [payments, methodFilter, dateFrom, dateTo, search]);

  const activeTotal = filtered.filter(p => !p.isVoided).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end bg-muted/30 rounded-xl p-3">
        <div>
          <Label className="text-xs">開始日期</Label>
          <Input type="date" className="h-8 w-36 mt-0.5 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">結束日期</Label>
          <Input type="date" className="h-8 w-36 mt-0.5 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">付款方式</Label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="h-8 text-xs w-28 mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <Label className="text-xs">搜尋</Label>
          <div className="relative mt-0.5">
            <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="h-8 pl-7 text-xs" placeholder="收據號碼/訂單/備註…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); setMethodFilter("all"); }}>清除</Button>
      </div>

      <div className="text-xs text-muted-foreground">
        篩選結果 {filtered.length} 筆（有效收款合計：<span className="font-bold text-emerald-700">{nt(activeTotal)}</span>）
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="bg-slate-700 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left">收款時間</th>
                <th className="px-3 py-2.5 text-left">收據號碼</th>
                <th className="px-3 py-2.5 text-left">訂單</th>
                <th className="px-3 py-2.5 text-left">付款方式</th>
                <th className="px-3 py-2.5 text-right">金額</th>
                <th className="px-3 py-2.5 text-left">備註</th>
                <th className="px-3 py-2.5 text-center">狀態</th>
                <th className="px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">載入中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">無收款紀錄</td></tr>
              ) : filtered.map((p, i) => (
                <tr key={p.id} className={`${p.isVoided ? "opacity-50" : ""} ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{format(new Date(p.createdAt), "MM/dd HH:mm")}</td>
                  <td className="px-3 py-2 font-mono">{p.receiptNumber}</td>
                  <td className="px-3 py-2 font-bold">#{p.orderId}</td>
                  <td className="px-3 py-2"><MethodBadge method={p.method} /></td>
                  <td className={`px-3 py-2 text-right font-bold ${p.isVoided ? "line-through text-muted-foreground" : "text-emerald-700"}`}>{nt(p.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{p.note || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {p.isVoided
                      ? <Badge variant="destructive" className="text-xs">已作廢</Badge>
                      : <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300 bg-emerald-50">有效</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!p.isVoided && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-red-600 hover:text-red-700"
                        onClick={() => {
                          const reason = prompt("作廢原因（選填）") ?? "管理員作廢";
                          voidMutation.mutate({ id: p.id, reason });
                        }}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 即時付款管理 (LINE Pay / 信用卡 / 轉帳)
// ──────────────────────────────────────────────────────────────────────
const INSTANT_METHODS = ["line_pay", "credit_card", "bank_transfer"];
const INSTANT_LABELS: Record<string, string> = { line_pay: "LINE Pay", credit_card: "信用卡", bank_transfer: "銀行轉帳" };
const INSTANT_ICONS: Record<string, any> = { line_pay: Smartphone, credit_card: CreditCard, bank_transfer: Building2 };

function InstantPaymentTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [setMethodOrder, setSetMethodOrder] = useState<any | null>(null);
  const [newMethod, setNewMethod] = useState("line_pay");

  const { data: stats } = useQuery({
    queryKey: ["payment-stats-method"],
    queryFn: () => fetch("/api/payments/stats-by-method").then(r => r.json()),
    refetchInterval: 20000,
  });
  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["instant-payment-orders"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      const all = await r.json();
      return all.filter((o: any) => INSTANT_METHODS.includes(o.paymentMethod ?? o.payment_method) || o.dispatchBlocked || o.dispatch_blocked);
    },
    refetchInterval: 15000,
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}/confirm-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gateway: "manual" }) }).then(r => r.json()),
    onSuccess: () => { toast({ title: "✅ 付款已確認，派車解鎖" }); qc.invalidateQueries({ queryKey: ["instant-payment-orders"] }); },
  });

  const genLinkMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}/generate-payment-link`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => { toast({ title: "付款連結已產生", description: data.paymentLink }); qc.invalidateQueries({ queryKey: ["instant-payment-orders"] }); },
  });

  const setMethodMut = useMutation({
    mutationFn: ({ id, method }: { id: number; method: string }) =>
      fetch(`/api/orders/${id}/payment-method`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMethod: method }) }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: `付款方式已設定`, description: data.blockDispatch ? "⚠️ 未付款前派車已鎖定" : "派車未鎖定" });
      qc.invalidateQueries({ queryKey: ["instant-payment-orders"] });
      setSetMethodOrder(null);
    },
  });

  const blocked = orders.filter((o: any) => o.dispatch_blocked || o.dispatchBlocked);
  const pending = orders.filter((o: any) => !(o.dispatch_blocked || o.dispatchBlocked) && o.fee_status !== "paid");
  const paid = orders.filter((o: any) => o.fee_status === "paid");

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "派車鎖定中", value: stats?.dispatch_blocked ?? blocked.length, color: "text-red-600", bg: "bg-red-50 border-red-200", icon: Lock },
          { label: "待付款", value: (stats?.instant_unpaid ?? pending.length), color: "text-orange-600", bg: "bg-orange-50 border-orange-200", icon: Clock },
          { label: "已付款", value: paid.length, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: Check },
          { label: "LINE Pay訂單", value: orders.filter((o: any) => (o.payment_method ?? o.paymentMethod) === "line_pay").length, color: "text-green-600", bg: "bg-green-50 border-green-200", icon: Smartphone },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Blocked orders alert */}
      {blocked.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Lock className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-bold">{blocked.length} 筆訂單因未付款已鎖定派車，請確認付款後解鎖</p>
        </div>
      )}

      {/* Order list */}
      {isLoading ? <div className="text-center py-8 text-muted-foreground">載入中...</div> : (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暫無即時付款訂單</p>
            </div>
          ) : orders.map((o: any) => {
            const method = o.payment_method ?? o.paymentMethod ?? "cash";
            const Icon = INSTANT_ICONS[method] ?? Banknote;
            const isBlocked = o.dispatch_blocked ?? o.dispatchBlocked;
            const isPaid = o.fee_status === "paid";
            return (
              <div key={o.id} className={`bg-card rounded-xl border p-3 flex items-center gap-3 flex-wrap ${isBlocked ? "border-red-300 bg-red-50/30" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-sm">#{o.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      isBlocked ? "bg-red-100 text-red-700" : isPaid ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                    }`}>
                      {isBlocked ? <><Lock className="w-3 h-3" /> 派車鎖定</> : isPaid ? <><Check className="w-3 h-3" /> 已付款</> : <><Clock className="w-3 h-3" /> 待付款</>}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                      method === "line_pay" ? "bg-green-100 text-green-700" : method === "credit_card" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      <Icon className="w-3 h-3" /> {INSTANT_LABELS[method] ?? method}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{o.customerName ?? o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{o.pickupAddress ?? o.pickup_address} → {o.deliveryAddress ?? o.delivery_address}</p>
                  {(o.paymentLink ?? o.payment_link) && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      <span className="truncate max-w-[260px]">{o.paymentLink ?? o.payment_link}</span>
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-base">{o.totalFee != null ? nt(o.totalFee) : o.total_fee != null ? nt(o.total_fee) : "未報價"}</p>
                  <div className="flex gap-1 mt-1 justify-end flex-wrap">
                    {!isPaid && (
                      <Button size="sm" className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => confirmMut.mutate(o.id)} disabled={confirmMut.isPending}>
                        <Check className="w-3 h-3 mr-1" /> 確認付款
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                      onClick={() => genLinkMut.mutate(o.id)} disabled={genLinkMut.isPending}>
                      <Link2 className="w-3 h-3 mr-1" /> 產生連結
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Set payment method dialog */}
      {setMethodOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold mb-4">設定付款方式 — 訂單 #{setMethodOrder.id}</h3>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {[...INSTANT_METHODS, "cash", "monthly"].map(m => {
                const Icon = INSTANT_ICONS[m] ?? Banknote;
                return (
                  <label key={m} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer ${newMethod === m ? "border-blue-500 bg-blue-50" : ""}`}>
                    <input type="radio" name="pm" value={m} checked={newMethod === m} onChange={() => setNewMethod(m)} />
                    <Icon className="w-4 h-4" />
                    <div>
                      <p className="font-bold text-sm">{METHOD_LABELS[m] ?? m}</p>
                      {INSTANT_METHODS.includes(m) && <p className="text-xs text-orange-600">未付款將鎖定派車</p>}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setSetMethodOrder(null)} className="flex-1">取消</Button>
              <Button onClick={() => setMethodMut.mutate({ id: setMethodOrder.id, method: newMethod })} className="flex-1 bg-blue-600">確認</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 現金管理：司機回報 → 管理員確認
// ──────────────────────────────────────────────────────────────────────
function CashManagementTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: pending = [], isLoading } = useQuery<any[]>({
    queryKey: ["cash-pending"],
    queryFn: () => fetch("/api/payments/cash-pending").then(r => r.json()),
    refetchInterval: 15000,
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}/confirm-cash`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { toast({ title: "✅ 現金已確認收訖" }); qc.invalidateQueries({ queryKey: ["cash-pending"] }); },
  });

  // Also show cash orders that haven't been reported yet (in_transit)
  const { data: unreported = [] } = useQuery<any[]>({
    queryKey: ["cash-unreported"],
    queryFn: async () => {
      const r = await fetch("/api/orders");
      const all = await r.json();
      return all.filter((o: any) =>
        (o.payment_method ?? o.paymentMethod) === "cash" &&
        ["in_transit", "delivered"].includes(o.status) &&
        !o.cash_reported_at &&
        o.fee_status !== "paid"
      );
    },
    refetchInterval: 20000,
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-orange-600">{pending.length}</p>
          <p className="text-xs text-muted-foreground">待確認現金</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-yellow-600">{unreported.length}</p>
          <p className="text-xs text-muted-foreground">司機未回報</p>
        </div>
      </div>

      {/* Pending confirmation */}
      <div>
        <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-emerald-600" /> 待確認現金收款（{pending.length}）
        </h3>
        {isLoading ? <div className="text-xs text-muted-foreground py-4 text-center">載入中...</div>
          : pending.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">目前無待確認現金</p>
          : (
          <div className="space-y-2">
            {pending.map((o: any) => (
              <div key={o.id} className="bg-card rounded-xl border p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">#{o.id}</span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">司機已回報</span>
                  </div>
                  <p className="text-sm font-medium">{o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">
                    司機：{o.driver_name ?? "—"} · 回報時間：{o.cash_reported_at ? format(new Date(o.cash_reported_at), "MM/dd HH:mm") : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">回報人：{o.cash_reported_by ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-base text-emerald-700">{nt(o.total_fee ?? 0)}</p>
                  <Button size="sm" className="mt-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => confirmMut.mutate(o.id)} disabled={confirmMut.isPending}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> 確認收到
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unreported */}
      {unreported.length > 0 && (
        <div>
          <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" /> 配送中/已送達但未回報現金（{unreported.length}）
          </h3>
          <div className="space-y-2">
            {unreported.map((o: any) => (
              <div key={o.id} className="bg-card rounded-xl border border-yellow-200 p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">#{o.id}</span>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Truck className="w-3 h-3" /> {o.status === "in_transit" ? "配送中" : "已送達"}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{o.customerName ?? o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">司機：{o.driverName ?? o.driver_name ?? "未指派"}</p>
                </div>
                <p className="font-black text-orange-700">{nt(o.totalFee ?? o.total_fee ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 月結管理
// ──────────────────────────────────────────────────────────────────────
const STMT_STATUS: Record<string, { label: string; color: string }> = {
  draft:    { label: "草稿", color: "bg-gray-100 text-gray-600" },
  sent:     { label: "已寄出", color: "bg-blue-100 text-blue-700" },
  paid:     { label: "已付款", color: "bg-emerald-100 text-emerald-700" },
  overdue:  { label: "逾期", color: "bg-red-100 text-red-700" },
  disputed: { label: "爭議中", color: "bg-orange-100 text-orange-700" },
};

function MonthlyStatementTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [genYear, setGenYear] = useState(String(now.getFullYear()));
  const [genMonth, setGenMonth] = useState(String(now.getMonth() === 0 ? 12 : now.getMonth()));
  const [statusFilter, setStatusFilter] = useState("");

  const { data: stmts = [], isLoading } = useQuery<any[]>({
    queryKey: ["monthly-stmts", statusFilter],
    queryFn: () => fetch(`/api/monthly-statements${statusFilter ? `?status=${statusFilter}` : ""}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const genMut = useMutation({
    mutationFn: () => fetch("/api/monthly-statements/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: Number(genYear), month: Number(genMonth) }),
    }).then(r => r.json()),
    onSuccess: (d) => {
      toast({ title: "✅ 月結帳單已產生", description: `${d.orderCount} 筆訂單，共 NT$${Math.round(d.statement?.total_amount ?? 0).toLocaleString()}` });
      qc.invalidateQueries({ queryKey: ["monthly-stmts"] });
    },
    onError: () => toast({ title: "產生失敗", variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: string; note?: string }) =>
      fetch(`/api/monthly-statements/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentNote: note }),
      }).then(r => r.json()),
    onSuccess: () => { toast({ title: "狀態已更新" }); qc.invalidateQueries({ queryKey: ["monthly-stmts"] }); },
  });

  const totalUnpaid = stmts.filter(s => s.status !== "paid").reduce((a, s) => a + (s.total_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-blue-600">{stmts.length}</p>
          <p className="text-xs text-muted-foreground">帳單總數</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-red-600">{stmts.filter(s => s.status !== "paid").length}</p>
          <p className="text-xs text-muted-foreground">未收款帳單</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
          <p className="text-xl font-black text-orange-600">{nt(totalUnpaid)}</p>
          <p className="text-xs text-muted-foreground">應收款合計</p>
        </div>
      </div>

      {/* Generate */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" /> 產生月結帳單
        </h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <Label className="text-xs">年份</Label>
            <select className="mt-1 w-24 border rounded-lg px-2 py-1.5 text-sm bg-background"
              value={genYear} onChange={e => setGenYear(e.target.value)}>
              {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">月份</Label>
            <select className="mt-1 w-20 border rounded-lg px-2 py-1.5 text-sm bg-background"
              value={genMonth} onChange={e => setGenMonth(e.target.value)}>
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}
            </select>
          </div>
          <Button onClick={() => genMut.mutate()} disabled={genMut.isPending}
            className="bg-blue-600 hover:bg-blue-700">
            {genMut.isPending ? "產生中..." : "產生帳單"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">自動彙整所選期間、付款方式為「月結」的所有訂單，含 5% 稅金</p>
      </div>

      {/* Filter */}
      <div className="flex gap-1 flex-wrap">
        {[{v:"",l:"全部"}, ...Object.entries(STMT_STATUS).map(([v,c]) => ({v, l: c.label}))].map(f => (
          <button key={f.v} onClick={() => setStatusFilter(f.v)}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${statusFilter===f.v ? "bg-blue-600 text-white border-blue-600" : "hover:bg-muted"}`}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Statement list */}
      {isLoading ? <div className="py-8 text-center text-muted-foreground">載入中...</div>
        : stmts.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">尚無月結帳單</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stmts.map((s: any) => {
              const sc = STMT_STATUS[s.status] ?? STMT_STATUS.draft;
              return (
                <div key={s.id} className="bg-card rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-sm">{s.period_year}年{s.period_month}月</p>
                      <p className="text-xs text-muted-foreground">{s.customer_label ?? "全部客戶"} · {s.order_count}筆訂單</p>
                      {s.due_date && <p className="text-xs text-muted-foreground">應付日期：{s.due_date}</p>}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${sc.color}`}>{sc.label}</span>
                      <p className="font-black text-lg mt-1">{nt(s.total_amount ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">含稅 {nt(s.tax_amount ?? 0)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {s.status === "draft" && (
                      <button onClick={() => statusMut.mutate({ id: s.id, status: "sent" })}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1">
                        <Send className="w-3 h-3" /> 標記已寄出
                      </button>
                    )}
                    {["sent","overdue"].includes(s.status) && (
                      <button onClick={() => {
                        const note = prompt("付款備注（可選）");
                        statusMut.mutate({ id: s.id, status: "paid", note: note ?? undefined });
                      }}
                        className="text-xs px-2 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> 標記已收款
                      </button>
                    )}
                    {s.status === "sent" && (
                      <button onClick={() => statusMut.mutate({ id: s.id, status: "overdue" })}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 標記逾期
                      </button>
                    )}
                    {["paid","rejected"].includes(s.status) ? null : (
                      <button onClick={() => statusMut.mutate({ id: s.id, status: "disputed" })}
                        className="text-xs px-2 py-1 border rounded-lg hover:bg-muted flex items-center gap-1">
                        <Ban className="w-3 h-3" /> 標記爭議
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 逾期未收款提醒
// ──────────────────────────────────────────────────────────────────────
function OverdueReminderTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [days, setDays] = useState(3);
  const [channel, setChannel] = useState("sms");
  const [batchLoading, setBatchLoading] = useState(false);

  const { data: overdue = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["overdue-orders", days],
    queryFn: () => fetch(`/api/payments/overdue?days=${days}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const sendMut = useMutation({
    mutationFn: (orderId: number) => fetch("/api/payments/send-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, channel }),
    }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: "提醒已發送", description: data.message?.slice(0, 60) + "..." });
      qc.invalidateQueries({ queryKey: ["overdue-orders"] });
    },
  });

  const batchSend = async () => {
    if (!confirm(`確認批量發送 ${overdue.length} 筆逾期提醒？`)) return;
    setBatchLoading(true);
    const r = await fetch("/api/payments/batch-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days, channel }),
    });
    const d = await r.json();
    setBatchLoading(false);
    toast({ title: `批量提醒完成`, description: `成功發送 ${d.sent} 筆提醒` });
    qc.invalidateQueries({ queryKey: ["overdue-orders"] });
  };

  const totalOutstanding = overdue.reduce((a, o) => a + (Number(o.outstanding) ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-muted/30 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">逾期天數</Label>
          <select className="mt-1 border rounded-lg px-2 py-1.5 text-sm bg-background"
            value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={0}>所有未付款（0天）</option>
            {[1,2,3,5,7,14,30].map(d => <option key={d} value={d}>超過{d}天</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">提醒管道</Label>
          <select className="mt-1 border rounded-lg px-2 py-1.5 text-sm bg-background"
            value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="sms">簡訊</option>
            <option value="line">LINE</option>
            <option value="email">Email</option>
            <option value="call">電話</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> 重新整理
        </Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700"
          onClick={batchSend} disabled={batchLoading || overdue.length === 0}>
          <Send className="w-3.5 h-3.5 mr-1" />
          {batchLoading ? "發送中..." : `批量提醒 (${overdue.length}筆)`}
        </Button>
      </div>

      {/* Summary */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <div>
            <span className="font-bold text-red-800">{overdue.length} 筆逾期未收款</span>
            <span className="text-red-600 ml-2">合計 {nt(totalOutstanding)}</span>
          </div>
        </div>
      )}

      {/* Overdue list */}
      {isLoading ? <div className="py-8 text-center text-muted-foreground">載入中...</div>
        : overdue.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
            <p className="text-sm">目前無逾期未收款訂單</p>
          </div>
        ) : (
          <div className="space-y-2">
            {overdue.map((o: any) => (
              <div key={o.id} className="bg-card rounded-xl border border-red-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold">#{o.id}</span>
                      {(o.reminder_count ?? 0) > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          已提醒{o.reminder_count}次
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        (o.payment_method ?? "cash") === "monthly" ? "bg-purple-100 text-purple-700"
                        : (o.payment_method ?? "cash") === "cash" ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                      }`}>
                        {METHOD_LABELS[o.payment_method ?? "cash"] ?? o.payment_method}
                      </span>
                    </div>
                    <p className="font-medium text-sm">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{o.customer_phone}</p>
                    <p className="text-xs text-muted-foreground">下單：{o.created_at ? format(new Date(o.created_at), "MM/dd") : "—"}</p>
                    {o.last_reminder_at && (
                      <p className="text-xs text-muted-foreground">上次提醒：{format(new Date(o.last_reminder_at), "MM/dd HH:mm")}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-red-700 text-base">{nt(Number(o.outstanding) ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">欠款</p>
                    <Button size="sm" className="mt-1 h-7 text-xs bg-orange-600 hover:bg-orange-700"
                      onClick={() => sendMut.mutate(o.id)} disabled={sendMut.isPending}>
                      <Bell className="w-3 h-3 mr-1" /> 發送提醒
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
export default function PaymentCenter() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-600" />
          金流收款管理
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">多元付款方式 · 現金確認 · 月結管理 · 逾期提醒 · 電子發票</p>
      </div>

      <Tabs defaultValue="collect" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full">
          <TabsTrigger value="collect" className="flex-1 text-xs gap-1 py-1.5">
            <Plus className="w-3.5 h-3.5" /> 訂單收款
          </TabsTrigger>
          <TabsTrigger value="instant" className="flex-1 text-xs gap-1 py-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-500" /> 即時付款
          </TabsTrigger>
          <TabsTrigger value="cash" className="flex-1 text-xs gap-1 py-1.5">
            <Banknote className="w-3.5 h-3.5 text-emerald-500" /> 現金管理
          </TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 text-xs gap-1 py-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-purple-500" /> 月結管理
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex-1 text-xs gap-1 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> 逾期提醒
          </TabsTrigger>
          <TabsTrigger value="unpaid" className="flex-1 text-xs gap-1 py-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> 未收款清單
          </TabsTrigger>
          <TabsTrigger value="report" className="flex-1 text-xs gap-1 py-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> 對帳報表
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 text-xs gap-1 py-1.5">
            <FileText className="w-3.5 h-3.5" /> 收款紀錄
          </TabsTrigger>
        </TabsList>

        <TabsContent value="collect" className="outline-none mt-4">
          <OrderPaymentTab />
        </TabsContent>
        <TabsContent value="instant" className="outline-none mt-4">
          <InstantPaymentTab />
        </TabsContent>
        <TabsContent value="cash" className="outline-none mt-4">
          <CashManagementTab />
        </TabsContent>
        <TabsContent value="monthly" className="outline-none mt-4">
          <MonthlyStatementTab />
        </TabsContent>
        <TabsContent value="overdue" className="outline-none mt-4">
          <OverdueReminderTab />
        </TabsContent>
        <TabsContent value="unpaid" className="outline-none mt-4">
          <UnpaidTab />
        </TabsContent>
        <TabsContent value="report" className="outline-none mt-4">
          <ReportTab />
        </TabsContent>
        <TabsContent value="history" className="outline-none mt-4">
          <AllPaymentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
