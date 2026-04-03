import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, Search, CheckCircle2,
  User, Truck, X, Upload, Download,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface ShopeeDriver {
  id: number;
  shopee_id: string;
  name: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  fleet_name: string | null;
  notes: string | null;
  is_own_driver: boolean;
  created_at: string;
  updated_at: string;
}

const VEHICLE_TYPES = ["6.2T", "8.5T", "11T", "17T", "26T", "35T", "46T"];

const EMPTY_FORM = {
  shopee_id: "",
  name: "",
  vehicle_plate: "",
  vehicle_type: "6.2T",
  fleet_name: "",
  notes: "",
  is_own_driver: true,
};

export default function ShopeeDriversTab() {
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<ShopeeDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Bulk import state
  const [bulkText, setBulkText] = useState("");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkParsed, setBulkParsed] = useState<typeof EMPTY_FORM[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/shopee-drivers${search ? `?q=${encodeURIComponent(search)}` : ""}`));
      const d = await r.json();
      if (d.ok) setDrivers(d.drivers);
    } catch (e) {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => { load(); }, [load]);

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
      vehicle_type: d.vehicle_type ?? "6.2T",
      fleet_name: d.fleet_name ?? "",
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
          vehicle_type: form.vehicle_type || null,
          fleet_name: form.fleet_name.trim() || null,
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

  // ── Bulk import ────────────────────────────────────────────────────────────
  function parseBulk() {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const parsed: typeof EMPTY_FORM[] = [];
    for (const line of lines) {
      const parts = line.split(/[\t,，、\s]+/).filter(Boolean);
      if (!parts[0]) continue;
      parsed.push({
        shopee_id: parts[0],
        name: parts[1] ?? "",
        vehicle_plate: parts[2] ?? "",
        vehicle_type: parts[3] ?? "6.2T",
        fleet_name: parts[4] ?? "",
        notes: parts[5] ?? "",
        is_own_driver: true,
      });
    }
    setBulkParsed(parsed);
  }

  async function saveBulk() {
    if (!bulkParsed.length) return;
    setSaving(true);
    let ok = 0; let fail = 0;
    for (const row of bulkParsed) {
      try {
        const r = await fetch(apiUrl("/shopee-drivers"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopee_id: row.shopee_id,
            name: row.name || null,
            vehicle_plate: row.vehicle_plate || null,
            vehicle_type: row.vehicle_type || null,
            fleet_name: row.fleet_name || null,
            notes: row.notes || null,
            is_own_driver: row.is_own_driver,
          }),
        });
        const d = await r.json();
        if (d.ok) ok++;
        else fail++;
      } catch { fail++; }
    }
    toast({ title: `批次匯入完成`, description: `成功 ${ok} 筆，失敗 ${fail} 筆` });
    setBulkDialogOpen(false);
    setBulkText("");
    setBulkParsed([]);
    setSaving(false);
    load();
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["工號", "姓名", "車牌", "車型", "車隊", "備注", "自有司機"];
    const rows = drivers.map(d => [
      d.shopee_id, d.name ?? "", d.vehicle_plate ?? "", d.vehicle_type ?? "",
      d.fleet_name ?? "", d.notes ?? "", d.is_own_driver ? "是" : "否",
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shopee_drivers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const ownCount = drivers.filter(d => d.is_own_driver).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{drivers.length}</p>
                <p className="text-xs text-muted-foreground">工號總數</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-xl font-bold">{drivers.filter(d => d.name).length}</p>
                <p className="text-xs text-muted-foreground">已填姓名</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-xl font-bold">{ownCount}</p>
                <p className="text-xs text-muted-foreground">自有司機</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-blue-500" />
              蝦皮司機工號管理
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-7 h-8 text-sm w-44"
                  placeholder="搜尋工號/姓名/車隊..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setBulkDialogOpen(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" />批次匯入
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!drivers.length}>
                <Download className="w-3.5 h-3.5 mr-1" />匯出 CSV
              </Button>
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" />新增司機
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {drivers.length === 0 && !loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">尚無司機資料</p>
              <p className="text-xs mt-1">點擊「新增司機」或「批次匯入」</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500">
                    <th className="text-left px-4 py-2 font-medium">工號</th>
                    <th className="text-left px-4 py-2 font-medium">姓名</th>
                    <th className="text-left px-4 py-2 font-medium">車牌</th>
                    <th className="text-left px-4 py-2 font-medium">車型</th>
                    <th className="text-left px-4 py-2 font-medium">車隊</th>
                    <th className="text-left px-4 py-2 font-medium">身份</th>
                    <th className="text-left px-4 py-2 font-medium">備注</th>
                    <th className="text-right px-4 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d, idx) => (
                    <tr key={d.id} className={`border-b hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
                      <td className="px-4 py-2">
                        <span className="font-mono font-semibold text-blue-700">{d.shopee_id}</span>
                      </td>
                      <td className="px-4 py-2">
                        {d.name
                          ? <span className="font-medium">{d.name}</span>
                          : <span className="text-gray-300 text-xs">未填</span>
                        }
                      </td>
                      <td className="px-4 py-2">
                        {d.vehicle_plate
                          ? <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{d.vehicle_plate}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-2">
                        {d.vehicle_type
                          ? <Badge variant="outline" className="text-xs">{d.vehicle_type}</Badge>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{d.fleet_name ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Badge className={d.is_own_driver ? "bg-green-100 text-green-800 text-[10px]" : "bg-gray-100 text-gray-600 text-[10px]"}>
                          {d.is_own_driver ? "自有" : "外包"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 max-w-32 truncate">{d.notes ?? ""}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => openEdit(d)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => del(d)}
                            disabled={deletingId === d.id}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯司機" : "新增司機"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>工號 *</Label>
                <Input
                  placeholder="例：14681"
                  value={form.shopee_id}
                  onChange={e => setForm(f => ({ ...f, shopee_id: e.target.value }))}
                  disabled={!!editingId}
                  className={editingId ? "bg-gray-100" : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>姓名</Label>
                <Input
                  placeholder="司機真實姓名"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>車牌</Label>
                <Input
                  placeholder="例：ABC-1234"
                  value={form.vehicle_plate}
                  onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>車型</Label>
                <Select value={form.vehicle_type} onValueChange={v => setForm(f => ({ ...f, vehicle_type: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>車隊名稱</Label>
              <Input
                placeholder="例：富詠運輸"
                value={form.fleet_name}
                onChange={e => setForm(f => ({ ...f, fleet_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>備注</Label>
              <Input
                placeholder="其他備注"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_own_driver}
                onCheckedChange={v => setForm(f => ({ ...f, is_own_driver: v }))}
              />
              <Label>自有司機</Label>
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

      {/* Bulk Import Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>批次匯入工號司機</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">格式說明（每行一筆，欄位以 Tab/逗號/空格分隔）：</p>
              <p className="font-mono">工號　姓名　車牌　車型　車隊名稱　備注</p>
              <p>例：<span className="font-mono">14681	王小明	ABC-1234	6.2T	富詠運輸</span></p>
              <p>僅「工號」為必填；若工號已存在則自動更新。</p>
            </div>
            <div className="space-y-1.5">
              <Label>貼上資料</Label>
              <textarea
                className="w-full h-40 border rounded p-2 text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder={"14681\t王小明\tABC-1234\t6.2T\t富詠運輸\n14774\t張大華\tXYZ-5678\t6.2T\t富詠運輸"}
                value={bulkText}
                onChange={e => { setBulkText(e.target.value); setBulkParsed([]); }}
              />
            </div>
            {bulkText.trim() && (
              <Button variant="outline" size="sm" onClick={parseBulk}>
                解析預覽
              </Button>
            )}
            {bulkParsed.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  解析 {bulkParsed.length} 筆
                </p>
                <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded text-xs">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5">工號</th>
                        <th className="text-left px-2 py-1.5">姓名</th>
                        <th className="text-left px-2 py-1.5">車牌</th>
                        <th className="text-left px-2 py-1.5">車型</th>
                        <th className="text-left px-2 py-1.5">車隊</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkParsed.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 font-mono font-semibold text-blue-700">{r.shopee_id}</td>
                          <td className="px-2 py-1">{r.name || "—"}</td>
                          <td className="px-2 py-1 font-mono">{r.vehicle_plate || "—"}</td>
                          <td className="px-2 py-1">{r.vehicle_type || "—"}</td>
                          <td className="px-2 py-1">{r.fleet_name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkText(""); setBulkParsed([]); }}>
              取消
            </Button>
            <Button
              onClick={saveBulk}
              disabled={saving || bulkParsed.length === 0}
            >
              {saving ? "匯入中…" : `匯入 ${bulkParsed.length} 筆`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
