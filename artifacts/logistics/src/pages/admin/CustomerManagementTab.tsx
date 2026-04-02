import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Building2, Phone, MapPin, Star, AlertTriangle, Plus, Trash2,
  Download, Search, X, RefreshCw, Edit, UserX, CheckCircle2,
  CreditCard, FileText, Package, Clock, TrendingUp, Users, Zap,
} from "lucide-react";
import { format } from "date-fns";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: number; name: string; short_name: string | null; phone: string; tax_id: string | null;
  contact_person: string | null; address: string | null; postal_code: string | null;
  email: string | null; company_type: string; payment_type: string; credit_limit: number;
  price_level: string; discount_pct: number; is_vip: boolean;
  is_blacklisted: boolean; blacklist_reason: string | null;
  monthly_statement_day: number; notes: string | null; industry: string | null;
  invoice_title: string | null; company_address: string | null; factory_address: string | null;
  credit_days: number | null;
  total_orders: number; total_revenue: number; outstanding_amount: number;
  last_order_at: string | null;
}

interface CustomerAddress {
  id: number; customer_id: number; label: string; address: string;
  contact_name: string | null; contact_phone: string | null;
  address_type: string; is_default: boolean;
}

interface StatementOrder {
  id: number; created_at: string; pickup_address: string; delivery_address: string;
  pickup_date: string | null; cargo_description: string; total_fee: number;
  fee_status: string; status: string; driver_name: string | null;
}

// ─── Label Maps ───────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  cash:        { label: "現金",         color: "bg-green-50 text-green-700 border-green-200" },
  monthly:     { label: "月結",         color: "bg-blue-50 text-blue-700 border-blue-200" },
  transfer:    { label: "銀行轉帳",     color: "bg-purple-50 text-purple-700 border-purple-200" },
  check:       { label: "支票",         color: "bg-orange-50 text-orange-700 border-orange-200" },
  cod:         { label: "代收貨款",     color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  credit_card: { label: "信用卡",       color: "bg-pink-50 text-pink-700 border-pink-200" },
  eft:         { label: "電匯",         color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};
const PRICE_LABELS: Record<string, { label: string; color: string }> = {
  standard:   { label: "標準",   color: "bg-slate-50 text-slate-600 border-slate-200" },
  vip:        { label: "VIP",    color: "bg-amber-50 text-amber-700 border-amber-200" },
  enterprise: { label: "企業",   color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  custom:     { label: "自訂",   color: "bg-pink-50 text-pink-700 border-pink-200" },
};

function PayBadge({ type }: { type: string }) {
  const s = PAYMENT_LABELS[type] ?? PAYMENT_LABELS.cash!;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>;
}
function LevelBadge({ level }: { level: string }) {
  const s = PRICE_LABELS[level] ?? PRICE_LABELS.standard!;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>;
}

// ─── Customer Form Dialog ─────────────────────────────────────────────────────

function CustomerFormDialog({ customer, onClose, onSave }: {
  customer: Customer | null; onClose: () => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const isNew = !customer;
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    shortName: customer?.short_name ?? "",
    phone: customer?.phone ?? "",
    taxId: customer?.tax_id ?? "",
    contactPerson: customer?.contact_person ?? "",
    address: customer?.address ?? "",
    postalCode: customer?.postal_code ?? "",
    email: customer?.email ?? "",
    companyType: customer?.company_type ?? "company",
    industry: customer?.industry ?? "",
    paymentType: customer?.payment_type ?? "cash",
    creditLimit: String(customer?.credit_limit ?? 0),
    priceLevel: customer?.price_level ?? "standard",
    discountPct: String(customer?.discount_pct ?? 0),
    isVip: customer?.is_vip ?? false,
    monthlyStatementDay: String(customer?.monthly_statement_day ?? 5),
    notes: customer?.notes ?? "",
    invoiceTitle: customer?.invoice_title ?? "",
    companyAddress: customer?.company_address ?? "",
    factoryAddress: customer?.factory_address ?? "",
    creditDays: String(customer?.credit_days ?? ""),
  });
  const [loading, setLoading] = useState(false);

  function f(k: keyof typeof form, v: any) { setForm(prev => ({ ...prev, [k]: v })); }

  async function submit() {
    setLoading(true);
    try {
      const url = isNew ? `${API}/customers` : `${API}/customers/${customer!.id}/profile`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, creditLimit: parseFloat(form.creditLimit) || 0, discountPct: parseFloat(form.discountPct) || 0, monthlyStatementDay: parseInt(form.monthlyStatementDay) || 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: isNew ? "客戶已建立" : "資料已更新" });
      onSave();
    } catch (e: any) {
      toast({ title: "操作失敗", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[880px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "新增客戶" : `編輯：${customer!.name}`}</DialogTitle>
        </DialogHeader>

        {/* ── 主體：左右兩欄橫向版面（手機縮成單欄）── */}
        <div className="flex flex-col sm:flex-row gap-5 py-1">

          {/* ── 左欄：基本資料 ── */}
          <div className="flex-1 space-y-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">基本資料</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">公司名稱 <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={form.name} onChange={e => f("name", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">簡稱</Label>
                <Input className="mt-1" placeholder="常用簡稱" value={form.shortName} onChange={e => f("shortName", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">電話 <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={form.phone} onChange={e => f("phone", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">統一編號</Label>
                <Input className="mt-1" placeholder="12345678" value={form.taxId} onChange={e => f("taxId", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">聯絡人</Label>
                <Input className="mt-1" value={form.contactPerson} onChange={e => f("contactPerson", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input className="mt-1" type="email" value={form.email} onChange={e => f("email", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">郵遞區號</Label>
                <Input className="mt-1" placeholder="例：100" value={form.postalCode} onChange={e => f("postalCode", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">產業別</Label>
                <Input className="mt-1" placeholder="電子、食品、物流..." value={form.industry} onChange={e => f("industry", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">通訊地址</Label>
                <Input className="mt-1" placeholder="郵遞區號 + 縣市 + 地址" value={form.address} onChange={e => f("address", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">發票抬頭</Label>
                <Input className="mt-1" placeholder="開立發票時使用的名稱（預設與公司名稱相同）" value={form.invoiceTitle} onChange={e => f("invoiceTitle", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">公司地址</Label>
                <Input className="mt-1" placeholder="公司登記地址（可與通訊地址不同）" value={form.companyAddress} onChange={e => f("companyAddress", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">工廠地址</Label>
                <Input className="mt-1" placeholder="工廠或倉庫實際地址（選填）" value={form.factoryAddress} onChange={e => f("factoryAddress", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">客戶類型</Label>
                <Select value={form.companyType} onValueChange={v => f("companyType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">公司行號</SelectItem>
                    <SelectItem value="individual">個人</SelectItem>
                    <SelectItem value="government">政府機關</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 分隔線 ── */}
          <div className="hidden sm:block w-px bg-border" />
          <div className="block sm:hidden h-px bg-border" />

          {/* ── 右欄：財務設定 ── */}
          <div className="sm:w-56 space-y-4">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">財務設定</div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">支付方式</Label>
                <Select value={form.paymentType} onValueChange={v => f("paymentType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">現金</SelectItem>
                    <SelectItem value="monthly">月結</SelectItem>
                    <SelectItem value="transfer">銀行轉帳</SelectItem>
                    <SelectItem value="check">支票</SelectItem>
                    <SelectItem value="cod">代收貨款</SelectItem>
                    <SelectItem value="credit_card">信用卡</SelectItem>
                    <SelectItem value="eft">電匯</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">結帳日（每月幾號）</Label>
                <Input className="mt-1" type="number" min="1" max="31" placeholder="5" value={form.monthlyStatementDay} onChange={e => f("monthlyStatementDay", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">付款期限（天）</Label>
                <Input className="mt-1" type="number" min="0" placeholder="例：30" value={form.creditDays} onChange={e => f("creditDays", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">價格等級</Label>
                <Select value={form.priceLevel} onValueChange={v => f("priceLevel", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">標準</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="enterprise">企業</SelectItem>
                    <SelectItem value="custom">自訂</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">信用額度（元）</Label>
                <Input className="mt-1" type="number" value={form.creditLimit} onChange={e => f("creditLimit", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">折扣（%）</Label>
                <Input className="mt-1" type="number" min="0" max="100" value={form.discountPct} onChange={e => f("discountPct", e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" checked={form.isVip} onChange={e => f("isVip", e.target.checked)} className="rounded" />
                <Label className="text-xs cursor-pointer">⭐ VIP 客戶</Label>
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-xs">備註</Label>
              <Textarea className="mt-1 text-sm" rows={3} value={form.notes} onChange={e => f("notes", e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={loading || !form.name || !form.phone}>
            {loading ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Address Manager ──────────────────────────────────────────────────────────

function AddressManager({ customerId }: { customerId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editAddr, setEditAddr] = useState<CustomerAddress | null>(null);
  const [form, setForm] = useState({ label: "", address: "", contactName: "", contactPhone: "", addressType: "both", isDefault: false });

  const { data: addresses = [] } = useQuery<CustomerAddress[]>({
    queryKey: ["customer-addresses", customerId],
    queryFn: () => fetch(`${API}/customers/${customerId}/addresses`).then(r => r.json()),
  });

  function resetForm() { setForm({ label: "", address: "", contactName: "", contactPhone: "", addressType: "both", isDefault: false }); setEditAddr(null); setShowForm(false); }

  async function save() {
    const url = editAddr ? `${API}/customers/addresses/${editAddr.id}` : `${API}/customers/${customerId}/addresses`;
    const method = editAddr ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { toast({ title: editAddr ? "地址已更新" : "地址已新增" }); resetForm(); qc.invalidateQueries({ queryKey: ["customer-addresses", customerId] }); }
  }

  async function del(id: number) {
    await fetch(`${API}/customers/addresses/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["customer-addresses", customerId] });
    toast({ title: "已刪除地址" });
  }

  function startEdit(a: CustomerAddress) {
    setEditAddr(a);
    setForm({ label: a.label, address: a.address, contactName: a.contact_name ?? "", contactPhone: a.contact_phone ?? "", addressType: a.address_type, isDefault: a.is_default });
    setShowForm(true);
  }

  const typeLabels: Record<string, string> = { pickup: "取貨點", delivery: "送貨點", both: "通用" };

  return (
    <div className="space-y-3">
      {addresses.map(a => (
        <div key={a.id} className={`border rounded-lg p-2.5 text-xs space-y-1 ${a.is_default ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold">
              <MapPin className="w-3 h-3 text-primary" />
              {a.label}
              {a.is_default && <span className="text-[10px] text-primary">預設</span>}
              <span className="text-[10px] text-muted-foreground">({typeLabels[a.address_type] ?? a.address_type})</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => startEdit(a)} className="text-muted-foreground hover:text-primary"><Edit className="w-3.5 h-3.5" /></button>
              <button onClick={() => del(a.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="text-muted-foreground">{a.address}</div>
          {(a.contact_name || a.contact_phone) && <div className="text-muted-foreground">{a.contact_name} {a.contact_phone}</div>}
        </div>
      ))}

      {showForm ? (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="text-xs font-semibold">{editAddr ? "編輯地址" : "新增地址"}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">標籤名稱</Label>
              <Input className="mt-0.5 h-8 text-xs" placeholder="台北倉庫" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[11px]">類型</Label>
              <Select value={form.addressType} onValueChange={v => setForm(f => ({ ...f, addressType: v }))}>
                <SelectTrigger className="mt-0.5 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">通用</SelectItem>
                  <SelectItem value="pickup">取貨點</SelectItem>
                  <SelectItem value="delivery">送貨點</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-[11px]">地址</Label>
              <Input className="mt-0.5 h-8 text-xs" placeholder="台北市信義區..." value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[11px]">聯絡人</Label>
              <Input className="mt-0.5 h-8 text-xs" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[11px]">聯絡電話</Label>
              <Input className="mt-0.5 h-8 text-xs" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
            設為預設地址
          </label>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={!form.label || !form.address}>儲存</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>取消</Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full border border-dashed rounded-lg py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary flex items-center justify-center gap-1.5 transition-colors">
          <Plus className="w-3.5 h-3.5" /> 新增常用地址
        </button>
      )}
    </div>
  );
}

// ─── Statement Panel ──────────────────────────────────────────────────────────

function StatementPanel({ customer }: { customer: Customer }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["customer-statement", customer.id, startDate, endDate],
    queryFn: () => fetch(`${API}/customers/${customer.id}/statement?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });

  const feeStatusLabel: Record<string, { label: string; cls: string }> = {
    paid:    { label: "已付款", cls: "text-green-600" },
    unpaid:  { label: "待收款", cls: "text-red-500" },
  };

  function exportExcel() {
    window.open(`${API}/customers/${customer.id}/statement/export?startDate=${startDate}&endDate=${endDate}`, "_blank");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">起始</Label>
          <Input type="date" className="h-8 w-36 text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">結束</Label>
          <Input type="date" className="h-8 w-36 text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 ml-auto" onClick={exportExcel}>
          <Download className="w-3.5 h-3.5" /> Excel 下載
        </Button>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "總訂單", value: data.summary.totalOrders, color: "text-primary" },
            { label: "總金額", value: `NT$${(data.summary.totalAmount).toLocaleString()}`, color: "text-blue-600" },
            { label: "已收款", value: `NT$${(data.summary.paidAmount).toLocaleString()}`, color: "text-green-600" },
            { label: "待收款", value: `NT$${(data.summary.unpaidAmount).toLocaleString()}`, color: data.summary.unpaidAmount > 0 ? "text-red-500" : "text-muted-foreground" },
          ].map(item => (
            <div key={item.label} className="border rounded-lg p-2 text-center bg-card">
              <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-1">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted/60 rounded animate-pulse" />)}</div>
      ) : (data?.orders?.length ?? 0) === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">此期間無訂單記錄</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 border-b">
              <tr>
                {["訂單","取貨日","取貨地址","貨物","司機","金額","付款"].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.orders ?? []).map((o: StatementOrder) => {
                const fs = feeStatusLabel[o.fee_status] ?? { label: o.fee_status, cls: "text-muted-foreground" };
                return (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-2 py-1.5 font-mono">#{o.id}</td>
                    <td className="px-2 py-1.5">{o.pickup_date ?? "—"}</td>
                    <td className="px-2 py-1.5 max-w-[160px] truncate">{o.pickup_address ?? "—"}</td>
                    <td className="px-2 py-1.5 max-w-[100px] truncate">{o.cargo_description ?? "—"}</td>
                    <td className="px-2 py-1.5">{o.driver_name ?? "—"}</td>
                    <td className="px-2 py-1.5 font-semibold">{o.total_fee ? `NT$${Number(o.total_fee).toLocaleString()}` : "—"}</td>
                    <td className={`px-2 py-1.5 font-semibold ${fs.cls}`}>{fs.label}</td>
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

// ─── Customer Detail Dialog ───────────────────────────────────────────────────

function CustomerDetailDialog({ customer, onClose, onUpdate }: {
  customer: Customer; onClose: () => void; onUpdate: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [showBlacklistForm, setShowBlacklistForm] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["customer-detail", customer.id],
    queryFn: () => fetch(`${API}/customers/${customer.id}/details`).then(r => r.json()),
  });

  async function toggleBlacklist() {
    if (customer.is_blacklisted) {
      await fetch(`${API}/customers/${customer.id}/blacklist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lift: true }) });
      toast({ title: "已解除黑名單" });
    } else {
      if (!blacklistReason) { toast({ title: "請填寫原因", variant: "destructive" }); return; }
      await fetch(`${API}/customers/${customer.id}/blacklist`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: blacklistReason }) });
      toast({ title: "已加入黑名單" });
      setShowBlacklistForm(false);
    }
    qc.invalidateQueries({ queryKey: ["customers-extended"] });
    qc.invalidateQueries({ queryKey: ["customer-detail", customer.id] });
    onUpdate();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-5 h-5" />
            {customer.name}
            {customer.is_vip && <span className="text-amber-500 text-sm">⭐ VIP</span>}
            {customer.is_blacklisted && <Badge variant="destructive" className="text-xs">黑名單</Badge>}
          </DialogTitle>
          <DialogDescription>
            {customer.tax_id && `統編 ${customer.tax_id}　`}
            {customer.industry && `${customer.industry}　`}
            {customer.contact_person}
          </DialogDescription>
        </DialogHeader>

        {customer.is_blacklisted && (
          <div className="mx-1 p-2.5 rounded-lg border border-red-300 bg-red-50 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>黑名單原因：{customer.blacklist_reason}</span>
          </div>
        )}

        <Tabs defaultValue="info" className="mt-1">
          <TabsList className="flex h-auto gap-0.5 p-0.5 text-xs w-full">
            {[
              { v: "info", l: "基本資料" }, { v: "finance", l: "財務設定" },
              { v: "addresses", l: "常用地址" }, { v: "statement", l: "對帳報表" },
              { v: "risk", l: "風控" },
            ].map(t => (
              <TabsTrigger key={t.v} value={t.v} className="flex-1 text-[11px] py-1.5">{t.l}</TabsTrigger>
            ))}
          </TabsList>

          {/* Basic Info */}
          <TabsContent value="info" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ["公司名稱", customer.name],
                ["簡稱", customer.short_name ?? "—"],
                ["電話", customer.phone],
                ["聯絡人", customer.contact_person ?? "—"],
                ["E-mail", customer.email ?? "—"],
                ["產業別", customer.industry ?? "—"],
                ["郵遞區號", customer.postal_code ?? "—"],
                ["通訊地址", customer.address ?? "—"],
                ["發票抬頭", customer.invoice_title ?? "—"],
                ["公司地址", customer.company_address ?? "—"],
                ["工廠地址", customer.factory_address ?? "—"],
                ["總訂單", `${Number(customer.total_orders)} 筆`],
                ["累計金額", `NT$${Number(customer.total_revenue).toLocaleString()}`],
                ["待收款", customer.outstanding_amount > 0 ? `NT$${Number(customer.outstanding_amount).toLocaleString()}` : "—"],
                ["最後下單", customer.last_order_at ? format(new Date(customer.last_order_at), "yyyy/MM/dd") : "尚無"],
                ["備註", customer.notes ?? "—"],
              ].map(([l, v], i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">{l}</span>
                  <span className="font-medium text-xs truncate">{v as string}</span>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setEditMode(true)}>
              <Edit className="w-3.5 h-3.5" /> 編輯資料
            </Button>
          </TabsContent>

          {/* Finance */}
          <TabsContent value="finance" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "付款方式", value: PAYMENT_LABELS[customer.payment_type]?.label ?? customer.payment_type },
                { label: "價格等級", value: PRICE_LABELS[customer.price_level]?.label ?? customer.price_level },
                { label: "信用額度", value: customer.credit_limit > 0 ? `NT$${customer.credit_limit.toLocaleString()}` : "無" },
                { label: "折扣", value: customer.discount_pct > 0 ? `${customer.discount_pct}%` : "無折扣" },
                { label: "結帳日", value: `每月 ${customer.monthly_statement_day} 日` },
              ].map(item => (
                <div key={item.label} className="border rounded-lg p-2.5 bg-card">
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  <div className="text-sm font-semibold mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 text-xs">
              <div className="font-semibold text-muted-foreground">信用使用狀況</div>
              {customer.credit_limit > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span>信用額度</span><span>NT${customer.credit_limit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>待收款（佔用）</span><span>NT${Number(customer.outstanding_amount).toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(100, (Number(customer.outstanding_amount) / customer.credit_limit) * 100)}%` }} />
                  </div>
                </>
              ) : <div className="text-muted-foreground">未設定信用額度</div>}
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setEditMode(true)}>
              <Edit className="w-3.5 h-3.5" /> 修改財務設定
            </Button>
          </TabsContent>

          {/* Addresses */}
          <TabsContent value="addresses" className="mt-3">
            <AddressManager customerId={customer.id} />
          </TabsContent>

          {/* Statement */}
          <TabsContent value="statement" className="mt-3">
            <StatementPanel customer={customer} />
          </TabsContent>

          {/* Risk */}
          <TabsContent value="risk" className="space-y-3 mt-3">
            <div className="space-y-2">
              {[
                { label: "付款延遲風險", value: customer.outstanding_amount > (customer.credit_limit * 0.8) && customer.credit_limit > 0 ? "⚠️ 信用額度使用超過 80%" : "✅ 正常" },
                { label: "交易量", value: Number(customer.total_orders) > 0 ? `${Number(customer.total_orders)} 筆訂單 / NT$${Number(customer.total_revenue).toLocaleString()}` : "尚無交易" },
                { label: "最後活動", value: customer.last_order_at ? format(new Date(customer.last_order_at), "yyyy/MM/dd") : "尚無" },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b text-xs last:border-0">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>

            {detail?.blacklistHistory?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">黑名單歷史</div>
                {detail.blacklistHistory.map((b: any) => (
                  <div key={b.id} className="text-xs bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                    <div className="text-red-600">{b.reason}</div>
                    <div className="text-muted-foreground mt-0.5">{format(new Date(b.created_at), "yyyy/MM/dd")} · {b.created_by}</div>
                    {b.lifted_at && <div className="text-green-600">已於 {format(new Date(b.lifted_at), "yyyy/MM/dd")} 解除</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2">
              {customer.is_blacklisted ? (
                <Button size="sm" className="h-8 gap-1.5 text-xs bg-green-600 hover:bg-green-700" onClick={toggleBlacklist}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> 解除黑名單
                </Button>
              ) : showBlacklistForm ? (
                <div className="space-y-2">
                  <Label className="text-xs">加入黑名單原因 <span className="text-red-500">*</span></Label>
                  <Textarea className="text-sm" rows={2} placeholder="請說明原因..." value={blacklistReason} onChange={e => setBlacklistReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700" onClick={toggleBlacklist} disabled={!blacklistReason}>確認加入黑名單</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBlacklistForm(false)}>取消</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-red-400 text-red-600 hover:bg-red-50" onClick={() => setShowBlacklistForm(true)}>
                  <UserX className="w-3.5 h-3.5" /> 加入黑名單
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {editMode && (
          <CustomerFormDialog customer={customer} onClose={() => setEditMode(false)}
            onSave={() => { setEditMode(false); qc.invalidateQueries({ queryKey: ["customers-extended"] }); onUpdate(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function CustomerManagementTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers-extended"],
    queryFn: () => fetch(`${API}/customers/extended`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    return customers.filter(c => {
      if (showBlacklisted !== c.is_blacklisted) return false;
      if (filterPayment !== "all" && c.payment_type !== filterPayment) return false;
      if (filterLevel !== "all" && c.price_level !== filterLevel) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.phone.includes(q) ||
          (c.tax_id ?? "").includes(q) || (c.contact_person ?? "").toLowerCase().includes(q) ||
          (c.industry ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [customers, search, filterPayment, filterLevel, showBlacklisted]);

  const stats = useMemo(() => ({
    total: customers.filter(c => !c.is_blacklisted).length,
    vip: customers.filter(c => c.is_vip && !c.is_blacklisted).length,
    monthly: customers.filter(c => c.payment_type === "monthly" && !c.is_blacklisted).length,
    blacklisted: customers.filter(c => c.is_blacklisted).length,
    totalRevenue: customers.filter(c => !c.is_blacklisted).reduce((s, c) => s + Number(c.total_revenue), 0),
    totalOutstanding: customers.filter(c => !c.is_blacklisted).reduce((s, c) => s + Number(c.outstanding_amount), 0),
  }), [customers]);

  function exportAll() {
    const url = `${API}/customers/statement/all/export?startDate=${startDate}&endDate=${endDate}`;
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: "客戶總數", value: stats.total, color: "text-primary", icon: <Users className="w-4 h-4" /> },
          { label: "VIP 客戶", value: stats.vip, color: "text-amber-500", icon: <Star className="w-4 h-4" /> },
          { label: "月結客戶", value: stats.monthly, color: "text-blue-600", icon: <CreditCard className="w-4 h-4" /> },
          { label: "黑名單", value: stats.blacklisted, color: "text-red-500", icon: <UserX className="w-4 h-4" /> },
          { label: "累計營收", value: `NT$${(stats.totalRevenue / 10000).toFixed(1)}萬`, color: "text-green-600", icon: <TrendingUp className="w-4 h-4" /> },
          { label: "待收款", value: `NT$${(stats.totalOutstanding / 10000).toFixed(1)}萬`, color: stats.totalOutstanding > 0 ? "text-orange-500" : "text-muted-foreground", icon: <Clock className="w-4 h-4" /> },
        ].map(item => (
          <Card key={item.label} className="border shadow-sm">
            <CardContent className="p-2.5 flex items-center gap-2">
              <span className={item.color}>{item.icon}</span>
              <div>
                <div className={`text-base font-bold ${item.color}`}>{item.value}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{item.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋名稱、電話、統編..."
            className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-52 focus:ring-2 focus:ring-primary/30 transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>

        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue placeholder="付款方式" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部付款</SelectItem>
            <SelectItem value="cash">現金</SelectItem>
            <SelectItem value="monthly">月結</SelectItem>
            <SelectItem value="transfer">銀行轉帳</SelectItem>
            <SelectItem value="check">支票</SelectItem>
            <SelectItem value="cod">代收貨款</SelectItem>
            <SelectItem value="credit_card">信用卡</SelectItem>
            <SelectItem value="eft">電匯</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="h-9 w-24 text-xs"><SelectValue placeholder="等級" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等級</SelectItem>
            <SelectItem value="standard">標準</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="enterprise">企業</SelectItem>
          </SelectContent>
        </Select>

        <button onClick={() => setShowBlacklisted(v => !v)}
          className={`h-9 px-3 rounded-md border text-xs transition-colors ${showBlacklisted ? "bg-red-50 border-red-400 text-red-600" : "bg-card hover:bg-muted/50"}`}>
          {showBlacklisted ? "顯示黑名單" : "正常客戶"}
        </button>

        <div className="flex-1" />

        {/* Export all */}
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-9 w-34 text-xs" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span className="text-muted-foreground text-xs">~</span>
          <Input type="date" className="h-9 w-34 text-xs" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={exportAll}>
            <Download className="w-3.5 h-3.5" /> 全部匯出
          </Button>
        </div>

        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowNewForm(true)}>
          <Plus className="w-3.5 h-3.5" /> 新增客戶
        </Button>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["customers-extended"] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Customer List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-muted/60 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          無客戶資料
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map(c => (
            <div key={c.id} onClick={() => setSelectedCustomer(c)}
              className={`border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all group
                ${c.is_blacklisted ? "border-red-200 bg-red-50/20" : c.is_vip ? "border-amber-200 bg-amber-50/10" : "bg-card hover:border-primary/30"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.is_vip && <span className="text-amber-500">⭐</span>}
                    <span className="font-semibold text-sm truncate">{c.name}</span>
                    {c.short_name && <span className="text-[10px] text-muted-foreground">（{c.short_name}）</span>}
                    {c.is_blacklisted && <Badge variant="destructive" className="text-[10px] py-0 h-4">黑名單</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.phone}
                    {c.contact_person && <span>· {c.contact_person}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {c.tax_id && `統編 ${c.tax_id}`}
                    {c.industry && (c.tax_id ? ` · ${c.industry}` : c.industry)}
                    {c.email && ` · ${c.email}`}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PayBadge type={c.payment_type} />
                  <LevelBadge level={c.price_level} />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5"><Package className="w-3 h-3" />{Number(c.total_orders)} 筆</span>
                <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />NT${(Number(c.total_revenue)/10000).toFixed(1)}萬</span>
                {Number(c.outstanding_amount) > 0 && (
                  <span className="text-orange-500 font-semibold flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />待收 NT${Number(c.outstanding_amount).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showNewForm && (
        <CustomerFormDialog customer={null} onClose={() => setShowNewForm(false)}
          onSave={() => { setShowNewForm(false); qc.invalidateQueries({ queryKey: ["customers-extended"] }); }} />
      )}
      {selectedCustomer && (
        <CustomerDetailDialog customer={selectedCustomer} onClose={() => setSelectedCustomer(null)}
          onUpdate={() => qc.invalidateQueries({ queryKey: ["customers-extended"] })} />
      )}
    </div>
  );
}
