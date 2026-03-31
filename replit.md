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
*   **Analytics & Reporting:** Performance Audit & Bonus System, KPI Dashboard for daily operations, and Fleet Analytics (demand forecast, fleet recommendation, exception analysis).
*   **Customization:** System Config Management via admin UI, and dynamic Order Custom Fields defined by administrators.
*   **Integrations:** LINE Integration for driver notifications and AI chatbot, Google Maps for location services.
*   **Enterprise Features:** Enterprise Customer Portal with advanced functionalities, and Enterprise Architecture Upgrade including Multi-depot Zone/Team structure and Master Data completeness.
*   **Workflow Enhancements:** Granular Status Flow & Exception SOP for order states, and Order Bulk Import functionality.
*   **Customer Management:** Expanded customer data fields and a Customer Notification Center.

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