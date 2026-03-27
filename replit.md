# Overview

This project is a pnpm workspace monorepo using TypeScript for a logistics dispatch management system. Its primary goal is to automate and streamline logistics operations, encompassing customer order management, driver and fleet management, dispatch, and financial reporting. Key capabilities include customer order handling, efficient order dispatch and tracking, comprehensive driver and fleet management tools, an admin panel for operational oversight, and an enterprise client portal. The system also supports outsourcing to partner fleets and integrates communication via LINE and an AI chatbot. The vision is to boost operational efficiency, minimize manual tasks, and provide insights through data analytics and AI, securing a competitive edge in the logistics sector.

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

The frontend for the logistics system (`artifacts/logistics`) is built with React and Vite, emphasizing a clear, functional design. Components like `StatusBadge`, `AppLayout`, and `ThemeToggle` are used for consistent UI. Admin panels are designed for intuitive data management, featuring interactive elements for dispatch, driver management, and reporting. A specialized `TaiwanAddressInput` component integrates Google Maps for enhanced address accuracy.

## Technical Implementations

*   **Monorepo Tool:** pnpm workspaces for efficient dependency management.
*   **Backend:** Express 5 handles API requests, integrated with Drizzle ORM.
*   **Database:** PostgreSQL is the primary data store, managed by Drizzle ORM.
*   **API Design:** OpenAPI 3.1 specifications define API contracts. `Orval` generates client-side API code (React Query hooks) and Zod schemas for validation.
*   **Authentication:** JWT-based system supporting multiple user roles (customer, driver, admin, enterprise) with SMS OTP, username/password, and LINE OAuth login.
*   **Type Safety:** Extensive TypeScript usage across the monorepo, leveraging composite projects.
*   **Build System:** `esbuild` for CJS bundle generation.
*   **Error Handling:** Zod is used for request validation.

## Feature Specifications

*   **Admin Panel:** Offers 11 core tabs including Order Dispatch, Driver/Customer Management, Reporting, Vehicle Type Database, Smart Scheduling, Heat Maps, Fleet Maps, Carpool Panel, AI Analysis (forecasting, auto-dispatch, dynamic pricing), AI Customer Service, Payment Gateway, Freight Quotation, Route Pricing, Vehicle Cost Calculator, and comprehensive Permission Management.
*   **Permission Management:** Role-based access control with customizable permissions and audit logging.
*   **Multi-Stop Delivery:** Supports up to 5 additional delivery stops.
*   **Order Editing:** Administrators can fully edit existing orders with real-time synchronization.
*   **Carpool Panel:** Groups pending orders, calculates AI compatibility, and manages driver assignments.
*   **Outsourcing System:** Manages partner fleets, automates order distribution, and calculates profit margins.
*   **Fleet Onboarding System:** Comprehensive system for fleet company registration and management, including status workflows, risk scoring, vehicle registries, ratings, and complaint tracking.
*   **E-Invoice Management:** Manages electronic invoices with generation, voiding, bulk monthly billing, and status tracking.
*   **Payment Methods & Cash Management:** Supports various payment methods (cash, LINE Pay, credit card, bank transfer, monthly accounts), handles payment reminders, cash reporting, and monthly statement generation for enterprises.
*   **Order Bidding/Price Comparison:** Allows fleets to bid on orders, with features for opening bids, submitting, accepting, and tracking.
*   **Driver Income Dashboard:** Provides drivers with a dashboard to track earnings, settlements, and performance metrics, including a BonusProgress widget showing monthly KPI achievement and bonus tier progress.
*   **零散客快速接單模式 (Walk-in Quick Order — COMPLETED):** Public-facing order flow requiring zero registration. DB: added `quick_order_token` (UUID, unique index) and `is_quick_order` (boolean) columns to orders table. API router `quickOrderRouter` (no auth) mounted at `/api/quick-order`: POST `/quote` (instant pricing: vehicle base_fee + distance_km × NT$35 + peak/night multiplier from pricing_config), POST `/` (create order with guest_name/phone, auto-generates UUID token, `dispatch_blocked=true` for non-cash until payment, triggers auto-dispatch immediately for cash), GET `/:token` (public order tracking by token — includes driver info post-dispatch), POST `/:token/pay` (mark paid, release dispatch_blocked, trigger auto-dispatch + LINE notification to driver/customer). Frontend pages: `QuickOrder.tsx` (4-step flow: 地址&車型, 聯絡資訊, 即時報價+付款選擇, 付款確認) with real-time quote display, vehicle type selector (5 types with descriptions and base fees), payment method selection (LINE Pay/信用卡/銀行轉帳/現金), payment simulation UI per method, and success page with copyable tracking link. `QuickTrack.tsx` (public token-based tracking page: animated 4-step progress indicator, auto-refresh every 15s, driver card with call button, address display, payment status). Landing page: replaced minimal quick-order widget with redirect button to `/quick`; added "⚡ 零散客快速接單（免登入）" green hero button. Routes: `/quick` and `/quick/track/:token` added as public routes (no RequireAuth).
*   **Performance Audit & Bonus System:** KPI tracking and incentive management for both drivers and fleet companies. DB tables: `performance_targets` (configurable KPI targets), `bonus_rules` (4-tier bronze/silver/gold/platinum bonus levels), `performance_bonuses` (bonus records: pending→approved→paid), `audit_violations` (minor/major/critical violations with penalty/appeal/resolve flow). Admin tab "績效稽核" with 5 inner tabs: 司機稽核 (driver KPI vs targets, expandable, violation logging), 車隊稽核 (fleet KPI audit), 獎金管理 (approve/pay bonuses), 違規記錄 (resolve/waive violations), 規則設定 (edit KPI targets and bonus tiers). Driver portal: BonusProgress panel in DriverIncome showing achievement %, KPI cards, tier milestones, and historical bonus list.
*   **Auto-dispatch Engine:** Automatically assigns orders to available drivers based on `pricing_config`, triggers notifications, and updates order statuses.
*   **System Config Management:** An admin UI to manage system-wide settings, including auto-dispatch, payment policies, dispatch scoring weights, rates, and peak hour settings.
*   **Admin Dashboard Charts:** Enhances the admin home page with Recharts for displaying order trends, driver status, and monthly order breakdowns.
*   **Order Custom Fields (Dynamic):** Admin can define unlimited custom fields for orders (text/textarea/select/checkbox/date/number) in the "欄位管理" sub-tab of 權限管理. Fields are stored in `custom_fields` table (`formType=customer_order`). Orders table has a new `custom_field_values` (TEXT/JSON) column. The order edit dialog dynamically renders active custom fields in a purple "自訂欄位" section; values saved as JSON per order. The order detail dialog shows filled custom fields. A "欄位管理" shortcut button in the orders tab header jumps directly to the field definition page. CRUD endpoints: `GET/POST /api/admin/custom-fields`, `PATCH/DELETE /api/admin/custom-fields/:id`.
*   **Driver Rating System (Enhanced):** Full customer feedback loop after order completion. `DriverRatingDialog` component with 5-star selector, quick-tag presets per star level, text comment, and low-rating penalty notice. Backend `ratings.ts` computes reward/penalty events after each submission: 5 consecutive good → 獎勵; 3/5 consecutive bad → 警告/停職; avg ≥4.8 with 20+ ratings → 金牌司機. New DB table `driver_performance_events` stores all triggered events. Admin driver table shows avg stars + active event badge per driver; events panel below table with "標記處理" action. Driver portal home shows personal rating summary, trend bar chart, distribution by star level, and active reward/penalty notification. API endpoints: `GET /api/ratings/driver/:id/performance`, `GET /api/ratings/performance-events`, `PATCH /api/ratings/performance-events/:id/resolve`.
*   **Customer Data Field Expansion:** Extended customer records with `short_name` and `postal_code` DB columns. Both admin customer dialogs (simple "客戶" tab and full "廠商管理" tab) now include: 簡稱 (short name), 郵遞區號 (postal code), E-mail, 產業別 (industry), 通訊地址 (mailing address), 支付方式 (payment type), 結帳日 (statement day always visible). Customer list cards and rows display the short name in parentheses. Updated `CreateCustomerBody` / `UpdateCustomerBody` Zod schemas and all related API endpoints (`POST /api/customers`, `PATCH /api/customers/:id`, `PUT /api/customers/:id/profile`) to accept all new fields.
*   **Customer Notification Center:** Provides a centralized system for customer notifications regarding order status updates.
*   **Enterprise Customer Portal:** A dedicated portal for enterprise clients with features like dual-tab login, in-portal ordering with custom pricing, reorder functionality, order modification/cancellation, monthly reconciliation exports, and sub-account management.
*   **LINE Integration:** Uses `@line/bot-sdk` for driver dispatch notifications and an AI-powered customer service chatbot.
*   **Vehicle Rating System (COMPLETED):** Admin vehicle leaderboard panel (with detail dialog: stats, star distribution, driver groups, comments). Driver home shows vehicle rating card with stats, star bar chart, latest comments. Backend: `GET /api/ratings/vehicle-leaderboard`, `GET /api/ratings/vehicle/:plate` endpoints.
*   **KPI 經營儀表板 (COMPLETED):** New "KPI" admin tab (in the advanced toolbar, after 報表) powered by `GET /api/kpi/dashboard`. Aggregates 6 data sections in parallel: ① 今日/本週 — completed trips, on-time rate, overdue count, anomaly count, completion rate; ② 車輛利用率 — per-driver today/week trips, avg daily trips, idle-rate card, bar chart; ③ 毛利分析 — monthly revenue/cost/profit/margin/per-km-profit, route-level bar chart; ④ 成本結構 — fuel/toll/depreciation/commission/wait-fee pie chart + progress bars; ⑤ 應收帳款 — AR aging (current/30d/60d/90d+) bar chart, top-10 credit-exposure customer table; ⑥ 司機績效 — per-driver completed/cancelled trips, on-time rate progress bar, avg star rating, monthly revenue. Backend route: `artifacts/api-server/src/routes/kpiDashboard.ts`. Frontend: `artifacts/logistics/src/pages/admin/KPIDashboardTab.tsx` using recharts BarChart/PieChart.
*   **GPS / Service Area / Capability Settings (COMPLETED):** `drivers` table has 8 new columns: latitude, longitude, last_location_at, service_areas (JSON TEXT), can_cold_chain, can_heavy_cargo, available_time_start, available_time_end. Backend: `POST /api/drivers/:id/location`, `GET /api/drivers/:id/profile`, `GET /api/drivers/analytics`. Driver portal home: "接單能力設定" violet card with GPS one-click update, service area tag add/remove, cold-chain/heavy-cargo toggles, available time slot save. Admin: "本月司機收入排行" table panel (income, accept rate, rating, GPS dot per driver), "GPS 即時狀態" grid panel (links to Google Maps), "服務區域覆蓋" pill cloud panel — all from `/api/drivers/analytics`.

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