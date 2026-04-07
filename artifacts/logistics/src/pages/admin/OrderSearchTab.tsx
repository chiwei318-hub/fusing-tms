import { useState, useEffect, useRef, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  Search, X, Package, Truck, MapPin, Phone, User, Calendar,
  ArrowRight, Tag, FileText, Weight, AlertTriangle, ChevronDown,
  Clock, Hash, Star, Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API = import.meta.env.BASE_URL + "api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface SearchOrder {
  id: number;
  order_no: string | null;
  status: string;
  fee_status: string | null;
  customer_name: string;
  customer_phone: string;
  pickup_address: string;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_city: string | null;
  pickup_district: string | null;
  pickup_contact_person: string | null;
  pickup_contact_name: string | null;
  delivery_address: string;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_city: string | null;
  delivery_district: string | null;
  delivery_contact_person: string | null;
  delivery_contact_name: string | null;
  cargo_description: string;
  cargo_name: string | null;
  cargo_weight: number | null;
  cargo_quantity: string | null;
  special_requirements: string | null;
  notes: string | null;
  total_fee: number | null;
  base_price: number | null;
  required_vehicle_type: string | null;
  need_tailgate: string | null;
  need_hydraulic_pallet: string | null;
  source: string | null;
  created_at: string;
  updated_at: string | null;
  driver_id: number | null;
  driver_name: string | null;
  license_plate: string | null;
  driver_phone: string | null;
  vehicle_type: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: "待派車",  color: "bg-orange-100 text-orange-700 border-orange-200" },
  assigned:   { label: "已派車",  color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_transit: { label: "運送中",  color: "bg-purple-100 text-purple-700 border-purple-200" },
  delivered:  { label: "已完成",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled:  { label: "已取消",  color: "bg-gray-100 text-gray-500 border-gray-200" },
};

const FEE_MAP: Record<string, { label: string; color: string }> = {
  unpaid:   { label: "待收款", color: "bg-red-100 text-red-700 border-red-200" },
  paid:     { label: "已收款", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  invoiced: { label: "已開發票", color: "bg-blue-100 text-blue-700 border-blue-200" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={`text-xs font-medium px-2 ${s.color}`}>{s.label}</Badge>;
}

function FeeBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const s = FEE_MAP[status] ?? { label: status, color: "bg-gray-100 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={`text-xs px-2 ${s.color}`}>{s.label}</Badge>;
}

function highlight(text: string, q: string): JSX.Element {
  if (!q || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  try { return format(parseISO(d), "yyyy/MM/dd"); } catch { return d; }
}

// ── Order Result Card ─────────────────────────────────────────────────────────
function OrderCard({ order, q }: { order: SearchOrder; q: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-xl bg-white hover:shadow-md transition-all overflow-hidden">
      {/* Main Row */}
      <div
        className="p-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start gap-3">
          {/* Left: Status + ID */}
          <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
            <StatusBadge status={order.status} />
            <span className="text-[10px] text-muted-foreground font-mono">
              #{order.id}
            </span>
          </div>

          {/* Center: core info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Customer */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                {highlight(order.customer_name, q)}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <Phone className="w-3 h-3" />
                {highlight(order.customer_phone, q)}
              </span>
              {order.order_no && (
                <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-0.5">
                  <Hash className="w-2.5 h-2.5" />
                  {highlight(order.order_no, q)}
                </span>
              )}
            </div>

            {/* Route: Pickup → Delivery */}
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0 text-blue-500 mt-0.5" />
              <span className="text-blue-700 font-medium line-clamp-1">
                {highlight(order.pickup_address, q)}
              </span>
              <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground mt-0.5" />
              <MapPin className="w-3 h-3 shrink-0 text-orange-500 mt-0.5" />
              <span className="text-orange-700 font-medium line-clamp-1">
                {highlight(order.delivery_address, q)}
              </span>
            </div>

            {/* Cargo */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-0.5">
                <Package className="w-3 h-3" />
                {highlight(order.cargo_description, q)}
              </span>
              {order.cargo_weight && (
                <span className="flex items-center gap-0.5">
                  <Weight className="w-3 h-3" />{order.cargo_weight}kg
                </span>
              )}
              {order.cargo_quantity && (
                <span>{highlight(order.cargo_quantity, q)}</span>
              )}
              {order.required_vehicle_type && (
                <span className="flex items-center gap-0.5">
                  <Truck className="w-3 h-3" />{order.required_vehicle_type}
                </span>
              )}
            </div>

            {/* Driver */}
            {order.driver_name && (
              <div className="flex items-center gap-2 text-xs">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium text-foreground">{highlight(order.driver_name, q)}</span>
                {order.license_plate && (
                  <span className="text-muted-foreground font-mono">{highlight(order.license_plate, q)}</span>
                )}
                {order.vehicle_type && (
                  <span className="text-muted-foreground">{order.vehicle_type}</span>
                )}
              </div>
            )}
          </div>

          {/* Right: fee + dates */}
          <div className="shrink-0 text-right space-y-1">
            {order.total_fee != null ? (
              <div className="font-black text-base text-orange-600">NT${Number(order.total_fee).toLocaleString()}</div>
            ) : order.base_price != null ? (
              <div className="font-semibold text-sm text-muted-foreground">NT${Number(order.base_price).toLocaleString()}</div>
            ) : null}
            <FeeBadge status={order.fee_status} />
            <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-0.5">
              <Calendar className="w-2.5 h-2.5" />
              {fmtDate(order.pickup_date) || fmtDate(order.created_at)}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t bg-gray-50 px-4 py-3 space-y-2.5 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pickup */}
            <div className="space-y-1">
              <p className="text-xs font-bold text-blue-600 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> 取貨資訊
              </p>
              <p className="text-xs text-foreground">{order.pickup_address}</p>
              {order.pickup_date && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{order.pickup_date} {order.pickup_time ?? ""}
                </p>
              )}
              {(order.pickup_contact_person || order.pickup_contact_name) && (
                <p className="text-xs text-muted-foreground">聯絡人：{order.pickup_contact_person ?? order.pickup_contact_name}</p>
              )}
            </div>

            {/* Delivery */}
            <div className="space-y-1">
              <p className="text-xs font-bold text-orange-600 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> 送貨資訊
              </p>
              <p className="text-xs text-foreground">{order.delivery_address}</p>
              {order.delivery_date && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{order.delivery_date} {order.delivery_time ?? ""}
                </p>
              )}
              {(order.delivery_contact_person || order.delivery_contact_name) && (
                <p className="text-xs text-muted-foreground">聯絡人：{order.delivery_contact_person ?? order.delivery_contact_name}</p>
              )}
            </div>
          </div>

          {/* Cargo details */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-foreground flex items-center gap-1">
              <Package className="w-3 h-3" /> 貨物詳情
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{order.cargo_description}</span>
              {order.cargo_name && <span>· 品名：{order.cargo_name}</span>}
              {order.cargo_weight && <span>· 重量：{order.cargo_weight}kg</span>}
              {order.cargo_quantity && <span>· 數量：{order.cargo_quantity}</span>}
            </div>
            {order.special_requirements && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{order.special_requirements}
              </p>
            )}
            {order.need_tailgate === "yes" && (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">需尾門</Badge>
            )}
            {order.need_hydraulic_pallet === "yes" && (
              <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">需油壓板</Badge>
            )}
          </div>

          {/* Notes + Meta */}
          <div className="grid grid-cols-2 gap-3">
            {order.notes && (
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" /> 備註
                </p>
                <p className="text-xs text-muted-foreground">{order.notes}</p>
              </div>
            )}
            <div className="space-y-0.5 text-right ml-auto">
              {order.source && (
                <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
                  <Tag className="w-2.5 h-2.5" />來源：{order.source}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">建立：{format(parseISO(order.created_at), "yyyy/MM/dd HH:mm")}</p>
              {order.updated_at && (
                <p className="text-[10px] text-muted-foreground">更新：{format(parseISO(order.updated_at), "yyyy/MM/dd HH:mm")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Search Tab ───────────────────────────────────────────────────────────
export default function OrderSearchTab() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [results, setResults] = useState<SearchOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, st: string) => {
    if (!q.trim() && st === "all") {
      setResults([]); setSearched(false); return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (st !== "all") params.set("status", st);
      params.set("limit", "100");
      const res = await fetch(`${API}/orders/search?${params}`);
      const data: SearchOrder[] = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setTotal(Array.isArray(data) ? data.length : 0);
      setSearched(true);
    } catch {
      setResults([]); setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(query, status), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, status, doSearch]);

  // Auto focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const clear = () => { setQuery(""); setStatus("all"); setResults([]); setSearched(false); inputRef.current?.focus(); };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="bg-white border rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-base font-bold text-foreground mb-1">
          <Search className="w-5 h-5 text-blue-600" />
          訂單全域搜尋
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          可搜尋：訂單號、客戶姓名電話、取送地址、貨物品項、司機姓名車牌、備註、聯絡人…
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="輸入關鍵字，例如：台北、王大明、0912、水泥…"
              className="pl-9 pr-9 h-11 text-sm rounded-xl border-2 focus:border-blue-500 transition-colors"
            />
            {(query || loading) && (
              <button
                onClick={clear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <X className="w-4 h-4" />
                }
              </button>
            )}
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 w-32 rounded-xl text-sm border-2">
              <SelectValue placeholder="狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="pending">待派車</SelectItem>
              <SelectItem value="assigned">已派車</SelectItem>
              <SelectItem value="in_transit">運送中</SelectItem>
              <SelectItem value="delivered">已完成</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quick tags */}
        <div className="flex flex-wrap gap-1.5">
          {["台北", "台中", "高雄", "未指派", "今日"].map(tag => (
            <button
              key={tag}
              onClick={() => setQuery(tag)}
              className="px-2.5 py-0.5 text-xs rounded-full border bg-muted/40 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {tag}
            </button>
          ))}
          <button
            onClick={() => setStatus("pending")}
            className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors
              ${status === "pending" ? "bg-orange-100 border-orange-300 text-orange-700" : "bg-muted/40 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700"}`}
          >
            ⏳ 待派車
          </button>
          <button
            onClick={() => setStatus("in_transit")}
            className={`px-2.5 py-0.5 text-xs rounded-full border transition-colors
              ${status === "in_transit" ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-muted/40 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700"}`}
          >
            🚛 運送中
          </button>
          <button
            onClick={() => { setQuery(""); setStatus("all"); }}
            className="px-2.5 py-0.5 text-xs rounded-full border bg-muted/40 hover:bg-muted transition-colors text-muted-foreground"
          >
            清除
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-base font-medium">輸入關鍵字開始搜尋</p>
          <p className="text-xs mt-1">支援訂單號、客戶名稱、電話、地址、貨物、司機等全欄位搜尋</p>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-16 text-muted-foreground border rounded-xl bg-white">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-base font-medium">找不到相符的訂單</p>
          <p className="text-xs mt-1">請試試其他關鍵字，或清除狀態篩選</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={clear}>清除搜尋</Button>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              找到 <span className="font-bold text-foreground">{total}</span> 筆結果
              {total >= 100 && <span className="ml-1 text-xs">（最多顯示 100 筆，請縮小搜尋範圍）</span>}
            </p>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clear}>
              <X className="w-3.5 h-3.5 mr-1" /> 清除
            </Button>
          </div>
          {results.map(order => (
            <OrderCard key={order.id} order={order} q={query} />
          ))}
        </div>
      )}
    </div>
  );
}
