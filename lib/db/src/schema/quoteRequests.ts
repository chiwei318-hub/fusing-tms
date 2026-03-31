import { pgTable, serial, text, integer, real, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quoteRequestsTable = pgTable("quote_requests", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  companyName: text("company_name"),
  vehicleType: text("vehicle_type").notNull(),
  cargoName: text("cargo_name"),
  cargoWeight: real("cargo_weight"),
  cargoLengthM: real("cargo_length_m"),
  cargoWidthM: real("cargo_width_m"),
  cargoHeightM: real("cargo_height_m"),
  volumeCbm: real("volume_cbm"),
  distanceKm: real("distance_km"),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  pickupDate: text("pickup_date"),
  pickupTime: text("pickup_time"),
  specialCargoes: text("special_cargoes"),
  needColdChain: boolean("need_cold_chain").default(false),
  coldChainTemp: text("cold_chain_temp"),
  waitingHours: real("waiting_hours").default(0),
  tollsFixed: integer("tolls_fixed").default(0),
  basePrice: integer("base_price"),
  distanceCharge: integer("distance_charge"),
  weightSurcharge: integer("weight_surcharge"),
  volumeSurcharge: integer("volume_surcharge"),
  specialSurcharge: integer("special_surcharge"),
  coldChainFee: integer("cold_chain_fee"),
  waitingFee: integer("waiting_fee"),
  taxAmount: integer("tax_amount"),
  profitAmount: integer("profit_amount"),
  totalAmount: integer("total_amount"),
  breakdown: text("breakdown"),
  status: text("status").notNull().default("draft"),
  expiresAt: timestamp("expires_at"),
  convertedOrderId: integer("converted_order_id"),
  notes: text("notes"),
  source: text("source").default("web"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuoteRequestSchema = createInsertSchema(quoteRequestsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;
export type QuoteRequest = typeof quoteRequestsTable.$inferSelect;
