/**
 * DispatchMap.tsx
 * 路徑：artifacts/logistics/src/components/DispatchMap.tsx
 *
 * 用 react-leaflet 顯示：
 *  - 各路線的取貨/送貨地點標記
 *  - 司機即時位置（若有 GPS 資料）
 *  - 點擊標記展示路線資訊
 *
 * 注意：Leaflet 需要在元件外層引入 CSS
 *   在 index.css 或 main.tsx 加入：
 *   import 'leaflet/dist/leaflet.css'
 */

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";

// ── 修正 Leaflet 預設 icon 路徑問題 ──────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── 自訂 Icon ────────────────────────────────────────────────
const makeIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `
      <div style="
        background:${color};
        width:32px;height:32px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
      ">
        <span style="transform:rotate(45deg);font-size:13px;color:white;font-weight:900">
          ${label}
        </span>
      </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -36],
  });

const pickupIcon = makeIcon("#3b82f6", "取");
const deliveryIcon = makeIcon("#10b981", "送");
const driverIcon = makeIcon("#f59e0b", "🚛");

// ── 型別 ────────────────────────────────────────────────────
export interface RoutePoint {
  routeLabel: string;
  routeDate?: string;
  driverName?: string;
  pickup?: { lat: number; lng: number; address: string };
  delivery?: { lat: number; lng: number; address: string };
}

export interface DriverPosition {
  driverId: number;
  driverName: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

interface DispatchMapProps {
  routes?: RoutePoint[];
  drivers?: DriverPosition[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

// ── 自動縮放到所有標記 ───────────────────────────────────────
function AutoFit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48] });
  }, [points.join(",")]); // eslint-disable-line
  return null;
}

// ── 主元件 ──────────────────────────────────────────────────
export function DispatchMap({
  routes = [],
  drivers = [],
  center = [23.6978, 120.9605], // 台灣中心
  zoom = 8,
  height = "100%",
}: DispatchMapProps) {
  const allPoints: [number, number][] = [];

  routes.forEach((r) => {
    if (r.pickup) allPoints.push([r.pickup.lat, r.pickup.lng]);
    if (r.delivery) allPoints.push([r.delivery.lat, r.delivery.lng]);
  });
  drivers.forEach((d) => allPoints.push([d.lat, d.lng]));

  // 路線顏色池
  const colors = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
  ];

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: "100%", borderRadius: "12px" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <AutoFit points={allPoints} />

      {/* 路線標記 */}
      {routes.map((route, i) => {
        const color = colors[i % colors.length];
        const pts: [number, number][] = [];
        if (route.pickup) pts.push([route.pickup.lat, route.pickup.lng]);
        if (route.delivery) pts.push([route.delivery.lat, route.delivery.lng]);

        return (
          <div key={i}>
            {/* 取貨點 */}
            {route.pickup && (
              <Marker
                position={[route.pickup.lat, route.pickup.lng]}
                icon={pickupIcon}
              >
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>
                      📍 取貨點 — {route.routeLabel}
                    </div>
                    <div style={{ fontSize: 13 }}>{route.pickup.address}</div>
                    {route.routeDate && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        📅 {route.routeDate}
                      </div>
                    )}
                    {route.driverName && (
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        🚛 {route.driverName}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* 送貨點 */}
            {route.delivery && (
              <Marker
                position={[route.delivery.lat, route.delivery.lng]}
                icon={deliveryIcon}
              >
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>
                      🏁 送貨點 — {route.routeLabel}
                    </div>
                    <div style={{ fontSize: 13 }}>{route.delivery.address}</div>
                    {route.driverName && (
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                        🚛 {route.driverName}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* 路線連線 */}
            {pts.length === 2 && (
              <Polyline
                positions={pts}
                pathOptions={{
                  color,
                  weight: 3,
                  opacity: 0.7,
                  dashArray: "8 4",
                }}
              />
            )}
          </div>
        );
      })}

      {/* 司機即時位置 */}
      {drivers.map((d) => (
        <Marker
          key={d.driverId}
          position={[d.lat, d.lng]}
          icon={driverIcon}
        >
          <Popup>
            <div style={{ fontFamily: "sans-serif", minWidth: 160 }}>
              <div style={{ fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>
                🚛 {d.driverName}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                最後更新：{new Date(d.updatedAt).toLocaleTimeString("zh-TW")}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
