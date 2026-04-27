import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Building2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Partner {
  id: number;
  partner_id: string;
  partner_name: string;
  tier: string;
  base_price: number;
  rate_per_km: number;
  profit_margin: number;
  park_fee: number;
  mountain_fee: number;
  special_zone_fee: number;
  remote_fee: number;
  notes: string;
  active: boolean;
}

const EMPTY: Omit<Partner, "id"> = {
  partner_id: "", partner_name: "", tier: "一般",
  base_price: 800, rate_per_km: 25, profit_margin: 0.15,
  park_fee: 300, mountain_fee: 500, special_zone_fee: 500, remote_fee: 1000,
  notes: "", active: true,
};

const TIER_COLORS: Record<string, string> = {
  VIP: "bg-yellow-100 text-yellow-800",
  一般: "bg-blue-100 text-blue-800",
  加盟商: "bg-purple-100 text-purple-800",
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
      const r = await fetch(`${API}/api/freight-quote/partners`);
      const d = await r.json();
      if (d.ok) setPartners(d.partners);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (p: Partner) => {
    setEditing(p);
    setForm({ ...p });
    setOpen(true);
  };

  const save = async () => {
    if (!form.partner_id || !form.partner_name) {
      toast({ title: "廠商 ID 和名稱為必填", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `${API}/api/freight-quote/partners/${editing.id}`
        : `${API}/api/freight-quote/partners`;
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
      toast({ title: "儲存失敗", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (p: Partner) => {
    if (!confirm(`確定要刪除「${p.partner_name}」嗎？`)) return;
    try {
      await fetch(`${API}/api/freight-quote/partners/${p.id}`, { method: "DELETE" });
      toast({ title: "已刪除" });
      load();
    } catch {
      toast({ title: "刪除失敗", variant: "destructive" });
    }
  };

  const set = (k: keyof typeof EMPTY, v: string | number | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">廠商檔案管理</h1>
            <p className="text-sm text-muted-foreground">管理合約廠商報價設定與利潤比例</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" />
            新增廠商
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "廠商總數", value: partners.length, color: "text-blue-700" },
          { label: "啟用中", value: partners.filter(p => p.active).length, color: "text-green-700" },
          { label: "平均利潤率", value: `${partners.length ? (partners.reduce((s, p) => s + Number(p.profit_margin), 0) / partners.length * 100).toFixed(1) : 0}%`, color: "text-purple-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>廠商</TableHead>
              <TableHead>等級</TableHead>
              <TableHead className="text-right">起步價</TableHead>
              <TableHead className="text-right">里程費/km</TableHead>
              <TableHead className="text-right">平台抽成</TableHead>
              <TableHead className="text-right">山區費</TableHead>
              <TableHead className="text-right">進倉費</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">載入中…</TableCell></TableRow>
            ) : partners.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">尚無廠商資料，點擊右上角新增</TableCell></TableRow>
            ) : partners.map(p => (
              <TableRow key={p.id} className="hover:bg-muted/20">
                <TableCell>
                  <div className="font-medium">{p.partner_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.partner_id}</div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[p.tier] ?? "bg-gray-100 text-gray-800"}`}>
                    {p.tier}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">${Number(p.base_price).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">${Number(p.rate_per_km).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">{(Number(p.profit_margin) * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono">${Number(p.mountain_fee).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">${Number(p.special_zone_fee).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={p.active ? "default" : "secondary"}>
                    {p.active ? "啟用" : "停用"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(p)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯廠商" : "新增廠商"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>廠商 ID <span className="text-destructive">*</span></Label>
              <Input placeholder="如 VIP001" value={form.partner_id} onChange={e => set("partner_id", e.target.value)} disabled={!!editing} />
            </div>
            <div className="space-y-1.5">
              <Label>廠商名稱 <span className="text-destructive">*</span></Label>
              <Input placeholder="如 台積電物流部" value={form.partner_name} onChange={e => set("partner_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>合約等級</Label>
              <Select value={form.tier} onValueChange={v => set("tier", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="一般">一般</SelectItem>
                  <SelectItem value="加盟商">加盟商</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>平台抽成（如 0.15 = 15%）</Label>
              <Input type="number" step="0.01" value={form.profit_margin} onChange={e => set("profit_margin", parseFloat(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>起步價（元）</Label>
              <Input type="number" value={form.base_price} onChange={e => set("base_price", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>里程單價（元/km）</Label>
              <Input type="number" value={form.rate_per_km} onChange={e => set("rate_per_km", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>停車費（元）</Label>
              <Input type="number" value={form.park_fee} onChange={e => set("park_fee", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>山區加成（元）</Label>
              <Input type="number" value={form.mountain_fee} onChange={e => set("mountain_fee", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>進倉服務費（元）</Label>
              <Input type="number" value={form.special_zone_fee} onChange={e => set("special_zone_fee", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>偏鄉加成（元）</Label>
              <Input type="number" value={form.remote_fee} onChange={e => set("remote_fee", Number(e.target.value))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>備註</Label>
              <Input placeholder="合約備註說明" value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
