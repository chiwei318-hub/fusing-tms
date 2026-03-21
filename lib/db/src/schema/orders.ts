import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const orderStatusEnum = ["pending", "assigned", "in_transit", "delivered", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const feeStatusEnum = ["unpaid", "paid", "invoiced"] as const;
export type FeeStatus = typeof feeStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  cargoDescription: text("cargo_description").notNull(),
  cargoWeight: real("cargo_weight"),
  status: text("status").notNull().default("pending"),
  driverId: integer("driver_id").references(() => driversTable.id),
  notes: text("notes"),
  basePrice: real("base_price"),
  extraFee: real("extra_fee"),
  totalFee: real("total_fee"),
  feeStatus: text("fee_status").notNull().default("unpaid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
