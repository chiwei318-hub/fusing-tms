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

The frontend for the logistics system (`artifacts/logistics`) is built with React and Vite, focusing on a clear, functional design with consistent UI components. Admin panels are designed for intuitive data management, featuring interactive elements for dispatch, driver management, and reporting, including a specialized `TaiwanAddressInput` component with Google Maps integration. All 40+ tab components are lazy-loaded via `React.lazy()` + `Suspense` for minimal initial bundle size.

## Technical Implementations

*   **Monorepo Tool:** pnpm workspaces.
*   **Backend:** Express 5 handles API requests, integrated with Drizzle ORM.
*   **Database:** PostgreSQL, managed by Drizzle ORM.
*   **API Design:** OpenAPI 3.1 specifications; `Orval` generates client-side API code (React Query hooks) and Zod schemas.
*   **Authentication:** JWT-based system with multiple user roles, supporting SMS OTP, username/password, and LINE OAuth.
*   **Type Safety:** Extensive TypeScript usage across the monorepo.
*   **Build System:** `esbuild` for CJS bundle generation.
*   **Error Handling:** Zod for request validation.
*   **Email Service:** Nodemailer for automated email invoicing.
*   **PDF Generation:** `pdfkit` for generating A4 electronic invoices and monthly bills.
*   **Permission Management:** Role-based access control with customizable permissions and audit logging, including zone-scoped permissions.
*   **Order Management:** Supports multi-stop deliveries, full order editing, Quick Order mode, auto-dispatch, a Dispatch Suggestion Engine, and an Auto-Routing Rules Engine.
*   **Fleet & Driver Management:** Carpool panel, Outsourcing System for partner fleets, Fleet Onboarding, Driver Rating, Driver Income Dashboard, and GPS/Service Area/Capability Settings. Includes expanded driver data fields (ID, insurance, inspection, bank details, referrer) with expiry warnings.
*   **Financials:** E-Invoice Management with auto-triggering, PDF generation, LINE push notifications, bulk monthly invoicing, void/allowance capabilities, and various payment methods. Full billing flow with AR ledger, monthly bills, and payment reconciliation.
*   **Quoting Engine:** Full-featured vehicle-type-based pricing engine with DB-persisted and cached rate cards.
*   **Analytics & Reporting:** KPI Dashboard, Performance Audit & Bonus System, Fleet Analytics, and financial reports.
*   **Customization:** System Config Management via admin UI and dynamic Order Custom Fields.
*   **Franchise Fleet Management System:** A full multi-role franchise platform with platform admin CRUD, fleet owner backend (driver management, real-time dispatch wall, pricing rules, leave approval, salary, standby scheduling), and driver mobile API. Includes Google Sheets auto-sync for dispatch data and driver sub-accounts with a 4-layer settlement chain.
*   **Open API Module:** External API access with API key management, usage logging, webhook support, and rate limiting.
*   **Cash Flow Decomposition:** APIs and admin UI for monthly cash flow summaries, trends, and detailed breakdowns.
*   **Shopee Finance Module:** Specific financial analysis for Shopee logistics, including route prefix rates, driver earnings, penalties, and P&L analysis. Includes a Fusingao customer portal for route management and billing.
*   **Fusingao TMS Order Management:** Dedicated "Order Manage" tab in Fusingao portal for comprehensive TMS-style order management, including list/search, add/edit dialogs, timeline drawer, print/PDF, and auto-generated order numbers.
*   **Fusingao Fleet Sub-contractor System:** Admin portal for Fusingao fleet management (Control Tower, fleet completion notices, monthly reconciliation, partner fleet management, settlement overview) and fleet portal (route grabbing, tasks, monthly bills, driver management, settlement analysis, dispatch orders, driver sub-accounts). Implements a 4-layer settlement chain with detailed formulas and public reporting.
*   **Platform Requirements Module:** Integrates customer requirements, architecture checklist, and CFO job description documents into a single interface with status tagging, progress statistics, CSV export, and print functionality.
*   **Vehicle Profit Analysis:** Monthly vehicle operational profit analysis with configurable fixed cost parameters, automatic calculations for fuel, insurance, depreciation, net profit, and profit margin. Includes vehicle CRUD, totals, CSV export, and printable reports.
*   **Payroll Cost Settlement v2:** Monthly driver payroll management.
*   **Labor Pension Management:** Management of labor pension contributions.
*   **Cargo Packaging Reference:** Reference table for cargo packaging methods and container sizes.
*   **Sheet Sync 班表欄位 Type:** The Google Sheets auto-sync system (`sheetSyncScheduler.ts`) now supports three sync types: `route` (路線匯入 → inserts to `orders`), `billing` (帳務趟次 → inserts to `fusingao_billing_trips`), and `班表欄位` / `schedule` (蝦皮班表 → upserts to `shopee_route_schedules`). The 班表欄位 type parses positional columns [0]=date [2]=route_no [3]=vehicle_type [4]=driver_id [5]=time_slot [6]=dock_no, and also auto-detects header-based CSV format. Frontend `SheetSyncTab.tsx` displays three color-coded type buttons (blue/orange/green) with format descriptions.
*   **台灣貨運報價計算引擎:** Admin 系統管理 tab 新增「🚚 報價計算」頁面 (`FreightQuoteTab.tsx`)。後端 `freightQuote.ts` 完整實作 `calculate_taiwan_freight()` 邏輯：(1) DB 可調車型費率表 `freight_rate_config`（7 種車型，含起步價/每公里費/分帳比例）；(2) 偏遠地區關鍵字自動加成 `freight_remote_areas`（12 個偏遠地區，如台東×1.3、澎湖×1.5）；(3) 附加服務費用表 `freight_surcharge_config`（搬運上樓、油壓板車、夜間配送+20%、假日+30% 等）；(4) 財務分帳（老闆利潤%/司機%可調）；(5) 使用現有 `distanceService.ts`（Google Maps Distance Matrix + Haversine 備援）計算路線距離。API：POST `/api/freight-quote/calculate`（核心計算）、GET `/api/freight-quote/config`（費率設定）、PUT endpoints（線上更新費率）。前端支援即時報價計算機、費率管理表格、附加服務清單三個子頁。
*   **Firebase 雲端金庫同步:** Admin 系統管理 tab 新增「🔥 雲端金庫」頁面 (`FirebaseSyncTab.tsx`)，可批次推送派車單至 Firebase Firestore 的 `orders`（完整派車資訊）和 `accounting`（帳務備份）兩個 collection。後端 `firebaseSync.ts` 提供：GET `/api/firebase-sync/config-status`（確認連線）、GET `/api/firebase-sync/preview`（預覽訂單）、POST `/api/firebase-sync/push`（批次推送，支援 upsert / new_only 模式）、POST `/api/firebase-sync/push-single`（單筆即時推送）。需設定環境變數 `FIREBASE_SERVICE_ACCOUNT`（Firebase service account JSON 全文）。Firestore 文件 ID 使用 order_no，accounting 文件 ID 為 `{order_no}_acc`。
*   **Google Sheets 財務備份匯出:** Admin 系統管理 tab 新增「Sheets備份」頁面 (`SheetsBackupTab.tsx`)，可將已完成訂單的財務資料（日期、訂單號、客戶名稱、客戶應付 total_fee、司機應得 driver_pay、平台利潤 profit_amount）匯出至指定 Google 試算表。後端 `sheetsExport.ts` 提供三個 API：GET `/api/sheets-export/config-status`（確認憑證狀態）、GET `/api/sheets-export/preview`（預覽資料）、POST `/api/sheets-export/backup`（執行匯出）。需設定環境變數 `GOOGLE_SHEETS_CREDENTIALS`（service account JSON 全文）和 `GOOGLE_BACKUP_SHEET_ID`（試算表 ID），並將服務帳號 email 加為試算表編輯者。

# External Dependencies

*   **Monorepo Tool:** pnpm workspaces
*   **Package Manager:** pnpm
*   **API Framework:** Express 5
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Validation:** Zod
*   **API Codegen:** Orval
*   **Auth Library:** `jsonwebtoken`
*   **SMS Service:** Every8D
*   **LINE Messaging API:** `@line/bot-sdk`
*   **Mapping/Location Services:** Google Maps API
*   **Frontend Libraries:** React, Vite, React Query, wouter
*   **Data Manipulation/Utility:** `exceljs`, `date-fns`, `lucide-react`
*   **Email Client:** Nodemailer
*   **PDF Generation:** `pdfkit`
*   **Payment Gateway:** ECPay