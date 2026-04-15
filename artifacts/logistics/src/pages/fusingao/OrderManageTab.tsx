import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  Plus, Search, RefreshCw, Edit2, Printer, Clock, X,
  Truck, CheckCircle2, Package, MapPin, User,
  ChevronDown, FileText, AlertCircle, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderRow {
  id: number;
  order_no: string;
  status: string;
  created_at: string;
  scheduled_date: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  delivery_address: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  cargo_name: string | null;
  cargo_qty: number | null;
  cargo_weight: number | null;
  cargo_volume: number | null;
  required_vehicle_type: string | null;
  route_id: string | null;
  base_price: number | null;
  total_fee: number | null;
  driver_payment_status: string | null;
  notes: string | null;
  operator_name: string | null;
  fleet_name: string | null;
  event_count: number;
}

interface OrderEvent {
  id: number;
  event_type: string;
  note: string;
  created_by: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "pending",    label: "待出發",  color: "bg-amber-100 text-amber-700"  },
  { value: "assigned",   label: "已派車",  color: "bg-blue-100 text-blue-700"    },
  { value: "in_transit", label: "運送中",  color: "bg-purple-100 text-purple-700"},
  { value: "delivered",  label: "已送達",  color: "bg-green-100 text-green-700"  },
  { value: "cancelled",  label: "已取消",  color: "bg-gray-100 text-gray-500"    },
];

const EVENT_TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  created:       { icon: <Plus className="h-3.5 w-3.5" />,        color: "bg-blue-500",   label: "建立訂單" },
  status_change: { icon: <RefreshCw className="h-3.5 w-3.5" />,   color: "bg-orange-500", label: "狀態變更" },
  dispatched:    { icon: <Send className="h-3.5 w-3.5" />,        color: "bg-indigo-500", label: "已派車"   },
  picked_up:     { icon: <Package className="h-3.5 w-3.5" />,     color: "bg-teal-500",   label: "已取件"   },
  delivered:     { icon: <CheckCircle2 className="h-3.5 w-3.5" />,color: "bg-green-500",  label: "已送達"   },
  issue:         { icon: <AlertCircle className="h-3.5 w-3.5" />, color: "bg-red-500",    label: "異常回報" },
  note:          { icon: <FileText className="h-3.5 w-3.5" />,    color: "bg-gray-400",   label: "備註"     },
};

const statusMeta = (s: string) => STATUS_OPTIONS.find(o => o.value === s) ?? { label: s, color: "bg-gray-100 text-gray-500" };

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const fmtTime = (s: string) => {
  return new Date(s).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

// ─── Empty order form ─────────────────────────────────────────────────────────
const emptyForm = () => ({
  status: "pending",
  customer_name: "",
  customer_phone: "",
  pickup_address: "",
  pickup_contact_name: "",
  pickup_contact_phone: "",
  delivery_address: "",
  delivery_contact_name: "",
  delivery_contact_phone: "",
  cargo_name: "",
  cargo_qty: "",
  cargo_weight: "",
  cargo_volume: "",
  required_vehicle_type: "",
  base_price: "",
  total_fee: "",
  scheduled_date: "",
  notes: "",
  operator_name: "系統",
});

// ─── Print view ───────────────────────────────────────────────────────────────
function PrintView({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const sm = statusMeta(order.status);

  function doPrint() {
    const content = ref.current?.innerHTML ?? "";
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>出貨單 ${order.order_no}</title>
      <style>
        body{font-family:'PingFang TC','Microsoft JhengHei',sans-serif;font-size:12px;color:#111;padding:20px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:14px}
        .title{font-size:20px;font-weight:bold}
        .order-no{font-size:14px;color:#555}
        table{width:100%;border-collapse:collapse;margin-bottom:12px}
        td{border:1px solid #ccc;padding:6px 8px;vertical-align:top}
        td.label{background:#f5f5f5;font-weight:bold;width:25%;white-space:nowrap}
        .section-title{font-weight:bold;background:#333;color:white;padding:4px 8px;margin:10px 0 0}
        .barcode{font-family:monospace;font-size:28px;letter-spacing:4px;text-align:center;border:1px solid #ccc;padding:8px;margin:10px 0}
        .footer{margin-top:20px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#999;text-align:center}
        @media print{body{padding:0}.no-print{display:none}}
      </style></head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />出貨單預覽
          </DialogTitle>
        </DialogHeader>

        <div ref={ref} className="text-sm space-y-3 print:block">
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
            <div>
              <div className="text-xl font-bold">富詠運輸股份有限公司</div>
              <div className="text-gray-500 text-xs">FUYING TRANSPORT CO., LTD.</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg">{order.order_no}</div>
              <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${sm.color}`}>{sm.label}</div>
            </div>
          </div>

          <div className="font-mono text-2xl tracking-widest text-center border border-gray-300 py-2 rounded bg-gray-50">
            {order.order_no}
          </div>

          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="font-semibold bg-gray-800 text-white col-span-2 px-2 py-1 rounded-sm">📦 取貨資訊</div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">取貨地址</div>
              <div className="font-medium">{order.pickup_address ?? "—"}</div>
            </div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">取貨聯絡</div>
              <div className="font-medium">{order.pickup_contact_name ?? "—"}</div>
              <div>{order.pickup_contact_phone ?? ""}</div>
            </div>

            <div className="font-semibold bg-gray-800 text-white col-span-2 px-2 py-1 rounded-sm mt-1">🏠 送達資訊</div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">送達地址</div>
              <div className="font-medium">{order.delivery_address ?? "—"}</div>
            </div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">收件聯絡</div>
              <div className="font-medium">{order.delivery_contact_name ?? "—"}</div>
              <div>{order.delivery_contact_phone ?? ""}</div>
            </div>

            <div className="font-semibold bg-gray-800 text-white col-span-2 px-2 py-1 rounded-sm mt-1">📋 貨物資訊</div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">品名</div>
              <div className="font-medium">{order.cargo_name ?? "—"}</div>
            </div>
            <div className="border rounded px-2 py-1 grid grid-cols-3 gap-x-2">
              <div><div className="text-gray-400">數量</div><div className="font-medium">{order.cargo_qty ?? "—"}</div></div>
              <div><div className="text-gray-400">重量(kg)</div><div className="font-medium">{order.cargo_weight ?? "—"}</div></div>
              <div><div className="text-gray-400">才積(m³)</div><div className="font-medium">{order.cargo_volume ?? "—"}</div></div>
            </div>

            <div className="font-semibold bg-gray-800 text-white col-span-2 px-2 py-1 rounded-sm mt-1">🚚 派車資訊</div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">預計日期</div>
              <div className="font-medium">{fmtDate(order.scheduled_date)}</div>
            </div>
            <div className="border rounded px-2 py-1">
              <div className="text-gray-400">車型 / 車隊</div>
              <div className="font-medium">{order.required_vehicle_type ?? "—"} / {order.fleet_name ?? "待指派"}</div>
            </div>
          </div>

          {order.notes && (
            <div className="border rounded px-2 py-1 text-xs bg-yellow-50 border-yellow-200">
              <div className="text-yellow-700 font-semibold mb-0.5">備註</div>
              <div>{order.notes}</div>
            </div>
          )}

          <div className="text-[10px] text-gray-400 text-center border-t pt-2">
            建立：{fmtTime(order.created_at)} ・ 經手人：{order.operator_name ?? "—"} ・ 富詠運輸 ©2026
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
          <Button onClick={doPrint} className="gap-1.5 bg-gray-800 hover:bg-gray-900 text-white">
            <Printer className="h-4 w-4" />列印 / 儲存 PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Timeline drawer ──────────────────────────────────────────────────────────
function TimelineDrawer({ orderId, orderNo, onClose }: { orderId: number; orderNo: string; onClose: () => void }) {
  const { toast } = useToast();
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [newType, setNewType] = useState("note");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/fusingao/order-manage/${orderId}/timeline`)).then(x => x.json());
      if (r.ok) setEvents(r.events ?? []);
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function addEvent() {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      const r = await fetch(apiUrl(`/fusingao/order-manage/${orderId}/events`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: newType, note: newNote, created_by: "操作員" }),
      }).then(x => x.json());
      if (r.ok) {
        setNewNote("");
        await load();
        toast({ title: "✅ 已新增紀錄" });
      } else {
        toast({ title: "新增失敗", description: r.error, variant: "destructive" });
      }
    } finally { setAdding(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            追蹤時間軸 — {orderNo}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-0 min-h-0 pr-1">
          {loading && <div className="text-center py-8 text-gray-400 text-sm">載入中…</div>}
          {!loading && events.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">尚無追蹤紀錄</div>
          )}
          {!loading && events.map((ev, i) => {
            const meta = EVENT_TYPE_META[ev.event_type] ?? EVENT_TYPE_META.note;
            const isLast = i === events.length - 1;
            return (
              <div key={ev.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ${meta.color}`}>
                    {meta.icon}
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>
                <div className="pb-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
                    <span className="text-[10px] text-gray-400">{fmtTime(ev.created_at)}</span>
                    {ev.created_by && <span className="text-[10px] text-gray-400">by {ev.created_by}</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 break-words">{ev.note}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="border rounded px-2 py-1 text-xs text-gray-700 bg-white shrink-0"
            >
              {Object.entries(EVENT_TYPE_META).filter(([k]) => k !== "created" && k !== "status_change").map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Input
              placeholder="新增備註或事件記錄…"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && addEvent()}
              className="text-sm h-8"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={addEvent} disabled={adding || !newNote.trim()}>
              {adding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order form dialog (Create / Edit) ────────────────────────────────────────
function OrderFormDialog({
  order, onClose, onSaved,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!order;
  const [form, setForm] = useState(() =>
    order ? {
      status: order.status,
      customer_name: order.customer_name ?? "",
      customer_phone: order.customer_phone ?? "",
      pickup_address: order.pickup_address ?? "",
      pickup_contact_name: order.pickup_contact_name ?? "",
      pickup_contact_phone: order.pickup_contact_phone ?? "",
      delivery_address: order.delivery_address ?? "",
      delivery_contact_name: order.delivery_contact_name ?? "",
      delivery_contact_phone: order.delivery_contact_phone ?? "",
      cargo_name: order.cargo_name ?? "",
      cargo_qty: order.cargo_qty != null ? String(order.cargo_qty) : "",
      cargo_weight: order.cargo_weight != null ? String(order.cargo_weight) : "",
      cargo_volume: order.cargo_volume != null ? String(order.cargo_volume) : "",
      required_vehicle_type: order.required_vehicle_type ?? "",
      base_price: order.base_price != null ? String(order.base_price) : "",
      total_fee: order.total_fee != null ? String(order.total_fee) : "",
      scheduled_date: order.scheduled_date ? order.scheduled_date.slice(0, 10) : "",
      notes: order.notes ?? "",
      operator_name: order.operator_name ?? "系統",
    } : emptyForm()
  );
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.pickup_address || !form.delivery_address) {
      toast({ title: "請填寫取貨與送達地址", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...(isEdit ? { _prev_status: order.status } : {}),
      };
      const url = isEdit
        ? apiUrl(`/fusingao/order-manage/${order.id}`)
        : apiUrl("/fusingao/order-manage");
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(x => x.json());
      if (r.ok) {
        toast({ title: isEdit ? "✅ 訂單已更新" : `✅ 訂單建立 ${r.order_no}` });
        onSaved();
        onClose();
      } else {
        toast({ title: "儲存失敗", description: r.error, variant: "destructive" });
      }
    } finally { setSaving(false); }
  }

  const F = ({ label, k, placeholder, type = "text", half = false }: {
    label: string; k: string; placeholder?: string; type?: string; half?: boolean;
  }) => (
    <div className={half ? "col-span-1" : "col-span-2"}>
      <Label className="text-xs text-gray-600 mb-0.5 block">{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={(form as Record<string, string>)[k]}
        onChange={e => set(k, e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isEdit ? `編輯訂單 ${order.order_no}` : "新增訂單"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Status + scheduled date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-0.5 block">訂單狀態</Label>
              <Select value={form.status} onValueChange={v => set("status", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <F label="預計出車日期" k="scheduled_date" type="date" half />
          </div>

          {/* Customer */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 mb-2">
              <User className="h-3.5 w-3.5 text-blue-500" />客戶資訊
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="客戶名稱" k="customer_name" placeholder="公司或個人名稱" half />
              <F label="客戶電話" k="customer_phone" placeholder="0912-345-678" half />
            </div>
          </div>

          {/* Pickup */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 mb-2">
              <MapPin className="h-3.5 w-3.5 text-orange-500" />取貨資訊
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="取貨地址 *" k="pickup_address" placeholder="台北市中山區…" />
              <F label="取貨聯絡人" k="pickup_contact_name" placeholder="聯絡人姓名" half />
              <F label="取貨聯絡電話" k="pickup_contact_phone" placeholder="02-xxxx-xxxx" half />
            </div>
          </div>

          {/* Delivery */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 mb-2">
              <Truck className="h-3.5 w-3.5 text-green-500" />送達資訊
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="送達地址 *" k="delivery_address" placeholder="新北市板橋區…" />
              <F label="收件聯絡人" k="delivery_contact_name" placeholder="收件人姓名" half />
              <F label="收件聯絡電話" k="delivery_contact_phone" placeholder="0912-345-678" half />
            </div>
          </div>

          {/* Cargo */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 mb-2">
              <Package className="h-3.5 w-3.5 text-purple-500" />貨物資訊
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="品名" k="cargo_name" placeholder="貨物名稱" />
              <F label="數量" k="cargo_qty" type="number" placeholder="件數" half />
              <F label="重量 (kg)" k="cargo_weight" type="number" placeholder="0.0" half />
              <F label="才積 (m³)" k="cargo_volume" type="number" placeholder="0.000" half />
              <div className="col-span-1">
                <Label className="text-xs text-gray-600 mb-0.5 block">車型需求</Label>
                <Select value={form.required_vehicle_type} onValueChange={v => set("required_vehicle_type", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="選擇車型" />
                  </SelectTrigger>
                  <SelectContent>
                    {["箱型車", "冷藏車", "尾門車", "平板車", "一噸半", "兩噸半", "四噸車"].map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Pricing + operator */}
          <div className="grid grid-cols-2 gap-3">
            <F label="基本運費 (NT$)" k="base_price" type="number" placeholder="0" half />
            <F label="總費用 (NT$)" k="total_fee" type="number" placeholder="0" half />
            <F label="經手人" k="operator_name" placeholder="操作人員名稱" half />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-gray-600 mb-0.5 block">備註</Label>
            <Textarea
              placeholder="特殊要求、地址說明、注意事項…"
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : (isEdit ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />)}
            {saving ? "儲存中…" : (isEdit ? "更新訂單" : "建立訂單")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OrderManageTab() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [timelineOrder, setTimelineOrder] = useState<OrderRow | null>(null);
  const [printOrder, setPrintOrder] = useState<OrderRow | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterMonth) params.set("month", filterMonth);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      params.set("limit", "80");
      const r = await fetch(apiUrl(`/fusingao/order-manage?${params}`)).then(x => x.json());
      if (r.ok) { setOrders(r.orders ?? []); setTotal(r.total ?? 0); }
    } finally { setLoading(false); }
  }, [keyword, filterStatus, filterMonth]);

  useEffect(() => {
    const t = setTimeout(load, keyword ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, keyword]);

  // Month options: last 6 months
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="搜尋訂單號、地址、品名、客戶…"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {keyword && (
            <button onClick={() => setKeyword("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-8 border rounded px-2 text-xs text-gray-700 bg-white"
        >
          <option value="all">全部狀態</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="h-8 border rounded px-2 text-xs text-gray-700 bg-white"
        >
          <option value="">全部月份</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <Button variant="ghost" size="sm" className="h-8" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white ml-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />新增訂單
        </Button>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        <span>共 <strong className="text-gray-800">{total}</strong> 筆</span>
        {STATUS_OPTIONS.map(o => {
          const cnt = orders.filter(r => r.status === o.value).length;
          if (!cnt) return null;
          return <span key={o.value}><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1 ${o.color}`}>{o.label}</span>{cnt}</span>;
        })}
      </div>

      {/* ── Table ── */}
      {loading && orders.length === 0 && (
        <div className="flex justify-center py-16 text-gray-400 text-sm">載入中…</div>
      )}
      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center py-16 text-gray-400">
          <FileText className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">尚無訂單資料</p>
          <p className="text-xs mt-1">點擊「新增訂單」建立第一筆</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">訂單號</th>
                <th className="border-b px-3 py-2 text-left font-semibold">狀態</th>
                <th className="border-b px-3 py-2 text-left font-semibold whitespace-nowrap">預計日期</th>
                <th className="border-b px-3 py-2 text-left font-semibold">客戶</th>
                <th className="border-b px-2 py-2 text-left font-semibold hidden md:table-cell">送達地址</th>
                <th className="border-b px-2 py-2 text-left font-semibold hidden lg:table-cell">品名</th>
                <th className="border-b px-2 py-2 text-left font-semibold hidden lg:table-cell">車隊</th>
                <th className="border-b px-3 py-2 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const sm = statusMeta(o.status);
                const isExpanded = expandedId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr
                      className={`border-b hover:bg-gray-50/60 cursor-pointer transition-colors ${isExpanded ? "bg-orange-50/40" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : o.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          <span className="font-mono text-xs font-semibold text-gray-700">{o.order_no}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 ml-4">{fmtDate(o.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${sm.color}`}>{sm.label}</span>
                        {o.event_count > 0 && (
                          <div className="text-[9px] text-blue-500 mt-0.5">{o.event_count} 條紀錄</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(o.scheduled_date)}</td>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium text-gray-800">{o.customer_name ?? "—"}</div>
                        <div className="text-[10px] text-gray-400">{o.customer_phone ?? ""}</div>
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600 max-w-[140px] truncate hidden md:table-cell" title={o.delivery_address ?? ""}>
                        {o.delivery_address ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-600 hidden lg:table-cell">
                        {o.cargo_name ?? "—"}
                        {o.cargo_qty && <span className="text-gray-400 ml-1">×{o.cargo_qty}</span>}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-500 hidden lg:table-cell">
                        {o.fleet_name ?? <span className="text-gray-300">待指派</span>}
                      </td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            title="追蹤時間軸"
                            onClick={() => setTimelineOrder(o)}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="編輯"
                            onClick={() => setEditOrder(o)}
                            className="p-1.5 rounded hover:bg-orange-50 text-gray-400 hover:text-orange-600 transition-colors"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="列印出貨單"
                            onClick={() => setPrintOrder(o)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${o.id}-detail`} className="bg-orange-50/30">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                            <div><span className="text-gray-400 mr-1">取貨地址：</span><span className="text-gray-700">{o.pickup_address ?? "—"}</span></div>
                            <div><span className="text-gray-400 mr-1">取貨聯絡：</span><span className="text-gray-700">{o.pickup_contact_name ?? "—"} {o.pickup_contact_phone ?? ""}</span></div>
                            <div><span className="text-gray-400 mr-1">送達地址：</span><span className="text-gray-700">{o.delivery_address ?? "—"}</span></div>
                            <div><span className="text-gray-400 mr-1">收件聯絡：</span><span className="text-gray-700">{o.delivery_contact_name ?? "—"} {o.delivery_contact_phone ?? ""}</span></div>
                            <div><span className="text-gray-400 mr-1">品名/才積：</span><span className="text-gray-700">{o.cargo_name ?? "—"} {o.cargo_volume ? `${o.cargo_volume}m³` : ""}</span></div>
                            <div><span className="text-gray-400 mr-1">車型：</span><span className="text-gray-700">{o.required_vehicle_type ?? "—"}</span></div>
                            <div><span className="text-gray-400 mr-1">運費：</span><span className="text-gray-700">{o.total_fee ? `NT$ ${Number(o.total_fee).toLocaleString()}` : "—"}</span></div>
                            <div><span className="text-gray-400 mr-1">經手人：</span><span className="text-gray-700">{o.operator_name ?? "—"}</span></div>
                            {o.notes && <div className="col-span-2 md:col-span-3"><span className="text-gray-400 mr-1">備註：</span><span className="text-gray-700">{o.notes}</span></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Dialogs ── */}
      {createOpen && (
        <OrderFormDialog order={null} onClose={() => setCreateOpen(false)} onSaved={load} />
      )}
      {editOrder && (
        <OrderFormDialog order={editOrder} onClose={() => setEditOrder(null)} onSaved={load} />
      )}
      {timelineOrder && (
        <TimelineDrawer orderId={timelineOrder.id} orderNo={timelineOrder.order_no} onClose={() => setTimelineOrder(null)} />
      )}
      {printOrder && (
        <PrintView order={printOrder} onClose={() => setPrintOrder(null)} />
      )}
    </div>
  );
}
