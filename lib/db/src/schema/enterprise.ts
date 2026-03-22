import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const enterpriseAccountsTable = pgTable("enterprise_accounts", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  accountCode: text("account_code").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  contactPerson: text("contact_person").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  taxId: text("tax_id"),
  address: text("address"),
  // Billing
  billingType: text("billing_type").notNull().default("prepaid"), // "monthly" | "prepaid"
  creditLimit: real("credit_limit").notNull().default(0),
  // Perks
  discountPercent: real("discount_percent").notNull().default(0),
  priorityDispatch: boolean("priority_dispatch").notNull().default(false),
  exclusiveNote: text("exclusive_note"),
  // Status
  status: text("status").notNull().default("active"), // "active" | "suspended"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const enterpriseSavedTemplatesTable = pgTable("enterprise_saved_templates", {
  id: serial("id").primaryKey(),
  enterpriseId: integer("enterprise_id").references(() => enterpriseAccountsTable.id).notNull(),
  nickname: text("nickname").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  deliveryAddress: text("delivery_address"),
  cargoDescription: text("cargo_description"),
  vehicleType: text("vehicle_type"),
  specialRequirements: text("special_requirements"),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEnterpriseAccountSchema = createInsertSchema(enterpriseAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEnterpriseAccount = z.infer<typeof insertEnterpriseAccountSchema>;
export type EnterpriseAccount = typeof enterpriseAccountsTable.$inferSelect;

export const insertEnterpriseTemplateSchema = createInsertSchema(enterpriseSavedTemplatesTable).omit({ id: true, createdAt: true });
export type InsertEnterpriseTemplate = z.infer<typeof insertEnterpriseTemplateSchema>;
export type EnterpriseTemplate = typeof enterpriseSavedTemplatesTable.$inferSelect;
