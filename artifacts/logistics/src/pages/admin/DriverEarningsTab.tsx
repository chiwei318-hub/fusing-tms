import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Users, Truck, DollarSign, RefreshCw, Edit2, Save, X,
  ChevronDown, ChevronRight, Calculator, BadgeCheck, Clock,
  Plus, Trash2, Upload, RotateCcw, Link,
} from "lucide-react";
import { PrintSaveBar } from "@/components/PrintSaveBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface RouteDetail {
  id: number;
  route_id: string;
  prefix: string;
  service_type: string;
  route_od: string;
  rate_per_trip: number;
  vehicle_type: string;
  payment_status: string;
  created_at: string;
}

interface DriverRow {
  shopee_id: string;
  driver_name: string | null;
  vehicle_plate: string | null;
  driver_vehicle_type: string | null;
  route_count: string;
  total_fee: string;
  paid_count: string;
  routes: RouteDetail[];
}

interface PrefixRate {
  id: number;
  prefix: string;
  description: string | null;
  service_type: string | null;
  route_od: string | null;
  vehicle_type: string | null;
  rate_per_trip: number;
  driver_pay_rate: number | null;
  notes: string | null;
  pay_notes: string | null;
  updated_at: string | null;
}

const EMPTY_PREFIX_RATE: Omit<PrefixRate, "id" | "updated_at"> = {
  prefix: "", description: "", service_type: "", route_od: "",
  vehicle_type: "", rate_per_trip: 0, driver_pay_rate: null,
  notes: "", pay_notes: "",
};

interface ShopeeDriver {
  shopee_id: string;
  name: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  fleet_name: string | null;
  is_own_driver: boolean | null;
  notes: string | null;
  route_count: string;
}

const EMPTY_SHOPEE_DRIVER: Omit<ShopeeDriver, "route_count"> = {
  shopee_id: "", name: "", vehicle_plate: "", vehicle_type: "",
  fleet_name: "", is_own_driver: false, notes: "",
};

interface ShopeeRateCard {
  id: number;
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number | null;
  price_unit: string;
  notes: string | null;
}

type TabKey = "earnings" | "prefixRates" | "driverSetup";

export default function DriverEarningsTab() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("earnings");
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [summary, setSummary] = useState<{ total_routes: string; grand_total: string } | null>(null);
  const [prefixRates, setPrefixRates] = useState<PrefixRate[]>([]);
  const [shopeeDrivers, setShopeeDrivers] = useState<ShopeeDriver[]>([]);
  const [shopeeRateCards, setShopeeRateCards] = useState<ShopeeRateCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);

  // Date range
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Editing states
  const [editingPrefix, setEditingPrefix] = useState<string | null>(null);
  const [editPrefixData, setEditPrefixData] = useState<Partial<PrefixRate>>({});
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editDriverData, setEditDriverData] = useState<Partial<ShopeeDriver>>({});

  // PrefixRate dialog (new / edit)
  const [prefixDialog, setPrefixDialog] = useState<{ mode: "new" | "edit"; data: Omit<PrefixRate, "id" | "updated_at"> } | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [deletingPrefix, setDeletingPrefix] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // ShopeeDriver dialog (new / edit)
  const [driverDialog, setDriverDialog] = useState<{ mode: "new" | "edit"; data: Omit<ShopeeDriver, "route_count"> } | null>(null);
  const [savingDriver, setSavingDriver] = useState(false);
  const [deletingDriverId, setDeletingDriverId] = useState<string | null>(null);
  const driverImportRef = useRef<HTMLInputElement>(null);

  // Driver filter state
  const [driverSearchQ, setDriverSearchQ] = useState("");
  const [driverFleetFilter, setDriverFleetFilter] = useState<string>("全部");
  const [driverOwnerFilter, setDriverOwnerFilter] = useState<string>("全部");

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const r = await fetch(apiUrl(`/driver-earnings?${params}`));
      const d = await r.json();
      setDrivers(d.drivers ?? []);
      setSummary(d.summary ?? null);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  const loadPrefixRates = useCallback(async () => {
    const r = await fetch(apiUrl("/driver-earnings/prefix-rates"));
    const d = await r.json();
    setPrefixRates(d.items ?? []);
  }, []);

  const loadShopeeDrivers = useCallback(async () => {
    const r = await fetch(apiUrl("/driver-earnings/shopee-drivers"));
    const d = await r.json();
    setShopeeDrivers(d.items ?? []);
  }, []);

  const loadShopeeRateCards = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/shopee-rates"));
      const d = await r.json();
      setShopeeRateCards(Array.isArray(d) ? d : d.rates ?? d.items ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadEarnings();
    loadPrefixRates();
    loadShopeeDrivers();
    loadShopeeRateCards();
  }, [loadEarnings, loadPrefixRates, loadShopeeDrivers, loadShopeeRateCards]);

  const savePrefixRate = async (prefix: string) => {
    await fetch(apiUrl(`/driver-earnings/prefix-rates/${encodeURIComponent(prefix)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editPrefixData),
    });
    setEditingPrefix(null);
    await loadPrefixRates();
    await loadEarnings();
    toast({ title: `${prefix} 費率已更新` });
  };

  const savePrefixDialog = async () => {
    if (!prefixDialog) return;
    setSavingRate(true);
    try {
      const { mode, data } = prefixDialog;
      if (!data.prefix) return toast({ title: "前綴為必填", variant: "destructive" });
      if (mode === "new") {
        const r = await fetch(apiUrl("/driver-earnings/prefix-rates"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then(x => x.json());
        if (!r.ok) return toast({ title: r.error ?? "新增失敗", variant: "destructive" });
        toast({ title: `${data.prefix} 已新增` });
      } else {
        await fetch(apiUrl(`/driver-earnings/prefix-rates/${encodeURIComponent(data.prefix)}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        toast({ title: `${data.prefix} 已更新` });
      }
      setPrefixDialog(null);
      await loadPrefixRates();
      await loadEarnings();
    } finally { setSavingRate(false); }
  };

  const deletePrefixRate = async (prefix: string) => {
    if (!confirm(`確定要刪除前綴「${prefix}」嗎？`)) return;
    setDeletingPrefix(prefix);
    try {
      await fetch(apiUrl(`/driver-earnings/prefix-rates/${encodeURIComponent(prefix)}`), { method: "DELETE" });
      toast({ title: `${prefix} 已刪除` });
      await loadPrefixRates();
    } finally { setDeletingPrefix(null); }
  };

  const importPrefixRatesExcel = async (file: File) => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) return toast({ title: "找不到工作表", variant: "destructive" });

      // Auto-detect header row
      const colMap: Record<string, number> = {};
      const headerAliases: Record<string, string> = {
        "前綴": "prefix", "prefix": "prefix",
        "說明": "description", "description": "description",
        "服務模式": "service_type", "service_type": "service_type",
        "起訖": "route_od", "起乾": "route_od", "route_od": "route_od",
        "車型": "vehicle_type", "vehicle_type": "vehicle_type",
        "費率": "rate_per_trip", "費率/趟": "rate_per_trip", "rate_per_trip": "rate_per_trip",
        "司機費率": "driver_pay_rate", "driver_pay_rate": "driver_pay_rate",
        "備註": "notes", "notes": "notes",
        "付款備註": "pay_notes", "pay_notes": "pay_notes",
      };

      let headerRow = -1;
      ws.eachRow((row, idx) => {
        if (headerRow >= 0) return;
        const vals = row.values as any[];
        vals.forEach((v, ci) => {
          const key = String(v ?? "").trim();
          if (headerAliases[key]) { colMap[headerAliases[key]] = ci; headerRow = idx; }
        });
      });

      if (headerRow < 0 || !colMap.prefix) {
        return toast({ title: "找不到「前綴」欄位，請確認表頭", variant: "destructive" });
      }

      const rows: any[] = [];
      ws.eachRow((row, idx) => {
        if (idx <= headerRow) return;
        const vals = row.values as any[];
        const prefix = String(vals[colMap.prefix] ?? "").trim();
        if (!prefix) return;
        rows.push({
          prefix,
          description:     colMap.description    ? String(vals[colMap.description] ?? "").trim()    : undefined,
          service_type:    colMap.service_type   ? String(vals[colMap.service_type] ?? "").trim()   : undefined,
          route_od:        colMap.route_od       ? String(vals[colMap.route_od] ?? "").trim()       : undefined,
          vehicle_type:    colMap.vehicle_type   ? String(vals[colMap.vehicle_type] ?? "").trim()   : undefined,
          rate_per_trip:   colMap.rate_per_trip  ? Number(vals[colMap.rate_per_trip] ?? 0)          : 0,
          driver_pay_rate: colMap.driver_pay_rate ? Number(vals[colMap.driver_pay_rate] ?? 0) || null : undefined,
          notes:           colMap.notes          ? String(vals[colMap.notes] ?? "").trim()          : undefined,
          pay_notes:       colMap.pay_notes      ? String(vals[colMap.pay_notes] ?? "").trim()      : undefined,
        });
      });

      if (rows.length === 0) return toast({ title: "沒有讀到任何資料", variant: "destructive" });

      const r = await fetch(apiUrl("/driver-earnings/prefix-rates/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }).then(x => x.json());

      if (r.ok) {
        toast({ title: `匯入成功：${r.inserted} 筆` });
        await loadPrefixRates();
        await loadEarnings();
      } else {
        toast({ title: r.error ?? "匯入失敗", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: `匯入錯誤：${err.message}`, variant: "destructive" });
    }
  };

  const saveShopeeDriver = async (shopee_id: string) => {
    await fetch(apiUrl(`/driver-earnings/shopee-drivers/${encodeURIComponent(shopee_id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDriverData),
    });
    setEditingDriver(null);
    await loadShopeeDrivers();
    await loadEarnings();
    toast({ title: `工號 ${shopee_id} 資料已更新` });
  };

  const saveDriverDialog = async () => {
    if (!driverDialog) return;
    setSavingDriver(true);
    try {
      const { mode, data } = driverDialog;
      if (!data.shopee_id) return toast({ title: "工號為必填", variant: "destructive" });
      if (mode === "new") {
        const r = await fetch(apiUrl("/driver-earnings/shopee-drivers"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then(x => x.json());
        if (!r.ok) return toast({ title: r.error ?? "新增失敗", variant: "destructive" });
        toast({ title: `工號 ${data.shopee_id} 已新增` });
      } else {
        await fetch(apiUrl(`/driver-earnings/shopee-drivers/${encodeURIComponent(data.shopee_id)}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        toast({ title: `工號 ${data.shopee_id} 已更新` });
      }
      setDriverDialog(null);
      await loadShopeeDrivers();
      await loadEarnings();
    } finally { setSavingDriver(false); }
  };

  const deleteDriver = async (shopee_id: string) => {
    if (!confirm(`確定要刪除工號「${shopee_id}」嗎？`)) return;
    setDeletingDriverId(shopee_id);
    try {
      await fetch(apiUrl(`/driver-earnings/shopee-drivers/${encodeURIComponent(shopee_id)}`), { method: "DELETE" });
      toast({ title: `工號 ${shopee_id} 已刪除` });
      await loadShopeeDrivers();
    } finally { setDeletingDriverId(null); }
  };

  const importDriversExcel = async (file: File) => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) return toast({ title: "找不到工作表", variant: "destructive" });

      const colMap: Record<string, number> = {};
      const headerAliases: Record<string, string> = {
        "工號": "shopee_id", "shopee_id": "shopee_id", "司機id": "shopee_id",
        "姓名": "name", "name": "name",
        "車號": "vehicle_plate", "車牌": "vehicle_plate", "vehicle_plate": "vehicle_plate",
        "車型": "vehicle_type", "vehicle_type": "vehicle_type",
        "車隊": "fleet_name", "車隊名稱": "fleet_name", "fleet_name": "fleet_name",
        "自家司機": "is_own_driver", "is_own_driver": "is_own_driver",
        "備註": "notes", "notes": "notes",
      };

      let headerRow = -1;
      ws.eachRow((row, idx) => {
        if (headerRow >= 0) return;
        const vals = row.values as any[];
        vals.forEach((v, ci) => {
          const key = String(v ?? "").trim().toLowerCase();
          const match = Object.entries(headerAliases).find(([k]) => k.toLowerCase() === key);
          if (match) { colMap[match[1]] = ci; headerRow = idx; }
        });
      });

      if (headerRow < 0 || !colMap.shopee_id) {
        return toast({ title: "找不到「工號」欄位，請確認表頭", variant: "destructive" });
      }

      const parseOwn = (v: any): boolean => {
        const s = String(v ?? "").trim().toLowerCase();
        return ["y", "yes", "是", "true", "1", "自家"].includes(s);
      };

      const rows: any[] = [];
      ws.eachRow((row, idx) => {
        if (idx <= headerRow) return;
        const vals = row.values as any[];
        const shopee_id = String(vals[colMap.shopee_id] ?? "").trim();
        if (!shopee_id) return;
        rows.push({
          shopee_id,
          name:          colMap.name          ? String(vals[colMap.name] ?? "").trim()          : undefined,
          vehicle_plate: colMap.vehicle_plate  ? String(vals[colMap.vehicle_plate] ?? "").trim() : undefined,
          vehicle_type:  colMap.vehicle_type   ? String(vals[colMap.vehicle_type] ?? "").trim()  : undefined,
          fleet_name:    colMap.fleet_name     ? String(vals[colMap.fleet_name] ?? "").trim()    : undefined,
          is_own_driver: colMap.is_own_driver  ? parseOwn(vals[colMap.is_own_driver])            : undefined,
          notes:         colMap.notes          ? String(vals[colMap.notes] ?? "").trim()         : undefined,
        });
      });

      if (rows.length === 0) return toast({ title: "沒有讀到任何資料", variant: "destructive" });

      const r = await fetch(apiUrl("/driver-earnings/shopee-drivers/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }).then(x => x.json());

      if (r.ok) {
        toast({ title: `匯入成功：${r.inserted} 筆` });
        await loadShopeeDrivers();
        await loadEarnings();
      } else {
        toast({ title: r.error ?? "匯入失敗", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: `匯入錯誤：${err.message}`, variant: "destructive" });
    }
  };

  const fmtMoney = (v: string | number) =>
    `NT$ ${Number(v).toLocaleString()}`;

  const paymentBadge = (status: string) =>
    status === "paid" ? (
      <Badge className="bg-green-100 text-green-700 text-xs">已付款</Badge>
    ) : (
      <Badge variant="outline" className="text-xs text-gray-400">未付款</Badge>
    );

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 border-b pb-0 flex-1">
        {(["earnings", "prefixRates", "driverSetup"] as TabKey[]).map((t) => {
          const labels: Record<TabKey, string> = {
            earnings: "運費試算",
            prefixRates: "路線費率設定",
            driverSetup: "司機工號設定",
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
        </div>
        <PrintSaveBar title="司機運費試算" />
      </div>

      {/* ── Tab: 運費試算 ────────────────────────────────────────────── */}
      {tab === "earnings" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-xs text-gray-500">司機人數</p>
                  <p className="text-xl font-bold">{drivers.filter((d) => d.shopee_id !== "(未指派)").length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-2">
                <Truck className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-xs text-gray-500">總路線數</p>
                  <p className="text-xl font-bold">{summary?.total_routes ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-xs text-gray-500">總運費</p>
                  <p className="text-xl font-bold text-green-600">
                    {summary ? fmtMoney(summary.grand_total) : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-xs text-gray-500">平均/趟</p>
                  <p className="text-xl font-bold text-purple-600">
                    {summary && Number(summary.total_routes) > 0
                      ? `NT$ ${Math.round(Number(summary.grand_total) / Number(summary.total_routes)).toLocaleString()}`
                      : "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Date filter + refresh */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-sm text-gray-500">日期區間：</span>
            <Input type="date" className="h-8 w-36 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm text-gray-400">至</span>
            <Input type="date" className="h-8 w-36 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button variant="outline" size="sm" onClick={loadEarnings} disabled={loading} className="h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              試算
            </Button>
          </div>

          {/* Per-Driver Cards */}
          <div className="space-y-3">
            {drivers.map((d) => {
              const isExpanded = expandedDriver === d.shopee_id;
              const paidCount = Number(d.paid_count);
              const routeCount = Number(d.route_count);
              return (
                <Card key={d.shopee_id} className="overflow-hidden">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedDriver(isExpanded ? null : d.shopee_id)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">
                            工號 {d.shopee_id}
                          </span>
                          {d.driver_name && (
                            <Badge variant="outline" className="text-xs">{d.driver_name}</Badge>
                          )}
                          {d.vehicle_plate && (
                            <Badge className="bg-slate-100 text-slate-700 text-xs">
                              <Truck className="h-3 w-3 mr-1" />
                              {d.vehicle_plate}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {d.driver_vehicle_type ?? "6.2T"} ・ {routeCount} 趟路線 ・
                          {paidCount > 0 && (
                            <span className="text-green-600 ml-1">{paidCount} 趟已付款</span>
                          )}
                          {routeCount - paidCount > 0 && (
                            <span className="text-orange-500 ml-1">{routeCount - paidCount} 趟未付款</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-blue-700">{fmtMoney(d.total_fee)}</p>
                      <p className="text-xs text-gray-400">試算運費</p>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-gray-50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-gray-100 text-gray-500">
                            <th className="text-left p-2">路線編號</th>
                            <th className="text-left p-2 hidden sm:table-cell">服務模式</th>
                            <th className="text-left p-2 hidden md:table-cell">起訖</th>
                            <th className="text-left p-2 hidden md:table-cell">日期</th>
                            <th className="text-right p-2">費率</th>
                            <th className="text-left p-2">狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(d.routes ?? []).map((r) => (
                            <tr key={r.id} className="border-b hover:bg-white">
                              <td className="p-2 font-mono font-medium">{r.route_id}</td>
                              <td className="p-2 hidden sm:table-cell text-gray-600">{r.service_type ?? "—"}</td>
                              <td className="p-2 hidden md:table-cell text-gray-500">{r.route_od ?? "—"}</td>
                              <td className="p-2 hidden md:table-cell text-gray-400">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString("zh-TW") : "—"}
                              </td>
                              <td className="p-2 text-right font-mono text-blue-700">
                                {r.rate_per_trip ? `NT$${r.rate_per_trip.toLocaleString()}` : "未設定"}
                              </td>
                              <td className="p-2">{paymentBadge(r.payment_status)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50">
                            <td colSpan={4} className="p-2 text-right font-semibold text-gray-600">
                              小計
                            </td>
                            <td className="p-2 text-right font-bold text-blue-700">
                              {fmtMoney(d.total_fee)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}

            {drivers.length === 0 && (
              <p className="text-center py-8 text-gray-400">
                {loading ? "計算中..." : "尚無路線資料"}
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Tab: 路線費率設定 ─────────────────────────────────────────── */}
      {tab === "prefixRates" && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => setPrefixDialog({ mode: "new", data: { ...EMPTY_PREFIX_RATE } })}>
              <Plus className="h-3.5 w-3.5 mr-1" />新增費率
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => importRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1" />匯入 Excel
            </Button>
            <input
              ref={importRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importPrefixRatesExcel(f); e.target.value = ""; }}
            />
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => { loadPrefixRates(); toast({ title: "已同步最新費率" }); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />同步
            </Button>
            <span className="ml-auto text-xs text-gray-400">{prefixRates.length} 筆費率設定</span>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 bg-gray-50">
                      <th className="text-left px-3 py-2">前綴</th>
                      <th className="text-left px-3 py-2">說明</th>
                      <th className="text-left px-3 py-2">服務模式</th>
                      <th className="text-left px-3 py-2">起訖</th>
                      <th className="text-left px-3 py-2">車型</th>
                      <th className="text-right px-3 py-2">費率/趟</th>
                      <th className="text-right px-3 py-2">司機費率</th>
                      <th className="text-left px-3 py-2">備註</th>
                      <th className="px-3 py-2 w-20 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefixRates.map((pr) => (
                      <tr key={pr.prefix} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-bold text-blue-700">{pr.prefix}</td>
                        <td className="px-3 py-2 text-gray-600">{pr.description || "—"}</td>
                        <td className="px-3 py-2">
                          {pr.service_type
                            ? <Badge variant="outline" className="text-[10px] px-1.5">{pr.service_type}</Badge>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{pr.route_od || "—"}</td>
                        <td className="px-3 py-2">
                          {pr.vehicle_type
                            ? <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5 border-0">{pr.vehicle_type}</Badge>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">
                          NT$ {Number(pr.rate_per_trip).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">
                          {pr.driver_pay_rate != null ? `NT$ ${Number(pr.driver_pay_rate).toLocaleString()}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={pr.notes ?? undefined}>
                          {pr.notes || "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                              onClick={() => setPrefixDialog({ mode: "edit", data: {
                                prefix: pr.prefix, description: pr.description ?? "",
                                service_type: pr.service_type ?? "", route_od: pr.route_od ?? "",
                                vehicle_type: pr.vehicle_type ?? "", rate_per_trip: pr.rate_per_trip,
                                driver_pay_rate: pr.driver_pay_rate, notes: pr.notes ?? "", pay_notes: pr.pay_notes ?? "",
                              }})}>
                              <Edit2 className="h-3 w-3 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                              disabled={deletingPrefix === pr.prefix}
                              onClick={() => deletePrefixRate(pr.prefix)}>
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {prefixRates.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                          尚無費率設定，請點「新增費率」或「匯入 Excel」
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Excel format hint */}
          <p className="text-xs text-gray-400">
            💡 Excel 匯入欄位：前綴、說明、服務模式、起訖、車型、費率/趟、司機費率、備註、付款備註（支援中英文表頭，可覆蓋更新）
          </p>
        </div>
      )}

      {/* ── PrefixRate New/Edit Dialog ─── */}
      <Dialog open={!!prefixDialog} onOpenChange={(o) => { if (!o) setPrefixDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {prefixDialog?.mode === "new" ? "新增路線費率" : `編輯費率：${prefixDialog?.data.prefix}`}
            </DialogTitle>
          </DialogHeader>

          {prefixDialog && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {prefixDialog.mode === "new" && (
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">前綴 <span className="text-red-500">*</span></label>
                  <Input className="h-8 text-xs font-mono" placeholder="e.g. KH001"
                    value={prefixDialog.data.prefix}
                    onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, prefix: e.target.value.toUpperCase() } } : p)} />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">說明</label>
                <Input className="h-8 text-xs" placeholder="路線說明"
                  value={prefixDialog.data.description ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, description: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">服務模式</label>
                <Input className="h-8 text-xs" placeholder="e.g. 宅配/集貨"
                  value={prefixDialog.data.service_type ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, service_type: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">起訖</label>
                <Input className="h-8 text-xs" placeholder="e.g. 高雄→台南"
                  value={prefixDialog.data.route_od ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, route_od: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">車型</label>
                <Input className="h-8 text-xs" placeholder="e.g. 1.5T / 6.2T"
                  value={prefixDialog.data.vehicle_type ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, vehicle_type: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">費率/趟（NT$）</label>
                <Input className="h-8 text-xs text-right font-mono" type="number" placeholder="0"
                  value={prefixDialog.data.rate_per_trip}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, rate_per_trip: Number(e.target.value) } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">司機費率（NT$）</label>
                <Input className="h-8 text-xs text-right font-mono" type="number" placeholder="選填"
                  value={prefixDialog.data.driver_pay_rate ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, driver_pay_rate: e.target.value ? Number(e.target.value) : null } } : p)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">備註</label>
                <Input className="h-8 text-xs" placeholder="其他備註說明"
                  value={prefixDialog.data.notes ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, notes: e.target.value } } : p)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">付款備註</label>
                <Input className="h-8 text-xs" placeholder="付款相關備註"
                  value={prefixDialog.data.pay_notes ?? ""}
                  onChange={e => setPrefixDialog(p => p ? { ...p, data: { ...p.data, pay_notes: e.target.value } } : p)} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPrefixDialog(null)}>取消</Button>
            <Button size="sm" onClick={savePrefixDialog} disabled={savingRate}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {prefixDialog?.mode === "new" ? "新增" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tab: 司機工號設定 ─────────────────────────────────────────── */}
      {tab === "driverSetup" && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
              onClick={() => setDriverDialog({ mode: "new", data: { ...EMPTY_SHOPEE_DRIVER } })}>
              <Plus className="h-3.5 w-3.5 mr-1" />新增司機
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => driverImportRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1" />匯入 Excel
            </Button>
            <input
              ref={driverImportRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importDriversExcel(f); e.target.value = ""; }}
            />
            <Button size="sm" variant="outline" className="h-8 text-xs"
              onClick={() => { loadShopeeDrivers(); toast({ title: "已同步最新司機資料" }); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />同步
            </Button>
            <span className="ml-auto text-xs text-gray-400">{shopeeDrivers.length} 名司機</span>
          </div>

          {/* Filter bar */}
          {(() => {
            const fleetNames = Array.from(new Set(
              shopeeDrivers.map(d => d.fleet_name?.trim()).filter(Boolean) as string[]
            )).sort();
            const filteredDrivers = shopeeDrivers.filter(sd => {
              const q = driverSearchQ.toLowerCase();
              const matchQ = !q || (sd.shopee_id?.toLowerCase().includes(q)) || (sd.name?.toLowerCase().includes(q));
              const matchFleet = driverFleetFilter === "全部"
                || (driverFleetFilter === "(未分類)" ? !sd.fleet_name?.trim() : sd.fleet_name?.trim() === driverFleetFilter);
              const matchOwner = driverOwnerFilter === "全部"
                || (driverOwnerFilter === "自有" && sd.is_own_driver)
                || (driverOwnerFilter === "外包" && !sd.is_own_driver);
              return matchQ && matchFleet && matchOwner;
            });

            return (
              <>
                {/* Search + owner filter row */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <input
                      className="w-full border border-gray-200 rounded-lg text-xs px-3 py-1.5 pl-7 outline-none focus:border-blue-400"
                      placeholder="搜尋工號 / 姓名…"
                      value={driverSearchQ}
                      onChange={e => setDriverSearchQ(e.target.value)}
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">🔍</span>
                  </div>
                  <div className="flex gap-1">
                    {(["全部","自有","外包"] as const).map(v => (
                      <button key={v}
                        onClick={() => setDriverOwnerFilter(v)}
                        className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors
                          ${driverOwnerFilter === v
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 ml-auto">
                    顯示 {filteredDrivers.length} / {shopeeDrivers.length} 名
                  </span>
                </div>

                {/* Fleet chips */}
                {fleetNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-gray-400 mr-1">車隊：</span>
                    <button
                      onClick={() => setDriverFleetFilter("全部")}
                      className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors
                        ${driverFleetFilter === "全部"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"}`}>
                      全部車隊 ({shopeeDrivers.length})
                    </button>
                    {fleetNames.map(fn => {
                      const count = shopeeDrivers.filter(d => d.fleet_name?.trim() === fn).length;
                      return (
                        <button key={fn}
                          onClick={() => setDriverFleetFilter(fn)}
                          className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors
                            ${driverFleetFilter === fn
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
                          {fn} ({count})
                        </button>
                      );
                    })}
                    {shopeeDrivers.filter(d => !d.fleet_name?.trim()).length > 0 && (
                      <button
                        onClick={() => setDriverFleetFilter("(未分類)")}
                        className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors
                          ${driverFleetFilter === "(未分類)"
                            ? "bg-gray-500 text-white border-gray-500"
                            : "bg-white text-gray-400 border-gray-200 hover:border-gray-400"}`}>
                        未分類 ({shopeeDrivers.filter(d => !d.fleet_name?.trim()).length})
                      </button>
                    )}
                  </div>
                )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 bg-gray-50">
                      <th className="text-left px-3 py-2">工號</th>
                      <th className="text-left px-3 py-2">姓名</th>
                      <th className="text-left px-3 py-2">車號（車牌）</th>
                      <th className="text-left px-3 py-2">車型</th>
                      <th className="text-left px-3 py-2">所屬車隊</th>
                      <th className="text-center px-3 py-2">身份</th>
                      <th className="text-left px-3 py-2">備註</th>
                      <th className="text-right px-3 py-2">跑單數</th>
                      <th className="px-3 py-2 w-20 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.map((sd) => (
                      <tr key={sd.shopee_id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-bold text-blue-700">{sd.shopee_id}</td>
                        <td className="px-3 py-2 text-gray-700 font-medium">
                          {sd.name || <span className="text-gray-300">未設定</span>}
                        </td>
                        <td className="px-3 py-2">
                          {sd.vehicle_plate
                            ? <Badge className="bg-slate-100 text-slate-700 font-mono text-[10px] border-0">{sd.vehicle_plate}</Badge>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {sd.vehicle_type
                            ? <Badge className="bg-orange-100 text-orange-700 text-[10px] border-0">{sd.vehicle_type}</Badge>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{sd.fleet_name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-center">
                          {sd.is_own_driver
                            ? <Badge className="bg-green-100 text-green-700 text-[10px] border-0">自有</Badge>
                            : <Badge className="bg-orange-100 text-orange-700 text-[10px] border-0">外包</Badge>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate" title={sd.notes ?? undefined}>
                          {sd.notes || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{sd.route_count} 趟</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                              onClick={() => setDriverDialog({ mode: "edit", data: {
                                shopee_id: sd.shopee_id, name: sd.name ?? "",
                                vehicle_plate: sd.vehicle_plate ?? "", vehicle_type: sd.vehicle_type ?? "",
                                fleet_name: sd.fleet_name ?? "", is_own_driver: sd.is_own_driver ?? false,
                                notes: sd.notes ?? "",
                              }})}>
                              <Edit2 className="h-3 w-3 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                              disabled={deletingDriverId === sd.shopee_id}
                              onClick={() => deleteDriver(sd.shopee_id)}>
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                          {shopeeDrivers.length === 0 ? "尚無司機資料，請點「新增司機」或「匯入 Excel」" : "沒有符合篩選條件的司機"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

              <p className="text-xs text-gray-400">
                💡 Excel 匯入欄位：工號、姓名、車號、車型、車隊、自家司機（是/否）、備註（支援中英文表頭，可覆蓋更新）
              </p>
            </>
          );
          })()}
        </div>
      )}

      {/* ── ShopeeDriver New/Edit Dialog ─── */}
      <Dialog open={!!driverDialog} onOpenChange={(o) => { if (!o) setDriverDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {driverDialog?.mode === "new" ? "新增司機" : `編輯司機：${driverDialog?.data.shopee_id}`}
            </DialogTitle>
          </DialogHeader>

          {driverDialog && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {driverDialog.mode === "new" && (
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">工號 <span className="text-red-500">*</span></label>
                  <Input className="h-8 text-xs font-mono" placeholder="蝦皮司機工號"
                    value={driverDialog.data.shopee_id}
                    onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, shopee_id: e.target.value } } : p)} />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">姓名</label>
                <Input className="h-8 text-xs" placeholder="司機姓名"
                  value={driverDialog.data.name ?? ""}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, name: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">車號（車牌）</label>
                <Input className="h-8 text-xs font-mono" placeholder="ABC-1234"
                  value={driverDialog.data.vehicle_plate ?? ""}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, vehicle_plate: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">車型</label>
                <Input className="h-8 text-xs" placeholder="e.g. 6.2T / 1.5T"
                  value={driverDialog.data.vehicle_type ?? ""}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, vehicle_type: e.target.value } } : p)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">所屬車隊</label>
                <Input className="h-8 text-xs" placeholder="車隊名稱"
                  value={driverDialog.data.fleet_name ?? ""}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, fleet_name: e.target.value } } : p)} />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input type="checkbox" id="is_own_driver_chk" className="h-4 w-4 accent-blue-600"
                  checked={!!driverDialog.data.is_own_driver}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, is_own_driver: e.target.checked } } : p)} />
                <label htmlFor="is_own_driver_chk" className="text-xs text-gray-600 cursor-pointer">自家司機</label>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">備註</label>
                <Input className="h-8 text-xs" placeholder="其他備註"
                  value={driverDialog.data.notes ?? ""}
                  onChange={e => setDriverDialog(p => p ? { ...p, data: { ...p.data, notes: e.target.value } } : p)} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDriverDialog(null)}>取消</Button>
            <Button size="sm" onClick={saveDriverDialog} disabled={savingDriver}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {driverDialog?.mode === "new" ? "新增" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
