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

### Routes
- `/` — Customer order form (客戶下單)
- `/orders` — Order list (訂單列表)
- `/orders/:id` — Order detail
- `/admin` — Admin panel (後台管理)

### API Endpoints
- `GET /api/orders` — List orders (filter by status)
- `POST /api/orders` — Create order
- `GET /api/orders/:id` — Get order
- `PATCH /api/orders/:id` — Update order (assign driver, change status)
- `GET /api/drivers` — List drivers
- `POST /api/drivers` — Create driver
- `PATCH /api/drivers/:id` — Update driver
- `DELETE /api/drivers/:id` — Delete driver

### Database Tables
- `orders` — Order records with status, pickup/delivery addresses, cargo info
- `drivers` — Driver records with vehicle info and availability status

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
- Routes: `src/routes/` — health, orders, drivers
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: `src/schema/orders.ts`, `src/schema/drivers.ts`
- `pnpm --filter @workspace/db run push` — sync schema to DB

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec + Orval codegen config.

Run codegen: `pnpm --filter @workspace/api-spec run codegen`
