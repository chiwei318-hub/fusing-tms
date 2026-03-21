import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const orderStatusEnum = ["pending", "assigned", "in_transit", "delivered", "cancelled"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const feeStatusEnum = ["unpaid", "paid", "invoiced"] as const;
export type FeeStatus = typeof feeStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  // 委託方
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
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
  // Carpool grouping
  orderGroupId: text("order_group_id"),
  // Customer payment fields
  paymentNote: text("payment_note"),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
