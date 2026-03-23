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