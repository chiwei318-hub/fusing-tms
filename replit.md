# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── logistics/          # React + Vite frontend (物流派車管理系統)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Application: 物流派車管理系統

A logistics dispatch management system with:

- **客戶下單** — Customer order form (pickup, delivery, cargo details)
- **訂單列表** — Order list with status badges and filters
- **訂單詳情** — Order detail with transport status timeline
- **後台管理** — Admin panel with order dispatch and driver management

### Admin Tabs (11 total)
- **訂單** — Order dispatch with ⚡ 一鍵派車 + 💰 自動估價 + ✏️ 編輯對話框（分欄聯絡人/電話 + 多站下貨編輯）
- **司機** — Driver CRUD and status management
- **客戶** — Customer CRUD
- **報表** — Revenue and operational reports
- **車型庫** — Vehicle type database (specs, CRUD, auto-match tool)
- **智慧調度** — LTL consolidation (混載拼車) + return trip recommendation (回頭車)
- **熱區地圖** — Taiwan region heat map, hourly distribution, driver guidance
- **車隊地圖** — Real-time fleet map
- **拼車** — Carpool dispatch panel: AI compatibility score, one-click merge, merged group management, driver assignment per group
- **AI 分析** — 5 AI sub-tabs: order forecast, auto-dispatch, dynamic pricing, customer grading, revenue forecast
- **金流** — Payment collection system (see Payment System section below)

### Multi-Stop Delivery (一取多卸)
- Customer order form supports up to 5 extra delivery stops (address, contact, phone, quantity, weight, notes)
- Admin order edit dialog allows adding/removing extra delivery stops inline (up to 5 stops)
- Admin order detail dialog shows full route with numbered stops, signed status, quantity/weight per stop
- Driver task detail shows per-stop signing card with navigate + sign/unsign buttons per stop
- Stop sign status stored as JSON in `extraDeliveryAddresses` column

### Order Editing (預約訂單可編輯)
- Admin edit dialog: pickup/delivery date, time, address, company name, separate contact name + phone
- Can add/edit/remove extra delivery stops (一取多卸)
- Vehicle type, weight, dimensions (L×W×H), special requirements, notes
- All changes sync to driver app and admin detail view immediately

### Carpool Panel (拼車調度)
- Groups pending orders by delivery region + pickup date
- AI compatibility score between order pairs (0-100%) based on region/date/time match
- Remaining capacity display (weight kg + volume m³) with vehicle suggestion
- One-click merge: creates shared `orderGroupId` across selected orders
- Merged group management: view route list, assign driver to all orders in group, dissolve group

### Outsourcing / Monetization System (轉單變現系統)
- Admin tab: "轉單" (`value="outsourcing"`) → `OutsourcingTab.tsx`
- Sub-tabs: 轉單管理, 合作車隊, 自動分單設定, 利潤控管, 報表
- DB Tables: `partner_fleets`, `outsourced_orders`, `auto_dispatch_settings`
- API Routes: `/api/outsourcing/fleets` (CRUD), `/api/outsourcing/orders` (CRUD + notify), `/api/outsourcing/settings` (GET/PATCH), `/api/outsourcing/reports/summary|by-fleet|monthly`
- Features: Auto price comparison, profit calculation (transferPrice - fleetPrice), profit alerts when below threshold, reliability scoring, fleet commission (% or fixed NTD), auto-assign flag, LINE notify simulation
- Test fleets: 台灣快遞車隊 (NT$2800/趟, 12%抽成) and 南台灣物流聯盟 (NT$3500/趟, NT$300固定抽成)

### Enterprise Customer Portal (企業客戶入口)
- Route: `/enterprise/*`
- Login: `/enterprise/login` (accountCode + password, SHA-256+salt hash)
- Session: `localStorage` ("enterprise-session") or `sessionStorage` (if no remember-me)
- Pages: Dashboard (總覽), Quick Order (快速下單), Reports (對帳報表), Account (帳戶設定)
- DB Tables: `enterprise_accounts`, `enterprise_saved_templates`; `orders.enterprise_id` FK
- API Routes: `POST /api/enterprise/login`, `GET /api/enterprise/:id`, `GET /api/enterprise/:id/orders`, `GET /api/enterprise/:id/monthly-summary`, `GET /api/enterprise/:id/orders/export` (CSV), `GET/POST/PATCH/DELETE /api/enterprise/:id/templates`, `POST /api/enterprise` (admin create), `PATCH /api/enterprise/:id/settings`
- Features: Credit limit display, discount %, priority dispatch badge, CSV export, 1-click reorder templates
- Test account: DEMO001 / demo1234 (月結, NT$50k 額度, 5% 折扣, 優先派車)

### DB Tables
- `orders` — Full order lifecycle with cargo dimensions + region
- `drivers` — Driver profiles with LINE user ID
- `customers` — Customer accounts
- `vehicle_types` — Vehicle spec database
- `enterprise_accounts` — Enterprise company accounts (billing, credit, discounts)
- `enterprise_saved_templates` — Saved quick-order templates per enterprise

### Routes
- `/` — Customer order form (客戶下單)
- `/orders` — Order list (訂單列表)
- `/orders/:id` — Order detail
- `/admin` — Admin panel (後台管理)

### API Endpoints
- `GET /api/orders` — List orders (filter by status)
- `POST /api/orders` — Create order
- `GET /api/orders/:id` — Get order
- `PATCH /api/orders/:id` — Update order (assign driver, change status); triggers LINE push notification if driver has lineUserId
- `GET /api/drivers` — List drivers
- `POST /api/drivers` — Create driver (with optional lineUserId)
- `PATCH /api/drivers/:id` — Update driver (with optional lineUserId)
- `DELETE /api/drivers/:id` — Delete driver
- `POST /api/line/webhook` — LINE Messaging API webhook (handles postback accept/reject actions)

### Database Tables
- `orders` — Order records with status, pickup/delivery addresses, cargo info
- `drivers` — Driver records with vehicle info, availability status, and optional `line_user_id`

### LINE Integration
- Uses `@line/bot-sdk` for LINE Messaging API
- Flex Message with accept/reject buttons sent on dispatch
- Webhook at `/api/line/webhook` handles postback events
- Required env secrets: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- Optional env: `APP_BASE_URL` (for driver task URL in LINE message)
- If `lineUserId` is not set on a driver, notification is silently skipped

### Order Status
- `pending` → 待處理
- `assigned` → 已指派
- `in_transit` → 運送中
- `delivered` → 已送達
- `cancelled` → 已取消

### Driver Status
- `available` → 可接單
- `busy` → 忙碌中
- `offline` → 下線

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/logistics` (`@workspace/logistics`)

React + Vite frontend for the logistics management system.

- Entry: `src/main.tsx`
- App: `src/App.tsx` — routing with wouter, React Query provider
- Pages: `src/pages/` — OrderForm, OrderList, OrderDetail, Admin, Driver, Customer, TrackOrder
- Admin sub-pages: `src/pages/admin/` — VehicleTypeTab, SmartDispatchTab, HeatMapTab, AIAnalyticsTab, ReportCenter
- Components: `src/components/` — StatusBadge, AppLayout, ThemeToggle
- Hooks: `src/hooks/` — use-orders.ts, use-drivers.ts, use-vehicle-types.ts
- Uses `@workspace/api-client-react` for API calls
- Dependencies: `xlsx` (Excel export), `date-fns`, `lucide-react`

**Admin tabs (8):** 訂單 | 司機 | 客戶 | 報表 | 車型庫 | 智慧調度 | 熱區地圖 | AI分析

**報表中心 (ReportCenter.tsx):** Customer/Vehicle/Driver reports with date filter, keyword filter, per-row expandable detail, Excel export (xlsx), and print (A4 landscape, new window).

**AI分析 sub-tabs (6):** 訂單預測 | 自動調度 | 動態運費 | 💰成本控管 | 客戶分級 | 營收預測

**Cost model:** fuel (NT$2.56–9.60/km by vehicle type), tolls (region matrix), 20% driver commission, fixed depreciation per vehicle type.

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server.

- Entry: `src/index.ts`
- Routes: `src/routes/` — health, orders, drivers, line (webhook)
- LINE service: `src/lib/line.ts` — sendDispatchNotification(), getLineMiddleware()
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: `src/schema/orders.ts`, `src/schema/drivers.ts`
- `pnpm --filter @workspace/db run push` — sync schema to DB

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen config.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
