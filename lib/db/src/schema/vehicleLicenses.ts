import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const licenseTypeEnum = ["職業駕照", "行車執照", "車輛保險", "其他"] as const;
export type LicenseType = typeof licenseTypeEnum[number];

export const vehicleLicensesTable = pgTable("vehicle_licenses", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id"),
  licenseType: text("license_type").notNull(),
  licenseNumber: text("license_number"),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  vehiclePlate: text("vehicle_plate"),
  issuedDate: text("issued_date"),
  expiryDate: text("expiry_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVehicleLicenseSchema = createInsertSchema(vehicleLicensesTable).omit({ id: true, createdAt: true });
export type InsertVehicleLicense = z.infer<typeof insertVehicleLicenseSchema>;
export type VehicleLicense = typeof vehicleLicensesTable.$inferSelect;
