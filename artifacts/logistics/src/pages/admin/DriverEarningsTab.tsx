import { useState, useEffect, useCallback } from "react";
import {
  Users, Truck, DollarSign, RefreshCw, Edit2, Save, X,
  ChevronDown, ChevronRight, Calculator, BadgeCheck, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  description: string;
  service_type: string;
  route_od: string;
  rate_per_trip: number;
}

interface ShopeeDriver {
  shopee_id: string;
  name: string | null;
  vehicle_plate: string | null;
  vehicle_type: string;
  route_count: string;
}

type TabKey = "earnings" | "prefixRates" | "driverSetup";

export default function DriverEarningsTab() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("earnings");
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [summary, setSummary] = useState<{ total_routes: string; grand_total: string } | null>(null);
  const [prefixRates, setPrefixRates] = useState<PrefixRate[]>([]);
  const [shopeeDrivers, setShopeeDrivers] = useState<ShopeeDriver[]>([]);
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

  useEffect(() => {
    loadEarnings();
    loadPrefixRates();
    loadShopeeDrivers();
  }, [loadEarnings, loadPrefixRates, loadShopeeDrivers]);

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
      <div className="flex gap-1 border-b pb-0">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">
              路線前綴對應服務類型與費率（影響運費試算結果）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 bg-gray-50">
                  <th className="text-left p-2">前綴</th>
                  <th className="text-left p-2">說明</th>
                  <th className="text-left p-2">服務模式</th>
                  <th className="text-left p-2">起訖</th>
                  <th className="text-right p-2">費率/趟</th>
                  <th className="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {prefixRates.map((pr) => (
                  <tr key={pr.prefix} className="border-b hover:bg-gray-50">
                    {editingPrefix === pr.prefix ? (
                      <>
                        <td className="p-2 font-mono font-bold">{pr.prefix}</td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={editPrefixData.description ?? pr.description}
                            onChange={(e) => setEditPrefixData((p) => ({ ...p, description: e.target.value }))}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={editPrefixData.service_type ?? pr.service_type}
                            onChange={(e) => setEditPrefixData((p) => ({ ...p, service_type: e.target.value }))}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={editPrefixData.route_od ?? pr.route_od}
                            onChange={(e) => setEditPrefixData((p) => ({ ...p, route_od: e.target.value }))}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right"
                            value={editPrefixData.rate_per_trip ?? pr.rate_per_trip}
                            onChange={(e) => setEditPrefixData((p) => ({ ...p, rate_per_trip: Number(e.target.value) }))}
                          />
                        </td>
                        <td className="p-2 flex gap-1">
                          <Button size="sm" className="h-6 px-2" onClick={() => savePrefixRate(pr.prefix)}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => setEditingPrefix(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 font-mono font-bold text-blue-700">{pr.prefix}</td>
                        <td className="p-2 text-gray-600 text-xs">{pr.description}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">{pr.service_type}</Badge>
                        </td>
                        <td className="p-2 text-xs text-gray-600">{pr.route_od}</td>
                        <td className="p-2 text-right font-mono font-semibold text-blue-700">
                          NT$ {pr.rate_per_trip.toLocaleString()}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost" size="sm" className="h-6 px-2"
                            onClick={() => {
                              setEditingPrefix(pr.prefix);
                              setEditPrefixData(pr);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: 司機工號設定 ─────────────────────────────────────────── */}
      {tab === "driverSetup" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">
              設定蝦皮司機工號對應的姓名與車號（車牌）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 bg-gray-50">
                  <th className="text-left p-2">工號</th>
                  <th className="text-left p-2">姓名</th>
                  <th className="text-left p-2">車號（車牌）</th>
                  <th className="text-left p-2">車型</th>
                  <th className="text-right p-2">跑單數</th>
                  <th className="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {shopeeDrivers.map((sd) => (
                  <tr key={sd.shopee_id} className="border-b hover:bg-gray-50">
                    {editingDriver === sd.shopee_id ? (
                      <>
                        <td className="p-2 font-mono font-bold text-blue-700">{sd.shopee_id}</td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            placeholder="司機姓名"
                            value={editDriverData.name ?? sd.name ?? ""}
                            onChange={(e) => setEditDriverData((p) => ({ ...p, name: e.target.value }))}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            placeholder="ABC-1234"
                            value={editDriverData.vehicle_plate ?? sd.vehicle_plate ?? ""}
                            onChange={(e) => setEditDriverData((p) => ({ ...p, vehicle_plate: e.target.value }))}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            placeholder="6.2T"
                            value={editDriverData.vehicle_type ?? sd.vehicle_type ?? "6.2T"}
                            onChange={(e) => setEditDriverData((p) => ({ ...p, vehicle_type: e.target.value }))}
                          />
                        </td>
                        <td className="p-2 text-right text-gray-500">{sd.route_count}</td>
                        <td className="p-2 flex gap-1">
                          <Button size="sm" className="h-6 px-2" onClick={() => saveShopeeDriver(sd.shopee_id)}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => setEditingDriver(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 font-mono font-bold text-blue-700">{sd.shopee_id}</td>
                        <td className="p-2 text-gray-700">{sd.name || <span className="text-gray-300">未設定</span>}</td>
                        <td className="p-2">
                          {sd.vehicle_plate ? (
                            <Badge className="bg-slate-100 text-slate-700 text-xs font-mono">
                              {sd.vehicle_plate}
                            </Badge>
                          ) : (
                            <span className="text-gray-300 text-xs">未設定</span>
                          )}
                        </td>
                        <td className="p-2 text-xs text-gray-600">{sd.vehicle_type}</td>
                        <td className="p-2 text-right font-medium">{sd.route_count} 趟</td>
                        <td className="p-2">
                          <Button
                            variant="ghost" size="sm" className="h-6 px-2"
                            onClick={() => {
                              setEditingDriver(sd.shopee_id);
                              setEditDriverData(sd);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3">
              * 工號由系統從路線訂單自動偵測，在此填入姓名與車號後將顯示於試算結果中
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
