import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driverStatusEnum = ["available", "busy", "offline", "on_leave"] as const;
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
  vehicleBrand: text("vehicle_brand"),
  vehicleTonnage: text("vehicle_tonnage"),
  vehicleBodyType: text("vehicle_body_type"),
  hasTailgate: boolean("has_tailgate").default(false),
  maxLoadKg: real("max_load_kg"),
  maxVolumeCbm: real("max_volume_cbm"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankAccount: text("bank_account"),
  bankAccountName: text("bank_account_name"),
  creditScore: integer("credit_score").default(100),
  rating: real("rating").default(5.0),
  ratingCount: integer("rating_count").default(0),
  canColdChain: boolean("can_cold_chain").default(false),
  franchiseeId: integer("franchisee_id"),
  isFranchisee: boolean("is_franchisee").generatedAlwaysAs(sql`franchisee_id IS NOT NULL`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDriverSchema = createInsertSchema(driversTable, {
  status: z.enum(driverStatusEnum).default("available"),
  driverType: z.enum(driverTypeEnum).optional().nullable(),
}).omit({ id: true, createdAt: true }); // isFranchisee 是 GENERATED 欄位，createInsertSchema 自動排除
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
