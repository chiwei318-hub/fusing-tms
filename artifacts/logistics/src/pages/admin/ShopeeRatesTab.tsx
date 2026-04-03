import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tag, RefreshCw, Search, Upload, FileSpreadsheet, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, X, Plus, Trash2, Play,
  Clock, Link2, History, Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface RateItem {
  id: number;
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number;
  price_unit: string;
}

interface RateData {
  ok: boolean;
  items: RateItem[];
  summary: { service_type: string; count: string }[];
}

interface ParsedRow {
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number | null;
  price_unit: string;
  notes: string | null;
}

const SERVICE_TYPES = [
  { value: "店配模式",    label: "店配模式",   color: "bg-blue-100 text-blue-800" },
  { value: "NDD快速到貨", label: "NDD快速到貨", color: "bg-purple-100 text-purple-800" },
  { value: "轉運車-趟次", label: "轉運車趟次",  color: "bg-orange-100 text-orange-800" },
  { value: "賣家上收",   label: "賣家上收",    color: "bg-green-100 text-green-800" },
  { value: "轉運車-包時", label: "轉運車包時",  color: "bg-yellow-100 text-yellow-800" },
  { value: "WH NDD",    label: "WH NDD",     color: "bg-red-100 text-red-800" },
];

const VEHICLE_ORDER = ["6.2T", "8.5T", "11T", "17T", "26T", "35T", "46T"];

const VEHICLE_TYPE_RE = /^\d+(\.\d+)?T$/i;

const fmt = (p: number | null) =>
  p ? `NT$${p.toLocaleString()}` : "—";

// ── Excel parser ──────────────────────────────────────────────────────────────
async function parseRateExcel(file: File): Promise<{ rows: ParsedRow[]; warnings: string[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];

  const normText = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "object" && "text" in v) return String(v.text).trim();
    return String(v).trim();
  };
  const normNum = (v: any): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : Math.round(n);
  };

  wb.worksheets.forEach((ws) => {
    const sheetName = ws.name.trim();

    // Collect all non-empty rows as arrays of cell values
    const rawRows: string[][] = [];
    ws.eachRow((row) => {
      const cells = row.values as any[];
      rawRows.push(cells.slice(1).map(normText));
    });

    if (rawRows.length < 2) return;

    // ── Detect format ──────────────────────────────────────────────────────
    // Try flat format first: look for a header row with "route"/"路線" and "vehicle"/"車型"
    const flatHdrIdx = rawRows.findIndex((r) => {
      const lower = r.map((c) => c.toLowerCase());
      return (lower.includes("路線") || lower.includes("route")) &&
             (lower.includes("車型") || lower.includes("vehicle_type") || lower.includes("vehicletype"));
    });

    if (flatHdrIdx >= 0) {
      // ── Flat format ──────────────────────────────────────────────────────
      const hdr = rawRows[flatHdrIdx].map((c) => c.toLowerCase());
      const colServiceType = hdr.findIndex((c) => c.includes("服務") || c.includes("service"));
      const colRoute       = hdr.findIndex((c) => c === "路線" || c === "route");
      const colVehicle     = hdr.findIndex((c) => c.includes("車型") || c.includes("vehicle"));
      const colPrice       = hdr.findIndex((c) => c.includes("單價") || c.includes("price") || c.includes("運費"));
      const colUnit        = hdr.findIndex((c) => c.includes("計價") || c.includes("unit") || c.includes("單位"));
      const colNotes       = hdr.findIndex((c) => c.includes("備") || c.includes("note"));

      let currentServiceType = sheetName;
      for (let i = flatHdrIdx + 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (r.every((c) => !c)) continue;
        const st = colServiceType >= 0 ? (r[colServiceType] || currentServiceType) : currentServiceType;
        if (st && r.every((c, j) => j === 0 || !c)) { currentServiceType = st; continue; }
        const route   = colRoute >= 0 ? r[colRoute] : "";
        const vehicle = colVehicle >= 0 ? r[colVehicle] : "";
        const price   = colPrice >= 0 ? normNum(r[colPrice]) : null;
        const unit    = colUnit >= 0 ? r[colUnit] || "趟" : "趟";
        const notes   = colNotes >= 0 ? r[colNotes] || null : null;
        if (!route || !vehicle) continue;
        rows.push({ service_type: st || currentServiceType, route, vehicle_type: vehicle, unit_price: price, price_unit: unit, notes });
      }
      return;
    }

    // ── Wide / pivot format ───────────────────────────────────────────────
    // Find the header row that contains vehicle type columns
    let hdrRowIdx = -1;
    let vehicleCols: { col: number; type: string }[] = [];

    for (let i = 0; i < Math.min(rawRows.length, 6); i++) {
      const r = rawRows[i];
      const vCols = r
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => VEHICLE_TYPE_RE.test(c));
      if (vCols.length >= 2) {
        hdrRowIdx = i;
        vehicleCols = vCols.map(({ c, idx }) => ({ col: idx, type: c }));
        break;
      }
    }

    if (hdrRowIdx < 0) {
      warnings.push(`工作表「${sheetName}」：找不到車型欄位（6.2T / 8.5T / 11T ...），已略過`);
      return;
    }

    // Determine price_unit from header area
    let price_unit = "趟";
    for (let i = 0; i <= hdrRowIdx; i++) {
      const txt = rawRows[i].join(" ");
      if (txt.includes("小時")) { price_unit = "小時"; break; }
      if (txt.includes("趟"))   { price_unit = "趟";   break; }
    }

    // Route column is the first column (index 0 in rawRows[hdrRowIdx])
    // Service_type comes from the sheet name OR from section header rows
    let currentServiceType = sheetName || "未分類";

    // Check if sheet name maps to a known service type
    const matchedSt = SERVICE_TYPES.find(
      (st) => sheetName.includes(st.value) || st.value.includes(sheetName)
    );
    if (matchedSt) currentServiceType = matchedSt.value;

    for (let i = hdrRowIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (r.every((c) => !c)) continue;

      const firstCell = r[0] || "";
      const hasAnyPrice = vehicleCols.some(({ col }) => normNum(r[col]) !== null);

      // Section header: first cell is non-empty, vehicle cols all empty → it's a service_type label
      if (firstCell && !hasAnyPrice) {
        const matchedInRow = SERVICE_TYPES.find((st) => firstCell.includes(st.value));
        if (matchedInRow) { currentServiceType = matchedInRow.value; continue; }
        // Also accept if it's a short label (< 15 chars) with no price
        if (firstCell.length < 20) { currentServiceType = firstCell; continue; }
      }

      const route = firstCell;
      if (!route) continue;

      for (const { col, type } of vehicleCols) {
        const price = normNum(r[col]);
        if (price === null) continue;
        rows.push({
          service_type: currentServiceType,
          route,
          vehicle_type: type,
          unit_price: price,
          price_unit,
          notes: null,
        });
      }
    }
  });

  return { rows, warnings };
}

// ── Rate table display ────────────────────────────────────────────────────────
function RateTable({ items, search }: { items: RateItem[]; search: string }) {
  const filtered = items.filter((r) => !search || r.route.includes(search));

  const byRoute: Record<string, Record<string, number>> = {};
  const vehicleSet = new Set<string>();
  for (const item of filtered) {
    if (!byRoute[item.route]) byRoute[item.route] = {};
    byRoute[item.route][item.vehicle_type] = item.unit_price;
    vehicleSet.add(item.vehicle_type);
  }

  const vehicles = VEHICLE_ORDER.filter((v) => vehicleSet.has(v));
  const routes = Object.keys(byRoute).sort();

  if (routes.length === 0) {
    return <p className="text-center py-8 text-gray-400 text-sm">無資料</p>;
  }

  const priceUnit = filtered[0]?.price_unit || "趟";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500">
            <th className="text-left p-2 font-medium">起訖地點</th>
            {vehicles.map((v) => (
              <th key={v} className="text-right p-2 font-medium">
                <span className="flex flex-col items-end">
                  <span className="font-semibold text-gray-700">{v}</span>
                  <span className="text-[10px] text-gray-400">/{priceUnit}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route, idx) => (
            <tr key={route} className={`border-b hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
              <td className="p-2 font-medium text-gray-700">{route}</td>
              {vehicles.map((v) => {
                const price = byRoute[route][v];
                return (
                  <td key={v} className="p-2 text-right">
                    {price ? (
                      <span className="font-mono text-blue-700 font-medium">
                        {price.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-xs text-gray-400 mt-2">
        共 {routes.length} 條路線・單位：新台幣（未稅）・{priceUnit}計
        {priceUnit === "趟" && "・爆量支援適用7折"}
      </p>
    </div>
  );
}

// ── Preview table ─────────────────────────────────────────────────────────────
function PreviewTable({ rows }: { rows: ParsedRow[] }) {
  const display = rows.slice(0, 50);
  const byServiceType: Record<string, ParsedRow[]> = {};
  for (const r of display) {
    if (!byServiceType[r.service_type]) byServiceType[r.service_type] = [];
    byServiceType[r.service_type].push(r);
  }

  return (
    <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded text-xs">
      <table className="w-full">
        <thead className="sticky top-0 bg-gray-100">
          <tr>
            <th className="text-left p-2">服務類型</th>
            <th className="text-left p-2">路線</th>
            <th className="text-left p-2">車型</th>
            <th className="text-right p-2">單價</th>
            <th className="text-left p-2">計價</th>
          </tr>
        </thead>
        <tbody>
          {display.map((r, i) => (
            <tr key={i} className={`border-b ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
              <td className="p-2 text-blue-700">{r.service_type}</td>
              <td className="p-2">{r.route}</td>
              <td className="p-2 font-mono">{r.vehicle_type}</td>
              <td className="p-2 text-right font-mono text-green-700">
                {r.unit_price != null ? r.unit_price.toLocaleString() : "—"}
              </td>
              <td className="p-2">{r.price_unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <p className="text-center text-gray-400 py-2">僅顯示前 50 筆，共 {rows.length} 筆</p>
      )}
    </div>
  );
}

// ── Rate Sync Panel ───────────────────────────────────────────────────────────
interface RateSyncConfig {
  id: number;
  name: string;
  sheet_url: string;
  interval_minutes: number;
  import_mode: string;
  effective_month: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_result: { inserted?: number; updated?: number; errors?: number; warnings?: number; error?: string } | null;
}

interface RateSyncLog {
  id: number;
  synced_at: string;
  inserted: number;
  updated: number;
  errors: number;
  warnings: number;
}

const EMPTY_RATE_FORM = {
  name: "",
  sheet_url: "",
  interval_minutes: 60,
  import_mode: "merge",
  effective_month: "",
  is_active: true,
};

function RateSyncPanel({ onSynced }: { onSynced: () => void }) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<RateSyncConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_RATE_FORM });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [logsId, setLogsId] = useState<number | null>(null);
  const [logs, setLogs] = useState<RateSyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/rate-sync"));
      const d = await r.json();
      if (d.ok) setConfigs(d.configs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_RATE_FORM });
    setDialogOpen(true);
  }

  function openEdit(cfg: RateSyncConfig) {
    setEditingId(cfg.id);
    setForm({
      name: cfg.name,
      sheet_url: cfg.sheet_url,
      interval_minutes: cfg.interval_minutes,
      import_mode: cfg.import_mode,
      effective_month: cfg.effective_month ?? "",
      is_active: cfg.is_active,
    });
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const url = editingId ? apiUrl(`/rate-sync/${editingId}`) : apiUrl("/rate-sync");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          effective_month: form.effective_month || null,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "儲存失敗");
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number, name: string) {
    if (!confirm(`確定要刪除「${name}」的費率同步設定？`)) return;
    await fetch(apiUrl(`/rate-sync/${id}`), { method: "DELETE" });
    load();
  }

  async function runNow(cfg: RateSyncConfig) {
    setRunningId(cfg.id);
    try {
      const r = await fetch(apiUrl(`/rate-sync/${cfg.id}/run`), { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        const res = d.result;
        toast({
          title: "費率同步完成",
          description: `新增 ${res.inserted} 筆・更新 ${res.updated} 筆・錯誤 ${res.errors}`,
        });
        load();
        onSynced();
      } else {
        toast({ title: "同步失敗", description: d.error ?? "未知錯誤", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "同步失敗", description: String(e), variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  }

  async function toggleActive(cfg: RateSyncConfig) {
    await fetch(apiUrl(`/rate-sync/${cfg.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !cfg.is_active }),
    });
    load();
  }

  async function loadLogs(id: number) {
    if (logsId === id) { setLogsId(null); return; }
    setLogsId(id);
    setLogsLoading(true);
    try {
      const r = await fetch(apiUrl(`/rate-sync/${id}/logs`));
      const d = await r.json();
      setLogs(d.logs ?? []);
    } finally {
      setLogsLoading(false);
    }
  }

  function fmtTime(iso: string | null) {
    if (!iso) return "從未";
    return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
  }

  return (
    <Card className="border-green-200">
      <CardHeader className="py-3 px-4">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={() => setOpen(p => !p)}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-gray-700">試算表自動同步</span>
            <Badge variant="outline" className="text-[10px] px-1.5 border-green-300 text-green-700">
              {configs.filter(c => c.is_active).length} 個啟用
            </Badge>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={openCreate} className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />新增同步來源
            </Button>
          </div>

          {configs.length === 0 && !loading && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Link2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p>尚未設定費率同步來源</p>
              <p className="text-xs mt-1">點擊「新增同步來源」貼上 Google Sheets 連結</p>
            </div>
          )}

          {configs.map(cfg => {
            const lr = cfg.last_sync_result;
            const hasErr = lr?.error || (lr?.errors && lr.errors > 0);
            const isRunning = runningId === cfg.id;
            return (
              <div key={cfg.id} className={`border rounded-lg p-3 space-y-2 ${cfg.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{cfg.name}</span>
                      <Badge variant={cfg.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {cfg.is_active ? "啟用" : "暫停"}
                      </Badge>
                      {cfg.effective_month && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700">
                          {cfg.effective_month}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        每 {cfg.interval_minutes} 分鐘
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{cfg.sheet_url}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive(cfg)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cfg)}>
                      <Settings className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                      onClick={() => runNow(cfg)} disabled={isRunning}>
                      {isRunning
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <Play className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => del(cfg.id, cfg.name)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] flex-wrap">
                  <span className="text-muted-foreground">上次同步：{fmtTime(cfg.last_sync_at)}</span>
                  {lr && !lr.error && (
                    <>
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />新增 {lr.inserted ?? 0}・更新 {lr.updated ?? 0}
                      </span>
                      {(lr.errors ?? 0) > 0 && (
                        <span className="text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />錯誤 {lr.errors}
                        </span>
                      )}
                    </>
                  )}
                  {lr?.error && (
                    <span className="text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />{lr.error.slice(0, 60)}
                    </span>
                  )}
                </div>

                <button
                  className="text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
                  onClick={() => loadLogs(cfg.id)}
                >
                  <History className="w-3 h-3" />同步記錄
                  {logsId === cfg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {logsId === cfg.id && (
                  <div className="rounded border text-[11px] overflow-hidden">
                    {logsLoading ? (
                      <p className="p-3 text-center text-muted-foreground">載入中…</p>
                    ) : logs.length === 0 ? (
                      <p className="p-3 text-center text-muted-foreground">尚無記錄</p>
                    ) : (
                      <table className="w-full">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium">時間</th>
                            <th className="text-center px-2 py-1.5">新增</th>
                            <th className="text-center px-2 py-1.5">更新</th>
                            <th className="text-center px-2 py-1.5">錯誤</th>
                            <th className="text-center px-2 py-1.5">警告</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map(log => (
                            <tr key={log.id} className="border-t">
                              <td className="px-3 py-1.5 text-muted-foreground">{fmtTime(log.synced_at)}</td>
                              <td className="text-center px-2 py-1.5 text-green-600 font-medium">{log.inserted}</td>
                              <td className="text-center px-2 py-1.5 text-blue-600 font-medium">{log.updated}</td>
                              <td className={`text-center px-2 py-1.5 ${log.errors > 0 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>{log.errors}</td>
                              <td className={`text-center px-2 py-1.5 ${log.warnings > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{log.warnings}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add/Edit Dialog */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "編輯費率同步設定" : "新增費率同步來源"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>名稱</Label>
                  <Input
                    placeholder="例：蝦皮費率（2026年Q2）"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Google Sheets 連結</Label>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={form.sheet_url}
                    onChange={e => setForm(f => ({ ...f, sheet_url: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    含 gid 參數的分頁連結，試算表需設為「知道連結的人可查看」
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>有效月份（選填）</Label>
                    <Input
                      placeholder="例：2026-04"
                      value={form.effective_month}
                      onChange={e => setForm(f => ({ ...f, effective_month: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">如 2026-04，留空表示通用費率</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>同步間隔（分鐘）</Label>
                    <Input
                      type="number" min={5} max={1440}
                      value={form.interval_minutes}
                      onChange={e => setForm(f => ({ ...f, interval_minutes: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>匯入模式</Label>
                  <Select value={form.import_mode} onValueChange={v => setForm(f => ({ ...f, import_mode: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merge">合併（有則更新，無則新增）</SelectItem>
                      <SelectItem value="replace">覆蓋（清除當月費率後重寫）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
                  />
                  <Label>立即啟用自動同步</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                <Button onClick={save} disabled={saving || !form.name || !form.sheet_url}>
                  {saving ? "儲存中…" : "儲存"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShopeeRatesTab() {
  const { toast } = useToast();
  const [data, setData]             = useState<RateData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState("");
  const [activeService, setActiveService] = useState("店配模式");

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [parsing, setParsing]       = useState(false);
  const [importing, setImporting]   = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [importMonth, setImportMonth] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/shopee-rates"));
      const d = await r.json();
      setData(d);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const getItemsForService = (serviceType: string) =>
    (data?.items ?? []).filter((r) => r.service_type === serviceType);

  const getCountForService = (serviceType: string) =>
    data?.summary.find((s) => s.service_type === serviceType)?.count ?? "0";

  // ── Handle file selection ──────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsedRows(null);
    setParseWarnings([]);
    setParsing(true);
    try {
      const { rows, warnings } = await parseRateExcel(file);
      if (rows.length === 0) {
        toast({
          title: "解析失敗",
          description: "未能在檔案中識別費率資料，請確認格式。",
          variant: "destructive",
        });
      } else {
        setParsedRows(rows);
        setParseWarnings(warnings);
        toast({ title: `解析完成`, description: `共識別 ${rows.length} 筆費率資料` });
      }
    } catch (err: any) {
      toast({ title: "解析失敗", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Execute import ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsedRows || parsedRows.length === 0) return;
    setImporting(true);
    try {
      const r = await fetch(apiUrl("/shopee-rates/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, mode: importMode, effective_month: importMonth || null }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({
        title: "匯入成功",
        description: `新增 ${d.inserted} 筆・更新 ${d.updated} 筆`,
      });
      setParsedRows(null);
      setShowImport(false);
      load();
    } catch (err: any) {
      toast({ title: "匯入失敗", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Rate Sheet Sync Panel ─────────────────────────────────────────── */}
      <RateSyncPanel onSynced={load} />

      {/* ── Import Panel ──────────────────────────────────────────────────── */}
      <Card className={showImport ? "border-blue-300 shadow-sm" : ""}>
        <CardHeader className="pb-2 pt-3 px-4">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setShowImport((p) => !p)}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">Excel 報價單匯入</span>
            </div>
            {showImport ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>
        </CardHeader>

        {showImport && (
          <CardContent className="pt-0 space-y-4">
            {/* Format hint */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">支援的 Excel 格式：</p>
              <p>・<b>寬表格式</b>：第一列為車型（6.2T / 8.5T / 11T …），每行為一條路線，工作表名稱作為服務類型</p>
              <p>・<b>平坦格式</b>：欄位標題含「路線」「車型」「單價」，每行為一筆費率</p>
              <p>・支援多個工作表（每個 sheet 對應一個服務類型）</p>
            </div>

            {/* File input + mode + month */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">選擇 Excel 檔案（.xlsx）</label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="h-9 text-sm w-64"
                  onChange={handleFile}
                  disabled={parsing}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">匯入模式</label>
                <Select value={importMode} onValueChange={(v) => setImportMode(v as any)}>
                  <SelectTrigger className="h-9 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">覆蓋全部（清空重匯）</SelectItem>
                    <SelectItem value="merge">合併（保留舊資料）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">有效月份（選填）</label>
                <Input
                  className="h-9 text-sm w-32"
                  placeholder="2026-04"
                  value={importMonth}
                  onChange={e => setImportMonth(e.target.value)}
                />
              </div>
              {parsing && (
                <div className="flex items-center gap-1 text-sm text-blue-600">
                  <RefreshCw className="h-4 w-4 animate-spin" /> 解析中...
                </div>
              )}
            </div>

            {/* Warnings */}
            {parseWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                {parseWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            {parsedRows && parsedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    解析結果：共 <span className="text-blue-600 font-bold">{parsedRows.length}</span> 筆費率
                  </p>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => { setParsedRows(null); setParseWarnings([]); }}
                    className="h-7 text-xs text-gray-400"
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> 清除
                  </Button>
                </div>

                <PreviewTable rows={parsedRows} />

                {/* Service type summary */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    parsedRows.reduce((acc, r) => {
                      acc[r.service_type] = (acc[r.service_type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([st, cnt]) => (
                    <Badge key={st} variant="outline" className="text-xs">
                      {st}: {cnt} 筆
                    </Badge>
                  ))}
                </div>

                {importMode === "replace" && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                    ⚠️ 覆蓋模式：將刪除現有全部 {data?.items.length ?? 0} 筆費率，再匯入 {parsedRows.length} 筆新資料
                  </div>
                )}

                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {importing ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />匯入中...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" />確認匯入 {parsedRows.length} 筆</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Header Stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {SERVICE_TYPES.map((st) => (
          <Card
            key={st.value}
            className={`cursor-pointer transition-all border-2 ${
              activeService === st.value ? "border-blue-400 shadow-md" : "border-transparent"
            }`}
            onClick={() => setActiveService(st.value)}
          >
            <CardContent className="p-3 text-center">
              <Badge className={`${st.color} text-xs mb-1 whitespace-nowrap`}>
                {st.label}
              </Badge>
              <p className="text-lg font-bold text-gray-700">
                {getCountForService(st.value)}
              </p>
              <p className="text-[10px] text-gray-400">費率筆數</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Rate Table ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-500" />
              蝦皮福興高報價單 — {SERVICE_TYPES.find((s) => s.value === activeService)?.label}
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-7 h-8 text-sm w-48"
                  placeholder="搜尋路線..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeService} onValueChange={setActiveService}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-4 bg-gray-100 p-1">
              {SERVICE_TYPES.map((st) => (
                <TabsTrigger
                  key={st.value}
                  value={st.value}
                  className="text-xs px-2 py-1"
                >
                  {st.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {SERVICE_TYPES.map((st) => (
              <TabsContent key={st.value} value={st.value}>
                <RateTable items={getItemsForService(st.value)} search={search} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">計費注意事項</p>
          <ul className="text-xs text-amber-600 space-y-0.5 list-disc list-inside">
            <li>爆量支援（單趟多點作業，如只配送或只收貨）：運費按原定價格的 7 折計算</li>
            <li>NDD 模式：桃園到台中的路線除外，不適用折扣</li>
            <li>轉運車包時：每車次最長 4 小時；超過 30 分鐘以上 1 小時以下按 1 小時計</li>
            <li>以上運費均不包含加值營業稅</li>
            <li>三配時段 17-18；彰化 13-14；21:30 收貨；19:30 前送貨完；~00-01 返倉</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
