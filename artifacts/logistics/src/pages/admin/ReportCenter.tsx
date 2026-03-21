import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import {
  Printer, Download, Users, Truck, UserCheck,
  TrendingUp, BarChart2, Search, Trophy, Medal, Star,
  ChevronRight,
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
const LOGO_COLOR = "#1a3a8f";
const ACCENT_COLOR = "#F97316";

// ─── Cost helpers ─────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nt(v: number) { return `NT$${Math.round(v).toLocaleString()}`; }
function pct(profit: number, rev: number) {
  if (rev === 0) return "—";
  return `${Math.round((profit / rev) * 100)}%`;
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
interface Filters { dateFrom: string; dateTo: string; keyword: string; }

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-xl p-3 mb-4">
      <div>
        <Label className="text-xs">開始日期</Label>
        <Input type="date" className="h-8 w-36 mt-0.5 text-xs"
          value={filters.dateFrom} onChange={e => onChange({ ...filters, dateFrom: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">結束日期</Label>
        <Input type="date" className="h-8 w-36 mt-0.5 text-xs"
          value={filters.dateTo} onChange={e => onChange({ ...filters, dateTo: e.target.value })} />
      </div>
      <div className="flex-1 min-w-[160px]">
        <Label className="text-xs">關鍵字篩選</Label>
        <div className="relative mt-0.5">
          <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-xs" placeholder="客戶/司機/車牌/貨物…"
            value={filters.keyword} onChange={e => onChange({ ...filters, keyword: e.target.value })} />
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-8 text-xs"
        onClick={() => onChange({ dateFrom: "", dateTo: "", keyword: "" })}>清除篩選</Button>
    </div>
  );
}

function filterOrders(orders: Order[], f: Filters): Order[] {
  return orders.filter(o => {
    const d = new Date(o.createdAt);
    if (f.dateFrom) { try { if (d < startOfDay(parseISO(f.dateFrom))) return false; } catch { /* skip */ } }
    if (f.dateTo) { try { if (d > endOfDay(parseISO(f.dateTo))) return false; } catch { /* skip */ } }
    if (f.keyword) {
      const kw = f.keyword.toLowerCase();
      const match = [o.customerName, o.customerPhone, o.cargoDescription, o.pickupAddress,
        o.deliveryAddress, o.requiredVehicleType, o.driver?.name, o.driver?.licensePlate
      ].some(v => v?.toLowerCase().includes(kw));
      if (!match) return false;
    }
    return true;
  });
}

// ─── Summary row type ─────────────────────────────────────────────────────────
interface SummaryRow {
  key: string; label: string; sub?: string;
  trips: number; revenue: number; cost: number; profit: number;
  distKm: number; items: number; orders: Order[];
}

function sumRows<T extends { trips: number; revenue: number; cost: number; profit: number; distKm: number; items: number }>(rows: T[]) {
  return rows.reduce((a, r) => ({ trips: a.trips + r.trips, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit, distKm: a.distKm + r.distKm, items: a.items + r.items }),
    { trips: 0, revenue: 0, cost: 0, profit: 0, distKm: 0, items: 0 });
}

// ─── Ranking cards ─────────────────────────────────────────────────────────────
const RANK_ICONS = [
  <Trophy className="w-5 h-5 text-yellow-500" />,
  <Medal className="w-5 h-5 text-slate-400" />,
  <Star className="w-5 h-5 text-amber-600" />,
];

function RankingSection({ rows, valueLabel }: { rows: SummaryRow[]; valueLabel: "revenue" | "trips" | "profit" }) {
  const top3 = [...rows].sort((a, b) => b[valueLabel] - a[valueLabel]).slice(0, 3);
  if (!top3.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {top3.map((r, i) => (
        <Card key={r.key} className={`p-3 flex items-center gap-3 ${i === 0 ? "border-yellow-300 bg-yellow-50" : i === 1 ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="shrink-0">{RANK_ICONS[i]}</div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{r.label}</div>
            {r.sub && <div className="text-xs text-muted-foreground truncate">{r.sub}</div>}
          </div>
          <div className="text-right shrink-0">
            <div className="font-black text-sm text-primary">
              {valueLabel === "trips" ? `${r[valueLabel]} 趟` : nt(r[valueLabel])}
            </div>
            <div className="text-xs text-muted-foreground">{r.trips} 筆</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Summary table ─────────────────────────────────────────────────────────────
function SummaryTable({ rows, title }: { rows: SummaryRow[]; title: string }) {
  const totals = sumRows(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[700px]">
        <thead>
          <tr className="bg-primary text-white">
            <th className="px-3 py-2.5 text-left">{title}</th>
            <th className="px-3 py-2.5 text-right">趟次</th>
            <th className="px-3 py-2.5 text-right">件數</th>
            <th className="px-3 py-2.5 text-right">里程km</th>
            <th className="px-3 py-2.5 text-right">營收</th>
            <th className="px-3 py-2.5 text-right">成本</th>
            <th className="px-3 py-2.5 text-right">毛利</th>
            <th className="px-3 py-2.5 text-right">毛利率</th>
            <th className="px-3 py-2.5 text-right">平均單價</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={r.key} className={i % 2 === 0 ? "" : "bg-muted/20"}>
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
              <td className="px-3 py-2.5 text-right text-xs">{r.trips > 0 ? nt(r.revenue / r.trips) : "—"}</td>
            </tr>
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
            <td className="px-3 py-2.5 text-right">{totals.trips > 0 ? nt(totals.revenue / totals.trips) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Detail (flat order) table ─────────────────────────────────────────────────
function DetailTable({ orders, groupLabel }: { orders: Order[]; groupLabel: string }) {
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[800px]">
        <thead className="bg-slate-700 text-white">
          <tr>
            {["單號", "日期時間", groupLabel, "貨物", "起址", "訖址", "司機", "重量kg", "件數", "里程km", "營收", "成本", "毛利", "狀態"].map(h => (
              <th key={h} className="px-2.5 py-2 text-left whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((o, i) => {
            const { revenue, cost, profit, dist } = calcOrderCost(o);
            return (
              <tr key={o.id} className={i % 2 === 0 ? "hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/30"}>
                <td className="px-2.5 py-1.5 font-mono font-bold">#{o.id}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{format(new Date(o.createdAt), "MM/dd HH:mm")}</td>
                <td className="px-2.5 py-1.5 font-semibold max-w-[100px] truncate">
                  {groupLabel === "客戶" ? o.customerName : groupLabel === "司機" ? (o.driver?.name ?? "未指派") : (o.driver?.licensePlate ?? "未指派")}
                </td>
                <td className="px-2.5 py-1.5 max-w-[120px] truncate">{o.cargoDescription}</td>
                <td className="px-2.5 py-1.5 max-w-[100px] truncate text-muted-foreground">{o.pickupAddress?.slice(0, 12)}</td>
                <td className="px-2.5 py-1.5 max-w-[100px] truncate text-muted-foreground">{o.deliveryAddress?.slice(0, 12)}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{o.driver?.name ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-right">{o.cargoWeight ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-right">{o.cargoQuantity ?? "—"}</td>
                <td className="px-2.5 py-1.5 text-right">{Math.round(dist)}</td>
                <td className="px-2.5 py-1.5 text-right font-semibold text-primary">{revenue > 0 ? nt(revenue) : "—"}</td>
                <td className="px-2.5 py-1.5 text-right text-muted-foreground">{nt(cost)}</td>
                <td className={`px-2.5 py-1.5 text-right font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {revenue > 0 ? (profit >= 0 ? "+" : "") + nt(profit) : "—"}
                </td>
                <td className="px-2.5 py-1.5">
                  <Badge variant="outline" className="text-xs">{o.status}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-amber-50 border-t-2 border-orange-300 font-black text-xs">
            <td colSpan={10} className="px-2.5 py-2">合計 {sorted.length} 筆</td>
            <td className="px-2.5 py-2 text-right">{nt(sorted.reduce((s, o) => s + (o.totalFee ?? 0), 0))}</td>
            <td className="px-2.5 py-2 text-right">{nt(sorted.reduce((s, o) => { const c = calcOrderCost(o); return s + c.cost; }, 0))}</td>
            <td className="px-2.5 py-2 text-right">{nt(sorted.reduce((s, o) => { const c = calcOrderCost(o); return s + c.profit; }, 0))}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Print helper with logo ────────────────────────────────────────────────────
function printHTML(title: string, dateRange: string, summaryHTML: string, detailHTML: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"/><title>${COMPANY} — ${title}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; font-family: "Microsoft JhengHei","PingFang TC",sans-serif; }
  body { font-size: 10pt; color: #1a1a1a; }
  .logo-header { display:flex; align-items:center; gap:14px; padding-bottom:6mm; border-bottom:3px solid ${LOGO_COLOR}; margin-bottom:6mm; }
  .logo-box { background:${LOGO_COLOR}; border-radius:10px; padding:8px; display:flex; align-items:center; justify-content:center; }
  .logo-truck { width:36px; height:36px; fill:white; }
  .company-name { font-size:18pt; font-weight:900; color:${LOGO_COLOR}; line-height:1.1; }
  .report-title { font-size:12pt; font-weight:700; color:${ACCENT_COLOR}; margin-top:2px; }
  .report-meta { margin-left:auto; text-align:right; font-size:9pt; color:#555; }
  h2 { font-size:13pt; font-weight:900; color:${LOGO_COLOR}; margin:6mm 0 3mm; padding-bottom:2mm; border-bottom:2px solid ${LOGO_COLOR}; }
  table { width:100%; border-collapse:collapse; font-size:8.5pt; }
  th { background:${LOGO_COLOR}; color:white; padding:4px 6px; text-align:left; font-weight:700; white-space:nowrap; }
  td { padding:3px 6px; border-bottom:1px solid #e5e7eb; }
  tr:nth-child(even) td { background:#f9fafb; }
  .total-row td { background:#fef3c7; font-weight:700; border-top:2px solid ${ACCENT_COLOR}; }
  .green { color:#16a34a; } .red { color:#dc2626; }
  .page-break { page-break-before:always; }
  .footer { margin-top:6mm; text-align:right; font-size:8pt; color:#aaa; border-top:1px solid #e5e7eb; padding-top:3mm; }
  .rank-section { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:5mm; }
  .rank-card { border:1px solid #e5e7eb; border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:8px; }
  .rank-1 { border-color:#fbbf24; background:#fffbeb; }
  .rank-2 { border-color:#d1d5db; background:#f9fafb; }
  .rank-3 { border-color:#d97706; background:#fffaf0; }
  .rank-label { font-size:8pt; color:#888; }
  .rank-value { font-weight:900; font-size:11pt; color:${LOGO_COLOR}; }
</style></head><body>
<div class="logo-header">
  <div class="logo-box">
    <svg class="logo-truck" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/><path d="m16 8 4 0 3 4 0 4-7 0 0-8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  </div>
  <div>
    <div class="company-name">${COMPANY}</div>
    <div class="report-title">${title}</div>
  </div>
  <div class="report-meta">
    日期區間：${dateRange || "全部"}<br/>
    列印時間：${format(new Date(), "yyyy/MM/dd HH:mm")}
  </div>
</div>
<h2>總表</h2>
${summaryHTML}
<div class="page-break"></div>
<div class="logo-header">
  <div class="logo-box">
    <svg class="logo-truck" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/><path d="m16 8 4 0 3 4 0 4-7 0 0-8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  </div>
  <div>
    <div class="company-name">${COMPANY}</div>
    <div class="report-title">${title} — 明細表</div>
  </div>
  <div class="report-meta">
    日期區間：${dateRange || "全部"}<br/>
    列印時間：${format(new Date(), "yyyy/MM/dd HH:mm")}
  </div>
</div>
<h2>明細表</h2>
${detailHTML}
<div class="footer">${COMPANY} · 系統自動產生</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function buildSummaryHTML(rows: SummaryRow[], summaryLabel: string): string {
  const totals = sumRows(rows);
  const trs = rows.map(r => `<tr>
    <td>${r.label}${r.sub ? ` <span style="color:#888;font-size:7.5pt">(${r.sub})</span>` : ""}</td>
    <td style="text-align:right">${r.trips}</td><td style="text-align:right">${r.items}</td>
    <td style="text-align:right">${Math.round(r.distKm).toLocaleString()}</td>
    <td style="text-align:right">${nt(r.revenue)}</td><td style="text-align:right">${nt(r.cost)}</td>
    <td style="text-align:right" class="${r.profit >= 0 ? "green" : "red"}">${r.profit >= 0 ? "+" : ""}${nt(r.profit)}</td>
    <td style="text-align:right">${pct(r.profit, r.revenue)}</td>
    <td style="text-align:right">${r.trips > 0 ? nt(r.revenue / r.trips) : "—"}</td>
  </tr>`).join("");
  return `<table><thead><tr>
    <th>${summaryLabel}</th><th>趟次</th><th>件數</th><th>里程km</th>
    <th>營收</th><th>成本</th><th>毛利</th><th>毛利率</th><th>平均單價</th>
  </tr></thead><tbody>${trs}</tbody>
  <tfoot><tr class="total-row">
    <td>合計</td>
    <td style="text-align:right">${totals.trips}</td><td style="text-align:right">${totals.items}</td>
    <td style="text-align:right">${Math.round(totals.distKm).toLocaleString()}</td>
    <td style="text-align:right">${nt(totals.revenue)}</td><td style="text-align:right">${nt(totals.cost)}</td>
    <td style="text-align:right" class="${totals.profit >= 0 ? "green" : "red"}">${totals.profit >= 0 ? "+" : ""}${nt(totals.profit)}</td>
    <td style="text-align:right">${pct(totals.profit, totals.revenue)}</td>
    <td style="text-align:right">${totals.trips > 0 ? nt(totals.revenue / totals.trips) : "—"}</td>
  </tr></tfoot></table>`;
}

function buildDetailHTML(orders: Order[], groupLabel: string): string {
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const trs = sorted.map(o => {
    const { revenue, cost, profit, dist } = calcOrderCost(o);
    const groupVal = groupLabel === "客戶" ? o.customerName : groupLabel === "司機" ? (o.driver?.name ?? "—") : (o.driver?.licensePlate ?? "—");
    return `<tr>
      <td>#${o.id}</td>
      <td>${format(new Date(o.createdAt), "MM/dd HH:mm")}</td>
      <td>${groupVal}</td>
      <td>${o.cargoDescription ?? ""}</td>
      <td>${(o.pickupAddress ?? "").slice(0, 15)}</td>
      <td>${(o.deliveryAddress ?? "").slice(0, 15)}</td>
      <td>${o.driver?.name ?? "—"}</td>
      <td style="text-align:right">${o.cargoWeight ?? "—"}</td>
      <td style="text-align:right">${o.cargoQuantity ?? "—"}</td>
      <td style="text-align:right">${Math.round(dist)}</td>
      <td style="text-align:right">${revenue > 0 ? nt(revenue) : "—"}</td>
      <td style="text-align:right">${nt(cost)}</td>
      <td style="text-align:right" class="${profit >= 0 ? "green" : "red"}">${revenue > 0 ? (profit >= 0 ? "+" : "") + nt(profit) : "—"}</td>
      <td>${o.status}</td>
    </tr>`;
  }).join("");
  const totRev = sorted.reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const totCost = sorted.reduce((s, o) => s + calcOrderCost(o).cost, 0);
  const totProfit = sorted.reduce((s, o) => s + calcOrderCost(o).profit, 0);
  return `<table><thead><tr>
    <th>單號</th><th>日期時間</th><th>${groupLabel}</th><th>貨物</th><th>起址</th><th>訖址</th>
    <th>司機</th><th>重量kg</th><th>件數</th><th>里程km</th><th>營收</th><th>成本</th><th>毛利</th><th>狀態</th>
  </tr></thead><tbody>${trs}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="10">合計 ${sorted.length} 筆</td>
    <td style="text-align:right">${nt(totRev)}</td>
    <td style="text-align:right">${nt(totCost)}</td>
    <td style="text-align:right" class="${totProfit >= 0 ? "green" : "red"}">${totProfit >= 0 ? "+" : ""}${nt(totProfit)}</td>
    <td></td>
  </tr></tfoot></table>`;
}

// ─── Excel export ──────────────────────────────────────────────────────────────
function exportExcel(title: string, rows: SummaryRow[], summaryLabel: string, orders: Order[], groupLabel: string, dateRange: string) {
  const wb = XLSX.utils.book_new();
  const totals = sumRows(rows);
  const meta = [`${COMPANY} — ${title}`, `日期區間：${dateRange || "全部"}`, `匯出時間：${format(new Date(), "yyyy/MM/dd HH:mm")}`, ""];

  // Sheet 1: 總表
  const summaryData = [
    ...meta.map(m => [m]),
    [summaryLabel, "趟次", "件數", "里程km", "營收(NT$)", "成本(NT$)", "毛利(NT$)", "毛利率", "平均單價(NT$)"],
    ...rows.map(r => [
      r.label + (r.sub ? ` (${r.sub})` : ""),
      r.trips, r.items, Math.round(r.distKm),
      Math.round(r.revenue), Math.round(r.cost), Math.round(r.profit),
      r.revenue > 0 ? `${Math.round((r.profit / r.revenue) * 100)}%` : "—",
      r.trips > 0 ? Math.round(r.revenue / r.trips) : "—",
    ]),
    ["合計", totals.trips, totals.items, Math.round(totals.distKm), Math.round(totals.revenue), Math.round(totals.cost), Math.round(totals.profit),
      totals.revenue > 0 ? `${Math.round((totals.profit / totals.revenue) * 100)}%` : "—",
      totals.trips > 0 ? Math.round(totals.revenue / totals.trips) : "—"],
    [],
    [`★ 排名（依營收）`],
    [summaryLabel, "營收(NT$)", "趟次", "毛利(NT$)"],
    ...[...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((r, i) => [
      `${i + 1}. ${r.label}`, Math.round(r.revenue), r.trips, Math.round(r.profit),
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1["!cols"] = [{ wch: 22 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, "總表");

  // Sheet 2: 明細表
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const detailData = [
    ...meta.map(m => [m]),
    ["單號", "日期時間", groupLabel, "貨物描述", "起址", "訖址", "司機", "重量kg", "件數", "里程km", "營收(NT$)", "成本(NT$)", "毛利(NT$)", "狀態"],
    ...sorted.map(o => {
      const { revenue, cost, profit, dist } = calcOrderCost(o);
      const gv = groupLabel === "客戶" ? o.customerName : groupLabel === "司機" ? (o.driver?.name ?? "—") : (o.driver?.licensePlate ?? "—");
      return [`#${o.id}`, format(new Date(o.createdAt), "yyyy/MM/dd HH:mm"), gv,
        o.cargoDescription ?? "", o.pickupAddress ?? "", o.deliveryAddress ?? "",
        o.driver?.name ?? "—", o.cargoWeight ?? "", o.cargoQuantity ?? "",
        Math.round(dist), Math.round(revenue), Math.round(cost), Math.round(profit), o.status];
    }),
    ["合計", "", "", "", "", "", "", "", "", "",
      Math.round(sorted.reduce((s, o) => s + (o.totalFee ?? 0), 0)),
      Math.round(sorted.reduce((s, o) => s + calcOrderCost(o).cost, 0)),
      Math.round(sorted.reduce((s, o) => s + calcOrderCost(o).profit, 0)), ""],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detailData);
  ws2["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "明細表");

  XLSX.writeFile(wb, `${title}_${format(new Date(), "yyyyMMdd")}.xlsx`);
}

// ─── Per-report panel ─────────────────────────────────────────────────────────
function ReportPanel({
  rows, title, summaryLabel, groupLabel, dateRange, rankBy,
}: {
  rows: SummaryRow[]; title: string; summaryLabel: string; groupLabel: string; dateRange: string;
  rankBy: "revenue" | "trips" | "profit";
}) {
  const [view, setView] = useState<"summary" | "detail">("summary");
  const allOrders = useMemo(() => rows.flatMap(r => r.orders), [rows]);

  const handlePrint = () => {
    printHTML(title, dateRange,
      buildSummaryHTML(rows, summaryLabel),
      buildDetailHTML(allOrders, groupLabel));
  };
  const handleExcel = () => exportExcel(title, rows, summaryLabel, allOrders, groupLabel, dateRange);

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{rows.length} 個群組 · {allOrders.length} 筆訂單</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5" /> 列印
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleExcel}>
            <Download className="w-3.5 h-3.5" /> Excel
          </Button>
        </div>
      </div>

      {/* Ranking */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
          {rankBy === "revenue" ? "營收排名" : rankBy === "trips" ? "趟次排名" : "毛利排名"} Top 3
        </p>
        <RankingSection rows={rows} valueLabel={rankBy} />
      </div>

      {/* Summary / Detail toggle */}
      <div className="flex border rounded-lg overflow-hidden w-fit">
        <button
          className={`px-4 py-1.5 text-xs font-semibold transition-colors ${view === "summary" ? "bg-primary text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}
          onClick={() => setView("summary")}
        >總表</button>
        <button
          className={`px-4 py-1.5 text-xs font-semibold transition-colors ${view === "detail" ? "bg-primary text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}
          onClick={() => setView("detail")}
        >明細表</button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {view === "summary"
          ? <SummaryTable rows={rows} title={summaryLabel} />
          : <DetailTable orders={allOrders} groupLabel={groupLabel} />}
      </Card>
    </div>
  );
}

// ─── Build rows helpers ─────────────────────────────────────────────────────────
function buildCustomerRows(orders: Order[]): SummaryRow[] {
  const by: Record<string, Order[]> = {};
  for (const o of orders) {
    const k = `${o.customerName}|${o.customerPhone}`;
    if (!by[k]) by[k] = [];
    by[k].push(o);
  }
  return Object.entries(by).map(([k, os]) => {
    const [name, phone] = k.split("|");
    const t = os.reduce((a, o) => { const c = calcOrderCost(o); return { revenue: a.revenue + c.revenue, cost: a.cost + c.cost, profit: a.profit + c.profit, dist: a.dist + c.dist }; }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
    return { key: k, label: name, sub: phone, trips: os.length, revenue: t.revenue, cost: t.cost, profit: t.profit, distKm: t.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
  }).sort((a, b) => b.revenue - a.revenue);
}

function buildVehicleRows(orders: Order[], drivers: any[]): SummaryRow[] {
  const by: Record<string, Order[]> = {};
  for (const o of orders) {
    const d = drivers.find(dd => dd.id === o.driverId);
    const k = d?.licensePlate ?? "未指派";
    if (!by[k]) by[k] = [];
    by[k].push(o);
  }
  return Object.entries(by).map(([k, os]) => {
    const d = drivers.find(dd => dd.licensePlate === k);
    const t = os.reduce((a, o) => { const c = calcOrderCost(o); return { revenue: a.revenue + c.revenue, cost: a.cost + c.cost, profit: a.profit + c.profit, dist: a.dist + c.dist }; }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
    return { key: k, label: k, sub: d?.vehicleType ?? os[0]?.requiredVehicleType ?? "", trips: os.length, revenue: t.revenue, cost: t.cost, profit: t.profit, distKm: t.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
  }).sort((a, b) => b.revenue - a.revenue);
}

function buildDriverRows(orders: Order[], drivers: any[]): SummaryRow[] {
  const by: Record<string, Order[]> = {};
  for (const o of orders) {
    const k = o.driverId ? `${o.driverId}` : "未指派";
    if (!by[k]) by[k] = [];
    by[k].push(o);
  }
  return Object.entries(by).map(([k, os]) => {
    const d = drivers.find(dd => `${dd.id}` === k);
    const t = os.reduce((a, o) => { const c = calcOrderCost(o); return { revenue: a.revenue + c.revenue, cost: a.cost + c.cost, profit: a.profit + c.profit, dist: a.dist + c.dist }; }, { revenue: 0, cost: 0, profit: 0, dist: 0 });
    return { key: k, label: d?.name ?? "未指派", sub: d ? `${d.vehicleType} · ${d.phone}` : "", trips: os.length, revenue: t.revenue, cost: t.cost, profit: t.profit, distKm: t.dist, items: os.reduce((s, o) => s + Number(o.cargoQuantity || 1), 0), orders: os };
  }).sort((a, b) => b.revenue - a.revenue);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function ReportCenter() {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  useCustomersData();

  const [filters, setFilters] = useState<Filters>({ dateFrom: "", dateTo: "", keyword: "" });
  const filtered = useMemo(() => filterOrders(orders as Order[], filters), [orders, filters]);
  const dateRange = [filters.dateFrom, filters.dateTo].filter(Boolean).join(" ~ ") || "全部";

  const custRows = useMemo(() => buildCustomerRows(filtered), [filtered]);
  const vehicleRows = useMemo(() => buildVehicleRows(filtered, drivers), [filtered, drivers]);
  const driverRows = useMemo(() => buildDriverRows(filtered, drivers), [filtered, drivers]);

  const totalRevenue = filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const totalProfit = filtered.reduce((s, o) => s + calcOrderCost(o as Order).profit, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-primary flex items-center gap-2">
            <BarChart2 className="w-5 h-5" /> 報表中心
          </h2>
          <p className="text-sm text-muted-foreground">客戶 · 車輛 · 司機三維報表 | 排名 · 總表 · 明細 · Excel · 列印</p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Stat banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "篩選訂單", value: `${filtered.length} 筆` },
          { label: "總營收", value: nt(totalRevenue) },
          { label: "總毛利", value: nt(totalProfit) },
          { label: "平均單價", value: filtered.length > 0 ? nt(totalRevenue / filtered.length) : "—" },
        ].map(s => (
          <Card key={s.label} className="p-3 text-center">
            <div className="text-lg font-black text-primary">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Three-tab report */}
      <Tabs defaultValue="customer">
        <TabsList className="flex w-full h-10 mb-1">
          <TabsTrigger value="customer" className="flex-1 gap-1.5">
            <Users className="w-3.5 h-3.5" /> 客戶報表
          </TabsTrigger>
          <TabsTrigger value="vehicle" className="flex-1 gap-1.5">
            <Truck className="w-3.5 h-3.5" /> 車輛報表
          </TabsTrigger>
          <TabsTrigger value="driver" className="flex-1 gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> 司機報表
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="mt-4">
          <ReportPanel
            rows={custRows} title="客戶報表" summaryLabel="客戶"
            groupLabel="客戶" dateRange={dateRange} rankBy="revenue"
          />
        </TabsContent>
        <TabsContent value="vehicle" className="mt-4">
          <ReportPanel
            rows={vehicleRows} title="車輛報表" summaryLabel="車牌"
            groupLabel="車牌" dateRange={dateRange} rankBy="revenue"
          />
        </TabsContent>
        <TabsContent value="driver" className="mt-4">
          <ReportPanel
            rows={driverRows} title="司機報表" summaryLabel="司機"
            groupLabel="司機" dateRange={dateRange} rankBy="trips"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
