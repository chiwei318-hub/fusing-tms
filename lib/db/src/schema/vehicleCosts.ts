import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehicleCostsTable = pgTable("vehicle_costs", {
  id: serial("id").primaryKey(),
  vehicleName: text("vehicle_name").notNull(),
  vehicleType: text("vehicle_type"),
  plateNumber: text("plate_number"),
  vehicleValue: integer("vehicle_value").default(0),
  depreciationYears: integer("depreciation_years").default(5),
  residualValue: integer("residual_value").default(0),
  fuelConsumptionPer100km: real("fuel_consumption_per_100km").default(10),
  fuelPricePerLiter: real("fuel_price_per_liter").default(32),
  licenseTaxYearly: integer("license_tax_yearly").default(0),
  fuelTaxYearly: integer("fuel_tax_yearly").default(0),
  maintenanceMonthly: integer("maintenance_monthly").default(0),
  wearMonthly: integer("wear_monthly").default(0),
  driverSalaryMonthly: integer("driver_salary_monthly").default(0),
  insuranceYearly: integer("insurance_yearly").default(0),
  otherMonthly: integer("other_monthly").default(0),
  workingDaysMonthly: integer("working_days_monthly").default(25),
  tripsPerDay: integer("trips_per_day").default(2),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVehicleCostSchema = createInsertSchema(vehicleCostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicleCost = z.infer<typeof insertVehicleCostSchema>;
export type VehicleCost = typeof vehicleCostsTable.$inferSelect;
