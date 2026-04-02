import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const orderStatusEnum = ["pending", "assigned", "in_transit", "delivered", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const feeStatusEnum = ["unpaid", "paid", "invoiced"] as const;
export type FeeStatus = typeof feeStatusEnum[number];

export const payoutStatusEnum = ["unpaid", "paid"] as const;
export type PayoutStatus = typeof payoutStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  // 委託方
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  // 收貨方
  pickupDate: text("pickup_date"),
  pickupTime: text("pickup_time"),
  requiredLicense: text("required_license"),
  pickupContactName: text("pickup_contact_name"),
  pickupAddress: text("pickup_address").notNull(),
  pickupContactPerson: text("pickup_contact_person"),
  // 到貨方
  deliveryDate: text("delivery_date"),
  deliveryTime: text("delivery_time"),
  deliveryContactName: text("delivery_contact_name"),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryContactPerson: text("delivery_contact_person"),
  // 貨物
  cargoDescription: text("cargo_description").notNull(),
  cargoQuantity: text("cargo_quantity"),
  cargoWeight: real("cargo_weight"),
  cargoLengthM: real("cargo_length_m"),
  cargoWidthM: real("cargo_width_m"),
  cargoHeightM: real("cargo_height_m"),
  region: text("region"),
  // 車輛需求
  requiredVehicleType: text("required_vehicle_type"),
  needTailgate: text("need_tailgate"),
  needHydraulicPallet: text("need_hydraulic_pallet"),
  specialRequirements: text("special_requirements"),
  // 系統
  status: text("status").notNull().default("pending"),
  driverId: integer("driver_id").references(() => driversTable.id),
  notes: text("notes"),
  basePrice: real("base_price"),
  extraFee: real("extra_fee"),
  totalFee: real("total_fee"),
  feeStatus: text("fee_status").notNull().default("unpaid"),
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
  distanceKm: real("distance_km"),                          // estimated route distance
  pricingBreakdown: text("pricing_breakdown"),              // JSON {base,weight,volume,time,special,surcharge}
  priceLocked: boolean("price_locked").notNull().default(false),
  priceLockedAt: timestamp("price_locked_at"),
  priceLockedBy: text("price_locked_by"),                   // "admin"|"driver"|"customer"
  arrivalNotifiedAt: timestamp("arrival_notified_at"),      // when arrival notif was sent
  waitMinutes: real("wait_minutes").default(0),             // wait time at pickup
  surchargeAmount: real("surcharge_amount").default(0),     // anomaly surcharges total
  surchargeReason: text("surcharge_reason"),                // comma-sep reasons
  // Custom fields (JSON: { [fieldKey]: value })
  customFieldValues: text("custom_field_values"),
  // 接單人員（後台開單時記錄哪位員工建立）
  operatorName: text("operator_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable, {
  status: z.enum(orderStatusEnum).default("pending"),
  feeStatus: z.enum(feeStatusEnum).default("unpaid"),
  driverPaymentStatus: z.enum(payoutStatusEnum).default("unpaid"),
  franchiseePaymentStatus: z.enum(payoutStatusEnum).default("unpaid"),
}).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
