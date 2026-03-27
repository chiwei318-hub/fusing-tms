import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getApiUrl } from "@/lib/api";

interface Zone {
  id: number;
  name: string;
  code: string | null;
  parent_zone_id: number | null;
  region: string | null;
  description: string | null;
  is_active: boolean;
  team_count: number;
  driver_count: number;
  children?: Zone[];
}

interface Team {
  id: number;
  name: string;
  code: string | null;
  zone_id: number | null;
  zone_name: string | null;
  description: string | null;
  is_active: boolean;
  driver_count: number;
  active_orders: number;
}

interface ZoneStats {
  zoneId: number;
  orders: { total: number; pending: number; active: number; delivered: number; exception_count: number; revenue_total: string };
  drivers: { total: number; available: number; busy: number; offline: number };
  teams: Team[];
}

export function ZoneManagementTab() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [zoneStats, setZoneStats] = useState<ZoneStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"zones" | "teams" | "dispatch">("zones");

  // Zone dialog
  const [zoneDialog, setZoneDialog] = useState(false);
  const [editingZone, setEditingZone] = useState<Partial<Zone> | null>(null);

  // Team dialog
  const [teamDialog, setTeamDialog] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Partial<Team> | null>(null);

  // Dispatch assign dialog
  const [dispatchDialog, setDispatchDialog] = useState(false);
  const [dispatchOrderId, setDispatchOrderId] = useState("");
  const [dispatchDriverId, setDispatchDriverId] = useState("");
  const [dispatchReason, setDispatchReason] = useState("");
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/zones?tree=1"));
      const data = await res.json() as Zone[];
      setZones(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchTeams = useCallback(async () => {
    const res = await fetch(getApiUrl("/api/teams"));
    const data = await res.json() as Team[];
    setTeams(data);
  }, []);

  const fetchZoneStats = useCallback(async (zoneId: number) => {
    const res = await fetch(getApiUrl(`/api/zones/${zoneId}/stats`));
    const data = await res.json() as ZoneStats;
    setZoneStats(data);
  }, []);

  useEffect(() => {
    fetchZones();
    fetchTeams();
  }, [fetchZones, fetchTeams]);

  useEffect(() => {
    if (selectedZone) fetchZoneStats(selectedZone.id);
  }, [selectedZone, fetchZoneStats]);

  // ── Zone CRUD ────────────────────────────────────────────────────────────
  const openZoneDialog = (zone?: Zone) => {
    setEditingZone(zone ?? { name: "", code: "", region: "", description: "" });
    setZoneDialog(true);
  };

  const saveZone = async () => {
    if (!editingZone) return;
    const url = editingZone.id
      ? getApiUrl(`/api/zones/${editingZone.id}`)
      : getApiUrl("/api/zones");
    const method = editingZone.id ? "PATCH" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingZone) });
    setZoneDialog(false);
    fetchZones();
  };

  const deleteZone = async (id: number) => {
    if (!confirm("確認停用此站點？")) return;
    await fetch(getApiUrl(`/api/zones/${id}`), { method: "DELETE" });
    fetchZones();
  };

  // ── Team CRUD ─────────────────────────────────────────────────────────────
  const openTeamDialog = (team?: Team) => {
    setEditingTeam(team ?? { name: "", code: "", zone_id: null, description: "" });
    setTeamDialog(true);
  };

  const saveTeam = async () => {
    if (!editingTeam) return;
    const url = editingTeam.id
      ? getApiUrl(`/api/teams/${editingTeam.id}`)
      : getApiUrl("/api/teams");
    const method = editingTeam.id ? "PATCH" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingTeam) });
    setTeamDialog(false);
    fetchTeams();
  };

  const deleteTeam = async (id: number) => {
    if (!confirm("確認停用此車隊？")) return;
    await fetch(getApiUrl(`/api/teams/${id}`), { method: "DELETE" });
    fetchTeams();
  };

  // ── Safe Dispatch Assign ──────────────────────────────────────────────────
  const doDispatchAssign = async () => {
    setDispatchResult(null);
    setDispatchError(null);
    if (!dispatchOrderId || !dispatchDriverId) {
      setDispatchError("請輸入訂單 ID 和司機 ID");
      return;
    }
    const res = await fetch(getApiUrl("/api/dispatch/assign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: Number(dispatchOrderId),
        driver_id: Number(dispatchDriverId),
        reassign_reason: dispatchReason || undefined,
      }),
    });
    const data = await res.json() as { ok?: boolean; error?: string; idempotent?: boolean };
    if (res.ok && data.ok) {
      setDispatchResult(data.idempotent ? "✔ 已是此司機的訂單（冪等）" : "✔ 派車成功（資料庫鎖定保護）");
    } else {
      setDispatchError(data.error ?? "未知錯誤");
    }
  };

  // ── Zone Tree ─────────────────────────────────────────────────────────────
  const renderZoneRow = (zone: Zone, depth = 0) => (
    <div key={zone.id}>
      <div
        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
          selectedZone?.id === zone.id
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
        }`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => setSelectedZone(zone)}
      >
        {depth > 0 && <span className="text-gray-400 text-xs">└─</span>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{zone.name}</span>
            {zone.code && <Badge variant="outline" className="text-xs">{zone.code}</Badge>}
            {zone.region && <Badge variant="secondary" className="text-xs">{zone.region}</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
            <span>🏢 {zone.team_count} 車隊</span>
            <span>🚗 {zone.driver_count} 司機</span>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); openZoneDialog(zone); }}>
            編輯
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500"
            onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }}>
            停用
          </Button>
        </div>
      </div>
      {zone.children?.map(c => renderZoneRow(c, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">多站點 / 車隊架構</h2>
          <p className="text-sm text-gray-500">管理站點（Zone）與車隊（Team），訂單和司機可歸屬至站點</p>
        </div>
        <div className="flex gap-2">
          {["zones", "teams", "dispatch"].map(t => (
            <Button key={t} size="sm"
              variant={activeTab === t ? "default" : "outline"}
              onClick={() => setActiveTab(t as typeof activeTab)}>
              {t === "zones" ? "站點管理" : t === "teams" ? "車隊管理" : "安全派車"}
            </Button>
          ))}
        </div>
      </div>

      {/* ── ZONES TAB ───────────────────────────────────────────────────── */}
      {activeTab === "zones" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Zone list */}
          <div className="lg:col-span-2 border rounded-xl p-4 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">站點列表</h3>
              <Button size="sm" onClick={() => openZoneDialog()}>+ 新增站點</Button>
            </div>
            {loading ? (
              <div className="text-center text-gray-400 py-8">載入中…</div>
            ) : zones.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <div className="text-3xl mb-2">🗺</div>
                <p className="text-sm">尚未建立任何站點</p>
                <Button size="sm" className="mt-3" onClick={() => openZoneDialog()}>建立第一個站點</Button>
              </div>
            ) : (
              <div className="space-y-1">{zones.map(z => renderZoneRow(z))}</div>
            )}
          </div>

          {/* Zone stats panel */}
          <div className="lg:col-span-3 border rounded-xl p-4 bg-white dark:bg-gray-900">
            {!selectedZone ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <div className="text-4xl mb-3">👈</div>
                <p>點選左側站點查看詳情</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base">{selectedZone.name}</h3>
                    {selectedZone.region && <p className="text-xs text-gray-500">{selectedZone.region}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => fetchZoneStats(selectedZone.id)}>
                    🔄 重整
                  </Button>
                </div>

                {zoneStats ? (
                  <>
                    {/* Order stats */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">訂單狀況</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "總訂單", value: zoneStats.orders.total, color: "text-gray-800 dark:text-gray-200" },
                          { label: "等待派車", value: zoneStats.orders.pending, color: "text-orange-600" },
                          { label: "進行中", value: zoneStats.orders.active, color: "text-blue-600" },
                          { label: "已完成", value: zoneStats.orders.delivered, color: "text-green-600" },
                          { label: "異常", value: zoneStats.orders.exception_count, color: "text-red-600" },
                          { label: "營收(元)", value: `$${Number(zoneStats.orders.revenue_total).toLocaleString()}`, color: "text-purple-600" },
                        ].map(m => (
                          <div key={m.label} className="border rounded-lg p-2 text-center">
                            <div className={`font-bold text-lg ${m.color}`}>{m.value}</div>
                            <div className="text-xs text-gray-500">{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Driver stats */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2">司機狀況</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "總司機", value: zoneStats.drivers.total, color: "" },
                          { label: "可接單", value: zoneStats.drivers.available, color: "text-green-600" },
                          { label: "忙碌中", value: zoneStats.drivers.busy, color: "text-blue-600" },
                          { label: "下線", value: zoneStats.drivers.offline, color: "text-gray-400" },
                        ].map(m => (
                          <div key={m.label} className="border rounded-lg p-2 text-center">
                            <div className={`font-bold text-lg ${m.color}`}>{m.value}</div>
                            <div className="text-xs text-gray-500">{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Teams in zone */}
                    {zoneStats.teams.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">所屬車隊</p>
                        <div className="space-y-1">
                          {zoneStats.teams.map(t => (
                            <div key={t.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium">{t.name}</span>
                                {t.code && <span className="text-xs text-gray-400 ml-2">({t.code})</span>}
                              </div>
                              <div className="flex gap-3 text-xs text-gray-500">
                                <span>🚗 {t.driver_count}</span>
                                <span>📦 {t.active_orders} 單</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-400">載入站點數據…</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEAMS TAB ───────────────────────────────────────────────────── */}
      {activeTab === "teams" && (
        <div className="border rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">車隊管理</h3>
            <Button size="sm" onClick={() => openTeamDialog()}>+ 新增車隊</Button>
          </div>
          {teams.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-3xl mb-2">🚛</div>
              <p className="text-sm">尚未建立任何車隊</p>
            </div>
          ) : (
            <div className="divide-y">
              {teams.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        {t.code && <Badge variant="outline" className="text-xs">{t.code}</Badge>}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                        {t.zone_name && <span>📍 {t.zone_name}</span>}
                        <span>🚗 {t.driver_count} 司機</span>
                        <span>📦 {t.active_orders} 進行中訂單</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => openTeamDialog(t)}>編輯</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500"
                      onClick={() => deleteTeam(t.id)}>停用</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DISPATCH LOCK TAB ───────────────────────────────────────────── */}
      {activeTab === "dispatch" && (
        <div className="max-w-lg mx-auto">
          <div className="border rounded-xl p-5 bg-white dark:bg-gray-900 space-y-4">
            <div>
              <h3 className="font-bold text-sm">安全派車（資料庫鎖定保護）</h3>
              <p className="text-xs text-gray-500 mt-1">
                使用 FOR UPDATE NOWAIT 機制確保同一張單只能被派一次。改派時必須填寫原因，自動寫入稽核日誌。
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">🔒 防呆機制</p>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5 list-disc list-inside">
                <li>並發請求：第二個請求會收到 409 錯誤，不會重複派車</li>
                <li>狀態驗證：只有 pending / assigned 訂單可派車</li>
                <li>冪等保護：重複派給同一司機會直接返回成功</li>
                <li>改派留跡：全部改派操作寫入 order_status_history</li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">訂單 ID</Label>
                <Input className="mt-1" placeholder="輸入訂單編號" value={dispatchOrderId}
                  onChange={e => setDispatchOrderId(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">司機 ID</Label>
                <Input className="mt-1" placeholder="輸入司機編號" value={dispatchDriverId}
                  onChange={e => setDispatchDriverId(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">改派原因（選填）</Label>
                <Input className="mt-1" placeholder="若為改派，請填寫原因" value={dispatchReason}
                  onChange={e => setDispatchReason(e.target.value)} />
              </div>

              {dispatchResult && (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-lg text-sm text-green-700 dark:text-green-300">
                  {dispatchResult}
                </div>
              )}
              {dispatchError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg text-sm text-red-600 dark:text-red-400">
                  ⚠ {dispatchError}
                </div>
              )}

              <Button className="w-full" onClick={doDispatchAssign}>執行安全派車</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zone Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingZone?.id ? "編輯站點" : "新增站點"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">站點名稱 *</Label>
              <Input className="mt-1" value={editingZone?.name ?? ""}
                onChange={e => setEditingZone(p => ({ ...p!, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">站點代碼</Label>
              <Input className="mt-1" placeholder="如 TW-N, TW-C" value={editingZone?.code ?? ""}
                onChange={e => setEditingZone(p => ({ ...p!, code: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">上層站點</Label>
              <Select value={String(editingZone?.parent_zone_id ?? "")}
                onValueChange={v => setEditingZone(p => ({ ...p!, parent_zone_id: v ? Number(v) : null }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="（無，為根站點）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">（無，為根站點）</SelectItem>
                  {zones.flatMap(z => [z, ...(z.children ?? [])]).filter(z => z.id !== editingZone?.id).map(z => (
                    <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">區域</Label>
              <Input className="mt-1" placeholder="如 北區、中區、南區" value={editingZone?.region ?? ""}
                onChange={e => setEditingZone(p => ({ ...p!, region: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">說明</Label>
              <Input className="mt-1" value={editingZone?.description ?? ""}
                onChange={e => setEditingZone(p => ({ ...p!, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialog(false)}>取消</Button>
            <Button onClick={saveZone}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Team Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam?.id ? "編輯車隊" : "新增車隊"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">車隊名稱 *</Label>
              <Input className="mt-1" value={editingTeam?.name ?? ""}
                onChange={e => setEditingTeam(p => ({ ...p!, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">車隊代碼</Label>
              <Input className="mt-1" placeholder="如 A, B, COLD" value={editingTeam?.code ?? ""}
                onChange={e => setEditingTeam(p => ({ ...p!, code: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">所屬站點</Label>
              <Select value={String(editingTeam?.zone_id ?? "")}
                onValueChange={v => setEditingTeam(p => ({ ...p!, zone_id: v ? Number(v) : null }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="（不指定站點）" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">（不指定站點）</SelectItem>
                  {zones.flatMap(z => [z, ...(z.children ?? [])]).map(z => (
                    <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">說明</Label>
              <Input className="mt-1" value={editingTeam?.description ?? ""}
                onChange={e => setEditingTeam(p => ({ ...p!, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamDialog(false)}>取消</Button>
            <Button onClick={saveTeam}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
