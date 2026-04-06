import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";
import { ordersTable } from "./orders";

export const paymentStatusEnum = ["unpaid", "processing", "paid", "cancelled"] as const;
export type SettlementPaymentStatus = typeof paymentStatusEnum[number];

/**
 * order_settlements — 每筆訂單的利潤拆分明細
 *
 * 資金流向：
 *   total_amount (總運費)
 *     → commission_amount (平台抽成) = total_amount × commission_rate%
 *     → driver_payout   (司機應得)  = total_amount - commission_amount
 *
 * 建立時機：訂單狀態變為 delivered/settled 時由 DB 觸發器自動建立
 * 唯一約束：每筆 order_id 只有一筆結算記錄
 */
export const orderSettlementsTable = pgTable("order_settlements", {
  id: serial("id").primaryKey(),

  // 關聯
  orderId:   integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  orderNo:   text("order_no"),       // 反正規化快速查詢（同 orders.order_no）
  driverId:  integer("driver_id").references(() => driversTable.id, { onDelete: "set null" }),

  // 金額
  totalAmount:    numeric("total_amount",    { precision: 12, scale: 2 }).notNull().default("0"),
  commissionRate: numeric("commission_rate", { precision: 5,  scale: 2 }).notNull().default("15"),

  // GENERATED ALWAYS AS STORED — DB 自動計算，不可手動插入
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 })
    .generatedAlwaysAs(sql`ROUND(total_amount * commission_rate / 100, 2)`),
  platformRevenue:  numeric("platform_revenue", { precision: 12, scale: 2 })
    .generatedAlwaysAs(sql`ROUND(total_amount * commission_rate / 100, 2)`),
  driverPayout:     numeric("driver_payout",    { precision: 12, scale: 2 })
    .generatedAlwaysAs(sql`ROUND(total_amount * (100 - commission_rate) / 100, 2)`),

  // 付款
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paidAt:        timestamp("paid_at", { withTimezone: true }),
  paymentRef:    text("payment_ref"),   // 匯款單號 / 備註

  notes:     text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertOrderSettlementSchema = createInsertSchema(orderSettlementsTable, {
  paymentStatus: z.enum(paymentStatusEnum).default("unpaid"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  // commissionAmount, platformRevenue, driverPayout 是 GENERATED 欄位，createInsertSchema 自動排除
});
export type InsertOrderSettlement = z.infer<typeof insertOrderSettlementSchema>;
export type OrderSettlement = typeof orderSettlementsTable.$inferSelect;
