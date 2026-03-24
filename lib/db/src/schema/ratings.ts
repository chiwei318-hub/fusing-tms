import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const driverRatingsTable = pgTable("driver_ratings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  driverId: integer("driver_id").notNull(),
  customerId: integer("customer_id"),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  licensePlate: text("license_plate"),  // vehicle plate at time of rating
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DriverRating = typeof driverRatingsTable.$inferSelect;

export const customerNotificationsTable = pgTable("customer_notifications", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  orderId: integer("order_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CustomerNotification = typeof customerNotificationsTable.$inferSelect;
