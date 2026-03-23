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

type ImportType = "customers" | "drivers";

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

const CUSTOMER_SAMPLE: CustomerRow[] = [
  { 姓名: "王大明", 電話: "0912345678", 地址: "台北市信義區信義路5段7號", 聯絡人: "王小姐", 統一編號: "12345678", 帳號: "wang001", 密碼: "123456" },
  { 姓名: "陳美華", 電話: "0923456789", 地址: "台中市西屯區台灣大道3段99號", 聯絡人: "", 統一編號: "", 帳號: "", 密碼: "" },
];

const DRIVER_SAMPLE: DriverRow[] = [
  { 姓名: "李志遠", 電話: "0934567890", 車型: "小貨車", 車牌號碼: "ABC-1234", 司機類型: "自有", 帳號: "li001", 密碼: "123456" },
  { 姓名: "張明德", 電話: "0945678901", 車型: "機車", 車牌號碼: "XY-5678", 司機類型: "靠行", 帳號: "", 密碼: "" },
];

async function downloadTemplate(type: ImportType) {
  const headers = type === "customers" ? CUSTOMER_HEADERS : DRIVER_HEADERS;
  const sample = type === "customers" ? CUSTOMER_SAMPLE : DRIVER_SAMPLE;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(type === "customers" ? "客戶資料" : "司機資料");
  ws.addRow(headers);
  sample.forEach(row => ws.addRow(headers.map(h => String((row as any)[h] ?? ""))));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = type === "customers" ? "客戶匯入範本.xlsx" : "司機匯入範本.xlsx";
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
  return {
    name: String(r["姓名"] ?? "").trim(),
    phone: String(r["電話"] ?? "").trim(),
    address: String(r["地址"] ?? "").trim() || undefined,
    contactPerson: String(r["聯絡人"] ?? "").trim() || undefined,
    taxId: String(r["統一編號"] ?? "").trim() || undefined,
    username: String(r["帳號"] ?? "").trim() || undefined,
    password: String(r["密碼"] ?? "").trim() || undefined,
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

  const headers = type === "customers" ? CUSTOMER_HEADERS : DRIVER_HEADERS;

  const handleFile = async (file: File) => {
    setParseError("");
    setResult(null);
    setRows([]);
    setFileName(file.name);
    try {
      const parsed = await parseExcel(file);
      setRows(parsed);
    } catch (e: any) {
      setParseError(e.message ?? "解析失敗");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const validRows = rows.filter(r => {
    if (type === "customers") {
      const m = mapCustomerRow(r as CustomerRow);
      return m.name && m.phone;
    }
    const m = mapDriverRow(r as DriverRow);
    return m.name && m.phone && m.licensePlate;
  });

  const invalidCount = rows.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setLoading(true);
    try {
      const mapped = type === "customers"
        ? validRows.map(r => mapCustomerRow(r as CustomerRow))
        : validRows.map(r => mapDriverRow(r as DriverRow));

      const endpoint = type === "customers" ? "/customers/bulk" : "/drivers/bulk";
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
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {type === "customers"
            ? "必填欄位：姓名、電話。選填：地址、聯絡人、統一編號、帳號、密碼"
            : "必填欄位：姓名、電話、車牌號碼。選填：車型、司機類型、帳號、密碼"}
        </p>
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              <span className="font-medium">{fileName}</span>
            </div>
            <Badge variant="secondary">{rows.length} 列</Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive">{invalidCount} 列缺少必填欄位（將略過）</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>重新上傳</Button>
          </div>

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
                  const valid = type === "customers"
                    ? !!(mapCustomerRow(row as CustomerRow).name && mapCustomerRow(row as CustomerRow).phone)
                    : !!(mapDriverRow(row as DriverRow).name && mapDriverRow(row as DriverRow).phone && mapDriverRow(row as DriverRow).licensePlate);
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
          <TabsList className="w-full">
            <TabsTrigger value="customers" className="flex-1">客戶資料</TabsTrigger>
            <TabsTrigger value="drivers" className="flex-1">司機資料</TabsTrigger>
          </TabsList>
          <TabsContent value="customers" className="mt-4">
            <ImportTabPanel type="customers" onSuccess={() => onSuccess?.()} />
          </TabsContent>
          <TabsContent value="drivers" className="mt-4">
            <ImportTabPanel type="drivers" onSuccess={() => onSuccess?.()} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
