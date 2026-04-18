/**
 * VehicleProfitTab.tsx — 車輛盈虧獲利分析表
 *
 * - 上方：全域參數設定（年度保險費、折舊額、油耗、柴油單價）
 * - 主表：月度車輛營運記錄，自動計算油費、總支出、淨利潤、利潤率
 * - 合計列：整體車隊加總
 * - 新增 / 編輯 / 刪除
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, Settings2, TrendingUp, TrendingDown,
  BarChart2, Fuel, Save, Download, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── 型別 ────────────────────────────────────────────────────────────────────
interface Params {
  annual_insurance:    number;
  annual_depreciation: number;
  fuel_per_km:         number;
  diesel_price:        number;
}

interface Record {
  id:              number;
  report_month:    string;
  vehicle_plate:   string;
  vehicle_type:    string | null;
  tonnage:         number | null;
  vehicle_price:   number | null;
  total_km:        number;
  freight_income:  number;
  toll_fee:        number;
  maintenance_fee: number;
  tire_fee:        number;
  other_expense:   number;
  notes:           string | null;
}

interface Computed {
  fuel_cost:            number;
  insurance_monthly:    number;
  depreciation_monthly: number;
  total_expense:        number;
  net_profit:           number;
  profit_rate:          number;
}

const EMPTY_FORM = {
  vehicle_plate:   "",
  vehicle_type:    "",
  tonnage:         "",
  vehicle_price:   "",
  total_km:        "",
  freight_income:  "",
  toll_fee:        "",
  maintenance_fee: "",
  tire_fee:        "",
  other_expense:   "",
  notes:           "",
};

const DEFAULT_PARAMS: Params = {
  annual_insurance: 120000, annual_depreciation: 240000,
  fuel_per_km: 0.35, diesel_price: 28,
};

// ── 計算公式 ────────────────────────────────────────────────────────────────
function compute(r: Record, p: Params): Computed {
  const fuel_cost            = Number(r.total_km)        * p.fuel_per_km * p.diesel_price;
  const insurance_monthly    = p.annual_insurance    / 12;
  const depreciation_monthly = p.annual_depreciation / 12;
  const total_expense = fuel_cost + Number(r.toll_fee) + Number(r.maintenance_fee) +
                        Number(r.tire_fee) + insurance_monthly + depreciation_monthly +
                        Number(r.other_expense);
  const net_profit   = Number(r.freight_income) - total_expense;
  const profit_rate  = Number(r.freight_income) > 0
    ? Math.round(net_profit / Number(r.freight_income) * 10000) / 100
    : 0;
  return { fuel_cost, insurance_monthly, depreciation_monthly, total_expense, net_profit, profit_rate };
}

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("zh-TW").format(Math.round(n));
}

// ── 月份選擇器 ──────────────────────────────────────────────────────────────
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function VehicleProfitTab() {
  const { toast } = useToast();

  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [paramsDraft, setParamsDraft] = useState<Params>(DEFAULT_PARAMS);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [savingParams, setSavingParams] = useState(false);

  const [month, setMonth] = useState(currentMonth());
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // ── 載入參數 ──────────────────────────────────────────────────────────────
  const loadParams = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/vehicle-profit/params"));
      const d = await r.json();
      if (d.ok && d.params) {
        const p = {
          annual_insurance:    Number(d.params.annual_insurance),
          annual_depreciation: Number(d.params.annual_depreciation),
          fuel_per_km:         Number(d.params.fuel_per_km),
          diesel_price:        Number(d.params.diesel_price),
        };
        setParams(p);
        setParamsDraft(p);
      }
    } catch { /* keep defaults */ }
  }, []);

  // ── 載入月度記錄 ───────────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/vehicle-profit/records?month=${month}`));
      const d = await r.json();
      if (d.ok) setRecords(d.records);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [month, toast]);

  useEffect(() => { loadParams(); }, [loadParams]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── 儲存參數 ──────────────────────────────────────────────────────────────
  async function saveParams() {
    setSavingParams(true);
    try {
      const r = await fetch(apiUrl("/vehicle-profit/params"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paramsDraft),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setParams(paramsDraft);
      setParamsOpen(false);
      toast({ title: "參數已更新" });
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSavingParams(false); }
  }

  // ── 開啟編輯對話框 ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function openEdit(rec: Record) {
    setEditingId(rec.id);
    setForm({
      vehicle_plate:   rec.vehicle_plate,
      vehicle_type:    rec.vehicle_type ?? "",
      tonnage:         rec.tonnage !== null ? String(rec.tonnage) : "",
      vehicle_price:   rec.vehicle_price !== null ? String(rec.vehicle_price) : "",
      total_km:        String(rec.total_km),
      freight_income:  String(rec.freight_income),
      toll_fee:        String(rec.toll_fee),
      maintenance_fee: String(rec.maintenance_fee),
      tire_fee:        String(rec.tire_fee),
      other_expense:   String(rec.other_expense),
      notes:           rec.notes ?? "",
    });
    setDialogOpen(true);
  }

  // ── 儲存記錄 ──────────────────────────────────────────────────────────────
  async function saveRecord() {
    if (!form.vehicle_plate.trim()) {
      toast({ title: "車牌號碼為必填", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        report_month:    month,
        vehicle_plate:   form.vehicle_plate.trim().toUpperCase(),
        vehicle_type:    form.vehicle_type.trim() || null,
        tonnage:         form.tonnage ? Number(form.tonnage) : null,
        vehicle_price:   form.vehicle_price ? Number(form.vehicle_price) : null,
        total_km:        Number(form.total_km) || 0,
        freight_income:  Number(form.freight_income) || 0,
        toll_fee:        Number(form.toll_fee) || 0,
        maintenance_fee: Number(form.maintenance_fee) || 0,
        tire_fee:        Number(form.tire_fee) || 0,
        other_expense:   Number(form.other_expense) || 0,
        notes:           form.notes.trim() || null,
      };
      const url    = editingId ? apiUrl(`/vehicle-profit/records/${editingId}`) : apiUrl("/vehicle-profit/records");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "儲存失敗");
      toast({ title: editingId ? "更新成功" : "新增成功" });
      setDialogOpen(false);
      loadRecords();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  // ── 刪除 ──────────────────────────────────────────────────────────────────
  async function del(rec: Record) {
    if (!confirm(`確定刪除 ${rec.vehicle_plate} 的 ${month} 記錄？`)) return;
    await fetch(apiUrl(`/vehicle-profit/records/${rec.id}`), { method: "DELETE" });
    toast({ title: "已刪除" });
    loadRecords();
  }

  // ── 計算總計列 ────────────────────────────────────────────────────────────
  const computed = records.map(r => ({ ...r, ...compute(r, params) }));

  const totals = computed.reduce(
    (acc, r) => ({
      total_km:       acc.total_km       + Number(r.total_km),
      freight_income: acc.freight_income + Number(r.freight_income),
      fuel_cost:      acc.fuel_cost      + r.fuel_cost,
      toll_fee:       acc.toll_fee       + Number(r.toll_fee),
      maintenance_fee:acc.maintenance_fee+ Number(r.maintenance_fee),
      tire_fee:       acc.tire_fee       + Number(r.tire_fee),
      insurance_m:    acc.insurance_m    + r.insurance_monthly,
      depreciation_m: acc.depreciation_m + r.depreciation_monthly,
      other_expense:  acc.other_expense  + Number(r.other_expense),
      total_expense:  acc.total_expense  + r.total_expense,
      net_profit:     acc.net_profit     + r.net_profit,
    }),
    { total_km:0, freight_income:0, fuel_cost:0, toll_fee:0, maintenance_fee:0,
      tire_fee:0, insurance_m:0, depreciation_m:0, other_expense:0, total_expense:0, net_profit:0 }
  );
  const totalProfitRate = totals.freight_income > 0
    ? Math.round(totals.net_profit / totals.freight_income * 10000) / 100
    : 0;

  // ── 統計卡片 ──────────────────────────────────────────────────────────────
  const stats = [
    { label: "車輛數",    val: records.length,            unit: "台",  color: "#2563eb", bg: "#eff6ff", icon: <BarChart2 className="w-4 h-4" /> },
    { label: "總運費收入", val: fmtNum(totals.freight_income), unit: "NT$", color: "#059669", bg: "#f0fdf4", icon: <TrendingUp className="w-4 h-4" /> },
    { label: "總淨利潤",   val: fmtNum(totals.net_profit),   unit: "NT$", color: totals.net_profit >= 0 ? "#059669" : "#dc2626", bg: totals.net_profit >= 0 ? "#f0fdf4" : "#fef2f2", icon: totals.net_profit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" /> },
    { label: "整體利潤率",  val: totalProfitRate.toFixed(2), unit: "%",  color: totalProfitRate >= 0 ? "#7c3aed" : "#dc2626", bg: "#faf5ff", icon: <Fuel className="w-4 h-4" /> },
  ];

  // ── 匯出 CSV（對應模板格式）────────────────────────────────────────────────
  function exportCsv() {
    const header = ["車牌號碼","車型","噸數","車價","總里程(km)","運費收入","油費支出","過路費","維修費用","輪胎費用","保險費用","折舊費用","其他支出","總支出","淨利潤","利潤率(%)"];
    const rows = computed.map(r => [
      r.vehicle_plate,
      r.vehicle_type ?? "",
      r.tonnage ?? "",
      r.vehicle_price ?? "",
      Math.round(Number(r.total_km)),
      Math.round(Number(r.freight_income)),
      Math.round(r.fuel_cost),
      Math.round(Number(r.toll_fee)),
      Math.round(Number(r.maintenance_fee)),
      Math.round(Number(r.tire_fee)),
      Math.round(r.insurance_monthly),
      Math.round(r.depreciation_monthly),
      Math.round(Number(r.other_expense)),
      Math.round(r.total_expense),
      Math.round(r.net_profit),
      r.profit_rate.toFixed(2),
    ]);
    // 合計列
    rows.push([
      "合計","","","","",
      Math.round(totals.freight_income),
      Math.round(totals.fuel_cost),
      Math.round(totals.toll_fee),
      Math.round(totals.maintenance_fee),
      Math.round(totals.tire_fee),
      Math.round(totals.insurance_m),
      Math.round(totals.depreciation_m),
      Math.round(totals.other_expense),
      Math.round(totals.total_expense),
      Math.round(totals.net_profit),
      totalProfitRate.toFixed(2),
    ]);
    // 參數列
    rows.push([]);
    rows.push(["參數項目","年度金額"]);
    rows.push(["年度保險費", params.annual_insurance]);
    rows.push(["年度折舊額", params.annual_depreciation]);
    rows.push(["每公里油耗(公升)", params.fuel_per_km]);
    rows.push(["柴油單價", params.diesel_price]);

    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff"+csv], { type:"text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `貨運車輛盈虧分析表_${month}.csv`;
    a.click();
  }

  // ── 列印報表 ────────────────────────────────────────────────────────────────
  function printReport() {
    const rowHtml = computed.map((r, i) => `
      <tr style="background:${i%2===0?"#fff":"#f9fafb"}">
        <td style="padding:5px 8px;font-weight:700;color:#1e40af;font-family:monospace">${r.vehicle_plate}</td>
        <td style="padding:5px 8px">${r.vehicle_type??""}</td>
        <td style="padding:5px 8px;text-align:right">${r.tonnage??""}</td>
        <td style="padding:5px 8px;text-align:right">${r.vehicle_price?Number(r.vehicle_price).toLocaleString():""}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(Number(r.total_km)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#059669;font-weight:600">${Math.round(Number(r.freight_income)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(r.fuel_cost).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(Number(r.toll_fee)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(Number(r.maintenance_fee)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(Number(r.tire_fee)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#6b7280">${Math.round(r.insurance_monthly).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#6b7280">${Math.round(r.depreciation_monthly).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right">${Math.round(Number(r.other_expense)).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#dc2626;font-weight:600">${Math.round(r.total_expense).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:${r.net_profit>=0?"#059669":"#dc2626"};font-weight:700">${r.net_profit>=0?"+":""}${Math.round(r.net_profit).toLocaleString()}</td>
        <td style="padding:5px 8px;text-align:right;color:#7c3aed;font-weight:600">${r.profit_rate.toFixed(2)}%</td>
      </tr>`).join("");

    const html = `<html><head><meta charset="utf-8"><title>貨運車輛盈虧分析表 ${month}</title>
<style>
  body{font-family:sans-serif;padding:20px;font-size:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:#fff;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap}
  th.left{text-align:left}
  td{border-bottom:1px solid #e5e7eb}
  .total-row td{background:#1e3a5f;color:#fff;font-weight:700;padding:6px 8px;text-align:right}
  .total-row td.left{text-align:left;color:#fbbf24}
  .params{margin-top:16px;font-size:11px;color:#6b7280}
  @media print{body{padding:0}}
</style></head><body>
<h2 style="text-align:center;margin:0 0 4px">貨運車輛盈虧分析表</h2>
<p style="text-align:center;color:#888;font-size:11px;margin:0 0 12px">報表月份：${month}　　列印日期：${new Date().toLocaleDateString("zh-TW")}</p>
<table>
  <thead><tr>
    <th class="left">車牌</th><th class="left">車型</th><th>噸</th><th>車價</th>
    <th>里程(km)</th><th>運費收入</th><th>油費</th><th>過路費</th>
    <th>維修費</th><th>輪胎費</th><th>保險(月)</th><th>折舊(月)</th>
    <th>其他</th><th>總支出</th><th>淨利潤</th><th>利潤率</th>
  </tr></thead>
  <tbody>
    ${rowHtml}
    <tr class="total-row">
      <td class="left" colspan="5">合計（${records.length} 輛）</td>
      <td>${Math.round(totals.freight_income).toLocaleString()}</td>
      <td>${Math.round(totals.fuel_cost).toLocaleString()}</td>
      <td>${Math.round(totals.toll_fee).toLocaleString()}</td>
      <td>${Math.round(totals.maintenance_fee).toLocaleString()}</td>
      <td>${Math.round(totals.tire_fee).toLocaleString()}</td>
      <td>${Math.round(totals.insurance_m).toLocaleString()}</td>
      <td>${Math.round(totals.depreciation_m).toLocaleString()}</td>
      <td>${Math.round(totals.other_expense).toLocaleString()}</td>
      <td>${Math.round(totals.total_expense).toLocaleString()}</td>
      <td>${totals.net_profit>=0?"+":""}${Math.round(totals.net_profit).toLocaleString()}</td>
      <td>${totalProfitRate.toFixed(2)}%</td>
    </tr>
  </tbody>
</table>
<div class="params">
  📊 固定成本參數：年度保險費 NT$${params.annual_insurance.toLocaleString()} （月攤 NT$${Math.round(params.annual_insurance/12).toLocaleString()}）　
  年度折舊額 NT$${params.annual_depreciation.toLocaleString()} （月攤 NT$${Math.round(params.annual_depreciation/12).toLocaleString()}）　
  每公里油耗 ${params.fuel_per_km}L／柴油 NT$${params.diesel_price}/L
</div>
</body></html>`;
    const w = window.open("","_blank","width=1100,height=700");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
  }

  const inp = (key: keyof typeof form, label: string, type = "number", placeholder = "0") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} className="h-8 text-sm" placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  // ── 欄寬樣式 ──────────────────────────────────────────────────────────────
  const thS: React.CSSProperties = { background: "#f8fafc", color: "#374151", fontWeight: 600, fontSize: 11, padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "2px solid #e5e7eb" };
  const thL: React.CSSProperties = { ...thS, textAlign: "left" };
  const tdS: React.CSSProperties = { padding: "7px 10px", textAlign: "right", fontSize: 12, whiteSpace: "nowrap" };
  const tdL: React.CSSProperties = { ...tdS, textAlign: "left" };

  return (
    <div className="space-y-4">

      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${s.color}18`, color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div className="text-lg font-bold leading-tight" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs" style={{ color: "#6b7280" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 工具列 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-500" />
              車輛盈虧分析表
              <span className="text-xs font-normal text-gray-400">（月度）</span>
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              {/* 月份選擇 */}
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500 whitespace-nowrap">報表月份</Label>
                <Input
                  type="month"
                  className="h-8 text-sm w-36"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={loadRecords} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="outline" size="sm" className="h-8"
                style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
                onClick={() => setParamsOpen(true)}
              >
                <Settings2 className="w-3.5 h-3.5 mr-1" />固定成本參數
              </Button>
              {computed.length > 0 && (
                <>
                  <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}>
                    <Download className="w-3.5 h-3.5 mr-1" />匯出 CSV
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={printReport}>
                    <Printer className="w-3.5 h-3.5 mr-1" />列印報表
                  </Button>
                </>
              )}
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" />新增車輛
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">載入中…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thL}>車牌</th>
                    <th style={thL}>車型</th>
                    <th style={thS}>噸數</th>
                    <th style={{ ...thS, minWidth: 80 }}>里程(km)</th>
                    <th style={{ ...thS, minWidth: 100, color: "#059669" }}>運費收入</th>
                    <th style={{ ...thS, minWidth: 90 }}>油費</th>
                    <th style={{ ...thS, minWidth: 80 }}>過路費</th>
                    <th style={{ ...thS, minWidth: 80 }}>維修費</th>
                    <th style={{ ...thS, minWidth: 80 }}>輪胎費</th>
                    <th style={{ ...thS, minWidth: 80 }}>保險(月)</th>
                    <th style={{ ...thS, minWidth: 80 }}>折舊(月)</th>
                    <th style={{ ...thS, minWidth: 80 }}>其他</th>
                    <th style={{ ...thS, minWidth: 100, color: "#dc2626" }}>總支出</th>
                    <th style={{ ...thS, minWidth: 100 }}>淨利潤</th>
                    <th style={{ ...thS, minWidth: 70 }}>利潤率</th>
                    <th style={{ ...thS, minWidth: 80 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.length === 0 ? (
                    <tr>
                      <td colSpan={16} style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>
                        本月尚無車輛記錄，點選「新增車輛」開始輸入
                      </td>
                    </tr>
                  ) : computed.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdL}>
                        <span className="font-mono font-semibold" style={{ color: "#1e40af" }}>{r.vehicle_plate}</span>
                      </td>
                      <td style={tdL}>{r.vehicle_type ?? "—"}</td>
                      <td style={tdS}>{r.tonnage != null ? r.tonnage : "—"}</td>
                      <td style={tdS}>{fmtNum(Number(r.total_km))}</td>
                      <td style={{ ...tdS, color: "#059669", fontWeight: 600 }}>{fmtNum(Number(r.freight_income))}</td>
                      <td style={tdS}>{fmtNum(r.fuel_cost)}</td>
                      <td style={tdS}>{fmtNum(Number(r.toll_fee))}</td>
                      <td style={tdS}>{fmtNum(Number(r.maintenance_fee))}</td>
                      <td style={tdS}>{fmtNum(Number(r.tire_fee))}</td>
                      <td style={{ ...tdS, color: "#6b7280", fontSize: 11 }}>{fmtNum(r.insurance_monthly)}</td>
                      <td style={{ ...tdS, color: "#6b7280", fontSize: 11 }}>{fmtNum(r.depreciation_monthly)}</td>
                      <td style={tdS}>{fmtNum(Number(r.other_expense))}</td>
                      <td style={{ ...tdS, color: "#dc2626", fontWeight: 600 }}>{fmtNum(r.total_expense)}</td>
                      <td style={{ ...tdS, color: r.net_profit >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                        {r.net_profit >= 0 ? "+" : ""}{fmtNum(r.net_profit)}
                      </td>
                      <td style={{ ...tdS, color: r.profit_rate >= 0 ? "#7c3aed" : "#dc2626", fontWeight: 600 }}>
                        {r.profit_rate.toFixed(2)}%
                      </td>
                      <td style={tdS}>
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-blue-50 text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => del(r)} className="p-1 rounded hover:bg-red-50 text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* 合計列 */}
                  {computed.length > 0 && (
                    <tr style={{ background: "#1e3a5f", color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...tdL, color: "#fbbf24" }} colSpan={4}>合計（{records.length} 輛）</td>
                      <td style={{ ...tdS, color: "#6ee7b7" }}>{fmtNum(totals.freight_income)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmtNum(totals.fuel_cost)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmtNum(totals.toll_fee)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmtNum(totals.maintenance_fee)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmtNum(totals.tire_fee)}</td>
                      <td style={{ ...tdS, color: "#94a3b8", fontSize: 11 }}>{fmtNum(totals.insurance_m)}</td>
                      <td style={{ ...tdS, color: "#94a3b8", fontSize: 11 }}>{fmtNum(totals.depreciation_m)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmtNum(totals.other_expense)}</td>
                      <td style={{ ...tdS, color: "#f87171" }}>{fmtNum(totals.total_expense)}</td>
                      <td style={{ ...tdS, color: totals.net_profit >= 0 ? "#34d399" : "#f87171" }}>
                        {totals.net_profit >= 0 ? "+" : ""}{fmtNum(totals.net_profit)}
                      </td>
                      <td style={{ ...tdS, color: "#c4b5fd" }}>{totalProfitRate.toFixed(2)}%</td>
                      <td style={tdS} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 底部公式說明 */}
          <div className="px-4 py-2 border-t" style={{ background: "#f8fafc", fontSize: 11, color: "#6b7280" }}>
            <span style={{ marginRight: 16 }}>🔢 <b>油費</b> = 總里程 × {params.fuel_per_km}L/km × NT${params.diesel_price}/L</span>
            <span style={{ marginRight: 16 }}>🛡 <b>月保險</b> = NT${fmtNum(params.annual_insurance)}/12</span>
            <span>📉 <b>月折舊</b> = NT${fmtNum(params.annual_depreciation)}/12</span>
          </div>
        </CardContent>
      </Card>

      {/* ── 固定成本參數 Dialog ── */}
      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-violet-500" />固定成本參數設定
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">年度保險費（NT$）</Label>
                <Input type="number" className="h-8 text-sm"
                  value={paramsDraft.annual_insurance}
                  onChange={e => setParamsDraft(p => ({ ...p, annual_insurance: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400">月攤：{fmt(paramsDraft.annual_insurance / 12)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">年度折舊額（NT$）</Label>
                <Input type="number" className="h-8 text-sm"
                  value={paramsDraft.annual_depreciation}
                  onChange={e => setParamsDraft(p => ({ ...p, annual_depreciation: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400">月攤：{fmt(paramsDraft.annual_depreciation / 12)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">每公里油耗（公升/km）</Label>
                <Input type="number" step="0.01" className="h-8 text-sm"
                  value={paramsDraft.fuel_per_km}
                  onChange={e => setParamsDraft(p => ({ ...p, fuel_per_km: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">柴油單價（NT$/公升）</Label>
                <Input type="number" step="0.1" className="h-8 text-sm"
                  value={paramsDraft.diesel_price}
                  onChange={e => setParamsDraft(p => ({ ...p, diesel_price: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400">
                  每km油費：{(paramsDraft.fuel_per_km * paramsDraft.diesel_price).toFixed(2)} 元
                </p>
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs" style={{ background: "#faf5ff", border: "1px solid #e9d5ff", color: "#6d28d9" }}>
              💡 保險費與折舊額為全車隊共用參數，按月平均攤提至每台車
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParamsOpen(false)}>取消</Button>
            <Button onClick={saveParams} disabled={savingParams}>
              <Save className="w-3.5 h-3.5 mr-1" />{savingParams ? "儲存中…" : "儲存參數"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 新增 / 編輯車輛記錄 Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯車輛記錄" : "新增車輛記錄"} — {month}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2">
            {inp("vehicle_plate", "車牌號碼 *", "text", "ABC-1234")}
            {inp("vehicle_type", "車型", "text", "曳引車/箱型車/平板車")}
            {inp("tonnage", "噸數", "number", "25")}
            {inp("vehicle_price", "車輛價格（NT$）", "number", "900000")}
            {inp("total_km", "總里程（km）", "number", "5200")}
            <div className="space-y-1 col-span-1" />

            <div className="col-span-3 border-t pt-2">
              <p className="text-xs font-semibold text-gray-500 mb-2">收入</p>
            </div>
            {inp("freight_income", "運費收入（NT$）", "number", "280000")}

            <div className="col-span-3 border-t pt-2">
              <p className="text-xs font-semibold text-gray-500 mb-2">變動支出</p>
            </div>
            {inp("toll_fee", "過路費（NT$）", "number", "4500")}
            {inp("maintenance_fee", "維修費（NT$）", "number", "8000")}
            {inp("tire_fee", "輪胎費（NT$）", "number", "12000")}
            {inp("other_expense", "其他支出（NT$）", "number", "2000")}

            <div className="col-span-3 rounded-lg p-3 text-xs" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
              🔢 <b>油費</b>自動計算：總里程 × {params.fuel_per_km}L/km × NT${params.diesel_price} = <b>{fmtNum(Number(form.total_km || 0) * params.fuel_per_km * params.diesel_price)}</b> 元<br />
              🛡 <b>月保險</b>：{fmt(params.annual_insurance / 12)} &nbsp;&nbsp; 📉 <b>月折舊</b>：{fmt(params.annual_depreciation / 12)}
            </div>

            <div className="col-span-3 space-y-1">
              <Label className="text-xs">備註</Label>
              <Input className="h-8 text-sm" placeholder="如：新車、外包等"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveRecord} disabled={saving}>
              {saving ? "儲存中…" : editingId ? "更新記錄" : "新增記錄"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
