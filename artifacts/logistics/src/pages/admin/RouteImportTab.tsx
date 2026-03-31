import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, Search, CheckCircle2, AlertTriangle, Truck,
  MapPin, ArrowRight, RefreshCw, FileText, Package,
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
}

interface PreviewResult {
  ok: boolean;
  routes: ParsedRoute[];
  warnings: string[];
  summary: { routeCount: number; stopCount: number };
}

interface ImportResult {
  ok: boolean;
  inserted: number;
  orders: { orderId: number; routeId: string; stopCount: number }[];
  errors: { routeId: string; error: string }[];
}

export default function RouteImportTab() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());
  const [pickupAddress, setPickupAddress] = useState("（依路線倉庫）");
  const [customerName, setCustomerName] = useState("蝦皮電商配送");
  const [pickupDate, setPickupDate] = useState("");

  // Convert share URL to CSV export URL
  const toCsvUrl = (url: string): string => {
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const gidM = url.match(/gid=(\d+)/);
    if (!m) return url;
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidM ? "&gid=" + gidM[1] : ""}`;
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const csvUrl = toCsvUrl(sheetUrl.trim());
      const r = await fetch(apiUrl("/api/orders/route-import/preview"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth-jwt")}` },
        body: JSON.stringify({ csvUrl }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error ?? "預覽失敗");
      }
      return r.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => {
      setPreview(data);
      setSelectedRoutes(new Set(data.routes.map(r => r.routeId)));
      setImportResult(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("請先預覽");
      const routes = preview.routes.filter(r => selectedRoutes.has(r.routeId));
      const r = await fetch(apiUrl("/api/orders/route-import"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth-jwt")}` },
        body: JSON.stringify({ routes, pickupAddress, customerName, pickupDate: pickupDate || null }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error ?? "匯入失敗");
      }
      return r.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
    },
  });

  const toggleRoute = (routeId: string) => {
    setSelectedRoutes(prev => {
      const s = new Set(prev);
      if (s.has(routeId)) s.delete(routeId);
      else s.add(routeId);
      return s;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    if (selectedRoutes.size === preview.routes.length) setSelectedRoutes(new Set());
    else setSelectedRoutes(new Set(preview.routes.map(r => r.routeId)));
  };

  const selectedCount = selectedRoutes.size;
  const selectedStops = preview?.routes.filter(r => selectedRoutes.has(r.routeId)).reduce((s, r) => s + r.stops.length, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Upload className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">路線派車匯入</h2>
          <p className="text-sm text-muted-foreground">從 Google Sheets 匯入多站配送路線，自動建立多站訂單</p>
        </div>
      </div>

      {/* Step 1: Google Sheets URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
            貼上 Google Sheets 連結
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/xxx/edit#gid=yyy"
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              className="flex-1 text-sm font-mono"
            />
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!sheetUrl.trim() || previewMutation.isPending}
              className="gap-2"
            >
              {previewMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              預覽
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            請確認 Google Sheets 已設定為「知道連結的人可查看」，支援分享連結或 CSV 匯出連結
          </p>
          {previewMutation.isError && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{previewMutation.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview result */}
      {preview && (
        <>
          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <Alert className="border-yellow-200 bg-yellow-50 py-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800 text-sm">
                {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </AlertDescription>
            </Alert>
          )}

          {/* Summary */}
          <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 text-sm">
              <Truck className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">共 {preview.summary.routeCount} 條路線</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-900">合計 {preview.summary.stopCount} 個站點</span>
            </div>
            {selectedCount < preview.routes.length && (
              <Badge variant="outline" className="text-xs">
                已選 {selectedCount} 條路線 / {selectedStops} 站
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">客戶名稱</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">取貨地址（出發倉）</Label>
                  <Input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">配送日期</Label>
                  <Input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} className="text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Select routes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                  選擇要匯入的路線
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
                  {selectedCount === preview.routes.length ? "取消全選" : "全選"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {preview.routes.map(route => (
                <div
                  key={route.routeId}
                  onClick={() => toggleRoute(route.routeId)}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedRoutes.has(route.routeId)
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedRoutes.has(route.routeId) ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}>
                        {selectedRoutes.has(route.routeId) && (
                          <CheckCircle2 className="w-3 h-3 text-white fill-current" />
                        )}
                      </div>
                      <span className="font-mono text-sm font-semibold text-blue-800">{route.routeId}</span>
                      <Badge variant="secondary" className="text-xs">{route.vehicleType}</Badge>
                      {route.dockNo && <Badge variant="outline" className="text-xs">碼頭 {route.dockNo}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {route.timeSlot && route.timeSlot !== "1899/12/30" && (
                        <span>{route.timeSlot}</span>
                      )}
                      {route.driverId && <span>司機 #{route.driverId}</span>}
                      <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">
                        {route.stops.length} 站
                      </Badge>
                    </div>
                  </div>
                  {/* Stops preview */}
                  <div className="flex items-center gap-1 flex-wrap mt-1 ml-6">
                    {route.stops.map((stop, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-0.5">
                          <span className="text-xs text-gray-500 font-medium">{stop.seq}</span>
                          <span className="text-xs">{stop.storeName || stop.address.slice(0, 12)}</span>
                          {stop.isDailyStore && <span className="text-xs text-orange-600 font-medium">日配</span>}
                        </div>
                        {idx < route.stops.length - 1 && <ArrowRight className="w-3 h-3 text-gray-400" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Import button */}
          {!importResult && (
            <div className="flex justify-end">
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedCount === 0 || importMutation.isPending}
                className="gap-2"
                size="lg"
              >
                {importMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                匯入 {selectedCount} 條路線（{selectedStops} 站）
              </Button>
            </div>
          )}
          {importMutation.isError && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{importMutation.error.message}</AlertDescription>
            </Alert>
          )}
        </>
      )}

      {/* Import result */}
      {importResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              匯入完成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-green-800">
              成功建立 <strong>{importResult.inserted}</strong> 張多站訂單
            </p>
            <div className="space-y-1.5">
              {importResult.orders.map(o => (
                <div key={o.orderId} className="flex items-center gap-3 text-sm">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="font-mono text-xs text-gray-600">#{o.orderId}</span>
                  <span className="font-medium">{o.routeId}</span>
                  <Badge variant="secondary" className="text-xs">{o.stopCount} 站</Badge>
                </div>
              ))}
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {importResult.errors.map((e, i) => (
                  <Alert key={i} variant="destructive" className="py-1.5">
                    <AlertDescription className="text-xs">{e.routeId}：{e.error}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => { setPreview(null); setImportResult(null); setSheetUrl(""); }}
            >
              再次匯入
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
