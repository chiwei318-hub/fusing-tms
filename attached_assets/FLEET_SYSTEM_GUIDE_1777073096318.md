# 車隊分類系統整合說明

## 📦 本次交付檔案

| 檔案 | 放置路徑 |
|------|---------|
| `fleetSystem.ts` | `artifacts/api-server/src/routes/` |
| `FleetPortalDashboard.tsx` | `artifacts/logistics/src/pages/fleet/` |

---

## 🔧 後端整合（index.ts）

```typescript
import { createFleetSystemRouter } from "./routes/fleetSystem";
app.use("/api/fleet-system", createFleetSystemRouter(pool));
```

---

## 🎯 四種車隊類型

| 類型 | 代碼 | 掛靠費 | 扣繳率 |
|------|------|--------|--------|
| 靠行車 | `affiliated` | ✅ 有 | 10% |
| 車主車 | `owner` | ❌ 無 | 10% |
| 外車   | `external`   | ❌ 無 | 10% |
| 貨運行 | `agency`     | ❌ 無 | 1.9%（有統編）|

---

## 📊 損益計算公式

```
富詠收入 = 趟次 × rate_per_trip × (1 - commission_rate%)
自接收入 = fleet_orders.total_fee 加總
總收入   = 富詠收入 + 自接收入

司機成本 = driver_payroll.net_pay 加總
車輛成本 = fleet_vehicle_costs.amount 加總
靠行費   = fusingao_fleets.monthly_affiliation_fee
平台費   = fusingao_fleets.platform_fee_monthly

淨利     = 總收入 - 所有成本
毛利率   = 淨利 / 總收入 × 100%
```

---

## 🖥️ FleetPortalDashboard 四個 Tab

| Tab | 功能 |
|-----|------|
| 📊 損益總覽 | 富詠 vs 自接收入分析、來源圓餅、趟次統計 |
| 📦 自接訂單 | 建立 / 管理自己接的客戶訂單 |
| 🔧 車輛成本 | 油費/保險/保養/過路費登記 |
| 📈 歷史走勢 | 近12月損益趨勢表 |

---

## 💡 設定車隊類型

在富詠管理後台，對每個車隊設定類型：

```bash
PATCH /api/fleet-system/fleets/:id/type
{
  "fleet_type": "affiliated",
  "monthly_affiliation_fee": 3000,
  "platform_fee_monthly": 0
}
```

---

## 🚀 API 端點清單

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET  | `/fleet-system/fleets` | 所有車隊（含類型）|
| PATCH | `/fleet-system/fleets/:id/type` | 設定車隊類型 |
| GET  | `/fleet-system/orders/:fleetId` | 車隊自接單 |
| POST | `/fleet-system/orders` | 建立自接單 |
| PATCH | `/fleet-system/orders/:id/status` | 更新訂單狀態 |
| GET  | `/fleet-system/vehicle-costs/:fleetId` | 車輛成本 |
| POST | `/fleet-system/vehicle-costs` | 登記車輛成本 |
| POST | `/fleet-system/ledger/calculate` | 計算月損益 |
| GET  | `/fleet-system/ledger/:fleetId` | 歷史損益 |
| GET  | `/fleet-system/ledger/summary/all` | 所有車隊損益彙總 |
