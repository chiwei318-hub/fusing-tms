import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
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
  { label: "上收",       gross: 0, commissionRate: 7 },
  { label: "招募獎金",   gross: 0, commissionRate: 7 },
  { label: "交通罰單補助", gross: 0, commissionRate: 0 },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function InvoiceTab() {
  const { toast } = useToast();
  const months = prevMonths();
  const [month, setMonth] = useState(months[1]); // default: last month
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState<ManualItem[]>(DEFAULT_MANUAL);
  const [exporting, setExporting] = useState(false);

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
      const res = await fetch(getApiUrl(`/fusingao/invoice?month=${month}`));
      const j = await res.json();
      if (j.ok) setData(j);
      else throw new Error(j.error);
    } catch (e: any) {
      toast({ title: "載入失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

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

      // Title
      ws.mergeCells("A1:D1"); ws.getCell("A1").value = "福星高股份有限公司"; ws.getCell("A1").style = titleStyle;
      ws.mergeCells("A2:D2"); ws.getCell("A2").value = monthLabel(month); ws.getCell("A2").style = { font: { bold: true }, alignment: { horizontal: "center" } };
      ws.mergeCells("A3:D3"); ws.getCell("A3").value = "每月蝦皮趟次 請款單"; ws.getCell("A3").style = { font: { bold: true, color: { argb: "FF885500" } }, alignment: { horizontal: "center" } };

      ws.getCell("A4").value = "商號"; ws.getCell("B4").value = "富詠運輸有限公司";
      ws.getCell("A5").value = "拆帳方式";
      ws.getCell("B5").value = `未稅總計×(1-福星高抽成${commissionPct}%)×1.05(發票稅金)`;

      ws.addRow([]);

      // Table header
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
    } catch (e: any) {
      toast({ title: "匯出失敗", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
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
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> 重新整理
        </Button>
        <Button size="sm" onClick={exportExcel} disabled={exporting || !data}
          className="bg-orange-500 hover:bg-orange-600 text-white">
          <Download className="h-4 w-4 mr-1" /> 匯出 Excel
        </Button>
      </div>

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
              {/* Auto-calculated rows */}
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
            { label: "未稅金額", value: fmt(totalNet), sub: "富詠實收（未稅）", cls: "text-gray-800" },
            { label: "營業稅（5%）", value: fmt(tax), sub: "加值稅", cls: "text-gray-600" },
            { label: "請款金額", value: fmt(invoiceTotal), sub: "開立發票金額（含稅）", cls: "text-orange-600 text-xl" },
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
    </div>
  );
}
