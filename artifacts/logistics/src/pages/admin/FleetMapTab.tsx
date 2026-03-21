import "leaflet/dist/leaflet.css";
import { useMemo, useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Truck, Phone, Package, Clock, Signal, SignalZero, RefreshCw,
  Navigation, CheckCircle, Circle, AlertCircle, Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDriversData } from "@/hooks/use-drivers";
import { useOrdersData } from "@/hooks/use-orders";
import type { Driver, Order } from "@workspace/api-client-react";

// Fix leaflet default icon issue in bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── Taiwan city anchors ────────────────────────────────────────────────────
const CITY_ANCHORS = [
  { lat: 25.046, lng: 121.517, name: "台北" },
  { lat: 25.010, lng: 121.467, name: "新北" },
  { lat: 24.993, lng: 121.301, name: "桃園" },
  { lat: 24.803, lng: 120.971, name: "新竹" },
  { lat: 24.147, lng: 120.674, name: "台中" },
  { lat: 23.801, lng: 120.448, name: "彰化" },
  { lat: 23.480, lng: 120.449, name: "雲林" },
  { lat: 23.480, lng: 120.449, name: "嘉義" },
  { lat: 22.990, lng: 120.202, name: "台南" },
  { lat: 22.624, lng: 120.302, name: "高雄" },
  { lat: 22.670, lng: 120.480, name: "屏東" },
  { lat: 24.697, lng: 121.773, name: "宜蘭" },
  { lat: 23.990, lng: 121.602, name: "花蓮" },
  { lat: 22.755, lng: 121.144, name: "台東" },
];

// Deterministic pseudo-random from driver id
function pseudoRand(seed: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function getDriverPosition(driver: Driver): [number, number] {
  const anchorIdx = driver.id % CITY_ANCHORS.length;
  const anchor = CITY_ANCHORS[anchorIdx];
  // Small jitter within ~5 km
  const latJitter = (pseudoRand(driver.id, 1) - 0.5) * 0.08;
  const lngJitter = (pseudoRand(driver.id, 2) - 0.5) * 0.08;
  return [anchor.lat + latJitter, anchor.lng + lngJitter];
}

function getCityForDriver(driver: Driver): string {
  return CITY_ANCHORS[driver.id % CITY_ANCHORS.length].name;
}

// ─── Custom marker icons ────────────────────────────────────────────────────
function createDriverIcon(status: string): L.DivIcon {
  const colors: Record<string, string> = {
    available: "#16a34a",
    busy: "#F97316",
    offline: "#94a3b8",
  };
  const color = colors[status] ?? "#94a3b8";
  const pulse = status === "busy" ? `
    <div style="position:absolute;top:-4px;left:-4px;width:44px;height:44px;border-radius:50%;
      border:2px solid ${color};opacity:0.4;animation:pulse-ring 1.5s ease-out infinite;"></div>
  ` : "";

  return L.divIcon({
    className: "",
    html: `
      <style>
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      </style>
      <div style="position:relative;width:36px;height:36px;">
        ${pulse}
        <div style="
          width:36px;height:36px;border-radius:50%;
          background:${color};border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          position:relative;z-index:1;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3"/>
            <rect x="9" y="11" width="14" height="10" rx="2"/>
            <circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// ─── Status helpers ─────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  available: "空車待命",
  busy: "運送中",
  offline: "離線",
};
const STATUS_COLOR: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  busy: "bg-orange-100 text-orange-800 border-orange-200",
  offline: "bg-slate-100 text-slate-500 border-slate-200",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-green-500",
  busy: "bg-orange-500",
  offline: "bg-slate-400",
};

function estimateETA(order: Order): string {
  if (!order.createdAt) return "未知";
  const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  const totalMins = 45 + (order.id % 30);
  const remaining = Math.max(0, Math.round(totalMins - elapsed));
  if (remaining === 0) return "即將到達";
  return `約 ${remaining} 分鐘`;
}

// ─── Auto-fit map to all markers ────────────────────────────────────────────
function MapFitter({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      fitted.current = true;
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);
  return null;
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function FleetMapTab() {
  const { data: drivers = [], refetch: refetchDrivers } = useDriversData();
  const { data: orders = [], refetch: refetchOrders } = useOrdersData();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const markerRefs = useRef<Record<number, L.Marker>>({});

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(() => {
      refetchDrivers();
      refetchOrders();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(t);
  }, [refetchDrivers, refetchOrders]);

  const handleRefresh = () => {
    refetchDrivers();
    refetchOrders();
    setLastRefresh(new Date());
  };

  // Map driver → active order
  const driverOrderMap = useMemo(() => {
    const map: Record<number, Order> = {};
    for (const o of orders as Order[]) {
      if (o.driverId && (o.status === "assigned" || o.status === "in_transit")) {
        map[o.driverId] = o;
      }
    }
    return map;
  }, [orders]);

  const filteredDrivers = useMemo(() => {
    return (drivers as Driver[]).filter(d =>
      statusFilter === "all" || d.status === statusFilter
    );
  }, [drivers, statusFilter]);

  const positions: [number, number][] = useMemo(
    () => (drivers as Driver[]).map(d => getDriverPosition(d)),
    [drivers]
  );

  const stats = useMemo(() => ({
    total: (drivers as Driver[]).length,
    available: (drivers as Driver[]).filter(d => d.status === "available").length,
    busy: (drivers as Driver[]).filter(d => d.status === "busy").length,
    offline: (drivers as Driver[]).filter(d => d.status === "offline").length,
  }), [drivers]);

  function openMarkerPopup(driverId: number) {
    setSelectedDriverId(driverId);
    const m = markerRefs.current[driverId];
    if (m) m.openPopup();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2">
            <Navigation className="w-5 h-5" /> 車隊即時地圖
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            最後更新：{lastRefresh.toLocaleTimeString("zh-TW")}・每 30 秒自動更新
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部司機</SelectItem>
              <SelectItem value="available">空車待命</SelectItem>
              <SelectItem value="busy">運送中</SelectItem>
              <SelectItem value="offline">離線</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1 text-xs">
            <RefreshCw className="w-3 h-3" /> 刷新
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "全部", value: stats.total, icon: Truck, color: "text-primary", bg: "bg-primary/10" },
          { label: "空車待命", value: stats.available, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
          { label: "運送中", value: stats.busy, icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-50" },
          { label: "離線", value: stats.offline, icon: SignalZero, color: "text-slate-400", bg: "bg-slate-50" },
        ].map(s => (
          <Card key={s.label} className="border shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`${s.bg} p-1.5 rounded-lg shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div>
                <div className="text-lg font-black leading-none">{s.value}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Map + Sidebar */}
      <div className="flex gap-3 h-[560px]">
        {/* Leaflet Map */}
        <div className="flex-1 rounded-xl overflow-hidden border shadow-sm">
          <MapContainer
            center={[23.9, 120.9]}
            zoom={7}
            style={{ width: "100%", height: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFitter positions={positions} />
            {(drivers as Driver[]).map(driver => {
              const pos = getDriverPosition(driver);
              const activeOrder = driverOrderMap[driver.id];
              const icon = createDriverIcon(driver.status ?? "offline");
              return (
                <Marker
                  key={driver.id}
                  position={pos}
                  icon={icon}
                  ref={(m) => { if (m) markerRefs.current[driver.id] = m; }}
                  eventHandlers={{ click: () => setSelectedDriverId(driver.id) }}
                >
                  <Popup minWidth={240}>
                    <div className="text-sm space-y-2 py-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-base">{driver.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[driver.status ?? "offline"]}`}>
                          {STATUS_LABEL[driver.status ?? "offline"]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Truck className="w-3 h-3 shrink-0" />
                          <span className="font-mono font-bold uppercase">{driver.licensePlate}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{driver.phone}</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <Package className="w-3 h-3 shrink-0" />
                          <span>{driver.vehicleType}</span>
                        </div>
                      </div>
                      {activeOrder ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-1">
                          <div className="text-xs font-bold text-orange-700 flex items-center gap-1">
                            <Package className="w-3 h-3" /> 訂單 #{activeOrder.id}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            📍 {activeOrder.pickupAddress?.slice(0, 18)}…
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            🏁 {activeOrder.deliveryAddress?.slice(0, 18)}…
                          </div>
                          <div className="flex items-center gap-1 text-xs text-orange-600 font-semibold">
                            <Clock className="w-3 h-3" /> 預估到達：{estimateETA(activeOrder)}
                          </div>
                        </div>
                      ) : driver.status === "available" ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700 font-medium">
                          ✅ 空車待命，可接新訂單
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-500">
                          離線中
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Signal className="w-3 h-3" /> {getCityForDriver(driver)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Driver sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            司機列表 ({filteredDrivers.length})
          </div>
          {filteredDrivers.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">
              無符合條件的司機
            </div>
          )}
          {filteredDrivers.map(driver => {
            const activeOrder = driverOrderMap[driver.id];
            const isSelected = selectedDriverId === driver.id;
            return (
              <button
                key={driver.id}
                onClick={() => openMarkerPopup(driver.id)}
                className={`w-full text-left rounded-xl border p-3 transition-all shadow-sm hover:shadow-md ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[driver.status ?? "offline"]}`} />
                  <span className="font-bold text-sm truncate">{driver.name}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded uppercase">{driver.licensePlate}</span>
                  <span className="truncate">{driver.vehicleType}</span>
                </div>
                {activeOrder ? (
                  <div className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    訂單 #{activeOrder.id}・{estimateETA(activeOrder)}
                  </div>
                ) : (
                  <div className={`text-xs mt-1 ${
                    driver.status === "available" ? "text-green-600" : "text-slate-400"
                  }`}>
                    {STATUS_LABEL[driver.status ?? "offline"]}・{getCityForDriver(driver)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> 空車待命
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> 運送中（含脈衝動畫）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" /> 離線
        </span>
        <span className="ml-auto text-[10px]">位置為模擬資料，實際導入 GPS 後自動同步</span>
      </div>
    </div>
  );
}
