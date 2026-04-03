import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Save, RefreshCw,
  Send, CheckCircle, Clock, AlertCircle, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// ─── Inline editable cell ─────────────────────────────────────────────────────
function DriverCell({
  entry, onSave,
}: {
  entry: DateEntry | undefined;
  onSave: (orderId: number, code: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(entry?.dispatch_driver_code ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVal(entry?.dispatch_driver_code ?? "");
  }, [entry?.dispatch_driver_code]);

  if (!entry) return <td className="border border-gray-100 px-2 py-2 bg-gray-50/30" />;

  const filled = !!entry.dispatch_driver_code;
  const done   = entry.done;

  async function commit() {
    setEditing(false);
    if (val === (entry!.dispatch_driver_code ?? "")) return;
    setSaving(true);
    await onSave(entry!.order_id, val).finally(() => setSaving(false));
  }

  if (editing) {
    return (
      <td className="border border-blue-300 p-0 bg-blue-50">
        <div className="flex items-center">
          <input
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full px-2 py-1.5 text-xs bg-transparent outline-none font-mono"
            placeholder="代號"
          />
          <button onClick={commit} disabled={saving} className="pr-1.5 text-blue-600">
            <Save className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      onClick={() => setEditing(true)}
      className={`border border-gray-100 px-2 py-1.5 text-center text-xs cursor-pointer hover:bg-blue-50 transition-colors
        ${done ? "bg-green-50" : filled ? "bg-blue-50" : ""}`}
    >
      {saving ? (
        <RefreshCw className="h-3 w-3 animate-spin text-gray-400 mx-auto" />
      ) : (
        <span className={`font-mono ${done ? "text-green-700" : filled ? "text-blue-700" : "text-gray-200"}`}>
          {entry.dispatch_driver_code || <span className="text-gray-200">+</span>}
        </span>
      )}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DispatchTab() {
  const { toast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<DispatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefixFilter, setPrefixFilter] = useState<string>("all");

  // ── Send dispatch order state ─────────────────────────────────────────────
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedFleet, setSelectedFleet] = useState<string>("");
  const [sendNotes, setSendNotes] = useState("");
  const [sending, setSending] = useState(false);

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

      {/* ── Prefix filter ── */}
      {prefixes.length > 0 && (
        <div className="flex gap-1 flex-wrap">
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
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span><span className="inline-block w-3 h-3 rounded bg-blue-100 mr-1" />已填司機代號</span>
        <span><span className="inline-block w-3 h-3 rounded bg-green-100 mr-1" />已完成</span>
        <span className="text-gray-400">點擊空白格填入代號，Enter 儲存</span>
      </div>

      {/* ── Grid ── */}
      {loading && !data && <div className="flex justify-center py-12 text-gray-400">載入中…</div>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10 min-w-[130px]">路線</th>
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
                  <td colSpan={data.dates.length + 1} className="text-center py-10 text-gray-400">本週無路線資料</td>
                </tr>
              )}
              {filteredRoutes.map(route => (
                <tr key={route.route_id} className="hover:bg-gray-50/50">
                  <td className="border border-gray-100 px-2 py-1.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 ${prefixColor(route.prefix)}`}>{route.prefix ?? "?"}</Badge>
                      <span className="text-xs font-medium text-gray-800 truncate max-w-[80px]" title={route.route_id}>
                        {route.route_id.replace(route.prefix + "-", "")}
                      </span>
                      {route.stations && <span className="text-[10px] text-gray-400">{route.stations}站</span>}
                    </div>
                  </td>
                  {data.dates.map(d => <DriverCell key={d} entry={route.dates[d]} onSave={handleSave} />)}
                </tr>
              ))}
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
