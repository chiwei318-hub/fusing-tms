import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Percent, Save, ChevronDown, ChevronRight, Users, Building2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Entity {
  id: number;
  name: string;
  username?: string;
  license_plate?: string;
  commission_rate: number;
  status?: string;
}

interface CommissionData {
  franchisees: Entity[];
  fleets: Entity[];
  drivers: Entity[];
}

function RateInput({
  value,
  onChange,
  onSave,
  saving,
}: {
  value: number;
  onChange: (v: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  useEffect(() => { setLocal(String(value)); }, [value]);

  if (!editing) {
    return (
      <button
        className="flex items-center gap-1 text-sm font-mono font-semibold text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors"
        onClick={() => setEditing(true)}
        title="點擊編輯"
      >
        {value.toFixed(1)}%
        <span className="text-[10px] text-gray-400 font-normal">編輯</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={local}
        onChange={e => {
          setLocal(e.target.value);
          onChange(Number(e.target.value));
        }}
        className="w-20 h-7 text-xs text-center font-mono"
        autoFocus
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(); setEditing(false); }
          if (e.key === "Escape") { setLocal(String(value)); setEditing(false); }
        }}
      />
      <Button
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={saving}
        onClick={() => { onSave(); setEditing(false); }}
      >
        {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
      </Button>
    </div>
  );
}

function EntityTable({
  title,
  icon,
  entities,
  color,
  type,
  onUpdate,
}: {
  title: string;
  icon: React.ReactNode;
  entities: Entity[];
  color: string;
  type: "franchisee" | "fleet" | "driver";
  onUpdate: (type: string, id: number, rate: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [localRates, setLocalRates] = useState<Record<number, number>>({});

  useEffect(() => {
    const init: Record<number, number> = {};
    entities.forEach(e => { init[e.id] = Number(e.commission_rate); });
    setLocalRates(init);
  }, [entities]);

  const avg = entities.length > 0
    ? (entities.reduce((s, e) => s + Number(e.commission_rate), 0) / entities.length).toFixed(1)
    : "—";

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-sm font-semibold text-gray-700"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {icon}
            {title}
            <Badge variant="secondary" className="text-xs">{entities.length} 筆</Badge>
          </button>
          <span className="text-xs text-gray-400">平均抽成 <strong className={color}>{avg}%</strong></span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-gray-50/80">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">名稱</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">帳號</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">狀態</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">抽成比例</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">司機分潤（試算）</th>
                </tr>
              </thead>
              <tbody>
                {entities.map(e => {
                  const rate = localRates[e.id] ?? Number(e.commission_rate);
                  const driverShare = 100 - rate;
                  return (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{e.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                        {e.username || e.license_plate || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {e.status === "active" || e.status === "approved" ? (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-0">啟用</Badge>
                        ) : e.status ? (
                          <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <RateInput
                          value={rate}
                          onChange={v => setLocalRates(prev => ({ ...prev, [e.id]: v }))}
                          onSave={async () => {
                            setSaving(e.id);
                            await onUpdate(type, e.id, rate).finally(() => setSaving(null));
                          }}
                          saving={saving === e.id}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                        <span className="font-mono text-green-700 font-medium">{driverShare.toFixed(1)}%</span>
                        <span className="text-gray-300 mx-1">|</span>
                        萬元單 NT${Math.round(10000 * driverShare / 100).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {entities.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-xs">尚無資料</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function CommissionTab() {
  const { toast } = useToast();
  const [data, setData] = useState<CommissionData | null>(null);
  const [loading, setLoading] = useState(false);

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchType, setBatchType] = useState<string>("franchisee");
  const [batchRate, setBatchRate] = useState<string>("70");
  const [batchApplying, setBatchApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(apiUrl("/admin/commission")).then(r => r.json());
      if (d.ok) setData(d);
      else toast({ title: "載入失敗", description: d.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleUpdate(type: string, id: number, rate: number) {
    const r = await fetch(apiUrl(`/admin/commission/${type}/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commission_rate: rate }),
    }).then(x => x.json());
    if (r.ok) {
      toast({ title: "✅ 抽成已更新", description: `已設定為 ${rate}%` });
      load();
    } else {
      toast({ title: "更新失敗", description: r.error, variant: "destructive" });
    }
  }

  async function handleBatch() {
    const rate = Number(batchRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: "請輸入有效比例（0-100）", variant: "destructive" });
      return;
    }
    setBatchApplying(true);
    const r = await fetch(apiUrl("/admin/commission/batch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: batchType, commission_rate: rate }),
    }).then(x => x.json()).finally(() => setBatchApplying(false));

    if (r.ok) {
      const { updated } = r;
      const desc = [
        updated.franchisees > 0 && `加盟主 ${updated.franchisees} 筆`,
        updated.fleets > 0 && `車隊 ${updated.fleets} 筆`,
        updated.drivers > 0 && `司機 ${updated.drivers} 筆`,
      ].filter(Boolean).join("、");
      toast({ title: `✅ 批次更新成功（共 ${r.total} 筆）`, description: desc });
      setBatchDialogOpen(false);
      load();
    } else {
      toast({ title: "批次更新失敗", description: r.error, variant: "destructive" });
    }
  }

  const BATCH_TYPE_OPTIONS = [
    { value: "franchisee", label: "全部加盟主" },
    { value: "fleet",      label: "全部福興高合作車隊" },
    { value: "driver",     label: "全部司機" },
    { value: "all",        label: "所有人（加盟主 + 車隊 + 司機）" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Percent className="w-5 h-5 text-blue-600" />
            抽成管理
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">管理加盟主、合作車隊、司機的平台抽成比例</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
            onClick={() => setBatchDialogOpen(true)}
          >
            <Percent className="w-3.5 h-3.5" />
            批次設定
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "加盟主平均抽成",
              count: data.franchisees.length,
              avg: data.franchisees.length > 0
                ? (data.franchisees.reduce((s, e) => s + Number(e.commission_rate), 0) / data.franchisees.length).toFixed(1)
                : "—",
              icon: <Building2 className="w-5 h-5 text-indigo-500" />,
              color: "text-indigo-600",
            },
            {
              label: "合作車隊平均抽成",
              count: data.fleets.length,
              avg: data.fleets.length > 0
                ? (data.fleets.reduce((s, e) => s + Number(e.commission_rate), 0) / data.fleets.length).toFixed(1)
                : "—",
              icon: <Truck className="w-5 h-5 text-orange-500" />,
              color: "text-orange-600",
            },
            {
              label: "司機平均抽成",
              count: data.drivers.length,
              avg: data.drivers.length > 0
                ? (data.drivers.reduce((s, e) => s + Number(e.commission_rate), 0) / data.drivers.length).toFixed(1)
                : "—",
              icon: <Users className="w-5 h-5 text-green-500" />,
              color: "text-green-600",
            },
          ].map(c => (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                  {c.icon}
                </div>
                <div>
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className={`text-xl font-bold ${c.color}`}>{c.avg}%</p>
                  <p className="text-[10px] text-gray-400">{c.count} 筆資料</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tables */}
      {loading && !data && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          載入中…
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <EntityTable
            title="加盟主"
            icon={<Building2 className="w-4 h-4 text-indigo-500" />}
            entities={data.franchisees}
            color="text-indigo-600"
            type="franchisee"
            onUpdate={handleUpdate}
          />
          <EntityTable
            title="福興高合作車隊"
            icon={<Truck className="w-4 h-4 text-orange-500" />}
            entities={data.fleets}
            color="text-orange-600"
            type="fleet"
            onUpdate={handleUpdate}
          />
          <EntityTable
            title="司機"
            icon={<Users className="w-4 h-4 text-green-500" />}
            entities={data.drivers}
            color="text-green-600"
            type="driver"
            onUpdate={handleUpdate}
          />
        </div>
      )}

      {/* Batch dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Percent className="h-4 w-4 text-blue-600" />
              批次設定抽成比例
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              ⚠️ 批次設定將覆蓋所選類別的所有成員抽成，請謹慎操作。
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">套用對象</Label>
              <Select value={batchType} onValueChange={setBatchType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BATCH_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">抽成比例（%）</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={batchRate}
                  onChange={e => setBatchRate(e.target.value)}
                  className="h-9 text-center font-mono"
                />
                <span className="text-sm text-gray-500 shrink-0">%</span>
              </div>
              {!isNaN(Number(batchRate)) && (
                <p className="text-xs text-gray-500">
                  司機分潤：<span className="font-medium text-green-700">{(100 - Number(batchRate)).toFixed(1)}%</span>
                  　｜　萬元單司機收 NT${Math.round(10000 * (100 - Number(batchRate)) / 100).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
            <Button
              disabled={batchApplying}
              onClick={handleBatch}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {batchApplying
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-1" />套用中…</>
                : `確認批次更新`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
