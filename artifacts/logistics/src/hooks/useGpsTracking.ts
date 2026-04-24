/**
 * useGpsTracking.ts
 * 司機端：自動取得 GPS 位置並每 20 秒上報一次
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { apiUrl } from "@/lib/api";

async function reportPosition(
  driverId: number, driverName: string,
  lat: number, lng: number, accuracy?: number,
) {
  const token = localStorage.getItem("token");
  await fetch(apiUrl("/drivers/position"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ driver_id: driverId, driver_name: driverName, lat, lng, accuracy }),
  });
}

interface UseGpsTrackingResult {
  isTracking:   boolean;
  lastPosition: { lat: number; lng: number } | null;
  error:        string | null;
  startTracking: () => void;
  stopTracking:  () => void;
}

export function useGpsTracking(
  driverId: number | undefined,
  driverName: string,
  intervalMs = 20_000,
): UseGpsTrackingResult {
  const [isTracking,   setIsTracking]   = useState(false);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCurrentAndReport = useCallback(() => {
    if (!driverId) return;
    if (!navigator.geolocation) { setError("此裝置不支援 GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setLastPosition({ lat, lng });
        setError(null);
        reportPosition(driverId, driverName, lat, lng, accuracy).catch(console.error);
      },
      (err) => setError(`GPS 錯誤：${err.message}`),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  }, [driverId, driverName]);

  const startTracking = useCallback(() => {
    if (!driverId) return;
    setIsTracking(true);
    getCurrentAndReport();
    intervalRef.current = setInterval(getCurrentAndReport, intervalMs);
  }, [driverId, getCurrentAndReport, intervalMs]);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  return { isTracking, lastPosition, error, startTracking, stopTracking };
}
