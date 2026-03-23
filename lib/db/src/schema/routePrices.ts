import { pgTable, serial, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const routePricesTable = pgTable("route_prices", {
  id: serial("id").primaryKey(),
  fromLocation: text("from_location").notNull().default("桃園平鎮"),
  toLocation: text("to_location").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  basePrice: integer("base_price").notNull(),
  waitingFeePerHour: integer("waiting_fee_per_hour").default(0),
  elevatorFee: integer("elevator_fee").default(0),
  taxRate: real("tax_rate").default(5),
  heapmachineOnly: boolean("heapmachine_only").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRoutePriceSchema = createInsertSchema(routePricesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRoutePrice = z.infer<typeof insertRoutePriceSchema>;
export type RoutePrice = typeof routePricesTable.$inferSelect;
