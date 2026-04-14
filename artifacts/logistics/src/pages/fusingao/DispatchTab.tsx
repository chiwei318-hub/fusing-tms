import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw,
  Send, CheckCircle, Clock, Trash2, CalendarDays, Link2, FileSpreadsheet, ShoppingBag, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DateEntry {
  order_id: number;
  dispatch_driver_code: string | null;
  fleet_name: string | null;
  done: boolean;
}

interface RouteRow {
  route_id: string;
  prefix: string | null;
  stations: number | null;
  dates: Record<string, DateEntry>;
}

interface DispatchData {
  dates: string[];
  routes: RouteRow[];
  range: { start: string; end: string };
}

interface Fleet {
  id: number;
  fleet_name: string;
}

interface DispatchOrder {
  id: number;
  fleet_id: number;
  fleet_name: string;
  title: string;
  week_start: string;
  week_end: string;
  status: "sent" | "acknowledged" | "assigned";
  route_count: number;
  assigned_count: number;
  sent_at: string;
  acknowledged_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAY_ZH = ["一", "二", "三", "四", "五", "六", "日"];

function weekStart(offset = 0) {
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow + offset * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end: sun.toISOString().slice(0, 10),
  };
}
function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function dayOfWeek(d: string) {
  const dt = new Date(d + "T00:00:00");
  return DAY_ZH[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
}
function isToday(d: string) { return d === new Date().toISOString().slice(0, 10); }

const PREFIX_COLOR: Record<string, string> = {
  FN: "bg-orange-100 text-orange-700", FM: "bg-yellow-100 text-yellow-700",
  WB: "bg-blue-100 text-blue-700",    WD: "bg-indigo-100 text-indigo-700",
  NB: "bg-green-100 text-green-700",  A3: "bg-purple-100 text-purple-700",
};
function prefixColor(p: string | null) { return PREFIX_COLOR[p ?? ""] ?? "bg-gray-100 text-gray-600"; }

const STATUS_INFO = {
  sent:         { label: "已發送",   color: "bg-blue-100 text-blue-700",   icon: Send },
  acknowledged: { label: "已接收",   color: "bg-amber-100 text-amber-700", icon: Clock },
  assigned:     { label: "已排班",   color: "bg-green-100 text-green-700", icon: CheckCircle },
};

// ─── Fleet assignment cell ────────────────────────────────────────────────────
function FleetCell({
  entry, fleets, onAssign,
}: {
  entry: DateEntry | undefined;
  fleets: Fleet[];
  onAssign: (orderId: number, fleetId: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!entry) return <td className="border border-gray-100 px-2 py-2 bg-gray-50/30" />;

  const fleet = entry.fleet_name;
  const done  = entry.done;

  async function assign(fleetId: number | null) {
    setOpen(false);
    setSaving(true);
    await onAssign(entry!.order_id, fleetId).finally(() => setSaving(false));
  }

  return (
    <td className={`border border-gray-100 px-1 py-1 text-center text-xs relative
      ${done ? "bg-green-50" : fleet ? "bg-blue-50" : ""}`}>
      {saving ? (
        <RefreshCw className="h-3 w-3 animate-spin text-gray-400 mx-auto" />
      ) : (
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setOpen(o => !o)}
            className={`text-[11px] px-1.5 py-0.5 rounded w-full truncate max-w-[90px] hover:bg-blue-100 transition-colors
              ${done ? "text-green-700 font-medium" : fleet ? "text-blue-700 font-medium" : "text-gray-300"}`}
            title={fleet ?? "點擊指派車隊"}
          >
            {fleet ?? <span>＋</span>}
          </button>
          {open && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 bg-white border shadow-xl rounded-lg text-left min-w-[140px] py-1 mt-0.5">
              <button
                onClick={() => assign(null)}
                className="block w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 text-left"
              >
                — 清除 —
              </button>
              <div className="border-t my-0.5" />
              {fleets.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-gray-400">無可用車隊</p>
              ) : fleets.map(f => (
                <button
                  key={f.id}
                  onClick={() => assign(f.id)}
                  className={`block w-full px-3 py-1.5 text-xs hover:bg-blue-50 text-left truncate
                    ${entry.fleet_name === f.fleet_name ? "text-blue-700 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                >
                  {f.fleet_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </td>
  );
}

// ─── Batch assign bar ─────────────────────────────────────────────────────────
function BatchAssignBar({
  selectedIds, fleets, onAssign, onClear,
}: {
  selectedIds: Set<number>;
  fleets: Fleet[];
  onAssign: (fleetId: number | null) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (selectedIds.size === 0) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-lg flex-wrap">
      <span className="text-sm font-bold">已選 {selectedIds.size} 條路線</span>
      <div className="relative ml-2" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 bg-white text-blue-700 font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
        >
          <Send className="h-3.5 w-3.5" />
          批次指派車隊
          <ChevronDown className="h-3 w-3" />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 bg-white border shadow-xl rounded-lg min-w-[160px] py-1 z-50">
            <button
              onClick={() => { onAssign(null); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 text-left"
            >— 清除車隊 —</button>
            <div className="border-t my-0.5" />
            {fleets.map(f => (
              <button
                key={f.id}
                onClick={() => { onAssign(f.id); setOpen(false); }}
                className="block w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 text-left truncate"
              >{f.fleet_name}</button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onClear}
        className="ml-auto text-blue-200 hover:text-white text-xs flex items-center gap-1"
      >
        <X className="h-3.5 w-3.5" />取消選取
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DispatchTab({
  onViewSchedule,
}: {
  onViewSchedule?: (routeId: string) => void;
}) {
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DispatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefixFilter, setPrefixFilter] = useState<string>("all");
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [batchAssigning, setBatchAssigning] = useState(false);

  // ── Send dispatch order state ─────────────────────────────────────────────
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedFleet, setSelectedFleet] = useState<string>("");
  const [sendNotes, setSendNotes] = useState("");
  const [sending, setSending] = useState(false);

  // ── Import from sheet state ───────────────────────────────────────────────
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSheetUrl, setImportSheetUrl] = useState("");
  const [importFleet, setImportFleet] = useState<string>("");
  const [importTitle, setImportTitle] = useState("");
  const [importWeekStart, setImportWeekStart] = useState(weekStart(0).start);
  const [importWeekEnd, setImportWeekEnd] = useState(weekStart(0).end);
  const [importNotes, setImportNotes] = useState("");
  const [importing, setImporting] = useState(false);

  // ── From-Shopee state ─────────────────────────────────────────────────────
  const [shopeeDialogOpen, setShopeeDialogOpen] = useState(false);
  const [shopeeFleet, setShopeeFleet] = useState<string>("");
  const [shopeeTitle, setShopeeTitle] = useState("");
  const [shopeeStart, setShopeeStart] = useState(weekStart(0).start);
  const [shopeeEnd, setShopeeEnd] = useState(weekStart(0).end);
  const [shopeeNotes, setShopeeNotes] = useState("");
  const [shopeeCreating, setShopeeCreating] = useState(false);

  // ── Sent orders panel ─────────────────────────────────────────────────────
  const [sentOrders, setSentOrders] = useState<DispatchOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    const { start, end } = weekStart(offset);
    try {
      const d = await fetch(apiUrl(`/fusingao/dispatch?startDate=${start}&endDate=${end}`)).then(r => r.json());
      if (d.ok) setData(d);
      else toast({ title: "載入失敗", description: d.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadFleets = useCallback(async () => {
    const d = await fetch(apiUrl("/fusingao/fleets")).then(r => r.json());
    if (d.ok) setFleets(d.fleets ?? []);
  }, []);

  const loadSentOrders = useCallback(async () => {
    setOrdersLoading(true);
    const { start, end } = weekStart(weekOffset);
    try {
      const d = await fetch(apiUrl(`/dispatch-orders?week_start=${start}`)).then(r => r.json());
      if (d.ok) setSentOrders(d.orders ?? []);
    } finally {
      setOrdersLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => { load(weekOffset); loadSentOrders(); }, [weekOffset, load, loadSentOrders]);
  useEffect(() => { loadFleets(); }, [loadFleets]);

  async function handleSave(orderId: number, code: string) {
    const r = await fetch(apiUrl(`/fusingao/routes/${orderId}/dispatch-code`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispatch_driver_code: code || null }),
    }).then(x => x.json());
    if (r.ok) {
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          routes: prev.routes.map(route => {
            const newDates = { ...route.dates };
            for (const [date, entry] of Object.entries(newDates)) {
              if (entry.order_id === orderId)
                newDates[date] = { ...entry, dispatch_driver_code: code || null };
            }
            return { ...route, dates: newDates };
          }),
        };
      });
      toast({ title: "已儲存", description: `司機代號更新為 ${code || "（清空）"}` });
    } else {
      toast({ title: "儲存失敗", description: r.error, variant: "destructive" });
    }
  }

  async function handleFleetAssign(orderId: number, fleetId: number | null) {
    const fleet = fleets.find(f => f.id === fleetId) ?? null;
    const r = await fetch(apiUrl(`/fusingao/routes/${orderId}/assign-fleet`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fleet_id: fleetId }),
    }).then(x => x.json());
    if (r.ok) {
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          routes: prev.routes.map(route => {
            const newDates = { ...route.dates };
            for (const [date, entry] of Object.entries(newDates)) {
              if (entry.order_id === orderId)
                newDates[date] = { ...entry, fleet_name: fleet?.fleet_name ?? null };
            }
            return { ...route, dates: newDates };
          }),
        };
      });
      toast({ title: "✅ 車隊已指派", description: fleet ? `已指派給 ${fleet.fleet_name}` : "已清除車隊指派" });
    } else {
      toast({ title: "指派失敗", description: r.error, variant: "destructive" });
    }
  }

  // ── Batch fleet assign ────────────────────────────────────────────────────
  async function handleBatchAssign(fleetId: number | null) {
    if (selectedOrderIds.size === 0) return;
    setBatchAssigning(true);
    const fleet = fleets.find(f => f.id === fleetId) ?? null;
    try {
      const r = await fetch(apiUrl("/fusingao/routes/batch-assign"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: [...selectedOrderIds], fleet_id: fleetId }),
      }).then(x => x.json());
      if (r.ok) {
        toast({ title: `✅ 批次指派完成`, description: `${r.updated} 筆已指派給 ${fleet?.fleet_name ?? "（清除）"}` });
        setSelectedRouteIds(new Set());
        setSelectedOrderIds(new Set());
        await load(weekOffset);
      } else {
        toast({ title: "批次指派失敗", description: r.error, variant: "destructive" });
      }
    } finally {
      setBatchAssigning(false);
    }
  }

  function toggleRouteSelect(routeId: string, orderIds: number[]) {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) {
        next.delete(routeId);
        setSelectedOrderIds(prevOids => {
          const n = new Set(prevOids);
          orderIds.forEach(id => n.delete(id));
          return n;
        });
      } else {
        next.add(routeId);
        setSelectedOrderIds(prevOids => {
          const n = new Set(prevOids);
          orderIds.forEach(id => n.add(id));
          return n;
        });
      }
      return next;
    });
  }

  function selectAllVisible() {
    const newRouteIds = new Set(filteredRoutes.map(r => r.route_id));
    const newOrderIds = new Set<number>();
    filteredRoutes.forEach(r => Object.values(r.dates).forEach(e => newOrderIds.add(e.order_id)));
    setSelectedRouteIds(newRouteIds);
    setSelectedOrderIds(newOrderIds);
  }

  function clearSelection() {
    setSelectedRouteIds(new Set());
    setSelectedOrderIds(new Set());
  }

  // ── Send dispatch order ───────────────────────────────────────────────────
  async function handleSend() {
    if (!selectedFleet) return;
    setSending(true);
    const { start, end } = weekStart(weekOffset);
    const fleet = fleets.find(f => String(f.id) === selectedFleet);

    // Collect routes for this fleet in the current week
    const routeItems: { order_id: number; route_label: string; route_date: string; prefix: string | null }[] = [];
    if (data) {
      for (const route of data.routes) {
        for (const [date, entry] of Object.entries(route.dates)) {
          if (!entry.fleet_name || !fleet) continue;
          if (entry.fleet_name !== fleet.fleet_name && !entry.fleet_name.includes(fleet.fleet_name)) continue;
          routeItems.push({
            order_id: entry.order_id,
            route_label: route.route_id,
            route_date: date,
            prefix: route.prefix,
          });
        }
      }
    }

    try {
      const r = await fetch(apiUrl("/dispatch-orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleet_id: Number(selectedFleet),
          fleet_name: fleet?.fleet_name,
          title: `${start.slice(0, 7)} 第${Math.ceil(parseInt(start.slice(8)) / 7)}週 派車單`,
          week_start: start,
          week_end: end,
          notes: sendNotes || null,
          routes: routeItems,
        }),
      }).then(x => x.json());

      if (r.ok) {
        toast({ title: "📤 派車單已發送", description: `已發送給 ${fleet?.fleet_name}，共 ${routeItems.length} 條路線` });
        setSendDialogOpen(false);
        setSendNotes("");
        setSelectedFleet("");
        loadSentOrders();
      } else {
        toast({ title: "發送失敗", description: r.error, variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteOrder(id: number) {
    await fetch(apiUrl(`/dispatch-orders/${id}`), { method: "DELETE" });
    loadSentOrders();
    toast({ title: "已撤銷派車單" });
  }

  async function handleFromShopee() {
    if (!shopeeFleet || !shopeeTitle || !shopeeStart || !shopeeEnd) return;
    setShopeeCreating(true);
    const fleet = fleets.find(f => String(f.id) === shopeeFleet);
    try {
      const r = await fetch(apiUrl("/dispatch-orders/from-shopee"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleet_id: Number(shopeeFleet),
          fleet_name: fleet?.fleet_name,
          title: shopeeTitle,
          week_start: shopeeStart,
          week_end: shopeeEnd,
          notes: shopeeNotes || null,
        }),
      }).then(x => x.json());

      if (r.ok) {
        toast({ title: "✅ 蝦皮派車單已建立", description: `共加入 ${r.route_count} 筆訂單，已發送給 ${fleet?.fleet_name}` });
        setShopeeDialogOpen(false);
        setShopeeNotes("");
        loadSentOrders();
      } else {
        toast({ title: "建立失敗", description: r.error, variant: "destructive" });
      }
    } finally {
      setShopeeCreating(false);
    }
  }

  async function handleImportSheet() {
    if (!importSheetUrl || !importFleet || !importTitle || !importWeekStart || !importWeekEnd) return;
    setImporting(true);
    const fleet = fleets.find(f => String(f.id) === importFleet);
    try {
      const r = await fetch(apiUrl("/dispatch-orders/import-sheet"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheet_url: importSheetUrl,
          fleet_id: Number(importFleet),
          fleet_name: fleet?.fleet_name,
          title: importTitle,
          week_start: importWeekStart,
          week_end: importWeekEnd,
          notes: importNotes || null,
        }),
      }).then(x => x.json());

      if (r.ok) {
        toast({ title: "✅ 班表匯入成功", description: `已建立派車單，共匯入 ${r.route_count} 筆路線` });
        setImportDialogOpen(false);
        setImportSheetUrl("");
        setImportNotes("");
        loadSentOrders();
      } else {
        toast({ title: "匯入失敗", description: r.error, variant: "destructive" });
      }
    } finally {
      setImporting(false);
    }
  }

  const prefixes = data ? [...new Set(data.routes.map(r => r.prefix).filter(Boolean))] as string[] : [];
  const filteredRoutes = data?.routes.filter(r => prefixFilter === "all" || r.prefix === prefixFilter) ?? [];

  const totalCells  = filteredRoutes.reduce((acc, r) => acc + Object.keys(r.dates).length, 0);
  const filledCells = filteredRoutes.reduce((acc, r) => acc + Object.values(r.dates).filter(e => e.dispatch_driver_code).length, 0);
  const doneCells   = filteredRoutes.reduce((acc, r) => acc + Object.values(r.dates).filter(e => e.done).length, 0);

  const { start, end } = weekStart(weekOffset);

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            {start.slice(5).replace("-", "/")} – {end.slice(5).replace("-", "/")}
            {weekOffset === 0 && <span className="ml-1 text-orange-500 text-xs">（本週）</span>}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs text-orange-600">回本週</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => load(weekOffset)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="flex gap-3 text-xs text-gray-500">
            <span>派車 <strong className="text-blue-700">{filledCells}</strong>/{totalCells}</span>
            <span>完成 <strong className="text-green-700">{doneCells}</strong></span>
            <span>待派 <strong className="text-orange-600">{totalCells - filledCells}</strong></span>
          </div>
          {/* Import from sheet button */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={() => {
              const w = weekStart(weekOffset);
              setImportWeekStart(w.start);
              setImportWeekEnd(w.end);
              if (!importTitle) setImportTitle(`${w.start.slice(0,7)} 蝦皮北倉派車單`);
              setImportDialogOpen(true);
            }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            從班表匯入
          </Button>
          {/* Shopee-to-dispatch button */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50"
            onClick={() => {
              const w = weekStart(weekOffset);
              setShopeeStart(w.start);
              setShopeeEnd(w.end);
              if (!shopeeTitle) setShopeeTitle(`${w.start.slice(0,7)} 蝦皮派車單`);
              setShopeeDialogOpen(true);
            }}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            從蝦皮訂單建立
          </Button>
          {/* Send button */}
          <Button
            size="sm"
            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            onClick={() => setSendDialogOpen(true)}
          >
            <Send className="h-3.5 w-3.5" />
            發送派車單
          </Button>
        </div>
      </div>

      {/* ── Batch assign bar ── */}
      {batchAssigning
        ? <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-blue-700 text-sm"><RefreshCw className="h-4 w-4 animate-spin" />批次指派中…</div>
        : <BatchAssignBar selectedIds={selectedOrderIds} fleets={fleets} onAssign={handleBatchAssign} onClear={clearSelection} />
      }

      {/* ── Prefix filter + select all ── */}
      {prefixes.length > 0 && (
        <div className="flex gap-1 flex-wrap items-center">
          <button onClick={() => setPrefixFilter("all")}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${prefixFilter === "all" ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:border-gray-500"}`}>
            全部
          </button>
          {prefixes.sort().map(p => (
            <button key={p} onClick={() => setPrefixFilter(p)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${prefixFilter === p ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:border-gray-500"}`}>
              {p}
            </button>
          ))}
          <span className="ml-auto" />
          {filteredRoutes.length > 0 && (
            selectedRouteIds.size === filteredRoutes.length
              ? <button onClick={clearSelection} className="text-xs text-blue-600 hover:underline">取消全選</button>
              : <button onClick={selectAllVisible} className="text-xs text-blue-600 hover:underline">全選 {filteredRoutes.length} 條</button>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
        <span><span className="inline-block w-3 h-3 rounded bg-blue-100 mr-1" />已指派車隊</span>
        <span><span className="inline-block w-3 h-3 rounded bg-green-100 mr-1" />已完成</span>
        <span><span className="inline-block w-3 h-3 rounded border border-blue-400 bg-blue-50 mr-1" />已勾選</span>
        <span className="text-gray-400">勾選路線可批次指派，點格子選車隊，點 <CalendarDays className="inline w-3 h-3" /> 查看班表</span>
      </div>

      {/* ── Grid ── */}
      {loading && !data && <div className="flex justify-center py-12 text-gray-400">載入中…</div>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10 min-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-blue-600"
                      checked={filteredRoutes.length > 0 && selectedRouteIds.size === filteredRoutes.length}
                      onChange={e => e.target.checked ? selectAllVisible() : clearSelection()}
                    />
                    路線
                  </div>
                </th>
                {data.dates.map(d => (
                  <th key={d}
                    className={`border border-gray-200 px-2 py-2 text-center text-xs font-semibold whitespace-nowrap min-w-[80px] ${isToday(d) ? "bg-orange-50 text-orange-700" : "text-gray-600"}`}>
                    <div>{fmtDate(d)}</div>
                    <div className={`text-[10px] font-normal ${isToday(d) ? "text-orange-500" : "text-gray-400"}`}>
                      週{dayOfWeek(d)}{isToday(d) ? " 今" : ""}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.length === 0 && (
                <tr>
                  <td colSpan={data.dates.length + 1} className="py-0">
                    <div className="text-center py-8 px-6">
                      <p className="text-gray-400 text-sm mb-1">
                        {weekOffset === 0 ? "本週" : "該週"}無路線資料
                      </p>
                      <p className="text-gray-300 text-xs mb-4">
                        路線依匯入日期分週顯示，請切換至含有資料的週次
                      </p>
                      {weekOffset === 0 && (
                        <div className="flex justify-center gap-2 flex-wrap">
                          {[-1, -2, -3].map(o => {
                            const w = weekStart(o);
                            return (
                              <button
                                key={o}
                                onClick={() => setWeekOffset(o)}
                                className="text-xs px-3 py-1.5 rounded-full border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors"
                              >
                                {w.start.slice(5).replace("-", "/")} – {w.end.slice(5).replace("-", "/")}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {filteredRoutes.map(route => {
                const isSelected = selectedRouteIds.has(route.route_id);
                const routeOrderIds = Object.values(route.dates).map(e => e.order_id);
                return (
                  <tr key={route.route_id} className={`hover:bg-gray-50/50 ${isSelected ? "bg-blue-50" : ""}`}>
                    <td className={`border border-gray-100 px-2 py-1.5 sticky left-0 z-10 ${isSelected ? "bg-blue-50" : "bg-white"}`}>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-blue-600 shrink-0"
                          checked={isSelected}
                          onChange={() => toggleRouteSelect(route.route_id, routeOrderIds)}
                        />
                        <Badge className={`text-[10px] px-1.5 py-0 ${prefixColor(route.prefix)}`}>{route.prefix ?? "?"}</Badge>
                        <span className="text-xs font-medium text-gray-800 truncate max-w-[60px]" title={route.route_id}>
                          {route.route_id.replace(route.prefix + "-", "")}
                        </span>
                        {route.stations && <span className="text-[10px] text-gray-400">{route.stations}站</span>}
                        {onViewSchedule && (
                          <button
                            onClick={() => onViewSchedule(route.route_id)}
                            className="text-gray-300 hover:text-blue-500 transition-colors shrink-0"
                            title="查看班表"
                          >
                            <CalendarDays className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {data.dates.map(d => (
                      <FleetCell key={d} entry={route.dates[d]} fleets={fleets} onAssign={handleFleetAssign} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Sent orders section ────────────────────────────────────────────── */}
      {(sentOrders.length > 0 || ordersLoading) && (
        <div className="space-y-2 pt-2 border-t mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              本週已發送的派車單
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-gray-400" onClick={loadSentOrders}>
              <RefreshCw className={`h-3 w-3 ${ordersLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="space-y-1.5">
            {sentOrders.map(o => {
              const si = STATUS_INFO[o.status] ?? STATUS_INFO.sent;
              const StatusIcon = si.icon;
              return (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white hover:bg-gray-50 text-sm">
                  <StatusIcon className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate text-xs">{o.title}</p>
                    <p className="text-[11px] text-gray-400">{o.fleet_name} · {o.route_count} 條路線</p>
                  </div>
                  <Badge className={`text-[10px] px-2 py-0 ${si.color}`}>{si.label}</Badge>
                  {o.assigned_count > 0 && (
                    <span className="text-[11px] text-purple-600 font-medium">{o.assigned_count}/{o.route_count} 已排</span>
                  )}
                  <button
                    onClick={() => handleDeleteOrder(o.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors ml-1"
                    title="撤銷"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Import from sheet dialog ──────────────────────────────────────── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              從 Google 班表匯入派車單
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-emerald-50 rounded-lg p-3 text-xs text-emerald-700">
              <p className="font-semibold mb-1 flex items-center gap-1"><Link2 className="h-3 w-3" />支援格式</p>
              <p>• 橫向格式：第一行為日期欄位（如 4/1、4/2），路線號碼在「路線」欄</p>
              <p>• 直向格式：每筆記錄一行，含「路線號碼」和「日期」欄</p>
              <p className="mt-1 text-emerald-600">請確認試算表已設為「知道連結的人可查看」</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Google 試算表連結 *</Label>
              <Input
                value={importSheetUrl}
                onChange={e => setImportSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">派車單名稱 *</Label>
                <Input
                  value={importTitle}
                  onChange={e => setImportTitle(e.target.value)}
                  placeholder="2026-04 蝦皮北倉派車單"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">接收車隊 *</Label>
                <Select value={importFleet} onValueChange={setImportFleet}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="選擇車隊" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleets.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.fleet_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">週期起始日</Label>
                <Input
                  type="date"
                  value={importWeekStart}
                  onChange={e => setImportWeekStart(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">週期結束日</Label>
                <Input
                  type="date"
                  value={importWeekEnd}
                  onChange={e => setImportWeekEnd(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">備注（選填）</Label>
              <Textarea
                value={importNotes}
                onChange={e => setImportNotes(e.target.value)}
                placeholder="特殊交代事項…"
                className="text-sm h-16 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button
              disabled={!importSheetUrl || !importFleet || !importTitle || importing}
              onClick={handleImportSheet}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {importing
                ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />匯入中…</>
                : <><FileSpreadsheet className="h-4 w-4 mr-1" />確認匯入</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── From Shopee orders dialog ─────────────────────────────────────── */}
      <Dialog open={shopeeDialogOpen} onOpenChange={setShopeeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-4 w-4 text-orange-600" />
              從蝦皮訂單建立派車單
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-orange-50 rounded-lg p-3 text-xs text-orange-700">
              <p className="font-semibold mb-1">📦 說明</p>
              <p>系統將自動把「蝦皮電商配送」與「蝦皮電商配送（代收代付）」的</p>
              <p>進行中訂單（含日期區間內）打包成一份派車單，發送給指定車隊。</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">派車單名稱 *</Label>
                <Input
                  value={shopeeTitle}
                  onChange={e => setShopeeTitle(e.target.value)}
                  placeholder="2026-04 蝦皮派車單"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs font-medium">接收車隊 *</Label>
                <Select value={shopeeFleet} onValueChange={setShopeeFleet}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="選擇車隊" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleets.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.fleet_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">訂單起始日 *</Label>
                <Input
                  type="date"
                  value={shopeeStart}
                  onChange={e => setShopeeStart(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">訂單結束日 *</Label>
                <Input
                  type="date"
                  value={shopeeEnd}
                  onChange={e => setShopeeEnd(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">備注（選填）</Label>
              <Textarea
                value={shopeeNotes}
                onChange={e => setShopeeNotes(e.target.value)}
                placeholder="特殊交代事項…"
                className="text-sm h-16 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopeeDialogOpen(false)}>取消</Button>
            <Button
              disabled={!shopeeFleet || !shopeeTitle || !shopeeStart || !shopeeEnd || shopeeCreating}
              onClick={handleFromShopee}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {shopeeCreating
                ? <><RefreshCw className="h-4 w-4 animate-spin mr-1" />建立中…</>
                : <><ShoppingBag className="h-4 w-4 mr-1" />確認建立</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send dispatch order dialog ────────────────────────────────────── */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-blue-600" />
              發送派車單
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">📋 本週派車單摘要</p>
              <p>週期：{start} ～ {end}</p>
              <p>共 {totalCells} 條路線趟次，{filledCells} 條已填司機代號</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">選擇接收車隊 *</Label>
              <Select value={selectedFleet} onValueChange={setSelectedFleet}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="請選擇車隊車主" />
                </SelectTrigger>
                <SelectContent>
                  {fleets.map(f => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.fleet_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">備注（選填）</Label>
              <Textarea
                value={sendNotes}
                onChange={e => setSendNotes(e.target.value)}
                placeholder="特殊交代事項、注意事項…"
                className="text-sm h-20 resize-none"
              />
            </div>

            {selectedFleet && (
              <div className="bg-gray-50 rounded p-2.5 text-xs text-gray-600">
                <p className="font-medium mb-1">確認後會執行：</p>
                <ul className="space-y-0.5">
                  <li>✅ 建立正式派車單文件</li>
                  <li>✅ 車隊車主可在其入口看到此派車單</li>
                  <li>✅ 車隊可指派旗下司機到各路線</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>取消</Button>
            <Button
              disabled={!selectedFleet || sending}
              onClick={handleSend}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sending ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              確認發送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
