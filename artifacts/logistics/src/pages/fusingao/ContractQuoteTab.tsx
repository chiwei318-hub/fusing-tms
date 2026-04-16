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
  valid_from?: string;
  valid_to?: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  item_count?: number;
  created_at: string;
  items?: QuoteItem[];
}

interface Customer { id: number; name: string; short_name?: string; phone: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string,{ label:string; color:string; icon:any }> = {
  draft:     { label:"草稿",   color:"bg-gray-100 text-gray-600",    icon: <Clock className="w-3 h-3" /> },
  confirmed: { label:"已確認", color:"bg-green-100 text-green-700",  icon: <CheckCircle2 className="w-3 h-3" /> },
  expired:   { label:"已過期", color:"bg-orange-100 text-orange-700",icon: <Clock className="w-3 h-3" /> },
  cancelled: { label:"已取消", color:"bg-red-100 text-red-600",      icon: <Ban className="w-3 h-3" /> },
};

const UNIT_LABELS: Record<string,string> = {
  per_trip:"次/趟", per_km:"公里", per_ton:"公噸", per_cbm:"立方公尺", per_day:"天", per_hour:"小時"
};

const VEHICLE_TYPES = ["","1.5噸","2噸","3.5噸","5噸","7噸","10噸","17噸","20噸","冷藏車","曳引車","廂型車","平板車"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
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
    validFrom:     quote?.valid_from ?? "",
    validTo:       quote?.valid_to ?? "",
    contactPerson: quote?.contact_person ?? "",
    contactPhone:  quote?.contact_phone ?? "",
    notes:         quote?.notes ?? "",
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
              <Label>有效期起</Label>
              <Input type="date" value={form.validFrom} onChange={e => f("validFrom", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>有效期迄</Label>
              <Input type="date" value={form.validTo} onChange={e => f("validTo", e.target.value)} />
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

export default function ContractQuoteTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState<ContractQuote | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContractQuote | null>(null);

  const { data: quotes = [], isLoading } = useQuery<ContractQuote[]>({
    queryKey: ["contract-quotes", search, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus !== "all") params.set("status", filterStatus);
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
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label:"報價單總數", value: stats.total,     color:"text-primary", icon:<FileText className="w-4 h-4"/> },
          { label:"草稿",       value: stats.draft,     color:"text-gray-500", icon:<Clock className="w-4 h-4"/> },
          { label:"已確認",     value: stats.confirmed, color:"text-green-600", icon:<CheckCircle2 className="w-4 h-4"/> },
          { label:"已過期",     value: stats.expired,   color:"text-orange-500", icon:<Calendar className="w-4 h-4"/> },
        ].map(s => (
          <div key={s.label} className="border rounded-lg p-3 bg-card">
            <div className="flex items-center gap-2">
              <span className={s.color}>{s.icon}</span>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋報價單號、客戶、名稱..."
            className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-56 focus:ring-2 focus:ring-primary/30 transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="confirmed">已確認</SelectItem>
            <SelectItem value="expired">已過期</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["contract-quotes"] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> 新增報價單
        </Button>
      </div>

      {/* Quote list */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />)}</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <div className="text-sm">尚無報價單</div>
          <Button size="sm" className="mt-3 gap-1" onClick={() => setShowForm(true)}><Plus className="w-3.5 h-3.5" />建立第一份報價單</Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs">
              <tr>
                <th className="p-3 text-left">報價單號</th>
                <th className="p-3 text-left">客戶 / 名稱</th>
                <th className="p-3 text-center">狀態</th>
                <th className="p-3 text-left">有效期間</th>
                <th className="p-3 text-center">明細數</th>
                <th className="p-3 text-left">建立時間</th>
                <th className="p-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.map(q => {
                const expired = isExpired(q);
                return (
                  <tr key={q.id} className={`hover:bg-muted/20 transition-colors ${expired && q.status==="confirmed" ? "opacity-60" : ""}`}>
                    <td className="p-3">
                      <button onClick={() => setViewingId(q.id)} className="font-mono text-blue-600 hover:underline font-semibold">{q.quote_no}</button>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{q.customer_name_resolved ?? q.customer_name ?? "─"}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-48">{q.title}</div>
                    </td>
                    <td className="p-3 text-center">
                      <StatusBadge status={expired && q.status==="confirmed" ? "expired" : q.status} />
                    </td>
                    <td className="p-3 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {q.valid_from ? q.valid_from.slice(0,10) : "─"} ~ {q.valid_to ? q.valid_to.slice(0,10) : "長期"}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="w-3 h-3" />{q.item_count ?? 0} 項
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{q.created_at?.slice(0,10)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button title="編輯" onClick={() => openEdit(q)}
                          className="w-7 h-7 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600 transition-colors">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button title="複製" onClick={() => handleClone(q)}
                          className="w-7 h-7 flex items-center justify-center rounded border hover:bg-gray-50 text-gray-600 transition-colors">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {q.status === "draft" && (
                          <button title="確認報價" onClick={() => handleStatusChange(q, "confirmed")}
                            className="w-7 h-7 flex items-center justify-center rounded border hover:bg-green-50 text-green-600 transition-colors">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button title="刪除" onClick={() => setDeleteTarget(q)}
                          className="w-7 h-7 flex items-center justify-center rounded border hover:bg-red-50 text-red-500 transition-colors">
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
