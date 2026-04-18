/**
 * PayrollCostTab.tsx — 司機薪資報酬單 v2
 *
 * 對應「優化版_司機薪資報酬單_直式.xlsx」欄位規格：
 *  輸入：出勤天數、每日趟數、每趟單價 → 總運費
 *         油錢、過路費、保險、保養 → 總支出
 *         薪資模式（固定/抽成）、固定薪資 / 抽成比例%
 *         勞保、健保、借支（固定金額）
 *  計算：司機實領（固定）、司機實領（抽成）、最終實領（依模式）
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, Download, Upload,
  Users, DollarSign, FileText, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── 型別 ────────────────────────────────────────────────────────────────────
interface DriverRecord {
  id:               number;
  report_month:     string;
  driver_name:      string;
  attendance_days:  number;
  daily_trips:      number;
  trip_price:       number;
  toll_fee:         number;
  fuel_cost:        number;
  insurance_fee:    number;
  maintenance_fee:  number;
  pay_mode:         "fixed" | "commission";
  fixed_salary:     number;
  commission_rate:  number;
  labor_ins_fixed:  number;
  health_ins_fixed: number;
  advance_payment:  number;
  notes:            string | null;
}

interface Computed {
  total_freight:      number;   // 出勤 × 趟數 × 單價
  total_expense:      number;   // 油錢+過路費+保險+保養
  take_fixed:         number;   // 固定薪資 - 勞保 - 健保 - 借支
  take_commission:    number;   // 總運費×抽成% - 支出 - 勞保 - 健保 - 借支
  final_take:         number;   // 依模式
}

function computeRow(r: DriverRecord): Computed {
  const total_freight   = Number(r.attendance_days) * Number(r.daily_trips) * Number(r.trip_price);
  const total_expense   = Number(r.toll_fee) + Number(r.fuel_cost) + Number(r.insurance_fee) + Number(r.maintenance_fee);
  const deductions      = Number(r.labor_ins_fixed) + Number(r.health_ins_fixed) + Number(r.advance_payment);
  const take_fixed      = Number(r.fixed_salary) - deductions;
  const take_commission = total_freight * (Number(r.commission_rate) / 100) - total_expense - deductions;
  const final_take      = r.pay_mode === "fixed" ? take_fixed : take_commission;
  return { total_freight, total_expense, take_fixed, take_commission, final_take };
}

// ── 工具 ────────────────────────────────────────────────────────────────────
function fmt(n: number) { return new Intl.NumberFormat("zh-TW").format(Math.round(n)); }
function cur(n: number) { return `NT$${fmt(n)}`; }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_FORM = {
  driver_name:      "",
  attendance_days:  "22",
  daily_trips:      "2",
  trip_price:       "3000",
  toll_fee:         "0",
  fuel_cost:        "0",
  insurance_fee:    "0",
  maintenance_fee:  "0",
  pay_mode:         "fixed" as "fixed" | "commission",
  fixed_salary:     "40000",
  commission_rate:  "80",
  labor_ins_fixed:  "2100",
  health_ins_fixed: "1350",
  advance_payment:  "0",
  notes:            "",
};

// ═══════════════════════════════════════════════════════════════════════════
export default function PayrollCostTab() {
  const { toast } = useToast();
  const [month, setMonth]     = useState(currentMonth());
  const [records, setRecords] = useState<DriverRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // ── 載入 ──────────────────────────────────────────────────────────────────
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(apiUrl(`/payroll-cost/records?month=${month}`)).then(r => r.json());
      if (d.ok) setRecords(d.records);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [month, toast]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── 新增 / 編輯 ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function openEdit(rec: DriverRecord) {
    setEditingId(rec.id);
    setForm({
      driver_name:      rec.driver_name,
      attendance_days:  String(rec.attendance_days),
      daily_trips:      String(rec.daily_trips),
      trip_price:       String(rec.trip_price),
      toll_fee:         String(rec.toll_fee),
      fuel_cost:        String(rec.fuel_cost),
      insurance_fee:    String(rec.insurance_fee),
      maintenance_fee:  String(rec.maintenance_fee),
      pay_mode:         rec.pay_mode ?? "fixed",
      fixed_salary:     String(rec.fixed_salary),
      commission_rate:  String(rec.commission_rate),
      labor_ins_fixed:  String(rec.labor_ins_fixed),
      health_ins_fixed: String(rec.health_ins_fixed),
      advance_payment:  String(rec.advance_payment),
      notes:            rec.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function saveRecord() {
    if (!form.driver_name.trim()) { toast({ title: "司機姓名為必填", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        report_month:     month,
        driver_name:      form.driver_name.trim(),
        attendance_days:  Number(form.attendance_days)  || 0,
        daily_trips:      Number(form.daily_trips)      || 0,
        trip_price:       Number(form.trip_price)       || 0,
        toll_fee:         Number(form.toll_fee)         || 0,
        fuel_cost:        Number(form.fuel_cost)        || 0,
        insurance_fee:    Number(form.insurance_fee)    || 0,
        maintenance_fee:  Number(form.maintenance_fee)  || 0,
        pay_mode:         form.pay_mode,
        fixed_salary:     Number(form.fixed_salary)     || 0,
        commission_rate:  Number(form.commission_rate)  || 80,
        labor_ins_fixed:  Number(form.labor_ins_fixed)  || 0,
        health_ins_fixed: Number(form.health_ins_fixed) || 0,
        advance_payment:  Number(form.advance_payment)  || 0,
        notes:            form.notes.trim() || null,
      };
      const url    = editingId ? apiUrl(`/payroll-cost/records/${editingId}`) : apiUrl("/payroll-cost/records");
      const method = editingId ? "PATCH" : "POST";
      const d = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
      if (!d.ok) throw new Error(d.error);
      toast({ title: editingId ? "更新成功" : "新增成功" });
      setDialogOpen(false); loadRecords();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function del(rec: DriverRecord) {
    if (!confirm(`確定刪除 ${rec.driver_name} 的 ${month} 記錄？`)) return;
    await fetch(apiUrl(`/payroll-cost/records/${rec.id}`), { method: "DELETE" });
    toast({ title: "已刪除" }); loadRecords();
  }

  // ── 匯入 Excel ─────────────────────────────────────────────────────────────
  async function importExcel(file?: File) {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("report_month", month);
      if (file) fd.append("file", file);
      const d = await fetch(apiUrl("/payroll-cost/import-excel"), { method: "POST", body: fd }).then(r => r.json());
      if (d.ok) { toast({ title: `匯入完成：新增 ${d.inserted} 筆` }); loadRecords(); }
      else       { toast({ title: "匯入失敗", description: d.error, variant: "destructive" }); }
    } catch (e: unknown) { toast({ title: "匯入失敗", description: String(e), variant: "destructive" }); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  // ── CSV 匯出 ────────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["司機姓名","出勤天數","每日趟數","每趟單價","總運費",
                    "油錢","過路費","保險","保養","總支出",
                    "薪資模式","固定薪資","抽成比例%",
                    "勞保","健保","借支",
                    "實領（固定）","實領（抽成）","最終實領"];
    const rows = computed.map(r => {
      const c = r.computed;
      return [r.driver_name, r.attendance_days, r.daily_trips, r.trip_price, c.total_freight,
              r.fuel_cost, r.toll_fee, r.insurance_fee, r.maintenance_fee, c.total_expense,
              r.pay_mode === "fixed" ? "固定" : "抽成", r.fixed_salary, r.commission_rate,
              r.labor_ins_fixed, r.health_ins_fixed, r.advance_payment,
              c.take_fixed, c.take_commission, c.final_take];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `司機薪資報酬單_${month}.csv`; a.click();
  }

  // ── 列印單張薪資單 ─────────────────────────────────────────────────────────
  function printSlip(rec: DriverRecord) {
    const c = computeRow(rec);
    const html = `
<html><head><meta charset="utf-8"><title>薪資單</title>
<style>body{font-family:sans-serif;padding:24px;max-width:400px;margin:auto}
h2{text-align:center;margin-bottom:4px}p.sub{text-align:center;color:#666;margin:0 0 16px}
table{width:100%;border-collapse:collapse}td{padding:6px 10px;border-bottom:1px solid #eee;font-size:14px}
.label{color:#555;width:50%}.val{text-align:right;font-weight:600}
.total{background:#f0fdf4;font-weight:bold;font-size:16px}.sig{margin-top:32px;border-top:1px solid #ccc;padding-top:8px;color:#777;font-size:12px}
</style></head><body>
<h2>富詠運輸</h2><p class="sub">司機薪資報酬單 ${month}</p>
<table>
<tr><td class="label">司機姓名</td><td class="val">${rec.driver_name}</td></tr>
<tr><td class="label">發放日期</td><td class="val">${month}</td></tr>
<tr><td class="label">出勤天數</td><td class="val">${rec.attendance_days} 天</td></tr>
<tr><td class="label">每日趟數 × 每趟單價</td><td class="val">${rec.daily_trips} 趟 × NT$${fmt(Number(rec.trip_price))}</td></tr>
<tr><td class="label">總運費</td><td class="val">NT$${fmt(c.total_freight)}</td></tr>
<tr><td colspan="2" style="padding:4px;font-size:11px;color:#888;background:#f8fafc">━ 支出 ━</td></tr>
<tr><td class="label">油錢</td><td class="val">NT$${fmt(Number(rec.fuel_cost))}</td></tr>
<tr><td class="label">過路費</td><td class="val">NT$${fmt(Number(rec.toll_fee))}</td></tr>
<tr><td class="label">保險</td><td class="val">NT$${fmt(Number(rec.insurance_fee))}</td></tr>
<tr><td class="label">保養</td><td class="val">NT$${fmt(Number(rec.maintenance_fee))}</td></tr>
<tr><td class="label">總支出</td><td class="val">NT$${fmt(c.total_expense)}</td></tr>
<tr><td colspan="2" style="padding:4px;font-size:11px;color:#888;background:#f8fafc">━ 薪資 ━</td></tr>
<tr><td class="label">薪資模式</td><td class="val">${rec.pay_mode === "fixed" ? "固定薪資" : "抽成制"}</td></tr>
${rec.pay_mode === "fixed"
  ? `<tr><td class="label">固定薪資</td><td class="val">NT$${fmt(Number(rec.fixed_salary))}</td></tr>`
  : `<tr><td class="label">抽成比例</td><td class="val">${rec.commission_rate}%</td></tr>`}
<tr><td class="label">勞保</td><td class="val">NT$${fmt(Number(rec.labor_ins_fixed))}</td></tr>
<tr><td class="label">健保</td><td class="val">NT$${fmt(Number(rec.health_ins_fixed))}</td></tr>
<tr><td class="label">借支</td><td class="val">NT$${fmt(Number(rec.advance_payment))}</td></tr>
<tr class="total"><td>實領（固定）</td><td class="val" style="color:#059669">NT$${fmt(c.take_fixed)}</td></tr>
<tr class="total"><td>實領（抽成）</td><td class="val" style="color:#7c3aed">NT$${fmt(c.take_commission)}</td></tr>
<tr style="background:#0f172a"><td style="color:#fbbf24;font-weight:bold;padding:10px">最終實領（${rec.pay_mode === "fixed" ? "固定" : "抽成"}）</td>
<td class="val" style="color:#6ee7b7;font-size:18px">NT$${fmt(c.final_take)}</td></tr>
</table>
<div class="sig">司機簽名：___________________&nbsp;&nbsp;&nbsp;日期：___________</div>
</body></html>`;
    const w = window.open("", "_blank", "width=480,height=700");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => { w.print(); }, 400);
  }

  // ── 計算彙總 ────────────────────────────────────────────────────────────────
  const computed = records.map(r => ({ ...r, computed: computeRow(r) }));
  const totalDrivers      = records.length;
  const totalFinalTake    = computed.reduce((s, r) => s + r.computed.final_take,    0);
  const totalFreight      = computed.reduce((s, r) => s + r.computed.total_freight, 0);
  const totalExpense      = computed.reduce((s, r) => s + r.computed.total_expense, 0);

  // ── 表單即時預覽 ─────────────────────────────────────────────────────────────
  const previewRec: DriverRecord = {
    id: 0, report_month: month, driver_name: "", notes: null,
    attendance_days: Number(form.attendance_days)  || 0,
    daily_trips:     Number(form.daily_trips)      || 0,
    trip_price:      Number(form.trip_price)       || 0,
    toll_fee:        Number(form.toll_fee)         || 0,
    fuel_cost:       Number(form.fuel_cost)        || 0,
    insurance_fee:   Number(form.insurance_fee)    || 0,
    maintenance_fee: Number(form.maintenance_fee)  || 0,
    pay_mode:        form.pay_mode,
    fixed_salary:    Number(form.fixed_salary)     || 0,
    commission_rate: Number(form.commission_rate)  || 0,
    labor_ins_fixed: Number(form.labor_ins_fixed)  || 0,
    health_ins_fixed:Number(form.health_ins_fixed) || 0,
    advance_payment: Number(form.advance_payment)  || 0,
  };
  const preview = computeRow(previewRec);

  // ── 樣式 ────────────────────────────────────────────────────────────────────
  const thS: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#374151",
    padding: "7px 8px", textAlign: "right",
    background: "#f1f5f9", borderBottom: "2px solid #e2e8f0",
    whiteSpace: "nowrap",
  };
  const thL: React.CSSProperties = { ...thS, textAlign: "left" };
  const tdS: React.CSSProperties = { fontSize: 12, padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #f3f4f6" };
  const tdL: React.CSSProperties = { ...tdS, textAlign: "left" };

  function F(key: keyof typeof form, label: string, type = "number", ph = "0") {
    return (
      <div className="space-y-0.5">
        <Label className="text-xs text-gray-600">{label}</Label>
        <Input type={type} className="h-8 text-sm" placeholder={ph}
          value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-4 h-4" />,    color: "#2563eb", bg: "#eff6ff", val: totalDrivers,              label: "司機人數" },
          { icon: <FileText className="w-4 h-4" />,  color: "#059669", bg: "#f0fdf4", val: cur(totalFreight),         label: "總運費" },
          { icon: <DollarSign className="w-4 h-4" />,color: "#dc2626", bg: "#fef2f2", val: cur(totalExpense),         label: "總支出" },
          { icon: <DollarSign className="w-4 h-4" />,color: "#7c3aed", bg: "#faf5ff", val: cur(totalFinalTake),       label: "合計實領" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
            <div>
              <div className="text-sm font-bold leading-tight" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 工具列 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-500" />
              司機薪資報酬單
              <span className="text-xs font-normal text-gray-400">（月度批次）</span>
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">月份</Label>
                <Input type="month" className="h-8 text-sm w-36"
                  value={month} onChange={e => setMonth(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={loadRecords} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); }} />
              <Button variant="outline" size="sm" className="h-8"
                style={{ borderColor: "#16a34a", color: "#16a34a" }}
                onClick={() => fileInputRef.current?.click()} disabled={importing}>
                <Upload className="w-3.5 h-3.5 mr-1" />{importing ? "匯入中…" : "匯入 Excel"}
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={exportCsv} disabled={!records.length}>
                <Download className="w-3.5 h-3.5 mr-1" />匯出 CSV
              </Button>
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" />新增司機
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">載入中…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thL, borderTop: "3px solid #3b82f6" }}>司機</th>
                    {/* 出勤趟次 */}
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>出勤<br/>天數</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>每日<br/>趟數</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>每趟<br/>單價</th>
                    <th style={{ ...thS, borderTop: "3px solid #10b981", color: "#065f46" }}>總運費</th>
                    {/* 支出 */}
                    <th style={{ ...thS, borderTop: "3px solid #f59e0b" }}>油錢</th>
                    <th style={{ ...thS, borderTop: "3px solid #f59e0b" }}>過路費</th>
                    <th style={{ ...thS, borderTop: "3px solid #f59e0b" }}>保險</th>
                    <th style={{ ...thS, borderTop: "3px solid #f59e0b" }}>保養</th>
                    <th style={{ ...thS, borderTop: "3px solid #dc2626", color: "#dc2626" }}>總支出</th>
                    {/* 薪資 */}
                    <th style={{ ...thS, borderTop: "3px solid #7c3aed" }}>薪資<br/>模式</th>
                    <th style={{ ...thS, borderTop: "3px solid #7c3aed" }}>固定薪/<br/>抽成%</th>
                    <th style={{ ...thS, borderTop: "3px solid #6b7280" }}>勞保</th>
                    <th style={{ ...thS, borderTop: "3px solid #6b7280" }}>健保</th>
                    <th style={{ ...thS, borderTop: "3px solid #6b7280" }}>借支</th>
                    {/* 結果 */}
                    <th style={{ ...thS, borderTop: "3px solid #059669", color: "#065f46" }}>實領<br/>（固定）</th>
                    <th style={{ ...thS, borderTop: "3px solid #7c3aed", color: "#7c3aed" }}>實領<br/>（抽成）</th>
                    <th style={{ ...thS, borderTop: "3px solid #0f172a", color: "#0f172a" }}>最終<br/>實領</th>
                    <th style={{ ...thS, borderTop: "3px solid #6b7280" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.length === 0 ? (
                    <tr><td colSpan={19} style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                      尚無資料，點選「新增司機」或「匯入 Excel」
                    </td></tr>
                  ) : computed.map((r, i) => {
                    const c = r.computed;
                    return (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                        <td style={{ ...tdL, fontWeight: 600 }}>{r.driver_name}</td>
                        <td style={tdS}>{r.attendance_days}</td>
                        <td style={tdS}>{r.daily_trips}</td>
                        <td style={tdS}>{fmt(Number(r.trip_price))}</td>
                        <td style={{ ...tdS, color: "#059669", fontWeight: 600 }}>{fmt(c.total_freight)}</td>
                        <td style={{ ...tdS, color: "#b45309" }}>{fmt(Number(r.fuel_cost))}</td>
                        <td style={{ ...tdS, color: "#b45309" }}>{fmt(Number(r.toll_fee))}</td>
                        <td style={{ ...tdS, color: "#b45309" }}>{fmt(Number(r.insurance_fee))}</td>
                        <td style={{ ...tdS, color: "#b45309" }}>{fmt(Number(r.maintenance_fee))}</td>
                        <td style={{ ...tdS, color: "#dc2626", fontWeight: 600 }}>{fmt(c.total_expense)}</td>
                        <td style={{ ...tdS, color: r.pay_mode === "fixed" ? "#2563eb" : "#7c3aed" }}>
                          {r.pay_mode === "fixed" ? "固定" : "抽成"}
                        </td>
                        <td style={tdS}>
                          {r.pay_mode === "fixed" ? fmt(Number(r.fixed_salary)) : `${r.commission_rate}%`}
                        </td>
                        <td style={tdS}>{fmt(Number(r.labor_ins_fixed))}</td>
                        <td style={tdS}>{fmt(Number(r.health_ins_fixed))}</td>
                        <td style={tdS}>{fmt(Number(r.advance_payment))}</td>
                        <td style={{ ...tdS, color: "#059669" }}>{fmt(c.take_fixed)}</td>
                        <td style={{ ...tdS, color: "#7c3aed" }}>{fmt(c.take_commission)}</td>
                        <td style={{ ...tdS, fontWeight: 700, fontSize: 13, color: c.final_take >= 0 ? "#0f172a" : "#dc2626" }}>
                          {fmt(c.final_take)}
                        </td>
                        <td style={tdS}>
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => printSlip(r)} title="列印薪資單"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openEdit(r)}
                              className="p-1 rounded hover:bg-blue-50 text-blue-500">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => del(r)}
                              className="p-1 rounded hover:bg-red-50 text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* 合計列 */}
                  {computed.length > 0 && (
                    <tr style={{ background: "#0f172a", color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...tdL, color: "#fbbf24" }}>合計（{totalDrivers}人）</td>
                      <td colSpan={3} style={tdS} />
                      <td style={{ ...tdS, color: "#6ee7b7" }}>{fmt(totalFreight)}</td>
                      <td colSpan={4} style={tdS} />
                      <td style={{ ...tdS, color: "#f87171" }}>{fmt(totalExpense)}</td>
                      <td colSpan={6} style={tdS} />
                      <td style={{ ...tdS, color: "#a7f3d0" }}>{fmt(computed.reduce((s,r)=>s+r.computed.take_fixed,0))}</td>
                      <td style={{ ...tdS, color: "#c4b5fd" }}>{fmt(computed.reduce((s,r)=>s+r.computed.take_commission,0))}</td>
                      <td style={{ ...tdS, color: "#fbbf24", fontSize: 13 }}>{fmt(totalFinalTake)}</td>
                      <td style={tdS} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 欄位說明 */}
          <div className="px-4 py-2 border-t text-xs flex flex-wrap gap-4" style={{ background: "#f8fafc", color: "#6b7280" }}>
            <span>🔵 <b>藍色</b> = 出勤趟次輸入</span>
            <span>🟡 <b>黃色</b> = 支出輸入</span>
            <span>🟢 <b>綠色</b> = 固定實領</span>
            <span>🟣 <b>紫色</b> = 抽成實領</span>
            <span>⚫ <b>黑底</b> = 最終實領（依薪資模式）</span>
          </div>
        </CardContent>
      </Card>

      {/* ════════════════ 新增/編輯 Dialog ════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯司機薪資" : "新增司機薪資"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* ── 司機姓名 ── */}
            <div className="space-y-0.5">
              <Label className="text-xs text-gray-600">司機姓名 *</Label>
              <Input className="h-8 text-sm" placeholder="張三"
                value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} />
            </div>

            {/* ── 出勤趟次 ── */}
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <div className="text-xs font-bold text-blue-700">📋 出勤趟次</div>
              <div className="grid grid-cols-3 gap-3">
                {F("attendance_days", "出勤天數", "number", "22")}
                {F("daily_trips", "每日趟數", "number", "2")}
                {F("trip_price", "每趟單價", "number", "3000")}
              </div>
              <div className="text-xs text-blue-600 font-medium">
                總運費 = {fmt(preview.total_freight)} 元
              </div>
            </div>

            {/* ── 支出 ── */}
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div className="text-xs font-bold text-amber-700">💸 支出明細</div>
              <div className="grid grid-cols-4 gap-3">
                {F("fuel_cost",        "油錢",  "number", "0")}
                {F("toll_fee",         "過路費", "number", "0")}
                {F("insurance_fee",    "保險",  "number", "0")}
                {F("maintenance_fee",  "保養",  "number", "0")}
              </div>
              <div className="text-xs text-amber-700 font-medium">
                總支出 = {fmt(preview.total_expense)} 元
              </div>
            </div>

            {/* ── 薪資模式 ── */}
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#faf5ff", border: "1px solid #e9d5ff" }}>
              <div className="text-xs font-bold text-purple-700">💼 薪資模式</div>
              <div className="flex gap-3">
                {(["fixed", "commission"] as const).map(m => (
                  <label key={m} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="radio" name="pay_mode" value={m}
                      checked={form.pay_mode === m}
                      onChange={() => setForm(f => ({ ...f, pay_mode: m }))} />
                    {m === "fixed" ? "🔵 固定薪資" : "🟣 抽成制"}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {F("fixed_salary",    "固定薪資",    "number", "40000")}
                {F("commission_rate", "抽成比例（%）", "number", "80")}
              </div>
            </div>

            {/* ── 勞健保 / 借支 ── */}
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div className="text-xs font-bold text-green-700">🏦 勞健保 / 借支（固定金額）</div>
              <div className="grid grid-cols-3 gap-3">
                {F("labor_ins_fixed",  "勞保", "number", "2100")}
                {F("health_ins_fixed", "健保", "number", "1350")}
                {F("advance_payment",  "借支", "number", "0")}
              </div>
            </div>

            {/* ── 即時預覽 ── */}
            <div className="rounded-lg overflow-hidden border">
              <div className="px-3 py-2 text-xs font-bold" style={{ background: "#0f172a", color: "#fbbf24" }}>
                📊 即時計算預覽
              </div>
              <div className="grid grid-cols-3 divide-x">
                {[
                  { label: "實領（固定）", val: preview.take_fixed, color: "#059669" },
                  { label: "實領（抽成）", val: preview.take_commission, color: "#7c3aed" },
                  { label: `最終實領（${form.pay_mode === "fixed" ? "固定" : "抽成"}）`, val: preview.final_take, color: "#0f172a" },
                ].map(p => (
                  <div key={p.label} className="px-4 py-3 text-center" style={{ background: "#f8fafc" }}>
                    <div className="text-xs text-gray-500 mb-1">{p.label}</div>
                    <div className="text-lg font-bold" style={{ color: p.color }}>
                      {fmt(p.val)}
                    </div>
                    <div className="text-xs text-gray-400">元</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 備注 */}
            <div className="space-y-0.5">
              <Label className="text-xs text-gray-600">備注</Label>
              <Input className="h-8 text-sm" placeholder="（選填）"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveRecord} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
