/**
 * QuickOrderPanel — 電話/LINE 接單快速開單面板
 * - Phone lookup auto-fills existing customer data
 * - Pickup, dropoff, cargo fields show history suggestions (localStorage)
 * - History stored per field, max 15 entries, most recent first
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Phone, MapPin, Package, Truck, ChevronDown, ChevronUp,
  Zap, UserCheck, X, Check, Clock, Trash2,
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
  customer: "qop_history_customer",
} as const;

type HistoryKey = keyof typeof HISTORY_KEYS;

function loadHistory(key: HistoryKey): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEYS[key]) ?? "[]"); } catch { return []; }
}

function saveHistory(key: HistoryKey, value: string) {
  if (!value.trim()) return;
  const existing = loadHistory(key).filter(v => v !== value.trim());
  const updated = [value.trim(), ...existing].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEYS[key], JSON.stringify(updated));
}

function removeHistory(key: HistoryKey, value: string) {
  const updated = loadHistory(key).filter(v => v !== value);
  localStorage.setItem(HISTORY_KEYS[key], JSON.stringify(updated));
}

interface AutoInputProps {
  value: string;
  onChange: (v: string) => void;
  historyKey: HistoryKey;
  placeholder: string;
  required?: boolean;
  icon: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
  suffix?: React.ReactNode;
}

function AutoInput({ value, onChange, historyKey, placeholder, required, icon, inputRef, suffix }: AutoInputProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => setHistory(loadHistory(historyKey)), [historyKey]);

  useEffect(() => { reload(); }, [reload]);

  const filtered = history.filter(h =>
    value.trim() === "" || h.toLowerCase().includes(value.toLowerCase())
  );

  const handleSelect = (v: string) => { onChange(v); setOpen(false); };

  const handleDelete = (e: React.MouseEvent, v: string) => {
    e.stopPropagation();
    removeHistory(historyKey, v);
    reload();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>
      <input
        ref={inputRef}
        required={required}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { reload(); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full h-9 pl-8 pr-8 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
      />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2">{suffix}</span>}
      {!suffix && value && (
        <button
          type="button"
          onClick={() => { onChange(""); setOpen(false); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-amber-50/60">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-amber-600 font-medium">歷史記錄</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 hover:bg-amber-50 cursor-pointer group text-sm"
                onMouseDown={() => handleSelect(h)}
              >
                <span className="flex-1 truncate">{h}</span>
                <button
                  type="button"
                  onMouseDown={e => handleDelete(e, h)}
                  className="ml-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                  tabIndex={-1}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [cargo, setCargo] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [driverId, setDriverId] = useState("");
  const [notes, setNotes] = useState("");
  const [lookupDone, setLookupDone] = useState(false);

  const { data: customers = [] } = useCustomersData();
  const { data: drivers = [] } = useDriversData();
  const queryClient = useQueryClient();
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLookupDone(false);
    if (phone.length < 6) return;
    const t = setTimeout(() => {
      const match = customers.find(c => c.phone?.replace(/\D/g, "") === phone.replace(/\D/g, ""));
      if (match) { setCustomerName(match.name ?? ""); setLookupDone(true); }
    }, 400);
    return () => clearTimeout(t);
  }, [phone, customers]);

  useEffect(() => {
    if (open) setTimeout(() => phoneRef.current?.focus(), 100);
  }, [open]);

  const availableDrivers = drivers.filter(d => d.status === "available" || !d.status);

  const reset = () => {
    setPhone(""); setCustomerName(""); setPickup(""); setDropoff("");
    setCargo(""); setVehicleType(""); setDriverId(""); setNotes("");
    setLookupDone(false); setSuccess(null); setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !pickup.trim() || !dropoff.trim() || !cargo.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        customerName: customerName.trim(),
        customerPhone: phone.trim() || "未提供",
        pickupAddress: pickup.trim(),
        deliveryAddress: dropoff.trim(),
        cargoDescription: cargo.trim(),
        requiredVehicleType: vehicleType || null,
        notes: notes.trim() || null,
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
      saveHistory("cargo", cargo.trim());
      if (customerName.trim()) saveHistory("customer", customerName.trim());

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

  return (
    <div className="mb-3">
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

      {open && (
        <Card className="mt-2 p-4 border-amber-200 shadow-md bg-amber-50/30">
          {success ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="font-semibold text-emerald-700">訂單 #{success} 已建立！</p>
              {driverId && <p className="text-sm text-emerald-600">已同步指派司機</p>}
              <p className="text-xs text-muted-foreground">即將自動關閉…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-amber-700 font-medium">
                地址與貨物欄位會記錄歷史，下次輸入時自動建議。
              </p>

              {/* Row 1: Phone + Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500 pointer-events-none" />
                  <input
                    ref={phoneRef}
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="客戶電話（自動帶入資料）"
                    className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                  />
                  {lookupDone && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <UserCheck className="w-3 h-3" /> 已帶入
                    </span>
                  )}
                </div>

                <AutoInput
                  value={customerName}
                  onChange={setCustomerName}
                  historyKey="customer"
                  placeholder="客戶姓名 *"
                  required
                  icon={<span className="w-3.5 h-3.5 text-amber-500 text-xs font-bold">客</span>}
                />
              </div>

              {/* Row 2: Pickup + Dropoff */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AutoInput
                  value={pickup}
                  onChange={setPickup}
                  historyKey="pickup"
                  placeholder="取貨地址 *"
                  required
                  icon={<MapPin className="w-3.5 h-3.5 text-blue-400" />}
                />
                <AutoInput
                  value={dropoff}
                  onChange={setDropoff}
                  historyKey="dropoff"
                  placeholder="送達地址 *"
                  required
                  icon={<MapPin className="w-3.5 h-3.5 text-emerald-500" />}
                />
              </div>

              {/* Row 3: Cargo + Vehicle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AutoInput
                  value={cargo}
                  onChange={setCargo}
                  historyKey="cargo"
                  placeholder="貨物描述 *"
                  required
                  icon={<Package className="w-3.5 h-3.5 text-violet-400" />}
                />
                <div className="relative">
                  <Truck className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-400 pointer-events-none" />
                  <select
                    value={vehicleType}
                    onChange={e => setVehicleType(e.target.value)}
                    className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 appearance-none"
                  >
                    <option value="">車型（選填）</option>
                    {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 4: Driver + Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={driverId}
                  onChange={e => setDriverId(e.target.value)}
                  className="h-9 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                >
                  <option value="">立即指派司機（選填）</option>
                  {availableDrivers.map(d => (
                    <option key={d.id} value={d.id.toString()}>
                      {d.name} · {d.vehicleType ?? "未知車型"} · {d.licensePlate ?? ""}
                    </option>
                  ))}
                </select>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="備註（選填）"
                  className="h-9 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>

              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={submitting || !customerName.trim() || !pickup.trim() || !dropoff.trim() || !cargo.trim()}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold h-10 text-sm gap-1.5 shadow"
                >
                  <Zap className="w-4 h-4" />
                  {submitting ? "建立中…" : driverId ? "開單並立即派車" : "立即開單"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { reset(); setOpen(false); }}
                  className="h-10 px-3 text-muted-foreground"
                >
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
