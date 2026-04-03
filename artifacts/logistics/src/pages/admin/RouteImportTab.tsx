import { useState } from "react";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, Search, CheckCircle2, AlertTriangle, Truck,
  MapPin, ArrowRight, RefreshCw, FileText, Package,
  ExternalLink, CopyX, Link2,
} from "lucide-react";

interface RouteStop {
  seq: number;
  storeName: string;
  address: string;
  isDailyStore?: boolean;
}

interface ParsedRoute {
  routeId: string;
  vehicleType: string;
  driverId: string;
  timeSlot: string;
  dockNo: string;
  stops: RouteStop[];
  _sourceGid?: string;
}

interface PreviewResult {
  ok: boolean;
  routes: ParsedRoute[];
  warnings: string[];
  fetchedUrl?: string;
  summary: { routeCount: number; stopCount: number };
}

interface ImportResult {
  ok: boolean;
  inserted: number;
  orders: { orderId: number; routeId: string; stopCount: number }[];
  errors: { routeId: string; error: string }[];
  duplicates: { routeId: string; existingOrderId: number }[];
}

interface SheetResult {
  gid: string;
  csvUrl: string;
  routes: ParsedRoute[];
  warnings: string[];
  error?: string;
}

function toCsvUrl(url: string): string {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidM = url.match(/gid=(\d+)/);
  if (!m) return url;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidM ? "&gid=" + gidM[1] : ""}`;
}

function extractGid(url: string): string {
  const m = url.match(/gid=(\d+)/);
  return m ? m[1] : url.slice(-6);
}

function parseUrls(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map(u => u.trim())
    .filter(u => u.includes("spreadsheets/d/") || u.includes("docs.google.com"));
}

export default function RouteImportTab() {
  const [urlsText, setUrlsText] = useState(() => sessionStorage.getItem("routeImport_urls") ?? "");
  const updateUrlsText = (v: string) => {
    setUrlsText(v);
    sessionStorage.setItem("routeImport_urls", v);
  };

  const [sheetResults, setSheetResults] = useState<SheetResult[]>([]);
  const [allRoutes, setAllRoutes] = useState<ParsedRoute[]>([]);
  const [allWarnings, setAllWarnings] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function lsGet(k: string, def: string) {
    return sessionStorage.getItem(`routeImport_${k}`) ?? def;
  }
  const [pickupAddress, setPickupAddress] = useState(() => lsGet("pickupAddress", "（依路線倉庫）"));
  const [customerName, setCustomerName] = useState(() => lsGet("customerName", "蝦皮電商配送"));
  const [customerPhone, setCustomerPhone] = useState(() => lsGet("customerPhone", "0800000000"));
  const [cargoDescription, setCargoDescription] = useState(() => lsGet("cargoDescription", "電商門市配送"));
  const [pickupDate, setPickupDate] = useState(() => lsGet("pickupDate", ""));
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Driver ID → name map (resolved from shopee_drivers)
  const [driverMap, setDriverMap] = useState<Record<string, { name: string | null; vehicle_plate: string | null }>>({});

  // Auto-save helpers
  function setField<T>(setter: (v: T) => void, key: string, val: T) {
    setter(val);
    sessionStorage.setItem(`routeImport_${key}`, String(val));
  }

  const hasPreview = sheetResults.length > 0;

  const parsedUrls = parseUrls(urlsText);

  const runPreview = async () => {
    const urls = parsedUrls;
    if (!urls.length) return;
    setIsPreviewing(true);
    setPreviewError(null);
    setSheetResults([]);
    setAllRoutes([]);
    setAllWarnings([]);
    setSelectedRoutes(new Set());
    setImportResult(null);

    const token = localStorage.getItem("auth-jwt");

    const results = await Promise.all(
      urls.map(async (rawUrl): Promise<SheetResult> => {
        const gid = extractGid(rawUrl);
        const csvUrl = toCsvUrl(rawUrl);
        try {
          const r = await fetch(apiUrl("/orders/route-import/preview"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ csvUrl }),
          });
          const data: PreviewResult = await r.json();
          if (!r.ok || !data.ok) throw new Error((data as any).error ?? r.statusText);
          const routes = data.routes.map(rt => ({ ...rt, _sourceGid: gid }));
          return { gid, csvUrl, routes, warnings: data.warnings };
        } catch (e: any) {
          return { gid, csvUrl, routes: [], warnings: [], error: e.message ?? "未知錯誤" };
        }
      })
    );

    setSheetResults(results);

    // Deduplicate routes by routeId across sheets (first occurrence wins)
    const seen = new Set<string>();
    const merged: ParsedRoute[] = [];
    const warnings: string[] = [];
    for (const sr of results) {
      for (const rt of sr.routes) {
        if (seen.has(rt.routeId)) {
          warnings.push(`路線 ${rt.routeId} 在多個分頁中出現，已略過重複（僅保留第一筆）`);
        } else {
          seen.add(rt.routeId);
          merged.push(rt);
        }
      }
      warnings.push(...sr.warnings);
    }

    setAllRoutes(merged);
    setAllWarnings(warnings);
    setSelectedRoutes(new Set(merged.map(r => r.routeId)));
    setIsPreviewing(false);

    // Resolve driver IDs → names from shopee_drivers
    const driverIds = [...new Set(merged.map(r => r.driverId).filter(Boolean))];
    if (driverIds.length > 0) {
      try {
        const resp = await fetch(apiUrl(`/shopee-drivers/lookup?ids=${driverIds.join(",")}`));
        const data = await resp.json();
        if (data.ok) {
          const m: Record<string, { name: string | null; vehicle_plate: string | null }> = {};
          for (const [id, info] of Object.entries(data.map as Record<string, { name: string; vehicle_plate: string }>)) {
            m[id] = { name: info.name || null, vehicle_plate: info.vehicle_plate || null };
          }
          setDriverMap(m);
        }
      } catch { /* ignore */ }
    }
  };

  const runImport = async () => {
    const routes = allRoutes.filter(r => selectedRoutes.has(r.routeId));
    if (!routes.length) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const r = await fetch(apiUrl("/orders/route-import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth-jwt")}`,
        },
        body: JSON.stringify({
          routes,
          pickupAddress,
          customerName,
          customerPhone,
          cargoDescription,
          pickupDate: pickupDate || null,
        }),
      });
      const data: ImportResult = await r.json();
      if (!r.ok) throw new Error((data as any).error ?? r.statusText);
      setImportResult(data);
    } catch (e: any) {
      setImportError(e.message ?? "匯入失敗");
    }
    setIsImporting(false);
  };

  const toggleRoute = (routeId: string) => {
    setSelectedRoutes(prev => {
      const s = new Set(prev);
      if (s.has(routeId)) s.delete(routeId); else s.add(routeId);
      return s;
    });
  };

  const toggleAll = () => {
    if (selectedRoutes.size === allRoutes.length)
      setSelectedRoutes(new Set());
    else
      setSelectedRoutes(new Set(allRoutes.map(r => r.routeId)));
  };

  const resetPreview = () => {
    setSheetResults([]);
    setAllRoutes([]);
    setAllWarnings([]);
    setSelectedRoutes(new Set());
    setImportResult(null);
    setPreviewError(null);
    setImportError(null);
  };

  const selectedCount = selectedRoutes.size;
  const selectedStops = allRoutes
    .filter(r => selectedRoutes.has(r.routeId))
    .reduce((s, r) => s + r.stops.length, 0);
  const totalRoutes = allRoutes.length;
  const totalStops = allRoutes.reduce((s, r) => s + r.stops.length, 0);

  // Group routes by source sheet for display
  const routesBySheet = sheetResults.map(sr => ({
    ...sr,
    selected: sr.routes.filter(r => selectedRoutes.has(r.routeId)).length,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Upload className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">路線派車匯入</h2>
          <p className="text-sm text-muted-foreground">
            從 Google Sheets 匯入多站配送路線，支援同時貼上多個分頁網址
          </p>
        </div>
      </div>

      {/* Step 1: URL input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
            貼上 Google Sheets 分頁網址
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={"貼上一或多個分頁網址，每行一個：\nhttps://docs.google.com/spreadsheets/d/xxx/edit?gid=111#gid=111\nhttps://docs.google.com/spreadsheets/d/xxx/edit?gid=222#gid=222\nhttps://docs.google.com/spreadsheets/d/xxx/edit?gid=333#gid=333"}
            value={urlsText}
            onChange={e => updateUrlsText(e.target.value)}
            className="text-xs font-mono min-h-[100px] resize-y"
            disabled={isPreviewing}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {parsedUrls.length > 0 && (
                <span className="flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  偵測到 <strong>{parsedUrls.length}</strong> 個分頁網址
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {hasPreview && !importResult && (
                <Button variant="outline" size="sm" onClick={resetPreview} className="text-xs">
                  清除預覽
                </Button>
              )}
              <Button
                onClick={runPreview}
                disabled={parsedUrls.length === 0 || isPreviewing}
                className="gap-2"
              >
                {isPreviewing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isPreviewing
                  ? `讀取中…`
                  : `預覽${parsedUrls.length > 1 ? ` ${parsedUrls.length} 個分頁` : ""}`}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            請確認試算表已設為「知道連結的人可查看」，從瀏覽器網址列直接複製即可
          </p>
          {previewError && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="text-xs">{previewError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sheet-by-sheet status */}
      {sheetResults.length > 0 && !importResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {routesBySheet.map(sr => (
            <div
              key={sr.gid}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                sr.error
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-green-200 bg-green-50 text-green-800"
              }`}
            >
              {sr.error ? (
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <span className="font-mono font-semibold">gid={sr.gid}</span>
                {sr.error ? (
                  <span className="ml-1 text-red-600">— {sr.error}</span>
                ) : (
                  <span className="ml-1 text-green-700">
                    {sr.routes.length} 條路線，{sr.routes.reduce((s, r) => s + r.stops.length, 0)} 站
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 0 routes */}
      {hasPreview && !importResult && allRoutes.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-900">所有分頁均未解析到路線資料</p>
                {allWarnings.map((w, i) => (
                  <p key={i} className="text-sm text-yellow-800">{w}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview: routes found */}
      {hasPreview && !importResult && allRoutes.length > 0 && (
        <>
          {/* Warnings */}
          {allWarnings.length > 0 && (
            <Alert className="border-yellow-200 bg-yellow-50 py-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 text-xs space-y-0.5">
                {allWarnings.map((w, i) => <div key={i}>{w}</div>)}
              </AlertDescription>
            </Alert>
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">共 {totalRoutes} 條路線</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">合計 {totalStops} 個站點</span>
            </div>
            {sheetResults.length > 1 && (
              <Badge variant="outline" className="text-xs">
                {sheetResults.filter(s => !s.error).length} 個分頁
              </Badge>
            )}
            {selectedCount < totalRoutes && (
              <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                已選 {selectedCount} 條 / {selectedStops} 站
              </Badge>
            )}
          </div>

          {/* Step 2: Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                設定匯入參數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">客戶名稱</Label>
                  <Input value={customerName} onChange={e => setField(setCustomerName, "customerName", e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">客戶電話</Label>
                  <Input value={customerPhone} onChange={e => setField(setCustomerPhone, "customerPhone", e.target.value)} className="text-sm" placeholder="0800000000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">貨物說明</Label>
                  <Input value={cargoDescription} onChange={e => setField(setCargoDescription, "cargoDescription", e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">取貨地址（出發倉）</Label>
                  <Input value={pickupAddress} onChange={e => setField(setPickupAddress, "pickupAddress", e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">配送日期</Label>
                  <Input type="date" value={pickupDate} onChange={e => setField(setPickupDate, "pickupDate", e.target.value)} className="text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Route list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                  選擇要匯入的路線
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
                  {selectedCount === totalRoutes ? "取消全選" : "全選"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {/* Group by sheet if multiple sheets */}
              {sheetResults.length > 1
                ? sheetResults.filter(sr => sr.routes.length > 0).map(sr => (
                    <div key={sr.gid}>
                      <div className="flex items-center gap-2 py-1 mb-1">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                          gid={sr.gid} · {sr.routes.length} 條路線
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      {sr.routes.map(route => (
                        <RouteCard
                          key={route.routeId}
                          route={route}
                          selected={selectedRoutes.has(route.routeId)}
                          onToggle={() => toggleRoute(route.routeId)}
                          driverMap={driverMap}
                        />
                      ))}
                    </div>
                  ))
                : allRoutes.map(route => (
                    <RouteCard
                      key={route.routeId}
                      route={route}
                      selected={selectedRoutes.has(route.routeId)}
                      onToggle={() => toggleRoute(route.routeId)}
                      driverMap={driverMap}
                    />
                  ))
              }
            </CardContent>
          </Card>

          {/* Import button row */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={resetPreview}>
              取消預覽
            </Button>
            <div className="flex items-center gap-3">
              {importError && <span className="text-xs text-red-600">{importError}</span>}
              <Button
                onClick={runImport}
                disabled={selectedCount === 0 || isImporting}
                className="gap-2"
                size="lg"
              >
                {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                匯入 {selectedCount} 條路線（{selectedStops} 站）
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Import result */}
      {importResult && (
        <Card className={importResult.inserted > 0 ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${importResult.inserted > 0 ? "text-green-800" : "text-yellow-800"}`}>
              <CheckCircle2 className={`w-5 h-5 ${importResult.inserted > 0 ? "text-green-600" : "text-yellow-600"}`} />
              匯入完成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importResult.inserted > 0 && (
              <div>
                <p className="text-sm text-green-800 mb-2">
                  成功建立 <strong>{importResult.inserted}</strong> 張多站訂單
                </p>
                <div className="space-y-1.5">
                  {importResult.orders.map(o => (
                    <div key={o.orderId} className="flex items-center gap-3 text-sm">
                      <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="font-mono text-xs text-gray-500">#{o.orderId}</span>
                      <span className="font-medium">{o.routeId}</span>
                      <Badge variant="secondary" className="text-xs">{o.stopCount} 站</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {importResult.duplicates.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm text-yellow-800 font-medium flex items-center gap-1.5">
                  <CopyX className="w-4 h-4" />
                  {importResult.duplicates.length} 條路線已略過（重複匯入）
                </p>
                {importResult.duplicates.map(d => (
                  <div key={d.routeId} className="flex items-center gap-2 text-xs text-yellow-700">
                    <span className="font-mono">{d.routeId}</span>
                    <span className="text-gray-500">→ 已有訂單 #{d.existingOrderId}</span>
                  </div>
                ))}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700">以下路線匯入失敗：</p>
                {importResult.errors.map((e, i) => (
                  <Alert key={i} variant="destructive" className="py-1.5">
                    <AlertDescription className="text-xs">{e.routeId}：{e.error}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={resetPreview}>再次預覽 / 修改</Button>
              <Button variant="default" size="sm" className="gap-1.5" onClick={() => (window.location.hash = "#orders")}>
                <ExternalLink className="w-3.5 h-3.5" />
                查看訂單列表
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RouteCard({ route, selected, onToggle, driverMap }: {
  route: ParsedRoute;
  selected: boolean;
  onToggle: () => void;
  driverMap?: Record<string, { name: string | null; vehicle_plate: string | null }>;
}) {
  const driverInfo = route.driverId && driverMap ? driverMap[route.driverId] : null;
  return (
    <div
      onClick={onToggle}
      className={`border rounded-lg p-3 cursor-pointer transition-colors mb-2 ${
        selected ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
            selected ? "border-blue-500 bg-blue-500" : "border-gray-300"
          }`}>
            {selected && <CheckCircle2 className="w-3 h-3 text-white fill-current" />}
          </div>
          <span className="font-mono text-sm font-semibold text-blue-800">{route.routeId}</span>
          {route.vehicleType && <Badge variant="secondary" className="text-xs">{route.vehicleType}</Badge>}
          {route.dockNo && <Badge variant="outline" className="text-xs">碼頭 {route.dockNo}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {route.timeSlot && !route.timeSlot.startsWith("1899") && <span>{route.timeSlot}</span>}
          {route.driverId && (
            <span className="flex items-center gap-1">
              <span className="text-gray-400">司機</span>
              <span className="font-mono text-blue-700">#{route.driverId}</span>
              {driverInfo?.name && (
                <span className="text-green-700 font-medium">{driverInfo.name}</span>
              )}
              {driverInfo?.vehicle_plate && (
                <span className="font-mono text-xs bg-gray-100 px-1 rounded">{driverInfo.vehicle_plate}</span>
              )}
            </span>
          )}
          <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">{route.stops.length} 站</Badge>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap mt-1 ml-6">
        {route.stops.map((stop, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5">
              <span className="text-xs text-gray-500 font-medium">{stop.seq}</span>
              <span className="text-xs">{stop.storeName || stop.address.slice(0, 12)}</span>
            </div>
            {idx < route.stops.length - 1 && <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
