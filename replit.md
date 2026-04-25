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
*   **Authentication:** JWT-based system with multiple user roles, supporting SMS OTP, username/password, LINE OAuth, and centralized Google OAuth (invite-based, via `oauth_accounts` table). Yahoo/Apple OAuth reserved for future use.
*   **OAuth Account Management:** Admin can invite users by email+role at `/admin` → 🔑 OAuth 帳號 tab. API: `POST /api/auth/oauth/invite`, `GET /api/auth/oauth/accounts`, `PATCH /api/auth/oauth/accounts/:id/disable`. Requires `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` secrets.
*   **Type Safety:** Extensive TypeScript usage across the monorepo.
*   **Build System:** `esbuild` for CJS bundle generation.
*   **Error Handling:** Zod for request validation.
*   **Email Service:** Nodemailer for automated email invoicing.
*   **PDF Generation:** `pdfkit` for generating A4 electronic invoices and monthly bills.
*   **Permission Management:** Role-based access control with customizable permissions and audit logging, including zone-scoped permissions.
*   **Order Management:** Supports multi-stop deliveries, full order editing, Quick Order mode, auto-dispatch, a Dispatch Suggestion Engine, and an Auto-Routing Rules Engine.
*   **Fleet & Driver Management:** Carpool panel, Outsourcing System for partner fleets, Fleet Onboarding, Driver Rating, Driver Income Dashboard, and GPS/Service Area/Capability Settings. Includes expanded driver data fields (ID, insurance, inspection, bank details, referrer) with expiry warnings.
*   **Financials:** E-Invoice Management with auto-triggering, PDF generation, LINE push notifications, bulk monthly invoicing, void/allowance capabilities, and various payment methods. Full billing flow with AR ledger, monthly bills, and payment reconciliation.
*   **Quoting Engine:** Full-featured multi-mode pricing engine — generic (vehicle-type DB rates), Fuyong-specific (bracket pricing + zone/holiday), and Partner/Contract (per-client DB rates with 4-tier auto-detection). Auto-detects: 🏭 science parks, ⛰️ mountain areas, 🏪 warehouses/docks/airports (碼頭/機場 keywords), 🚌 remote/island areas (金門/馬祖/澎湖/離島/etc.). Returns Python-compatible `{client_name, quote, profit, distance, applied_surcharges}` format. `partner_contract_config` table: base_price / rate_per_km / park_fee / mountain_fee / special_zone_fee / remote_fee / profit_margin / tier / notes.
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
*   **加油卡代墊管理系統 (小楊車隊 fleet_id=170):** 完整的中油公司卡代墊追蹤系統。DB 表：`fuel_cards`（車牌對應加油卡主檔，card_no 可為 NULL 待補）、`fuel_card_records`（每筆加油記錄含 cpc_rebate 1% 計算、is_deducted 月結扣款狀態）。API (`artifacts/api-server/src/routes/fuelCards.ts`)：GET/POST `/api/fuel-cards/cards`、PATCH `/api/fuel-cards/cards/:cardId`、POST `/api/fuel-cards/record`、GET `/api/fuel-cards/monthly-report`。前端 (`artifacts/logistics/src/pages/admin/FuelCardManager.tsx`)：三個分頁 — 加油卡清單（KPI 卡、表格含編輯 dialog）、新增記錄（含 1% 退款即時預覽）、月用油報表（月份導航 + CSV 匯出）。側欄新增「⛽ 加油管理」連結（路由 `/fuel-cards`）。owner_cash_settlements 自動從 fuel_card_records 拉取油費扣款。注意：前端 API 呼叫必須使用 `apiUrl()` 而非 `getApiUrl()`，前者加 `/api` 前綴，後者不加。
*   **Google Sheets 財務備份匯出:** Admin 系統管理 tab 新增「Sheets備份」頁面 (`SheetsBackupTab.tsx`)，可將已完成訂單的財務資料（日期、訂單號、客戶名稱、客戶應付 total_fee、司機應得 driver_pay、平台利潤 profit_amount）匯出至指定 Google 試算表。後端 `sheetsExport.ts` 提供三個 API：GET `/api/sheets-export/config-status`（確認憑證狀態）、GET `/api/sheets-export/preview`（預覽資料）、POST `/api/sheets-export/backup`（執行匯出）。需設定環境變數 `GOOGLE_SHEETS_CREDENTIALS`（service account JSON 全文）和 `GOOGLE_BACKUP_SHEET_ID`（試算表 ID），並將服務帳號 email 加為試算表編輯者。
*   **雙推播通知系統 (LINE + Atoms APP):** 完整的六觸發點雙通道推播架構。新增 DB 表 `push_notifications`（記錄每筆推播狀態：id/driver_id/fleet_id/channel/type/title/body/data/line_user_id/atoms_account/sent_at/read_at/status/line_status/atoms_status/error）。新增 DB 欄位：`fleet_drivers.inspection_expire_date`（驗車到期日）、`fleet_drivers.insurance_expire_date`（保險到期日）、`fusingao_fleets.contract_expire_date`（合約到期日）、`fusingao_fleets.line_id`（車主 LINE ID）。
    - **核心模組** `lib/pushNotification.ts`：`sendPush()` / `sendBatchPush()` — LINE 使用 Flex Message（彩色標頭、路線卡片、行動按鈕）、Atoms 使用 HTTP POST 到 `ATOMS_WEBHOOK_URL`，兩者同步執行並寫入 push_notifications 記錄。
    - **排程模組** `lib/scheduledNotifications.ts`：`startScheduledNotifications()` 啟動兩個定時器 — (1) 07:00 TW 今日班表推播（查 dispatch_order_routes × fleet_drivers，按司機分組推送）；(2) 09:00 TW 到期提醒（驗車/保險到期前 30 天、合約到期前 5 天）。同時匯出 `pushScheduleChange()`（班表變動即時）、`pushTaskAssigned()`（新任務指派即時）、`pushSettlementComplete()`（月結完成即時）供路由層呼叫。
    - **六觸發點**：①07:00 每日班表（排程）②班表變動即時（可透過 API 觸發）③新任務指派（hook 進 PUT /fusingao/routes/:id/assign-driver）④月結完成（hook 進 POST /fusingao/admin/cash-settlements/:id/mark-paid）⑤合約45天到期前5天（排程 09:00）⑥驗車/保險到期前30天（排程 09:00）。
    - **API** `routes/notifications.ts`（掛載 `/api/notifications`）：POST `/send`（批次推播，支援 driver_ids / line_user_ids / 廣播）、POST `/trigger-daily`（手動觸發今日班表）、POST `/trigger-expiry`（手動觸發到期提醒）、GET `/driver/:id`（司機推播記錄）、PATCH `/:id/read`（標記已讀）、GET `/stats`（發送數/已讀率/各通道統計，支援 1d/7d/30d）、GET `/`（全部列表）。
    - **環境變數**：使用既有 `LINE_CHANNEL_ACCESS_TOKEN` 和 `ATOMS_WEBHOOK_URL`，無需新增。

*   **地點智慧系統 (Location Intelligence DB):** 持久化 `location_history` + `customer_addresses` 資料表，實現地址智能自動完成、智慧定價建議、司機熟悉度查詢。
    - **DB 資料表：** `location_history`（UNIQUE address, visit_count, customer_ids JSONB, driver_ids JSONB, place_name/type, city/district, lat/lng）；`customer_addresses`（UNIQUE customer_id+address, use_count, is_favorite, label）。GIN index on address text search。
    - **自動匯入（冪等）：** `ensureLocationTables.ts` 首次啟動時從 orders（pickup+delivery）、dispatch_order_routes（含 GPS 座標）、shopee_route_stops/shopee_week_route_stops（店鋪地址）批次匯入，並自動從地址字串解析縣市（台北市/新北市/桃園市等 22 縣市）。保護機制：table 已有資料時跳過，避免重啟後計數疊加。
    - **即時同步：** POST /orders 建立訂單後，`setImmediate` 內呼叫 `syncOrderToLocationHistory()`，自動 upsert location_history + customer_addresses，並自動從地址解析縣市。
    - **API 端點（掛載 /api/locations）：** GET `/search`（ILIKE 查 location_history）、GET `/autocomplete`（向後兼容，查 orders 含 avg_price）、GET `/frequent`（visit_count 排行）、GET `/popular`（orders 即時聚合）、GET `/route-stats`（常跑路線 O-D 對）、GET `/suggest-price`（同路線歷史均價）、GET `/driver-familiarity`（熟悉司機排行）、GET `/customer-history`（客戶歷史路線）、GET `/customer/:id`（customer_addresses + location_history join）、PATCH `/customer/:id/favorite`（收藏切換）、GET `/stats`（總覽+城市分佈+TOP10）、GET `/address-detail`（單地址完整資訊）、POST `/import`（批次匯入 JSON）、PATCH `/:id`（編輯商業資訊）。

*   **Bug Fixes & Enhancements (2026-04):**
    - **Bug 1 進入管理按鈕：** `FleetAutoLogin` 由 `loginTemp`（僅 React state）改為 `login`（寫入 localStorage），修復 `window.location.href` 全頁重載後 session 遺失導致跳至 /login/fleet 的問題。
    - **Bug 2 司機匯入 CSV/Excel：** `import-file` INSERT 加入 `vehicle_type`（預設 '一般'），解決因缺少欄位被 catch 靜默跳過的 bug；CSV/Excel 兩個 branch 均已補齊 `車型` 欄位解析。
    - **authHeaders 補全：** `artifacts/logistics/src/lib/api.ts` 新增 `authHeaders()` export（使用 `auth-jwt` key），AutoDispatchTab 等 import 此函數的元件現在可正確帶 JWT。
    - **FusingaoSheetSyncTab auth key：** 由錯誤的 `token` 改為正確的 `auth-jwt`。
    - **AutoDispatchTab 日期時區：** `todayStr()` 改用台灣時區（`sv-SE` locale + `Asia/Taipei`），避免 UTC 凌晨顯示昨日日期。
    - **CashSettlement & FourLayerSummary 導覽：** FusingaoPortal tab bar 末端新增「💵 現金結算」和「📊 四層總覽」連結按鈕（紫色區分，點擊 navigate 至獨立路由）；兩個頁面 header 均新增「← 返回」按鈕回到 /fusingao。

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