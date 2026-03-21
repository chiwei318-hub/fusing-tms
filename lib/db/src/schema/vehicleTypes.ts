import { pgTable, text, serial, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehicleTypesTable = pgTable("vehicle_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  lengthM: real("length_m"),
  widthM: real("width_m"),
  heightM: real("height_m"),
  volumeM3: real("volume_m3"),
  maxWeightKg: real("max_weight_kg"),
  palletCount: integer("pallet_count"),
  hasTailgate: boolean("has_tailgate").default(false),
  hasRefrigeration: boolean("has_refrigeration").default(false),
  hasDumpBody: boolean("has_dump_body").default(false),
  heightLimitM: real("height_limit_m"),
  weightLimitKg: real("weight_limit_kg"),
  cargoTypes: text("cargo_types"),
  notes: text("notes"),
  baseFee: real("base_fee"),
});

export const insertVehicleTypeSchema = createInsertSchema(vehicleTypesTable).omit({ id: true });
export type InsertVehicleType = z.infer<typeof insertVehicleTypeSchema>;
export type VehicleType = typeof vehicleTypesTable.$inferSelect;
