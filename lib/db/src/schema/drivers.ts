import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverStatusEnum = ["available", "busy", "offline"] as const;
export type DriverStatus = typeof driverStatusEnum[number];

export const driverTypeEnum = ["self", "affiliated", "external"] as const;
export type DriverType = typeof driverTypeEnum[number];

export const driversTable = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  licensePlate: text("license_plate").notNull(),
  status: text("status").notNull().default("available"),
  driverType: text("driver_type"),
  username: text("username"),
  password: text("password"),
  lineUserId: text("line_user_id"),
  engineCc: integer("engine_cc"),
  vehicleYear: integer("vehicle_year"),
  vehicleTonnage: text("vehicle_tonnage"),
  vehicleBodyType: text("vehicle_body_type"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankAccount: text("bank_account"),
  bankAccountName: text("bank_account_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, createdAt: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
