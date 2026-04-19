import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, OverlayView } from "@react-google-maps/api";
import {
  Truck, Phone, Package, Clock, Signal, SignalZero, RefreshCw,
  Navigation, CheckCircle, AlertCircle, Filter, MapPin, Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDriversData } from "@/hooks/use-drivers";
import { useOrdersData } from "@/hooks/use-orders";
import type { Driver, Order } from "@workspace/api-client-react";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// ─── Taiwan city anchors (fallback simulated positions) ─────────────────────
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

function pseudoRand(seed: number, offset = 0): number {
  const x = Math.sin(seed * 9301 + offset * 49297 + 233) * 10000;
  return x - Math.floor(x);
}

function getDriverPosition(driver: Driver): google.maps.LatLngLiteral {
  const anchorIdx = driver.id % CITY_ANCHORS.length;
  const anchor = CITY_ANCHORS[anchorIdx];
  const latJitter = (pseudoRand(driver.id, 1) - 0.5) * 0.08;
  const lngJitter = (pseudoRand(driver.id, 2) - 0.5) * 0.08;
  return { lat: anchor.lat + latJitter, lng: anchor.lng + lngJitter };
}

function getCityForDriver(driver: Driver): string {
  return CITY_ANCHORS[driver.id % CITY_ANCHORS.length].name;
}

// ─── Status config ───────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  available: "空車待命",
  busy: "運送中",
  offline: "離線",
  on_leave: "休假中",
};
const STATUS_COLOR: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  busy: "bg-orange-100 text-orange-800 border-orange-200",
  offline: "bg-slate-100 text-slate-500 border-slate-200",
  on_leave: "bg-purple-100 text-purple-800 border-purple-200",
};
const STATUS_DOT: Record<string, string> = {
  available: "bg-green-500",
  busy: "bg-orange-500",
  offline: "bg-slate-400",
  on_leave: "bg-purple-400",
};
const STATUS_MARKER_COLOR: Record<string, string> = {
  available: "#16a34a",
  busy: "#F97316",
  offline: "#94a3b8",
  on_leave: "#a855f7",
};

function estimateETA(order: Order): string {
  if (!order.createdAt) return "未知";
  const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  const totalMins = 45 + (order.id % 30);
  const remaining = Math.max(0, Math.round(totalMins - elapsed));
  if (remaining === 0) return "即將到達";
  return `約 ${remaining} 分鐘`;
}

// ─── Custom SVG marker icon ──────────────────────────────────────────────────
function makeMarkerIcon(status: string): google.maps.Icon {
  const color = STATUS_MARKER_COLOR[status] ?? "#94a3b8";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="17" fill="${color}" stroke="white" stroke-width="3"
        style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"/>
      <g transform="translate(11,11)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M1 10H0a1 1 0 01-1-1V2A1 1 0 010 1h8a1 1 0 011 1v2"/>
        <rect x="5" y="6" width="10" height="7" rx="1.5"/>
        <circle cx="7" cy="13" r="1"/><circle cx="13" cy="13" r="1"/>
      </g>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(40, 40),
    anchor: new google.maps.Point(20, 20),
  };
}

// ─── Map style: clean light ──────────────────────────────────────────────────
const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfdbfe" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fcd34d" }] },
];

const MAP_STYLE_SATELLITE: google.maps.MapTypeStyle[] = [];

const MAP_OPTIONS_BASE: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  gestureHandling: "greedy",
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function FleetMapTab() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: "zh-TW",
    region: "TW",
  });

  const { data: drivers = [], refetch: refetchDrivers } = useDriversData();
  const { data: orders = [], refetch: refetchOrders } = useOrdersData();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const mapRef = useRef<google.maps.Map | null>(null);

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

  const driverOrderMap = useMemo(() => {
    const map: Record<number, Order> = {};
    for (const o of orders as Order[]) {
      if (o.driverId && (o.status === "assigned" || o.status === "in_transit")) {
        map[o.driverId] = o;
      }
    }
    return map;
  }, [orders]);

  const filteredDrivers = useMemo(() =>
    (drivers as Driver[]).filter(d => statusFilter === "all" || d.status === statusFilter),
    [drivers, statusFilter]
  );

  const stats = useMemo(() => ({
    total: (drivers as Driver[]).length,
    available: (drivers as Driver[]).filter(d => d.status === "available").length,
    busy: (drivers as Driver[]).filter(d => d.status === "busy").length,
    offline: (drivers as Driver[]).filter(d => d.status === "offline").length,
  }), [drivers]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Fit to Taiwan
    const bounds = new google.maps.LatLngBounds();
    (drivers as Driver[]).forEach(d => bounds.extend(getDriverPosition(d)));
    if ((drivers as Driver[]).length > 0) map.fitBounds(bounds, 60);
    else map.setCenter({ lat: 23.9, lng: 120.9 });
  }, [drivers]);

  const selectedDriver = useMemo(() =>
    selectedDriverId ? (drivers as Driver[]).find(d => d.id === selectedDriverId) ?? null : null,
    [drivers, selectedDriverId]
  );

  const focusDriver = (driver: Driver) => {
    setSelectedDriverId(driver.id);
    if (mapRef.current) {
      mapRef.current.panTo(getDriverPosition(driver));
      mapRef.current.setZoom(14);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64 rounded-xl border bg-red-50 text-red-600 text-sm gap-2">
        <AlertCircle className="w-5 h-5" />
        Google Maps 載入失敗：{loadError.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2">
            <Navigation className="w-5 h-5" /> 車隊即時地圖
            <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">Google Maps</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            最後更新：{lastRefresh.toLocaleTimeString("zh-TW")}・每 30 秒自動更新
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className={`h-8 gap-1 text-xs ${mapType === "satellite" ? "bg-slate-800 text-white border-slate-700" : ""}`}
            onClick={() => setMapType(v => v === "roadmap" ? "satellite" : "roadmap")}
          >
            <Layers className="w-3 h-3" /> {mapType === "roadmap" ? "衛星圖" : "道路圖"}
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <Filter className="w-3 h-3 mr-1" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部司機</SelectItem>
              <SelectItem value="available">空車待命</SelectItem>
              <SelectItem value="busy">運送中</SelectItem>
              <SelectItem value="offline">離線</SelectItem>
              <SelectItem value="on_leave">休假中</SelectItem>
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
        {/* Google Map */}
        <div className="flex-1 rounded-xl overflow-hidden border shadow-sm">
          {!isLoaded ? (
            <div className="w-full h-full flex items-center justify-center bg-muted/30">
              <div className="text-center space-y-2">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">載入 Google Maps 中...</p>
              </div>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={{ lat: 23.9, lng: 120.9 }}
              zoom={7}
              options={{
                ...MAP_OPTIONS_BASE,
                mapTypeId: mapType,
                styles: mapType === "roadmap" ? MAP_STYLE : MAP_STYLE_SATELLITE,
              }}
              onLoad={onMapLoad}
            >
              {filteredDrivers.map(driver => {
                const pos = getDriverPosition(driver);
                const activeOrder = driverOrderMap[driver.id];
                return (
                  <Marker
                    key={driver.id}
                    position={pos}
                    icon={makeMarkerIcon(driver.status ?? "offline")}
                    title={driver.name ?? ""}
                    onClick={() => setSelectedDriverId(driver.id)}
                    zIndex={driver.status === "busy" ? 10 : driver.status === "available" ? 5 : 1}
                  />
                );
              })}

              {/* InfoWindow for selected driver */}
              {selectedDriver && (() => {
                const pos = getDriverPosition(selectedDriver);
                const activeOrder = driverOrderMap[selectedDriver.id];
                return (
                  <InfoWindow
                    position={pos}
                    onCloseClick={() => setSelectedDriverId(null)}
                    options={{ pixelOffset: new google.maps.Size(0, -24) }}
                  >
                    <div className="text-sm space-y-2 min-w-[220px] py-1 font-sans">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-base text-gray-900">{selectedDriver.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLOR[selectedDriver.status ?? "offline"]}`}>
                          {STATUS_LABEL[selectedDriver.status ?? "offline"]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <Truck className="w-3 h-3 shrink-0 text-gray-400" />
                          <span className="font-mono font-bold uppercase">{selectedDriver.licensePlate}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0 text-gray-400" />
                          <span>{selectedDriver.phone}</span>
                        </div>
                        <div className="col-span-2 flex items-center gap-1">
                          <Package className="w-3 h-3 shrink-0 text-gray-400" />
                          <span>{selectedDriver.vehicleType}</span>
                        </div>
                      </div>
                      {activeOrder ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-1">
                          <div className="text-xs font-bold text-orange-700 flex items-center gap-1">
                            <Package className="w-3 h-3" /> 訂單 #{activeOrder.id}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            📍 {activeOrder.pickupAddress?.slice(0, 20)}…
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            🏁 {activeOrder.deliveryAddress?.slice(0, 20)}…
                          </div>
                          <div className="flex items-center gap-1 text-xs text-orange-600 font-semibold">
                            <Clock className="w-3 h-3" /> 預估到達：{estimateETA(activeOrder)}
                          </div>
                        </div>
                      ) : selectedDriver.status === "available" ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-700 font-medium">
                          ✅ 空車待命，可接新訂單
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-500">
                          離線中
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Signal className="w-3 h-3" /> {getCityForDriver(selectedDriver)}
                      </div>
                    </div>
                  </InfoWindow>
                );
              })()}
            </GoogleMap>
          )}
        </div>

        {/* Driver sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            司機列表 ({filteredDrivers.length})
          </div>
          {filteredDrivers.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">無符合條件的司機</div>
          )}
          {filteredDrivers.map(driver => {
            const activeOrder = driverOrderMap[driver.id];
            const isSelected = selectedDriverId === driver.id;
            return (
              <button
                key={driver.id}
                onClick={() => focusDriver(driver)}
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
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> 運送中
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" /> 離線
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-400 inline-block" /> 休假中
        </span>
        <span className="ml-auto text-[10px] flex items-center gap-1">
          <MapPin className="w-3 h-3" /> 位置為模擬資料，實際導入 GPS 後自動同步
        </span>
      </div>
    </div>
  );
}
