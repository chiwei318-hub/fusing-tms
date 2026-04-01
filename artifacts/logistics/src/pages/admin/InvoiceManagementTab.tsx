import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, X, Download, Calendar, TrendingUp,
  Printer, RefreshCw, Mail, Scissors, Loader2, CheckCircle,
  AlertCircle, Search,
} from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem("auth-jwt") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiJson(path: string, init?: RequestInit) {
  const r = await fetch(apiUrl(path), { headers: authHeaders(), ...init });
  if (!r.ok) {
    const msg = await r.json().then((d: any) => d?.error ?? r.statusText).catch(() => r.statusText);
    throw new Error(msg);
  }
  return r.json();
}

function statusBadge(status: string, invoiceType: string) {
  if (status === "voided")      return { label: "已作廢",  cls: "bg-red-100 text-red-700" };
  if (status === "allowanced")  return { label: "已折讓",  cls: "bg-orange-100 text-orange-700" };
  if (invoiceType === "monthly") return { label: "月結",   cls: "bg-purple-100 text-purple-700" };
  return { label: "已開立", cls: "bg-green-100 text-green-700" };
}

// ─── InvoiceManagementTab ─────────────────────────────────────────────────────

export default function InvoiceManagementTab() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [searchText,   setSearchText]   = useState("");
  const [showCreate,   setShowCreate]   = useState(false);
  const [allowanceId,  setAllowanceId]  = useState<number | null>(null);
  const [voidingId,    setVoidingId]    = useState<number | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: invoices = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["invoices", statusFilter],
    queryFn: () => apiJson(`/invoices${statusFilter ? `?status=${statusFilter}` : ""}`),
    refetchInterval: 60_000,
  });

  const { data: monthlyStats = [] } = useQuery<any[]>({
    queryKey: ["invoices-stats"],
    queryFn: () => apiJson("/invoices/stats/monthly"),
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiJson(`/invoices/${id}/void`, { method: "PATCH", body: JSON.stringify({ reason }) }),
    onSuccess: (_, { id }) => {
      toast({ title: "發票已作廢", description: `已成功作廢發票 #${id}` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setVoidingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "作廢失敗", description: err.message, variant: "destructive" });
    },
  });

  const bulkMut = useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      apiJson("/invoices/bulk-monthly", { method: "POST", body: JSON.stringify({ month, year }) }),
    onSuccess: (data) => {
      toast({ title: "月結發票完成", description: `已產生 ${data.created ?? 0} 張月結發票` });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: Error) => toast({ title: "月結失敗", description: err.message, variant: "destructive" }),
  });

  const emailMut = useMutation({
    mutationFn: (id: number) => apiJson(`/invoices/${id}/send-email`, { method: "POST" }),
    onSuccess: () => toast({ title: "發送成功", description: "電子發票已寄出" }),
    onError: (err: Error) => toast({ title: "寄信失敗", description: err.message, variant: "destructive" }),
  });

  // ── Derived ──────────────────────────────────────────────────────────────────

  const displayInvoices = invoices.filter((inv: any) =>
    !searchText ||
    inv.buyer_name?.includes(searchText) ||
    inv.invoice_number?.includes(searchText)
  );

  const totalRevenue = displayInvoices
    .filter((i: any) => i.status !== "voided")
    .reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0);

  // ── Download PDF ─────────────────────────────────────────────────────────────

  async function downloadPdf(inv: any) {
    try {
      const r = await fetch(apiUrl(`/invoices/${inv.id}/pdf`), {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth-jwt") ?? ""}` },
      });
      if (!r.ok) throw new Error("PDF 產生失敗");
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `invoice-${inv.invoice_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF 下載完成" });
    } catch (e: any) {
      toast({ title: "PDF 失敗", description: e.message, variant: "destructive" });
    }
  }

  // ── Void confirm dialog ───────────────────────────────────────────────────────

  const voidingInv = voidingId ? invoices.find((i: any) => i.id === voidingId) : null;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black">電子發票管理</h2>
          <p className="text-muted-foreground text-sm">開立、查詢、PDF 下載、月結批次作業</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              const now = new Date();
              if (window.confirm(`確認產生 ${now.getFullYear()}年${now.getMonth() + 1}月所有月結客戶發票？`)) {
                bulkMut.mutate({ month: now.getMonth() + 1, year: now.getFullYear() });
              }
            }}
            disabled={bulkMut.isPending}
            className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-60"
          >
            {bulkMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
            一鍵月結
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            開立發票
          </button>
        </div>
      </div>

      {/* Monthly KPI cards */}
      {monthlyStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {monthlyStats.slice(0, 4).map((m: any) => (
            <div key={m.month} className="bg-card rounded-xl p-3 border">
              <p className="text-xs text-muted-foreground">{m.month}</p>
              <p className="font-black text-lg">NT${Number(m.total_revenue ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{m.invoice_count} 張發票</p>
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold">篩選結果：{displayInvoices.length} 張</span>
        </div>
        <div className="text-sm font-bold text-emerald-600">
          有效合計 NT${totalRevenue.toLocaleString()}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          重整
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            className="pl-8 pr-3 py-2 rounded-xl border bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="搜尋客戶 / 發票號碼"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { label: "全部",   value: "" },
            { label: "已開立", value: "issued" },
            { label: "已折讓", value: "allowanced" },
            { label: "已作廢", value: "voided" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                statusFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>載入中…</span>
        </div>
      ) : (
        <div className="space-y-2">
          {displayInvoices.map((inv: any) => {
            const badge = statusBadge(inv.status, inv.invoice_type);
            const canAct = inv.status !== "voided";

            return (
              <div
                key={inv.id}
                className={`bg-card rounded-xl border p-4 hover:shadow-md transition-all ${
                  inv.status === "voided" ? "opacity-55" : ""
                }`}
              >
                {/* Main info row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="font-mono font-bold text-sm tracking-wide">{inv.invoice_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {inv.buyer_tax_id && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                          B2B
                        </span>
                      )}
                    </div>
                    <p className="font-bold">{inv.buyer_name}</p>
                    {inv.buyer_tax_id && (
                      <p className="text-xs text-muted-foreground">統一編號：{inv.buyer_tax_id}</p>
                    )}
                    {inv.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{inv.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-xl text-emerald-600">
                      NT${Number(inv.total_amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      稅額 NT${Number(inv.tax_amount ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inv.issued_at ? format(new Date(inv.issued_at), "M/d HH:mm", { locale: zhTW }) : ""}
                    </p>
                    {inv.order_id && (
                      <p className="text-xs text-blue-600 font-mono">訂單 #{inv.order_id}</p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="mt-3 flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                  {/* 列印頁面 */}
                  <ActionBtn
                    icon={<Printer className="w-3 h-3" />}
                    label="列印"
                    onClick={() => navigate(`/invoice-print/${inv.id}`)}
                  />
                  {/* PDF 下載 */}
                  <ActionBtn
                    icon={<Download className="w-3 h-3" />}
                    label="PDF"
                    onClick={() => downloadPdf(inv)}
                  />
                  {/* 寄信 */}
                  {canAct && (
                    <ActionBtn
                      icon={emailMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                      label="寄信"
                      onClick={() => emailMut.mutate(inv.id)}
                      disabled={emailMut.isPending}
                    />
                  )}
                  {/* 折讓 */}
                  {canAct && inv.status !== "allowanced" && (
                    <ActionBtn
                      icon={<Scissors className="w-3 h-3" />}
                      label="折讓"
                      onClick={() => setAllowanceId(inv.id)}
                      variant="orange"
                    />
                  )}
                  {/* 作廢 */}
                  {canAct && (
                    <ActionBtn
                      icon={voidMut.isPending && voidingId === inv.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <X className="w-3 h-3" />}
                      label="作廢"
                      onClick={() => setVoidingId(inv.id)}
                      variant="red"
                      disabled={voidMut.isPending}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {displayInvoices.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">尚無發票紀錄</p>
              <p className="text-sm mt-1">點擊「開立發票」或執行「一鍵月結」</p>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <CreateInvoiceDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            setShowCreate(false);
          }}
        />
      )}

      {allowanceId !== null && (
        <AllowanceDialog
          invoiceId={allowanceId}
          invoiceNo={invoices.find((i: any) => i.id === allowanceId)?.invoice_number ?? ""}
          onClose={() => setAllowanceId(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            setAllowanceId(null);
          }}
        />
      )}

      {voidingId !== null && (
        <VoidConfirmDialog
          invoice={voidingInv}
          isPending={voidMut.isPending}
          onConfirm={(reason) => voidMut.mutate({ id: voidingId, reason })}
          onClose={() => setVoidingId(null)}
        />
      )}
    </div>
  );
}

// ─── Small reusable button ────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onClick, disabled, variant,
}: {
  icon: React.ReactNode; label: string;
  onClick: () => void; disabled?: boolean;
  variant?: "red" | "orange";
}) {
  const cls = variant === "red"
    ? "text-red-600 hover:bg-red-50"
    : variant === "orange"
    ? "text-orange-600 hover:bg-orange-50"
    : "text-foreground hover:bg-muted";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-colors disabled:opacity-50 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── VoidConfirmDialog ────────────────────────────────────────────────────────

function VoidConfirmDialog({
  invoice, isPending, onConfirm, onClose,
}: {
  invoice: any; isPending: boolean;
  onConfirm: (reason: string) => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("作廢");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-5 flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-black text-lg">確認作廢發票？</h3>
            <p className="text-sm text-muted-foreground mt-1">
              發票 <span className="font-mono font-bold">{invoice?.invoice_number}</span> 作廢後無法復原
            </p>
          </div>
        </div>
        <div className="px-5 pb-3">
          <label className="text-sm font-bold block mb-1">作廢原因（最多 20 字）</label>
          <input
            className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
            value={reason}
            maxLength={20}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border rounded-xl font-bold hover:bg-muted transition-colors">
            取消
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isPending || !reason.trim()}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            確認作廢
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AllowanceDialog ──────────────────────────────────────────────────────────

function AllowanceDialog({
  invoiceId, invoiceNo, onClose, onDone,
}: {
  invoiceId: number; invoiceNo: string;
  onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [amt, setAmt]     = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const numAmt = Number(amt);

  const submit = async () => {
    if (!numAmt || numAmt <= 0) return toast({ title: "請輸入折讓金額", variant: "destructive" });
    setLoading(true);
    try {
      await apiJson(`/invoices/${invoiceId}/allowance`, {
        method: "POST",
        body: JSON.stringify({ allowanceAmt: numAmt, reason: reason || "折讓" }),
      });
      toast({ title: "折讓成功", description: `已開立 NT$${numAmt.toLocaleString()} 折讓單` });
      onDone();
    } catch (e: any) {
      toast({ title: "折讓失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-black text-lg">開立折讓單</h3>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{invoiceNo}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-bold block mb-1">折讓金額（含稅，NT$）*</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="例：500"
              value={amt}
              onChange={e => setAmt(e.target.value)}
            />
          </div>
          {numAmt > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-sm">
              <div className="flex justify-between">
                <span>折讓含稅</span><span className="font-bold">NT${numAmt.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>折讓稅額 (5%)</span>
                <span>NT${Math.round(numAmt * 5 / 105).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>折讓未稅</span>
                <span>NT${Math.round(numAmt * 100 / 105).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-bold block mb-1">折讓原因</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="例：服務調整退費"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold hover:bg-muted transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={loading || !numAmt}
            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            確認折讓
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CreateInvoiceDialog ──────────────────────────────────────────────────────

function CreateInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    buyerName: "", buyerTaxId: "", amount: "", taxRate: "5",
    invoiceType: "receipt", orderId: "", notes: "",
  });
  const [loading, setLoading] = useState(false);

  const amtNum = Number(form.amount);
  const taxNum = Math.round(amtNum * Number(form.taxRate) / 100);

  const submit = async () => {
    if (!form.buyerName.trim()) return toast({ title: "請填寫客戶名稱", variant: "destructive" });
    if (!amtNum || amtNum <= 0) return toast({ title: "請填寫有效金額", variant: "destructive" });
    setLoading(true);
    try {
      await apiJson("/invoices", {
        method: "POST",
        body: JSON.stringify({
          buyerName:   form.buyerName,
          buyerTaxId:  form.buyerTaxId || undefined,
          amount:      amtNum,
          taxRate:     Number(form.taxRate),
          invoiceType: form.invoiceType,
          orderId:     form.orderId ? Number(form.orderId) : undefined,
          notes:       form.notes || undefined,
        }),
      });
      toast({ title: "發票已開立", description: `${form.buyerName} NT$${(amtNum + taxNum).toLocaleString()}` });
      onCreated();
    } catch (e: any) {
      toast({ title: "開立失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-background rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-black text-lg">開立新發票</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-sm font-bold mb-1 block">發票類型</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              value={form.invoiceType}
              onChange={e => setForm(f => ({ ...f, invoiceType: e.target.value }))}
            >
              <option value="receipt">一般收據（B2C）</option>
              <option value="b2b">三聯式（B2B 統編）</option>
              <option value="monthly">月結帳單</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">客戶名稱 *</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="例：富詠貿易有限公司"
              value={form.buyerName}
              onChange={e => setForm(f => ({ ...f, buyerName: e.target.value }))}
            />
          </div>
          {form.invoiceType === "b2b" && (
            <div>
              <label className="text-sm font-bold mb-1 block">統一編號（7碼）</label>
              <input
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background font-mono"
                placeholder="12345678"
                maxLength={8}
                value={form.buyerTaxId}
                onChange={e => setForm(f => ({ ...f, buyerTaxId: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">未稅金額 (NT$) *</label>
              <input
                type="number"
                min={1}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                placeholder="1000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">稅率</label>
              <select
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
              >
                <option value="0">免稅 0%</option>
                <option value="5">應稅 5%</option>
              </select>
            </div>
          </div>
          {amtNum > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">未稅</span>
                <span>NT${amtNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>稅額 ({form.taxRate}%)</span>
                <span>NT${taxNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-black border-t pt-1">
                <span>含稅合計</span>
                <span className="text-emerald-600">NT${(amtNum + taxNum).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-bold mb-1 block">關聯訂單（選填）</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="訂單 ID"
              value={form.orderId}
              onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">備註（選填）</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              placeholder="例：2026年3月份物流服務費"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold hover:bg-muted transition-colors">
            取消
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "開立中…" : "確認開立"}
          </button>
        </div>
      </div>
    </div>
  );
}
