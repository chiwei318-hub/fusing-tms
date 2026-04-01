# Overview

This project is a TypeScript-based pnpm workspace monorepo for a logistics dispatch management system. Its core purpose is to automate and optimize logistics operations, covering customer order management, driver and fleet administration, dispatch processes, and financial reporting. Key features include efficient order handling and tracking, comprehensive driver/fleet management, an administrative control panel, and an enterprise client portal. The system also facilitates outsourcing to partner fleets and integrates communication via LINE and an AI chatbot. The overarching vision is to enhance operational efficiency, reduce manual effort, and leverage data analytics and AI for strategic insights, thereby establishing a competitive advantage in the logistics industry.

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

## Feature Specifications

*   **Admin Panel:** Comprehensive dashboard with tabs for Order Dispatch, Driver/Customer Management, Reporting, Vehicle Type Database, Smart Scheduling, Heat Maps, Fleet Maps, Carpool Panel, AI Analysis (forecasting, auto-dispatch, dynamic pricing), AI Customer Service, Payment Gateway, Freight Quotation, Route Pricing, Vehicle Cost Calculator, and Permission Management.
*   **Permission Management:** Role-based access control with customizable permissions and audit logging, including zone-scoped permissions.
*   **Order Management:** Supports multi-stop deliveries, full order editing by administrators with real-time synchronization, and a Quick Order mode for guest users.
*   **Dispatch & Routing:** Auto-dispatch engine, Dispatch Suggestion Engine based on multi-factor scoring, and an Auto-Routing Rules Engine for automated order assignment. Dispatch concurrency lock prevents double assignments.
*   **Fleet & Driver Management:** Carpool panel, Outsourcing System for partner fleets, Fleet Onboarding System, Driver Rating System, Driver Income Dashboard, and GPS/Service Area/Capability Settings for drivers.
*   **Financials:** E-Invoice Management with **auto-invoice trigger** on order completion (driver complete or admin delivered), A4 print/PDF page at `/invoice-print/:id`, manual trigger per order in OrderDetail, LINE push notification to customer on invoice issue, idempotent auto-issue logic, bulk monthly invoice for enterprise accounts, void invoice, and monthly stats. Customer `tax_id` and `invoice_title` auto-populated. Invoices stored in `invoices` table with line items (JSONB). Various Payment Methods & Cash Management, and Order Bidding/Price Comparison.
*   **報價引擎 (Quoting Engine):** Full-featured vehicle-type-based pricing engine with DB-persisted rate cards (`pricing_config.vehicle_rate_cards`). Key components:
    - `pricingEngine.ts` — core calculation: per-vehicle base price, km charge, weight/volume tiers, cold chain (冷鏈溫控) fee (冷凍/冷藏/恆溫), special cargo surcharges, waiting fee, tolls, tax+profit — all loaded from DB with 30s cache, falls back to DEFAULT_RULES.
    - `quotes.ts` — public `/api/quotes/estimate` (no auth), `/api/quotes` (save), `/api/quotes/:token` (get), `/api/quotes` (admin list), `/api/pricing/vehicle-rates` (GET/PUT).
    - `QuotePage.tsx` — customer-facing public quote calculator at `/quote`, accessible from Landing page.
    - `QuotesTab.tsx` — admin quote management tab with status tracking (pending/confirmed/converted/expired/cancelled) and one-click status transitions.
    - `QuotationTab.tsx` — admin rate card editor now syncs to DB via PUT `/api/pricing/vehicle-rates` on save (previously localStorage-only).
    - `quote_requests` DB table stores all quote history with token, customer info, price breakdown, status, and expiry.
*   **Analytics & Reporting:** Performance Audit & Bonus System, KPI Dashboard for daily operations, and Fleet Analytics (demand forecast, fleet recommendation, exception analysis).
*   **Customization:** System Config Management via admin UI, and dynamic Order Custom Fields defined by administrators.
*   **Integrations:** LINE Integration for driver notifications and AI chatbot, Google Maps for location services.
*   **Enterprise Features:** Enterprise Customer Portal with advanced functionalities, and Enterprise Architecture Upgrade including Multi-depot Zone/Team structure and Master Data completeness.
*   **Workflow Enhancements:** Granular Status Flow & Exception SOP for order states, and Order Bulk Import functionality.
*   **Customer Management:** Expanded customer data fields and a Customer Notification Center.

## 加盟主模組（Franchise Partner Module）

- **DB Tables:** `franchisees`（加盟主基本資料 + 合約）、`franchisee_settlements`（月結分潤）
- **API Routes:** `artifacts/api-server/src/routes/franchisees.ts`
  - CRUD 加盟主（GET/POST/PATCH/DELETE `/api/franchisees`）
  - 月結算產出 `POST /api/franchisees/:id/settlements/generate`（支援手動帶入業績）
  - 結算狀態流轉 `PATCH /api/franchisee-settlements/:id/status`（pending→confirmed→paid）
- **Frontend:** `artifacts/logistics/src/pages/admin/FranchiseeTab.tsx`（後台「加盟主」Tab）
- **分潤計算邏輯：** 業績總額 × 加盟主比例 − 月費 = 實際撥款
- **合約類型：** 分潤制 / 月費制 / 混合制

## 自動化 Email 發票流程

- **email.ts**：nodemailer HTML 電子發票模板，SMTP 設定從 `pricing_config` 讀取（`smtp_*` 前綴）
- **autoInvoice.ts**：司機完單後自動開票，成功後非同步發 LINE + Email 通知（互不干擾）
- **SystemSettingsTab**：後台 SMTP 設定 UI，含快速套用（Gmail/Outlook 等），測試信發送功能
- **API：** `POST /api/invoices/smtp-test`、`PUT /api/invoices/smtp-config`

## 金流拆解模組（Cash Flow Decomposition）

- **cashFlow.ts**：4 支 API，按月拆解每筆訂單的金流去向
- **API：**
  - `GET /api/cash-flow/monthly?year=&month=` — 月度摘要（收入/司機薪資/加盟主分潤/平台淨利）
  - `GET /api/cash-flow/trend?months=N` — 近 N 個月趨勢（帶加盟主結算補充）
  - `GET /api/cash-flow/orders?year=&month=&page=&limit=` — 逐筆訂單拆解（含司機佔比）
  - `GET /api/cash-flow/by-driver?year=&month=` — 按司機彙總
  - `GET /api/cash-flow/by-franchisee?year=&month=` — 按加盟主彙總（整合 franchisee_settlements）
- **CashFlowTab.tsx**：後台「金流拆解」Tab
  - 4 張 KPI 卡片（訂單收入、司機薪資、加盟主分潤、平台淨利）
  - 分配比例長條視覺化（彩色分段）
  - 6 個月趨勢堆疊柱狀圖 + 收入/淨利面積圖
  - 本月收入結構甜甜圈圓餅圖
  - 企業客戶 vs 散客收入拆分卡
  - 訂單明細分頁表（含分傭比例顯示）
  - 按司機 / 按加盟主 匯總表（含合計列）
- **位置：** 後台 → 帳務財務 → 金流拆解 Tab

## 報價引擎（Pricing Engine）

- **DB Key：** `vehicle_rate_cards`（JSON，存放 8 種車型費率）
- **pricingEngine.ts**：30s 快取，從 DB 讀費率，支援 `invalidatePricingCache()`
- **QuotePage.tsx (`/quote`)：** 公開報價頁面（無需登入）
- **QuotesTab.tsx：** 後台報價管理（狀態流轉：pending → contacted → booked → rejected）

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