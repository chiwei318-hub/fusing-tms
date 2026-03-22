import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Shield, Users, Settings, List, Plus, Trash2, Edit2,
  CheckCircle2, XCircle, Download, AlertTriangle, Lock,
  ChevronRight, RefreshCw, Search, Eye, FileDown, Printer,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Role {
  id: number;
  name: string;
  displayName: string;
  permissions: Record<string, Record<string, boolean>>;
  isSystem: boolean;
  createdAt: string;
}

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  roleId?: number;
  roleName?: string;
  roleDisplayName?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface CustomField {
  id: number;
  formType: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

interface AuditLog {
  id: number;
  operatorName: string;
  operatorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceLabel?: string;
  description?: string;
  ipAddress?: string;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MENUS = [
  { key: 'orders', label: '訂單管理', icon: '📋' },
  { key: 'drivers', label: '司機管理', icon: '🚗' },
  { key: 'customers', label: '客戶管理', icon: '👥' },
  { key: 'reports', label: '報表中心', icon: '📊' },
  { key: 'vehicles', label: '車型庫', icon: '🚛' },
  { key: 'dispatch', label: '智慧調度', icon: '🎯' },
  { key: 'heatmap', label: '熱區地圖', icon: '🗺️' },
  { key: 'fleet_map', label: '車隊地圖', icon: '📍' },
  { key: 'carpool', label: '拼車調度', icon: '🔗' },
  { key: 'ai', label: 'AI 分析', icon: '🤖' },
  { key: 'outsourcing', label: '轉單管理', icon: '💼' },
  { key: 'payment', label: '金流收款', icon: '💳' },
  { key: 'quotation', label: '報價試算', icon: '🧮' },
  { key: 'permissions', label: '權限管理', icon: '🔐' },
];

const ACTIONS = [
  { key: 'view', label: '查看', icon: <Eye className="w-3 h-3" /> },
  { key: 'edit', label: '編輯', icon: <Edit2 className="w-3 h-3" /> },
  { key: 'delete', label: '刪除', icon: <Trash2 className="w-3 h-3" /> },
  { key: 'export', label: '匯出', icon: <FileDown className="w-3 h-3" /> },
  { key: 'print', label: '列印', icon: <Printer className="w-3 h-3" /> },
];

const FIELD_TYPES = [
  { value: 'text', label: '單行文字' },
  { value: 'textarea', label: '多行文字' },
  { value: 'number', label: '數字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '下拉選單' },
  { value: 'checkbox', label: '核取方塊' },
];

const ACTION_LABELS: Record<string, string> = {
  create: '新增', update: '修改', delete: '刪除',
  export: '匯出', print: '列印', login: '登入',
};
const RESOURCE_LABELS: Record<string, string> = {
  order: '訂單', driver: '司機', customer: '客戶', vehicle_type: '車型',
  payment: '收款', outsource_order: '轉單', partner_fleet: '車隊',
  enterprise: '企業客戶', role: '角色', admin_user: '帳號', custom_field: '自訂欄位',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  export: 'bg-purple-100 text-purple-800',
  print: 'bg-amber-100 text-amber-800',
  login: 'bg-gray-100 text-gray-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAdminHeaders(): HeadersInit {
  try {
    const stored = localStorage.getItem('current_admin');
    if (stored) {
      const user = JSON.parse(stored) as AdminUser;
      return {
        'Content-Type': 'application/json',
        'X-Admin-User': user.displayName,
        'X-Admin-Role': user.roleDisplayName ?? user.roleName ?? 'unknown',
      };
    }
  } catch {}
  return { 'Content-Type': 'application/json' };
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('zh-TW', { hour12: false });
}

// ─── Current Admin Selector ───────────────────────────────────────────────────

function CurrentAdminBar({ users, onSelect }: { users: AdminUser[]; onSelect: (u: AdminUser | null) => void }) {
  const [current, setCurrent] = useState<AdminUser | null>(() => {
    try { return JSON.parse(localStorage.getItem('current_admin') ?? 'null'); } catch { return null; }
  });

  const handleSelect = (id: string) => {
    if (id === 'none') {
      localStorage.removeItem('current_admin');
      setCurrent(null);
      onSelect(null);
      return;
    }
    const user = users.find(u => String(u.id) === id) ?? null;
    if (user) {
      localStorage.setItem('current_admin', JSON.stringify(user));
      setCurrent(user);
      onSelect(user);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 rounded-xl border border-primary/20 mb-5">
      <Shield className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm text-muted-foreground">操作身份：</span>
      <Select value={current ? String(current.id) : 'none'} onValueChange={handleSelect}>
        <SelectTrigger className="h-8 w-48 text-sm border-0 bg-transparent px-0 focus:ring-0">
          <SelectValue placeholder="選擇操作身份" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">未登入（系統）</SelectItem>
          {users.map(u => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.displayName}
              {u.isSuperAdmin ? '（超管）' : u.roleDisplayName ? `（${u.roleDisplayName}）` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <Badge variant={current.isSuperAdmin ? 'default' : 'secondary'} className="text-xs">
          {current.isSuperAdmin ? '🔴 超級管理員' : current.roleDisplayName ?? current.roleName ?? '—'}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground ml-auto">操作紀錄將以此身份記錄</span>
    </div>
  );
}

// ─── Users Panel ─────────────────────────────────────────────────────────────

function UsersPanel({ roles }: { roles: Role[] }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', email: '', roleId: '', isSuperAdmin: false, isActive: true });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/admin/users');
    if (r.ok) setUsers(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ username: '', password: '', displayName: '', email: '', roleId: '', isSuperAdmin: false, isActive: true });
    setShowForm(true);
  };

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({ username: u.username, password: '', displayName: u.displayName, email: u.email ?? '', roleId: String(u.roleId ?? ''), isSuperAdmin: u.isSuperAdmin, isActive: u.isActive });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const body: Record<string, unknown> = { ...form, roleId: form.roleId ? parseInt(form.roleId) : null };
    if (!form.password && editing) delete body.password;
    const url = editing ? `/api/admin/users/${editing.id}` : '/api/admin/users';
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: getAdminHeaders(), body: JSON.stringify(body) });
    if (r.ok) { setShowForm(false); load(); }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`確定要刪除帳號「${u.displayName}」？`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: getAdminHeaders() });
    load();
  };

  const handleToggleActive = async (u: AdminUser) => {
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: getAdminHeaders(),
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    load();
  };

  const filtered = users.filter(u =>
    u.displayName.includes(search) || u.username.includes(search) ||
    (u.roleDisplayName ?? '').includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="搜尋姓名、帳號、角色…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button className="gap-1.5" onClick={openAdd}><Plus className="w-4 h-4" />新增帳號</Button>
      </div>

      {showForm && (
        <Card className="border-primary/30 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editing ? '編輯帳號' : '新增帳號'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">帳號 *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">密碼 {editing && '（留空不修改）'} {!editing && '*'}</Label>
                <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">顯示名稱 *</Label>
                <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">角色</Label>
                <Select value={form.roleId} onValueChange={v => setForm(f => ({ ...f, roleId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="選擇角色" /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.displayName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">狀態</Label>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.isSuperAdmin} onChange={e => setForm(f => ({ ...f, isSuperAdmin: e.target.checked }))} />
                    超級管理員
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                    啟用中
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit}>{editing ? '儲存' : '新增'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">顯示名稱</th>
                  <th className="text-left px-4 py-3 font-medium">帳號</th>
                  <th className="text-left px-4 py-3 font-medium">角色</th>
                  <th className="text-left px-4 py-3 font-medium">狀態</th>
                  <th className="text-left px-4 py-3 font-medium">最後登入</th>
                  <th className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">載入中…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">尚無帳號</td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.displayName}</span>
                        {u.isSuperAdmin && <Badge className="text-[10px] py-0 px-1.5 bg-red-600">超管</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3">
                      {u.roleDisplayName
                        ? <Badge variant="outline" className="text-xs">{u.roleDisplayName}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(u)} className="flex items-center gap-1 text-xs">
                        {u.isActive
                          ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                          : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className={u.isActive ? 'text-green-600' : 'text-red-500'}>{u.isActive ? '啟用' : '停用'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.lastLoginAt ? fmt(u.lastLoginAt) : '從未登入'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(u)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Roles Panel ─────────────────────────────────────────────────────────────

function RolesPanel({ roles, onRolesChange }: { roles: Role[]; onRolesChange: () => void }) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [editedPerms, setEditedPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDisplay, setNewRoleDisplay] = useState('');
  const [dirty, setDirty] = useState(false);

  const selectRole = (r: Role) => {
    setSelected(r);
    setEditedPerms(JSON.parse(JSON.stringify(r.permissions)));
    setDirty(false);
  };

  const togglePerm = (menu: string, action: string) => {
    setEditedPerms(prev => ({
      ...prev,
      [menu]: { ...(prev[menu] ?? {}), [action]: !(prev[menu]?.[action] ?? false) },
    }));
    setDirty(true);
  };

  const toggleAllActions = (menu: string) => {
    const allOn = ACTIONS.every(a => editedPerms[menu]?.[a.key]);
    setEditedPerms(prev => ({
      ...prev,
      [menu]: Object.fromEntries(ACTIONS.map(a => [a.key, !allOn])),
    }));
    setDirty(true);
  };

  const toggleAllMenus = (action: string) => {
    const allOn = MENUS.every(m => editedPerms[m.key]?.[action]);
    setEditedPerms(prev => {
      const next = { ...prev };
      for (const m of MENUS) next[m.key] = { ...(next[m.key] ?? {}), [action]: !allOn };
      return next;
    });
    setDirty(true);
  };

  const savePerms = async () => {
    if (!selected) return;
    const r = await fetch(`/api/admin/roles/${selected.id}`, {
      method: 'PATCH', headers: getAdminHeaders(),
      body: JSON.stringify({ permissions: editedPerms }),
    });
    if (r.ok) { setDirty(false); onRolesChange(); }
  };

  const createRole = async () => {
    if (!newRoleName || !newRoleDisplay) return;
    const r = await fetch('/api/admin/roles', {
      method: 'POST', headers: getAdminHeaders(),
      body: JSON.stringify({ name: newRoleName, displayName: newRoleDisplay }),
    });
    if (r.ok) { setShowNewRole(false); setNewRoleName(''); setNewRoleDisplay(''); onRolesChange(); }
  };

  const deleteRole = async (role: Role) => {
    if (role.isSystem) return;
    if (!confirm(`確定要刪除角色「${role.displayName}」？`)) return;
    await fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE', headers: getAdminHeaders() });
    if (selected?.id === role.id) setSelected(null);
    onRolesChange();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Role list */}
      <div className="space-y-2">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => selectRole(r)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors
              ${selected?.id === r.id ? 'border-primary bg-primary/5 text-primary font-semibold' : 'hover:bg-muted/50'}`}
          >
            <div>
              <div className="text-sm font-medium">{r.displayName}</div>
              {r.isSystem && <div className="text-[10px] text-muted-foreground">系統內建</div>}
            </div>
            <div className="flex items-center gap-1">
              {!r.isSystem && (
                <button className="p-1 text-destructive hover:bg-red-50 rounded" onClick={e => { e.stopPropagation(); deleteRole(r); }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
        ))}

        {showNewRole ? (
          <div className="border rounded-lg p-3 space-y-2">
            <Input placeholder="識別碼（英文）" className="h-8 text-xs" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} />
            <Input placeholder="顯示名稱" className="h-8 text-xs" value={newRoleDisplay} onChange={e => setNewRoleDisplay(e.target.value)} />
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={createRole}>新增</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewRole(false)}>取消</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setShowNewRole(true)}>
            <Plus className="w-3.5 h-3.5" />新增自訂角色
          </Button>
        )}
      </div>

      {/* Permission matrix */}
      <div className="lg:col-span-3">
        {!selected ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
            <div className="text-center">
              <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>選擇左側角色來編輯權限設定</p>
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">{selected.displayName} 的權限設定</CardTitle>
                {selected.isSystem && <p className="text-xs text-muted-foreground mt-0.5">系統角色　可修改權限</p>}
              </div>
              <Button size="sm" className="gap-1.5" disabled={!dirty} onClick={savePerms}>
                儲存權限
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium w-36">選單 / 功能</th>
                      {ACTIONS.map(a => (
                        <th key={a.key} className="px-3 py-2.5 font-medium text-center w-20">
                          <button className="flex flex-col items-center gap-0.5 mx-auto hover:text-primary transition-colors group" onClick={() => toggleAllMenus(a.key)}>
                            {a.icon}
                            <span className="text-[11px]">{a.label}</span>
                          </button>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-medium text-center text-xs text-muted-foreground">全選列</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MENUS.map((menu, i) => (
                      <tr key={menu.key} className={`border-b ${i % 2 === 0 ? '' : 'bg-muted/20'} hover:bg-primary/5 transition-colors`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <span>{menu.icon}</span>
                            <span>{menu.label}</span>
                          </div>
                        </td>
                        {ACTIONS.map(action => {
                          const checked = editedPerms[menu.key]?.[action.key] ?? false;
                          return (
                            <td key={action.key} className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => togglePerm(menu.key, action.key)}
                                className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors
                                  ${checked ? 'bg-primary text-white' : 'bg-muted border hover:border-primary/50'}`}
                              >
                                {checked && <span className="text-[11px]">✓</span>}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleAllActions(menu.key)}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
                          >
                            全選
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Fields Panel ─────────────────────────────────────────────────────────────

function FieldsPanel() {
  const [formType, setFormType] = useState<'customer_order' | 'driver'>('customer_order');
  const [fields, setFields] = useState<CustomField[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [form, setForm] = useState({
    fieldKey: '', fieldLabel: '', fieldType: 'text',
    options: '', isRequired: false, displayOrder: 0,
  });

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/custom-fields?formType=${formType}`);
    if (r.ok) setFields(await r.json());
  }, [formType]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ fieldKey: '', fieldLabel: '', fieldType: 'text', options: '', isRequired: false, displayOrder: fields.length });
    setShowForm(true);
  };

  const openEdit = (f: CustomField) => {
    setEditing(f);
    setForm({ fieldKey: f.fieldKey, fieldLabel: f.fieldLabel, fieldType: f.fieldType, options: (f.options ?? []).join('\n'), isRequired: f.isRequired, displayOrder: f.displayOrder });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const options = form.fieldType === 'select' ? form.options.split('\n').map(s => s.trim()).filter(Boolean) : null;
    const body = { formType, fieldKey: form.fieldKey, fieldLabel: form.fieldLabel, fieldType: form.fieldType, options, isRequired: form.isRequired, displayOrder: form.displayOrder };
    if (editing) {
      const r = await fetch(`/api/admin/custom-fields/${editing.id}`, { method: 'PATCH', headers: getAdminHeaders(), body: JSON.stringify(body) });
      if (r.ok) { setShowForm(false); load(); }
    } else {
      const r = await fetch('/api/admin/custom-fields', { method: 'POST', headers: getAdminHeaders(), body: JSON.stringify(body) });
      if (r.ok) { setShowForm(false); load(); }
    }
  };

  const handleDelete = async (f: CustomField) => {
    if (!confirm(`確定要刪除欄位「${f.fieldLabel}」？`)) return;
    await fetch(`/api/admin/custom-fields/${f.id}`, { method: 'DELETE', headers: getAdminHeaders() });
    load();
  };

  const handleToggleActive = async (f: CustomField) => {
    await fetch(`/api/admin/custom-fields/${f.id}`, { method: 'PATCH', headers: getAdminHeaders(), body: JSON.stringify({ isActive: !f.isActive }) });
    load();
  };

  const moveOrder = async (f: CustomField, dir: -1 | 1) => {
    const newOrder = f.displayOrder + dir;
    await fetch(`/api/admin/custom-fields/${f.id}`, { method: 'PATCH', headers: getAdminHeaders(), body: JSON.stringify({ displayOrder: newOrder }) });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border overflow-hidden">
          {[{ value: 'customer_order', label: '📦 客戶下單表單' }, { value: 'driver', label: '🚗 司機資料表單' }].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFormType(opt.value as typeof formType)}
              className={`px-4 py-2 text-sm transition-colors ${formType === opt.value ? 'bg-primary text-white font-medium' : 'hover:bg-muted/50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button className="gap-1.5 ml-auto" onClick={openAdd}><Plus className="w-4 h-4" />新增欄位</Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3"><CardTitle className="text-base">{editing ? '編輯欄位' : '新增自訂欄位'}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs">欄位識別碼 *</Label>
                <Input placeholder="custom_field_1" value={form.fieldKey} onChange={e => setForm(f => ({ ...f, fieldKey: e.target.value }))} disabled={!!editing} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">顯示名稱 *</Label>
                <Input placeholder="例：特殊備注" value={form.fieldLabel} onChange={e => setForm(f => ({ ...f, fieldLabel: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">欄位類型</Label>
                <Select value={form.fieldType} onValueChange={v => setForm(f => ({ ...f, fieldType: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">排序</Label>
                <Input type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} />
              </div>
              {form.fieldType === 'select' && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">選項（每行一個）</Label>
                  <textarea className="w-full border rounded-md px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-ring" placeholder="選項一&#10;選項二&#10;選項三" value={form.options} onChange={e => setForm(f => ({ ...f, options: e.target.value }))} />
                </div>
              )}
              <div className="flex items-center gap-2 pt-5">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))} />
                  必填欄位
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleSubmit}>{editing ? '儲存' : '新增'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {fields.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>尚無自訂欄位，點擊「新增欄位」開始設定</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">欄位名稱</th>
                  <th className="text-left px-4 py-3 font-medium">識別碼</th>
                  <th className="text-left px-4 py-3 font-medium">類型</th>
                  <th className="text-left px-4 py-3 font-medium">必填</th>
                  <th className="text-left px-4 py-3 font-medium">狀態</th>
                  <th className="text-left px-4 py-3 font-medium">排序</th>
                  <th className="text-right px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(f => (
                  <tr key={f.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{f.fieldLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{f.fieldKey}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">
                        {FIELD_TYPES.find(t => t.value === f.fieldType)?.label ?? f.fieldType}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {f.isRequired ? <Badge className="text-xs bg-red-100 text-red-700 hover:bg-red-100">必填</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(f)} className={`text-xs flex items-center gap-1 ${f.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {f.isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {f.isActive ? '啟用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-0.5 hover:bg-muted rounded text-muted-foreground" onClick={() => moveOrder(f, -1)}>▲</button>
                        <span className="text-xs w-6 text-center">{f.displayOrder}</span>
                        <button className="p-0.5 hover:bg-muted rounded text-muted-foreground" onClick={() => moveOrder(f, 1)}>▼</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Audit Panel ──────────────────────────────────────────────────────────────

function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', resourceType: '', operatorName: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '500' });
    if (filters.action) params.set('action', filters.action);
    if (filters.resourceType) params.set('resourceType', filters.resourceType);
    if (filters.operatorName) params.set('operatorName', filters.operatorName);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to + 'T23:59:59');
    const r = await fetch(`/api/admin/audit-logs?${params}`);
    if (r.ok) setLogs(await r.json());
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const header = '時間,操作人,角色,動作,資源類型,資源ID,說明,IP';
    const rows = logs.map(l => [
      fmt(l.createdAt), l.operatorName, l.operatorRole,
      ACTION_LABELS[l.action] ?? l.action,
      RESOURCE_LABELS[l.resourceType] ?? l.resourceType,
      l.resourceId ?? '', l.description ?? '', l.ipAddress ?? '',
    ].map(s => `"${String(s).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-muted/30 rounded-xl border">
        <div className="space-y-1">
          <Label className="text-xs">動作類型</Label>
          <Select value={filters.action || '_all'} onValueChange={v => setFilters(f => ({ ...f, action: v === '_all' ? '' : v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">全部</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">資源類型</Label>
          <Select value={filters.resourceType || '_all'} onValueChange={v => setFilters(f => ({ ...f, resourceType: v === '_all' ? '' : v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="全部" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">全部</SelectItem>
              {Object.entries(RESOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">操作人</Label>
          <Input className="h-8 text-xs" placeholder="搜尋…" value={filters.operatorName} onChange={e => setFilters(f => ({ ...f, operatorName: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">開始日期</Label>
          <Input type="date" className="h-8 text-xs" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">結束日期</Label>
          <Input type="date" className="h-8 text-xs" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">共 {logs.length} 筆</span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={load}>
            <RefreshCw className="w-3 h-3" />重新整理
          </Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={logs.length === 0}>
          <Download className="w-3.5 h-3.5" />匯出 CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium whitespace-nowrap">時間</th>
                  <th className="text-left px-4 py-3 font-medium">操作人</th>
                  <th className="text-left px-4 py-3 font-medium">動作</th>
                  <th className="text-left px-4 py-3 font-medium">資源</th>
                  <th className="text-left px-4 py-3 font-medium">說明</th>
                  <th className="text-left px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">載入中…</td></tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-muted-foreground">
                      <List className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>尚無操作紀錄</p>
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmt(log.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium">{log.operatorName}</div>
                      <div className="text-xs text-muted-foreground">{log.operatorRole}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs">{RESOURCE_LABELS[log.resourceType] ?? log.resourceType}</div>
                      {log.resourceId && <div className="text-[10px] text-muted-foreground">ID: {log.resourceId}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">
                      {log.description ?? log.resourceLabel ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PermissionTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const loadRoles = useCallback(async () => {
    const r = await fetch('/api/admin/roles');
    if (r.ok) setRoles(await r.json());
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await fetch('/api/admin/users');
    if (r.ok) setUsers(await r.json());
  }, []);

  useEffect(() => { loadRoles(); loadUsers(); }, [loadRoles, loadUsers]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          後台權限管理
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          管理帳號、角色、欄位設定與所有操作紀錄。超級管理員擁有最高權限。
        </p>
      </div>

      <CurrentAdminBar users={users} onSelect={() => {}} />

      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users" className="gap-2"><Users className="w-4 h-4" />帳號管理</TabsTrigger>
          <TabsTrigger value="roles" className="gap-2"><Shield className="w-4 h-4" />角色權限</TabsTrigger>
          <TabsTrigger value="fields" className="gap-2"><Settings className="w-4 h-4" />欄位管理</TabsTrigger>
          <TabsTrigger value="audit" className="gap-2"><List className="w-4 h-4" />操作紀錄</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersPanel roles={roles} /></TabsContent>
        <TabsContent value="roles"><RolesPanel roles={roles} onRolesChange={loadRoles} /></TabsContent>
        <TabsContent value="fields"><FieldsPanel /></TabsContent>
        <TabsContent value="audit"><AuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
