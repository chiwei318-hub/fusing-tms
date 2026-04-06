import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Search, MapPin, Truck, ChevronDown, ChevronRight, Route } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}api/fusingao/${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });

interface RouteRow {
  id: number; route_id: string; route_type: string; warehouse: string;
  vehicle_type: string; driver_id: string; departure_time: string; dock_number: string;
  sheet_name: string; import_month: string; stop_count: number;
}
interface StopRow {
  id: number; route_id: string; stop_sequence: number;
  store_name: string; store_address: string; daily_delivery_type: string;
}

export default function FusingaoScheduleTab() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [routeType, setRouteType] = useState("");
  const [search, setSearch] = useState("");
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [addressSearch, setAddressSearch] = useState("");
  const [addresses, setAddresses] = useState<{ store_name: string; store_address: string; daily_delivery_type: string }[]>([]);
  const [activeView, setActiveView] = useState<"routes" | "addresses">("routes");

  const loadRoutes = async () => {
    const params = new URLSearchParams();
    if (selectedMonth) params.set("month", selectedMonth);
    if (routeType) params.set("route_type", routeType);
    const data = await api(`schedule/routes?${params}`).then(r => r.json());
    if (data.ok) { setRoutes(data.routes); setMonths(data.months); }
  };

  useEffect(() => { loadRoutes(); }, [selectedMonth, routeType]); // eslint-disable-line

  const q = search.trim().toLowerCase();
  const filteredRoutes = q
    ? routes.filter(r =>
        r.route_id?.toLowerCase().includes(q) ||
        r.dock_number?.toLowerCase().includes(q) ||
        r.driver_id?.toLowerCase().includes(q) ||
        r.vehicle_type?.toLowerCase().includes(q) ||
        r.route_type?.toLowerCase().includes(q)
      )
    : routes;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}api/fusingao/schedule/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: fd,
    }).then(r => r.json());
    setUploading(false);
    if (res.ok) {
      toast({ title: `✅ 班表匯入成功`, description: `已匯入 ${res.imported} 條路線、${res.totalStops} 個站點（${res.month}）` });
      setSelectedMonth(res.month);
      loadRoutes();
    } else {
      toast({ title: "匯入失敗", description: res.error, variant: "destructive" });
    }
    e.target.value = "";
  };

  const loadStops = async (routeId: number) => {
    if (expandedId === routeId) { setExpandedId(null); return; }
    setExpandedId(routeId);
    setLoadingStops(true);
    const data = await api(`schedule/routes/${routeId}/stops`).then(r => r.json());
    setStops(data.stops ?? []);
    setLoadingStops(false);
  };

  const searchAddresses = async () => {
    const params = new URLSearchParams();
    if (addressSearch) params.set("search", addressSearch);
    const data = await api(`schedule/addresses?${params}`).then(r => r.json());
    if (data.ok) setAddresses(data.addresses);
  };

  useEffect(() => { if (activeView === "addresses") searchAddresses(); }, [activeView]); // eslint-disable-line

  const routeTypeColors: Record<string, string> = {
    "主線": "bg-blue-100 text-blue-700",
    "NDD": "bg-orange-100 text-orange-700",
    "WHNDD": "bg-purple-100 text-purple-700",
    "店配車": "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header with import button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
            <Route className="w-5 h-5 text-orange-500" /> 蝦皮北倉班表 &amp; 地址管理
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">匯入班表 Excel 後可查看各路線上貨（碼頭）和下貨（門市）地址</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          <Button size="sm" variant="outline" onClick={loadRoutes} title="重新整理路線資料">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
            <span className="ml-1">同步</span>
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="bg-orange-500 hover:bg-orange-600 text-white">
            <Upload className="w-4 h-4 mr-1" />
            {uploading ? "匯入中..." : "匯入班表 Excel"}
          </Button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setActiveView("routes")}
          className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 ${activeView === "routes" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
          🗺️ 路線列表
        </button>
        <button onClick={() => setActiveView("addresses")}
          className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 ${activeView === "addresses" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
          📍 地址查詢
        </button>
      </div>

      {activeView === "routes" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="text-xs border rounded px-2 py-1.5 bg-white">
              <option value="">所有月份</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={routeType} onChange={e => setRouteType(e.target.value)}
              className="text-xs border rounded px-2 py-1.5 bg-white">
              <option value="">所有類型</option>
              <option value="NDD">NDD</option>
              <option value="WHNDD">WHNDD</option>
              <option value="主線">主線</option>
              <option value="店配車">店配車</option>
            </select>
            <div className="flex items-center gap-1 flex-1 min-w-[160px] relative">
              <Search className="w-3 h-3 absolute left-2 text-gray-400 pointer-events-none" />
              <Input placeholder="搜尋路線ID/碼頭/司機..." value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
                className="text-xs h-8 pl-6 pr-6" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={() => {}}>
              <Search className="w-3 h-3" />
            </Button>
          </div>

          {/* Route list */}
          {routes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Route className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">尚未匯入班表資料</p>
                <p className="text-xs text-gray-400 mt-1">請上傳蝦皮北倉班表 Excel 檔案</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">
                共 {filteredRoutes.length} 條路線
                {q && filteredRoutes.length !== routes.length && <span className="text-orange-500 ml-1">（已篩選，共 {routes.length} 條）</span>}
              </p>
              {filteredRoutes.length === 0 && q && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  找不到符合「{search}」的路線
                </div>
              )}
              {filteredRoutes.map(route => (
                <div key={route.id} className="border rounded-lg overflow-hidden bg-white">
                  <button
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                    onClick={() => loadStops(route.id)}
                  >
                    {expandedId === route.id ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="font-mono font-bold text-sm text-gray-800 min-w-[120px]">{route.route_id}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${routeTypeColors[route.route_type] ?? "bg-gray-100 text-gray-600"}`}>
                      {route.route_type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{route.warehouse}</Badge>
                    {route.dock_number && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Truck className="w-3 h-3" /> 碼頭 {route.dock_number}
                      </span>
                    )}
                    {route.vehicle_type && (
                      <span className="text-xs text-gray-500">{route.vehicle_type}</span>
                    )}
                    {route.driver_id && (
                      <span className="text-xs text-gray-400">司機 {route.driver_id}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">{route.stop_count} 站</span>
                  </button>

                  {expandedId === route.id && (
                    <div className="border-t bg-gray-50 px-3 py-2">
                      {loadingStops ? (
                        <p className="text-xs text-gray-400 py-2">載入中...</p>
                      ) : stops.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">無站點資料</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b">
                              <th className="text-left py-1 pr-2 w-8">序</th>
                              <th className="text-left py-1 pr-2">門市名稱（下貨）</th>
                              <th className="text-left py-1 pr-2">門市地址</th>
                              <th className="text-left py-1">配送類型</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stops.map(s => (
                              <tr key={s.id} className="border-b last:border-0 hover:bg-white">
                                <td className="py-1 pr-2 text-gray-400 font-mono">{s.stop_sequence}</td>
                                <td className="py-1 pr-2 font-medium text-gray-700">{s.store_name || "—"}</td>
                                <td className="py-1 pr-2 text-gray-500 flex items-start gap-1">
                                  {s.store_address ? <><MapPin className="w-3 h-3 mt-0.5 text-gray-400 shrink-0" />{s.store_address}</> : "—"}
                                </td>
                                <td className="py-1 text-gray-400">{s.daily_delivery_type || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeView === "addresses" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input placeholder="搜尋門市名稱或地址..." value={addressSearch}
              onChange={e => setAddressSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchAddresses()}
              className="text-xs h-8" />
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={searchAddresses}>
              <Search className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-gray-500">共 {addresses.length} 筆地址</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {addresses.map((a, i) => (
              <div key={i} className="border rounded-lg p-2.5 bg-white hover:shadow-sm transition-shadow">
                <p className="font-medium text-sm text-gray-800">{a.store_name}</p>
                <p className="text-xs text-gray-500 flex items-start gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 mt-0.5 text-orange-400 shrink-0" />
                  {a.store_address || "無地址資料"}
                </p>
                {a.daily_delivery_type && (
                  <Badge variant="outline" className="text-[10px] mt-1">{a.daily_delivery_type}</Badge>
                )}
              </div>
            ))}
            {addresses.length === 0 && (
              <div className="col-span-3 text-center py-10 text-gray-400 text-sm">
                尚無地址資料，請先匯入班表 Excel
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
