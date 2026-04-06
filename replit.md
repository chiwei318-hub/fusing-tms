# Overview

This project is a TypeScript-based pnpm workspace monorepo for a logistics dispatch management system. Its core purpose is to automate and optimize logistics operations, covering customer order management, driver and fleet administration, dispatch processes, and financial reporting. The system integrates communication via LINE and an AI chatbot, facilitating outsourcing to partner fleets. The overarching vision is to enhance operational efficiency, reduce manual effort, and leverage data analytics and AI for strategic insights, thereby establishing a competitive advantage in the logistics industry.

# User Preferences

*   I want iterative development.
*   Please provide detailed explanations for complex features.
*   Ask before making major changes to the project structure or core functionalities.
*   Ensure all new features are accompanied by relevant API endpoints and database schema updates.
*   Do not make changes to the `artifacts/logistics/src/components/TaiwanAddressInput.tsx` file without explicit instruction.
*   Do not make changes to the `lib/api-spec` directory or its contents without explicit instruction.

# System Architecture

The project is structured as a pnpm workspace monorepo, separating applications (`artifacts/`) from shared libraries (`lib/`) and utility scripts (`scripts/`). It utilizes Node.js 24, pnpm, and TypeScript 5.9.

## UI/UX Decisions

The frontend for the logistics system (`artifacts/logistics`) is built with React and Vite, focusing on a clear, functional design with consistent UI components. Admin panels are designed for intuitive data management, featuring interactive elements for dispatch, driver management, and reporting, including a specialized `TaiwanAddressInput` component with Google Maps integration.

## Technical Implementations

*   **Monorepo Tool:** pnpm workspaces.
*   **Backend:** Express 5 handles API requests, integrated with Drizzle ORM.
*   **Database:** PostgreSQL, managed by Drizzle ORM.
*   **API Design:** OpenAPI 3.1 specifications; `Orval` generates client-side API code (React Query hooks) and Zod schemas.
*   **Authentication:** JWT-based system with multiple user roles, supporting SMS OTP, username/password, and LINE OAuth.
*   **Type Safety:** Extensive TypeScript usage across the monorepo.
*   **Build System:** `esbuild` for CJS bundle generation.
*   **Error Handling:** Zod for request validation.
*   **Email Service:** Nodemailer for automated email invoicing with configurable SMTP settings.
*   **PDF Generation:** `pdfkit` for generating A4 electronic invoices and monthly bills.

## Feature Specifications

*   **Admin Panel:** Comprehensive dashboard with tabs for Order Dispatch, Driver/Customer Management, Reporting, Smart Scheduling, AI Analysis (forecasting, auto-dispatch, dynamic pricing), AI Customer Service, Payment Gateway, Freight Quotation, Route Pricing, and Permission Management.
*   **Permission Management:** Role-based access control with customizable permissions and audit logging, including zone-scoped permissions.
*   **Order Management:** Supports multi-stop deliveries, full order editing by administrators, and a Quick Order mode for guest users. Includes auto-dispatch, a Dispatch Suggestion Engine, and an Auto-Routing Rules Engine.
*   **Fleet & Driver Management:** Carpool panel, Outsourcing System for partner fleets, Fleet Onboarding System, Driver Rating System, Driver Income Dashboard, and GPS/Service Area/Capability Settings for drivers.
*   **Financials:** E-Invoice Management with auto-triggering, PDF generation, LINE push notifications, bulk monthly invoicing, void/allowance invoice capabilities, and various payment methods. Includes a full billing flow with AR ledger, monthly bills, and payment reconciliation.
*   **Quoting Engine:** Full-featured vehicle-type-based pricing engine with DB-persisted and cached rate cards, providing public and admin-facing quote functionalities.
*   **Analytics & Reporting:** KPI Dashboard, Performance Audit & Bonus System, Fleet Analytics, and financial reports including AR aging, driver commission, and gross margin analysis.
*   **Customization:** System Config Management via admin UI and dynamic Order Custom Fields.
*   **Integrations:** LINE Integration for notifications and AI chatbot, Google Maps for location services.
*   **Enterprise Features:** Enterprise Customer Portal, Multi-depot Zone/Team structure, and Master Data completeness.
*   **Franchise Fleet Management System (加盟車行管理):** Full multi-role franchise platform:
    - Platform admin CRUD (`/api/platform/fleets`) for managing franchisees, setting commission rates, and platform-level controls
    - Fleet owner backend (`/api/fleet/*`) with JWT auth (`fleet_owner` role): manage own drivers, real-time dispatch wall, pricing rules, leave approval, salary calculation and settlement, standby scheduling
    - Driver mobile API (`/api/driver/*`) with JWT auth (`fleet_driver` role): GPS location updates, order acceptance/transit/completion, leave requests, standby slots, salary records — designed for FlutterFlow integration
    - Dedicated login endpoints: `POST /api/auth/login/fleet-owner`, `POST /api/auth/login/fleet-driver`
    - DB tables: `franchisees` (with auth columns), `fleet_pricing_rules`, `driver_leaves`, `driver_salary_records`, `driver_standby_slots`; `drivers` extended with `franchisee_id`, `engine_cc`, `tonnage`
    - Strict data isolation: all queries filter by `franchisee_id` (and `driver_id`) from JWT claims
    - **班表自動同步 (Sheet Auto-Sync):** Fleet owners can connect Google Sheets (蝦皮班表) to the dispatch wall. DB table `fleet_sheet_sync_configs` stores per-franchisee sync configs (sync_name, sheet_url, interval_minutes, last_sync_at, last_sync_status). Scheduler in `artifacts/api-server/src/lib/fleetSheetSync.ts` checks every 60s and runs overdue syncs. Parse logic reuses the same column-order format as the existing `POST /fleet/trips/parse-sheet` endpoint. CRUD endpoints: `GET/POST /api/fleet/sheet-sync`, `PATCH/DELETE /api/fleet/sheet-sync/:id`, `POST /api/fleet/sheet-sync/:id/run` (manual trigger). Frontend: "班表自動同步" section in DashboardTab with cards showing status, last sync time, and controls (Zap=manual sync, gear=edit, toggle=enable/disable, trash=delete).
    - **司機資料擴充欄位** (via `ensureDriverColumns` in `drivers.ts`): `id_no TEXT` (身分證), `insurance_expiry DATE` (強制險到期), `inspection_date DATE` (定期驗車), `bank_code VARCHAR(10)` (行庫代碼), `bank_account VARCHAR(30)` (帳號), `referrer TEXT` (介紹人). Both `GET/POST/PATCH /api/drivers` and fleet portal `GET/POST/PATCH /api/fleet/drivers/:id` support all these fields. Admin portal and franchise fleet portal driver forms include all fields with expiry warning badges (red/orange) on driver cards when within 30 days of expiry.
*   **Open API Module:** Provides external API access with API key management (SHA-256 hashed keys), usage logging, webhook support for order events, and rate limiting.
*   **Cash Flow Decomposition:** APIs and admin UI for monthly cash flow summaries, trends, and detailed breakdowns by order, driver, and franchisee.
*   **Shopee Finance Module:** Integrates specific financial analysis for Shopee logistics, including managing route prefix rates, driver earnings calculations, penalties tracking, and profit & loss analysis by vehicle and fleet, with dedicated DB tables and APIs. Includes a Fusingao customer portal for route management and billing.
*   **福興高車隊帳號系統 (Fleet Sub-contractor) — 4-layer settlement chain:** Admin portal `/fusingao` → 5 tabs (default: 調度控制中心/Control Tower): 調度控制中心 (KPI dashboard, exception panel, fleet ranking, unassigned routes with 1-click dispatch), 車趟完成通知, 月度對帳, 合作車隊管理 (with commission_rate/bank fields), 結算總覽 (per-fleet settlement breakdown). Control Tower API: `GET /api/fusingao/control-tower`. Fleet portal `/fleet` → 7 tabs: 可搶路線 (atomic grab), 我的任務 (mark complete + assign driver dropdown), 月結帳單 (CSV export), 旗下司機 (CRUD fleet drivers), 結算分析 (settlement chain visualization + per-driver breakdown), 派車單 (dispatch orders), **司機子帳號** (driver sub-accounts management). DB tables: `fusingao_fleets` (with commission_rate/bank_account/bank_name), `fleet_drivers`, `fleet_sub_accounts` (username/password_hash/display_name/shopee_driver_id/role/is_active), `orders.fusingao_fleet_id/fleet_driver_id/fleet_grabbed_at/fleet_completed_at`. APIs: `GET/POST/PUT /api/fusingao/fleets/:id/drivers`, `GET /api/fusingao/settlement`, `GET /api/fusingao/fleets/:id/settlement`, `PUT /api/fusingao/routes/:id/assign-driver`, `GET/POST/PUT/DELETE /api/fusingao/fleets/:id/sub-accounts`, `POST /api/fusingao/fleets/:id/sub-accounts/:id/reset-password`. Auth: `POST /api/auth/login/fleet` JWT — supports role `fusingao_fleet` (full fleet admin) and `fleet_sub` (driver sub-account, only sees own routes filtered by shopeeDriverId). Sub-account JWT: `{ role: "fleet_sub", fleetId, subAccountId, shopeeDriverId, subRole, fleetName }`. Settlement formula: shopee_rate → platform keeps commission_rate% → fleet receives remainder. Test account: fleet01/test1234.
*   **API URL Pattern (Frontend):** Admin login and fleet login use `${BASE_URL}/api/<path>` pattern directly. Other data-fetching components use `getApiUrl()` from `@/lib/api`. Never pass `/api/` prefix to `getApiUrl()` — it prepends BASE_URL which already maps to the api root.

# External Dependencies

*   **Monorepo Tool:** pnpm workspaces
*   **Package Manager:** pnpm
*   **API Framework:** Express 5
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Validation:** Zod, drizzle-zod
*   **API Codegen:** Orval
*   **Auth Library:** `jsonwebtoken`
*   **SMS Service:** Every8D
*   **LINE Messaging API:** `@line/bot-sdk`
*   **Mapping/Location Services:** Google Maps API
*   **Frontend Libraries:** React, Vite, React Query, wouter
*   **Data Manipulation/Utility:** `exceljs`, `date-fns`, `lucide-react`
*   **Email Client:** Nodemailer
*   **PDF Generation:** `pdfkit`
*   **Payment Gateway:** ECPay (for e-invoicing)

# Pending Integrations

*   **Google Sheets（福興高派車表）**: User provided Google Sheets URL (`https://docs.google.com/spreadsheets/d/1Z65luSGOGNYpFPyL1apLR8kxOvYV-U2VvPcVrmC5TzI/edit?gid=547652343`) for auto-sync of dispatch data. Replit Google Sheets connector was dismissed (connector ID: `ccfg_google-sheet_E42A9F6CA62546F68A1FECA0E8`). Next step: User needs to either (a) make the sheet publicly viewable so the server can fetch via CSV export URL, or (b) re-authorize the Replit Google Sheets integration. Once accessible, build an import endpoint `POST /fusingao/sync-dispatch` that reads the sheet and creates/updates `orders` rows with route data.