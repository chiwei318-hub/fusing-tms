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
  FileSpreadsheet, Search, CheckCircle2, AlertTriangle,
  RefreshCw, Package, ExternalLink, User, Phone,
  MapPin, Truck, Calendar,
} from "lucide-react";

interface FormRow {
  rowIndex: number;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription: string;
  vehicleType: string;
  pickupDate: string;
  pickupTime: string;
  notes: string;
  raw: Record<string, string>;
}

interface PreviewResult {
  ok: boolean;
  rows: FormRow[];
  columns: string[];
  warnings: string[];
  fetchedUrl?: string;
  summary: { rowCount: number };
}

interface ImportResult {
  ok: boolean;
  inserted: number;
  orders: { orderId: number; rowIndex: number; customerName: string }[];
  errors: { rowIndex: number; customerName: string; error: string }[];
}

function toCsvUrl(url: string): string {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidM = url.match(/gid=(\d+)/);
  if (!m) return url;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidM ? "&gid=" + gidM[1] : ""}`;
}

export default function FormImportTab() {
  const [sheetUrl, setSheetUrl] = useState(() => sessionStorage.getItem("formImport_url") ?? "");
  const updateSheetUrl = (v: string) => {
    setSheetUrl(v);
    sessionStorage.setItem("formImport_url", v);
  };

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [defaultPickupAddress, setDefaultPickupAddress] = useState("");

  const previewMutation = useMutation({
    mutationFn: async () => {
      const csvUrl = toCsvUrl(sheetUrl.trim());
      const r = await fetch(apiUrl("/orders/form-import/preview"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth-jwt")}`,
        },
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
      setSelectedRows(new Set(data.rows.map((r) => r.rowIndex)));
      setImportResult(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("請先預覽");
      const rows = preview.rows.filter((r) => selectedRows.has(r.rowIndex));
      const res = await fetch(apiUrl("/orders/form-import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth-jwt")}`,
        },
        body: JSON.stringify({ rows, defaultPickupAddress }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(e.error ?? "匯入失敗");
      }
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setImportResult(data);
    },
  });

  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx);
      else s.add(idx);
      return s;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    if (selectedRows.size === preview.rows.length)
      setSelectedRows(new Set());
    else
      setSelectedRows(new Set(preview.rows.map((r) => r.rowIndex)));
  };

  const resetPreview = () => {
    setPreview(null);
    setImportResult(null);
  };

  const selectedCount = selectedRows.size;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <FileSpreadsheet className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">客戶表單訂單匯入</h2>
          <p className="text-sm text-muted-foreground">
            從 Google 表單回應試算表匯入，每一列自動建立一張客戶訂單
          </p>
        </div>
      </div>

      {/* Step 1: URL */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">
              1
            </span>
            貼上 Google 表單回應試算表連結
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/xxx/edit#gid=yyy"
              value={sheetUrl}
              onChange={(e) => updateSheetUrl(e.target.value)}
              className="flex-1 text-sm font-mono"
            />
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!sheetUrl.trim() || previewMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {previewMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              預覽
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              取得方式：Google 表單 → 回應 → 試算表圖示 → 開啟試算表 → 從瀏覽器網址列複製連結
            </p>
            <p className="text-green-700 font-medium">
              系統會自動對應欄位：姓名、電話、取貨地址、送貨地址、貨物說明、車型、日期、時間、備註
            </p>
          </div>
          {previewMutation.isError && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="break-all text-xs">
                {previewMutation.error.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview: 0 rows */}
      {preview && !importResult && preview.rows.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-yellow-900">
                  未解析到任何訂單資料
                </p>
                {preview.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-yellow-800">{w}</p>
                ))}
                <div className="space-y-1 text-xs text-yellow-700 mt-2">
                  <p className="font-medium">欄位對應關鍵字（表頭需包含）：</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 ml-2">
                    <span>姓名欄：<code className="bg-yellow-100 px-1 rounded">姓名 / 聯絡人 / 訂購人</code></span>
                    <span>電話欄：<code className="bg-yellow-100 px-1 rounded">電話 / 手機</code></span>
                    <span>取貨欄：<code className="bg-yellow-100 px-1 rounded">取貨地址 / 起點</code></span>
                    <span>送貨欄：<code className="bg-yellow-100 px-1 rounded">送貨地址 / 目的地</code></span>
                  </div>
                </div>
                {preview.fetchedUrl && (
                  <div className="mt-2 p-2 bg-yellow-100 rounded text-xs">
                    <span className="text-yellow-700 font-medium">實際抓取 URL：</span>
                    <span className="font-mono break-all ml-1">{preview.fetchedUrl}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="ml-8">
              <Button variant="outline" size="sm" className="text-xs" onClick={resetPreview}>
                重新輸入連結
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview: rows found */}
      {preview && !importResult && preview.rows.length > 0 && (
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
          <div className="flex items-center gap-4 p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-green-600" />
              <span className="font-medium text-green-900">
                共 {preview.summary.rowCount} 筆訂單
              </span>
            </div>
            {selectedCount < preview.rows.length && (
              <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                已選 {selectedCount} 筆
              </Badge>
            )}
          </div>

          {/* Step 2: Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">
                  2
                </span>
                設定預設值
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-w-md">
                <Label className="text-xs">
                  預設取貨地址
                  <span className="text-muted-foreground ml-1">（表單未填時使用）</span>
                </Label>
                <Input
                  value={defaultPickupAddress}
                  onChange={(e) => setDefaultPickupAddress(e.target.value)}
                  placeholder="例：台北市內湖區某某倉庫"
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Row list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold">
                    3
                  </span>
                  選擇要匯入的訂單
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
                  {selectedCount === preview.rows.length ? "取消全選" : "全選"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {preview.rows.map((row) => (
                <div
                  key={row.rowIndex}
                  onClick={() => toggleRow(row.rowIndex)}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedRows.has(row.rowIndex)
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedRows.has(row.rowIndex)
                          ? "border-green-500 bg-green-500"
                          : "border-gray-300"
                      }`}
                    >
                      {selectedRows.has(row.rowIndex) && (
                        <CheckCircle2 className="w-3 h-3 text-white fill-current" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {row.customerName || <span className="text-gray-400">（未填）</span>}
                        </div>
                        {row.customerPhone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="w-3 h-3" />
                            {row.customerPhone}
                          </div>
                        )}
                        {row.vehicleType && (
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="w-3 h-3 mr-1" />
                            {row.vehicleType}
                          </Badge>
                        )}
                        {row.pickupDate && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {row.pickupDate}
                            {row.pickupTime && ` ${row.pickupTime}`}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs text-gray-600">
                        {row.pickupAddress && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                            <span>取：{row.pickupAddress}</span>
                          </div>
                        )}
                        {row.deliveryAddress && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                            <span>送：{row.deliveryAddress}</span>
                          </div>
                        )}
                        {row.cargoDescription && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Package className="w-3 h-3" />
                            {row.cargoDescription}
                          </div>
                        )}
                        {row.notes && (
                          <div className="text-gray-400 italic truncate ml-4.5">
                            備註：{row.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Import button */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={resetPreview}
            >
              取消預覽
            </Button>
            <div className="flex items-center gap-3">
              {importMutation.isError && (
                <span className="text-xs text-red-600">
                  {importMutation.error.message}
                </span>
              )}
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedCount === 0 || importMutation.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                {importMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                匯入 {selectedCount} 筆訂單
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Import result */}
      {importResult && (
        <Card
          className={
            importResult.inserted > 0
              ? "border-green-200 bg-green-50"
              : "border-yellow-200 bg-yellow-50"
          }
        >
          <CardHeader className="pb-3">
            <CardTitle
              className={`text-sm font-medium flex items-center gap-2 ${
                importResult.inserted > 0 ? "text-green-800" : "text-yellow-800"
              }`}
            >
              <CheckCircle2
                className={`w-5 h-5 ${
                  importResult.inserted > 0 ? "text-green-600" : "text-yellow-600"
                }`}
              />
              匯入完成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importResult.inserted > 0 && (
              <div>
                <p className="text-sm text-green-800 mb-2">
                  成功建立 <strong>{importResult.inserted}</strong> 張客戶訂單
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {importResult.orders.map((o) => (
                    <div key={o.orderId} className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="font-mono text-xs text-gray-500">#{o.orderId}</span>
                      <span className="font-medium">{o.customerName || "（未填）"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700">
                  以下訂單匯入失敗：
                </p>
                {importResult.errors.map((e, i) => (
                  <Alert key={i} variant="destructive" className="py-1.5">
                    <AlertDescription className="text-xs">
                      第 {e.rowIndex + 1} 列（{e.customerName}）：{e.error}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={resetPreview}>
                再次預覽 / 修改
              </Button>
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={() => (window.location.hash = "#orders")}
              >
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
