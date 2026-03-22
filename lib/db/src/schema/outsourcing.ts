import {
  pgTable, text, serial, timestamp, integer, real, boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/* ─── 合作車隊 ─────────────────────────────────── */
export const partnerFleetsTable = pgTable("partner_fleets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person").notNull(),
  phone: text("phone").notNull(),
  lineGroupId: text("line_group_id"),
  regions: text("regions"),           // JSON string: string[]
  vehicleTypes: text("vehicle_types"), // JSON string: string[]
  rateType: text("rate_type").notNull().default("flat"), // "flat" | "per_km"
  baseRate: real("base_rate").notNull().default(0),      // 基本報價
  commissionType: text("commission_type").notNull().default("percent"), // "percent" | "fixed"
  commissionValue: real("commission_value").notNull().default(0), // % or NTD
  profitAlertThreshold: real("profit_alert_threshold").default(10), // min profit %
  reliabilityScore: real("reliability_score").default(80),
  totalOrders: integer("total_orders").notNull().default(0),
  completedOrders: integer("completed_orders").notNull().default(0),
  autoAssign: boolean("auto_assign").notNull().default(false),
  status: text("status").notNull().default("active"), // "active" | "suspended"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPartnerFleetSchema = createInsertSchema(partnerFleetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPartnerFleet = z.infer<typeof insertPartnerFleetSchema>;
export type PartnerFleet = typeof partnerFleetsTable.$inferSelect;

/* ─── 外包轉單紀錄 ─────────────────────────────── */
export const outsourcedOrdersTable = pgTable("outsourced_orders", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  fleetId: integer("fleet_id").references(() => partnerFleetsTable.id),
  // Pricing
  transferPrice: real("transfer_price").notNull().default(0), // 對客戶收款
  fleetPrice: real("fleet_price").notNull().default(0),       // 付給車隊
  commissionType: text("commission_type").notNull().default("percent"),
  commissionValue: real("commission_value").notNull().default(0),
  profit: real("profit").notNull().default(0),        // transferPrice - fleetPrice
  profitPercent: real("profit_percent").notNull().default(0),
  profitAlert: boolean("profit_alert").notNull().default(false),
  // Status
  status: text("status").notNull().default("pending_notify"),
  // "pending_notify" | "notified" | "accepted" | "rejected" | "in_transit" | "delivered" | "cancelled"
  // Fleet driver info (filled after acceptance)
  fleetDriverName: text("fleet_driver_name"),
  fleetDriverPhone: text("fleet_driver_phone"),
  fleetDriverPlate: text("fleet_driver_plate"),
  // Timestamps
  notificationSentAt: timestamp("notification_sent_at"),
  fleetAcceptedAt: timestamp("fleet_accepted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOutsourcedOrderSchema = createInsertSchema(outsourcedOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutsourcedOrder = z.infer<typeof insertOutsourcedOrderSchema>;
export type OutsourcedOrder = typeof outsourcedOrdersTable.$inferSelect;

/* ─── 自動分單設定 (單筆設定) ─────────────────── */
export const autoDispatchSettingsTable = pgTable("auto_dispatch_settings", {
  id: serial("id").primaryKey(),
  selfFleetFirst: boolean("self_fleet_first").notNull().default(true),
  autoOutsourceWhenFull: boolean("auto_outsource_when_full").notNull().default(false),
  autoOutsourceLowProfit: boolean("auto_outsource_low_profit").notNull().default(false),
  lowProfitThreshold: real("low_profit_threshold").notNull().default(15),   // %
  defaultProfitAlertThreshold: real("default_profit_alert_threshold").notNull().default(10), // %
  preferredFleetId: integer("preferred_fleet_id"),
  lineNotifyEnabled: boolean("line_notify_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AutoDispatchSettings = typeof autoDispatchSettingsTable.$inferSelect;
