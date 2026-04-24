# 調度系統升級整合指南

## 📦 本次交付檔案

| 檔案 | 放置路徑 | 說明 |
|------|---------|------|
| `DispatchMap.tsx` | `artifacts/logistics/src/components/` | Leaflet 地圖元件 |
| `DispatchCenter.tsx` | `artifacts/logistics/src/pages/admin/` | 調度總覽頁 |
| `driverPositions.ts` | `artifacts/api-server/src/routes/` | GPS 位置 API |
| `dispatchSuggestEnhanced.ts` | `artifacts/api-server/src/routes/` | AI 派車建議 API |
| `useGpsTracking.ts` | `artifacts/logistics/src/hooks/` | 司機 GPS Hook |

---

## 🔧 Step 1：前端設定

### 1-1 加入 Leaflet CSS
在 `artifacts/logistics/src/main.tsx` 最頂部加入：
```tsx
import 'leaflet/dist/leaflet.css'
```

### 1-2 在 App.tsx 加入路由
在 `AdminPortal` 的 `<Switch>` 裡加入：
```tsx
// 在 lazy imports 區塊加：
const DispatchCenter = lazy(() => import("@/pages/admin/DispatchCenter"));

// 在 AdminPortal Switch 加：
<Route path="/dispatch" component={DispatchCenter} />
```

### 1-3 在 AppLayout 選單加入入口
找到你的 `AppLayout.tsx` 的導覽選單，加入：
```tsx
{ path: "/dispatch", label: "🗺️ 調度中心", icon: MapIcon }
```

---

## 🔧 Step 2：後端設定

### 2-1 註冊 GPS 位置路由
在你的 Express 主程式（通常是 `server.ts` 或 `app.ts`）加入：
```typescript
import { createDriverPositionsRouter } from "./routes/driverPositions";
app.use("/api/drivers", createDriverPositionsRouter(pool));
```

### 2-2 註冊 AI 派車建議路由
```typescript
import { createDispatchSuggestRouter } from "./routes/dispatchSuggestEnhanced";
app.use("/api/dispatch-suggest", createDispatchSuggestRouter(pool));
```

> ⚠️ 注意：`/api/drivers/positions` 路由要在現有 `/api/drivers` CRUD 路由**之前**或用獨立 router 掛載，避免路徑衝突。

---

## 🔧 Step 3：司機端加入 GPS 追蹤

在 `DriverHome.tsx` 或 `DriverTasks.tsx` 加入：
```tsx
import { useGpsTracking } from "@/hooks/useGpsTracking";

// 在元件內：
const { user } = useAuth();
const { isTracking, error, startTracking, stopTracking } = useGpsTracking(
  user?.id,
  user?.name ?? ""
);

// 司機上班時自動開始追蹤：
useEffect(() => {
  if (user) startTracking();
  return () => stopTracking();
}, [user?.id]);

// 顯示追蹤狀態：
<div className={`text-xs ${isTracking ? 'text-emerald-600' : 'text-slate-400'}`}>
  {isTracking ? '📡 位置追蹤中' : '⚪ 未追蹤'}
</div>
```

---

## 🗺️ DispatchCenter 功能說明

| 功能 | 說明 |
|------|------|
| 地圖顯示 | 所有路線取貨/送貨點標記，點擊派車單聚焦該路線 |
| 司機位置 | 黃色標記顯示 30 分鐘內有 GPS 更新的司機 |
| 單筆指派 | 點擊路線旁「＋ 指派司機」 |
| 批次指派 | 開啟批次模式 → 勾選多筆路線 → 一次指派 |
| 狀態篩選 | 已發送 / 已確認 / 已指派 |
| 自動更新 | 派車單每 30 秒、GPS 每 15 秒自動重新整理 |

---

## 🤖 AI 派車建議使用方式

在 `DispatchCenter.tsx` 呼叫 AI 建議（可加按鈕）：
```tsx
// 取得所有未指派路線 ID
const unassignedIds = selectedOrder?.routes
  .filter(r => !r.assigned_driver_name)
  .map(r => r.id) ?? [];

// 呼叫 AI 建議
const res = await fetch('/api/dispatch-suggest/auto', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ route_item_ids: unassignedIds })
});
const { suggestions } = await res.json();

// 套用建議
await fetch('/api/dispatch-suggest/apply', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ suggestions })
});
```

---

## ⚠️ 注意事項

1. `TaiwanAddressInput.tsx` **未修改**
2. `lib/api-spec` 目錄 **未修改**
3. 現有 `dispatchOrders.ts` / `dispatchSuggest.ts` **未修改**，新功能是獨立檔案
4. GPS 功能需要 HTTPS（瀏覽器要求），Replit 部署後自動有 HTTPS ✅
