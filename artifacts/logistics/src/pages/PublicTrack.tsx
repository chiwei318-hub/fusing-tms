import { useState, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { Search, Truck, MapPin, Package, CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";

const STATUS_STEPS = [
  { key: "pending",    label: "待派車",  icon: Clock },
  { key: "assigned",   label: "已派車",  icon: Truck },
  { key: "in_transit", label: "運送中",  icon: Truck },
  { key: "delivered",  label: "已送達",  icon: CheckCircle2 },
];

const STATUS_LABEL: Record<string, string> = {
  pending:    "待派車",
  assigned:   "已派車",
  in_transit: "運送中",
  delivered:  "已送達",
  cancelled:  "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  assigned:   "bg-blue-100 text-blue-800 border-blue-200",
  in_transit: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered:  "bg-green-100 text-green-800 border-green-200",
  cancelled:  "bg-red-100 text-red-800 border-red-200",
};

interface PublicOrder {
  order_id: number;
  status: string;
  pickup_address: string;
  delivery_address: string;
  pickup_date: string | null;
  cargo_description: string | null;
  created_at: string;
  driver: { name: string; plate: string | null } | null;
}

function ProgressBar({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        <span className="text-sm text-red-700 font-medium">訂單已取消</span>
      </div>
    );
  }
  const stepIdx = STATUS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-start pt-1">
      {STATUS_STEPS.map((step, idx) => {
        const done   = idx <= stepIdx;
        const active = idx === stepIdx;
        const Icon   = step.icon;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 min-w-[52px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors
                ${active ? "bg-[#1a3a8f] text-white ring-4 ring-[#1a3a8f]/20"
                  : done  ? "bg-[#1a3a8f]/15 text-[#1a3a8f]"
                           : "bg-gray-100 text-gray-400"}`}>
                {done && !active ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] text-center whitespace-nowrap leading-tight
                ${active ? "text-[#1a3a8f] font-semibold" : done ? "text-gray-700" : "text-gray-400"}`}>
                {step.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 ${idx < stepIdx ? "bg-[#1a3a8f]" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function PublicTrack() {
  const [query, setQuery]       = useState("");
  const [order, setOrder]       = useState<PublicOrder | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(q = query) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setOrder(null);
    setSearched(true);
    try {
      const res = await fetch(apiUrl(`/orders/public-track?q=${encodeURIComponent(trimmed)}`));
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "查詢失敗，請稍後再試");
      } else {
        setOrder(data);
      }
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  function handleReset() {
    setQuery("");
    setOrder(null);
    setError(null);
    setSearched(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#0a1628] via-[#0d2045] to-[#071020] flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <img
          src="https://www.lrabit.tw/favicon.ico"
          alt="富詠運輸"
          className="w-8 h-8 rounded-md"
          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div>
          <div className="text-white font-bold text-base leading-tight">富詠運輸</div>
          <div className="text-white/50 text-xs">貨物即時追蹤</div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-4 pt-10 pb-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4">
            <Package className="w-7 h-7 text-[#f5a623]" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-1">物流追蹤</h1>
          <p className="text-white/50 text-sm">輸入訂單號碼，即時查詢配送狀態</p>
        </div>

        {/* Search box */}
        <div className="w-full max-w-md">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                placeholder="請輸入訂單號碼"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-9 pr-3 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30
                  focus:outline-none focus:border-[#f5a623] focus:bg-white/15 transition-colors text-sm"
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="px-5 py-3 rounded-xl bg-[#f5a623] hover:bg-[#e09510] disabled:opacity-50 disabled:cursor-not-allowed
                text-[#0a1628] font-bold text-sm transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "查詢"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* No result */}
          {searched && !loading && !order && !error && (
            <div className="mt-4 text-center text-white/40 text-sm py-6">找不到此訂單</div>
          )}

          {/* Order card */}
          {order && (
            <div className="mt-5 bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Status header */}
              <div className={`px-5 py-4 border-b flex items-center justify-between ${
                order.status === "delivered" ? "bg-green-50 border-green-100"
                : order.status === "cancelled" ? "bg-red-50 border-red-100"
                : "bg-blue-50 border-blue-100"
              }`}>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">訂單號碼</div>
                  <div className="font-bold text-gray-900 text-lg">#{order.order_id}</div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Progress bar */}
                <ProgressBar status={order.status} />

                {/* Addresses */}
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <MapPin className="w-3 h-3 text-green-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">取貨地點</div>
                      <div className="text-sm text-gray-800 mt-0.5">{order.pickup_address}</div>
                    </div>
                  </div>
                  <div className="ml-2 w-0.5 h-4 bg-gray-200" />
                  <div className="flex gap-2.5">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                      <MapPin className="w-3 h-3 text-red-500" />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">送達地點</div>
                      <div className="text-sm text-gray-800 mt-0.5">{order.delivery_address}</div>
                    </div>
                  </div>
                </div>

                {/* Driver info */}
                {order.driver && (
                  <div className="flex items-center gap-2.5 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">配送司機</div>
                      <div className="text-sm text-gray-800 font-medium">
                        {order.driver.name}
                        {order.driver.plate && <span className="ml-1.5 text-xs text-gray-500">· {order.driver.plate}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cargo & date */}
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-1 border-t border-gray-100">
                  {order.cargo_description && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-0.5">貨物描述</div>
                      <div className="text-gray-700">{order.cargo_description}</div>
                    </div>
                  )}
                  {order.pickup_date && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-0.5">預約日期</div>
                      <div className="text-gray-700">{formatDate(order.pickup_date)}</div>
                    </div>
                  )}
                  <div className={order.cargo_description || order.pickup_date ? "" : "col-span-2"}>
                    <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-0.5">建立時間</div>
                    <div className="text-gray-700">{formatDate(order.created_at)}</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-4">
                <button
                  onClick={handleReset}
                  className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  查詢其他訂單
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-white/20 text-xs pb-6">
        富詠運輸 © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
