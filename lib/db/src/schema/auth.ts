import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const otpsTable = pgTable('otps', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  otp: varchar('otp', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const lineAccountsTable = pgTable('line_accounts', {
  id: serial('id').primaryKey(),
  userType: varchar('user_type', { length: 20 }).notNull(),
  userRefId: text('user_ref_id').notNull(),
  lineUserId: text('line_user_id').notNull().unique(),
  displayName: text('display_name'),
  pictureUrl: text('picture_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
