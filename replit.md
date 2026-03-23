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
*   **Driver Rating System:** Allows customers to rate drivers after order completion, influencing dispatch quality metrics.
*   **Customer Notification Center:** Provides a centralized system for customer notifications regarding order status updates.
*   **Enterprise Customer Portal:** A dedicated portal for enterprise clients with features like dual-tab login, in-portal ordering with custom pricing, reorder functionality, order modification/cancellation, monthly reconciliation exports, and sub-account management.
*   **LINE Integration:** Uses `@line/bot-sdk` for driver dispatch notifications and an AI-powered customer service chatbot.

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