import { pgTable, text, serial, timestamp, integer, real, boolean, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const orderStatusEnum = ["pending", "assigned", "in_transit", "delivered", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

/** TMS 生命週期狀態（比 status 更細粒度） */
export const tmsStatusEnum = ["pending", "accepted", "picking", "delivered", "settled", "cancelled"] as const;
export type TmsStatus = typeof tmsStatusEnum[number];

export const feeStatusEnum = ["unpaid", "paid", "invoiced"] as const;
export type FeeStatus = typeof feeStatusEnum[number];

export const payoutStatusEnum = ["unpaid", "paid"] as const;
export type PayoutStatus = typeof payoutStatusEnum[number];

export const invoiceStatusEnum = ["none", "pending", "issued", "paid"] as const;
export type InvoiceStatus = typeof invoiceStatusEnum[number];

export const sourceChannelEnum = ["website", "line", "enterprise", "monthly", "manual", "route_import", "api"] as const;
export type SourceChannel = typeof sourceChannelEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNo: text("order_no"),              // 人類可讀訂單編號 e.g. FY20260406-0001 (DB trigger 自動生成)
  // 委託方
  customerId: integer("customer_id"),     // FK → customers.id (企業客戶，個人客戶為 null)
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  // 收貨方
  pickupDate: text("pickup_date"),
  pickupTime: text("pickup_time"),
  requiredLicense: text("required_license"),
  pickupContactName: text("pickup_contact_name"),
  pickupCity: text("pickup_city"),
  pickupDistrict: text("pickup_district"),
  pickupAddress: text("pickup_address").notNull(),
  pickupContactPerson: text("pickup_contact_person"),
  // 到貨方
  deliveryDate: text("delivery_date"),
  deliveryTime: text("delivery_time"),
  deliveryContactName: text("delivery_contact_name"),
  deliveryCity: text("delivery_city"),
  deliveryDistrict: text("delivery_district"),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryContactPerson: text("delivery_contact_person"),
  // 貨物
  cargoName: text("cargo_name"),
  cargoDescription: text("cargo_description").notNull(),
  cargoQuantity: text("cargo_quantity"),
  qty: integer("qty"),
  cargoWeight: real("cargo_weight"),
  grossWeight: real("gross_weight"),
  cargoLengthM: real("cargo_length_m"),
  cargoWidthM: real("cargo_width_m"),
  cargoHeightM: real("cargo_height_m"),
  region: text("region"),
  // 車輛需求
  requiredVehicleType: text("required_vehicle_type"),
  vehicleType: text("vehicle_type"),         // 實際派車車型（可與需求不同）
  needTailgate: text("need_tailgate"),
  needHydraulicPallet: text("need_hydraulic_pallet"),
  specialRequirements: text("special_requirements"),
  // ── 路線正式欄位（取代 notes regex 解析）──────────────────────────────────
  routeId: text("route_id"),            // 路線代號 e.g. FN-01-395-1
  routePrefix: text("route_prefix"),    // 路線前綴 e.g. FN
  stationCount: integer("station_count"), // 站數
  shopeeDriverId: text("shopee_driver_id"), // 蝦皮司機工號
  dispatchDock: text("dispatch_dock"),   // 碼頭編號
  // ── 車隊 ─────────────────────────────────────────────────────────────────
  fleetId: integer("fleet_id"),           // 車隊ID（通用）
  fleetDriverId: integer("fleet_driver_id"), // 車隊司機ID
  fusingaoFleetId: integer("fusingao_fleet_id"), // 富詠車隊ID
  teamId: integer("team_id"),             // 班組ID
  zoneId: integer("zone_id"),             // 派送區域ID
  monthlyBillId: integer("monthly_bill_id"), // 月結帳單ID
  // 系統
  status: text("status").notNull().default("pending"),
  orderStatus: text("order_status"),     // TMS 生命週期: pending/accepted/picking/delivered/settled/cancelled
  isColdChain: boolean("is_cold_chain").notNull().default(false),  // 是否冷鏈
  driverId: integer("driver_id").references(() => driversTable.id),
  notes: text("notes"),                  // 純備註，不再存結構資料
  basePrice: real("base_price"),
  extraFee: real("extra_fee"),
  totalFee: real("total_fee"),
  quoteAmount: real("quote_amount"),     // 報價金額
  costAmount: real("cost_amount"),       // 成本金額
  profitAmount: real("profit_amount"),   // 毛利
  feeStatus: text("fee_status").notNull().default("unpaid"),
  paymentStatus: text("payment_status"), // 付款狀態別名
  invoiceStatus: text("invoice_status").default("none"), // 發票狀態
  // 來源渠道
  sourceChannel: text("source_channel"), // website/line/enterprise/monthly/manual/route_import/api
  assignedMethod: varchar("assigned_method", { length: 20 }), // dispatch/grab/auto
  // 快速下單 token
  quickOrderToken: text("quick_order_token"),
  quickOrderTokenKey: text("quick_order_token_key"),
  // 異常管理
  exceptionCode: text("exception_code"),
  // 自動報價
  suggestedPrice: real("suggested_price"),
  // Driver portal fields
  driverAcceptedAt: timestamp("driver_accepted_at"),
  checkInAt: timestamp("check_in_at"),
  signaturePhotoUrl: text("signature_photo_url"),
  completedAt: timestamp("completed_at"),
  // Multi-stop addresses (JSON array of {address,contactName,phone,company,notes,quantity,weight,signStatus,signedAt})
  extraPickupAddresses: text("extra_pickup_addresses"),
  extraDeliveryAddresses: text("extra_delivery_addresses"),
  // Enterprise customer
  enterpriseId: integer("enterprise_id"),
  // Carpool grouping
  orderGroupId: text("order_group_id"),
  // Customer payment fields
  paymentNote: text("payment_note"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  // 付款給司機 / 付款給加盟主
  driverPaymentStatus: text("driver_payment_status").notNull().default("unpaid"),
  franchiseePaymentStatus: text("franchisee_payment_status").notNull().default("unpaid"),
  // ── Pricing & Arrival Notification ──────────────────────
  distanceKm: real("distance_km"),
  pricingBreakdown: text("pricing_breakdown"),
  priceLocked: boolean("price_locked").notNull().default(false),
  priceLockedAt: timestamp("price_locked_at"),
  priceLockedBy: text("price_locked_by"),
  arrivalNotifiedAt: timestamp("arrival_notified_at"),
  waitMinutes: real("wait_minutes").default(0),
  surchargeAmount: real("surcharge_amount").default(0),
  surchargeReason: text("surcharge_reason"),
  // Custom fields (JSON: { [fieldKey]: value })
  customFieldValues: text("custom_field_values"),
  // 接單人員（後台開單時記錄哪位員工建立）
  operatorName: text("operator_name"),
  settledAt: timestamp("settled_at", { withTimezone: true }), // 結案時間 (TMS settled 狀態)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable, {
  status: z.enum(orderStatusEnum).default("pending"),
  feeStatus: z.enum(feeStatusEnum).default("unpaid"),
  driverPaymentStatus: z.enum(payoutStatusEnum).default("unpaid"),
  franchiseePaymentStatus: z.enum(payoutStatusEnum).default("unpaid"),
  orderStatus: z.enum(tmsStatusEnum).default("pending").optional().nullable(),
  sourceChannel: z.enum(sourceChannelEnum).optional().nullable(),
}).omit({ id: true, createdAt: true, updatedAt: true, orderNo: true }); // orderNo 由 DB trigger 自動生成
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
