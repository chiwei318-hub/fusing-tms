/**
 * DispatchMap.tsx
 * Leaflet 地圖元件：顯示路線取貨/送貨標記 + 司機即時位置
 */

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const makeIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:13px;color:white;font-weight:900">${label}</span></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -36],
  });

const pickupIcon   = makeIcon("#3b82f6", "取");
const deliveryIcon = makeIcon("#10b981", "送");
const driverIcon   = makeIcon("#f59e0b", "🚛");

export interface RoutePoint {
  routeLabel: string;
  routeDate?: string;
  driverName?: string;
  pickup?:   { lat: number; lng: number; address: string };
  delivery?: { lat: number; lng: number; address: string };
}

export interface DriverPosition {
  driverId:   number;
  driverName: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

interface DispatchMapProps {
  routes?:  RoutePoint[];
  drivers?: DriverPosition[];
  center?:  [number, number];
  zoom?:    number;
  height?:  string;
}

function AutoFit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 14); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48] });
  }, [points.join(",")]); // eslint-disable-line
  return null;
}

export function DispatchMap({
  routes  = [],
  drivers = [],
  center  = [23.6978, 120.9605],
  zoom    = 8,
  height  = "100%",
}: DispatchMapProps) {
  const allPoints: [number, number][] = [];
  routes.forEach(r => {
    if (r.pickup)   allPoints.push([r.pickup.lat,   r.pickup.lng]);
    if (r.delivery) allPoints.push([r.delivery.lat, r.delivery.lng]);
  });
  drivers.forEach(d => allPoints.push([d.lat, d.lng]));

  const colors = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

  return (
    <MapContainer center={center} zoom={zoom}
      style={{ height, width: "100%", borderRadius: "12px" }}
      scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <AutoFit points={allPoints} />

      {routes.map((route, i) => {
        const color = colors[i % colors.length];
        const pts: [number, number][] = [];
        if (route.pickup)   pts.push([route.pickup.lat,   route.pickup.lng]);
        if (route.delivery) pts.push([route.delivery.lat, route.delivery.lng]);

        return (
          <span key={i}>
            {route.pickup && (
              <Marker position={[route.pickup.lat, route.pickup.lng]} icon={pickupIcon}>
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>📍 取貨點 — {route.routeLabel}</div>
                    <div style={{ fontSize: 13 }}>{route.pickup.address}</div>
                    {route.routeDate  && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>📅 {route.routeDate}</div>}
                    {route.driverName && <div style={{ fontSize: 12, color: "#64748b" }}>🚛 {route.driverName}</div>}
                  </div>
                </Popup>
              </Marker>
            )}
            {route.delivery && (
              <Marker position={[route.delivery.lat, route.delivery.lng]} icon={deliveryIcon}>
                <Popup>
                  <div style={{ fontFamily: "sans-serif", minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: "#10b981", marginBottom: 4 }}>🏁 送貨點 — {route.routeLabel}</div>
                    <div style={{ fontSize: 13 }}>{route.delivery.address}</div>
                    {route.driverName && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>🚛 {route.driverName}</div>}
                  </div>
                </Popup>
              </Marker>
            )}
            {pts.length === 2 && (
              <Polyline positions={pts} pathOptions={{ color, weight: 3, opacity: 0.7, dashArray: "8 4" }} />
            )}
          </span>
        );
      })}

      {drivers.map(d => (
        <Marker key={d.driverId} position={[d.lat, d.lng]} icon={driverIcon}>
          <Popup>
            <div style={{ fontFamily: "sans-serif", minWidth: 160 }}>
              <div style={{ fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>🚛 {d.driverName}</div>
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
