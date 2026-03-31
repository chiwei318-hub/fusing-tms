import { Router } from 'express';
import { db, adminRoles, adminUsers, customFields, auditLogs, driversTable, customersTable } from '@workspace/db';
import { enterpriseAccountsTable } from '@workspace/db/schema';
import { eq, desc, and, gte, lte, like, or, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';

const router = Router();

function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(s + password).digest('hex');
  return `${s}:${hash}`;
}

const ALL_MENUS = [
  'orders', 'drivers', 'customers', 'reports', 'vehicles',
  'dispatch', 'heatmap', 'fleet_map', 'carpool', 'ai',
  'outsourcing', 'payment', 'quotation', 'permissions',
];
const ALL_ACTIONS = ['view', 'edit', 'delete', 'export', 'print'];

function fullAccess() {
  return Object.fromEntries(
    ALL_MENUS.map(m => [m, Object.fromEntries(ALL_ACTIONS.map(a => [a, true]))]),
  );
}
function noAccess() {
  return Object.fromEntries(
    ALL_MENUS.map(m => [m, Object.fromEntries(ALL_ACTIONS.map(a => [a, false]))]),
  );
}
function buildPerms(allow: Record<string, (typeof ALL_ACTIONS[number])[]>) {
  const base = noAccess();
  for (const [menu, actions] of Object.entries(allow)) {
    if (base[menu]) {
      for (const act of actions) base[menu][act] = true;
    }
  }
  return base;
}

const DEFAULT_ROLES = [
  {
    name: 'boss', displayName: '老闆', isSystem: true,
    permissions: buildPerms({
      orders: ['view', 'edit', 'delete', 'export', 'print'],
      drivers: ['view', 'edit', 'delete', 'export', 'print'],
      customers: ['view', 'edit', 'delete', 'export', 'print'],
      reports: ['view', 'edit', 'delete', 'export', 'print'],
      vehicles: ['view', 'edit', 'delete', 'export', 'print'],
      dispatch: ['view', 'edit', 'delete', 'export', 'print'],
      heatmap: ['view', 'export', 'print'],
      fleet_map: ['view'],
      carpool: ['view', 'edit', 'delete', 'export', 'print'],
      ai: ['view', 'export', 'print'],
      outsourcing: ['view', 'edit', 'delete', 'export', 'print'],
      payment: ['view', 'edit', 'delete', 'export', 'print'],
      quotation: ['view', 'edit', 'print'],
      permissions: ['view'],
    }),
  },
  {
    name: 'manager', displayName: '主管', isSystem: true,
    permissions: buildPerms({
      orders: ['view', 'edit', 'delete', 'export', 'print'],
      drivers: ['view', 'edit', 'export', 'print'],
      customers: ['view', 'edit', 'export', 'print'],
      reports: ['view', 'export', 'print'],
      vehicles: ['view', 'edit'],
      dispatch: ['view', 'edit', 'export', 'print'],
      heatmap: ['view', 'export'],
      fleet_map: ['view'],
      carpool: ['view', 'edit', 'export'],
      ai: ['view', 'export'],
      outsourcing: ['view', 'edit', 'export'],
      payment: ['view', 'edit', 'export', 'print'],
      quotation: ['view', 'edit', 'print'],
    }),
  },
  {
    name: 'dispatcher', displayName: '調度員', isSystem: true,
    permissions: buildPerms({
      orders: ['view', 'edit', 'print'],
      drivers: ['view', 'edit'],
      customers: ['view'],
      vehicles: ['view'],
      dispatch: ['view', 'edit'],
      heatmap: ['view'],
      fleet_map: ['view'],
      carpool: ['view', 'edit'],
      quotation: ['view', 'print'],
    }),
  },
  {
    name: 'accountant', displayName: '會計', isSystem: true,
    permissions: buildPerms({
      orders: ['view', 'export', 'print'],
      customers: ['view'],
      reports: ['view', 'export', 'print'],
      payment: ['view', 'edit', 'export', 'print'],
      quotation: ['view', 'print'],
    }),
  },
  {
    name: 'customer_service', displayName: '客服', isSystem: true,
    permissions: buildPerms({
      orders: ['view', 'edit', 'print'],
      customers: ['view', 'edit'],
      quotation: ['view', 'print'],
    }),
  },
  {
    name: 'driver', displayName: '司機', isSystem: true,
    permissions: buildPerms({
      orders: ['view'],
    }),
  },
];

// Enterprise password: sha256(pw + "fuyi_salt_2024")
function hashEnterprisePw(pw: string) {
  return createHash('sha256').update(pw + 'fuyi_salt_2024').digest('hex');
}

async function seedDefaultData() {
  const existing = await db.select().from(adminRoles).limit(1);
  if (existing.length > 0) return;

  for (const role of DEFAULT_ROLES) {
    await db.insert(adminRoles).values(role);
  }

  const bossRole = await db.select().from(adminRoles).where(eq(adminRoles.name, 'boss')).limit(1);
  if (bossRole.length > 0) {
    await db.insert(adminUsers).values({
      username: 'admin',
      passwordHash: hashPassword('admin123'),
      displayName: '超級管理員',
      email: 'admin@furyong.com',
      roleId: bossRole[0].id,
      isSuperAdmin: true,
      isActive: true,
    }).onConflictDoNothing();
  }
}

// Ensure test accounts exist for all roles (runs every startup, safe to repeat)
async function ensureTestAccounts() {
  try {
    // ── Driver: admin / admin123 (stored as plain text) ──
    await db.insert(driversTable).values({
      name: '測試司機',
      phone: '0900000000',
      username: 'admin',
      password: 'admin123',
      vehicleType: 'truck',
      licensePlate: 'TEST-0000',
      isAvailable: true,
    } as any).onConflictDoNothing();

    // ── Customer: phone/username = "admin", password = "admin123" ──
    await db.insert(customersTable).values({
      name: '測試客戶',
      phone: 'admin',
      username: 'admin',
      password: 'admin123',
      isActive: true,
    } as any).onConflictDoNothing();

    // ── Enterprise: accountCode = "ADMIN", password = "admin123" ──
    await db.insert(enterpriseAccountsTable).values({
      accountCode: 'ADMIN',
      companyName: '測試企業帳號',
      contactPerson: '管理員',
      phone: '0900000001',
      status: 'active',
      billingType: 'monthly',
      discountPercent: 0,
      passwordHash: hashEnterprisePw('admin123'),
    } as any).onConflictDoNothing();
  } catch (e) {
    console.error('[ensureTestAccounts] error:', e);
  }
}

seedDefaultData().catch(console.error);
ensureTestAccounts().catch(console.error);

// ===== ROLES =====
router.get('/admin/roles', async (_req, res) => {
  const rows = await db.select().from(adminRoles).orderBy(adminRoles.id);
  res.json(rows);
});

router.post('/admin/roles', async (req, res) => {
  const { name, displayName, permissions } = req.body;
  if (!name || !displayName) return res.status(400).json({ error: '缺少必填欄位' });
  const perms = permissions ?? buildPerms({});
  const [row] = await db.insert(adminRoles).values({
    name, displayName, permissions: perms, isSystem: false,
  }).returning();
  await logAudit(req, 'create', 'role', String(row.id), `角色：${displayName}`);
  res.json(row);
});

router.patch('/admin/roles/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { displayName, permissions } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (displayName !== undefined) updates.displayName = displayName;
  if (permissions !== undefined) updates.permissions = permissions;
  const [row] = await db.update(adminRoles).set(updates).where(eq(adminRoles.id, id)).returning();
  if (!row) return res.status(404).json({ error: '找不到角色' });
  await logAudit(req, 'update', 'role', String(id), `角色：${row.displayName}`);
  res.json(row);
});

router.delete('/admin/roles/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: '找不到角色' });
  if (existing.isSystem) return res.status(403).json({ error: '系統內建角色不可刪除' });
  await db.delete(adminRoles).where(eq(adminRoles.id, id));
  await logAudit(req, 'delete', 'role', String(id), `角色：${existing.displayName}`);
  res.json({ success: true });
});

// ===== USERS =====
router.get('/admin/users', async (_req, res) => {
  const rows = await db.select({
    id: adminUsers.id,
    username: adminUsers.username,
    displayName: adminUsers.displayName,
    email: adminUsers.email,
    roleId: adminUsers.roleId,
    isSuperAdmin: adminUsers.isSuperAdmin,
    isActive: adminUsers.isActive,
    lastLoginAt: adminUsers.lastLoginAt,
    createdAt: adminUsers.createdAt,
    roleName: adminRoles.name,
    roleDisplayName: adminRoles.displayName,
  }).from(adminUsers).leftJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id)).orderBy(adminUsers.id);
  res.json(rows);
});

router.post('/admin/users', async (req, res) => {
  const { username, password, displayName, email, roleId, isSuperAdmin } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: '缺少必填欄位' });
  const [row] = await db.insert(adminUsers).values({
    username,
    passwordHash: hashPassword(password),
    displayName,
    email: email || null,
    roleId: roleId || null,
    isSuperAdmin: isSuperAdmin ?? false,
    isActive: true,
  }).returning();
  await logAudit(req, 'create', 'admin_user', String(row.id), `帳號：${displayName}(${username})`);
  const { passwordHash: _, ...safe } = row;
  res.json(safe);
});

router.patch('/admin/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { password, displayName, email, roleId, isSuperAdmin, isActive } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (password) updates.passwordHash = hashPassword(password);
  if (displayName !== undefined) updates.displayName = displayName;
  if (email !== undefined) updates.email = email;
  if (roleId !== undefined) updates.roleId = roleId;
  if (isSuperAdmin !== undefined) updates.isSuperAdmin = isSuperAdmin;
  if (isActive !== undefined) updates.isActive = isActive;
  const [row] = await db.update(adminUsers).set(updates).where(eq(adminUsers.id, id)).returning();
  if (!row) return res.status(404).json({ error: '找不到帳號' });
  await logAudit(req, 'update', 'admin_user', String(id), `帳號：${row.displayName}`);
  const { passwordHash: _, ...safe } = row;
  res.json(safe);
});

router.delete('/admin/users/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: '找不到帳號' });
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  await logAudit(req, 'delete', 'admin_user', String(id), `帳號：${existing.displayName}`);
  res.json({ success: true });
});

router.post('/admin/verify', async (req, res) => {
  const { username, password } = req.body;
  const [user] = await db.select().from(adminUsers)
    .where(and(eq(adminUsers.username, username), eq(adminUsers.isActive, true))).limit(1);
  if (!user) return res.status(401).json({ error: '帳號或密碼錯誤' });
  const [salt] = user.passwordHash.split(':');
  const attempt = hashPassword(password, salt);
  if (attempt !== user.passwordHash) return res.status(401).json({ error: '帳號或密碼錯誤' });
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await logAudit(req, 'login', 'admin_user', String(user.id), `${user.displayName} 登入`);
  const { passwordHash: _, ...safe } = user;
  res.json(safe);
});

// ===== CUSTOM FIELDS =====
router.get('/admin/custom-fields', async (req, res) => {
  const { formType } = req.query;
  const conditions = formType ? [eq(customFields.formType, String(formType))] : [];
  const rows = await db.select().from(customFields)
    .where(conditions.length ? conditions[0] : undefined)
    .orderBy(customFields.formType, customFields.displayOrder);
  res.json(rows);
});

router.post('/admin/custom-fields', async (req, res) => {
  const { formType, fieldKey, fieldLabel, fieldType, options, isRequired, displayOrder } = req.body;
  if (!formType || !fieldKey || !fieldLabel || !fieldType) return res.status(400).json({ error: '缺少必填欄位' });
  const [row] = await db.insert(customFields).values({
    formType, fieldKey, fieldLabel, fieldType,
    options: options ?? null,
    isRequired: isRequired ?? false,
    isActive: true,
    displayOrder: displayOrder ?? 0,
  }).returning();
  await logAudit(req, 'create', 'custom_field', String(row.id), `欄位：${fieldLabel}（${formType}）`);
  res.json(row);
});

router.patch('/admin/custom-fields/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { fieldLabel, fieldType, options, isRequired, isActive, displayOrder } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (fieldLabel !== undefined) updates.fieldLabel = fieldLabel;
  if (fieldType !== undefined) updates.fieldType = fieldType;
  if (options !== undefined) updates.options = options;
  if (isRequired !== undefined) updates.isRequired = isRequired;
  if (isActive !== undefined) updates.isActive = isActive;
  if (displayOrder !== undefined) updates.displayOrder = displayOrder;
  const [row] = await db.update(customFields).set(updates).where(eq(customFields.id, id)).returning();
  if (!row) return res.status(404).json({ error: '找不到欄位' });
  await logAudit(req, 'update', 'custom_field', String(id), `欄位：${row.fieldLabel}`);
  res.json(row);
});

router.delete('/admin/custom-fields/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(customFields).where(eq(customFields.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: '找不到欄位' });
  await db.delete(customFields).where(eq(customFields.id, id));
  await logAudit(req, 'delete', 'custom_field', String(id), `欄位：${existing.fieldLabel}`);
  res.json({ success: true });
});

// ===== AUDIT LOGS =====
router.get('/admin/audit-logs', async (req, res) => {
  const { action, resourceType, operatorName, from, to, limit = '200' } = req.query;
  const conditions = [];
  if (action) conditions.push(eq(auditLogs.action, String(action)));
  if (resourceType) conditions.push(eq(auditLogs.resourceType, String(resourceType)));
  if (operatorName) conditions.push(like(auditLogs.operatorName, `%${operatorName}%`));
  if (from) conditions.push(gte(auditLogs.createdAt, new Date(String(from))));
  if (to) conditions.push(lte(auditLogs.createdAt, new Date(String(to))));
  const rows = await db.select().from(auditLogs)
    .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(parseInt(String(limit)));
  res.json(rows);
});

router.post('/admin/audit-logs', async (req, res) => {
  const { operatorName, operatorRole, action, resourceType, resourceId, resourceLabel, description } = req.body;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
  const [row] = await db.insert(auditLogs).values({
    operatorName: operatorName ?? '系統',
    operatorRole: operatorRole ?? 'system',
    action, resourceType,
    resourceId: resourceId ?? null,
    resourceLabel: resourceLabel ?? null,
    description: description ?? null,
    ipAddress: ip,
  }).returning();
  res.json(row);
});

// Helper used internally
async function logAudit(
  req: Parameters<Parameters<ReturnType<typeof Router>['use']>[0]>[0],
  action: string, resourceType: string, resourceId: string, resourceLabel: string,
) {
  const operatorName = String(req.headers['x-admin-user'] ?? '系統');
  const operatorRole = String(req.headers['x-admin-role'] ?? 'system');
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
  await db.insert(auditLogs).values({
    operatorName, operatorRole, action, resourceType, resourceId, resourceLabel,
    description: `${operatorName} 執行了 ${action} 操作：${resourceLabel}`,
    ipAddress: ip,
  }).catch(() => {});
}

export { logAudit };
export default router;
