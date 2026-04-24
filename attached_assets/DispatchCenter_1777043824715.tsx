/**
 * DispatchCenter.tsx
 * 路徑：artifacts/logistics/src/pages/admin/DispatchCenter.tsx
 *
 * 功能：
 *  - 左側 Leaflet 地圖顯示所有路線
 *  - 右側派車單列表（含狀態篩選）
 *  - 點擊派車單 → 地圖聚焦該路線
 *  - 批次派車：選多筆路線一次指派司機
 *  - 派車單狀態：sent → acknowledged → assigned
 */

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { RoutePoint, DriverPosition } from "@/components/DispatchMap";

// Lazy load 地圖（避免 SSR 問題）
const DispatchMap = lazy(() =>
  import("@/components/DispatchMap").then((m) => ({ default: m.DispatchMap }))
);

// ── 型別 ────────────────────────────────────────────────────
interface RouteItem {
  id: number;
  dispatch_order_id: number;
  order_id?: number;
  route_label: string;
  route_date?: string;
  prefix?: string;
  assigned_driver_id?: number;
  assigned_driver_name?: string;
  assigned_at?: string;
  // 地址（從 order 帶過來，若有的話）
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  delivery_address?: string;
  delivery_lat?: number;
  delivery_lng?: number;
}

interface DispatchOrder {
  id: number;
  fleet_id: number;
  fleet_name: string;
  title: string;
  week_start?: string;
  week_end?: string;
  status: "sent" | "acknowledged" | "assigned";
  notes?: string;
  sent_at?: string;
  acknowledged_at?: string;
  routes: RouteItem[];
}

interface Driver {
  id: number;
  name: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
  status?: string;
}

// ── 工具 ────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  sent: "已發送",
  acknowledged: "已確認",
  assigned: "已指派",
};
const STATUS_COLOR: Record<string, string> = {
  sent: "bg-amber-100 text-amber-800 border-amber-200",
  acknowledged: "bg-blue-100 text-blue-800 border-blue-200",
  assigned: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api${path}`, {
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

// ── 主元件 ──────────────────────────────────────────────────
export default function DispatchCenter() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // 批次指派狀態
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningRouteId, setAssigningRouteId] = useState<number | null>(null);
  const [assigningDispatchId, setAssigningDispatchId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  // ── 資料查詢 ──────────────────────────────────────────────
  const { data: orders = [], isLoading } = useQuery<DispatchOrder[]>({
    queryKey: ["dispatch-orders"],
    queryFn: () => apiFetch("/dispatch-orders"),
    refetchInterval: 30_000,
  });

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ["drivers-available"],
    queryFn: () => apiFetch("/drivers?status=available"),
  });

  // GPS 位置（若後端有提供）
  const { data: driverPositions = [] } = useQuery<DriverPosition[]>({
    queryKey: ["driver-positions"],
    queryFn: () => apiFetch("/drivers/positions").catch(() => []),
    refetchInterval: 15_000,
  });

  // ── 篩選 ──────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (
      searchText &&
      !o.title.includes(searchText) &&
      !o.fleet_name.includes(searchText)
    )
      return false;
    return true;
  });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  // ── 地圖資料 ──────────────────────────────────────────────
  const mapRoutes: RoutePoint[] = (
    selectedOrder ? selectedOrder.routes : orders.flatMap((o) => o.routes)
  )
    .filter((r) => r.pickup_lat && r.pickup_lng)
    .map((r) => ({
      routeLabel: r.route_label,
      routeDate: r.route_date,
      driverName: r.assigned_driver_name,
      pickup: r.pickup_lat
        ? { lat: r.pickup_lat, lng: r.pickup_lng!, address: r.pickup_address ?? "" }
        : undefined,
      delivery: r.delivery_lat
        ? { lat: r.delivery_lat, lng: r.delivery_lng!, address: r.delivery_address ?? "" }
        : undefined,
    }));

  // ── Mutations ─────────────────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: ({
      dispatchId,
      routeItemId,
      driverId,
      driverName,
    }: {
      dispatchId: number;
      routeItemId: number;
      driverId: number;
      driverName: string;
    }) =>
      apiFetch(`/dispatch-orders/${dispatchId}/routes/${routeItemId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      toast({ title: "✅ 司機已指派" });
      setAssignDialogOpen(false);
      setBatchSelected(new Set());
    },
    onError: (e: Error) => toast({ title: "❌ 指派失敗", description: e.message, variant: "destructive" }),
  });

  const batchAssignMutation = useMutation({
    mutationFn: async ({
      routeIds,
      driverId,
      driverName,
    }: {
      routeIds: { dispatchId: number; routeItemId: number }[];
      driverId: number;
      driverName: string;
    }) => {
      for (const { dispatchId, routeItemId } of routeIds) {
        await apiFetch(`/dispatch-orders/${dispatchId}/routes/${routeItemId}/assign`, {
          method: "PUT",
          body: JSON.stringify({ driver_id: driverId, driver_name: driverName }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      toast({ title: `✅ 批次指派完成，共 ${batchSelected.size} 筆` });
      setAssignDialogOpen(false);
      setBatchSelected(new Set());
      setBatchMode(false);
    },
    onError: (e: Error) => toast({ title: "❌ 批次指派失敗", description: e.message, variant: "destructive" }),
  });

  const handleAssignConfirm = useCallback(() => {
    const driver = drivers.find((d) => String(d.id) === selectedDriverId);
    if (!driver) return;

    if (batchMode && batchSelected.size > 0) {
      // 收集所有選中路線的 dispatchId
      const routeIds: { dispatchId: number; routeItemId: number }[] = [];
      orders.forEach((o) => {
        o.routes.forEach((r) => {
          if (batchSelected.has(r.id)) {
            routeIds.push({ dispatchId: o.id, routeItemId: r.id });
          }
        });
      });
      batchAssignMutation.mutate({ routeIds, driverId: driver.id, driverName: driver.name });
    } else if (assigningRouteId && assigningDispatchId) {
      assignMutation.mutate({
        dispatchId: assigningDispatchId,
        routeItemId: assigningRouteId,
        driverId: driver.id,
        driverName: driver.name,
      });
    }
  }, [selectedDriverId, drivers, batchMode, batchSelected, assigningRouteId, assigningDispatchId]);

  // ── UI ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 頁頭 */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">🗺️ 調度中心</h1>
          <p className="text-xs text-slate-400 mt-0.5">視覺化派車 · 即時追蹤 · 批次指派</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={batchMode ? "default" : "outline"}
            size="sm"
            onClick={() => { setBatchMode(!batchMode); setBatchSelected(new Set()); }}
          >
            {batchMode ? "✔ 批次模式 ON" : "批次指派"}
          </Button>
          {batchMode && batchSelected.size > 0 && (
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => { setAssigningRouteId(null); setAssigningDispatchId(null); setSelectedDriverId(""); setAssignDialogOpen(true); }}
            >
              指派 {batchSelected.size} 筆路線
            </Button>
          )}
        </div>
      </div>

      {/* 主體：左地圖 + 右列表 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左：地圖 */}
        <div className="flex-1 relative">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              地圖載入中…
            </div>
          }>
            <DispatchMap
              routes={mapRoutes}
              drivers={driverPositions}
              height="100%"
            />
          </Suspense>

          {/* 地圖圖例 */}
          <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-xl shadow-lg px-4 py-3 text-xs space-y-1.5 border border-slate-200">
            <div className="font-bold text-slate-600 mb-1">圖例</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-blue-500 inline-block" /> 取貨點</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-emerald-500 inline-block" /> 送貨點</div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-amber-500 inline-block" /> 司機位置</div>
          </div>
        </div>

        {/* 右：派車單列表 */}
        <div className="w-96 flex flex-col bg-white border-l border-slate-200 overflow-hidden">
          {/* 篩選器 */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <Input
              placeholder="搜尋車隊/標題…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 text-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="sent">已發送</SelectItem>
                <SelectItem value="acknowledged">已確認</SelectItem>
                <SelectItem value="assigned">已指派</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-slate-400 text-sm">載入中…</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <div className="text-3xl mb-2">📭</div>
                <div className="text-sm">沒有符合條件的派車單</div>
              </div>
            )}
            {filtered.map((order) => (
              <div
                key={order.id}
                className={`border-b border-slate-100 cursor-pointer transition-colors ${
                  selectedOrderId === order.id ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
                onClick={() =>
                  setSelectedOrderId(selectedOrderId === order.id ? null : order.id)
                }
              >
                {/* 派車單標頭 */}
                <div className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">
                      {order.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{order.fleet_name}</div>
                    {order.week_start && (
                      <div className="text-xs text-slate-400">
                        {order.week_start} ~ {order.week_end}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${STATUS_COLOR[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>

                {/* 路線明細（展開時顯示） */}
                {selectedOrderId === order.id && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {order.routes.map((route) => (
                      <div
                        key={route.id}
                        className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                          batchMode && batchSelected.has(route.id)
                            ? "bg-amber-50 border-amber-300"
                            : "bg-slate-50 border-slate-200"
                        }`}
                        onClick={(e) => {
                          if (batchMode) {
                            e.stopPropagation();
                            setBatchSelected((prev) => {
                              const next = new Set(prev);
                              next.has(route.id) ? next.delete(route.id) : next.add(route.id);
                              return next;
                            });
                          }
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-700 truncate">
                            {batchMode && (
                              <input
                                type="checkbox"
                                className="mr-1.5 accent-amber-500"
                                checked={batchSelected.has(route.id)}
                                readOnly
                              />
                            )}
                            {route.prefix && <span className="text-slate-400 mr-1">{route.prefix}</span>}
                            {route.route_label}
                          </div>
                          {route.route_date && (
                            <span className="text-slate-400 whitespace-nowrap">{route.route_date}</span>
                          )}
                        </div>

                        {route.assigned_driver_name ? (
                          <div className="mt-1 flex items-center gap-1 text-emerald-700">
                            <span>🚛</span>
                            <span className="font-medium">{route.assigned_driver_name}</span>
                          </div>
                        ) : (
                          <div className="mt-1.5">
                            <button
                              className="text-blue-600 hover:text-blue-800 font-medium text-xs underline underline-offset-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssigningRouteId(route.id);
                                setAssigningDispatchId(order.id);
                                setSelectedDriverId("");
                                setAssignDialogOpen(true);
                              }}
                            >
                              ＋ 指派司機
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 指派進度 */}
                    <div className="text-xs text-slate-400 pt-1 text-right">
                      已指派 {order.routes.filter((r) => r.assigned_driver_name).length} /
                      {order.routes.length} 路線
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 指派司機 Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {batchMode && batchSelected.size > 0
                ? `批次指派 ${batchSelected.size} 筆路線`
                : "指派司機"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              選擇司機
            </label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="請選擇司機…" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    <span className="font-medium">{d.name}</span>
                    {d.vehicle_type && (
                      <span className="text-slate-400 ml-2 text-xs">{d.vehicle_type}</span>
                    )}
                    {d.vehicle_plate && (
                      <span className="text-slate-400 ml-1 text-xs">({d.vehicle_plate})</span>
                    )}
                  </SelectItem>
                ))}
                {drivers.length === 0 && (
                  <SelectItem value="__none" disabled>
                    目前無可用司機
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!selectedDriverId || assignMutation.isPending || batchAssignMutation.isPending}
              onClick={handleAssignConfirm}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {assignMutation.isPending || batchAssignMutation.isPending ? "處理中…" : "確認指派"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
