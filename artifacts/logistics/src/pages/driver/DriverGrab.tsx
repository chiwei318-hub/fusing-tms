import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { format, parseISO, isValid, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Zap, Package, Clock, Truck, MapPin, RefreshCw, AlertCircle,
  CheckCircle, ChevronLeft, Phone, DollarSign, User,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDriversData } from "@/hooks/use-drivers";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface GrabOrder {
  id: number;
  pickup_address: string;
  delivery_address: string;
  cargo_description: string;
  customer_name: string;
  customer_phone?: string;
  total_fee?: number;
  suggested_price?: number;
  pickup_time?: string;
  required_vehicle_type?: string;
  distance_km?: number;
  created_at: string;
  notes?: string;
}

function relativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhTW });
  } catch { return ""; }
}

function pickupLabel(order: GrabOrder): string {
  if (!order.pickup_time) return "即時";
  try {
    const d = new Date(order.pickup_time);
    if (!isValid(d)) return order.pickup_time;
    return format(d, "MM/dd HH:mm", { locale: zhTW });
  } catch { return order.pickup_time; }
}

export default function DriverGrab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: drivers } = useDriversData();
  const selectedDriver = drivers?.find(d => d.id === user?.id);

  const [orders, setOrders] = useState<GrabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [grabbingId, setGrabbingId] = useState<number | null>(null);
  const [takenIds, setTakenIds] = useState<Set<number>>(new Set());

  const fetchPool = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`${BASE}/api/orders/grab-pool`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setOrders(data.orders ?? []);
      setFetchedAt(data.fetchedAt ?? new Date().toISOString());
      setTakenIds(prev => {
        const stillExist = new Set((data.orders ?? []).map((o: GrabOrder) => o.id));
        const next = new Set<number>();
        for (const id of prev) if (stillExist.has(id)) next.add(id);
        return next;
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPool();
    const iv = setInterval(() => fetchPool(true), 15000);
    return () => clearInterval(iv);
  }, [fetchPool]);

  const handleGrab = async (orderId: number) => {
    if (!user?.id || grabbingId != null) return;
    setGrabbingId(orderId);
    try {
      const res = await fetch(`${BASE}/api/orders/${orderId}/grab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: user.id }),
      });
      if (res.status === 409) {
        setTakenIds(prev => new Set(prev).add(orderId));
        toast({ title: "此訂單已被其他司機搶走", description: "繼續等候下一筆訂單", variant: "destructive" });
        fetchPool(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "搶單失敗");
      }
      toast({ title: "🎉 搶單成功！", description: "訂單已指派給您，請立即前往取貨" });
      navigate(`/driver/tasks/${orderId}`);
    } catch (err: any) {
      if (!takenIds.has(orderId)) {
        toast({ title: "無法搶單", description: err?.message ?? "請稍後再試", variant: "destructive" });
      }
      fetchPool(true);
    } finally {
      setGrabbingId(null);
    }
  };

  const isVehicleMatch = (required?: string | null) => {
    if (!required || !selectedDriver?.vehicleType) return true;
    return selectedDriver.vehicleType === required;
  };

  const pending = orders.filter(o => !takenIds.has(o.id));

  if (!user?.id) {
    return (
      <div className="text-center py-20">
        <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="font-bold text-lg">請先登入</p>
        <Link href="/driver"><div className="mt-4 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold">返回首頁</div></Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" /> 搶單中心
          </h1>
          {selectedDriver && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {selectedDriver.name} · {selectedDriver.vehicleType}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchPool()}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* Live status bar */}
      <div className="flex items-center gap-2 text-xs text-green-700 font-medium bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span>
          每 15 秒自動更新 · {loading ? "載入中…" : (
            pending.length > 0
              ? <><strong>{pending.length} 筆</strong> 待接訂單</>
              : "目前無待接訂單"
          )}
        </span>
        {fetchedAt && <span className="ml-auto text-green-500">{relativeTime(fetchedAt)}</span>}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Truck className="w-8 h-8 text-green-300" />
          </div>
          <p className="font-bold text-foreground">目前無待接訂單</p>
          <p className="text-sm text-muted-foreground mt-1">有新訂單時將在 15 秒內自動出現</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(order => {
            const matched = isVehicleMatch(order.required_vehicle_type);
            const fee = order.total_fee ?? order.suggested_price;
            const isGrabbing = grabbingId === order.id;

            return (
              <div key={order.id} className={`rounded-2xl overflow-hidden shadow-md transition-all ${
                matched ? "shadow-green-200 border border-green-100" : "opacity-60 border border-gray-200"
              }`}>
                {/* LINE-style green header */}
                <div style={{
                  background: matched
                    ? "linear-gradient(135deg, #16a34a, #15803d)"
                    : "#94a3b8",
                  padding: "12px 16px",
                }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ color: "#fff", fontWeight: 900, fontSize: 15, margin: 0 }}>
                        🔥 搶單機會！
                      </p>
                      <p style={{ color: "#bbf7d0", fontSize: 12, margin: "2px 0 0" }}>
                        訂單 #{order.id} — 先搶先得
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {fee != null ? (
                        <>
                          <p style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>
                            NT${fee.toLocaleString()}
                          </p>
                          <p style={{ color: "#bbf7d0", fontSize: 11, margin: 0 }}>預估報酬</p>
                        </>
                      ) : (
                        <p style={{ color: "#bbf7d0", fontWeight: 700, fontSize: 13 }}>報酬洽談</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div style={{ background: "#fff", padding: "14px 16px" }}>
                  {/* Info rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {[
                      { icon: Package, label: "貨物", value: order.cargo_description || "—" },
                      { icon: MapPin, label: "取貨", value: order.pickup_address },
                      { icon: MapPin, label: "送達", value: order.delivery_address },
                      { icon: Clock, label: "時間", value: pickupLabel(order) },
                      ...(order.distance_km ? [{ icon: Truck, label: "里程", value: `約 ${order.distance_km.toFixed(1)} km` }] : []),
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 12, color: "#64748b", minWidth: 40, flexShrink: 0, paddingTop: 1 }}>{label}</span>
                        <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, flex: 1 }}>{value}</span>
                      </div>
                    ))}
                    {order.required_vehicle_type && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#64748b", minWidth: 40 }}>車型</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: matched ? "#dcfce7" : "#fee2e2",
                          color: matched ? "#15803d" : "#dc2626",
                        }}>
                          {order.required_vehicle_type}{!matched && " ⚠ 不符"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Buttons */}
                  {!matched ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#dc2626", background: "#fef2f2", borderRadius: 10, padding: "10px 12px" }}>
                      <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                      此訂單需要「{order.required_vehicle_type}」，您的車型不符合
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleGrab(order.id)}
                        disabled={grabbingId != null}
                        style={{
                          flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                          background: isGrabbing ? "#4ade80" : "#16a34a",
                          color: "#fff", fontWeight: 900, fontSize: 15, cursor: grabbingId != null ? "not-allowed" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                          transition: "background 0.15s",
                        }}
                      >
                        {isGrabbing ? (
                          <><RefreshCw style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 搶單中…</>
                        ) : (
                          <><CheckCircle style={{ width: 18, height: 18 }} /> 我要接單</>
                        )}
                      </button>
                      <Link href={`/driver/tasks/${order.id}`}>
                        <button style={{
                          padding: "12px 16px", borderRadius: 12, border: "1px solid #e2e8f0",
                          background: "#f8fafc", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer",
                        }}>
                          查詢…
                        </button>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Footer: posted time */}
                <div style={{ background: "#f8fafc", padding: "6px 16px", fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
                  {relativeTime(order.created_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
