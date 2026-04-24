/**
 * DispatchCenter.tsx — 調度中心
 *
 * 互動邏輯：
 *  單筆派車  → 點路線「派車」→ 右側司機發光 → 點司機 → 完成
 *  批次派車  → 勾選多條路線  → 右側司機發光 → 點任一司機 → 全部完成
 *  AI 派車   → 點「🤖 AI 派車」→ 確認建議清單 → 一鍵套用
 */

import { useState, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import type { RoutePoint, DriverPosition } from "@/components/DispatchMap";

const DispatchMap = lazy(() =>
  import("@/components/DispatchMap").then(m => ({ default: m.DispatchMap }))
);

// ── 型別 ──────────────────────────────────────────────────────────────────────
interface RouteItem {
  id: number;
  dispatch_order_id: number;
  order_id?: number;
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
  phone?: string;
  vehicle_type?: string;
  license_plate?: string;
  status?: string;
}

interface AiSuggestion {
  route_item_id:         number;
  route_label:           string;
  suggested_driver_id:   number;
  suggested_driver_name: string;
  score:                 number;
  reason:                string;
}

// ── 常數 ──────────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  sent: "已發送", acknowledged: "已確認", assigned: "已指派",
};
const STATUS_COLOR: Record<string, string> = {
  sent:         "bg-amber-100 text-amber-800 border-amber-200",
  acknowledged: "bg-blue-100 text-blue-800 border-blue-200",
  assigned:     "bg-emerald-100 text-emerald-800 border-emerald-200",
};

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

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function DispatchCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // 篩選
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText,   setSearchText]   = useState("");
  const [expandedId,   setExpandedId]   = useState<number | null>(null);

  // 派車模式
  const [mode, setMode] = useState<"idle" | "single" | "batch">("idle");
  // 單筆：鎖定的 route + dispatch
  const [pendingRoute,    setPendingRoute]    = useState<{ routeId: number; dispatchId: number } | null>(null);
  // 批次：勾選的路線集合 { routeId → dispatchId }
  const [batchMap,        setBatchMap]        = useState<Map<number, number>>(new Map());

  // AI
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiReady,       setAiReady]       = useState(false); // 等待用戶確認後 apply

  // ── 查詢 ────────────────────────────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery<DispatchOrder[]>({
    queryKey: ["dispatch-orders"],
    queryFn:  () => apiFetch("/dispatch-orders"),
    refetchInterval: 30_000,
  });

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ["drivers-available"],
    queryFn:  () => apiFetch("/drivers?status=available"),
  });

  const { data: driverPositions = [] } = useQuery<DriverPosition[]>({
    queryKey: ["driver-positions"],
    queryFn:  () => apiFetch("/drivers/positions").catch(() => []),
    refetchInterval: 15_000,
  });

  // ── 篩選 ────────────────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (searchText && !o.title.includes(searchText) && !o.fleet_name.includes(searchText)) return false;
    return true;
  });

  const expandedOrder = orders.find(o => o.id === expandedId) ?? null;

  const mapRoutes: RoutePoint[] = (
    expandedOrder ? expandedOrder.routes : orders.flatMap(o => o.routes)
  )
    .filter(r => r.pickup_lat && r.pickup_lng)
    .map(r => ({
      routeLabel: r.route_label,
      routeDate:  r.route_date,
      driverName: r.assigned_driver_name,
      pickup:   r.pickup_lat   ? { lat: r.pickup_lat,   lng: r.pickup_lng!,   address: r.pickup_address ?? "" }   : undefined,
      delivery: r.delivery_lat ? { lat: r.delivery_lat, lng: r.delivery_lng!, address: r.delivery_address ?? "" } : undefined,
    }));

  // ── Mutations ────────────────────────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: ({ dispatchId, routeItemId, driverId, driverName }:
      { dispatchId: number; routeItemId: number; driverId: number; driverName: string }) =>
      apiFetch(`/dispatch-orders/${dispatchId}/routes/${routeItemId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      toast({ title: "✅ 派車成功" });
      cancelMode();
    },
    onError: (e: Error) => toast({ title: "❌ 指派失敗", description: e.message, variant: "destructive" }),
  });

  const batchAssignMutation = useMutation({
    mutationFn: async ({ entries, driverId, driverName }:
      { entries: { dispatchId: number; routeId: number }[]; driverId: number; driverName: string }) => {
      for (const { dispatchId, routeId } of entries) {
        await apiFetch(`/dispatch-orders/${dispatchId}/routes/${routeId}/assign`, {
          method: "PUT",
          body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      toast({ title: `✅ 批次派車完成，共 ${batchMap.size} 條路線` });
      cancelMode();
    },
    onError: (e: Error) => toast({ title: "❌ 批次失敗", description: e.message, variant: "destructive" }),
  });

  // ── 互動處理 ─────────────────────────────────────────────────────────────────

  const cancelMode = useCallback(() => {
    setMode("idle");
    setPendingRoute(null);
    setBatchMap(new Map());
    setAiSuggestions([]);
    setAiReady(false);
  }, []);

  // 點「派車」按鈕 → 單筆模式
  const startSingleAssign = useCallback((routeId: number, dispatchId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setMode("single");
    setPendingRoute({ routeId, dispatchId });
    setBatchMap(new Map());
  }, []);

  // 批次模式：勾選/取消路線
  const toggleBatchRoute = useCallback((routeId: number, dispatchId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setBatchMap(prev => {
      const next = new Map(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.set(routeId, dispatchId);
      return next;
    });
  }, []);

  // 點司機卡片
  const handleDriverClick = useCallback((driver: Driver) => {
    if (mode === "single" && pendingRoute) {
      assignMutation.mutate({
        dispatchId:  pendingRoute.dispatchId,
        routeItemId: pendingRoute.routeId,
        driverId:    driver.id,
        driverName:  driver.name,
      });
    } else if (mode === "batch" && batchMap.size > 0) {
      const entries = Array.from(batchMap.entries()).map(([routeId, dispatchId]) => ({ routeId, dispatchId }));
      batchAssignMutation.mutate({ entries, driverId: driver.id, driverName: driver.name });
    }
  }, [mode, pendingRoute, batchMap]);

  // ── AI 派車 ──────────────────────────────────────────────────────────────────
  const handleAiSuggest = async () => {
    const unassignedIds = (expandedOrder?.routes ?? orders.flatMap(o => o.routes))
      .filter(r => !r.assigned_driver_id)
      .map(r => r.id);
    if (!unassignedIds.length) { toast({ title: "所有路線已指派完畢" }); return; }
    setAiLoading(true);
    setAiReady(false);
    setAiSuggestions([]);
    try {
      const { suggestions } = await apiFetch("/dispatch-suggest/auto", {
        method: "POST",
        body: JSON.stringify({ route_item_ids: unassignedIds }),
      });
      setAiSuggestions(suggestions ?? []);
      setAiReady(true);
      if (!suggestions?.length) toast({ title: "暫無建議（無可用司機）" });
    } catch (e: any) {
      toast({ title: "AI 建議失敗", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiApply = async () => {
    try {
      const { applied } = await apiFetch("/dispatch-suggest/apply", {
        method: "POST",
        body: JSON.stringify({ suggestions: aiSuggestions }),
      });
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      toast({ title: `✅ AI 自動派車完成，套用 ${applied} 筆` });
      setAiSuggestions([]);
      setAiReady(false);
    } catch (e: any) {
      toast({ title: "套用失敗", description: e.message, variant: "destructive" });
    }
  };

  // ── 狀態旗標 ─────────────────────────────────────────────────────────────────
  const isAssigning  = mode === "single" || mode === "batch";
  const isProcessing = assignMutation.isPending || batchAssignMutation.isPending;

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-slate-50" style={{ minHeight: 0 }}>

      {/* ── 左：地圖 ── */}
      <div className="flex-1 relative min-w-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">地圖載入中…</div>
        }>
          <DispatchMap routes={mapRoutes} drivers={driverPositions} height="100%" />
        </Suspense>
        {/* 圖例 */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl shadow-lg px-4 py-3 text-xs space-y-1.5 border border-slate-200 z-[1000]">
          <div className="font-bold text-slate-600 mb-1">圖例</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />取貨點</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />送貨點</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />司機位置</div>
        </div>
      </div>

      {/* ── 中：派車單列表 ── */}
      <div className="w-72 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
        {/* 頁頭 */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-700">🗂 派車單</span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (mode === "batch") cancelMode();
                  else { setMode("batch"); setPendingRoute(null); }
                }}
                className={`text-xs px-2 py-1 rounded-md border font-medium transition-colors ${
                  mode === "batch"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "text-amber-700 border-amber-300 hover:bg-amber-50"
                }`}
              >
                {mode === "batch" ? `✔ 已選 ${batchMap.size}` : "批次"}
              </button>
              <button
                onClick={handleAiSuggest}
                disabled={aiLoading}
                className="text-xs px-2 py-1 rounded-md border border-violet-300 text-violet-700 hover:bg-violet-50 font-medium transition-colors disabled:opacity-50"
              >
                {aiLoading ? "…" : "🤖 AI"}
              </button>
            </div>
          </div>
          <Input placeholder="搜尋車隊/標題…" value={searchText}
            onChange={e => setSearchText(e.target.value)} className="h-7 text-xs mb-1.5" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="sent">已發送</SelectItem>
              <SelectItem value="acknowledged">已確認</SelectItem>
              <SelectItem value="assigned">已指派</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 派車單列表 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="flex items-center justify-center py-10 text-slate-400 text-xs">載入中…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 text-slate-400">
              <div className="text-2xl mb-1">📭</div>
              <div className="text-xs">沒有符合的派車單</div>
            </div>
          )}
          {filtered.map(order => (
            <div key={order.id}
              className={`border-b border-slate-100 cursor-pointer transition-colors ${
                expandedId === order.id ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
              onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
            >
              {/* 派車單標頭 */}
              <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-xs truncate">{order.title}</div>
                  <div className="text-xs text-slate-400">{order.fleet_name}</div>
                  {order.week_start && (
                    <div className="text-xs text-slate-400">{order.week_start}～{order.week_end}</div>
                  )}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${STATUS_COLOR[order.status]}`}>
                  {STATUS_LABEL[order.status]}
                </span>
              </div>

              {/* 路線明細 */}
              {expandedId === order.id && (
                <div className="px-2 pb-2 space-y-1">
                  {order.routes.map(route => {
                    const inBatch    = batchMap.has(route.id);
                    const isPending  = mode === "single" && pendingRoute?.routeId === route.id;
                    const aiMatch    = aiSuggestions.find(s => s.route_item_id === route.id);
                    const isAssigned = !!route.assigned_driver_name;

                    return (
                      <div key={route.id}
                        className={`rounded-lg border px-2.5 py-2 text-xs transition-all ${
                          isPending  ? "bg-blue-50 border-blue-400 ring-1 ring-blue-300"   :
                          inBatch    ? "bg-amber-50 border-amber-400 ring-1 ring-amber-300" :
                          aiMatch    ? "bg-violet-50 border-violet-300"                     :
                          isAssigned ? "bg-emerald-50 border-emerald-200"                   :
                                       "bg-slate-50 border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="font-semibold text-slate-700 truncate flex items-center gap-1">
                            {mode === "batch" && !isAssigned && (
                              <input type="checkbox"
                                className="accent-amber-500 shrink-0"
                                checked={inBatch}
                                onClick={e => toggleBatchRoute(route.id, order.id, e)}
                                readOnly
                              />
                            )}
                            {route.prefix && <span className="text-slate-400">{route.prefix}</span>}
                            {route.route_label}
                          </div>
                          {route.route_date && <span className="text-slate-400 whitespace-nowrap">{route.route_date}</span>}
                        </div>

                        {isAssigned ? (
                          <div className="mt-1 flex items-center gap-1 text-emerald-700">
                            <span>🚛</span>
                            <span className="font-semibold">{route.assigned_driver_name}</span>
                          </div>
                        ) : aiMatch ? (
                          <div className="mt-1 text-violet-700">
                            🤖 <span className="font-semibold">{aiMatch.suggested_driver_name}</span>
                            <span className="text-slate-400 ml-1">({aiMatch.reason})</span>
                          </div>
                        ) : (
                          <button
                            className={`mt-1.5 text-xs font-semibold underline underline-offset-2 transition-colors ${
                              isPending ? "text-blue-700" : "text-blue-500 hover:text-blue-700"
                            }`}
                            onClick={e => startSingleAssign(route.id, order.id, e)}
                          >
                            {isPending ? "📍 等待選擇司機…" : "＋ 派車"}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <div className="text-xs text-slate-400 text-right pt-0.5">
                    已指派 {order.routes.filter(r => r.assigned_driver_name).length} / {order.routes.length}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 取消提示列 */}
        {(isAssigning || aiReady) && (
          <div className="px-3 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {isAssigning ? "點右側司機完成指派" : `AI 建議 ${aiSuggestions.length} 筆`}
            </span>
            {aiReady && (
              <button onClick={handleAiApply}
                className="text-xs px-2.5 py-1 rounded-md bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors">
                一鍵套用
              </button>
            )}
            <button onClick={cancelMode}
              className="text-xs text-slate-400 hover:text-slate-600 underline">取消</button>
          </div>
        )}
      </div>

      {/* ── 右：司機列表 ── */}
      <div className={`w-56 flex flex-col border-l overflow-hidden transition-colors duration-300 ${
        isAssigning ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
      }`}>
        {/* 標頭 */}
        <div className={`px-3 py-3 border-b text-xs font-bold transition-colors ${
          isAssigning ? "border-amber-200 text-amber-800 bg-amber-100" : "border-slate-100 text-slate-600"
        }`}>
          {isAssigning ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              {mode === "batch" ? `選擇司機 → 指派 ${batchMap.size} 條路線` : "點擊司機完成指派"}
            </span>
          ) : "👤 待命司機"}
        </div>

        {/* 司機卡片 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {drivers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-300 text-xs">
              <div className="text-2xl mb-1">🚫</div>
              無待命司機
            </div>
          )}
          {drivers.map(driver => {
            const aiMatch = aiSuggestions.find(s => s.suggested_driver_id === driver.id);
            const clickable = isAssigning && !isProcessing;

            return (
              <button
                key={driver.id}
                disabled={!clickable}
                onClick={() => handleDriverClick(driver)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-200 ${
                  clickable
                    ? "cursor-pointer border-amber-400 bg-white shadow-md hover:bg-amber-500 hover:text-white hover:shadow-lg hover:scale-[1.02] active:scale-95 animate-pulse-subtle"
                    : aiMatch
                    ? "cursor-default border-violet-300 bg-violet-50"
                    : "cursor-default border-slate-200 bg-white hover:bg-slate-50"
                }`}
                style={clickable ? { animation: "glow-pulse 1.8s ease-in-out infinite" } : undefined}
              >
                <div className="font-semibold text-sm truncate">{driver.name}</div>
                {driver.vehicle_type && (
                  <div className={`text-xs mt-0.5 truncate ${clickable ? "text-amber-600" : "text-slate-400"}`}>
                    {driver.vehicle_type}
                    {driver.license_plate && <span className="ml-1">· {driver.license_plate}</span>}
                  </div>
                )}
                {aiMatch && (
                  <div className="mt-1 text-xs text-violet-600 font-medium">
                    🤖 {aiMatch.route_label} <span className="text-slate-400">({aiMatch.score}分)</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 統計 */}
        <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400 text-center">
          {drivers.length} 位待命
        </div>
      </div>

      {/* 發光動畫 CSS */}
      <style>{`
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4), 0 2px 8px rgba(0,0,0,.08); }
          50%       { box-shadow: 0 0 0 6px rgba(245,158,11,0.12), 0 4px 16px rgba(245,158,11,.25); }
        }
      `}</style>
    </div>
  );
}
