import { useState, useEffect, useCallback } from "react";
import {
  Download, RefreshCw, FileText, AlertCircle,
  Sheet, CheckCircle2, ArrowRight, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Category {
  name: string;
  trips: number;
  gross: number;
  rate: number;
}

interface InvoiceData {
  month: string;
  categories: Category[];
  autoGross: number;
}

interface ManualItem {
  label: string;
  gross: number;
  commissionRate: number;
}

interface SheetItem {
  name: string;
  total: number;
  fusingao: number;
  net: number;
  type: string;
}

interface SheetImportResult {
  ok: boolean;
  month: string;
  monthLabel: string;
  billPeriod: string;
  version: string;
  summary: { netAmount: number; tax: number; invoiceAmount: number };
  items: SheetItem[];
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${y}年${Number(mo).toString().padStart(2, "0")}月份`;
}

function prevMonths(count = 12): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

const COMMISSION_THRESHOLD = 2_000_000;

const DEFAULT_MANUAL: ManualItem[] = [
  { label: "上收",         gross: 0, commissionRate: 7 },
  { label: "招募獎金",     gross: 0, commissionRate: 7 },
  { label: "交通罰單補助", gross: 0, commissionRate: 0 },
];

const MANUAL_LABELS = DEFAULT_MANUAL.map(m => m.label);

// ─── Component ────────────────────────────────────────────────────────────────
export default function InvoiceTab() {
  const { toast } = useToast();
  const months = prevMonths();
  const [month, setMonth] = useState(months[1]);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState<ManualItem[]>(DEFAULT_MANUAL);
  const [exporting, setExporting] = useState(false);

  // Sheet import state
  const [sheetDialogOpen, setSheetDialogOpen] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetResult, setSheetResult] = useState<SheetImportResult | null>(null);
  const [lastSheetSync, setLastSheetSync] = useState<string | null>(
    () => localStorage.getItem("invoice_last_sheet_sync")
  );

  // Load persisted manual entries from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`invoice_manual_${month}`);
    if (saved) {
      try { setManual(JSON.parse(saved)); }
      catch { setManual(DEFAULT_MANUAL.map(m => ({ ...m }))); }
    } else {
      setManual(DEFAULT_MANUAL.map(m => ({ ...m })));
    }
  }, [month]);

  const saveManual = useCallback((items: ManualItem[]) => {
    setManual(items);
    localStorage.setItem(`invoice_manual_${month}`, JSON.stringify(items));
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/fusingao/invoice?month=${month}`));
      const j = await res.json();
      if (j.ok) setData(j);
      else throw new Error(j.error);
    } catch (e: unknown) {
      toast({ title: "載入失敗", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  // ── Sheet import ──────────────────────────────────────────────────────────
  const fetchFromSheet = async () => {
    setSheetLoading(true);
    setSheetResult(null);
    try {
      const res = await fetch(apiUrl("/fusingao/invoice-sheet-import"));
      const d: SheetImportResult = await res.json();
      if (!d.ok) throw new Error(d.error ?? "解析失敗");
      setSheetResult(d);
    } catch (e: unknown) {
      toast({ title: "試算表匯入失敗", description: String(e), variant: "destructive" });
    } finally {
      setSheetLoading(false);
    }
  };

  const applySheetData = (sr: SheetImportResult) => {
    // Only apply manual items (上收, 招募獎金, 交通罰單補助)
    const next = manual.map(m => {
      const found = sr.items.find(it => it.name === m.label && it.type === "manual");
      return found ? { ...m, gross: found.total } : m;
    });
    saveManual(next);
    const now = new Date().toLocaleString("zh-TW");
    setLastSheetSync(now);
    localStorage.setItem("invoice_last_sheet_sync", now);
    toast({
      title: "已套用試算表資料",
      description: `已填入${MANUAL_LABELS.filter(l => sr.items.some(it => it.name === l)).join("、")} 的金額`,
    });
    setSheetDialogOpen(false);
  };

  // ── Calculations ─────────────────────────────────────────────────────────
  const autoCategories: (Category & { fusingaoAmt: number; netAmt: number })[] = [];
  const autoGross = data?.autoGross ?? 0;
  const manualGross = manual.reduce((s, m) => s + m.gross, 0);
  const totalGross = autoGross + manualGross;
  const commissionPct = totalGross >= COMMISSION_THRESHOLD ? 5 : 7;

  if (data) {
    for (const cat of data.categories) {
      const fusingaoAmt = Math.round(cat.gross * commissionPct / 100);
      autoCategories.push({ ...cat, fusingaoAmt, netAmt: cat.gross - fusingaoAmt });
    }
  }

  const manualCalc = manual.map(m => ({
    ...m,
    fusingaoAmt: Math.round(m.gross * m.commissionRate / 100),
    netAmt: Math.round(m.gross * (1 - m.commissionRate / 100)),
  }));

  const totalFusingao = [...autoCategories, ...manualCalc].reduce((s, r) => s + r.fusingaoAmt, 0);
  const totalNet = totalGross - totalFusingao;
  const tax = Math.round(totalNet * 0.05);
  const invoiceTotal = totalNet + tax;

  // ── Export Excel ─────────────────────────────────────────────────────────
  const exportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`${month} 請款單`);

      ws.columns = [
        { width: 20 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 2 },
        { width: 20 }, { width: 16 }, { width: 12 }, { width: 16 },
      ];

      const titleStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, size: 13 },
        alignment: { horizontal: "center" },
      };
      const headerStyle: Partial<ExcelJS.Style> = {
        font: { bold: true },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEEBB" } },
        border: { bottom: { style: "thin" } },
        alignment: { horizontal: "center" },
      };
      const numFmt = "#,##0";
      const money = (v: number): Partial<ExcelJS.Style> => ({
        numFmt,
        alignment: { horizontal: "right" },
        font: { color: { argb: v < 0 ? "FFCC0000" : "FF000000" } },
      });

      ws.mergeCells("A1:D1"); ws.getCell("A1").value = "福星高股份有限公司"; ws.getCell("A1").style = titleStyle;
      ws.mergeCells("A2:D2"); ws.getCell("A2").value = monthLabel(month); ws.getCell("A2").style = { font: { bold: true }, alignment: { horizontal: "center" } };
      ws.mergeCells("A3:D3"); ws.getCell("A3").value = "每月蝦皮趟次 請款單"; ws.getCell("A3").style = { font: { bold: true, color: { argb: "FF885500" } }, alignment: { horizontal: "center" } };

      ws.getCell("A4").value = "商號"; ws.getCell("B4").value = "富詠運輸有限公司";
      ws.getCell("A5").value = "拆帳方式";
      ws.getCell("B5").value = `未稅總計×(1-福星高抽成${commissionPct}%)×1.05(發票稅金)`;

      ws.addRow([]);
      const hrow = ws.addRow(["項目", "趟次總金額", `福星高(${commissionPct}%)`, "實際金額"]);
      hrow.eachCell(c => { c.style = headerStyle; });

      const allRows = [
        ...autoCategories.map(r => [r.name, r.gross, r.fusingaoAmt, r.netAmt]),
        ...manualCalc.map(r => [r.label, r.gross, r.fusingaoAmt, r.netAmt]),
      ];
      for (const row of allRows) {
        const r = ws.addRow(row);
        [2, 3, 4].forEach(i => { r.getCell(i).style = money(Number(row[i - 1])); });
      }

      ws.addRow([]);
      const totRow = ws.addRow(["合計", totalGross, totalFusingao, totalNet]);
      totRow.font = { bold: true };
      [2, 3, 4].forEach(i => { totRow.getCell(i).style = { ...money(0), font: { bold: true } }; });

      ws.addRow([]);
      ws.addRow(["※以下金額皆未稅※"]);
      ws.addRow(["未稅金額", totalNet]).getCell(2).style = money(totalNet);
      ws.addRow(["營業稅金", tax]).getCell(2).style = money(tax);
      const invRow = ws.addRow(["請款金額", invoiceTotal]);
      invRow.font = { bold: true, size: 12, color: { argb: "FFCC5500" } };
      invRow.getCell(2).style = { numFmt, font: { bold: true, size: 12, color: { argb: "FFCC5500" } }, alignment: { horizontal: "right" } };

      ws.addRow([]);
      ws.addRow(["發票抬頭：", "福星高股份有限公司", "統一編號：", "94085874"]);
      ws.addRow(["發票日期：", `${month}-${new Date(Number(month.split("-")[0]), Number(month.split("-")[1]), 0).getDate()}`]);

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `富詠_福星高請款單_${month}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: "匯出成功", description: `${month} 請款單已下載` });
    } catch (e: unknown) {
      toast({ title: "匯出失敗", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FileText className="h-5 w-5 text-orange-500" />
        <h2 className="text-lg font-bold text-gray-800">福星高請款單產生器</h2>
        <div className="flex-1" />
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-white"
        >
          {months.map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> 重新整理
        </Button>
        {/* Sheet import button */}
        <Button
          size="sm"
          variant="outline"
          className="border-green-300 text-green-700 hover:bg-green-50"
          onClick={() => { setSheetDialogOpen(true); fetchFromSheet(); }}
        >
          <Sheet className="h-3.5 w-3.5 mr-1" />
          從試算表同步
        </Button>
        <Button size="sm" onClick={exportExcel} disabled={exporting || !data}
          className="bg-orange-500 hover:bg-orange-600 text-white">
          <Download className="h-3.5 w-3.5 mr-1" /> 匯出 Excel
        </Button>
      </div>

      {/* Last sync indicator */}
      {lastSheetSync && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          上次從試算表同步：{lastSheetSync}
        </div>
      )}

      {/* Commission rate notice */}
      <div className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${totalGross >= COMMISSION_THRESHOLD ? "bg-green-50 text-green-700 border border-green-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
        <AlertCircle className="h-4 w-4" />
        {totalGross >= COMMISSION_THRESHOLD
          ? `本月業績 ${fmt(totalGross)} 元，達 200 萬門檻，福星高抽成 5%`
          : `本月業績 ${fmt(totalGross)} 元（未達 200 萬），福星高抽成 7%`}
        <Badge className={`ml-auto ${totalGross >= COMMISSION_THRESHOLD ? "bg-green-600" : "bg-blue-600"} text-white`}>
          抽成 {commissionPct}%
        </Badge>
      </div>

      {/* Main table */}
      <Card className="overflow-hidden">
        <div className="bg-orange-50 px-4 py-2 border-b">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">※ 以下金額皆未稅 ※</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-left px-4 py-2">項目</th>
                <th className="text-right px-4 py-2">趟次</th>
                <th className="text-right px-4 py-2">趟次總金額</th>
                <th className="text-right px-4 py-2">福星高 ({commissionPct}%)</th>
                <th className="text-right px-4 py-2 text-orange-700">實際金額（富詠收）</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">載入中...</td></tr>
              ) : autoCategories.length === 0 && !loading ? (
                <tr><td colSpan={5} className="text-center py-4 text-gray-400">本月無路線資料</td></tr>
              ) : autoCategories.map(cat => (
                <tr key={cat.name} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{cat.name}
                    <span className="ml-2 text-xs text-gray-400">（@{fmt(cat.rate)}/趟）</span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">{cat.trips}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(cat.gross)}</td>
                  <td className="px-4 py-2 text-right font-mono text-red-500">({fmt(cat.fusingaoAmt)})</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-orange-700">{fmt(cat.netAmt)}</td>
                </tr>
              ))}

              {/* Manual rows */}
              {manualCalc.map((item, i) => (
                <tr key={item.label} className="border-b bg-yellow-50/40 hover:bg-yellow-50">
                  <td className="px-4 py-2 font-medium text-gray-700">{item.label}
                    <span className="ml-1 text-xs text-gray-400">（手動）</span>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">—</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      value={item.gross === 0 ? "" : item.gross}
                      placeholder="0"
                      onChange={e => {
                        const next = [...manual];
                        next[i] = { ...next[i], gross: Number(e.target.value) || 0 };
                        saveManual(next);
                      }}
                      className="w-28 text-right border rounded px-2 py-0.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.commissionRate > 0 ? (
                      <span className="font-mono text-red-500">({fmt(item.fusingaoAmt)})</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-orange-700">
                    {item.gross > 0 ? fmt(item.netAmt) : "—"}
                  </td>
                </tr>
              ))}

              {/* Totals */}
              <tr className="border-t-2 border-orange-200 bg-orange-50 font-bold">
                <td className="px-4 py-3">合計</td>
                <td className="px-4 py-3 text-right text-gray-600">—</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(totalGross)}</td>
                <td className="px-4 py-3 text-right font-mono text-red-600">({fmt(totalFusingao)})</td>
                <td className="px-4 py-3 text-right font-mono text-orange-700 text-base">{fmt(totalNet)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invoice summary */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-3 divide-x">
          {[
            { label: "未稅金額",   value: fmt(totalNet),     sub: "富詠實收（未稅）",    cls: "text-gray-800" },
            { label: "營業稅（5%）", value: fmt(tax),        sub: "加值稅",             cls: "text-gray-600" },
            { label: "請款金額",   value: fmt(invoiceTotal), sub: "開立發票金額（含稅）", cls: "text-orange-600 text-xl" },
          ].map(k => (
            <div key={k.label} className="p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`font-bold ${k.cls}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Invoice recipient info */}
      <Card className="p-4 bg-gray-50 text-sm text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">發票開立資訊</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <span>發票抬頭：<strong>福星高股份有限公司</strong></span>
          <span>統一編號：<strong>94085874</strong></span>
          <span className="col-span-2">送達地址：105406 台北市敦化北路207號10樓之1B　財務收</span>
        </div>
      </Card>

      {/* ── Sheet Import Dialog ─────────────────────────────────────────── */}
      <Dialog open={sheetDialogOpen} onOpenChange={setSheetDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sheet className="w-5 h-5 text-green-600" />
              從試算表同步請款資料
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Sheet URL info */}
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded p-3 border">
              <span className="text-gray-400">試算表：</span>
              <a
                href="https://docs.google.com/spreadsheets/d/1Z65luSGOGNYpFPyL1apLR8kxOvYV-U2VvPcVrmC5TzI/edit?gid=0"
                target="_blank" rel="noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                福星高 Shopee 請款單（GID=0）
              </a>
            </div>

            {sheetLoading && (
              <div className="flex items-center gap-3 py-6 justify-center text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin text-green-500" />
                <span>正在讀取試算表...</span>
              </div>
            )}

            {sheetResult && !sheetLoading && (
              <>
                {/* Meta info */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-center">
                    <p className="text-xs text-blue-500">試算表版本</p>
                    <p className="font-bold text-blue-700">{sheetResult.version}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded p-3 text-center">
                    <p className="text-xs text-orange-500">月份</p>
                    <p className="font-bold text-orange-700">{sheetResult.monthLabel || sheetResult.month}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                    <p className="text-xs text-green-500">請款金額（含稅）</p>
                    <p className="font-bold text-green-700">NT$ {fmt(sheetResult.summary.invoiceAmount)}</p>
                  </div>
                </div>

                {/* Bill period */}
                {sheetResult.billPeriod && (
                  <p className="text-xs text-gray-500">請款區間：{sheetResult.billPeriod}</p>
                )}

                {/* Items comparison */}
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500">
                        <th className="text-left px-3 py-2">項目</th>
                        <th className="text-right px-3 py-2">趟次總金額</th>
                        <th className="text-right px-3 py-2">福星高抽成</th>
                        <th className="text-right px-3 py-2">實際金額</th>
                        <th className="text-center px-3 py-2">來源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetResult.items.map(item => {
                        const isManual = item.type === "manual";
                        const currentManual = manual.find(m => m.label === item.name);
                        const changed = isManual && currentManual && currentManual.gross !== item.total;
                        return (
                          <tr key={item.name} className={`border-b ${isManual ? "bg-yellow-50/60" : ""}`}>
                            <td className="px-3 py-2 font-medium">
                              {item.name}
                              {isManual && (
                                <Badge className="ml-1 text-[9px] bg-yellow-200 text-yellow-800 hover:bg-yellow-200">手動欄</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(item.total)}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-500">
                              {item.fusingao > 0 ? `(${fmt(item.fusingao)})` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-orange-700">{fmt(item.net)}</td>
                            <td className="px-3 py-2 text-center text-xs text-gray-400">
                              {item.type === "auto" ? "系統計算" : item.type === "manual" ? (
                                changed ? (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <AlertTriangle className="w-3 h-3" />
                                    目前 {fmt(currentManual?.gross ?? 0)}
                                    <ArrowRight className="w-3 h-3" />
                                    {fmt(item.total)}
                                  </span>
                                ) : (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    相同
                                  </span>
                                )
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary from sheet */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "未稅金額",     val: sheetResult.summary.netAmount },
                    { label: "營業稅（5%）", val: sheetResult.summary.tax },
                    { label: "請款金額",     val: sheetResult.summary.invoiceAmount },
                  ].map(k => (
                    <div key={k.label} className="border rounded p-2">
                      <p className="text-xs text-gray-400">{k.label}</p>
                      <p className="font-mono font-semibold text-sm">{fmt(k.val)}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-400">
                  ※ 「套用資料」只會填入手動欄位（上收、招募獎金、交通罰單補助），系統計算欄位（店配車/NDD/WHNDD）不受影響。
                </p>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetDialogOpen(false)}>關閉</Button>
            {sheetResult && !sheetLoading && (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => applySheetData(sheetResult)}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                套用手動欄位資料
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
