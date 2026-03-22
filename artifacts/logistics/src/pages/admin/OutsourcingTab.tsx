import { useEffect, useState, useCallback } from "react";
import {
  Building2, Plus, Trash2, Edit3, Star, MapPin, Truck,
  TrendingUp, AlertTriangle, CheckCircle, Clock, Send,
  Settings, BarChart3, Zap, RefreshCw, X, ChevronDown,
  Phone, DollarSign, ArrowRight, ShieldAlert, Bell,
} from "lucide-react";
import { type PartnerFleet, type OutsourcedOrder, type AutoDispatchSettings } from "@workspace/db";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}/api/${path}`, { headers: { "Content-Type": "application/json" }, ...opts });

const REGIONS = ["北部", "中部", "南部", "東部", "花東", "全台"];
const VEHICLE_TYPES = ["箱型車", "冷藏車", "尾門車", "平板車", "小貨車", "大貨車"];

const OUTSOURCE_STATUS: Record<string, { label: string; color: string }> = {
  pending_notify: { label: "待通知", color: "bg-gray-100 text-gray-600" },
  notified:       { label: "已通知", color: "bg-blue-100 text-blue-700" },
  accepted:       { label: "已接單", color: "bg-green-100 text-green-700" },
  rejected:       { label: "已拒絕", color: "bg-red-100 text-red-700" },
  in_transit:     { label: "運送中", color: "bg-purple-100 text-purple-700" },
  delivered:      { label: "已完成", color: "bg-emerald-100 text-emerald-700" },
  cancelled:      { label: "已取消", color: "bg-gray-100 text-gray-400" },
};

type FleetStats = {
  fleetId: number | null; fleetName: string | null;
  totalOrders: number; totalRevenue: number; totalCost: number;
  totalProfit: number; avgProfitPct: number; alertCount: number;
  reliabilityScore: number | null;
};

/* ─── Helper ────────────────────────────────── */
function fmt(n: number | null | undefined) {
  return n != null ? `NT$${Math.round(n).toLocaleString()}` : "—";
}
function pct(n: number | null | undefined) {
  return n != null ? `${n.toFixed(1)}%` : "—";
}

/* ─── Fleet Card ────────────────────────────── */
function FleetCard({
  fleet, onEdit, onDelete,
}: { fleet: PartnerFleet; onEdit: (f: PartnerFleet) => void; onDelete: (id: number) => void }) {
  const regions: string[] = fleet.regions ? JSON.parse(fleet.regions) : [];
  const types: string[] = fleet.vehicleTypes ? JSON.parse(fleet.vehicleTypes) : [];
  const score = fleet.reliabilityScore ?? 0;
  const scoreColor = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-500" : "text-red-500";

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md ${fleet.status === "suspended" ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{fleet.name}</p>
            <p className="text-xs text-gray-400">{fleet.contactPerson} · {fleet.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(fleet)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(fleet.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-gray-400 mb-0.5">基本報價</p>
          <p className="font-bold text-gray-900">{fmt(fleet.baseRate)}
            <span className="font-normal text-gray-400 ml-1">{fleet.rateType === "per_km" ? "/km" : "/趟"}</span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5">
          <p className="text-gray-400 mb-0.5">抽成</p>
          <p className="font-bold text-orange-500">
            {fleet.commissionValue}{fleet.commissionType === "percent" ? "%" : " NTD"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs mb-2">
        <div className="flex flex-wrap gap-1">
          {regions.map(r => (
            <span key={r} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{r}</span>
          ))}
        </div>
        <span className={`font-bold ${scoreColor}`}>信賴度 {score.toFixed(0)}%</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {types.map(t => (
          <span key={t} className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">{t}</span>
        ))}
      </div>

      {fleet.autoAssign && (
        <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
          <Zap className="w-3 h-3" /> 自動接單
        </div>
      )}
    </div>
  );
}

/* ─── Fleet Form Modal ──────────────────────── */
function FleetForm({ fleet, onSave, onClose }: {
  fleet?: PartnerFleet;
  onSave: (data: Partial<PartnerFleet>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: fleet?.name ?? "",
    contactPerson: fleet?.contactPerson ?? "",
    phone: fleet?.phone ?? "",
    regions: fleet?.regions ? JSON.parse(fleet.regions) : [] as string[],
    vehicleTypes: fleet?.vehicleTypes ? JSON.parse(fleet.vehicleTypes) : [] as string[],
    rateType: fleet?.rateType ?? "flat",
    baseRate: fleet?.baseRate ?? 0,
    commissionType: fleet?.commissionType ?? "percent",
    commissionValue: fleet?.commissionValue ?? 0,
    profitAlertThreshold: fleet?.profitAlertThreshold ?? 10,
    autoAssign: fleet?.autoAssign ?? false,
    notes: fleet?.notes ?? "",
    status: fleet?.status ?? "active",
  });

  function toggle(arr: string[], val: string) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      regions: JSON.stringify(form.regions),
      vehicleTypes: JSON.stringify(form.vehicleTypes),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">{fleet ? "編輯車隊" : "新增合作車隊"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">車隊名稱 *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">聯絡人 *</label>
              <input required value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">電話 *</label>
              <input required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          {/* Regions */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">服務區域</label>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(r => (
                <button key={r} type="button"
                  onClick={() => setForm(f => ({ ...f, regions: toggle(f.regions, r) }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                    ${form.regions.includes(r) ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Vehicle types */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block">可接車型</label>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, vehicleTypes: toggle(f.vehicleTypes, t) }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                    ${form.vehicleTypes.includes(t) ? "bg-orange-500 text-white border-orange-500" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-orange-300"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">計價方式</label>
              <select value={form.rateType} onChange={e => setForm(f => ({ ...f, rateType: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="flat">固定費用 / 趟</option>
                <option value="per_km">按公里計費</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">基本費率 (NTD)</label>
              <input type="number" min={0} value={form.baseRate} onChange={e => setForm(f => ({ ...f, baseRate: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">抽成方式</label>
              <select value={form.commissionType} onChange={e => setForm(f => ({ ...f, commissionType: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="percent">百分比 %</option>
                <option value="fixed">固定金額 NTD</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                抽成值 {form.commissionType === "percent" ? "(%)" : "(NTD)"}
              </label>
              <input type="number" min={0} value={form.commissionValue} onChange={e => setForm(f => ({ ...f, commissionValue: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">利潤警示門檻 (%)</label>
              <input type="number" min={0} max={100} value={form.profitAlertThreshold ?? 10}
                onChange={e => setForm(f => ({ ...f, profitAlertThreshold: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.autoAssign} onChange={e => setForm(f => ({ ...f, autoAssign: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600 rounded" />
                <span className="text-sm font-medium text-gray-700">自動接單</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">備註</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
              取消
            </button>
            <button type="submit"
              className="flex-1 py-2.5 bg-[#1a3a8f] text-white text-sm font-bold rounded-xl hover:bg-[#0d2d6e] transition-colors">
              {fleet ? "儲存變更" : "新增車隊"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Outsource Order Modal ─────────────────── */
function OutsourceModal({ orderId, orderFee, fleets, onSave, onClose }: {
  orderId: number;
  orderFee: number;
  fleets: PartnerFleet[];
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [fleetId, setFleetId] = useState<number | "">("");
  const [transferPrice, setTransferPrice] = useState(orderFee);
  const [fleetPrice, setFleetPrice] = useState(0);
  const [commissionType, setCommissionType] = useState("percent");
  const [commissionValue, setCommissionValue] = useState(10);
  const [notes, setNotes] = useState("");

  const selectedFleet = fleets.find(f => f.id === fleetId);

  useEffect(() => {
    if (selectedFleet) {
      setFleetPrice(selectedFleet.baseRate);
      setCommissionType(selectedFleet.commissionType);
      setCommissionValue(selectedFleet.commissionValue);
    }
  }, [fleetId]);

  const profit = transferPrice - fleetPrice;
  const profitPct = transferPrice > 0 ? (profit / transferPrice * 100) : 0;
  const profitColor = profitPct >= 20 ? "text-emerald-600" : profitPct >= 10 ? "text-amber-500" : "text-red-500";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fleetId) return;
    onSave({ orderId, fleetId, transferPrice, fleetPrice, commissionType, commissionValue, notes });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">轉單外包 — 訂單 #{orderId}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">選擇合作車隊 *</label>
            <select required value={fleetId} onChange={e => setFleetId(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <option value="">請選擇車隊...</option>
              {fleets.filter(f => f.status === "active").map(f => (
                <option key={f.id} value={f.id}>{f.name} — 基本 {fmt(f.baseRate)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">向客戶收款 (NTD)</label>
              <input type="number" min={0} value={transferPrice} onChange={e => setTransferPrice(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">付給車隊 (NTD)</label>
              <input type="number" min={0} value={fleetPrice} onChange={e => setFleetPrice(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          {/* Live profit preview */}
          <div className={`rounded-xl p-3 ${profitPct < 10 ? "bg-red-50 border border-red-100" : "bg-gray-50"}`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">預估利潤</span>
              <span className={`font-black text-base ${profitColor}`}>
                {fmt(profit)} ({pct(profitPct)})
              </span>
            </div>
            {profitPct < 10 && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> 利潤低於警示門檻，建議重新議價
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">備註</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
              取消
            </button>
            <button type="submit" disabled={!fleetId}
              className="flex-1 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50">
              確認轉單
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function OutsourcingTab() {
  const [sub, setSub] = useState<"orders" | "fleets" | "settings" | "profit" | "report">("orders");

  // Data
  const [fleets, setFleets] = useState<PartnerFleet[]>([]);
  const [outsourcedRows, setOutsourcedRows] = useState<{ outsourced: OutsourcedOrder; order: any; fleet: PartnerFleet | null }[]>([]);
  const [settings, setSettings] = useState<AutoDispatchSettings | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [byFleet, setByFleet] = useState<FleetStats[]>([]);
  const [monthly, setMonthly] = useState<any[]>([]);

  // UI state
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<PartnerFleet | undefined>();
  const [showOutsourceModal, setShowOutsourceModal] = useState<{ orderId: number; fee: number } | null>(null);
  const [comparingFleets, setComparingFleets] = useState<PartnerFleet[]>([]);
  const [compareRegion, setCompareRegion] = useState("");
  const [compareVehicle, setCompareVehicle] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<AutoDispatchSettings>>({});

  // Pending orders from ordersTable for outsource action
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);

  const reload = useCallback(async () => {
    const [fleetsRes, outsourcedRes, settingsRes, summaryRes, byFleetRes, monthlyRes, ordersRes] = await Promise.all([
      api("outsourcing/fleets").then(r => r.json()),
      api("outsourcing/orders").then(r => r.json()),
      api("outsourcing/settings").then(r => r.json()),
      api("outsourcing/reports/summary").then(r => r.json()),
      api("outsourcing/reports/by-fleet").then(r => r.json()),
      api("outsourcing/reports/monthly").then(r => r.json()),
      api("orders?status=pending").then(r => r.json()),
    ]);
    setFleets(fleetsRes);
    setOutsourcedRows(Array.isArray(outsourcedRes) ? outsourcedRes : []);
    setSettings(settingsRes);
    setLocalSettings(settingsRes);
    setSummary(summaryRes);
    setByFleet(Array.isArray(byFleetRes) ? byFleetRes : []);
    setMonthly(Array.isArray(monthlyRes) ? monthlyRes : []);
    setPendingOrders(Array.isArray(ordersRes) ? ordersRes : []);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Fleet CRUD
  async function saveFleet(data: Partial<PartnerFleet>) {
    if (editingFleet) {
      const updated = await api(`outsourcing/fleets/${editingFleet.id}`, { method: "PATCH", body: JSON.stringify(data) }).then(r => r.json());
      setFleets(fs => fs.map(f => f.id === editingFleet.id ? updated : f));
    } else {
      const created = await api("outsourcing/fleets", { method: "POST", body: JSON.stringify(data) }).then(r => r.json());
      setFleets(fs => [created, ...fs]);
    }
    setShowFleetForm(false);
    setEditingFleet(undefined);
  }

  async function deleteFleet(id: number) {
    if (!confirm("確認刪除此車隊？")) return;
    await api(`outsourcing/fleets/${id}`, { method: "DELETE" });
    setFleets(fs => fs.filter(f => f.id !== id));
  }

  // Outsource order
  async function createOutsource(data: Record<string, unknown>) {
    const record = await api("outsourcing/orders", { method: "POST", body: JSON.stringify(data) }).then(r => r.json());
    setShowOutsourceModal(null);
    await reload();
    setSub("orders");
  }

  // Update outsource status
  async function updateStatus(id: number, status: string) {
    const updated = await api(`outsourcing/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(r => r.json());
    setOutsourcedRows(rows => rows.map(r => r.outsourced.id === id ? { ...r, outsourced: updated } : r));
  }

  // Notify fleet
  async function notifyFleet(id: number) {
    await api(`outsourcing/orders/${id}/notify`, { method: "POST" });
    await reload();
  }

  // Compare
  async function compare() {
    const params = new URLSearchParams();
    if (compareRegion) params.set("region", compareRegion);
    if (compareVehicle) params.set("vehicleType", compareVehicle);
    const data = await api(`outsourcing/fleets/compare?${params}`).then(r => r.json());
    setComparingFleets(data);
  }

  // Save settings
  async function saveSettings() {
    setSettingsSaving(true);
    const saved = await api("outsourcing/settings", { method: "PATCH", body: JSON.stringify(localSettings) }).then(r => r.json());
    setSettings(saved);
    setSettingsSaving(false);
  }

  /* ─── Sub-tab: 轉單管理 ──────────────────── */
  function OrdersTab() {
    const alerts = outsourcedRows.filter(r => r.outsourced.profitAlert);
    return (
      <div className="space-y-4">
        {/* Alert banner */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-700 text-sm">{alerts.length} 筆轉單利潤低於警示門檻</p>
              <p className="text-xs text-red-600 mt-0.5">請檢視標記為 ⚠️ 的訂單並重新議價</p>
            </div>
          </div>
        )}

        {/* Pending orders → outsource action */}
        {pendingOrders.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-amber-800 text-sm">可轉單訂單（{pendingOrders.length} 筆待處理）</span>
            </div>
            <div className="divide-y divide-gray-50">
              {pendingOrders.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">#{o.id} · {o.customerName}</p>
                    <p className="text-xs text-gray-500 truncate">{o.pickupAddress} → {o.deliveryAddress}</p>
                  </div>
                  <span className="text-sm font-bold text-[#1a3a8f]">{fmt(o.totalFee)}</span>
                  <button
                    onClick={() => setShowOutsourceModal({ orderId: o.id, fee: o.totalFee ?? 0 })}
                    className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0">
                    <ArrowRight className="w-3.5 h-3.5" /> 轉單
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outsourced orders list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between">
            <span className="font-bold text-gray-900 text-sm">轉單紀錄（{outsourcedRows.length} 筆）</span>
            <button onClick={reload} className="text-gray-400 hover:text-gray-600 p-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {outsourcedRows.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <ArrowRight className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">尚無轉單紀錄</p>
              <p className="text-xs mt-1">從上方待處理訂單開始轉單</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold">
                    <th className="px-4 py-3 text-left">訂單</th>
                    <th className="px-4 py-3 text-left">車隊</th>
                    <th className="px-4 py-3 text-right">收款</th>
                    <th className="px-4 py-3 text-right">成本</th>
                    <th className="px-4 py-3 text-right">利潤</th>
                    <th className="px-4 py-3 text-left">狀態</th>
                    <th className="px-4 py-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {outsourcedRows.map(({ outsourced: o, order, fleet }) => {
                    const s = OUTSOURCE_STATUS[o.status] ?? { label: o.status, color: "bg-gray-100 text-gray-500" };
                    return (
                      <tr key={o.id} className={`hover:bg-gray-50/50 ${o.profitAlert ? "bg-red-50/30" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {o.profitAlert && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                            <span className="font-bold text-[#1a3a8f]">#{o.orderId}</span>
                          </div>
                          <p className="text-xs text-gray-400 truncate max-w-[100px]">{order?.customerName}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{fleet?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(o.transferPrice)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmt(o.fleetPrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${o.profitAlert ? "text-red-600" : "text-emerald-600"}`}>
                            {fmt(o.profit)}
                          </span>
                          <span className={`block text-xs ${o.profitAlert ? "text-red-400" : "text-gray-400"}`}>
                            {pct(o.profitPercent)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {o.status === "pending_notify" && (
                              <button onClick={() => notifyFleet(o.id)}
                                className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded-lg font-semibold flex items-center gap-1">
                                <Send className="w-3 h-3" /> 通知
                              </button>
                            )}
                            {["notified", "accepted"].includes(o.status) && (
                              <button onClick={() => updateStatus(o.id, "in_transit")}
                                className="text-xs bg-purple-50 text-purple-600 hover:bg-purple-100 px-2 py-1 rounded-lg font-semibold">
                                出車
                              </button>
                            )}
                            {o.status === "in_transit" && (
                              <button onClick={() => updateStatus(o.id, "delivered")}
                                className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-1 rounded-lg font-semibold">
                                完成
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Sub-tab: 合作車隊 ──────────────────── */
  function FleetsTab() {
    return (
      <div className="space-y-5">
        {/* Auto compare */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" /> 自動比價
          </h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <select value={compareRegion} onChange={e => setCompareRegion(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
              <option value="">全部區域</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={compareVehicle} onChange={e => setCompareVehicle(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none">
              <option value="">全部車型</option>
              {VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={compare}
              className="flex items-center gap-2 bg-[#1a3a8f] text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#0d2d6e] transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> 比價
            </button>
          </div>

          {comparingFleets.length > 0 && (
            <div className="space-y-2">
              {comparingFleets.map((f, i) => (
                <div key={f.id} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? "bg-emerald-50 border border-emerald-100" : "bg-gray-50"}`}>
                  {i === 0 && <Star className="w-4 h-4 text-emerald-500 shrink-0" />}
                  {i !== 0 && <span className="text-xs text-gray-400 w-4 text-center">{i + 1}</span>}
                  <span className="font-semibold text-sm text-gray-900 flex-1">{f.name}</span>
                  <span className="text-sm font-bold text-[#1a3a8f]">{fmt(f.baseRate)}</span>
                  {i === 0 && <span className="text-xs text-emerald-600 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">最優價</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">合作車隊名單（{fleets.length} 家）</h3>
          <button onClick={() => { setEditingFleet(undefined); setShowFleetForm(true); }}
            className="flex items-center gap-2 bg-[#1a3a8f] text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-[#0d2d6e] transition-colors">
            <Plus className="w-4 h-4" /> 新增車隊
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fleets.map(f => (
            <FleetCard key={f.id} fleet={f}
              onEdit={(f) => { setEditingFleet(f); setShowFleetForm(true); }}
              onDelete={deleteFleet} />
          ))}
          {fleets.length === 0 && (
            <div className="col-span-2 py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-semibold">尚無合作車隊</p>
              <p className="text-gray-400 text-xs mt-1">點擊「新增車隊」開始建立合作名單</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Sub-tab: 自動分單設定 ──────────────── */
  function SettingsTab() {
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#1a3a8f]" /> 自動分單規則
          </h3>
          <div className="space-y-4">
            {[
              { key: "selfFleetFirst", label: "自有司機優先", desc: "有自車可接單時，優先派給自有司機" },
              { key: "autoOutsourceWhenFull", label: "滿載後自動轉單", desc: "自有車隊滿載時，自動將新訂單轉給外部車隊" },
              { key: "autoOutsourceLowProfit", label: "低利潤單優先外包", desc: "低於門檻利潤的訂單自動轉給外包車隊" },
              { key: "lineNotifyEnabled", label: "LINE 通知外部車隊", desc: "轉單後自動發送 LINE 通知給外部車隊" },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox"
                  checked={!!(localSettings as any)[key]}
                  onChange={e => setLocalSettings(s => ({ ...s, [key]: e.target.checked }))}
                  className="w-5 h-5 accent-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4">利潤門檻設定</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">低利潤外包門檻 (%)</label>
              <input type="number" min={0} max={100}
                value={localSettings.lowProfitThreshold ?? 15}
                onChange={e => setLocalSettings(s => ({ ...s, lowProfitThreshold: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <p className="text-xs text-gray-400 mt-1">低於此利潤率自動轉外包</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">利潤警示門檻 (%)</label>
              <input type="number" min={0} max={100}
                value={localSettings.defaultProfitAlertThreshold ?? 10}
                onChange={e => setLocalSettings(s => ({ ...s, defaultProfitAlertThreshold: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <p className="text-xs text-gray-400 mt-1">低於此利潤率顯示⚠️警示</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={saveSettings} disabled={settingsSaving}
            className="flex items-center gap-2 bg-[#1a3a8f] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#0d2d6e] transition-colors disabled:opacity-60">
            {settingsSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            儲存設定
          </button>
        </div>
      </div>
    );
  }

  /* ─── Sub-tab: 利潤控管 ──────────────────── */
  function ProfitTab() {
    const alertRows = outsourcedRows.filter(r => r.outsourced.profitAlert);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "轉單總筆數", value: summary?.totalOrders ?? 0, unit: "筆", color: "text-[#1a3a8f]" },
            { label: "總轉單收入", value: fmt(summary?.totalTransferRevenue), unit: "", color: "text-emerald-600" },
            { label: "總車隊成本", value: fmt(summary?.totalFleetCost), unit: "", color: "text-orange-500" },
            { label: "總利潤", value: fmt(summary?.totalProfit), unit: "", color: "text-purple-600" },
          ].map(({ label, value, unit, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className={`text-xl font-black ${color}`}>{value}{unit}</p>
              <p className="text-gray-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">平均利潤率</p>
            <p className={`text-2xl font-black ${(summary?.avgProfitPercent ?? 0) < 10 ? "text-red-600" : "text-emerald-600"}`}>
              {pct(summary?.avgProfitPercent)}
            </p>
          </div>
          <div className={`rounded-2xl border shadow-sm p-4 ${(summary?.alertCount ?? 0) > 0 ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}`}>
            <p className="text-xs font-semibold text-gray-500 mb-1">利潤警示</p>
            <p className={`text-2xl font-black ${(summary?.alertCount ?? 0) > 0 ? "text-red-600" : "text-gray-400"}`}>
              {summary?.alertCount ?? 0} 筆
            </p>
          </div>
        </div>

        {alertRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="font-bold text-red-700 text-sm">低利潤警示訂單</span>
            </div>
            <div className="divide-y divide-gray-50">
              {alertRows.map(({ outsourced: o, fleet }) => (
                <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">訂單 #{o.orderId}</p>
                    <p className="text-xs text-gray-500">{fleet?.name} · {new Date(o.createdAt).toLocaleDateString("zh-TW")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">{fmt(o.profit)}</p>
                    <p className="text-xs text-red-400">{pct(o.profitPercent)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Sub-tab: 報表 ──────────────────────── */
  function ReportTab() {
    return (
      <div className="space-y-5">
        {/* By fleet */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1a3a8f]" />
            <span className="font-bold text-gray-900 text-sm">各車隊利潤排行</span>
          </div>
          {byFleet.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">尚無資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold">
                    <th className="px-4 py-3 text-left">車隊</th>
                    <th className="px-4 py-3 text-right">筆數</th>
                    <th className="px-4 py-3 text-right">總收入</th>
                    <th className="px-4 py-3 text-right">總成本</th>
                    <th className="px-4 py-3 text-right">利潤</th>
                    <th className="px-4 py-3 text-right">利潤率</th>
                    <th className="px-4 py-3 text-right">信賴度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byFleet.map((row, i) => (
                    <tr key={row.fleetId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {i === 0 && <Star className="w-4 h-4 text-amber-400 shrink-0" />}
                          <span className="font-semibold text-gray-900">{row.fleetName ?? "未知"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{row.totalOrders}</td>
                      <td className="px-4 py-3 text-right text-gray-800">{fmt(row.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmt(row.totalCost)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(row.totalProfit)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${row.avgProfitPct < 10 ? "text-red-500" : "text-emerald-600"}`}>
                          {pct(row.avgProfitPct)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${(row.reliabilityScore ?? 0) >= 80 ? "text-emerald-600" : "text-amber-500"}`}>
                          {row.reliabilityScore?.toFixed(0) ?? "—"}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Monthly trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <span className="font-bold text-gray-900 text-sm">月度轉單趨勢</span>
          </div>
          {monthly.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">尚無資料</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {monthly.map(row => {
                const profitPct = row.revenue > 0 ? (row.profit / row.revenue * 100) : 0;
                const width = monthly[0].revenue > 0 ? (row.revenue / monthly[0].revenue * 100) : 0;
                return (
                  <div key={`${row.year}-${row.month}`} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">{row.year}年{row.month}月</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">{row.orderCount} 筆</span>
                        <span className="font-bold text-emerald-600">{fmt(row.profit)}</span>
                        <span className="text-gray-400 text-xs">{pct(profitPct)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const subTabs = [
    { key: "orders", label: "轉單管理", icon: ArrowRight },
    { key: "fleets", label: "合作車隊", icon: Building2 },
    { key: "settings", label: "自動分單", icon: Settings },
    { key: "profit", label: "利潤控管", icon: DollarSign },
    { key: "report", label: "報表", icon: BarChart3 },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1 flex gap-0.5 overflow-x-auto">
        {subTabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSub(key as typeof sub)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-1 justify-center
              ${sub === key ? "bg-[#1a3a8f] text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {sub === "orders" && <OrdersTab />}
      {sub === "fleets" && <FleetsTab />}
      {sub === "settings" && <SettingsTab />}
      {sub === "profit" && <ProfitTab />}
      {sub === "report" && <ReportTab />}

      {/* Fleet form modal */}
      {showFleetForm && (
        <FleetForm fleet={editingFleet} onSave={saveFleet} onClose={() => { setShowFleetForm(false); setEditingFleet(undefined); }} />
      )}

      {/* Outsource modal */}
      {showOutsourceModal && (
        <OutsourceModal
          orderId={showOutsourceModal.orderId}
          orderFee={showOutsourceModal.fee}
          fleets={fleets}
          onSave={createOutsource}
          onClose={() => setShowOutsourceModal(null)}
        />
      )}
    </div>
  );
}
