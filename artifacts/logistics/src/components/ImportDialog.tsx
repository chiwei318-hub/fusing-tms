import { useState, useRef } from "react";
import ExcelJS from "exceljs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, CheckCircle2, XCircle, AlertCircle, FileSpreadsheet } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL + "api";

type ImportType = "customers" | "drivers" | "orders" | "suppliers" | "vehicles" | "townships";

interface CustomerRow {
  姓名: string;
  電話: string;
  地址?: string;
  聯絡人?: string;
  統一編號?: string;
  帳號?: string;
  密碼?: string;
}

interface DriverRow {
  姓名: string;
  電話: string;
  車型: string;
  車牌號碼: string;
  司機類型?: string;
  帳號?: string;
  密碼?: string;
}

type AnyRow = CustomerRow | DriverRow;

interface ImportResult {
  inserted: number;
  errors: string[];
}

const CUSTOMER_HEADERS = ["姓名", "電話", "地址", "聯絡人", "統一編號", "帳號", "密碼"];
const DRIVER_HEADERS = ["姓名", "電話", "車型", "車牌號碼", "司機類型", "帳號", "密碼"];

// ── 欄位別名對應表（將 Glory Platform / 其他系統的欄位名稱轉換為統一格式）──
const CUSTOMER_ALIASES: Record<string, string> = {
  // 姓名 ── Glory Platform: 客戶全名（最優先）
  "客戶全名": "姓名", "客戶名稱": "姓名", "名稱": "姓名", "公司名稱": "姓名",
  "企業名稱": "姓名", "買家": "姓名", "收件人": "姓名", "姓　名": "姓名",
  "customerName": "姓名", "name": "姓名",
  // 簡稱 ── Glory Platform: 客戶簡稱
  "客戶簡稱": "簡稱", "簡稱": "簡稱", "shortName": "簡稱",
  // 客戶編號 ── Glory Platform: 客戶編號（A01 / C00001 等，存入帳號欄位）
  "客戶編號": "帳號",
  // 電話（選填）
  "客戶電話": "電話", "聯絡電話": "電話", "手機": "電話", "電話號碼": "電話",
  "行動電話": "電話", "連絡電話": "電話", "手機號碼": "電話", "電　話": "電話",
  "customerPhone": "電話", "phone": "電話", "mobile": "電話",
  // 地址 ── Glory Platform: 客戶地址
  "客戶地址": "地址", "送貨地址": "地址", "收件地址": "地址", "通訊地址": "地址",
  "公司地址": "地址", "地　址": "地址", "address": "地址",
  // 聯絡人
  "聯絡人姓名": "聯絡人", "聯絡人員": "聯絡人", "contactPerson": "聯絡人",
  // 統一編號 ── Glory Platform: 統編
  "統編": "統一編號", "公司統編": "統一編號", "統一編": "統一編號",
  "taxId": "統一編號", "統一編號(選填)": "統一編號",
  // 帳號
  "使用者帳號": "帳號", "登入帳號": "帳號", "user": "帳號", "username": "帳號",
  "account": "帳號",
  // 密碼
  "登入密碼": "密碼", "password": "密碼", "pass": "密碼",
};

/** Glory Platform 中不需要匯入的系統欄位 */
const GLORY_SKIP_FIELDS = new Set(["客戶分類", "提送貨型態", "提送貨型態說明"]);

/** 將 Excel 原始 row 的欄位名稱正規化，支援別名對應 */
function normalizeCustomerRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = CUSTOMER_ALIASES[k];
    if (mapped) {
      // 若目標欄位已有值（優先保留先出現的），跳過
      if (!(mapped in out)) out[mapped] = v;
    } else if (!GLORY_SKIP_FIELDS.has(k)) {
      // 原始欄位名稱原樣保留（如已是 姓名/電話 等標準名稱）
      if (!(k in out)) out[k] = v;
    }
  }
  // 若沒有 姓名 但有 客戶簡稱 對應後的 簡稱，用簡稱補姓名
  if (!out["姓名"] && out["簡稱"]) out["姓名"] = out["簡稱"];
  return out;
}

// ── 廠商欄位別名 ───────────────────────────────────────────────────────────
const SUPPLIER_ALIASES: Record<string, string> = {
  "廠商名稱": "名稱", "公司名稱": "名稱", "供應商名稱": "名稱", "name": "名稱",
  "廠商簡稱": "簡稱", "簡稱": "簡稱", "shortName": "簡稱",
  "統編": "統一編號", "統一編": "統一編號", "公司統編": "統一編號", "taxId": "統一編號",
  "聯絡人姓名": "聯絡人", "聯絡人員": "聯絡人", "contactPerson": "聯絡人",
  "廠商電話": "電話", "聯絡電話": "電話", "電話號碼": "電話", "contactPhone": "電話",
  "廠商地址": "地址", "公司地址": "地址", "通訊地址": "地址", "address": "地址",
};
const SUPPLIER_HEADERS = ["名稱", "簡稱", "統一編號", "聯絡人", "電話", "地址"];
function normalizeSupplierRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = SUPPLIER_ALIASES[k];
    if (mapped) { if (!(mapped in out)) out[mapped] = v; }
    else { if (!(k in out)) out[k] = v; }
  }
  return out;
}
function mapSupplierRow(r: Record<string, any>) {
  return {
    name: String(r["名稱"] ?? "").trim(),
    shortName: String(r["簡稱"] ?? "").trim() || undefined,
    taxId: String(r["統一編號"] ?? "").trim() || undefined,
    contactPerson: String(r["聯絡人"] ?? "").trim() || undefined,
    contactPhone: String(r["電話"] ?? "").trim() || undefined,
    address: String(r["地址"] ?? "").trim() || undefined,
  };
}

// ── 車輛欄位別名 ───────────────────────────────────────────────────────────
const VEHICLE_ALIASES: Record<string, string> = {
  "車號": "車牌", "車牌號碼": "車牌", "牌照號碼": "車牌", "plateNo": "車牌",
  "車型代碼": "車型", "車種": "車型", "vehicleType": "車型",
  "廠牌": "廠牌", "卡車廠牌": "廠牌", "車廠": "廠牌", "brand": "廠牌",
  "出廠年月": "年份", "出廠年份": "年份", "製造年份": "年份", "year": "年份",
  "最大載重": "總重量(公噸)", "總重": "總重量(公噸)", "總重(公噸)": "總重量(公噸)", "grossWeight": "總重量(公噸)",
  "車色": "顏色", "color": "顏色",
  "引擎號碼": "引擎號碼", "引擎號": "引擎號碼", "engineNo": "引擎號碼",
  "車身號碼": "VIN", "車身號": "VIN", "vin": "VIN",
  "所有人": "車主", "車主姓名": "車主", "ownerName": "車主",
  "指派司機": "指派司機", "assignedDriver": "指派司機",
};
const VEHICLE_HEADERS = ["車牌", "車型", "廠牌", "年份", "總重量(公噸)", "顏色", "引擎號碼", "VIN", "車主", "指派司機"];
function normalizeVehicleRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = VEHICLE_ALIASES[k];
    if (mapped) { if (!(mapped in out)) out[mapped] = v; }
    else { if (!(k in out)) out[k] = v; }
  }
  return out;
}
function mapVehicleRow(r: Record<string, any>) {
  return {
    plateNo: String(r["車牌"] ?? "").trim(),
    vehicleType: String(r["車型"] ?? "").trim() || undefined,
    brand: String(r["廠牌"] ?? "").trim() || undefined,
    year: String(r["年份"] ?? "").trim() || undefined,
    grossWeight: String(r["總重量(公噸)"] ?? "").trim() || undefined,
    color: String(r["顏色"] ?? "").trim() || undefined,
    engineNo: String(r["引擎號碼"] ?? "").trim() || undefined,
    vin: String(r["VIN"] ?? "").trim() || undefined,
    ownerName: String(r["車主"] ?? "").trim() || undefined,
    assignedDriver: String(r["指派司機"] ?? "").trim() || undefined,
  };
}

// ── 鄉鎮欄位別名 ───────────────────────────────────────────────────────────
const TOWNSHIP_ALIASES: Record<string, string> = {
  "縣市名稱": "縣市", "所屬縣市": "縣市", "縣市代碼": "縣市", "county": "縣市",
  "鄉鎮名稱": "鄉鎮", "鄉鎮市區": "鄉鎮", "市區": "鄉鎮", "district": "鄉鎮",
  "鄉鎮代碼": "郵遞區號", "郵遞區號": "郵遞區號", "zipCode": "郵遞區號", "zip": "郵遞區號",
};
const TOWNSHIP_HEADERS = ["縣市", "鄉鎮", "郵遞區號"];
function normalizeTownshipRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = TOWNSHIP_ALIASES[k];
    if (mapped) { if (!(mapped in out)) out[mapped] = v; }
    else { if (!(k in out)) out[k] = v; }
  }
  return out;
}
function mapTownshipRow(r: Record<string, any>) {
  return {
    county: String(r["縣市"] ?? "").trim(),
    district: String(r["鄉鎮"] ?? "").trim(),
    zipCode: String(r["郵遞區號"] ?? "").trim() || undefined,
  };
}

// ── 各類型設定 ────────────────────────────────────────────────────────────
function getTypeHeaders(type: ImportType): string[] {
  if (type === "suppliers") return SUPPLIER_HEADERS;
  if (type === "vehicles")  return VEHICLE_HEADERS;
  if (type === "townships") return TOWNSHIP_HEADERS;
  if (type === "customers") return CUSTOMER_HEADERS;
  return DRIVER_HEADERS;
}
function getTypeAliases(type: ImportType): Record<string, string> {
  if (type === "suppliers") return SUPPLIER_ALIASES;
  if (type === "vehicles")  return VEHICLE_ALIASES;
  if (type === "townships") return TOWNSHIP_ALIASES;
  if (type === "customers") return CUSTOMER_ALIASES;
  return {};
}
function normalizeRow(type: ImportType, raw: Record<string, any>): Record<string, any> {
  if (type === "customers") return normalizeCustomerRow(raw);
  if (type === "suppliers") return normalizeSupplierRow(raw);
  if (type === "vehicles")  return normalizeVehicleRow(raw);
  if (type === "townships") return normalizeTownshipRow(raw);
  return raw;
}
function isValidRow(type: ImportType, row: Record<string, any>): boolean {
  if (type === "customers") return !!mapCustomerRow(row as CustomerRow).name;
  if (type === "drivers")   return !!(mapDriverRow(row as DriverRow).name && mapDriverRow(row as DriverRow).phone && mapDriverRow(row as DriverRow).licensePlate);
  if (type === "suppliers") return !!mapSupplierRow(row).name;
  if (type === "vehicles")  return !!mapVehicleRow(row).plateNo;
  if (type === "townships") return !!(mapTownshipRow(row).county && mapTownshipRow(row).district);
  return true;
}
function mapRow(type: ImportType, row: Record<string, any>) {
  if (type === "customers") return mapCustomerRow(row as CustomerRow);
  if (type === "drivers")   return mapDriverRow(row as DriverRow);
  if (type === "suppliers") return mapSupplierRow(row);
  if (type === "vehicles")  return mapVehicleRow(row);
  if (type === "townships") return mapTownshipRow(row);
  return row;
}
function getEndpoint(type: ImportType): string {
  if (type === "customers") return "/customers/bulk";
  if (type === "drivers")   return "/drivers/bulk";
  if (type === "suppliers") return "/suppliers/bulk";
  if (type === "vehicles")  return "/vehicles/bulk";
  if (type === "townships") return "/townships/bulk";
  return "";
}
function getTypeHint(type: ImportType): string {
  if (type === "customers") return "必填：姓名（或客戶全名）。選填：電話、地址、統一編號、聯絡人、帳號。支援 Glory Platform 匯出格式。";
  if (type === "drivers")   return "必填：姓名、電話、車牌號碼。選填：車型、司機類型、帳號、密碼";
  if (type === "suppliers") return "必填：名稱（或廠商名稱）。選填：簡稱、統一編號、聯絡人、電話、地址。支援 Glory 廠商基本資料匯出。";
  if (type === "vehicles")  return "必填：車牌（或車號）。選填：車型、廠牌、年份、總重量、車主、指派司機。支援 Glory 車輛基本資料匯出。";
  if (type === "townships") return "必填：縣市、鄉鎮（或鄉鎮名稱、所屬縣市）。選填：郵遞區號。支援 Glory 鄉鎮基本資料匯出。";
  return "";
}
function getTemplateName(type: ImportType): string {
  const names: Record<string, string> = {
    customers: "客戶匯入範本.xlsx", drivers: "司機匯入範本.xlsx",
    suppliers: "廠商匯入範本.xlsx", vehicles: "車輛匯入範本.xlsx", townships: "鄉鎮匯入範本.xlsx",
  };
  return names[type] ?? "匯入範本.xlsx";
}
function getSheetName(type: ImportType): string {
  const names: Record<string, string> = {
    customers: "客戶資料", drivers: "司機資料",
    suppliers: "廠商資料", vehicles: "車輛資料", townships: "鄉鎮資料",
  };
  return names[type] ?? "資料";
}

const CUSTOMER_SAMPLE: CustomerRow[] = [
  { 姓名: "王大明", 電話: "0912345678", 地址: "台北市信義區信義路5段7號", 聯絡人: "王小姐", 統一編號: "12345678", 帳號: "wang001", 密碼: "123456" },
  { 姓名: "陳美華", 電話: "0923456789", 地址: "台中市西屯區台灣大道3段99號", 聯絡人: "", 統一編號: "", 帳號: "", 密碼: "" },
];

const DRIVER_SAMPLE: DriverRow[] = [
  { 姓名: "李志遠", 電話: "0934567890", 車型: "小貨車", 車牌號碼: "ABC-1234", 司機類型: "自有", 帳號: "li001", 密碼: "123456" },
  { 姓名: "張明德", 電話: "0945678901", 車型: "機車", 車牌號碼: "XY-5678", 司機類型: "靠行", 帳號: "", 密碼: "" },
];

async function downloadTemplate(type: ImportType) {
  const headers = getTypeHeaders(type);
  const sample = type === "customers" ? CUSTOMER_SAMPLE : type === "drivers" ? DRIVER_SAMPLE : [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(getSheetName(type));
  ws.addRow(headers);
  sample.forEach((row: any) => ws.addRow(headers.map(h => String(row[h] ?? ""))));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getTemplateName(type);
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(content: string): AnyRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj as AnyRow;
  });
}

function parseExcel(file: File): Promise<AnyRow[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseCSV(e.target!.result as string));
        } catch {
          reject(new Error("無法解析 CSV 檔案"));
        }
      };
      reader.onerror = () => reject(new Error("讀取檔案失敗"));
      reader.readAsText(file, "utf-8");
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) throw new Error("找不到工作表");

        const headers: string[] = [];
        ws.getRow(1).eachCell((cell) => {
          headers.push(String(cell.value ?? ""));
        });

        const rows: AnyRow[] = [];
        ws.eachRow((row, rowNum) => {
          if (rowNum === 1) return;
          const obj: any = {};
          headers.forEach((h, i) => {
            const cell = row.getCell(i + 1);
            obj[h] = cell.value ?? "";
          });
          rows.push(obj as AnyRow);
        });
        resolve(rows);
      } catch {
        reject(new Error("無法解析檔案，請確認格式正確"));
      }
    };
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.readAsArrayBuffer(file);
  });
}

function mapCustomerRow(r: CustomerRow) {
  const ra = r as any;
  return {
    name: String(ra["姓名"] ?? "").trim(),
    shortName: String(ra["簡稱"] ?? "").trim() || undefined,
    phone: String(ra["電話"] ?? "").trim() || undefined,
    address: String(ra["地址"] ?? "").trim() || undefined,
    contactPerson: String(ra["聯絡人"] ?? "").trim() || undefined,
    taxId: String(ra["統一編號"] ?? "").trim() || undefined,
    username: String(ra["帳號"] ?? "").trim() || undefined,
    password: String(ra["密碼"] ?? "").trim() || undefined,
    externalCode: String(ra["帳號"] ?? "").trim() || undefined,
  };
}

function mapDriverRow(r: DriverRow) {
  return {
    name: String(r["姓名"] ?? "").trim(),
    phone: String(r["電話"] ?? "").trim(),
    vehicleType: String(r["車型"] ?? "").trim() || "機車",
    licensePlate: String(r["車牌號碼"] ?? "").trim(),
    driverType: String(r["司機類型"] ?? "").trim() || undefined,
    username: String(r["帳號"] ?? "").trim() || undefined,
    password: String(r["密碼"] ?? "").trim() || undefined,
  };
}

interface TabPanelProps {
  type: ImportType;
  onSuccess: () => void;
}

function ImportTabPanel({ type, onSuccess }: TabPanelProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);

  const headers = getTypeHeaders(type);

  const handleFile = async (file: File) => {
    setParseError("");
    setResult(null);
    setRows([]);
    setRawHeaders([]);
    setFileName(file.name);
    try {
      const parsed = await parseExcel(file);
      if (parsed.length > 0) {
        setRawHeaders(Object.keys(parsed[0]));
      }
      const normalized = parsed.map(r => normalizeRow(type, r as Record<string, any>) as AnyRow);
      setRows(normalized);
    } catch (e: any) {
      setParseError(e.message ?? "解析失敗");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows = rows.filter(r => isValidRow(type, r as Record<string, any>));
  const invalidCount = rows.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setLoading(true);
    try {
      const mapped = validRows.map(r => mapRow(type, r as Record<string, any>));
      const endpoint = getEndpoint(type);
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "匯入失敗");
      setResult({ inserted: data.inserted, errors: [] });
      toast({ title: `成功匯入 ${data.inserted} 筆資料` });
      onSuccess();
    } catch (e: any) {
      setResult({ inserted: 0, errors: [e.message] });
      toast({ title: "匯入失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setParseError("");
    setRawHeaders([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{getTypeHint(type)}</p>
        <Button variant="outline" size="sm" onClick={() => downloadTemplate(type)}>
          <Download className="w-4 h-4 mr-1" />
          下載範本
        </Button>
      </div>

      {!rows.length && !parseError && (
        <div
          className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">拖曳或點擊上傳 Excel / CSV 檔案</p>
          <p className="text-xs text-muted-foreground">支援 .xlsx、.csv 格式</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {parseError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <XCircle className="w-4 h-4 shrink-0" />
          {parseError}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>重試</Button>
        </div>
      )}

      {rows.length > 0 && !result && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">{fileName}</span>
            </div>
            <Badge variant="secondary">{rows.length} 列</Badge>
            {invalidCount > 0 ? (
              <Badge variant="destructive">{invalidCount} 列缺少必填欄位（將略過）</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border-green-300">全部 {rows.length} 列有效</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>重新上傳</Button>
          </div>

          {/* 欄位對應提示 */}
          {rawHeaders.length > 0 && type !== "drivers" && (
            (() => {
              const aliases = getTypeAliases(type);
              const typeHeaders = getTypeHeaders(type);
              const mapped = rawHeaders.filter(h => aliases[h]);
              const unrecognized = rawHeaders.filter(h => !typeHeaders.includes(h) && !aliases[h]);
              return (mapped.length > 0 || unrecognized.length > 0) ? (
                <div className="text-xs rounded-md border bg-blue-50 border-blue-200 px-3 py-2 space-y-1">
                  {mapped.length > 0 && (
                    <p className="text-blue-700">
                      🔄 已自動對應欄位：{mapped.map(h => `「${h}」→「${aliases[h]}」`).join("、")}
                    </p>
                  )}
                  {unrecognized.length > 0 && (
                    <p className="text-gray-500">
                      ℹ️ 未使用欄位（已略過）：{unrecognized.map(h => `「${h}」`).join("、")}
                    </p>
                  )}
                </div>
              ) : null;
            })()
          )}

          <div className="border rounded-lg overflow-auto max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="w-8">狀態</TableHead>
                  {headers.map(h => <TableHead key={h}>{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const valid = isValidRow(type, row as Record<string, any>);
                  return (
                    <TableRow key={i} className={valid ? "" : "bg-red-50 text-muted-foreground"}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        {valid
                          ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                          : <AlertCircle className="w-4 h-4 text-red-500" />}
                      </TableCell>
                      {headers.map(h => (
                        <TableCell key={h} className="max-w-[120px] truncate">
                          {String((row as any)[h] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>取消</Button>
            <Button onClick={handleImport} disabled={loading || validRows.length === 0}>
              <Upload className="w-4 h-4 mr-1" />
              {loading ? "匯入中..." : `確認匯入 ${validRows.length} 筆`}
            </Button>
          </div>
        </>
      )}

      {result && (
        <div className={`p-4 rounded-lg border ${result.inserted > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {result.inserted > 0 ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">成功匯入 {result.inserted} 筆資料！</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">匯入失敗：{result.errors.join("、")}</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={reset}>繼續匯入</Button>
        </div>
      )}
    </div>
  );
}

// ── Orders Import Panel (server-side upload) ──────────────────────────────
interface OrderPreviewRow {
  rowNum: number;
  valid: boolean;
  errors: string[];
  preview: {
    customer_name: string;
    customer_phone: string;
    pickup_address: string;
    delivery_address: string;
    cargo_description: string;
    required_vehicle_type: string;
    pickup_date: string;
    delivery_date: string;
    total_fee: string;
  };
}

interface OrderImportDryResult {
  total: number;
  valid: number;
  errors: number;
  rows: OrderPreviewRow[];
}

function OrdersImportPanel({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dryResult, setDryResult] = useState<OrderImportDryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [finalResult, setFinalResult] = useState<{ inserted: number; errors: number } | null>(null);

  const downloadTemplate = () => {
    const url = `${API_BASE}/orders/import-template`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "訂單匯入範本.xlsx";
    a.click();
  };

  const handleFile = async (file: File) => {
    setSelectedFile(file);
    setDryResult(null);
    setFinalResult(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/orders/import?dry_run=1`, { method: "POST", body: fd });
      const data = await res.json() as OrderImportDryResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "預覽失敗");
      setDryResult(data as OrderImportDryResult);
    } catch (e: any) {
      toast({ title: "解析失敗", description: e.message, variant: "destructive" });
      setSelectedFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile || !dryResult) return;
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch(`${API_BASE}/orders/import`, { method: "POST", body: fd });
      const data = await res.json() as { inserted?: number; skipped_errors?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "匯入失敗");
      setFinalResult({ inserted: data.inserted ?? 0, errors: data.skipped_errors ?? 0 });
      toast({ title: `成功匯入 ${data.inserted} 筆訂單` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "匯入失敗", description: e.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setDryResult(null);
    setFinalResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const ORDER_PREVIEW_COLS = ["客戶姓名", "客戶電話", "取貨地址", "送貨地址", "車型", "取貨日期", "費用"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          必填：客戶姓名、電話、取貨地址、送貨地址。系統自動套用分單規則。
        </p>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="w-4 h-4 mr-1" />
          下載範本
        </Button>
      </div>

      {!selectedFile && !loading && (
        <div
          className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">拖曳或點擊上傳訂單 Excel / CSV 檔案</p>
          <p className="text-xs text-muted-foreground">支援 .xlsx、.csv 格式，最大 10MB</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-muted-foreground text-sm animate-pulse">
          伺服器解析中，請稍候…
        </div>
      )}

      {dryResult && !finalResult && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">{selectedFile?.name}</span>
            </div>
            <Badge variant="secondary">共 {dryResult.total} 列</Badge>
            <Badge variant={dryResult.valid > 0 ? "default" : "secondary"} className="bg-green-100 text-green-700">
              ✅ 有效 {dryResult.valid} 筆
            </Badge>
            {dryResult.errors > 0 && (
              <Badge variant="destructive">⚠ 錯誤 {dryResult.errors} 筆（將略過）</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>重新上傳</Button>
          </div>

          <div className="border rounded-lg overflow-auto max-h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">列</TableHead>
                  <TableHead className="w-8">狀態</TableHead>
                  {ORDER_PREVIEW_COLS.map(h => <TableHead key={h}>{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dryResult.rows.map((row) => (
                  <TableRow key={row.rowNum} className={row.valid ? "" : "bg-red-50 text-muted-foreground"}>
                    <TableCell>{row.rowNum}</TableCell>
                    <TableCell>
                      {row.valid
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <AlertCircle className="w-4 h-4 text-red-500" title={row.errors.join(", ")} />}
                    </TableCell>
                    <TableCell className="max-w-[80px] truncate">{row.preview.customer_name}</TableCell>
                    <TableCell>{row.preview.customer_phone}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{row.preview.pickup_address}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{row.preview.delivery_address}</TableCell>
                    <TableCell>{row.preview.required_vehicle_type}</TableCell>
                    <TableCell>{row.preview.pickup_date}</TableCell>
                    <TableCell>{row.preview.total_fee ? `$${row.preview.total_fee}` : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {dryResult.rows.some(r => !r.valid) && (
            <div className="space-y-1">
              {dryResult.rows.filter(r => !r.valid).map(r => (
                <p key={r.rowNum} className="text-xs text-red-500">
                  第 {r.rowNum} 列：{r.errors.join("、")}
                </p>
              ))}
            </div>
          )}

          {dryResult.valid === 0 ? (
            <p className="text-sm text-center text-muted-foreground">沒有有效資料可匯入</p>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>取消</Button>
              <Button onClick={handleImport} disabled={importLoading}>
                <Upload className="w-4 h-4 mr-1" />
                {importLoading ? "匯入中…" : `確認匯入 ${dryResult.valid} 筆訂單`}
              </Button>
            </div>
          )}
        </>
      )}

      {finalResult && (
        <div className={`p-4 rounded-lg border ${finalResult.inserted > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {finalResult.inserted > 0 ? (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">成功匯入 {finalResult.inserted} 筆訂單！</span>
              {finalResult.errors > 0 && <span className="text-sm text-orange-600">（{finalResult.errors} 筆因錯誤略過）</span>}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">所有資料均匯入失敗</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={reset}>繼續匯入</Button>
        </div>
      )}
    </div>
  );
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  defaultTab?: ImportType;
  onSuccess?: () => void;
}

export function ImportDialog({ open, onClose, defaultTab = "customers", onSuccess }: ImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Excel 批量匯入
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full flex-wrap h-auto gap-0.5 p-1">
            <TabsTrigger value="customers" className="flex-1 text-xs">客戶資料</TabsTrigger>
            <TabsTrigger value="drivers" className="flex-1 text-xs">司機資料</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 text-xs">訂單匯入</TabsTrigger>
            <TabsTrigger value="suppliers" className="flex-1 text-xs">🏭 廠商</TabsTrigger>
            <TabsTrigger value="vehicles" className="flex-1 text-xs">🚛 車輛</TabsTrigger>
            <TabsTrigger value="townships" className="flex-1 text-xs">🗺️ 鄉鎮</TabsTrigger>
          </TabsList>
          <TabsContent value="customers" className="mt-4">
            <ImportTabPanel type="customers" onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="drivers" className="mt-4">
            <ImportTabPanel type="drivers" onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <OrdersImportPanel onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            <ImportTabPanel type="suppliers" onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="vehicles" className="mt-4">
            <ImportTabPanel type="vehicles" onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="townships" className="mt-4">
            <ImportTabPanel type="townships" onSuccess={() => onSuccess?.()} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
