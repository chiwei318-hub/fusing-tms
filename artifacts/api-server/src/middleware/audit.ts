import type { Request, Response, NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const URL_MAP: { pattern: RegExp; resourceType: string; actionMap: Record<string, string> }[] = [
  { pattern: /^\/api\/orders(?:\/\d+)?$/, resourceType: 'order', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/drivers(?:\/\d+)?$/, resourceType: 'driver', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/customers(?:\/\d+)?$/, resourceType: 'customer', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/vehicle-types(?:\/\d+)?$/, resourceType: 'vehicle_type', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/payments(?:\/\d+)?$/, resourceType: 'payment', actionMap: { POST: 'create', PATCH: 'update' } },
  { pattern: /^\/api\/payments\/\d+\/void$/, resourceType: 'payment', actionMap: { POST: 'delete' } },
  { pattern: /^\/api\/outsourcing\/orders(?:\/\d+)?$/, resourceType: 'outsource_order', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/outsourcing\/fleets(?:\/\d+)?$/, resourceType: 'partner_fleet', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
  { pattern: /^\/api\/enterprise(?:\/\d+)?$/, resourceType: 'enterprise', actionMap: { POST: 'create', PATCH: 'update', DELETE: 'delete' } },
];

function getResourceIdFromUrl(url: string): string | null {
  const match = url.match(/\/(\d+)(?:\/|$)/);
  return match ? match[1] : null;
}

function getActionLabel(action: string, resourceType: string): string {
  const map: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '刪除',
    export: '匯出',
    print: '列印',
    login: '登入',
  };
  const resource: Record<string, string> = {
    order: '訂單', driver: '司機', customer: '客戶', vehicle_type: '車型',
    payment: '收款記錄', outsource_order: '轉單', partner_fleet: '合作車隊',
    enterprise: '企業客戶',
  };
  return `${map[action] || action}${resource[resourceType] || resourceType}`;
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;

    const url = req.path;
    for (const entry of URL_MAP) {
      if (!entry.pattern.test(url)) continue;
      const action = entry.actionMap[method];
      if (!action) break;

      const operatorName = String(req.headers['x-admin-user'] ?? '系統');
      const operatorRole = String(req.headers['x-admin-role'] ?? 'system');
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
      const resourceId = getResourceIdFromUrl(url);
      const label = getActionLabel(action, entry.resourceType);

      db.execute(sql`
        INSERT INTO audit_logs
          (operator_name, operator_role, action, resource_type, resource_id, resource_label, description, ip_address)
        VALUES
          (${operatorName}, ${operatorRole}, ${action}, ${entry.resourceType},
           ${resourceId}, ${label},
           ${`${operatorName} 執行：${label}${resourceId ? `（ID: ${resourceId}）` : ''}`},
           ${ip})
        ON CONFLICT DO NOTHING
      `).catch(() => {});

      break;
    }
  });

  next();
}
