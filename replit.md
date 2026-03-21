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

### Admin Tabs (8 total)
- **訂單** — Order dispatch with ⚡ 一鍵派車 + 💰 自動估價
- **司機** — Driver CRUD and status management
- **客戶** — Customer CRUD
- **報表** — Revenue and operational reports
- **車型庫** — Vehicle type database (specs, CRUD, auto-match tool)
- **智慧調度** — LTL consolidation (混載拼車) + return trip recommendation (回頭車)
- **熱區地圖** — Taiwan region heat map, hourly distribution, driver guidance
- **AI 分析** — 5 AI sub-tabs: order forecast, auto-dispatch, dynamic pricing, customer grading, revenue forecast

### DB Tables
- `orders` — Full order lifecycle with cargo dimensions + region
- `drivers` — Driver profiles with LINE user ID
- `customers` — Customer accounts
- `vehicle_types` — Vehicle spec database

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
- Pages: `src/pages/` — OrderForm, OrderList, OrderDetail, Admin
- Components: `src/components/` — StatusBadge, AppLayout, ThemeToggle
- Hooks: `src/hooks/` — use-orders.ts, use-drivers.ts
- Uses `@workspace/api-client-react` for API calls

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
