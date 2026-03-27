import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const paymentMethodEnum = ["cash", "bank_transfer", "line_pay", "credit_card"] as const;
export type PaymentMethod = typeof paymentMethodEnum[number];

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  amount: real("amount").notNull(),
  method: text("method").notNull().default("cash"),
  note: text("note"),
  collectedBy: text("collected_by"),
  receiptNumber: text("receipt_number"),
  receiptCompanyTitle: text("receipt_company_title"),
  receiptTaxId: text("receipt_tax_id"),
  isVoided: boolean("is_voided").notNull().default(false),
  voidReason: text("void_reason"),
  notificationSentAt: timestamp("notification_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable, {
  method: z.enum(paymentMethodEnum).default("cash"),
}).omit({ id: true, createdAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
