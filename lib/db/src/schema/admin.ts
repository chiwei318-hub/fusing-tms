import {
  pgTable, serial, text, boolean, jsonb, timestamp, integer, varchar,
} from 'drizzle-orm/pg-core';

export const adminRoles = pgTable('admin_roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  permissions: jsonb('permissions').notNull().$type<Record<string, Record<string, boolean>>>(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 200 }),
  roleId: integer('role_id').references(() => adminRoles.id),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const customFields = pgTable('custom_fields', {
  id: serial('id').primaryKey(),
  formType: varchar('form_type', { length: 50 }).notNull(),
  fieldKey: varchar('field_key', { length: 100 }).notNull(),
  fieldLabel: varchar('field_label', { length: 200 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(),
  options: jsonb('options').$type<string[]>(),
  isRequired: boolean('is_required').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  operatorName: varchar('operator_name', { length: 100 }).notNull().default('系統'),
  operatorRole: varchar('operator_role', { length: 100 }).notNull().default('system'),
  action: varchar('action', { length: 50 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 100 }),
  resourceLabel: varchar('resource_label', { length: 500 }),
  description: text('description'),
  ipAddress: varchar('ip_address', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
