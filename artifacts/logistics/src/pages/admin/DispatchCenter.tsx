/**
 * DispatchCenter.tsx — v2 深夜指揮中心
 * 設計哲學：少即是多 — 深色工業風 + 琥珀色系 accent
 * 三欄：司機狀態牆 | 地圖 | 待派任務
 */

import { useState, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import type { RoutePoint, DriverPosition } from "@/components/DispatchMap";

const DispatchMap = lazy(() =>
  import("@/components/DispatchMap").then(m => ({ default: m.DispatchMap }))
);

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── 型別 ──────────────────────────────────────────────────────────────────────
interface RouteItem {
  id: number;
  dispatch_order_id: number;
  route_label: string;
  route_date?: string;
  prefix?: string;
  assigned_driver_id?: number;
  assigned_driver_name?: string;
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  delivery_address?: string;
  delivery_lat?: number;
  delivery_lng?: number;
}

interface DispatchOrder {
  id: number;
  fleet_name: string;
  title: string;
  week_start?: string;
  week_end?: string;
  status: "sent" | "acknowledged" | "assigned";
  routes: RouteItem[];
}

interface Driver {
  id: number;
  name: string;
  vehicle_type?: string;
  license_plate?: string;
  status?: string;
  rating?: number;
  latitude?: number;
  longitude?: number;
}

interface AISuggestion {
  route_item_id: number;
  route_label: string;
  suggested_driver_id: number;
  suggested_driver_name: string;
  score: number;
  reason: string;
}

// ── 常數 ──────────────────────────────────────────────────────────────────────
const statusMeta = {
  sent:         { label: "待確認", color: "#f59e0b" },
  acknowledged: { label: "確認中", color: "#3b82f6" },
  assigned:     { label: "已完成", color: "#10b981" },
};

const driverStatusMeta: Record<string, { label: string; dot: string }> = {
  available: { label: "待命",   dot: "#10b981" },
  busy:      { label: "出勤",   dot: "#f59e0b" },
  off:       { label: "休息",   dot: "#475569" },
  offline:   { label: "離線",   dot: "#334155" },
};

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function DispatchCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [focusOrderId,     setFocusOrderId]     = useState<number | null>(null);
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<number>>(new Set());
  const [assignTarget,     setAssignTarget]     = useState<{ routeId: number; dispatchId: number } | null>(null);
  const [aiSuggestions,    setAiSuggestions]    = useState<AISuggestion[]>([]);
  const [showAiPanel,      setShowAiPanel]      = useState(false);

  // ── 查詢 ────────────────────────────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery<DispatchOrder[]>({
    queryKey: ["dispatch-orders"],
    queryFn: () => apiFetch("/dispatch-orders").then(r => r.orders ?? []),
    refetchInterval: 30_000,
  });

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: () => apiFetch("/drivers").then(r => Array.isArray(r) ? r : (r.drivers ?? [])),
    refetchInterval: 60_000,
  });

  const { data: driverPositions = [] } = useQuery<DriverPosition[]>({
    queryKey: ["driver-positions"],
    queryFn: () => apiFetch("/drivers/positions").catch(() => []),
    refetchInterval: 15_000,
  });

  // ── 衍生資料 ────────────────────────────────────────────────────────────────
  const pending          = orders.filter(o => o.status !== "assigned");
  const unassignedRoutes = orders.flatMap(o => (o.routes ?? []).filter(r => !r.assigned_driver_name));
  const availableDrivers = drivers.filter(d => d.status === "available");
  const busyDrivers      = drivers.filter(d => d.status === "busy");
  const focusOrder       = focusOrderId ? orders.find(o => o.id === focusOrderId) : null;

  const mapRoutes: RoutePoint[] = (focusOrder ? (focusOrder.routes ?? []) : orders.flatMap(o => o.routes ?? []))
    .filter(r => r.pickup_lat)
    .map(r => ({
      routeLabel: r.route_label,
      routeDate:  r.route_date,
      driverName: r.assigned_driver_name,
      pickup:   r.pickup_lat   ? { lat: r.pickup_lat,   lng: r.pickup_lng!,   address: r.pickup_address   ?? "" } : undefined,
      delivery: r.delivery_lat ? { lat: r.delivery_lat, lng: r.delivery_lng!, address: r.delivery_address ?? "" } : undefined,
    }));

  const isSelectingDriver = !!assignTarget || selectedRouteIds.size > 0;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const assignMut = useMutation({
    mutationFn: ({ dispatchId, routeItemId, driverId, driverName }: {
      dispatchId: number; routeItemId: number; driverId: number; driverName: string;
    }) => apiFetch(`/dispatch-orders/${dispatchId}/routes/${routeItemId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      setAssignTarget(null);
      toast({ title: "✅ 指派成功" });
    },
    onError: (e: Error) => toast({ title: "指派失敗", description: e.message, variant: "destructive" }),
  });

  const batchAssignMut = useMutation({
    mutationFn: async ({ driverId, driverName }: { driverId: number; driverName: string }) => {
      for (const routeId of selectedRouteIds) {
        const order = orders.find(o => o.routes.some(r => r.id === routeId));
        if (!order) continue;
        await apiFetch(`/dispatch-orders/${order.id}/routes/${routeId}/assign`, {
          method: "PUT",
          body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      const count = selectedRouteIds.size;
      setSelectedRouteIds(new Set());
      toast({ title: `✅ 批次指派 ${count} 筆完成` });
    },
    onError: (e: Error) => toast({ title: "批次失敗", description: e.message, variant: "destructive" }),
  });

  const aiSuggestMut = useMutation({
    mutationFn: () => apiFetch("/dispatch-suggest/auto", {
      method: "POST",
      body: JSON.stringify({ route_item_ids: unassignedRoutes.map(r => r.id) }),
    }),
    onSuccess: (data) => { setAiSuggestions(data.suggestions ?? []); setShowAiPanel(true); },
    onError: (e: Error) => toast({ title: "AI 建議失敗", description: e.message, variant: "destructive" }),
  });

  const aiApplyMut = useMutation({
    mutationFn: () => apiFetch("/dispatch-suggest/apply", {
      method: "POST",
      body: JSON.stringify({ suggestions: aiSuggestions }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      setShowAiPanel(false);
      setAiSuggestions([]);
      toast({ title: `🤖 AI 自動派車完成，共 ${aiSuggestions.length} 筆` });
    },
    onError: (e: Error) => toast({ title: "套用失敗", description: e.message, variant: "destructive" }),
  });

  const handleDriverClick = useCallback((driver: Driver) => {
    if (!isSelectingDriver) return;
    if (selectedRouteIds.size > 0) {
      batchAssignMut.mutate({ driverId: driver.id, driverName: driver.name });
    } else if (assignTarget) {
      assignMut.mutate({
        dispatchId:  assignTarget.dispatchId,
        routeItemId: assignTarget.routeId,
        driverId:    driver.id,
        driverName:  driver.name,
      });
    }
  }, [assignTarget, selectedRouteIds, isSelectingDriver, assignMut, batchAssignMut]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* 頂部狀態列 */}
      <header style={S.header}>
        <div>
          <div style={S.title}>調度中心</div>
          <div style={S.sub}>
            {isLoading ? "載入中…" : `${pending.length} 張派車單 · ${unassignedRoutes.length} 條路線待派`}
          </div>
        </div>

        <div style={S.statRow}>
          <StatPill label="待命" value={availableDrivers.length} color="#10b981" />
          <StatPill label="出勤" value={busyDrivers.length}      color="#f59e0b" />
          <StatPill label="待派" value={unassignedRoutes.length}  color="#ef4444" />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {selectedRouteIds.size > 0 && (
            <Btn color="#1e293b" textColor="#94a3b8"
              onClick={() => setSelectedRouteIds(new Set())}>
              清除（{selectedRouteIds.size}）
            </Btn>
          )}
          <Btn
            color="#312e81"
            disabled={unassignedRoutes.length === 0 || aiSuggestMut.isPending}
            onClick={() => aiSuggestMut.mutate()}
          >
            {aiSuggestMut.isPending ? "分析中…" : "🤖 AI 派車"}
          </Btn>
        </div>
      </header>

      {/* 選司機橫幅 */}
      {isSelectingDriver && (
        <div style={S.banner}>
          <span>
            {selectedRouteIds.size > 0
              ? `已選 ${selectedRouteIds.size} 條路線 — 點擊左側待命司機完成批次指派`
              : "請點擊左側待命司機完成指派"}
          </span>
          <Btn color="rgba(255,255,255,.15)" textColor="#fde68a"
            onClick={() => { setAssignTarget(null); setSelectedRouteIds(new Set()); }}>
            ✕ 取消
          </Btn>
        </div>
      )}

      {/* 三欄主體 */}
      <div style={S.body}>

        {/* 左：司機牆 */}
        <aside style={S.panel}>
          <Label>待命 · {availableDrivers.length}</Label>
          {availableDrivers.length === 0 && <Muted>目前無待命司機</Muted>}
          {availableDrivers.map(d => (
            <DriverCard key={d.id} driver={d} selectable={isSelectingDriver}
              onClick={() => handleDriverClick(d)} />
          ))}

          {busyDrivers.length > 0 && (
            <>
              <div style={{ height: 1, background: "#0c1523", margin: "8px 0" }} />
              <Label>出勤中 · {busyDrivers.length}</Label>
              {busyDrivers.map(d => (
                <DriverCard key={d.id} driver={d} selectable={false} onClick={() => {}} />
              ))}
            </>
          )}
        </aside>

        {/* 中：地圖 */}
        <div style={S.mapWrap}>
          <Suspense fallback={
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: "100%", color: "#334155", fontSize: 13 }}>
              地圖載入中…
            </div>
          }>
            <DispatchMap routes={mapRoutes} drivers={driverPositions} height="100%" />
          </Suspense>
          {focusOrderId && (
            <button style={S.mapClear} onClick={() => setFocusOrderId(null)}>✕ 顯示全部</button>
          )}
          {/* 圖例 */}
          <div style={S.legend}>
            <div style={S.legendTitle}>圖例</div>
            <LegendDot color="#3b82f6" label="取貨點" />
            <LegendDot color="#10b981" label="送貨點" />
            <LegendDot color="#f59e0b" label="司機位置" />
          </div>
        </div>

        {/* 右：派車單 */}
        <aside style={{ ...S.panel, borderLeft: "1px solid #1e293b", borderRight: "none" }}>
          <Label style={{ padding: "14px 16px 8px" }}>
            派車單 · {pending.length} 待處理
          </Label>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading && <Muted>載入中…</Muted>}
            {!isLoading && orders.length === 0 && <Muted>目前沒有派車單</Muted>}
            {orders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                focused={focusOrderId === order.id}
                selectedRouteIds={selectedRouteIds}
                onFocus={() => setFocusOrderId(focusOrderId === order.id ? null : order.id)}
                onRouteSelect={id => {
                  setSelectedRouteIds(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  });
                  setAssignTarget(null);
                }}
                onAssignRoute={id => {
                  setAssignTarget({ routeId: id, dispatchId: order.id });
                  setSelectedRouteIds(new Set());
                }}
              />
            ))}
          </div>
        </aside>
      </div>

      {/* AI 建議 Modal */}
      {showAiPanel && (
        <div style={S.overlay} onClick={() => { setShowAiPanel(false); setAiSuggestions([]); }}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#f8fafc" }}>🤖 AI 派車建議</span>
              <span style={{ fontSize: 12, color: "#475569" }}>{aiSuggestions.length} 條路線</span>
            </div>

            {aiSuggestions.length === 0 ? (
              <Muted>目前無可建議的路線（可能全部已指派或無可用司機）</Muted>
            ) : (
              <div style={{ overflowY: "auto", maxHeight: 360 }}>
                {aiSuggestions.map(s => (
                  <div key={s.route_item_id} style={S.aiRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{s.route_label}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{s.reason}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: 13 }}>{s.suggested_driver_name}</div>
                      <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>評分 {s.score}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn color="#1e293b" textColor="#64748b" style={{ flex: 1 }}
                onClick={() => { setShowAiPanel(false); setAiSuggestions([]); }}>
                取消
              </Btn>
              <Btn color="#4f46e5" style={{ flex: 2 }}
                disabled={aiApplyMut.isPending || aiSuggestions.length === 0}
                onClick={() => aiApplyMut.mutate()}>
                {aiApplyMut.isPending ? "套用中…" : `一鍵套用全部 ${aiSuggestions.length} 筆`}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* 發光動畫 */}
      <style>{`
        @keyframes amber-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,.3); }
          50%       { box-shadow: 0 0 0 5px rgba(245,158,11,.08), 0 0 20px rgba(245,158,11,.15); }
        }
        .driver-selectable:hover {
          background: rgba(245,158,11,.12) !important;
          border-color: rgba(245,158,11,.5) !important;
        }
      `}</style>
    </div>
  );
}

// ── 小元件 ────────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "0 18px", textAlign: "center", borderRight: "1px solid #1e293b" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: "10px 16px 4px", fontSize: 10, fontWeight: 700,
      color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", ...style,
    }}>
      {children}
    </div>
  );
}

function Muted({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "20px 16px", color: "#334155", fontSize: 12, textAlign: "center", ...style }}>
      {children}
    </div>
  );
}

function Btn({ children, color, textColor = "#fff", disabled, onClick, style }: {
  children: React.ReactNode; color: string; textColor?: string;
  disabled?: boolean; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: "7px 16px", borderRadius: 8, border: "none",
      background: color, color: textColor, fontSize: 12, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, fontFamily: "inherit",
      transition: "opacity .15s, background .15s", ...style,
    }}>
      {children}
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#64748b" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}

function DriverCard({ driver, selectable, onClick }: {
  driver: Driver; selectable: boolean; onClick: () => void;
}) {
  const meta = driverStatusMeta[driver.status ?? "off"];
  return (
    <div
      className={selectable ? "driver-selectable" : ""}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", cursor: selectable ? "pointer" : "default",
        borderBottom: "1px solid #0c1523",
        background: selectable ? "rgba(245,158,11,.04)" : "transparent",
        transition: "background .12s, border-color .12s",
        animation: selectable ? "amber-glow 2s ease-in-out infinite" : "none",
        border: selectable ? "1px solid rgba(245,158,11,.15)" : "1px solid transparent",
        borderRadius: selectable ? 8 : 0,
        margin: selectable ? "2px 6px" : 0,
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 8, background: "#0d1626", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, color: "#64748b",
        border: selectable ? "1.5px solid #f59e0b55" : "1.5px solid #1e293b",
        transition: "border-color .12s",
      }}>
        {driver.name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{driver.name}</div>
        <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
          {driver.vehicle_type ?? "—"}
          {driver.license_plate ? ` · ${driver.license_plate}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot }} />
          <span style={{ fontSize: 10, color: meta.dot }}>{meta.label}</span>
        </div>
        {driver.rating != null && (
          <span style={{ fontSize: 10, color: "#334155" }}>★ {Number(driver.rating).toFixed(1)}</span>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order, focused, selectedRouteIds, onFocus, onRouteSelect, onAssignRoute }: {
  order: DispatchOrder; focused: boolean; selectedRouteIds: Set<number>;
  onFocus: () => void; onRouteSelect: (id: number) => void; onAssignRoute: (id: number) => void;
}) {
  const meta     = statusMeta[order.status];
  const assigned = order.routes.filter(r => r.assigned_driver_name).length;
  const total    = order.routes.length;
  const pct      = total > 0 ? (assigned / total) * 100 : 0;

  return (
    <div style={{ borderBottom: "1px solid #0c1523", background: focused ? "#0d1e38" : "transparent" }}>
      <div onClick={onFocus} style={{ padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#e2e8f0",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {order.title}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{order.fleet_name}</div>
          </div>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
            background: `${meta.color}1a`, color: meta.color, whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {meta.label}
          </span>
        </div>

        {/* 進度條 */}
        <div style={{ marginTop: 10 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 10, color: "#334155", marginBottom: 4,
          }}>
            <span>指派進度</span>
            <span style={{ color: pct === 100 ? "#10b981" : "#94a3b8" }}>{assigned}/{total}</span>
          </div>
          <div style={{ height: 2, background: "#1e293b", borderRadius: 1 }}>
            <div style={{
              height: "100%", borderRadius: 1, transition: "width .4s",
              background: pct === 100 ? "#10b981" : "#f59e0b",
              width: `${pct}%`,
            }} />
          </div>
        </div>
      </div>

      {/* 路線列表（展開） */}
      {focused && (
        <div style={{ padding: "0 10px 12px" }}>
          {order.routes.map(r => {
            const sel = selectedRouteIds.has(r.id);
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 7, marginBottom: 3,
                background: sel
                  ? "#1c2e10"
                  : r.assigned_driver_name ? "#091a12" : "#0c1523",
                border: `1px solid ${sel
                  ? "#4ade8060"
                  : r.assigned_driver_name ? "#16653460" : "#1e293b"}`,
                transition: "all .15s",
              }}>
                {!r.assigned_driver_name && (
                  <input type="checkbox" checked={sel}
                    onChange={() => onRouteSelect(r.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: "#f59e0b", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
                    {r.prefix && <span style={{ color: "#334155" }}>{r.prefix} </span>}
                    {r.route_label}
                  </span>
                  {r.route_date && (
                    <span style={{ fontSize: 10, color: "#334155", marginLeft: 6 }}>{r.route_date}</span>
                  )}
                </div>
                {r.assigned_driver_name ? (
                  <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, whiteSpace: "nowrap" }}>
                    ✓ {r.assigned_driver_name}
                  </span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); onAssignRoute(r.id); }}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6,
                      background: "#172554", color: "#60a5fa",
                      border: "1px solid #1e40af", cursor: "pointer",
                      fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                    }}
                  >
                    派車
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#060d1a", color: "#e2e8f0",
    fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px", height: 58, flexShrink: 0,
    background: "#08111f", borderBottom: "1px solid #1e293b",
  },
  title: { fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", color: "#f8fafc" },
  sub:   { fontSize: 11, color: "#334155", marginTop: 2 },
  statRow: {
    display: "flex", alignItems: "center",
    borderLeft: "1px solid #1e293b", borderRight: "1px solid #1e293b",
    padding: "0 8px",
  },
  banner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "9px 20px", background: "#78350f",
    borderBottom: "1px solid #92400e",
    color: "#fde68a", fontSize: 13, fontWeight: 600, flexShrink: 0, gap: 12,
  },
  body: {
    display: "grid", gridTemplateColumns: "250px 1fr 300px",
    flex: 1, overflow: "hidden", minHeight: 0,
  },
  panel: {
    display: "flex", flexDirection: "column",
    background: "#08111f", borderRight: "1px solid #1e293b",
    overflowY: "auto",
  },
  mapWrap: { position: "relative", overflow: "hidden" },
  mapClear: {
    position: "absolute", top: 10, left: 10, zIndex: 999,
    background: "rgba(8,17,31,.92)", color: "#64748b",
    border: "1px solid #1e293b", borderRadius: 7,
    padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  },
  legend: {
    position: "absolute", bottom: 16, left: 16, zIndex: 999,
    background: "rgba(8,17,31,.88)", border: "1px solid #1e293b",
    borderRadius: 10, padding: "10px 14px", display: "flex",
    flexDirection: "column", gap: 6,
  },
  legendTitle: { fontSize: 9, fontWeight: 700, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 },
  overlay: {
    position: "fixed", inset: 0, zIndex: 500,
    background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  modal: {
    background: "#0d1626", border: "1px solid #1e293b", borderRadius: 16,
    padding: 24, width: "90%", maxWidth: 520,
    maxHeight: "80vh", display: "flex", flexDirection: "column",
    boxShadow: "0 40px 100px rgba(0,0,0,.8)",
  },
  modalHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 14, marginBottom: 4, borderBottom: "1px solid #1e293b",
  },
  aiRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 0", borderBottom: "1px solid #0c1523", gap: 12,
  },
};
