import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Building2, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Partner {
  id: number;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  email: string | null;
  tax_id: string | null;
  base_price: number;
  km_rate: number;
  profit_margin: number;
  contract_type: string;
  is_active: boolean;
  bank_name: string | null;
  bank_account: string | null;
  notes: string | null;
}

const EMPTY: Omit<Partner, "id"> = {
  name: "", contact_name: "", contact_phone: "", email: "", tax_id: "",
  base_price: 800, km_rate: 25, profit_margin: 15,
  contract_type: "standard", is_active: true,
  bank_name: "", bank_account: "", notes: "",
};

const CONTRACT_LABELS: Record<string, string> = {
  standard: "標準合約",
  vip: "VIP 長約",
  franchise: "加盟合約",
  spot: "臨時合約",
};
const CONTRACT_COLORS: Record<string, string> = {
  standard: "bg-blue-100 text-blue-800",
  vip: "bg-yellow-100 text-yellow-800",
  franchise: "bg-purple-100 text-purple-800",
  spot: "bg-gray-100 text-gray-700",
};

export default function PartnerManagement() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<Omit<Partner, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/partners`);
      const d = await r.json();
      if (d.ok) setPartners(d.partners);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p: Partner) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const save = async () => {
    if (!form.name) {
      toast({ title: "廠商名稱為必填", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${API}/api/partners/${editing.id}` : `${API}/api/partners`;
      const r = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: editing ? "廠商已更新" : "廠商已新增" });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: e.message || "儲存失敗", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const del = async (p: Partner) => {
    if (!confirm(`確定刪除「${p.name}」？`)) return;
    try {
      const r = await fetch(`${API}/api/partners/${p.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "廠商已刪除" });
      load();
    } catch (e: any) {
      toast({ title: e.message || "刪除失敗", variant: "destructive" });
    }
  };

  const setF = (k: keyof Omit<Partner, "id">, v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">廠商管理</h1>
            <p className="text-sm text-gray-500">合作廠商檔案與合約費率管理</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />新增廠商
          </Button>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>廠商名稱</TableHead>
              <TableHead>聯絡資訊</TableHead>
              <TableHead>合約類型</TableHead>
              <TableHead className="text-right">起步價</TableHead>
              <TableHead className="text-right">公里費</TableHead>
              <TableHead className="text-right">利潤率</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-gray-400">載入中…</TableCell></TableRow>
            ) : partners.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-gray-400">尚無廠商資料，請新增</TableCell></TableRow>
            ) : partners.map(p => (
              <TableRow key={p.id} className="hover:bg-gray-50">
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  {p.tax_id && <div className="text-xs text-gray-400">統編：{p.tax_id}</div>}
                </TableCell>
                <TableCell>
                  {p.contact_name && <div className="text-sm">{p.contact_name}</div>}
                  {p.contact_phone && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="h-3 w-3" />{p.contact_phone}
                    </div>
                  )}
                  {p.email && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Mail className="h-3 w-3" />{p.email}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={CONTRACT_COLORS[p.contract_type] ?? "bg-gray-100"}>
                    {CONTRACT_LABELS[p.contract_type] ?? p.contract_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  NT$ {Number(p.base_price).toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  NT$ {Number(p.km_rate).toFixed(0)}/km
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(p.profit_margin).toFixed(1)}%
                </TableCell>
                <TableCell>
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {p.is_active ? "啟用" : "停用"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => del(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯廠商" : "新增廠商"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label>廠商名稱 *</Label>
              <Input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="例：台積電物流部" />
            </div>
            <div>
              <Label>聯絡人</Label>
              <Input value={form.contact_name ?? ""} onChange={e => setF("contact_name", e.target.value)} />
            </div>
            <div>
              <Label>聯絡電話</Label>
              <Input value={form.contact_phone ?? ""} onChange={e => setF("contact_phone", e.target.value)} />
            </div>
            <div>
              <Label>電子郵件</Label>
              <Input type="email" value={form.email ?? ""} onChange={e => setF("email", e.target.value)} />
            </div>
            <div>
              <Label>統一編號</Label>
              <Input value={form.tax_id ?? ""} onChange={e => setF("tax_id", e.target.value)} maxLength={8} />
            </div>
            <div>
              <Label>合約類型</Label>
              <Select value={form.contract_type} onValueChange={v => setF("contract_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>狀態</Label>
              <Select value={form.is_active ? "1" : "0"} onValueChange={v => setF("is_active", v === "1")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">啟用</SelectItem>
                  <SelectItem value="0">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>起步價 (NT$)</Label>
              <Input type="number" value={form.base_price} onChange={e => setF("base_price", +e.target.value)} />
            </div>
            <div>
              <Label>每公里費率 (NT$/km)</Label>
              <Input type="number" value={form.km_rate} onChange={e => setF("km_rate", +e.target.value)} />
            </div>
            <div>
              <Label>利潤率 (%)</Label>
              <Input type="number" step="0.1" value={form.profit_margin} onChange={e => setF("profit_margin", +e.target.value)} />
            </div>
            <div>
              <Label>銀行名稱</Label>
              <Input value={form.bank_name ?? ""} onChange={e => setF("bank_name", e.target.value)} />
            </div>
            <div>
              <Label>銀行帳號</Label>
              <Input value={form.bank_account ?? ""} onChange={e => setF("bank_account", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>備註</Label>
              <Textarea rows={3} value={form.notes ?? ""} onChange={e => setF("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
