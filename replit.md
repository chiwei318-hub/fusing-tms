# Overview

This project is a pnpm workspace monorepo utilizing TypeScript for a logistics dispatch management system. Its core purpose is to streamline and automate various aspects of logistics operations, from customer order placement to driver management, dispatch, and financial reporting.

**Key capabilities include:**

*   **Customer Order Management:** Facilitates customer order entry with detailed pickup, delivery, and cargo specifications.
*   **Order Dispatch & Tracking:** Enables efficient assignment of orders to drivers, real-time tracking of transport status, and multi-stop delivery management.
*   **Driver & Fleet Management:** Provides tools for managing driver profiles, vehicle types, and real-time fleet monitoring.
*   **Admin & Backend Operations:** Offers a comprehensive admin panel for order dispatch, driver and customer CRUD, reporting, and advanced features like smart scheduling and AI-powered analytics.
*   **Enterprise Solutions:** Includes a dedicated portal for enterprise clients with features like quick ordering, account management, and detailed reports.
*   **Outsourcing & Monetization:** Supports outsourcing orders to partner fleets with profit management and automated dispatch settings.
*   **Integrated Communication:** Leverages LINE for driver dispatch notifications and an AI-powered customer service chatbot.

The system aims to enhance operational efficiency, reduce manual effort, and provide valuable insights through data analysis and AI, ultimately offering a competitive edge in the logistics market.

# User Preferences

*   I want iterative development.
*   Please provide detailed explanations for complex features.
*   Ask before making major changes to the project structure or core functionalities.
*   Ensure all new features are accompanied by relevant API endpoints and database schema updates.
*   Do not make changes to the `artifacts/logistics/src/components/TaiwanAddressInput.tsx` file without explicit instruction.
*   Do not make changes to the `lib/api-spec` directory or its contents without explicit instruction.

# System Architecture

The project is structured as a pnpm workspace monorepo, separating applications (`artifacts/`) from shared libraries (`lib/`) and utility scripts (`scripts/`). It uses Node.js 24, pnpm, and TypeScript 5.9.

## UI/UX Decisions

The frontend for the logistics system (`artifacts/logistics`) is built with React and Vite. It utilizes a clear, functional design with components like `StatusBadge`, `AppLayout`, and `ThemeToggle`. Admin tabs are designed for intuitive navigation and data management, featuring interactive elements for order dispatch, driver management, and reporting. The `TaiwanAddressInput` component provides a flexible and intelligent address input experience with smart search and structured input modes, integrating Google Maps for enhanced location accuracy.

## Technical Implementations

*   **Monorepo Tool:** pnpm workspaces for efficient dependency management and code sharing.
*   **Backend:** Express 5 handles API requests, integrated with Drizzle ORM for database interactions.
*   **Database:** PostgreSQL is used as the primary data store, with schema defined and managed by Drizzle ORM.
*   **API Design:** OpenAPI 3.1 specification defines API contracts. `Orval` is used for client-side API code generation (React Query hooks) and Zod schema generation for validation.
*   **Authentication:** JWT-based authentication system supporting multiple user roles (customer, driver, admin, enterprise). Login mechanisms include SMS OTP, username/password, and LINE OAuth.
*   **Type Safety:** Comprehensive TypeScript usage across the monorepo, leveraging composite projects for efficient type checking and declaration emission.
*   **Build System:** `esbuild` for CJS bundle generation.
*   **Error Handling:** Zod for request validation.

## Feature Specifications

*   **Admin Panel:** Provides 11 core admin tabs including Order Dispatch, Driver/Customer Management, Reporting, Vehicle Type Database, Smart Scheduling (LTL consolidation, return trip recommendation), Heat Maps, Fleet Maps, Carpool Panel, AI Analysis (order forecast, auto-dispatch, dynamic pricing, customer grading, revenue forecast), AI Customer Service, Payment Gateway, Freight Quotation, Route Pricing, Vehicle Cost Calculator, and comprehensive Permission Management.
*   **Permission Management:** Role-based access control with customizable permissions, audit logging, and custom field management.
*   **Multi-Stop Delivery:** Supports up to 5 extra delivery stops with detailed management in customer forms, admin edits, and driver tasks.
*   **Order Editing:** Allows administrators to fully edit existing orders, including dates, addresses, cargo details, and special requirements, with real-time sync.
*   **Carpool Panel:** Groups pending orders, calculates AI compatibility scores for merging, manages group assignments, and facilitates driver assignment.
*   **Outsourcing System:** Manages partner fleets, automates order distribution, calculates profit margins, and uses LINE notifications.
*   **車隊/貨運公司入駐系統 (Fleet Onboarding System):** Full fleet company registration and management system. DB tables: `fleet_registrations` (company profile, status workflow: pending→reviewing→approved/rejected/suspended, risk_score 0-100, commission_rate), `fleet_vehicles` (per-company vehicle registry with plate/type/inspection/insurance dates), `fleet_ratings` (star ratings with auto risk recalculation), `fleet_complaints` (severity-tiered complaint tracking with resolution flow). API routes: POST `/api/fleet/register` (public, no auth), GET/PATCH `/api/fleet/registrations`, PATCH `/api/fleet/registrations/:id/status` (auto-creates `partner_fleets` entry on approve, syncs status on suspend), PATCH `/api/fleet/registrations/:id/commission`, POST/DELETE `/api/fleet/registrations/:id/vehicles`, POST `/api/fleet/ratings`, POST `/api/fleet/complaints`, PATCH `/api/fleet/complaints/:id/resolve`, GET `/api/fleet/stats`. Frontend: public 4-step wizard at `/fleet-join` (基本資料→車隊資訊→接單模式→確認送出) with success screen + application reference number. Admin panel: "車隊入駐" tab (value="fleetreg") with left-side list + right-side detail panel. Features: 6 stat cards, status filter toolbar, company detail panel with audit actions (開始審核/批准通過/拒絕/暫停/恢復接單), commission + order mode editor with profit preview, vehicle CRUD with inspection/insurance dates, ratings history, complaint filing form with severity levels. Order modes: 指派接單/搶單模式/競標比價. Risk score calculated from completion rate (from partner_fleets), average rating, warning count, complaint count.
*   **電子發票系統 (E-Invoice Management):** DB table `invoices` with fields: invoice_number, buyer_name, buyer_tax_id, seller info, amount, tax_amount, total_amount, status. API: POST `/api/invoices` (generate with auto-numbered format FY{YEAR}{MONTH}-{SEQ}), GET `/api/invoices`, GET `/api/invoices/:id`, PATCH `/api/invoices/:id/void` (void invoice), POST `/api/invoices/bulk-monthly` (auto-generate for all monthly enterprise clients), GET `/api/invoices/stats/monthly`. Frontend: "電子發票" tab in admin panel secondary tabs. Features: create dialog with buyer details, tax rate selector (0%/5%), order association, amount preview with tax breakdown, one-click monthly billing, void with confirmation, print/download button. Invoice types: receipt, b2b, monthly.
*   **競標比價系統 (Order Bidding/Price Comparison):** DB table `order_bids` (id, order_id, fleet_id, bidder_name, bid_price, vehicle_type, estimated_arrival_min, notes, status). Orders extended with `bidding_open` (boolean) + `bid_deadline` columns. API: GET `/api/orders/bids/open`, GET `/api/orders/:id/bids`, POST `/api/orders/:id/bids` (submit bid), PATCH `/api/orders/bids/:bidId/accept` (accept bid + reject others + update order price), PATCH `/api/orders/:id/bidding` (toggle open/close), GET `/api/bidding/stats`. Frontend: "競標比價" tab in admin panel. Features: 4 stat cards, 3-step flow guide, expandable order cards showing sorted bids (lowest first), "得標" accept button per bid, manual bid entry dialog for phone-in quotes.
*   **司機收入儀表板 (Driver Income Dashboard):** DB table `driver_settlements` (id, driver_id, period_start, period_end, gross/deduction/net earnings, order_count, km_total, status). `pricing_config` extended with `driver_deduction_rate` (default 15%). API: GET `/api/driver-income/leaderboard`, GET `/api/driver-income/:driverId?period=week|month|year`, GET `/api/driver-income/:driverId/settlements`, POST `/api/driver-income/settle`. Frontend: new `/driver/income` page accessible via "收入" nav item in driver layout bottom nav (5th tab with DollarSign icon). Features: period toggle (本週/本月/本年), gradient earnings card with gross/deduction/net breakdown, 4 KPI cards (completed orders/avg fee/km/rating), rating distribution bar, daily breakdown table, order history with ratings, settlement history. DB driver `driver1`/`pass1234` for testing.
*   **全自動派車引擎 (Auto-dispatch Engine):** When a new order is created (via any channel), the system automatically reads `pricing_config.auto_dispatch` flag. If enabled, it selects the lowest-load available driver, assigns the order (status → `assigned`), marks driver as busy, triggers LINE notification to driver, and creates 2 customer notifications ("訂單已建立" + "司機已指派"). Also fires on status changes to `in_transit`/`delivered` to notify customers. Admin can toggle auto-dispatch via the System Settings UI.
*   **系統設定 UI (System Config Management):** New "系統設定" tab in admin panel. All `pricing_config` rows editable via form with toggle controls for boolean keys (auto_dispatch, payment_required). Groups: 自動派車設定, 報價付款時效, 派單評分權重, 費率毛利, 尖峰夜間時段. Batch save with unsaved-changes warning. API: GET/PATCH `/api/system-config`.
*   **管理首頁圖表 (Admin Dashboard Charts):** AdminHome.tsx enhanced with Recharts: LineChart for 7-day order + revenue trend, PieChart for driver status distribution, horizontal BarChart for monthly orders by vehicle type. 4 KPI cards + 8 quick-nav shortcuts + platform KPI card (avg driver rating, daily completion rate, available driver ratio). Live stats from `/api/system-config/stats/overview`.
*   **司機評分系統 (Driver Rating System):** `driver_ratings` DB table. POST `/api/ratings/order/:orderId`, GET `/api/ratings/driver/:driverId`, GET `/api/ratings/leaderboard`, GET `/api/ratings/all`. Frontend: `DriverRatingDialog.tsx` — 5-star selector with hover effects, comment textarea. Appears on delivered orders in `/customer/track`. Rating shown in admin dashboard KPIs. Average score affects dispatch quality metrics.
*   **客戶通知中心 (Customer Notification Center):** `customer_notifications` DB table. API: GET/PATCH `/api/customer-notifications/:customerId`. Frontend: `CustomerNotifications.tsx` component, `CustomerNotificationsPage.tsx` at `/customer/notifications`. Bell icon with unread badge in `CustomerLayout` header (auto-refreshes every 30s). Notifications auto-created for: order_created, order_assigned, order_in_transit, order_delivered. All created via setImmediate in orders.ts after DB writes.
*   **Enterprise Customer Portal (Full):** Dedicated web portal at `/enterprise` with: dual-tab login (company account + employee sub-account), in-portal order form with real-time enterprise pricing/discount, one-click reorder from history, order cancel/modify (before dispatch), monthly Excel reconciliation export, system notification center (order created/cancelled/delivered), sub-account management (主管/採購 roles), and unread notification badges. DB tables: `enterprise_accounts`, `enterprise_saved_templates`, `enterprise_sub_accounts`, `enterprise_notifications`.
*   **LINE Integration:** Utilizes `@line/bot-sdk` for sending dispatch notifications to drivers via Flex Messages and handling postback actions via webhooks. An AI chatbot offers guided customer service.

# External Dependencies

*   **Monorepo Tool:** pnpm workspaces
*   **Package Manager:** pnpm
*   **API Framework:** Express 5
*   **Database:** PostgreSQL
*   **ORM:** Drizzle ORM
*   **Validation:** Zod, drizzle-zod
*   **API Codegen:** Orval
*   **Auth Library:** `jsonwebtoken`
*   **SMS Service:** Every8D (for SMS OTP)
*   **LINE Messaging API:** `@line/bot-sdk`
*   **Mapping/Location Services:** Google Maps API (for address autocomplete and location data)
*   **Frontend Libraries:** React, Vite, React Query, wouter
*   **Data Manipulation/Utility:** `exceljs`, `date-fns`, `lucide-react`