/**
 * QuickOrderPanel — 電話/LINE 接單快速開單面板
 * - Customer search: type name or phone to pick from DB → auto-fills address
 * - Address fields: history suggestions + customer address suggestions
 * - Multiple delivery stops (main + extras with contactName & phone)
 * - History stored per field (localStorage, max 15)
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Phone, MapPin, Package, Truck, ChevronDown, ChevronUp,
  Zap, UserCheck, X, Check, Clock, Trash2, Plus, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCustomersData } from "@/hooks/use-customers";
import { useDriversData } from "@/hooks/use-drivers";
import { getApiUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const VEHICLE_TYPES = ["箱型車", "冷藏車", "尾門車", "平板車", "貨車", "機車"];
const MAX_HISTORY = 15;

const HISTORY_KEYS = {
  pickup:   "qop_history_pickup",
  dropoff:  "qop_history_dropoff",
  cargo:    "qop_history_cargo",
} as const;
type HistoryKey = keyof typeof HISTORY_KEYS;

function loadHistory(key: HistoryKey): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEYS[key]) ?? "[]"); } catch { return []; }
}
function saveHistory(key: HistoryKey, value: string) {
  if (!value.trim()) return;
  const existing = loadHistory(key).filter(v => v !== value.trim());
  localStorage.setItem(HISTORY_KEYS[key], JSON.stringify([value.trim(), ...existing].slice(0, MAX_HISTORY)));
}
function removeHistory(key: HistoryKey, value: string) {
  localStorage.setItem(HISTORY_KEYS[key], JSON.stringify(loadHistory(key).filter(v => v !== value)));
}

/* ── 客戶選取器 ───────────────────────────────────── */
interface CustomerPickerProps {
  customers: Array<{ id: number; name: string; phone: string; address?: string | null; contactPerson?: string | null }>;
  onSelect: (c: { name: string; phone: string; address?: string | null }) => void;
}
function CustomerPicker({ customers, onSelect }: CustomerPickerProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = customers.filter(c =>
    !q || c.name.includes(q) || c.phone.includes(q)
  ).slice(0, 8);

  const handlePick = (c: typeof customers[0]) => {
    setSelected(c.name);
    setQ(c.name);
    setOpen(false);
    onSelect({ name: c.name, phone: c.phone, address: c.address });
  };

  return (
    <div className="relative" ref={ref}>
      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500 pointer-events-none" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setSelected(""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="選取客戶（輸入姓名或電話）"
        autoComplete="off"
        className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
      />
      {selected && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <UserCheck className="w-3 h-3" /> 已選取
        </span>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-amber-50/60 text-[10px] text-amber-600 font-medium">客戶資料庫</div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <div
                key={c.id}
                onMouseDown={() => handlePick(c)}
                className="px-3 py-2 hover:bg-amber-50 cursor-pointer flex flex-col"
              >
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.phone}{c.address ? ` · ${c.address}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 地址輸入框（含歷史 + 客戶地址建議） ──────────── */
interface AddressInputProps {
  value: string;
  onChange: (v: string) => void;
  historyKey: HistoryKey;
  placeholder: string;
  required?: boolean;
  iconColor?: string;
  customerAddresses?: string[];
  inputRef?: React.RefObject<HTMLInputElement>;
}
function AddressInput({ value, onChange, historyKey, placeholder, required, iconColor = "text-blue-400", customerAddresses = [], inputRef }: AddressInputProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setHistory(loadHistory(historyKey)), [historyKey]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!containerRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = value.toLowerCase();
  const filteredHistory = history.filter(h => !q || h.toLowerCase().includes(q));
  const filteredCustomer = customerAddresses.filter(a => a && !history.includes(a) && (!q || a.toLowerCase().includes(q)));
  const hasOptions = filteredHistory.length > 0 || filteredCustomer.length > 0;

  const handleDelete = (e: React.MouseEvent, v: string) => {
    e.stopPropagation(); e.preventDefault();
    removeHistory(historyKey, v); reload();
  };

  return (
    <div className="relative" ref={containerRef}>
      <MapPin className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${iconColor} pointer-events-none`} />
      <input
        ref={inputRef}
        required={required}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { reload(); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full h-9 pl-8 pr-7 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
      />
      {value && (
        <button type="button" tabIndex={-1} onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      )}
      {open && hasOptions && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg overflow-hidden">
          {filteredCustomer.length > 0 && (
            <>
              <div className="px-3 py-1 border-b bg-blue-50/60 text-[10px] text-blue-600 font-medium flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> 客戶地址
              </div>
              {filteredCustomer.map((a, i) => (
                <div key={i} onMouseDown={() => { onChange(a); setOpen(false); }}
                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{a}</div>
              ))}
            </>
          )}
          {filteredHistory.length > 0 && (
            <>
              <div className="px-3 py-1 border-b bg-amber-50/60 text-[10px] text-amber-600 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> 歷史記錄
              </div>
              <div className="max-h-40 overflow-y-auto">
                {filteredHistory.map((h, i) => (
                  <div key={i} onMouseDown={() => { onChange(h); setOpen(false); }}
                    className="flex items-center justify-between px-3 py-2 hover:bg-amber-50 cursor-pointer group text-sm">
                    <span className="flex-1 truncate">{h}</span>
                    <button type="button" tabIndex={-1} onMouseDown={e => handleDelete(e, h)}
                      className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 送貨站點列表 ───────────────────────────────────── */
interface DeliveryStop { address: string; contactName: string; phone: string; }

interface DeliveryStopsProps {
  stops: DeliveryStop[];
  onChange: (stops: DeliveryStop[]) => void;
  customerAddresses: string[];
  historyKey: HistoryKey;
}
function DeliveryStops({ stops, onChange, customerAddresses, historyKey }: DeliveryStopsProps) {
  const update = (idx: number, field: keyof DeliveryStop, val: string) => {
    const next = stops.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    onChange(next);
  };
  const remove = (idx: number) => onChange(stops.filter((_, i) => i !== idx));
  const add = () => onChange([...stops, { address: "", contactName: "", phone: "" }]);

  return (
    <div className="space-y-2">
      {stops.map((stop, idx) => (
        <div key={idx} className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2 relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              第 {idx + 1} 站送貨
            </span>
            <button type="button" onClick={() => remove(idx)}
              className="text-muted-foreground hover:text-red-500 p-0.5 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <AddressInput
            value={stop.address}
            onChange={v => update(idx, "address", v)}
            historyKey={historyKey}
            placeholder={`送達地址 *（第 ${idx + 1} 站）`}
            required
            iconColor="text-emerald-500"
            customerAddresses={customerAddresses}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                value={stop.contactName}
                onChange={e => update(idx, "contactName", e.target.value)}
                placeholder="聯絡人（選填）"
                className="w-full h-8 pl-6 pr-2 text-xs bg-gray-50 border rounded-md outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                value={stop.phone}
                onChange={e => update(idx, "phone", e.target.value)}
                placeholder="聯絡電話（選填）"
                className="w-full h-8 pl-6 pr-2 text-xs bg-gray-50 border rounded-md outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-1.5 h-8 border-2 border-dashed border-emerald-300 rounded-lg text-xs text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
        <Plus className="w-3.5 h-3.5" /> 新增送貨站點
      </button>
    </div>
  );
}

/* ── 主元件 ──────────────────────────────────────────── */
interface QuickOrderPanelProps {
  onCreated?: (orderId: number) => void;
}

export function QuickOrderPanel({ onCreated }: QuickOrderPanelProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddr, setCustomerAddr] = useState<string>("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [extraStops, setExtraStops] = useState<DeliveryStop[]>([]);
  const [cargo, setCargo] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [driverId, setDriverId] = useState("");
  const [notes, setNotes] = useState("");
  const [lookupDone, setLookupDone] = useState(false);

  const { data: customers = [] } = useCustomersData();
  const { data: drivers = [] } = useDriversData();
  const queryClient = useQueryClient();
  const pickupRef = useRef<HTMLInputElement>(null);

  // Phone → auto lookup
  useEffect(() => {
    setLookupDone(false);
    if (phone.length < 6) return;
    const t = setTimeout(() => {
      const match = customers.find(c => c.phone?.replace(/\D/g, "") === phone.replace(/\D/g, ""));
      if (match) {
        setCustomerName(match.name ?? "");
        setCustomerAddr(match.address ?? "");
        setLookupDone(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone, customers]);

  // Customer picker → fills name, phone, address
  const handleCustomerSelect = (c: { name: string; phone: string; address?: string | null }) => {
    setCustomerName(c.name);
    setPhone(c.phone ?? "");
    setCustomerAddr(c.address ?? "");
    setLookupDone(true);
  };

  const customerAddresses = customerAddr ? [customerAddr] : [];

  const reset = () => {
    setPhone(""); setCustomerName(""); setCustomerAddr("");
    setPickup(""); setDropoff(""); setExtraStops([]);
    setCargo(""); setVehicleType(""); setDriverId(""); setNotes("");
    setLookupDone(false); setSuccess(null); setError("");
  };

  const availableDrivers = drivers.filter(d => d.status === "available" || !d.status);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !pickup.trim() || !dropoff.trim() || !cargo.trim()) return;
    if (extraStops.some(s => !s.address.trim())) {
      setError("所有送貨站點的地址不可空白");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const extraDeliveryJson = extraStops.length > 0
        ? JSON.stringify(extraStops.map(s => ({ address: s.address, contactName: s.contactName, phone: s.phone })))
        : null;

      const body: Record<string, unknown> = {
        customerName: customerName.trim(),
        customerPhone: phone.trim() || "未提供",
        pickupAddress: pickup.trim(),
        deliveryAddress: dropoff.trim(),
        cargoDescription: cargo.trim(),
        requiredVehicleType: vehicleType || null,
        notes: notes.trim() || null,
        extraDeliveryAddresses: extraDeliveryJson,
      };

      const res = await fetch(getApiUrl("/api/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("建立失敗");
      const order = await res.json();

      if (driverId && order.id) {
        await fetch(getApiUrl(`/api/orders/${order.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: parseInt(driverId), status: "assigned" }),
        });
      }

      saveHistory("pickup", pickup.trim());
      saveHistory("dropoff", dropoff.trim());
      extraStops.forEach(s => { if (s.address.trim()) saveHistory("dropoff", s.address.trim()); });
      if (cargo.trim()) saveHistory("cargo", cargo.trim());

      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSuccess(order.id);
      onCreated?.(order.id);
      setTimeout(() => { reset(); setOpen(false); }, 2500);
    } catch {
      setError("建立失敗，請再試一次");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && customerName.trim() && pickup.trim() && dropoff.trim() && cargo.trim();

  return (
    <div className="mb-3">
      {/* Toggle */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) reset(); }}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all shadow-sm
          ${open ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-700 hover:border-amber-300 hover:shadow"}`}
      >
        <span className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          ⚡ 快速開單（電話 / LINE 接單）
        </span>
        {open ? <ChevronUp className="w-4 h-4 opacity-60" /> : <ChevronDown className="w-4 h-4 opacity-60" />}
      </button>

      {/* Body */}
      {open && (
        <Card className="mt-2 p-4 border-amber-200 shadow-md bg-amber-50/30">
          {success ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="font-semibold text-emerald-700">訂單 #{success} 已建立！</p>
              {driverId && <p className="text-sm text-emerald-600">已同步指派司機</p>}
              {extraStops.length > 0 && <p className="text-sm text-emerald-600">共 {1 + extraStops.length} 個送貨站點</p>}
              <p className="text-xs text-muted-foreground">即將自動關閉…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">

              {/* Section: 客戶資訊 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">客戶資訊</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <CustomerPicker customers={customers as any} onSelect={handleCustomerSelect} />
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500 pointer-events-none" />
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="客戶電話"
                      className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                    {lookupDone && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-emerald-600">
                        <UserCheck className="w-3 h-3" /> 已帶入
                      </span>
                    )}
                  </div>
                </div>
                {customerName && (
                  <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-medium">{customerName}</span>
                    {customerAddr && <span className="text-xs text-muted-foreground truncate">· {customerAddr}</span>}
                    <button type="button" onClick={() => { setCustomerName(""); setPhone(""); setCustomerAddr(""); setLookupDone(false); }}
                      className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Section: 取貨地址 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wide">取貨地址 *</p>
                <AddressInput
                  value={pickup}
                  onChange={setPickup}
                  historyKey="pickup"
                  placeholder="取貨地址"
                  required
                  iconColor="text-blue-400"
                  customerAddresses={customerAddresses}
                  inputRef={pickupRef}
                />
              </div>

              {/* Section: 送貨站點 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                  送貨站點 * <span className="normal-case text-muted-foreground font-normal">（可新增多站）</span>
                </p>
                <AddressInput
                  value={dropoff}
                  onChange={setDropoff}
                  historyKey="dropoff"
                  placeholder="主要送達地址 *"
                  required
                  iconColor="text-emerald-500"
                  customerAddresses={customerAddresses}
                />
                {extraStops.length > 0 && (
                  <DeliveryStops
                    stops={extraStops}
                    onChange={setExtraStops}
                    customerAddresses={customerAddresses}
                    historyKey="dropoff"
                  />
                )}
                {extraStops.length === 0 && (
                  <button type="button" onClick={() => setExtraStops([{ address: "", contactName: "", phone: "" }])}
                    className="w-full flex items-center justify-center gap-1.5 h-7 border-2 border-dashed border-emerald-300 rounded-lg text-xs text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                    <Plus className="w-3 h-3" /> 新增第 2 站送貨
                  </button>
                )}
              </div>

              {/* Section: 貨物 + 車型 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-violet-700 uppercase tracking-wide">貨物與車型</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400 pointer-events-none" />
                    <input
                      required
                      value={cargo}
                      onChange={e => setCargo(e.target.value)}
                      placeholder="貨物描述 *"
                      className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                  </div>
                  <div className="relative">
                    <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400 pointer-events-none" />
                    <select value={vehicleType} onChange={e => setVehicleType(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 appearance-none">
                      <option value="">車型（選填）</option>
                      {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: 派車 + 備註 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={driverId} onChange={e => setDriverId(e.target.value)}
                  className="h-9 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400">
                  <option value="">立即指派司機（選填）</option>
                  {availableDrivers.map(d => (
                    <option key={d.id} value={d.id.toString()}>
                      {d.name} · {(d as any).vehicleType ?? "未知車型"} · {(d as any).licensePlate ?? ""}
                    </option>
                  ))}
                </select>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="備註（選填）"
                  className="h-9 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
              </div>

              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={!canSubmit}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold h-10 text-sm gap-1.5 shadow">
                  <Zap className="w-4 h-4" />
                  {submitting ? "建立中…" : driverId ? "開單並立即派車" : extraStops.length > 0 ? `開單（${1 + extraStops.length} 站）` : "立即開單"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => { reset(); setOpen(false); }}
                  className="h-10 px-3 text-muted-foreground">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
