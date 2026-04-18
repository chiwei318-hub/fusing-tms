import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, Search,
  User, Truck, Download, Phone, MapPin, CreditCard, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface ShopeeDriver {
  id: number;
  shopee_id: string;
  name: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  fleet_name: string | null;
  id_number: string | null;
  birthday: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  is_own_driver: boolean;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  shopee_id: "",
  name: "",
  vehicle_plate: "",
  vehicle_type: "",
  fleet_name: "",
  id_number: "",
  birthday: "",
  address: "",
  phone: "",
  notes: "",
  is_own_driver: true,
};

export default function ShopeeDriversTab() {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<ShopeeDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOwn, setFilterOwn] = useState<"all" | "own" | "outsource">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/shopee-drivers${search ? `?q=${encodeURIComponent(search)}` : ""}`));
      const d = await r.json();
      if (d.ok) setDrivers(d.drivers);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { load(); }, [load]);

  const displayed = drivers.filter(d => {
    if (filterOwn === "own" && !d.is_own_driver) return false;
    if (filterOwn === "outsource" && d.is_own_driver) return false;
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(d: ShopeeDriver) {
    setEditingId(d.id);
    setForm({
      shopee_id: d.shopee_id,
      name: d.name ?? "",
      vehicle_plate: d.vehicle_plate ?? "",
      vehicle_type: d.vehicle_type ?? "",
      fleet_name: d.fleet_name ?? "",
      id_number: d.id_number ?? "",
      birthday: d.birthday ?? "",
      address: d.address ?? "",
      phone: d.phone ?? "",
      notes: d.notes ?? "",
      is_own_driver: d.is_own_driver,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.shopee_id.trim()) {
      toast({ title: "工號為必填", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? apiUrl(`/shopee-drivers/${editingId}`) : apiUrl("/shopee-drivers");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopee_id: form.shopee_id.trim(),
          name: form.name.trim() || null,
          vehicle_plate: form.vehicle_plate.trim() || null,
          vehicle_type: form.vehicle_type.trim() || null,
          fleet_name: form.fleet_name.trim() || null,
          id_number: form.id_number.trim() || null,
          birthday: form.birthday.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
          is_own_driver: form.is_own_driver,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "儲存失敗");
      toast({ title: editingId ? "更新成功" : "新增成功" });
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function del(driver: ShopeeDriver) {
    if (!confirm(`確定刪除工號 ${driver.shopee_id}（${driver.name ?? "未填姓名"}）？`)) return;
    setDeletingId(driver.id);
    try {
      await fetch(apiUrl(`/shopee-drivers/${driver.id}`), { method: "DELETE" });
      toast({ title: "已刪除" });
      load();
    } finally {
      setDeletingId(null);
    }
  }

  function exportCsv() {
    const header = ["工號", "姓名", "身分證", "生日", "手機", "戶籍地址", "車牌", "車型", "車隊", "備注", "身份"];
    const rows = displayed.map(d => [
      d.shopee_id, d.name ?? "", d.id_number ?? "", d.birthday ?? "",
      d.phone ?? "", d.address ?? "",
      d.vehicle_plate ?? "", d.vehicle_type ?? "",
      d.fleet_name ?? "", d.notes ?? "",
      d.is_own_driver ? "自有" : "外包",
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `司機名單_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const ownCount = drivers.filter(d => d.is_own_driver).length;
  const outCount = drivers.length - ownCount;

  return (
    <div className="space-y-4">

      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <User className="w-4 h-4" style={{ color: "#2563eb" }} />, val: drivers.length, label: "司機總數",    color: "#2563eb", bg: "#eff6ff" },
          { icon: <Truck className="w-4 h-4" style={{ color: "#059669" }} />, val: ownCount,        label: "自有司機",   color: "#059669", bg: "#f0fdf4" },
          { icon: <Truck className="w-4 h-4" style={{ color: "#d97706" }} />, val: outCount,        label: "外包司機",   color: "#d97706", bg: "#fffbeb" },
          { icon: <Phone className="w-4 h-4" style={{ color: "#7c3aed" }} />, val: drivers.filter(d => d.phone).length, label: "已填手機", color: "#7c3aed", bg: "#faf5ff" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${s.color}18` }}>
              {s.icon}
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs" style={{ color: "#6b7280" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 工具列 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" />
              蝦皮車隊司機名單
              <span className="text-xs font-normal text-gray-400">（蝦皮小楊）</span>
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              {/* 篩選 */}
              <div className="flex rounded-lg overflow-hidden border text-xs">
                {(["all", "own", "outsource"] as const).map(v => (
                  <button key={v}
                    onClick={() => setFilterOwn(v)}
                    className="px-3 py-1.5 transition-colors font-medium"
                    style={{
                      background: filterOwn === v ? "#2563eb" : "#fff",
                      color: filterOwn === v ? "#fff" : "#374151",
                    }}
                  >
                    {v === "all" ? "全部" : v === "own" ? "自有" : "外包"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-7 h-8 text-sm w-44"
                  placeholder="搜尋工號/姓名/手機..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!displayed.length}>
                <Download className="w-3.5 h-3.5 mr-1" />匯出 CSV
              </Button>
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" />新增司機
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">載入中…</div>
          ) : displayed.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">尚無符合條件的司機資料</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "linear-gradient(90deg,#1e40af,#2563eb)", color: "#fff" }}>
                    {["工號", "姓名", "身份", "手機", "身分證", "生日", "車牌", "車隊", "戶籍地址", "備注", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((d, idx) => (
                    <tr key={d.id}
                      className="border-b hover:bg-blue-50 transition-colors"
                      style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono font-bold text-blue-700">{d.shopee_id}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{d.name ?? <span className="text-gray-300 text-xs">未填</span>}</td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={d.is_own_driver
                            ? { background: "#dcfce7", color: "#065f46" }
                            : { background: "#ffedd5", color: "#9a3412" }}>
                          {d.is_own_driver ? "自有" : "外包"}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs font-mono">{d.phone ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-gray-600">{d.id_number ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{d.birthday ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d.vehicle_plate
                          ? <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "#f3f4f6" }}>{d.vehicle_plate}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{d.fleet_name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-48 truncate" title={d.address ?? ""}>{d.address ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{d.notes ?? ""}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(d)}
                            className="p-1 rounded hover:bg-blue-100 text-blue-500 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => del(d)} disabled={deletingId === d.id}
                            className="p-1 rounded hover:bg-red-100 text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-xs text-gray-400 border-t">
            顯示 {displayed.length} / {drivers.length} 筆
          </div>
        </CardContent>
      </Card>

      {/* ── 新增/編輯 Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯司機資料" : "新增司機"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">

            {/* 基本 */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">基本資料</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">蝦皮工號 *</Label>
                <Input placeholder="例：14681" value={form.shopee_id}
                  onChange={e => setForm(f => ({ ...f, shopee_id: e.target.value }))}
                  disabled={!!editingId} className={editingId ? "bg-gray-100" : ""} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">姓名</Label>
                <Input placeholder="司機真實姓名" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><CreditCard className="w-3 h-3" />身分證字號</Label>
                <Input placeholder="A123456789" value={form.id_number}
                  onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Calendar className="w-3 h-3" />生日（民國）</Label>
                <Input placeholder="85.04.10" value={form.birthday}
                  onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />手機</Label>
                <Input placeholder="0935-448144" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">車隊名稱</Label>
                <Input placeholder="蝦皮小楊" value={form.fleet_name}
                  onChange={e => setForm(f => ({ ...f, fleet_name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />戶籍地址</Label>
              <Input placeholder="桃園市平鎮區…" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            {/* 車輛 */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2">車輛資料</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">車牌號碼</Label>
                <Input placeholder="ABC-1234" value={form.vehicle_plate}
                  onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">車型</Label>
                <Input placeholder="例：1.5T" value={form.vehicle_type}
                  onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))} />
              </div>
            </div>

            {/* 其他 */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2">其他</div>
            <div className="space-y-1.5">
              <Label className="text-xs">備注</Label>
              <Input placeholder="外車 / 其他備注" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_own_driver}
                onCheckedChange={v => setForm(f => ({ ...f, is_own_driver: v }))} />
              <Label className="text-sm">{form.is_own_driver ? "🟢 自有司機" : "🟡 外包司機"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving || !form.shopee_id.trim()}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
