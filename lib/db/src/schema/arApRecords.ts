import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const arApRecordsTable = pgTable("ar_ap_records", {
  id:               serial("id").primaryKey(),
  orderId:          integer("order_id").notNull().unique(),
  orderNo:          text("order_no"),
  completedAt:      timestamp("completed_at"),
  customerName:     text("customer_name"),
  pickupAddress:    text("pickup_address"),
  deliveryAddress:  text("delivery_address"),
  vehicleType:      text("vehicle_type"),
  distanceKm:       numeric("distance_km"),
  arAmount:         numeric("ar_amount").notNull().default("0"),
  apDriver:         numeric("ap_driver").notNull().default("0"),
  apEquipment:      numeric("ap_equipment").notNull().default("0"),
  apTotal:          numeric("ap_total").notNull().default("0"),
  netProfit:        numeric("net_profit").notNull().default("0"),
  profitMarginPct:  numeric("profit_margin_pct"),
  status:           text("status").notNull().default("pending"),
  notes:            text("notes"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
});

export const insertArApRecordSchema = createInsertSchema(arApRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArApRecord = z.infer<typeof insertArApRecordSchema>;
export type ArApRecord = typeof arApRecordsTable.$inferSelect;
