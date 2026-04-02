import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  const i = dt.getDay() === 0 ? 6 : dt.getDay() - 1;
  return DAY_ZH[i];
}

function isToday(d: string) {
  return d === new Date().toISOString().slice(0, 10);
}

// ─── Prefix colour map ────────────────────────────────────────────────────────
const PREFIX_COLOR: Record<string, string> = {
  FN: "bg-orange-100 text-orange-700",
  FM: "bg-yellow-100 text-yellow-700",
  WB: "bg-blue-100 text-blue-700",
  WD: "bg-indigo-100 text-indigo-700",
  NB: "bg-green-100 text-green-700",
  A3: "bg-purple-100 text-purple-700",
};
function prefixColor(p: string | null) {
  return PREFIX_COLOR[p ?? ""] ?? "bg-gray-100 text-gray-600";
}

// ─── Inline editable cell ─────────────────────────────────────────────────────
function DriverCell({
  entry,
  onSave,
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

  if (!entry) {
    return (
      <td className="border border-gray-100 px-2 py-1 text-center text-gray-200 text-xs">
        —
      </td>
    );
  }

  const filled = !!entry.dispatch_driver_code;
  const done = entry.done;

  async function handleSave() {
    if (val === (entry!.dispatch_driver_code ?? "")) { setEditing(false); return; }
    setSaving(true);
    await onSave(entry!.order_id, val);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <td className="border border-orange-300 px-1 py-1 bg-orange-50">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="w-20 border rounded px-1 py-0.5 text-xs font-mono text-center"
            value={val}
            onChange={e => setVal(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-orange-600 hover:text-orange-800"
          >
            <Save className="w-3 h-3" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      className={`border border-gray-100 px-2 py-1 text-center cursor-pointer hover:bg-orange-50 transition-colors text-xs font-mono
        ${done ? "bg-green-50 text-green-700" : filled ? "bg-blue-50 text-blue-800 font-semibold" : "text-gray-300"}`}
      onClick={() => !done && setEditing(true)}
      title={done ? "已完成" : "點擊編輯"}
    >
      {entry.dispatch_driver_code || <span className="text-gray-200">+</span>}
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

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    const { start, end } = weekStart(offset);
    try {
      const d = await fetch(apiUrl(`/fusingao/dispatch?startDate=${start}&endDate=${end}`))
        .then(r => r.json());
      if (d.ok) setData(d);
      else toast({ title: "載入失敗", description: d.error, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(weekOffset); }, [weekOffset, load]);

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
              if (entry.order_id === orderId) {
                newDates[date] = { ...entry, dispatch_driver_code: code || null };
              }
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

  const prefixes = data ? [...new Set(data.routes.map(r => r.prefix).filter(Boolean))] as string[] : [];
  const filteredRoutes = data?.routes.filter(r =>
    prefixFilter === "all" || r.prefix === prefixFilter
  ) ?? [];

  // Stats
  const totalCells = filteredRoutes.reduce((acc, r) =>
    acc + Object.keys(r.dates).length, 0);
  const filledCells = filteredRoutes.reduce((acc, r) =>
    acc + Object.values(r.dates).filter(e => e.dispatch_driver_code).length, 0);
  const doneCells = filteredRoutes.reduce((acc, r) =>
    acc + Object.values(r.dates).filter(e => e.done).length, 0);

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
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs text-orange-600">
              回本週
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => load(weekOffset)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 text-xs text-gray-500">
          <span>派車 <strong className="text-blue-700">{filledCells}</strong>/{totalCells}</span>
          <span>完成 <strong className="text-green-700">{doneCells}</strong></span>
          <span>待派 <strong className="text-orange-600">{totalCells - filledCells}</strong></span>
        </div>
      </div>

      {/* ── Prefix filter ── */}
      {prefixes.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setPrefixFilter("all")}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${prefixFilter === "all" ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:border-gray-500"}`}
          >
            全部
          </button>
          {prefixes.sort().map(p => (
            <button
              key={p}
              onClick={() => setPrefixFilter(p)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${prefixFilter === p ? "bg-gray-800 text-white border-gray-800" : "border-gray-300 text-gray-600 hover:border-gray-500"}`}
            >
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
      {loading && !data && (
        <div className="flex justify-center py-12 text-gray-400">載入中…</div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50 z-10 min-w-[130px]">
                  路線
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
                  <td colSpan={data.dates.length + 1} className="text-center py-10 text-gray-400">
                    本週無路線資料
                  </td>
                </tr>
              )}
              {filteredRoutes.map(route => (
                <tr key={route.route_id} className="hover:bg-gray-50/50">
                  <td className="border border-gray-100 px-2 py-1.5 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 ${prefixColor(route.prefix)}`}>
                        {route.prefix ?? "?"}
                      </Badge>
                      <span className="text-xs font-medium text-gray-800 truncate max-w-[80px]" title={route.route_id}>
                        {route.route_id.replace(route.prefix + "-", "")}
                      </span>
                      {route.stations && (
                        <span className="text-[10px] text-gray-400">{route.stations}站</span>
                      )}
                    </div>
                  </td>
                  {data.dates.map(d => (
                    <DriverCell
                      key={d}
                      entry={route.dates[d]}
                      onSave={handleSave}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
