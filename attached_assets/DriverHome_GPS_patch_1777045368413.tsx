/**
 * DriverHome.tsx GPS 整合說明
 * ─────────────────────────────────────────────────────────────
 * 把以下程式碼貼入 DriverHome.tsx 對應位置即可完成整合
 * 共 3 個步驟，每步驟標示對應行號
 */

// ══════════════════════════════════════════════════════════════
// STEP 1：在 import 區（L1–11 之後）加入
// ══════════════════════════════════════════════════════════════

import { useGpsTracking } from "@/hooks/useGpsTracking";

// ══════════════════════════════════════════════════════════════
// STEP 2：替換 L70–74 的手動 GPS state
//
// 刪除：
//   const [locationLoading, setLocationLoading] = useState(false);
//   const [locationStatus, setLocationStatus]   = useState<"idle"|"success"|"error">("idle");
//
// 換成：
// ══════════════════════════════════════════════════════════════

const {
  isTracking,
  lastPosition,
  error: gpsError,
  startTracking,
  stopTracking,
} = useGpsTracking(user?.id, user?.name ?? "");

// 相容舊 UI 用的衍生 state（這樣不用改後面的 JSX）
const locationLoading = isTracking && !lastPosition;
const locationStatus: "idle" | "success" | "error" = gpsError
  ? "error"
  : lastPosition
  ? "success"
  : "idle";

// ══════════════════════════════════════════════════════════════
// STEP 3：在 Presence ping 的 useEffect 之後（L52 之後）加入
//         司機登入時自動開始追蹤，登出時停止
// ══════════════════════════════════════════════════════════════

useEffect(() => {
  if (user?.id) {
    startTracking();
  }
  return () => stopTracking();
}, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

// ══════════════════════════════════════════════════════════════
// STEP 4（選用）：GPS 狀態顯示元件
//   把原本的「更新位置」按鈕換成這個，貼在你想顯示的位置
// ══════════════════════════════════════════════════════════════

function GpsStatusBadge({
  isTracking,
  lastPosition,
  gpsError,
}: {
  isTracking: boolean;
  lastPosition: { lat: number; lng: number } | null;
  gpsError: string | null;
}) {
  if (gpsError) {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 20,
        background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.25)",
        fontSize: 11, color: "#ef4444",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
        GPS 錯誤
      </div>
    );
  }
  if (isTracking && lastPosition) {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 20,
        background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.25)",
        fontSize: 11, color: "#10b981",
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0,
          animation: "pulse 2s infinite",
        }} />
        位置追蹤中
      </div>
    );
  }
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 20,
      background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.2)",
      fontSize: 11, color: "#64748b",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#64748b", flexShrink: 0 }} />
      定位中…
    </div>
  );
}
