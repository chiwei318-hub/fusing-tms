import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight, CheckCircle2, Clock, CreditCard, FileText,
  AlertCircle, DollarSign, RotateCcw, ChevronRight, RefreshCw,
  Receipt, Building2, User, Plus, BadgeCheck,
} from "lucide-react";

const token = () => localStorage.getItem("auth-jwt") ?? "";
const fmtAmt = (n: number) =>
  new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft:            { label: "草稿",   color: "bg-gray-100 text-gray-700" },
    confirmed:        { label: "已確認", color: "bg-blue-100 text-blue-700" },
    invoiced:         { label: "已開票", color: "bg-purple-100 text-purple-700" },
    paid:             { label: "已收款", color: "bg-green-100 text-green-700" },
    unpaid:           { label: "未收款", color: "bg-red-100 text-red-700" },
    monthly_pending:  { label: "月結待開", color: "bg-yellow-100 text-yellow-700" },
  };
  const { label, color } = map[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>;
}

// ─── Flow Diagram ────────────────────────────────────────────────────────────
function FlowStep({
  icon, label, desc, color = "blue", done = false, muted = false,
}: {
  icon: React.ReactNode; label: string; desc?: string;
  color?: string; done?: boolean; muted?: boolean;
}) {
  const ring = done
    ? "ring-2 ring-green-400 bg-green-50"
    : muted
    ? "bg-gray-50 opacity-50"
    : `bg-${color}-50 ring-1 ring-${color}-200`;

  return (
    <div className={`flex flex-col items-center gap-1 rounded-xl p-3 w-28 text-center ${ring}`}>
      <div className={`text-${done ? "green" : color}-500`}>{icon}</div>
      <p className="text-xs font-semibold leading-tight">{label}</p>
      {desc && <p className="text-[10px] text-gray-400 leading-tight">{desc}</p>}
    </div>
  );
}

function Arrow() {
  return <ChevronRight className="text-gray-300 shrink-0" size={20} />;
}

function FlowDiagram() {
  return (
    <Card className="mb-6 bg-gradient-to-br from-slate-50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw size={16} className="text-indigo-500" />
          訂單金流完整閉環
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Common steps */}
        <div className="flex items-center flex-wrap gap-1 mb-4">
          <FlowStep icon={<Plus size={18}/>}       label="建立訂單"  desc="報價確認"         color="slate" />
          <Arrow />
          <FlowStep icon={<CheckCircle2 size={18}/>} label="確認下單" desc="訂單編號產生"     color="slate" />
          <Arrow />
          <FlowStep icon={<ArrowRight size={18}/>}  label="派車"     desc="指派司機"         color="blue" />
          <Arrow />
          <FlowStep icon={<Clock size={18}/>}       label="執行中"   desc="到點/簽收/POD"    color="blue" />
          <Arrow />
          <FlowStep icon={<CheckCircle2 size={18}/>} label="完成交付" desc="系統判斷客戶類型" color="indigo" />
        </div>

        {/* Branch */}
        <div className="grid grid-cols-2 gap-6 mt-2">
          {/* Cash */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">現結客戶</span>
              <Separator className="flex-1" />
            </div>
            <div className="flex flex-wrap gap-1 items-center">
              <FlowStep icon={<FileText size={16}/>}    label="自動開票"  desc="電子發票"         color="green" />
              <Arrow />
              <FlowStep icon={<Receipt size={16}/>}     label="號碼寫回"  desc="訂單綁定"         color="green" />
              <Arrow />
              <FlowStep icon={<ArrowRight size={16}/>}  label="PDF/LINE"  desc="即時通知"         color="teal" />
              <Arrow />
              <FlowStep icon={<DollarSign size={16}/>}  label="收款"      desc="AR 入帳"          color="emerald" />
              <Arrow />
              <FlowStep icon={<BadgeCheck size={16}/>}  label="自動對帳"  desc="✓ 閉環"           color="emerald" done />
            </div>
          </div>

          {/* Monthly */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-purple-600" />
              <span className="text-sm font-semibold text-purple-700">月結客戶</span>
              <Separator className="flex-1" />
            </div>
            <div className="flex flex-wrap gap-1 items-center">
              <FlowStep icon={<AlertCircle size={16}/>} label="掛應收"     desc="AR Ledger"       color="purple" />
              <Arrow />
              <FlowStep icon={<FileText size={16}/>}    label="累積帳單"   desc="月底匯總"        color="purple" />
              <Arrow />
              <FlowStep icon={<CheckCircle2 size={16}/>} label="客戶確認"  desc="簽核帳單"        color="violet" />
              <Arrow />
              <FlowStep icon={<Receipt size={16}/>}     label="批次開票"   desc="PDF/LINE"        color="violet" />
              <Arrow />
              <FlowStep icon={<DollarSign size={16}/>}  label="收款"       desc="AR 入帳"         color="fuchsia" />
              <Arrow />
              <FlowStep icon={<BadgeCheck size={16}/>}  label="自動對帳"   desc="✓ 閉環"          color="fuchsia" done />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── AR Summary ──────────────────────────────────────────────────────────────
function ARSummaryCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["ar-summary"],
    queryFn: () =>
      fetch(apiUrl("/ar-ledger/summary"), {
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const totalBalance = data?.total_balance ?? 0;
  const enterprises = (data?.enterprises ?? []) as any[];
  const entMonthly = enterprises.filter((e: any) => e.billing_type === "monthly");
  const entPrepaid = enterprises.filter((e: any) => e.billing_type !== "monthly");

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card className="border-red-100 bg-red-50">
        <CardContent className="pt-4">
          <p className="text-xs text-red-500 font-medium">總應收餘額</p>
          <p className="text-2xl font-bold text-red-700">{isLoading ? "…" : fmtAmt(totalBalance)}</p>
        </CardContent>
      </Card>
      <Card className="border-purple-100 bg-purple-50">
        <CardContent className="pt-4">
          <p className="text-xs text-purple-500 font-medium">月結企業客戶</p>
          <p className="text-2xl font-bold text-purple-700">{isLoading ? "…" : entMonthly.length} 家</p>
          <p className="text-xs text-purple-400 mt-1">
            應收 {fmtAmt(entMonthly.reduce((s: number, e: any) => s + Number(e.balance ?? 0), 0))}
          </p>
        </CardContent>
      </Card>
      <Card className="border-green-100 bg-green-50">
        <CardContent className="pt-4">
          <p className="text-xs text-green-500 font-medium">現結企業客戶</p>
          <p className="text-2xl font-bold text-green-700">{isLoading ? "…" : entPrepaid.length} 家</p>
          <p className="text-xs text-green-400 mt-1">
            應收 {fmtAmt(entPrepaid.reduce((s: number, e: any) => s + Number(e.balance ?? 0), 0))}
          </p>
        </CardContent>
      </Card>
      <Card className="border-blue-100 bg-blue-50">
        <CardContent className="pt-4">
          <p className="text-xs text-blue-500 font-medium">散客應收</p>
          <p className="text-2xl font-bold text-blue-700">
            {isLoading ? "…" : fmtAmt((data?.customers ?? []).reduce((s: number, c: any) => s + Number(c.balance ?? 0), 0))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── AR Ledger Table ─────────────────────────────────────────────────────────
function ARLedgerTable() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ar-ledger-list", page, type],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "40" });
      if (type !== "all") params.set("type", type);
      return fetch(apiUrl(`/ar-ledger?${params}`), {
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json());
    },
  });

  const entries = (data?.entries ?? []) as any[];

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold">AR 分類帳明細</h3>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部類型</SelectItem>
            <SelectItem value="receivable">應收款</SelectItem>
            <SelectItem value="payment">已收款</SelectItem>
            <SelectItem value="credit_note">折讓</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw size={14} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">日期</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">類型</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">訂單編號</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">客戶</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">金額</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">備註</th>
              <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">對帳</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">載入中…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">尚無分錄</td></tr>
            ) : entries.map((e: any) => {
              const isReceivable = e.entry_type === "receivable";
              const isPay = e.entry_type === "payment";
              return (
                <tr key={e.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(e.created_at).toLocaleDateString("zh-TW")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      isReceivable ? "bg-red-50 text-red-600"
                      : isPay      ? "bg-green-50 text-green-600"
                      :              "bg-gray-100 text-gray-600"
                    }`}>
                      {isReceivable ? "應收" : isPay ? "收款" : e.entry_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {e.order_no ?? (e.order_id ? `#${e.order_id}` : "—")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.enterprise_name ?? e.order_customer ?? "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${
                    Number(e.amount) > 0 ? "text-red-600" : "text-green-600"
                  }`}>
                    {Number(e.amount) > 0 ? "+" : ""}{fmtAmt(Number(e.amount))}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate">{e.note}</td>
                  <td className="px-3 py-2 text-center">
                    {e.reconciled
                      ? <BadgeCheck size={16} className="text-green-500 mx-auto" />
                      : <Clock size={16} className="text-gray-300 mx-auto" />
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-3">
        <span className="text-xs text-gray-400">共 {data?.total ?? 0} 筆</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一頁</Button>
          <span className="text-xs text-gray-500 self-center">第 {page} 頁</span>
          <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)}>下一頁</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Dialog ───────────────────────────────────────────────────────────
function PaymentDialog({ open, onClose, enterprises }: {
  open: boolean; onClose: () => void; enterprises: any[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    enterprise_id: "", customer_id: "", amount: "",
    payment_method: "transfer", note: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      fetch(apiUrl("/ar-ledger/payment"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          enterprise_id: form.enterprise_id ? Number(form.enterprise_id) : undefined,
          customer_id:   form.customer_id   ? Number(form.customer_id)   : undefined,
          amount:        Number(form.amount),
          payment_method: form.payment_method,
          note: form.note || undefined,
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ar-summary"] });
      qc.invalidateQueries({ queryKey: ["ar-ledger-list"] });
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign size={18} className="text-green-500" /> 登錄收款
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">企業客戶（月結）</Label>
            <Select value={form.enterprise_id} onValueChange={v => setForm(f => ({ ...f, enterprise_id: v, customer_id: "" }))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="選擇企業…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— 不選 —</SelectItem>
                {enterprises.map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.company_name} {e.balance > 0 ? `（應收 ${fmtAmt(e.balance)}）` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">金額（含稅）</Label>
            <Input
              type="number" min={0} className="mt-1"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="NT$"
            />
          </div>

          <div>
            <Label className="text-xs">收款方式</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">匯款</SelectItem>
                <SelectItem value="cash">現金</SelectItem>
                <SelectItem value="check">支票</SelectItem>
                <SelectItem value="credit_card">信用卡</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">備註</Label>
            <Input
              className="mt-1" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="轉帳後五碼、支票號碼…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            disabled={!form.amount || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "登錄中…" : "確認收款"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monthly Bills Panel ──────────────────────────────────────────────────────
function MonthlyBillsPanel() {
  const qc = useQueryClient();
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({
    enterprise_id: "",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const { data: bills, isLoading, refetch } = useQuery({
    queryKey: ["monthly-bills"],
    queryFn: () =>
      fetch(apiUrl("/monthly-bills"), {
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
  });

  const { data: arSummary } = useQuery({
    queryKey: ["ar-summary"],
    queryFn: () =>
      fetch(apiUrl("/ar-ledger/summary"), {
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
  });

  const enterprises = (arSummary?.enterprises ?? []) as any[];

  const generateMut = useMutation({
    mutationFn: () =>
      fetch(apiUrl("/monthly-bills/generate"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          enterprise_id: Number(genForm.enterprise_id),
          year: genForm.year,
          month: genForm.month,
        }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monthly-bills"] }); setShowGenerate(false); },
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) =>
      fetch(apiUrl(`/monthly-bills/${id}/confirm`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-bills"] }),
  });

  const invoiceMut = useMutation({
    mutationFn: (id: number) =>
      fetch(apiUrl(`/monthly-bills/${id}/invoice`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monthly-bills"] }),
  });

  const payMut = useMutation({
    mutationFn: (id: number) =>
      fetch(apiUrl(`/monthly-bills/${id}/pay`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: "transfer" }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monthly-bills"] });
      qc.invalidateQueries({ queryKey: ["ar-summary"] });
      qc.invalidateQueries({ queryKey: ["ar-ledger-list"] });
    },
  });

  const billList = Array.isArray(bills) ? bills : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">月結帳單管理</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw size={14} />
          </Button>
          <Button size="sm" onClick={() => setShowGenerate(true)} className="bg-purple-600 hover:bg-purple-700">
            <Plus size={14} className="mr-1" /> 產出月結帳單
          </Button>
        </div>
      </div>

      {/* Generate dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>產出月結帳單</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">企業客戶</Label>
              <Select value={genForm.enterprise_id} onValueChange={v => setGenForm(f => ({ ...f, enterprise_id: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="選擇月結企業…" />
                </SelectTrigger>
                <SelectContent>
                  {enterprises.filter((e: any) => e.billing_type === "monthly").map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">年份</Label>
                <Input type="number" className="mt-1" value={genForm.year}
                  onChange={e => setGenForm(f => ({ ...f, year: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">月份</Label>
                <Input type="number" min={1} max={12} className="mt-1" value={genForm.month}
                  onChange={e => setGenForm(f => ({ ...f, month: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>取消</Button>
            <Button className="bg-purple-600 hover:bg-purple-700"
              disabled={!genForm.enterprise_id || generateMut.isPending}
              onClick={() => generateMut.mutate()}>
              {generateMut.isPending ? "產出中…" : "產出帳單"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bills list */}
      {isLoading ? (
        <p className="text-center py-10 text-gray-400">載入中…</p>
      ) : billList.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>尚無月結帳單</p>
          <p className="text-sm mt-1">點擊「產出月結帳單」開始彙整</p>
        </div>
      ) : (
        <div className="space-y-3">
          {billList.map((bill: any) => (
            <Card key={bill.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={15} className="text-purple-500" />
                      <span className="font-semibold">
                        {bill.enterprise_name ?? bill.customer_name_db ?? `客戶 #${bill.enterprise_id ?? bill.customer_id}`}
                      </span>
                      <StatusBadge status={bill.status} />
                    </div>
                    <p className="text-sm text-gray-500">
                      {bill.period_year}年{bill.period_month}月　共 {bill.order_count} 筆訂單
                    </p>
                    {bill.invoice_number && (
                      <p className="text-xs text-purple-600 mt-1">
                        <Receipt size={12} className="inline mr-1" />
                        發票 {bill.invoice_number}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-800">
                      {fmtAmt(Number(bill.total_amount))}
                    </p>
                    <div className="flex gap-1.5 mt-2 justify-end flex-wrap">
                      {bill.status === "draft" && (
                        <Button size="sm" variant="outline"
                          className="text-blue-600 border-blue-200 h-7 text-xs"
                          onClick={() => confirmMut.mutate(bill.id)}
                          disabled={confirmMut.isPending}>
                          客戶確認
                        </Button>
                      )}
                      {bill.status === "confirmed" && (
                        <Button size="sm"
                          className="bg-purple-600 hover:bg-purple-700 h-7 text-xs"
                          onClick={() => invoiceMut.mutate(bill.id)}
                          disabled={invoiceMut.isPending}>
                          批次開票
                        </Button>
                      )}
                      {bill.status === "invoiced" && (
                        <Button size="sm"
                          className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                          onClick={() => payMut.mutate(bill.id)}
                          disabled={payMut.isPending}>
                          確認收款
                        </Button>
                      )}
                      {bill.status === "paid" && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <BadgeCheck size={14} /> 已結清
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step progress */}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1 text-xs">
                    {["draft", "confirmed", "invoiced", "paid"].map((s, i) => {
                      const labels = ["草稿", "確認", "開票", "收款"];
                      const statuses = ["draft", "confirmed", "invoiced", "paid"];
                      const idx = statuses.indexOf(bill.status);
                      const done = i <= idx;
                      return (
                        <div key={s} className="flex items-center gap-1">
                          {i > 0 && <div className={`h-px w-6 ${done ? "bg-purple-400" : "bg-gray-200"}`} />}
                          <div className={`flex items-center gap-0.5 ${done ? "text-purple-600" : "text-gray-300"}`}>
                            {done ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-current" />}
                            <span>{labels[i]}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AR Balance Table ─────────────────────────────────────────────────────────
function ARBalanceTable() {
  const [showPayment, setShowPayment] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["ar-summary"],
    queryFn: () =>
      fetch(apiUrl("/ar-ledger/summary"), {
        headers: { Authorization: `Bearer ${token()}` },
      }).then(r => r.json()),
  });

  const enterprises = (data?.enterprises ?? []) as any[];
  const customers   = (data?.customers   ?? []) as any[];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">應收帳款餘額</h3>
        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setShowPayment(true)}>
          <DollarSign size={14} className="mr-1" /> 登錄收款
        </Button>
      </div>

      <PaymentDialog open={showPayment} onClose={() => setShowPayment(false)} enterprises={enterprises} />

      {isLoading ? <p className="text-center py-8 text-gray-400">載入中…</p> : (
        <div className="space-y-4">
          {/* Enterprise */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">企業客戶</p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">公司</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">帳號</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">類型</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">應收</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">已收</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">餘額</th>
                  </tr>
                </thead>
                <tbody>
                  {enterprises.map((e: any) => (
                    <tr key={e.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{e.name}</td>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{e.account_code}</td>
                      <td className="px-3 py-2">
                        <Badge variant={e.billing_type === "monthly" ? "outline" : "secondary"} className="text-xs">
                          {e.billing_type === "monthly" ? "月結" : "現結"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right text-red-600">{fmtAmt(Number(e.total_receivable))}</td>
                      <td className="px-3 py-2 text-right text-green-600">{fmtAmt(Math.abs(Number(e.total_paid)))}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${Number(e.balance) > 0 ? "text-red-700" : "text-green-700"}`}>
                        {fmtAmt(Number(e.balance))}
                      </td>
                    </tr>
                  ))}
                  {enterprises.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-5 text-gray-300">尚無資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Walk-in customers with balance */}
          {customers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <User size={12} /> 散客（有未結餘額）
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs text-gray-500">姓名</th>
                      <th className="text-left px-3 py-2 text-xs text-gray-500">電話</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">餘額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c: any) => (
                      <tr key={c.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{c.phone}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600">
                          {fmtAmt(Number(c.balance))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function BillingFlowTab() {
  return (
    <div className="p-6 space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <RotateCcw size={20} className="text-indigo-500" />
        <h2 className="text-xl font-bold">訂單金流閉環</h2>
        <Badge variant="outline" className="text-indigo-600 border-indigo-200 text-xs">現結 ／ 月結 全流程</Badge>
      </div>

      <FlowDiagram />
      <ARSummaryCards />

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">月結帳單</TabsTrigger>
          <TabsTrigger value="balance">應收餘額</TabsTrigger>
          <TabsTrigger value="ledger">AR 分類帳</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="mt-4">
          <MonthlyBillsPanel />
        </TabsContent>
        <TabsContent value="balance" className="mt-4">
          <ARBalanceTable />
        </TabsContent>
        <TabsContent value="ledger" className="mt-4">
          <ARLedgerTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
