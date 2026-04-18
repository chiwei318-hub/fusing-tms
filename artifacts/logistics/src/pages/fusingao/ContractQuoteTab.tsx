import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, X, RefreshCw, Edit, Trash2, Copy,
  FileText, CheckCircle2, Clock, Ban, ChevronRight,
  DollarSign, Truck, MapPin, Calendar
} from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  id?: number;
  routeFrom: string;
  routeTo: string;
  vehicleType: string;
  cargoType: string;
  unit: string;
  unitPrice: number | string;
  minCharge: number | string;
  notes: string;
  sortOrder: number;
}

interface ContractQuote {
  id: number;
  quote_no: string;
  customer_id?: number;
  customer_name?: string;
  customer_name_resolved?: string;
  customer_short_name?: string;
  title: string;
  status: string;
  quote_date?: string;
  valid_from?: string;
  valid_to?: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  item_count?: number;
  confirmed_by?: string;
  confirmed_at?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at?: string;
  items?: QuoteItem[];
}

interface Customer { id: number; name: string; short_name?: string; phone: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string,{ label:string; color:string; dot:string; icon:any }> = {
  draft:     { label:"草稿",   color:"bg-slate-100 text-slate-600 border border-slate-200",     dot:"bg-slate-400",   icon: <Clock className="w-3 h-3" /> },
  confirmed: { label:"已確認", color:"bg-emerald-50 text-emerald-700 border border-emerald-200", dot:"bg-emerald-500", icon: <CheckCircle2 className="w-3 h-3" /> },
  expired:   { label:"已過期", color:"bg-amber-50 text-amber-700 border border-amber-200",       dot:"bg-amber-500",   icon: <Clock className="w-3 h-3" /> },
  cancelled: { label:"已取消", color:"bg-red-50 text-red-600 border border-red-200",             dot:"bg-red-500",     icon: <Ban className="w-3 h-3" /> },
};

const UNIT_LABELS: Record<string,string> = {
  per_trip:"次/趟", per_km:"公里", per_ton:"公噸", per_cbm:"立方公尺", per_day:"天", per_hour:"小時"
};

const VEHICLE_TYPES = ["","1.5噸","2噸","3.5噸","5噸","7噸","10噸","17噸","20噸","冷藏車","曳引車","廂型車","平板車"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function isExpired(q: ContractQuote) {
  if (!q.valid_to) return false;
  return new Date(q.valid_to) < new Date();
}

// ─── QuoteFormDialog ──────────────────────────────────────────────────────────

function emptyItem(): QuoteItem {
  return { routeFrom:"", routeTo:"", vehicleType:"", cargoType:"", unit:"per_trip", unitPrice:"", minCharge:"0", notes:"", sortOrder:0 };
}

function QuoteFormDialog({ quote, onClose, onSave }: {
  quote: ContractQuote | null; onClose: () => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const isNew = !quote;
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers-list-for-quote"],
    queryFn: () => fetch(`${API}/customers`).then(r => r.json()).then(d => Array.isArray(d) ? d : []),
    staleTime: 60000,
  });

  const [form, setForm] = useState({
    customerId:    quote?.customer_id ? String(quote.customer_id) : "",
    customerName:  quote?.customer_name ?? "",
    title:         quote?.title ?? "",
    status:        quote?.status ?? "draft",
    quoteDate:     quote?.quote_date?.slice(0,10) ?? "",
    validFrom:     quote?.valid_from?.slice(0,10) ?? "",
    validTo:       quote?.valid_to?.slice(0,10) ?? "",
    contactPerson: quote?.contact_person ?? "",
    contactPhone:  quote?.contact_phone ?? "",
    notes:         quote?.notes ?? "",
    createdBy:     quote?.created_by ?? "",
    updatedBy:     quote?.updated_by ?? "",
  });
  const [items, setItems] = useState<QuoteItem[]>(quote?.items?.map(i => ({
    routeFrom:   i.routeFrom ?? (i as any).route_from ?? "",
    routeTo:     i.routeTo   ?? (i as any).route_to   ?? "",
    vehicleType: i.vehicleType ?? (i as any).vehicle_type ?? "",
    cargoType:   i.cargoType ?? (i as any).cargo_type ?? "",
    unit:        i.unit ?? "per_trip",
    unitPrice:   i.unitPrice ?? (i as any).unit_price ?? "",
    minCharge:   i.minCharge ?? (i as any).min_charge ?? "0",
    notes:       i.notes ?? "",
    sortOrder:   i.sortOrder ?? (i as any).sort_order ?? 0,
  })) ?? [emptyItem()]);
  const [loading, setLoading] = useState(false);

  function f(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }
  function updateItem(idx: number, k: keyof QuoteItem, v: any) {
    setItems(p => p.map((item, i) => i === idx ? { ...item, [k]: v } : item));
  }
  function addItem() { setItems(p => [...p, emptyItem()]); }
  function removeItem(idx: number) { setItems(p => p.filter((_, i) => i !== idx)); }

  async function submit() {
    if (!form.title) { toast({ title:"請填寫報價單名稱", variant:"destructive" }); return; }
    setLoading(true);
    try {
      const selectedCustomer = customers.find(c => String(c.id) === form.customerId);
      const url = isNew ? `${API}/contract-quotes` : `${API}/contract-quotes/${quote!.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          ...form,
          customerId: form.customerId ? parseInt(form.customerId) : undefined,
          customerName: form.customerId ? (selectedCustomer?.name ?? form.customerName) : form.customerName,
          items: items.map((item, idx) => ({ ...item, sortOrder: idx, unitPrice: parseFloat(String(item.unitPrice)) || 0, minCharge: parseFloat(String(item.minCharge)) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: isNew ? "報價單已建立" : "報價單已更新" });
      onSave();
    } catch (e: any) {
      toast({ title:"操作失敗", description: e.message, variant:"destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {isNew ? "新增報價單" : `編輯報價單 ${quote?.quote_no}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label>報價單名稱 *</Label>
              <Input value={form.title} onChange={e => f("title", e.target.value)} placeholder="例：台全電機 2026年度運費報價" />
            </div>
            <div className="space-y-1">
              <Label>客戶</Label>
              <Select value={form.customerId || "__manual"} onValueChange={v => {
                if (v === "__manual") { f("customerId",""); }
                else { f("customerId", v); f("customerName",""); }
              }}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="選擇客戶（選填）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual">─ 手動輸入 ─</SelectItem>
                  {customers.filter(c => !c.phone.startsWith("CUST-") || c.name).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.short_name ? `（${c.short_name}）` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.customerId && (
              <div className="space-y-1">
                <Label>客戶名稱（手動）</Label>
                <Input value={form.customerName} onChange={e => f("customerName", e.target.value)} placeholder="客戶全名" />
              </div>
            )}
            <div className="space-y-1">
              <Label>狀態</Label>
              <Select value={form.status} onValueChange={v => f("status", v)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="confirmed">已確認</SelectItem>
                  <SelectItem value="expired">已過期</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>報價日期</Label>
              <Input type="date" value={form.quoteDate} onChange={e => f("quoteDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>生效日期前起</Label>
              <Input type="date" value={form.validFrom} onChange={e => f("validFrom", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>生效日期前迄</Label>
              <Input type="date" value={form.validTo} onChange={e => f("validTo", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>新增人員</Label>
              <Input value={form.createdBy} onChange={e => f("createdBy", e.target.value)} placeholder="建立者姓名" />
            </div>
            <div className="space-y-1">
              <Label>最後人員</Label>
              <Input value={form.updatedBy} onChange={e => f("updatedBy", e.target.value)} placeholder="最後修改者" />
            </div>
            <div className="space-y-1">
              <Label>聯絡人</Label>
              <Input value={form.contactPerson} onChange={e => f("contactPerson", e.target.value)} placeholder="聯絡人姓名" />
            </div>
            <div className="space-y-1">
              <Label>聯絡電話</Label>
              <Input value={form.contactPhone} onChange={e => f("contactPhone", e.target.value)} placeholder="電話號碼" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>備註</Label>
              <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} placeholder="合約備註事項..." />
            </div>
          </div>

          {/* Quote items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">報價明細</Label>
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={addItem}>
                <Plus className="w-3 h-3" /> 新增明細
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">起點</th>
                    <th className="p-2 text-left">迄點</th>
                    <th className="p-2 text-left">車型</th>
                    <th className="p-2 text-left">貨物類型</th>
                    <th className="p-2 text-left">計費單位</th>
                    <th className="p-2 text-right">單價 (NT$)</th>
                    <th className="p-2 text-right">最低費用</th>
                    <th className="p-2 text-left">備註</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-1.5">
                        <Input value={item.routeFrom} onChange={e => updateItem(idx,"routeFrom",e.target.value)} placeholder="起點" className="h-7 text-xs w-24" />
                      </td>
                      <td className="p-1.5">
                        <Input value={item.routeTo} onChange={e => updateItem(idx,"routeTo",e.target.value)} placeholder="迄點" className="h-7 text-xs w-24" />
                      </td>
                      <td className="p-1.5">
                        <Select value={item.vehicleType || "__none"} onValueChange={v => updateItem(idx,"vehicleType",v==="__none"?"":v)}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue placeholder="車型" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">─</SelectItem>
                            {VEHICLE_TYPES.filter(Boolean).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5">
                        <Input value={item.cargoType} onChange={e => updateItem(idx,"cargoType",e.target.value)} placeholder="貨物" className="h-7 text-xs w-20" />
                      </td>
                      <td className="p-1.5">
                        <Select value={item.unit} onValueChange={v => updateItem(idx,"unit",v)}>
                          <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(UNIT_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5">
                        <Input type="number" value={item.unitPrice} onChange={e => updateItem(idx,"unitPrice",e.target.value)} placeholder="0" className="h-7 text-xs w-20 text-right" />
                      </td>
                      <td className="p-1.5">
                        <Input type="number" value={item.minCharge} onChange={e => updateItem(idx,"minCharge",e.target.value)} placeholder="0" className="h-7 text-xs w-20 text-right" />
                      </td>
                      <td className="p-1.5">
                        <Input value={item.notes} onChange={e => updateItem(idx,"notes",e.target.value)} placeholder="備註" className="h-7 text-xs w-28" />
                      </td>
                      <td className="p-1.5">
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">尚無明細，點「新增明細」加入報價項目</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "儲存中..." : (isNew ? "建立報價單" : "儲存變更")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QuoteDetailDialog ────────────────────────────────────────────────────────

function QuoteDetailDialog({ quoteId, onClose, onEdit }: { quoteId: number; onClose: () => void; onEdit: () => void; }) {
  const { data: quote, isLoading } = useQuery<ContractQuote>({
    queryKey: ["contract-quote-detail", quoteId],
    queryFn: () => fetch(`${API}/contract-quotes/${quoteId}`).then(r => r.json()),
  });

  if (isLoading || !quote) return null;

  const clientName = quote.customer_name_resolved ?? quote.customer_name ?? "─";

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            {quote.quote_no}
            <StatusBadge status={quote.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs">報價名稱</span><div className="font-medium">{quote.title}</div></div>
            <div><span className="text-muted-foreground text-xs">客戶</span><div className="font-medium">{clientName}</div></div>
            <div><span className="text-muted-foreground text-xs">有效期間</span>
              <div className="font-medium">
                {quote.valid_from ? quote.valid_from.slice(0,10) : "─"} ~ {quote.valid_to ? quote.valid_to.slice(0,10) : "長期"}
              </div>
            </div>
            {quote.contact_person && <div><span className="text-muted-foreground text-xs">聯絡人</span><div>{quote.contact_person} {quote.contact_phone}</div></div>}
            {quote.notes && <div className="col-span-2"><span className="text-muted-foreground text-xs">備註</span><div className="whitespace-pre-wrap">{quote.notes}</div></div>}
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-2">報價明細</h4>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-left">路線</th>
                    <th className="p-2 text-left">車型</th>
                    <th className="p-2 text-left">貨物</th>
                    <th className="p-2 text-right">單價 (NT$)</th>
                    <th className="p-2 text-center">計費</th>
                    <th className="p-2 text-right">最低費</th>
                    <th className="p-2 text-left">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(quote.items ?? []).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2">
                        {item.route_from || item.routeFrom || "─"}
                        {(item.route_to || item.routeTo) ? <><ChevronRight className="w-3 h-3 inline mx-0.5 text-muted-foreground" />{item.route_to || item.routeTo}</> : ""}
                      </td>
                      <td className="p-2">{item.vehicle_type || item.vehicleType || "─"}</td>
                      <td className="p-2">{item.cargo_type || item.cargoType || "─"}</td>
                      <td className="p-2 text-right font-semibold">NT${Number(item.unit_price ?? item.unitPrice).toLocaleString()}</td>
                      <td className="p-2 text-center text-muted-foreground">{UNIT_LABELS[item.unit] ?? item.unit}</td>
                      <td className="p-2 text-right">{Number(item.min_charge ?? item.minCharge) > 0 ? `NT$${Number(item.min_charge ?? item.minCharge).toLocaleString()}` : "─"}</td>
                      <td className="p-2 text-muted-foreground">{item.notes || "─"}</td>
                    </tr>
                  ))}
                  {!quote.items?.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">無報價明細</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
          <Button onClick={onEdit}><Edit className="w-4 h-4 mr-1" />編輯</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

function fmtDT(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0,10);
  const ymd = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
  const hm  = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  return `${ymd} ${hm}`;
}
function fmtDate(s?: string | null) {
  if (!s) return "";
  return s.slice(0,10).replace(/-/g,"/");
}

export default function ContractQuoteTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<ContractQuote | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContractQuote | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers-for-quote-filter"],
    queryFn: () => fetch(`${API}/customers`).then(r=>r.json()).then(d=>Array.isArray(d)?d:[]),
    staleTime: 120000,
  });

  const { data: quotes = [], isLoading } = useQuery<ContractQuote[]>({
    queryKey: ["contract-quotes", search, filterStatus, filterCustomer],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCustomer !== "all") params.set("customerId", filterCustomer);
      return fetch(`${API}/contract-quotes?${params}`).then(r => r.json()).then(d => Array.isArray(d) ? d : []);
    },
    refetchInterval: 60000,
  });

  const stats = useMemo(() => ({
    total:     quotes.length,
    draft:     quotes.filter(q => q.status === "draft").length,
    confirmed: quotes.filter(q => q.status === "confirmed").length,
    expired:   quotes.filter(q => q.status === "expired" || (q.status === "confirmed" && isExpired(q))).length,
  }), [quotes]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`${API}/contract-quotes/${deleteTarget.id}`, { method:"DELETE" });
      toast({ title:`已刪除報價單 ${deleteTarget.quote_no}` });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["contract-quotes"] });
    } catch (e: any) {
      toast({ title:"刪除失敗", description: e.message, variant:"destructive" });
    }
  }

  async function handleClone(q: ContractQuote) {
    try {
      const r = await fetch(`${API}/contract-quotes/${q.id}/clone`, { method:"POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title:`已複製為 ${data.quote_no}` });
      qc.invalidateQueries({ queryKey: ["contract-quotes"] });
    } catch (e: any) {
      toast({ title:"複製失敗", description: e.message, variant:"destructive" });
    }
  }

  async function handleStatusChange(q: ContractQuote, status: string) {
    try {
      await fetch(`${API}/contract-quotes/${q.id}/status`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ["contract-quotes"] });
    } catch (e: any) {
      toast({ title:"狀態更新失敗", variant:"destructive" });
    }
  }

  function openEdit(q: ContractQuote) {
    fetch(`${API}/contract-quotes/${q.id}`).then(r => r.json()).then(data => {
      setEditingQuote(data);
    });
  }

  return (
    <div className="space-y-4">

      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label:"報價單總數", value: stats.total,
            bg:"bg-gradient-to-br from-blue-500 to-blue-600",
            icon:<FileText className="w-5 h-5 text-white/80"/>,
          },
          {
            label:"草稿",       value: stats.draft,
            bg:"bg-gradient-to-br from-slate-400 to-slate-500",
            icon:<Clock className="w-5 h-5 text-white/80"/>,
          },
          {
            label:"已確認",     value: stats.confirmed,
            bg:"bg-gradient-to-br from-emerald-500 to-emerald-600",
            icon:<CheckCircle2 className="w-5 h-5 text-white/80"/>,
          },
          {
            label:"已過期",     value: stats.expired,
            bg:"bg-gradient-to-br from-amber-400 to-amber-500",
            icon:<Calendar className="w-5 h-5 text-white/80"/>,
          },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 shadow-sm flex items-center gap-3`}>
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">{s.icon}</div>
            <div>
              <div className="text-2xl font-bold text-white leading-none">{s.value}</div>
              <div className="text-xs text-white/80 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 搜尋 / 篩選列 ── */}
      <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">搜尋條件</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 px-4 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["contract-quotes"] })}>
              <Search className="w-3 h-3" /> 查詢
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setShowForm(true)}>
              <Plus className="w-3 h-3" /> 新增報價單
            </Button>
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5">
              <FileText className="w-3 h-3" /> 匯出 Excel
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">我報單號</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-7 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-400 transition"
                placeholder="輸入報價單號..." />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">客戶簡稱</label>
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger className="h-9 text-sm border-gray-200 focus:ring-2 focus:ring-blue-400/40">
                <SelectValue placeholder="全部客戶" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">── 全部客戶 ──</SelectItem>
                {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.short_name ?? c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">狀態</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm border-gray-200 focus:ring-2 focus:ring-blue-400/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">── 全部狀態 ──</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
                <SelectItem value="confirmed">已確認</SelectItem>
                <SelectItem value="expired">已過期</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">已選取</label>
            <div className="h-9 flex items-center px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              {selectedIds.size > 0
                ? <><span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center mr-2">{selectedIds.size}</span>筆已勾選</>
                : <span className="text-gray-400">尚未勾選</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── 資料列表 ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-12 bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl bg-gray-50/50">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <div className="text-base font-medium text-gray-400">尚無報價單</div>
          <div className="text-xs text-gray-400 mt-1 mb-4">點擊下方按鈕建立第一份合約報價</div>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" />建立報價單
          </Button>
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1120px]">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                  <th className="p-3 w-9 text-center">
                    <input type="checkbox" className="w-3.5 h-3.5 accent-white rounded"
                      checked={selectedIds.size === quotes.length && quotes.length > 0}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(quotes.map(q=>q.id)) : new Set())} />
                  </th>
                  {[
                    "我報單號","客戶簡稱","狀態","報價日期",
                    "生效日期前起","生效日期前迄",
                    "確認人員","確認日期",
                    "新增人員","新增日期",
                    "最後人員","最後日期","操作"
                  ].map(h => (
                    <th key={h} className={`p-3 whitespace-nowrap font-semibold text-[12px] tracking-wide ${h==="操作"?"text-center":"text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, idx) => {
                  const expired = isExpired(q);
                  const isSelected = selectedIds.has(q.id);
                  const effectiveStatus = expired && q.status === "confirmed" ? "expired" : q.status;
                  return (
                    <tr key={q.id}
                      className={`border-b last:border-b-0 transition-all duration-100 cursor-pointer
                        ${isSelected
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-200"
                          : idx%2===0 ? "bg-white" : "bg-slate-50/60"}
                        hover:bg-blue-50/80`}
                      onClick={() => setSelectedIds(prev => { const n=new Set(prev); n.has(q.id)?n.delete(q.id):n.add(q.id); return n; })}>

                      {/* checkbox */}
                      <td className="p-3 text-center" onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 rounded"
                          checked={isSelected}
                          onChange={e => setSelectedIds(prev => { const n=new Set(prev); e.target.checked?n.add(q.id):n.delete(q.id); return n; })} />
                      </td>

                      {/* 報單號 */}
                      <td className="p-3" onClick={e=>e.stopPropagation()}>
                        <button onClick={() => setViewingId(q.id)}
                          className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline underline-offset-2 transition-colors">
                          {q.quote_no}
                        </button>
                      </td>

                      {/* 客戶 */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <Truck className="w-2.5 h-2.5 text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-800">
                            {q.customer_short_name ?? q.customer_name_resolved ?? q.customer_name ?? "─"}
                          </span>
                        </div>
                      </td>

                      {/* 狀態 */}
                      <td className="p-3"><StatusBadge status={effectiveStatus} /></td>

                      {/* 報價日期 */}
                      <td className="p-3">
                        {q.quote_date
                          ? <span className="inline-flex items-center gap-1 text-gray-700"><Calendar className="w-3 h-3 text-gray-400"/>{fmtDate(q.quote_date)}</span>
                          : <span className="text-gray-300">──</span>}
                      </td>

                      {/* 生效前起 */}
                      <td className="p-3">
                        {q.valid_from
                          ? <span className="text-emerald-700 font-medium">{fmtDate(q.valid_from)}</span>
                          : <span className="text-gray-300">──</span>}
                      </td>

                      {/* 生效前迄 */}
                      <td className="p-3">
                        {q.valid_to
                          ? <span className={expired ? "text-amber-600 font-medium" : "text-gray-700"}>{fmtDate(q.valid_to)}</span>
                          : <span className="text-gray-300">長期</span>}
                      </td>

                      {/* 確認人員 */}
                      <td className="p-3">
                        {q.confirmed_by
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[11px] font-medium border border-emerald-100">{q.confirmed_by}</span>
                          : <span className="text-gray-300">──</span>}
                      </td>

                      {/* 確認日期 */}
                      <td className="p-3 text-gray-500 font-mono text-[11px]">{fmtDT(q.confirmed_at) || <span className="text-gray-200">──</span>}</td>

                      {/* 新增人員 */}
                      <td className="p-3">
                        {q.created_by
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium border border-blue-100">{q.created_by}</span>
                          : <span className="text-gray-300">──</span>}
                      </td>

                      {/* 新增日期 */}
                      <td className="p-3 text-gray-500 font-mono text-[11px]">{fmtDT(q.created_at)}</td>

                      {/* 最後人員 */}
                      <td className="p-3">
                        {q.updated_by
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[11px] font-medium border border-purple-100">{q.updated_by}</span>
                          : <span className="text-gray-300">──</span>}
                      </td>

                      {/* 最後日期 */}
                      <td className="p-3 text-gray-500 font-mono text-[11px]">{fmtDT(q.updated_at) || <span className="text-gray-200">──</span>}</td>

                      {/* 操作 */}
                      <td className="p-3" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-center">
                          <button title="查看 / 編輯" onClick={() => openEdit(q)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors border border-blue-100">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button title="複製報價單" onClick={() => handleClone(q)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 transition-colors border border-slate-200">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {q.status === "draft" && (
                            <button title="確認報價" onClick={() => handleStatusChange(q, "confirmed")}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors border border-emerald-100">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button title="刪除" onClick={() => setDeleteTarget(q)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors border border-red-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* 底部資訊列 */}
          <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-t flex items-center justify-between">
            <span className="text-xs text-gray-500">
              共 <span className="font-semibold text-gray-700">{quotes.length}</span> 筆報價單
              {selectedIds.size > 0 && <> · 已勾選 <span className="font-semibold text-blue-600">{selectedIds.size}</span> 筆</>}
            </span>
            <div className="flex gap-1.5">
              {[
                { label:"草稿",  count: stats.draft,     dot:"bg-slate-400" },
                { label:"確認",  count: stats.confirmed, dot:"bg-emerald-500" },
                { label:"過期",  count: stats.expired,   dot:"bg-amber-500" },
              ].map(s => (
                <span key={s.label} className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                  {s.label} {s.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showForm && (
        <QuoteFormDialog quote={null} onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["contract-quotes"] }); }} />
      )}
      {editingQuote && (
        <QuoteFormDialog quote={editingQuote} onClose={() => setEditingQuote(null)}
          onSave={() => { setEditingQuote(null); qc.invalidateQueries({ queryKey: ["contract-quotes"] }); }} />
      )}
      {viewingId && (
        <QuoteDetailDialog quoteId={viewingId} onClose={() => setViewingId(null)}
          onEdit={() => { const q = quotes.find(x => x.id === viewingId); if (q) { setViewingId(null); openEdit(q); } }} />
      )}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定要刪除報價單「<span className="font-semibold">{deleteTarget?.quote_no}</span>」及其所有明細嗎？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>確認刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
