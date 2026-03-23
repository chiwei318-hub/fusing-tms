import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  FileText, Plus, X, Download, CheckCircle, AlertCircle,
  Search, Filter, Calendar, Building2, TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

async function fetchInvoices(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return fetch(apiUrl(`/invoices?${q}`)).then(r => r.json());
}

async function fetchStats() {
  return fetch(apiUrl("/invoices/stats/monthly")).then(r => r.json());
}

export default function InvoiceManagementTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailId, setShowDetailId] = useState<number | null>(null);

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices", statusFilter],
    queryFn: () => fetchInvoices(statusFilter ? { status: statusFilter } : {}),
  });

  const { data: monthlyStats = [] } = useQuery({
    queryKey: ["invoices-stats"],
    queryFn: fetchStats,
  });

  const voidMut = useMutation({
    mutationFn: (id: number) => fetch(apiUrl(`/invoices/${id}/void`), { method: "PATCH" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const bulkMut = useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      fetch(apiUrl("/invoices/bulk-monthly"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      }).then(r => r.json()),
    onSuccess: (data) => {
      alert(`已產生 ${data.created} 張月結發票`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const displayInvoices = invoices.filter((inv: any) =>
    !searchText ||
    inv.buyer_name?.includes(searchText) ||
    inv.invoice_number?.includes(searchText)
  );

  const totalRevenue = displayInvoices.reduce((s: number, i: any) => s + (i.total_amount ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black">電子發票管理</h2>
          <p className="text-muted-foreground text-sm">開立、查詢、月結發票系統</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const now = new Date();
              if (confirm(`確認產生 ${now.getFullYear()}年${now.getMonth() + 1}月所有月結客戶發票？`)) {
                bulkMut.mutate({ month: now.getMonth() + 1, year: now.getFullYear() });
              }
            }}
            className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5" />
            一鍵月結
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            開立發票
          </button>
        </div>
      </div>

      {/* Monthly stats */}
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
          合計 NT${totalRevenue.toLocaleString()}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            className="pl-8 pr-3 py-2 rounded-xl border bg-background text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="搜尋客戶/發票號"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {[{ label: "全部", value: "" }, { label: "已開立", value: "issued" }, { label: "已作廢", value: "voided" }].map(opt => (
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
      <div className="space-y-2">
        {displayInvoices.map((inv: any) => (
          <div
            key={inv.id}
            className={`bg-card rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${
              inv.status === "voided" ? "opacity-60" : ""
            }`}
            onClick={() => setShowDetailId(inv.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-mono font-bold text-sm">{inv.invoice_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    inv.status === "voided"
                      ? "bg-red-100 text-red-700"
                      : inv.invoice_type === "monthly"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {inv.status === "voided" ? "已作廢" : inv.invoice_type === "monthly" ? "月結" : "一般"}
                  </span>
                </div>
                <p className="font-bold text-base">{inv.buyer_name}</p>
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
                <p className="text-xs text-muted-foreground">含稅 NT${Number(inv.tax_amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.issued_at ? format(new Date(inv.issued_at), "M/d HH:mm") : ""}
                </p>
                {inv.order_id && <p className="text-xs text-blue-600">訂單 #{inv.order_id}</p>}
              </div>
            </div>
            {inv.status !== "voided" && (
              <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 text-xs px-3 py-1 border rounded-lg hover:bg-muted transition-colors"
                >
                  <Download className="w-3 h-3" />
                  列印/下載
                </button>
                <button
                  onClick={() => {
                    if (confirm(`確定作廢發票 ${inv.invoice_number}？此動作無法撤銷`)) {
                      voidMut.mutate(inv.id);
                    }
                  }}
                  className="flex items-center gap-1 text-xs px-3 py-1 border rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="w-3 h-3" />
                  作廢
                </button>
              </div>
            )}
          </div>
        ))}

        {displayInvoices.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">尚無發票紀錄</p>
            <p className="text-sm mt-1">開立第一張發票或執行一鍵月結</p>
          </div>
        )}
      </div>

      {/* Create invoice dialog */}
      {showCreateDialog && (
        <CreateInvoiceDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            setShowCreateDialog(false);
          }}
        />
      )}
    </div>
  );
}

function CreateInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    buyerName: "", buyerTaxId: "", amount: "", taxRate: "5",
    invoiceType: "receipt", orderId: "", notes: "",
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.buyerName || !form.amount) return alert("請填寫客戶名稱和金額");
    setLoading(true);
    try {
      await fetch(apiUrl("/invoices"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: form.buyerName,
          buyerTaxId: form.buyerTaxId || undefined,
          amount: Number(form.amount),
          taxRate: Number(form.taxRate),
          invoiceType: form.invoiceType,
          orderId: form.orderId ? Number(form.orderId) : undefined,
          notes: form.notes || undefined,
        }),
      });
      onCreated();
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
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-bold mb-1 block">發票類型</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              value={form.invoiceType}
              onChange={e => setForm(f => ({ ...f, invoiceType: e.target.value }))}
            >
              <option value="receipt">一般收據</option>
              <option value="b2b">B2B 統編發票</option>
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
              <label className="text-sm font-bold mb-1 block">統一編號</label>
              <input
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                placeholder="12345678"
                value={form.buyerTaxId}
                onChange={e => setForm(f => ({ ...f, buyerTaxId: e.target.value }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">未稅金額 (NT$) *</label>
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                placeholder="1000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">稅率 (%)</label>
              <select
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
              >
                <option value="0">免稅 (0%)</option>
                <option value="5">含稅 (5%)</option>
              </select>
            </div>
          </div>
          {form.amount && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm">
              <div className="flex justify-between">
                <span>未稅</span><span>NT${Number(form.amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>稅額 ({form.taxRate}%)</span>
                <span>NT${Math.round(Number(form.amount) * Number(form.taxRate) / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-black border-t mt-1 pt-1">
                <span>合計</span>
                <span className="text-emerald-600">NT${Math.round(Number(form.amount) * (1 + Number(form.taxRate) / 100)).toLocaleString()}</span>
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-bold mb-1 block">關聯訂單編號（選填）</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="#123"
              value={form.orderId}
              onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">備註</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold hover:bg-muted transition-colors">取消</button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? "開立中..." : "確認開立"}
          </button>
        </div>
      </div>
    </div>
  );
}
