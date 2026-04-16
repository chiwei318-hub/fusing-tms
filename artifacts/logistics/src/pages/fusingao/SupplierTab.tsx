import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, X, RefreshCw, Edit, Trash2,
  Truck, Phone, MapPin, Building2, Users, CheckCircle2, Ban
} from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: number;
  name: string;
  short_name?: string;
  tax_id?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  vehicle_types?: string;
  service_regions?: string;
  payment_terms?: string;
  bank_name?: string;
  bank_account?: string;
  status: string;
  category?: string;
  commission_rate: number;
  notes?: string;
  created_at: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string,{ label:string; color:string }> = {
  active:    { label:"合作中", color:"bg-green-100 text-green-700" },
  inactive:  { label:"暫停合作", color:"bg-gray-100 text-gray-600" },
  suspended: { label:"終止合作", color:"bg-red-100 text-red-600" },
};

const CATEGORIES = ["","一般貨運","冷藏運輸","危險品運輸","重型機械","搬家","倉儲","報關","其他"];

// ─── SupplierFormDialog ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name:"", shortName:"", taxId:"", contactPerson:"", contactPhone:"",
  contactEmail:"", address:"", vehicleTypes:"", serviceRegions:"",
  paymentTerms:"", bankName:"", bankAccount:"",
  status:"active", category:"", commissionRate:"0", notes:"",
};

function SupplierFormDialog({ supplier, onClose, onSave }: {
  supplier: Supplier | null; onClose: () => void; onSave: () => void;
}) {
  const { toast } = useToast();
  const isNew = !supplier;
  const [form, setForm] = useState({
    name:          supplier?.name ?? "",
    shortName:     supplier?.short_name ?? "",
    taxId:         supplier?.tax_id ?? "",
    contactPerson: supplier?.contact_person ?? "",
    contactPhone:  supplier?.contact_phone ?? "",
    contactEmail:  supplier?.contact_email ?? "",
    address:       supplier?.address ?? "",
    vehicleTypes:  supplier?.vehicle_types ?? "",
    serviceRegions:supplier?.service_regions ?? "",
    paymentTerms:  supplier?.payment_terms ?? "",
    bankName:      supplier?.bank_name ?? "",
    bankAccount:   supplier?.bank_account ?? "",
    status:        supplier?.status ?? "active",
    category:      supplier?.category ?? "",
    commissionRate:String(supplier?.commission_rate ?? 0),
    notes:         supplier?.notes ?? "",
  });
  const [loading, setLoading] = useState(false);

  function f(k: keyof typeof form, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function submit() {
    if (!form.name) { toast({ title:"請填寫供應商名稱", variant:"destructive" }); return; }
    setLoading(true);
    try {
      const url = isNew ? `${API}/suppliers` : `${API}/suppliers/${supplier!.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method, headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ ...form, commissionRate: parseFloat(form.commissionRate) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: isNew ? "供應商已新增" : "供應商資料已更新" });
      onSave();
    } catch (e: any) {
      toast({ title:"操作失敗", description: e.message, variant:"destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            {isNew ? "新增供應商" : `編輯供應商 — ${supplier?.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Basic info */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">基本資料</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>供應商名稱 *</Label>
                <Input value={form.name} onChange={e => f("name", e.target.value)} placeholder="公司全名" />
              </div>
              <div className="space-y-1">
                <Label>簡稱</Label>
                <Input value={form.shortName} onChange={e => f("shortName", e.target.value)} placeholder="供應商簡稱" />
              </div>
              <div className="space-y-1">
                <Label>統一編號</Label>
                <Input value={form.taxId} onChange={e => f("taxId", e.target.value)} placeholder="8碼統編" maxLength={8} />
              </div>
              <div className="space-y-1">
                <Label>供應商類別</Label>
                <Select value={form.category || "__none"} onValueChange={v => f("category", v==="__none"?"":v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="選擇類別" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">─ 未分類 ─</SelectItem>
                    {CATEGORIES.filter(Boolean).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={v => f("status", v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">合作中</SelectItem>
                    <SelectItem value="inactive">暫停合作</SelectItem>
                    <SelectItem value="suspended">終止合作</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">聯絡資訊</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>聯絡人</Label>
                <Input value={form.contactPerson} onChange={e => f("contactPerson", e.target.value)} placeholder="聯絡人姓名" />
              </div>
              <div className="space-y-1">
                <Label>聯絡電話</Label>
                <Input value={form.contactPhone} onChange={e => f("contactPhone", e.target.value)} placeholder="電話" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.contactEmail} onChange={e => f("contactEmail", e.target.value)} placeholder="電子信箱" type="email" />
              </div>
              <div className="space-y-1">
                <Label>地址</Label>
                <Input value={form.address} onChange={e => f("address", e.target.value)} placeholder="公司地址" />
              </div>
            </div>
          </div>

          {/* Service info */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">服務資訊</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>車型（可承接）</Label>
                <Input value={form.vehicleTypes} onChange={e => f("vehicleTypes", e.target.value)} placeholder="例：1.5噸, 3.5噸, 7噸" />
              </div>
              <div className="space-y-1">
                <Label>服務區域</Label>
                <Input value={form.serviceRegions} onChange={e => f("serviceRegions", e.target.value)} placeholder="例：桃園, 新竹, 苗栗" />
              </div>
              <div className="space-y-1">
                <Label>付款方式</Label>
                <Input value={form.paymentTerms} onChange={e => f("paymentTerms", e.target.value)} placeholder="例：月結30天" />
              </div>
              <div className="space-y-1">
                <Label>傭金率 (%)</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.commissionRate}
                  onChange={e => f("commissionRate", e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* Bank info */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">銀行資訊</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>銀行名稱</Label>
                <Input value={form.bankName} onChange={e => f("bankName", e.target.value)} placeholder="銀行 / 分行" />
              </div>
              <div className="space-y-1">
                <Label>帳號</Label>
                <Input value={form.bankAccount} onChange={e => f("bankAccount", e.target.value)} placeholder="帳戶號碼" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>備註</Label>
            <Textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} placeholder="其他注意事項..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "儲存中..." : (isNew ? "新增供應商" : "儲存變更")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function SupplierTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["suppliers", search, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus !== "all") params.set("status", filterStatus);
      return fetch(`${API}/suppliers?${params}`).then(r => r.json());
    },
    refetchInterval: 60000,
  });

  const stats = {
    total:    suppliers.length,
    active:   suppliers.filter(s => s.status === "active").length,
    inactive: suppliers.filter(s => s.status !== "active").length,
  };

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await fetch(`${API}/suppliers/${deleteTarget.id}`, { method:"DELETE" });
      toast({ title:`已刪除供應商「${deleteTarget.name}」` });
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e: any) {
      toast({ title:"刪除失敗", description: e.message, variant:"destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label:"供應商總數", value: stats.total,    color:"text-primary",    icon:<Building2 className="w-4 h-4"/> },
          { label:"合作中",     value: stats.active,   color:"text-green-600",  icon:<CheckCircle2 className="w-4 h-4"/> },
          { label:"暫停/終止",  value: stats.inactive, color:"text-gray-500",   icon:<Ban className="w-4 h-4"/> },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋名稱、統編、聯絡人..."
            className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-52 focus:ring-2 focus:ring-primary/30 transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            <SelectItem value="active">合作中</SelectItem>
            <SelectItem value="inactive">暫停</SelectItem>
            <SelectItem value="suspended">終止</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> 新增供應商
        </Button>
      </div>

      {/* Supplier grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-muted/60 rounded-lg animate-pulse" />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <div className="text-sm">尚無供應商資料</div>
          <Button size="sm" className="mt-3 gap-1" onClick={() => setShowForm(true)}><Plus className="w-3.5 h-3.5" />新增第一個供應商</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {suppliers.map(s => {
            const statusCfg = STATUS_CFG[s.status] ?? STATUS_CFG.active;
            return (
              <div key={s.id} className="border rounded-lg p-3 bg-card hover:shadow-md transition-all group relative">
                {/* Quick actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => setEditingSupplier(s)}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border shadow-sm text-blue-600 hover:bg-blue-50 transition-colors">
                    <Edit className="w-3 h-3" />
                  </button>
                  <button onClick={() => setDeleteTarget(s)}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border shadow-sm text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2 pr-14">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm truncate">{s.name}</span>
                      {s.short_name && <span className="text-[10px] text-muted-foreground">（{s.short_name}）</span>}
                    </div>
                    {s.tax_id && <div className="text-[10px] text-muted-foreground">統編 {s.tax_id}</div>}
                    {s.category && <div className="text-[10px] text-blue-600 font-medium">{s.category}</div>}
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                </div>

                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {s.contact_person && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {s.contact_person}
                      {s.contact_phone && <span className="ml-1 flex items-center gap-0.5"><Phone className="w-3 h-3" />{s.contact_phone}</span>}
                    </div>
                  )}
                  {s.vehicle_types && (
                    <div className="flex items-center gap-1"><Truck className="w-3 h-3" />{s.vehicle_types}</div>
                  )}
                  {s.service_regions && (
                    <div className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.service_regions}</div>
                  )}
                </div>

                {(s.payment_terms || s.commission_rate > 0) && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t text-[10px]">
                    {s.payment_terms && <span className="text-muted-foreground">{s.payment_terms}</span>}
                    {s.commission_rate > 0 && (
                      <span className="text-orange-600 font-medium ml-auto">傭金 {s.commission_rate}%</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      {showForm && (
        <SupplierFormDialog supplier={null} onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} />
      )}
      {editingSupplier && (
        <SupplierFormDialog supplier={editingSupplier} onClose={() => setEditingSupplier(null)}
          onSave={() => { setEditingSupplier(null); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} />
      )}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定要刪除供應商「<span className="font-semibold">{deleteTarget?.name}</span>」嗎？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>確認刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
