/**
 * Auto-Routing Rules Management Tab
 *
 * Manages rules that automatically assign orders to Zones/Teams when they arrive.
 * Rules are evaluated by priority (lower = first). First match wins.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getApiUrl } from "@/lib/api";

interface Rule {
  id: number;
  name: string;
  priority: number;
  match_type: string;
  match_value: string | null;
  vehicle_filter: string | null;
  zone_id: number | null;
  team_id: number | null;
  zone_name: string | null;
  team_name: string | null;
  region_tag: string | null;
  description: string | null;
  is_active: boolean;
}

interface Zone { id: number; name: string; region: string | null }
interface Team { id: number; name: string; zone_id: number | null; zone_name: string | null }

const MATCH_TYPES = [
  { value: "postal_prefix", label: "郵遞區號前綴", hint: "如 40 代表台中市,  10 代表台北市中正區" },
  { value: "city",          label: "城市/地址關鍵字", hint: "如「台中市」「新北市」「高雄」" },
  { value: "region",        label: "區域標籤",   hint: "如「中部」「南部」（需搭配訂單 region 欄位）" },
  { value: "vehicle_type",  label: "車型",       hint: "如「冷凍」「聯結」「5噸」" },
  { value: "cargo_keyword", label: "貨物關鍵字", hint: "如「冷藏」「危品」「電子」" },
  { value: "catchall",      label: "預設（所有未匹配）", hint: "用於 fallback — 通常放最後，優先度最高數字" },
];

interface PreviewResult {
  result: { zone_id: number | null; zone_name?: string; team_id: number | null; rule_name: string | null; matched: boolean; region: string | null };
  matched_rule: Rule | null;
}

function PriorityBadge({ priority }: { priority: number }) {
  const color = priority <= 10 ? "bg-red-100 text-red-700" :
                priority <= 50 ? "bg-orange-100 text-orange-700" :
                priority <= 100 ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-600";
  return <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${color}`}>{priority}</span>;
}

function matchTypeLabel(type: string) {
  return MATCH_TYPES.find(t => t.value === type)?.label ?? type;
}

const EMPTY_RULE: Partial<Rule> = {
  name: "", priority: 100, match_type: "city", match_value: "",
  vehicle_filter: "", zone_id: null, team_id: null, region_tag: "", description: "", is_active: true,
};

export function AutoRoutingTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule>>(EMPTY_RULE);
  const [saving, setSaving] = useState(false);

  // Preview tester
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState({
    pickup_address: "", required_vehicle_type: "", cargo_description: "", region: "", postal_code: "",
  });
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [rulesRes, zonesRes, teamsRes] = await Promise.all([
      fetch(getApiUrl("/api/auto-routing/rules")),
      fetch(getApiUrl("/api/zones")),
      fetch(getApiUrl("/api/teams")),
    ]);
    const [r, z, t] = await Promise.all([rulesRes.json(), zonesRes.json(), teamsRes.json()]);
    setRules(r as Rule[]);
    setZones(z as Zone[]);
    setTeams(t as Team[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => { setEditing({ ...EMPTY_RULE }); setDialogOpen(true); };
  const openEdit = (r: Rule) => { setEditing({ ...r }); setDialogOpen(true); };

  const save = async () => {
    setSaving(true);
    const url = editing.id
      ? getApiUrl(`/api/auto-routing/rules/${editing.id}`)
      : getApiUrl("/api/auto-routing/rules");
    const method = editing.id ? "PATCH" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    setDialogOpen(false);
    fetchAll();
    setSaving(false);
  };

  const deleteRule = async (id: number, name: string) => {
    if (!confirm(`確認刪除規則「${name}」？`)) return;
    const res = await fetch(getApiUrl(`/api/auto-routing/rules/${id}`), { method: "DELETE" });
    const d = await res.json() as { ok?: boolean; error?: string };
    if (!d.ok) { alert(d.error ?? "刪除失敗"); return; }
    fetchAll();
  };

  const toggleActive = async (rule: Rule) => {
    await fetch(getApiUrl(`/api/auto-routing/rules/${rule.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    fetchAll();
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    const res = await fetch(getApiUrl("/api/auto-routing/preview"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(previewOrder),
    });
    const d = await res.json() as PreviewResult;
    setPreviewResult(d);
    setPreviewLoading(false);
  };

  const filteredTeams = editing.zone_id
    ? teams.filter(t => t.zone_id === editing.zone_id)
    : teams;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">自動分單規則</h2>
          <p className="text-sm text-gray-500">
            訂單建立時依規則自動指派站點與車隊。優先度低的數字先評估，第一個符合條件的規則生效。
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
            🧪 測試規則
          </Button>
          <Button size="sm" onClick={openNew}>+ 新增規則</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
        <span>優先度數字說明：</span>
        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono">1-10</span><span>最高優先</span>
        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-mono">11-50</span><span>高優先</span>
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">51-100</span><span>一般</span>
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">101+</span><span>低優先 / 預設</span>
      </div>

      {/* Rules table */}
      <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">載入中…</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">⚙️</div>
            <p className="text-sm">尚未建立任何規則</p>
            <Button size="sm" className="mt-3" onClick={openNew}>新增第一條規則</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[48px_1fr_160px_140px_140px_90px_80px] text-xs font-medium text-gray-500 border-b px-4 py-2.5">
              <span className="text-center">順序</span>
              <span>規則名稱 / 匹配條件</span>
              <span>匹配類型</span>
              <span>指派站點</span>
              <span>指派車隊</span>
              <span className="text-center">啟用</span>
              <span></span>
            </div>
            {rules.map((rule) => (
              <div key={rule.id}
                className={`grid grid-cols-[48px_1fr_160px_140px_140px_90px_80px] px-4 py-3 border-b last:border-0 items-center gap-2 ${
                  !rule.is_active ? "opacity-50" : ""
                }`}>
                <div className="text-center">
                  <PriorityBadge priority={rule.priority} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{rule.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    {rule.match_value && (
                      <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        {rule.match_value}
                      </span>
                    )}
                    {rule.vehicle_filter && (
                      <span className="text-blue-500">🚗 {rule.vehicle_filter}</span>
                    )}
                    {rule.description && <span className="truncate text-gray-400">{rule.description}</span>}
                  </div>
                </div>
                <div>
                  <Badge variant="outline" className="text-xs">
                    {matchTypeLabel(rule.match_type)}
                  </Badge>
                </div>
                <div className="text-sm">
                  {rule.zone_name ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">{rule.zone_name}</span>
                    </span>
                  ) : <span className="text-gray-400 text-xs">不指定</span>}
                </div>
                <div className="text-sm">
                  {rule.team_name
                    ? <span className="truncate">{rule.team_name}</span>
                    : <span className="text-gray-400 text-xs">不指定</span>}
                </div>
                <div className="flex justify-center">
                  <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                </div>
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => openEdit(rule)}>編輯</Button>
                  {rule.match_type !== "catchall" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500"
                      onClick={() => deleteRule(rule.id, rule.name)}>刪除</Button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
        <p className="font-medium text-blue-700 dark:text-blue-300 mb-2">🔀 分單規則運作方式</p>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>訂單建立（含 CSV 匯入、客戶下單、API 建單）時自動觸發</li>
          <li>依優先度數字由小到大評估，第一個符合條件的規則即套用</li>
          <li>可疊加「車型篩選」：只有指定車型訂單才套用此規則</li>
          <li>預設規則（catchall）是最後防線，確保所有訂單都有分組</li>
          <li>匹配後自動填入 zone_id、team_id，訂單進入對應站點的待派池</li>
        </ul>
      </div>

      {/* ── Rule Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "編輯規則" : "新增分單規則"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label className="text-xs">規則名稱 *</Label>
              <Input className="mt-1" placeholder="如「台中市訂單」「冷鏈車型」" value={editing.name ?? ""}
                onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">優先度（數字越小越優先）</Label>
                <Input className="mt-1" type="number" min={1} value={editing.priority ?? 100}
                  onChange={e => setEditing(p => ({ ...p, priority: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-xs">匹配類型 *</Label>
                <Select value={editing.match_type ?? "city"}
                  onValueChange={v => setEditing(p => ({ ...p, match_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editing.match_type !== "catchall" && (
              <div>
                <Label className="text-xs">
                  匹配值
                  <span className="text-gray-400 ml-2">
                    {MATCH_TYPES.find(t => t.value === editing.match_type)?.hint}
                  </span>
                </Label>
                <Input className="mt-1" value={editing.match_value ?? ""}
                  onChange={e => setEditing(p => ({ ...p, match_value: e.target.value }))} />
              </div>
            )}

            <div>
              <Label className="text-xs">
                車型篩選（選填）
                <span className="text-gray-400 ml-2">只有包含此關鍵字的車型訂單才套用</span>
              </Label>
              <Input className="mt-1" placeholder="如 冷凍、聯結、5噸（留空代表所有車型）"
                value={editing.vehicle_filter ?? ""}
                onChange={e => setEditing(p => ({ ...p, vehicle_filter: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">指派站點</Label>
                <Select value={editing.zone_id ? String(editing.zone_id) : "none"}
                  onValueChange={v => setEditing(p => ({ ...p, zone_id: v === "none" ? null : Number(v), team_id: null }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="不指定站點" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定站點</SelectItem>
                    {zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">指派車隊（選填）</Label>
                <Select value={editing.team_id ? String(editing.team_id) : "none"}
                  onValueChange={v => setEditing(p => ({ ...p, team_id: v === "none" ? null : Number(v) }))}
                  disabled={!editing.zone_id && teams.length === 0}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="不指定車隊" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定車隊</SelectItem>
                    {filteredTeams.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} {t.zone_name ? `(${t.zone_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">區域標籤（選填）</Label>
              <Input className="mt-1" placeholder="如 北部、中部、南部（自動填入訂單 region 欄位）"
                value={editing.region_tag ?? ""}
                onChange={e => setEditing(p => ({ ...p, region_tag: e.target.value }))} />
            </div>

            <div>
              <Label className="text-xs">說明備註</Label>
              <Input className="mt-1" value={editing.description ?? ""}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={editing.is_active !== false}
                onCheckedChange={v => setEditing(p => ({ ...p, is_active: v }))} />
              <Label className="text-xs">啟用此規則</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : "儲存規則"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview/Test Dialog ──────────────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>🧪 測試分單規則</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">輸入訂單資訊，系統會顯示哪條規則會被套用：</p>
            <div>
              <Label className="text-xs">取貨地址</Label>
              <Input className="mt-1" placeholder="如 台中市西屯區台灣大道3段99號"
                value={previewOrder.pickup_address}
                onChange={e => setPreviewOrder(p => ({ ...p, pickup_address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">車型</Label>
                <Input className="mt-1" placeholder="如 5噸冷凍"
                  value={previewOrder.required_vehicle_type}
                  onChange={e => setPreviewOrder(p => ({ ...p, required_vehicle_type: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">郵遞區號</Label>
                <Input className="mt-1" placeholder="如 407"
                  value={previewOrder.postal_code}
                  onChange={e => setPreviewOrder(p => ({ ...p, postal_code: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">貨物描述</Label>
              <Input className="mt-1" placeholder="如 冷凍肉品"
                value={previewOrder.cargo_description}
                onChange={e => setPreviewOrder(p => ({ ...p, cargo_description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">區域標籤</Label>
              <Input className="mt-1" placeholder="如 中部"
                value={previewOrder.region}
                onChange={e => setPreviewOrder(p => ({ ...p, region: e.target.value }))} />
            </div>

            <Button className="w-full" onClick={runPreview} disabled={previewLoading}>
              {previewLoading ? "評估中…" : "執行規則評估"}
            </Button>

            {previewResult && (
              <div className={`p-4 rounded-lg border ${previewResult.result.matched ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800"}`}>
                {previewResult.result.matched ? (
                  <>
                    <p className="font-semibold text-green-700 dark:text-green-300 text-sm mb-2">
                      ✅ 匹配成功 → 套用規則：「{previewResult.result.rule_name}」
                    </p>
                    <div className="text-xs space-y-1 text-green-600 dark:text-green-400">
                      {previewResult.matched_rule && (
                        <>
                          <div>匹配類型：{matchTypeLabel(previewResult.matched_rule.match_type)}</div>
                          {previewResult.matched_rule.match_value && (
                            <div>匹配值：<span className="font-mono">{previewResult.matched_rule.match_value}</span></div>
                          )}
                        </>
                      )}
                      <div>指派站點：{previewResult.matched_rule?.zone_name ?? "（不指定）"}</div>
                      <div>指派車隊：{previewResult.matched_rule?.team_name ?? "（不指定）"}</div>
                      {previewResult.result.region && <div>區域標籤：{previewResult.result.region}</div>}
                    </div>
                  </>
                ) : (
                  <p className="text-orange-700 dark:text-orange-300 text-sm">
                    ⚠ 未匹配到任何規則，訂單不會自動分站
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
