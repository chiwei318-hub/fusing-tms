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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet, Search, CheckCircle2, AlertTriangle,
  RefreshCw, Package, ExternalLink, User, Phone,
  MapPin, Truck, Calendar, Settings2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
type FieldKey =
  | "customerName" | "customerPhone"
  | "pickupAddress" | "deliveryAddress"
  | "cargoDescription" | "vehicleType"
  | "pickupDate" | "pickupTime" | "notes";

type FieldMap = Partial<Record<FieldKey, number>>;

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
  autoMap: FieldMap;
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

// ── Field metadata ─────────────────────────────────────────────────────────
const FIELD_META: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "customerName",     label: "客戶姓名",  required: true  },
  { key: "customerPhone",    label: "聯絡電話",  required: true  },
  { key: "pickupAddress",    label: "取貨地址",  required: true  },
  { key: "deliveryAddress",  label: "送貨地址",  required: true  },
  { key: "cargoDescription", label: "貨物說明",  required: false },
  { key: "vehicleType",      label: "車型",      required: false },
  { key: "pickupDate",       label: "配送日期",  required: false },
  { key: "pickupTime",       label: "配送時間",  required: false },
  { key: "notes",            label: "備註",      required: false },
];

// ── URL helper ─────────────────────────────────────────────────────────────
function toCsvUrl(url: string): string {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidM = url.match(/gid=(\d+)/);
  if (!m) return url;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gidM ? "&gid=" + gidM[1] : ""}`;
}

// ── Component ─────────────────────────────────────────────────────────────
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
  const [showMapping, setShowMapping] = useState(false);
  const [manualMap, setManualMap] = useState<FieldMap>({});

  // ── Preview mutation ───────────────────────────────────────────────────
  const previewMutation = useMutation({
    mutationFn: async (fieldMap?: FieldMap) => {
      const csvUrl = toCsvUrl(sheetUrl.trim());
      const r = await fetch(apiUrl("/orders/form-import/preview"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth-jwt")}`,
        },
        body: JSON.stringify({ csvUrl, fieldMap }),
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

      // Initialise manual map from auto-detected values
      const initMap: FieldMap = {};
      for (const k of Object.keys(data.autoMap) as FieldKey[]) {
        initMap[k] = data.autoMap[k];
      }
      setManualMap(initMap);

      // Auto-show mapping panel when columns found but rows couldn't be parsed
      if (data.rows.length === 0 && data.columns.length > 0) {
        setShowMapping(true);
      }
    },
  });

  // ── Import mutation ────────────────────────────────────────────────────
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
    onSuccess: (data) => setImportResult(data),
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    if (selectedRows.size === preview.rows.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(preview.rows.map((r) => r.rowIndex)));
  };

  const resetPreview = () => {
    setPreview(null);
    setImportResult(null);
    setShowMapping(false);
  };

  const applyManualMap = () => {
    // Remove undefined/-1 entries
    const clean: FieldMap = {};
    for (const [k, v] of Object.entries(manualMap)) {
      if (v !== undefined && v >= 0) clean[k as FieldKey] = v;
    }
    previewMutation.mutate(clean);
  };

  const selectedCount = selectedRows.size;
  const needsMapping = preview && preview.rows.length === 0 && preview.columns.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────
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
            <StepBadge n={1} />
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
              onClick={() => previewMutation.mutate(undefined)}
              disabled={!sheetUrl.trim() || previewMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700 shrink-0"
            >
              {previewMutation.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />}
              預覽
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>取得方式：Google 表單 → 回應 → 試算表圖示 → 開啟試算表 → 從瀏覽器網址列複製連結</p>
            <p className="text-amber-700 font-medium">
              ⚠ 試算表必須設為「知道連結的人可查看」才能匯入
            </p>
            <p className="text-green-700">
              ✓ 取/送地址可填門市名稱、倉庫名稱等地點名稱，不限完整地址
            </p>
          </div>
          {previewMutation.isError && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription className="break-all text-xs">{previewMutation.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── Columns panel: always show after first fetch ── */}
      {preview && !importResult && preview.columns.length > 0 && (
        <Card className={needsMapping ? "border-amber-200" : "border-gray-100"}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-gray-500" />
                偵測到的欄位
                <Badge variant="outline" className="text-xs">共 {preview.columns.length} 欄</Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => setShowMapping((v) => !v)}
              >
                {showMapping ? "收起" : "手動設定欄位對應"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Column pills */}
            <div className="flex flex-wrap gap-1.5">
              {preview.columns.map((col, idx) => {
                const matched = Object.values(preview.autoMap ?? {}).includes(idx);
                const manualMatched = Object.values(manualMap).includes(idx);
                return (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-xs border font-mono ${
                      matched || manualMatched
                        ? "bg-green-50 border-green-300 text-green-800"
                        : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}
                    title={`欄 ${idx}`}
                  >
                    {col || `(欄${idx})`}
                  </span>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300 mr-1 align-middle" />
              綠色 = 已自動對應 ／ 灰色 = 未對應（可手動設定）
            </p>

            {/* Manual mapping panel */}
            {showMapping && (
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-medium text-gray-700">
                  手動設定欄位對應（選擇「不使用」表示忽略該欄位）
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {FIELD_META.map(({ key, label, required }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-gray-600">
                        {label}
                        {required && <span className="text-red-500 ml-0.5">*</span>}
                      </Label>
                      <Select
                        value={String(manualMap[key] ?? -1)}
                        onValueChange={(v) =>
                          setManualMap((m) => ({ ...m, [key]: Number(v) }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="不使用" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1" className="text-xs text-gray-400">
                            — 不使用 —
                          </SelectItem>
                          {preview.columns.map((col, idx) => (
                            <SelectItem key={idx} value={String(idx)} className="text-xs font-mono">
                              欄{idx}：{col || "(空)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={applyManualMap}
                  disabled={previewMutation.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700 h-8 text-xs"
                >
                  {previewMutation.isPending
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                  套用對應並重新預覽
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 0 rows after columns detected ── */}
      {preview && !importResult && preview.rows.length === 0 && (
        <Alert className="border-amber-200 bg-amber-50 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800 space-y-1 text-sm">
            {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
            {preview.rows.length === 0 && preview.columns.length === 0 && (
              <p className="text-xs mt-1">
                若試算表確定有資料，請確認已設為「知道連結的人可查看」
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Rows found: settings + list ── */}
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

          {/* Summary bar */}
          <div className="flex items-center gap-4 p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-2 text-sm">
              <Package className="w-4 h-4 text-green-600" />
              <span className="font-medium text-green-900">共 {preview.summary.rowCount} 筆訂單</span>
            </div>
            {selectedCount < preview.rows.length && (
              <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                已選 {selectedCount} 筆
              </Badge>
            )}
          </div>

          {/* Default pickup address */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <StepBadge n={2} />
                預設取貨地址（選填）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-md space-y-1.5">
                <p className="text-xs text-muted-foreground">若表單未填取貨地址，套用此預設值</p>
                <Input
                  value={defaultPickupAddress}
                  onChange={(e) => setDefaultPickupAddress(e.target.value)}
                  placeholder="例：台北市內湖區某某倉庫"
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Row list */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <StepBadge n={3} />
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
                    <Checkbox checked={selectedRows.has(row.rowIndex)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {row.customerName || <span className="text-gray-400 font-normal">（未填）</span>}
                        </div>
                        {row.customerPhone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Phone className="w-3 h-3" />
                            {row.customerPhone}
                          </div>
                        )}
                        {row.vehicleType && (
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="w-3 h-3 mr-1" />{row.vehicleType}
                          </Badge>
                        )}
                        {row.pickupDate && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {row.pickupDate}{row.pickupTime && ` ${row.pickupTime}`}
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
                            <Package className="w-3 h-3" />{row.cargoDescription}
                          </div>
                        )}
                        {row.notes && (
                          <div className="text-gray-400 italic truncate ml-4">備註：{row.notes}</div>
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
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={resetPreview}>
              取消預覽
            </Button>
            <div className="flex items-center gap-3">
              {importMutation.isError && (
                <span className="text-xs text-red-600">{importMutation.error.message}</span>
              )}
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedCount === 0 || importMutation.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700"
                size="lg"
              >
                {importMutation.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Package className="w-4 h-4" />}
                匯入 {selectedCount} 筆訂單
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Import result ── */}
      {importResult && (
        <Card className={importResult.inserted > 0 ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-sm font-medium flex items-center gap-2 ${
              importResult.inserted > 0 ? "text-green-800" : "text-yellow-800"
            }`}>
              <CheckCircle2 className={`w-5 h-5 ${importResult.inserted > 0 ? "text-green-600" : "text-yellow-600"}`} />
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
                <p className="text-sm font-medium text-red-700">以下訂單匯入失敗：</p>
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
              <Button variant="outline" size="sm" onClick={resetPreview}>再次預覽 / 修改</Button>
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

// ── Small sub-components ───────────────────────────────────────────────────
function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white text-xs font-bold flex-shrink-0">
      {n}
    </span>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
      checked ? "border-green-500 bg-green-500" : "border-gray-300"
    }`}>
      {checked && <CheckCircle2 className="w-3 h-3 text-white fill-current" />}
    </div>
  );
}
