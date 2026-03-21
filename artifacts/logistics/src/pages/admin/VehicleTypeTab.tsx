import { useState } from "react";
import { useForm } from "react-hook-form";
import { Truck, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useVehicleTypes, useCreateVehicleType, useUpdateVehicleType, useDeleteVehicleType,
  matchVehicleType, VehicleType, VehicleTypeInput,
} from "@/hooks/use-vehicle-types";

const DEFAULT: VehicleTypeInput = {
  name: "", lengthM: null, widthM: null, heightM: null, volumeM3: null,
  maxWeightKg: null, palletCount: null, hasTailgate: false, hasRefrigeration: false,
  hasDumpBody: false, heightLimitM: null, weightLimitKg: null,
  cargoTypes: null, notes: null, baseFee: null,
};

function VehicleForm({ value, onChange }: { value: VehicleTypeInput; onChange: (v: VehicleTypeInput) => void }) {
  const num = (k: keyof VehicleTypeInput, label: string, unit?: string) => (
    <div>
      <Label className="text-xs">{label}{unit ? ` (${unit})` : ""}</Label>
      <Input type="number" className="h-8 mt-0.5" placeholder="—"
        value={value[k] ?? ""} onChange={e => onChange({ ...value, [k]: e.target.value === "" ? null : Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="space-y-3 py-1">
      <div>
        <Label className="text-xs">車型名稱 *</Label>
        <Input className="h-9 mt-0.5 font-semibold" value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })} placeholder="例：3.5噸廂型車" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {num("lengthM", "車長", "m")}
        {num("widthM", "車寬", "m")}
        {num("heightM", "車高", "m")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("volumeM3", "可用材積", "m³")}
        {num("maxWeightKg", "最大載重", "kg")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("palletCount", "棧板數", "塊")}
        {num("baseFee", "基本費用", "NT$")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {num("heightLimitM", "限高", "m")}
        {num("weightLimitKg", "限重(道路)", "kg")}
      </div>
      <div className="flex gap-4 flex-wrap">
        {([["hasTailgate", "尾門"], ["hasRefrigeration", "冷藏"], ["hasDumpBody", "斗車"]] as const).map(([k, label]) => (
          <div key={k} className="flex items-center gap-2">
            <Switch checked={!!value[k]} onCheckedChange={v => onChange({ ...value, [k]: v })} />
            <Label className="text-sm">{label}</Label>
          </div>
        ))}
      </div>
      <div>
        <Label className="text-xs">適載貨類</Label>
        <Input className="h-8 mt-0.5" placeholder="一般貨物、易碎品、冷藏食品…"
          value={value.cargoTypes ?? ""} onChange={e => onChange({ ...value, cargoTypes: e.target.value || null })} />
      </div>
      <div>
        <Label className="text-xs">備註</Label>
        <Input className="h-8 mt-0.5" value={value.notes ?? ""}
          onChange={e => onChange({ ...value, notes: e.target.value || null })} />
      </div>
    </div>
  );
}

export default function VehicleTypeTab() {
  const { toast } = useToast();
  const { data: vts = [], isLoading } = useVehicleTypes();
  const { mutateAsync: create, isPending: creating } = useCreateVehicleType();
  const { mutateAsync: update, isPending: updating } = useUpdateVehicleType();
  const { mutateAsync: del } = useDeleteVehicleType();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VehicleType | null>(null);
  const [createForm, setCreateForm] = useState<VehicleTypeInput>(DEFAULT);
  const [editForm, setEditForm] = useState<VehicleTypeInput>(DEFAULT);

  // Auto-match state
  const [matchW, setMatchW] = useState("");
  const [matchL, setMatchL] = useState("");
  const [matchWid, setMatchWid] = useState("");
  const [matchH, setMatchH] = useState("");
  const [matchTailgate, setMatchTailgate] = useState(false);
  const [matchRefrig, setMatchRefrig] = useState(false);
  const [matchResult, setMatchResult] = useState<ReturnType<typeof matchVehicleType> | null>(null);

  const handleCreate = async () => {
    if (!createForm.name) { toast({ title: "請填寫車型名稱", variant: "destructive" }); return; }
    try {
      await create(createForm);
      toast({ title: "✅ 車型已新增" });
      setCreateOpen(false);
      setCreateForm(DEFAULT);
    } catch { toast({ title: "新增失敗", variant: "destructive" }); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await update({ id: editTarget.id, data: editForm });
      toast({ title: "✅ 車型已更新" });
      setEditTarget(null);
    } catch { toast({ title: "更新失敗", variant: "destructive" }); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`確定刪除「${name}」車型？`)) return;
    try {
      await del(id);
      toast({ title: "已刪除" });
    } catch { toast({ title: "刪除失敗", variant: "destructive" }); }
  };

  const handleMatch = () => {
    const vol = Number(matchL) * Number(matchWid) * Number(matchH) / 1000000 || 0;
    const res = matchVehicleType(vts, Number(matchW) || 0, vol, matchTailgate, matchRefrig);
    setMatchResult(res);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2"><Truck className="w-5 h-5" /> 車型主資料庫</h2>
          <p className="text-sm text-muted-foreground">共 {vts.length} 種車型</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1" /> 新增車型
        </Button>
      </div>

      {/* Auto-match tool */}
      <Card className="p-4 border-orange-200 bg-orange-50">
        <h3 className="font-bold text-orange-700 mb-3 flex items-center gap-2"><Search className="w-4 h-4" /> 貨物尺寸 → 自動推薦車型</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div><Label className="text-xs">重量 (kg)</Label><Input type="number" className="h-8 mt-0.5 bg-white" value={matchW} onChange={e => setMatchW(e.target.value)} /></div>
          <div><Label className="text-xs">長 (cm)</Label><Input type="number" className="h-8 mt-0.5 bg-white" value={matchL} onChange={e => setMatchL(e.target.value)} /></div>
          <div><Label className="text-xs">寬 (cm)</Label><Input type="number" className="h-8 mt-0.5 bg-white" value={matchWid} onChange={e => setMatchWid(e.target.value)} /></div>
          <div><Label className="text-xs">高 (cm)</Label><Input type="number" className="h-8 mt-0.5 bg-white" value={matchH} onChange={e => setMatchH(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2"><Switch checked={matchTailgate} onCheckedChange={setMatchTailgate} /><Label className="text-sm">需要尾門</Label></div>
          <div className="flex items-center gap-2"><Switch checked={matchRefrig} onCheckedChange={setMatchRefrig} /><Label className="text-sm">需要冷藏</Label></div>
        </div>
        <Button onClick={handleMatch} variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-100">
          <Search className="w-4 h-4 mr-1" /> 推薦最適車型
        </Button>
        {matchResult && (
          <div className="mt-3">
            {matchResult.best ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <div className="font-bold text-green-800">推薦：{matchResult.best.name}</div>
                  <div className="text-xs text-green-700">
                    最大載重 {matchResult.best.maxWeightKg ?? "—"} kg ／ 材積 {matchResult.best.volumeM3 ?? "—"} m³
                    {matchResult.best.baseFee && ` ／ 基本費 NT$${matchResult.best.baseFee.toLocaleString()}`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <div>
                  <div className="font-bold text-red-800">超過現有車型限制！</div>
                  <div className="text-xs text-red-700">
                    {matchResult.overWeight && "超過最大載重　"}
                    {matchResult.overVolume && "超過可用材積　"}
                    請考慮拼車或外包大型車輛。
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Vehicle type table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                {["車型名稱", "尺寸 (長×寬×高 m)", "材積 m³", "載重 kg", "棧板", "設備", "基本費", "適載貨類", "操作"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">載入中…</td></tr>
              )}
              {!isLoading && vts.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">尚未建立任何車型，點擊「新增車型」開始建立。</td></tr>
              )}
              {vts.map(v => (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-semibold">{v.name}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {v.lengthM != null ? `${v.lengthM} × ${v.widthM} × ${v.heightM}` : "—"}
                  </td>
                  <td className="px-3 py-2.5">{v.volumeM3 ?? "—"}</td>
                  <td className="px-3 py-2.5">{v.maxWeightKg?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2.5">{v.palletCount ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 flex-wrap">
                      {v.hasTailgate && <Badge variant="secondary" className="text-xs">尾門</Badge>}
                      {v.hasRefrigeration && <Badge className="text-xs bg-blue-100 text-blue-800">冷藏</Badge>}
                      {v.hasDumpBody && <Badge variant="outline" className="text-xs">斗車</Badge>}
                      {!v.hasTailgate && !v.hasRefrigeration && !v.hasDumpBody && <span className="text-muted-foreground text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{v.baseFee ? `NT$${v.baseFee.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2.5 max-w-[140px] truncate text-xs text-muted-foreground">{v.cargoTypes ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditTarget(v); setEditForm({ ...v }); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(v.id, v.name)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) { setCreateOpen(false); setCreateForm(DEFAULT); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增車型</DialogTitle>
            <DialogDescription>填入車型基本規格與設備</DialogDescription>
          </DialogHeader>
          <VehicleForm value={createForm} onChange={setCreateForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "新增中…" : "確認新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯車型：{editTarget?.name}</DialogTitle>
            <DialogDescription>修改車型規格與設備</DialogDescription>
          </DialogHeader>
          <VehicleForm value={editForm} onChange={setEditForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
            <Button onClick={handleEdit} disabled={updating}>
              {updating ? "儲存中…" : "儲存變更"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
