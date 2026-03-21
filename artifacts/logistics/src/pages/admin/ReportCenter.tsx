import { useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import {
  Printer, Download, Filter, Users, Truck, UserCheck,
  TrendingUp, BarChart2, ChevronDown, ChevronUp, Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrdersData } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { useCustomersData } from "@/hooks/use-customers";
import type { Order } from "@workspace/api-client-react";

const COMPANY = "富詠運輸股份有限公司";

// ─── Cost helpers (shared with AI analytics) ─────────────────────────────────
const VEHICLE_FUEL_RATE: Record<string, number> = {
  "小貨車": 2.56, "中型貨車": 3.84, "大貨車": 5.76,
  "曳引車": 9.60, "冷藏車": 6.40, "3.5噸廂型車": 3.84, "5噸貨車": 5.76,
};
const VEHICLE_DEPRECIATION: Record<string, number> = {
  "小貨車": 120, "中型貨車": 220, "大貨車": 380,
  "曳引車": 800, "冷藏車": 450, "3.5噸廂型車": 220, "5噸貨車": 380,
};
const REGION_DIST: Record<string, Record<string, number>> = {
  "北部": { "北部": 20, "桃竹苗": 60, "中部": 150, "雲嘉南": 220, "南部": 320, "東部": 180, "其他": 80 },
  "桃竹苗": { "北部": 60, "桃竹苗": 25, "中部": 80, "雲嘉南": 150, "南部": 250, "東部": 140, "其他": 80 },
  "中部": { "北部": 150, "桃竹苗": 80, "中部": 20, "雲嘉南": 80, "南部": 160, "東部": 100, "其他": 80 },
  "雲嘉南": { "北部": 220, "桃竹苗": 150, "中部": 80, "雲嘉南": 25, "南部": 80, "東部": 180, "其他": 80 },
  "南部": { "北部": 320, "桃竹苗": 250, "中部": 160, "雲嘉南": 80, "南部": 20, "東部": 220, "其他": 100 },
  "東部": { "北部": 180, "桃竹苗": 140, "中部": 100, "雲嘉南": 180, "南部": 220, "東部": 30, "其他": 100 },
  "其他": { "北部": 80, "桃竹苗": 80, "中部": 80, "雲嘉南": 80, "南部": 100, "東部": 100, "其他": 50 },
};
const REGION_TOLL: Record<string, Record<string, number>> = {
  "北部": { "北部": 0, "桃竹苗": 80, "中部": 350, "雲嘉南": 500, "南部": 700, "東部": 200, "其他": 100 },
  "桃竹苗": { "北部": 80, "桃竹苗": 0, "中部": 200, "雲嘉南": 380, "南部": 550, "東部": 180, "其他": 100 },
  "中部": { "北部": 350, "桃竹苗": 200, "中部": 0, "雲嘉南": 150, "南部": 350, "東部": 120, "其他": 100 },
  "雲嘉南": { "北部": 500, "桃竹苗": 380, "中部": 150, "雲嘉南": 0, "南部": 150, "東部": 200, "其他": 100 },
  "南部": { "北部": 700, "桃竹苗": 550, "中部": 350, "雲嘉南": 150, "南部": 0, "東部": 300, "其他": 100 },
  "東部": { "北部": 200, "桃竹苗": 180, "中部": 120, "雲嘉南": 200, "南部": 300, "東部": 0, "其他": 100 },
  "其他": { "北部": 100, "桃竹苗": 100, "中部": 100, "雲嘉南": 100, "南部": 100, "東部": 100, "其他": 0 },
};

function getRegion(addr: string): string {
  const map: Record<string, string[]> = {
    "北部": ["台北", "臺北", "新北", "基隆", "淡水", "板橋", "中和", "永和", "新莊", "三重"],
    "桃竹苗": ["桃園", "新竹", "苗栗", "中壢"],
    "中部": ["台中", "臺中", "彰化", "南投"],
    "雲嘉南": ["雲林", "嘉義", "台南", "臺南"],
    "南部": ["高雄", "屏東"],
    "東部": ["宜蘭", "花蓮", "台東", "臺東"],
  };
  for (const [r, kws] of Object.entries(map)) {
    if (kws.some(k => addr.includes(k))) return r;
  }
  return "其他";
}

function calcOrderCost(order: Order) {
  const revenue = order.totalFee ?? 0;
  const vt = order.requiredVehicleType ?? "小貨車";
  const pr = getRegion(order.pickupAddress ?? "");
  const dr = getRegion(order.deliveryAddress ?? "");
  const dist = REGION_DIST[pr]?.[dr] ?? 80;
  const fuel = Math.round(dist * (VEHICLE_FUEL_RATE[vt] ?? 4));
  const toll = REGION_TOLL[pr]?.[dr] ?? 100;
  const comm = Math.round(revenue * 0.20);
  const dep = VEHICLE_DEPRECIATION[vt] ?? 200;
  const cost = fuel + toll + comm + dep;
  return { revenue, cost, profit: revenue - cost, dist };
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
interface Filters {
  dateFrom: string;
  dateTo: string;
  keyword: string;
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-xl p-3 mb-4">
      <div>
        <Label className="text-xs">開始日期</Label>
        <Input type="date" className="h-8 w-36 mt-0.5 text-xs"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">結束日期</Label>
        <Input type="date" className="h-8 w-36 mt-0.5 text-xs"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <Label className="text-xs">關鍵字篩選</Label>
        <div className="relative mt-0.5">
          <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-xs" placeholder="客戶/司機/車牌/貨物…"
            value={filters.keyword}
            onChange={e => onChange({ ...filters, keyword: e.target.value })} />
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-8 text-xs"
        onClick={() => onChange({ dateFrom: "", dateTo: "", keyword: "" })}>
        清除篩選
      </Button>
    </div>
  );
}

function filterOrders(orders: Order[], f: Filters): Order[] {
  return orders.filter(o => {
    const d = new Date(o.createdAt);
    if (f.dateFrom) {
      try { if (d < startOfDay(parseISO(f.dateFrom))) return false; } catch { /* skip */ }
    }
    if (f.dateTo) {
      try { if (d > endOfDay(parseISO(f.dateTo))) return false; } catch { /* skip */ }
    }
    if (f.keyword) {
      const kw = f.keyword.toLowerCase();
      const match = [
        o.customerName, o.customerPhone, o.cargoDescription,
        o.pickupAddress, o.deliveryAddress, o.requiredVehicleType,
        o.driver?.name, o.driver?.licensePlate,
      ].some(v => v?.toLowerCase().includes(kw));
      if (!match) return false;
    }
    return true;
  });
}

// ─── Print helper ─────────────────────────────────────────────────────────────
function printHTML(title: string, dateRange: string, html: string, landscape = false) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 15mm; }
    * { box-sizing: border-box; font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; }
    body { font-size: 11pt; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 8mm; }
    .header h1 { font-size: 16pt; font-weight: 900; margin: 0 0 3mm; color: #1a3a8f; }
    .header .sub { font-size: 10pt; color: #555; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { background: #1a3a8f; color: white; padding: 4px 6px; text-align: left; font-weight: 700; white-space: nowrap; }
    td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    .total-row td { background: #fef3c7; font-weight: 700; border-top: 2px solid #f97316; }
    .good { color: #16a34a; } .loss { color: #dc2626; } .warn { color: #f97316; }
    .section-title { font-size: 12pt; font-weight: 700; margin: 6mm 0 3mm; color: #1a3a8f; padding-bottom: 2mm; border-bottom: 2px solid #1a3a8f; }
    .footer { margin-top: 8mm; text-align: right; font-size: 8pt; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${COMPANY}</h1>
    <div class="sub">${title} ／ 日期區間：${dateRange || "全部"} ／ 列印時間：${format(new Date(), "yyyy/MM/dd HH:mm")}</div>
  </div>
  ${html}
  <div class="footer">本報表由系統自動產生 · ${COMPANY}</div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

function nt(v: number) { return `NT$${Math.round(v).toLocaleString()}`; }
function pct(profit: number, rev: number) {
  if (rev === 0) return "—";
  const p = Math.round((profit / rev) * 100);
  return `${p}%`;
}

// ─── Totals row ───────────────────────────────────────────────────────────────
function sumRows<T extends { trips: number; revenue: number; cost: number; profit: number; distKm: number; items: number }>(rows: T[]) {
  return rows.reduce((acc, r) => ({
    trips: acc.trips + r.trips,
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.cost,
    profit: acc.profit + r.profit,
    distKm: acc.distKm + r.distKm,
    items: acc.items + r.items,
  }), { trips: 0, revenue: 0, cost: 0, profit: 0, distKm: 0, items: 0 });
}

// ─── Summary Table Component ──────────────────────────────────────────────────
interface SummaryRow {
  key: string;
  label: string;
  sub?: string;
  trips: number;
  revenue: number;
  cost: number;
  profit: number;
  distKm: number;
  items: number;
  orders: Order[];
}

function SummaryTable({
  rows, expandedKey, onToggle, title
}: {
  rows: SummaryRow[];
  expandedKey: string | null;
  onToggle: (k: string) => void;
  title: string;
}) {
  const totals = sumRows(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-primary text-white">
            <th className="px-3 py-2.5 text-left font-bold">{title}</th>
            <th className="px-3 py-2.5 text-right">趟次</th>
            <th className="px-3 py-2.5 text-right">件數</th>
            <th className="px-3 py-2.5 text-right">里程(km)</th>
            <th className="px-3 py-2.5 text-right">營收</th>
            <th className="px-3 py-2.5 text-right">成本</th>
            <th className="px-3 py-2.5 text-right">毛利</th>
            <th className="px-3 py-2.5 text-right">毛利率</th>
            <th className="px-3 py-2.5 text-right">平均單價</th>
            <th className="px-3 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <>
              <tr key={r.key} className={`hover:bg-muted/40 cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                onClick={() => onToggle(r.key)}>
                <td className="px-3 py-2.5">
                  <div className="font-semibold">{r.label}</div>
                  {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                </td>
                <td className="px-3 py-2.5 text-right">{r.trips}</td>
                <td className="px-3 py-2.5 text-right">{r.items}</td>
                <td className="px-3 py-2.5 text-right">{Math.round(r.distKm).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right font-semibold">{nt(r.revenue)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{nt(r.cost)}</td>
                <td className={`px-3 py-2.5 text-right font-bold ${r.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {r.profit >= 0 ? "+" : ""}{nt(r.profit)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-xs font-bold ${r.revenue > 0 && r.profit / r.revenue >= 0.15 ? "text-emerald-700" : r.profit < 0 ? "text-red-600" : "text-orange-600"}`}>
                    {pct(r.profit, r.revenue)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs">
                  {r.trips > 0 ? nt(r.revenue / r.trips) : "—"}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {expandedKey === r.key
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground mx-auto" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}
                </td>
              </tr>
              {expandedKey === r.key && (
                <tr key={`${r.key}-detail`}>
                  <td colSpan={10} className="bg-muted/20 px-2 pb-3 pt-2">
                    <DetailTable orders={r.orders} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-amber-50 border-t-2 border-orange-300 font-black">
            <td className="px-3 py-2.5">合計</td>
            <td className="px-3 py-2.5 text-right">{totals.trips}</td>
            <td className="px-3 py-2.5 text-right">{totals.items}</td>
            <td className="px-3 py-2.5 text-right">{Math.round(totals.distKm).toLocaleString()}</td>
            <td className="px-3 py-2.5 text-right">{nt(totals.revenue)}</td>
            <td className="px-3 py-2.5 text-right">{nt(totals.cost)}</td>
            <td className={`px-3 py-2.5 text-right ${totals.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
              {totals.profit >= 0 ? "+" : ""}{nt(totals.profit)}
            </td>
            <td className="px-3 py-2.5 text-right">{pct(totals.profit, totals.revenue)}</td>
            <td className="px-3 py-2.5 text-right">
              {totals.trips > 0 ? nt(totals.revenue / totals.trips) : "—"}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DetailTable({ orders }: { orders: Order[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-slate-700 text-white">
          <tr>
            {["單號", "日期", "貨物", "起址", "訖址", "車型", "重量kg", "營收", "成本", "毛利", "狀態"].map(h => (
              <th key={h} className="px-2 py-1.5 text-left whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map(o => {
            const { revenue, cost, profit } = calcOrderCost(o);
            return (
              <tr key={o.id} className="hover:bg-muted/30">
                <td className="px-2 py-1.5 font-mono">#{o.id}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{format(new Date(o.createdAt), "MM/dd")}</td>
                <td className="px-2 py-1.5 max-w-[120px] truncate">{o.cargoDescription}</td>
                <td className="px-2 py-1.5 max-w-[100px] truncate text-muted-foreground">{o.pickupAddress?.slice(0, 15)}</td>
                <td className="px-2 py-1.5 max-w-[100px] truncate text-muted-foreground">{o.deliveryAddress?.slice(0, 15)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{o.requiredVehicleType ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{o.cargoWeight ?? "—"}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{revenue > 0 ? nt(revenue) : "—"}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">{nt(cost)}</td>
                <td className={`px-2 py-1.5 text-right font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {revenue > 0 ? (profit >= 0 ? "+" : "") + nt(profit) : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant="outline" className="text-xs">{o.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Excel export helper ───────────────────────────────────────────────────────
function exportExcel(title: string, summaryRows: SummaryRow[], summaryLabel: string, dateRange: string) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    [`${COMPANY} — ${title}`],
    [`日期區間：${dateRange || "全部"}`, "", "", "", "", `匯出時間：${format(new Date(), "yyyy/MM/dd HH:mm")}`],
    [],
    [summaryLabel, "趟次", "件數", "里程(km)", "營收(NT$)", "成本(NT$)", "毛利(NT$)", "毛利率", "平均單價(NT$)"],
    ...summaryRows.map(r => [
      r.label + (r.sub ? ` (${r.sub})` : ""),
      r.trips, r.items, Math.round(r.distKm),
      Math.round(r.revenue), Math.round(r.cost), Math.round(r.profit),
      r.revenue > 0 ? `${Math.round((r.profit / r.revenue) * 100)}%` : "—",
      r.trips > 0 ? Math.round(r.revenue / r.trips) : "—",
    ]),
    (() => {
      const t = sumRows(summaryRows);
      return ["合計", t.trips, t.items, Math.round(t.distKm), Math.round(t.revenue), Math.round(t.cost), Math.round(t.profit),
        t.revenue > 0 ? `${Math.round((t.profit / t.revenue) * 100)}%` : "—",
        t.trips > 0 ? Math.round(t.revenue / t.trips) : "—"];
    })(),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 22 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "總表");

  // Detail sheets per row
  for (const r of summaryRows) {
    if (!r.orders.length) continue;
    const detailData = [
      [`明細：${r.label}`],
      ["單號", "日期", "貨物描述", "起址", "訖址", "車型", "重量(kg)", "件數", "里程(km)", "營收(NT$)", "成本(NT$)", "毛利(NT$)", "狀態"],
      ...r.orders.map(o => {
        const { revenue, cost, profit, dist } = calcOrderCost(o);
        return [
          `#${o.id}`,
          format(new Date(o.createdAt), "yyyy/MM/dd"),
          o.cargoDescription,
          o.pickupAddress ?? "",
          o.deliveryAddress ?? "",
          o.requiredVehicleType ?? "",
          o.cargoWeight ?? "",
          o.cargoQuantity ?? "",
          Math.round(dist),
          Math.round(revenue),
          Math.round(cost),
          Math.round(profit),
          o.status,
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(detailData);
    ws["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const sheetName = r.label.slice(0, 30).replace(/[\\/?*[\]]/g, "_");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, `${title}_${format(new Date(), "yyyyMMdd")}.xlsx`);
}

// ─── Print summary + detail HTML ─────────────────────────────────────────────
function buildPrintHTML(rows: SummaryRow[], summaryLabel: string): string {
  const totals = sumRows(rows);
  const summaryRows = rows.map(r => `
    <tr>
      <td>${r.label}${r.sub ? `<br/><small style="color:#888">${r.sub}</small>` : ""}</td>
      <td style="text-align:right">${r.trips}</td><td style="text-align:right">${r.items}</td>
      <td style="text-align:right">${Math.round(r.distKm).toLocaleString()}</td>
      <td style="text-align:right">${nt(r.revenue)}</td><td style="text-align:right">${nt(r.cost)}</td>
      <td style="text-align:right;${r.profit >= 0 ? "color:#16a34a" : "color:#dc2626"};font-weight:700">${r.profit >= 0 ? "+" : ""}${nt(r.profit)}</td>
      <td style="text-align:right">${pct(r.profit, r.revenue)}</td>
      <td style="text-align:right">${r.trips > 0 ? nt(r.revenue / r.trips) : "—"}</td>
    </tr>`).join("");

  const detailSections = rows.map(r => {
    if (!r.orders.length) return "";
    const rows2 = r.orders.map(o => {
      const { revenue, cost, profit } = calcOrderCost(o);
      return `<tr>
        <td>#${o.id}</td><td>${format(new Date(o.createdAt), "MM/dd")}</td>
        <td>${o.cargoDescription}</td>
        <td>${(o.pickupAddress ?? "").slice(0, 18)}</td>
        <td>${(o.deliveryAddress ?? "").slice(0, 18)}</td>
        <td>${o.requiredVehicleType ?? "—"}</td>
        <td style="text-align:right">${o.cargoWeight ?? "—"}</td>
        <td style="text-align:right">${revenue > 0 ? nt(revenue) : "—"}</td>
        <td style="text-align:right">${nt(cost)}</td>
        <td style="text-align:right;${profit >= 0 ? "color:#16a34a" : "color:#dc2626"};font-weight:700">${revenue > 0 ? (profit >= 0 ? "+" : "") + nt(profit) : "—"}</td>
        <td>${o.status}</td>
      </tr>`;
    }).join("");
    return `<div class="section-title">明細：${r.label}</div>
    <table><thead><tr>
      <th>單號</th><th>日期</th><th>貨物</th><th>起址</th><th>訖址</th><th>車型</th><th>重量kg</th><th>營收</th><th>成本</th><th>毛利</th><th>狀態</th>
    </tr></thead><tbody>${rows2}</tbody></table>`;
  }).join("<br/>");

  return `
    <div class="section-title">總表</div>
    <table>
      <thead><tr>
        <th>${summaryLabel}</th><th>趟次</th><th>件數</th><th>里程km</th>
        <th>營收</th><th>成本</th><th>毛利</th><th>毛利率</th><th>平均單價</th>
      </tr></thead>
      <tbody>${summaryRows}</tbody>
      <tfoot><tr class="total-row">
        <td>合計</td>
        <td style="text-align:right">${totals.trips}</td><td style="text-align:right">${totals.items}</td>
        <td style="text-align:right">${Math.round(totals.distKm).toLocaleString()}</td>
        <td style="text-align:right">${nt(totals.revenue)}</td><td style="text-align:right">${nt(totals.cost)}</td>
        <td style="text-align:right;${totals.profit >= 0 ? "color:#16a34a" : "color:#dc2626"};font-weight:900">${totals.profit >= 0 ? "+" : ""}${nt(totals.profit)}</td>
        <td style="text-align:right">${pct(totals.profit, totals.revenue)}</td>
        <td style="text-align:right">${totals.trips > 0 ? nt(totals.revenue / totals.trips) : "—"}</td>
      </tr></tfoot>
    </table>
    <div style="page-break-before:always"></div>
    ${detailSections}`;
}

// ─── Customer Report ──────────────────────────────────────────────────────────
function CustomerReport({ orders, dateRange }: { orders: Order[]; dateRange: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows: SummaryRow[] = useMemo(() => {
    const byCustomer: Record<string, Order[]> = {};
    for (const o of orders) {
      const key = `${o.customerName}|${o.customerPhone}`;
      if (!byCustomer[key]) byCustomer[key] = [];
      byCustomer[key].push(o);
    }
    return Object.entries(byCustomer).map(([key, os]) => {
      const [name, phone] = key.split("|");
      const totals = os.reduce((acc, o) => {
        const { revenue, cost, profit, dist } = calcOrderCost(o);
        return { revenue: acc.revenue + revenue, cost: acc.cost + cost, profit: acc.profit + profit, dist: acc.dist + dist };
      }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
      return { key, label: name, sub: phone, trips: os.length, revenue: totals.revenue, cost: totals.cost, profit: totals.profit, distKm: totals.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const handleExcel = () => exportExcel("客戶報表", rows, "客戶", dateRange);
  const handlePrint = () => printHTML("客戶報表", dateRange, buildPrintHTML(rows, "客戶"), true);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" /> 客戶報表 <Badge variant="outline">{rows.length} 位客戶</Badge></h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> 列印
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleExcel}>
            <Download className="w-3.5 h-3.5" /> 匯出 Excel
          </Button>
        </div>
      </div>
      {rows.length === 0
        ? <p className="text-center text-muted-foreground py-8">此篩選條件下無訂單資料</p>
        : <Card className="overflow-hidden"><SummaryTable rows={rows} expandedKey={expanded} onToggle={k => setExpanded(expanded === k ? null : k)} title="客戶" /></Card>}
    </div>
  );
}

// ─── Vehicle Report ───────────────────────────────────────────────────────────
function VehicleReport({ orders, drivers, dateRange }: { orders: Order[]; drivers: any[]; dateRange: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows: SummaryRow[] = useMemo(() => {
    const byVehicle: Record<string, Order[]> = {};
    for (const o of orders) {
      const driver = drivers.find(d => d.id === o.driverId);
      const key = driver ? `${driver.licensePlate ?? driver.name}` : "未指派";
      if (!byVehicle[key]) byVehicle[key] = [];
      byVehicle[key].push(o);
    }
    return Object.entries(byVehicle).map(([key, os]) => {
      const driver = drivers.find(d => d.licensePlate === key || (key === "未指派" && !d.licensePlate));
      const totals = os.reduce((acc, o) => {
        const { revenue, cost, profit, dist } = calcOrderCost(o);
        return { revenue: acc.revenue + revenue, cost: acc.cost + cost, profit: acc.profit + profit, dist: acc.dist + dist };
      }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
      return { key, label: key, sub: driver?.vehicleType ?? os[0]?.requiredVehicleType ?? "", trips: os.length, revenue: totals.revenue, cost: totals.cost, profit: totals.profit, distKm: totals.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [orders, drivers]);

  const handleExcel = () => exportExcel("車輛報表", rows, "車牌", dateRange);
  const handlePrint = () => printHTML("車輛報表", dateRange, buildPrintHTML(rows, "車牌"), true);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2"><Truck className="w-4 h-4 text-orange-600" /> 車輛報表 <Badge variant="outline">{rows.length} 輛</Badge></h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> 列印
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleExcel}>
            <Download className="w-3.5 h-3.5" /> 匯出 Excel
          </Button>
        </div>
      </div>
      {rows.length === 0
        ? <p className="text-center text-muted-foreground py-8">此篩選條件下無訂單資料</p>
        : <Card className="overflow-hidden"><SummaryTable rows={rows} expandedKey={expanded} onToggle={k => setExpanded(expanded === k ? null : k)} title="車牌" /></Card>}
    </div>
  );
}

// ─── Driver Report ────────────────────────────────────────────────────────────
function DriverReport({ orders, drivers, dateRange }: { orders: Order[]; drivers: any[]; dateRange: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows: SummaryRow[] = useMemo(() => {
    const byDriver: Record<string, Order[]> = {};
    for (const o of orders) {
      const driver = drivers.find(d => d.id === o.driverId);
      const key = driver ? `${driver.id}` : "未指派";
      if (!byDriver[key]) byDriver[key] = [];
      byDriver[key].push(o);
    }
    return Object.entries(byDriver).map(([key, os]) => {
      const driver = drivers.find(d => `${d.id}` === key);
      const totals = os.reduce((acc, o) => {
        const { revenue, cost, profit, dist } = calcOrderCost(o);
        return { revenue: acc.revenue + revenue, cost: acc.cost + cost, profit: acc.profit + profit, dist: acc.dist + dist };
      }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
      return { key, label: driver?.name ?? "未指派", sub: driver ? `${driver.vehicleType} · ${driver.phone}` : "", trips: os.length, revenue: totals.revenue, cost: totals.cost, profit: totals.profit, distKm: totals.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [orders, drivers]);

  const handleExcel = () => exportExcel("司機報表", rows, "司機", dateRange);
  const handlePrint = () => printHTML("司機報表", dateRange, buildPrintHTML(rows, "司機"), true);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-base flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" /> 司機報表 <Badge variant="outline">{rows.length} 位司機</Badge></h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> 列印
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleExcel}>
            <Download className="w-3.5 h-3.5" /> 匯出 Excel
          </Button>
        </div>
      </div>
      {rows.length === 0
        ? <p className="text-center text-muted-foreground py-8">此篩選條件下無訂單資料</p>
        : <Card className="overflow-hidden"><SummaryTable rows={rows} expandedKey={expanded} onToggle={k => setExpanded(expanded === k ? null : k)} title="司機" /></Card>}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ReportCenter() {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const { data: customers = [] } = useCustomersData();

  const [filters, setFilters] = useState<Filters>({ dateFrom: "", dateTo: "", keyword: "" });
  const filtered = useMemo(() => filterOrders(orders as Order[], filters), [orders, filters]);

  const dateRange = [filters.dateFrom, filters.dateTo].filter(Boolean).join(" ~ ") || "全部";

  const handlePrintAll = () => {
    // Build a combined print with all 3 sections
    // Customer section
    const byCustomer: Record<string, Order[]> = {};
    for (const o of filtered) {
      const key = `${o.customerName}|${o.customerPhone}`;
      if (!byCustomer[key]) byCustomer[key] = [];
      byCustomer[key].push(o);
    }
    const custRows: SummaryRow[] = Object.entries(byCustomer).map(([k, os]) => {
      const [name, phone] = k.split("|");
      const t = os.reduce((a, o) => { const c = calcOrderCost(o); return { revenue: a.revenue + c.revenue, cost: a.cost + c.cost, profit: a.profit + c.profit, dist: a.dist + c.dist }; }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
      return { key: k, label: name, sub: phone, trips: os.length, revenue: t.revenue, cost: t.cost, profit: t.profit, distKm: t.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
    }).sort((a, b) => b.revenue - a.revenue);

    const allHTML = `
      <h2 style="color:#1a3a8f;margin:6mm 0 3mm;font-size:14pt">一、客戶報表</h2>
      ${buildPrintHTML(custRows, "客戶").split('<div style="page-break-before:always"></div>')[0]}
    `;
    printHTML("綜合報表", dateRange, allHTML, true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2">
            <BarChart2 className="w-5 h-5" /> 報表中心
          </h2>
          <p className="text-sm text-muted-foreground">客戶、車輛、司機三維報表 · 支援篩選、列印與 Excel 匯出</p>
        </div>
        <Button variant="outline" className="h-9 gap-1.5 text-sm" onClick={handlePrintAll}>
          <Printer className="w-4 h-4" /> 列印全部報表
        </Button>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Stat banner */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "篩選訂單數", value: `${filtered.length} 筆` },
          { label: "篩選總營收", value: nt(filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0)) },
          { label: "篩選總毛利", value: nt(filtered.reduce((s, o) => { const c = calcOrderCost(o); return s + c.profit; }, 0)) },
          { label: "平均單價", value: filtered.length > 0 ? nt(filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0) / filtered.length) : "—" },
        ].map(s => (
          <Card key={s.label} className="p-3 text-center">
            <div className="text-lg font-black text-primary">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Three-tab report */}
      <Tabs defaultValue="customer">
        <TabsList className="flex w-full h-10 mb-4">
          <TabsTrigger value="customer" className="flex-1 gap-1.5"><Users className="w-3.5 h-3.5" /> 客戶報表</TabsTrigger>
          <TabsTrigger value="vehicle" className="flex-1 gap-1.5"><Truck className="w-3.5 h-3.5" /> 車輛報表</TabsTrigger>
          <TabsTrigger value="driver" className="flex-1 gap-1.5"><UserCheck className="w-3.5 h-3.5" /> 司機報表</TabsTrigger>
        </TabsList>
        <TabsContent value="customer">
          <CustomerReport orders={filtered} dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="vehicle">
          <VehicleReport orders={filtered} drivers={drivers} dateRange={dateRange} />
        </TabsContent>
        <TabsContent value="driver">
          <DriverReport orders={filtered} drivers={drivers} dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
