import { useState, useEffect, useCallback } from "react";
import { Phone, MapPin, Package, Truck, CheckCircle, Clock, RefreshCw, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type TrackingOrder = {
  id: number;
  pickup_address: string;
  delivery_address: string;
  status: string;
  cargo_description: string;
  total_fee: number;
  pickup_date: string;
  pickup_time: string;
  updated_at: string;
  customer_name: string;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  license_plate: string | null;
  vehicle_type: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  last_location_at: string | null;
  current_location: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<any>; color: string; bg: string }> = {
  assigned: { label: "已派車", icon: Truck, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
  in_transit: { label: "配送中", icon: Navigation, color: "text-orange-600", bg: "bg-orange-50 border-orange-100" },
};

function StatusStep({ status }: { status: string }) {
  const steps = [
    { key: "pending", label: "待派車" },
    { key: "assigned", label: "已派車" },
    { key: "in_transit", label: "配送中" },
    { key: "delivered", label: "已送達" },
  ];
  const currentIdx = steps.findIndex(s => s.key === status);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => (
        <div key={step.key} className="flex items-center">
          <div className={`flex flex-col items-center`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
              ${idx < currentIdx ? "bg-green-500 border-green-500 text-white"
              : idx === currentIdx ? "bg-blue-500 border-blue-500 text-white"
              : "bg-white border-gray-200 text-gray-400"}`}>
              {idx < currentIdx ? <CheckCircle className="w-3 h-3" /> : idx + 1}
            </div>
            <p className={`text-[10px] mt-1 font-medium whitespace-nowrap
              ${idx <= currentIdx ? "text-gray-700" : "text-gray-300"}`}>
              {step.label}
            </p>
          </div>
          {idx < steps.length - 1 && (
            <div className={`h-0.5 w-8 mx-1 mb-4 rounded transition-all ${idx < currentIdx ? "bg-green-400" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: TrackingOrder }) {
  const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, icon: Package, color: "text-gray-600", bg: "bg-gray-50 border-gray-100" };
  const StatusIcon = cfg.icon;
  const locationAge = order.last_location_at
    ? Math.round((Date.now() - new Date(order.last_location_at).getTime()) / 60000)
    : null;
  const mapsUrl = order.driver_lat && order.driver_lng
    ? `https://www.google.com/maps?q=${order.driver_lat},${order.driver_lng}`
    : null;

  return (
    <Card className={`border ${cfg.bg}`}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${cfg.bg}`}>
              <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
            </div>
            <div>
              <p className="font-bold text-gray-900">訂單 #{order.id}</p>
              <Badge className={`text-xs ${cfg.color} bg-transparent border-current`}>{cfg.label}</Badge>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            更新 {new Date(order.updated_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <StatusStep status={order.status} />
        </div>

        {/* Route */}
        <div className="space-y-2 mb-4">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">取貨地</p>
              <p className="text-sm text-gray-700">{order.pickup_address}</p>
            </div>
          </div>
          <div className="ml-1 w-0.5 h-4 bg-gray-200 ml-[3px]" />
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400">送達地</p>
              <p className="text-sm text-gray-700">{order.delivery_address}</p>
            </div>
          </div>
        </div>

        {/* Driver Info */}
        {order.driver_name && (
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-400 mb-2 font-medium">司機資訊</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{order.driver_name}</p>
                <p className="text-xs text-gray-500">{order.vehicle_type} · {order.license_plate}</p>
                {order.current_location && (
                  <p className="text-xs text-blue-600 mt-1">📍 {order.current_location}</p>
                )}
                {locationAge !== null && (
                  <p className="text-xs text-gray-400">
                    位置更新於 {locationAge < 1 ? "剛剛" : `${locationAge} 分鐘前`}
                    {locationAge > 15 && " ⚠️"}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {order.driver_phone && (
                  <a href={`tel:${order.driver_phone}`}>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                      <Phone className="w-3 h-3" /> 撥話
                    </Button>
                  </a>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-blue-600">
                      <MapPin className="w-3 h-3" /> 定位
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cargo */}
        {order.cargo_description && (
          <div className="flex items-center gap-2 mt-3">
            <Package className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-xs text-gray-500">{order.cargo_description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EnterpriseTracking({ session }: { session: EnterpriseSession }) {
  const [orders, setOrders] = useState<TrackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchTracking = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/tracking`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch {}
    setLoading(false);
    setLastRefresh(new Date());
  }, [session.id]);

  useEffect(() => {
    fetchTracking();
    const timer = setInterval(fetchTracking, 30000);
    return () => clearInterval(timer);
  }, [fetchTracking]);

  const inTransit = orders.filter(o => o.status === "in_transit");
  const assigned = orders.filter(o => o.status === "assigned");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0d2d6e] to-[#1a3a8f] rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black">即時追蹤</h1>
            <p className="text-blue-300 text-sm mt-0.5">每 30 秒自動更新 · {session.companyName}</p>
          </div>
          <Button
            size="sm" variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={() => { setLoading(true); fetchTracking(); }}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            重整
          </Button>
        </div>
        <div className="flex gap-4 mt-4">
          <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
            <p className="text-2xl font-black">{inTransit.length}</p>
            <p className="text-blue-200 text-xs">配送中</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
            <p className="text-2xl font-black">{assigned.length}</p>
            <p className="text-blue-200 text-xs">已派車</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
            <p className="text-xs text-blue-200">最後更新</p>
            <p className="text-sm font-bold">
              {lastRefresh.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!loading && orders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-medium text-gray-500">目前無進行中的訂單</p>
          <p className="text-sm mt-1">訂單派車後會在此即時顯示</p>
        </div>
      )}

      {/* In Transit (priority) */}
      {inTransit.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            配送中（{inTransit.length}）
          </h2>
          <div className="space-y-4">
            {inTransit.map(o => <OrderCard key={o.id} order={o} />)}
          </div>
        </div>
      )}

      {/* Assigned */}
      {assigned.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            已派車（等待取貨）（{assigned.length}）
          </h2>
          <div className="space-y-4">
            {assigned.map(o => <OrderCard key={o.id} order={o} />)}
          </div>
        </div>
      )}
    </div>
  );
}
