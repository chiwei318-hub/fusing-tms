/**
 * QuickOrderPanel — 電話/LINE 接單快速開單面板
 * Collapsible form at the top of the orders tab.
 * Phone lookup auto-fills existing customer data.
 */
import { useState, useRef, useEffect } from "react";
import { Phone, MapPin, Package, Truck, ChevronDown, ChevronUp, Zap, UserCheck, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCustomersData } from "@/hooks/use-customers";
import { useDriversData } from "@/hooks/use-drivers";
import { getApiUrl } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const VEHICLE_TYPES = ["箱型車", "冷藏車", "尾門車", "平板車", "貨車", "機車"];

interface QuickOrderPanelProps {
  onCreated?: (orderId: number) => void;
}

export function QuickOrderPanel({ onCreated }: QuickOrderPanelProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);

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

  // Auto-lookup customer when phone changes (debounced)
  useEffect(() => {
    setLookupDone(false);
    if (phone.length < 6) return;
    const t = setTimeout(() => {
      const match = customers.find(c => c.phone?.replace(/\D/g, "") === phone.replace(/\D/g, ""));
      if (match) {
        setCustomerName(match.name ?? "");
        setLookupDone(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone, customers]);

  // Focus phone input when opened
  useEffect(() => {
    if (open) setTimeout(() => phoneRef.current?.focus(), 100);
  }, [open]);

  const availableDrivers = drivers.filter(d => d.status === "available" || !d.status);

  const reset = () => {
    setPhone(""); setCustomerName(""); setPickup(""); setDropoff("");
    setCargo(""); setVehicleType(""); setDriverId(""); setNotes("");
    setLookupDone(false); setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !pickup.trim() || !dropoff.trim() || !cargo.trim()) return;
    setSubmitting(true);
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

      // Optionally assign driver immediately
      if (driverId && order.id) {
        await fetch(getApiUrl(`/api/orders/${order.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: parseInt(driverId), status: "assigned" }),
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setSuccess(order.id);
      onCreated?.(order.id);
      // Auto-collapse + reset after 2.5s
      setTimeout(() => { reset(); setOpen(false); }, 2500);
    } catch {
      // keep form open on error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-3">
      {/* Toggle button */}
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

      {/* Panel body */}
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
              <p className="text-xs text-amber-700 font-medium mb-1">
                電話或 LINE 接單時，在此快速建立訂單，填完後立即出現在下方列表。
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
                <input
                  required
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="客戶姓名 *"
                  className="h-9 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                />
              </div>

              {/* Row 2: Pickup + Dropoff */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400 pointer-events-none" />
                  <input
                    required
                    value={pickup}
                    onChange={e => setPickup(e.target.value)}
                    placeholder="取貨地址 *"
                    className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500 pointer-events-none" />
                  <input
                    required
                    value={dropoff}
                    onChange={e => setDropoff(e.target.value)}
                    placeholder="送達地址 *"
                    className="w-full h-9 pl-8 pr-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Row 3: Cargo + Vehicle */}
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

              {/* Actions */}
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
