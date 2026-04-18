/**
 * PayrollCostTab.tsx — 貨運自動化薪資成本結算表
 *
 * 欄位對應原始 Excel：
 * 輸入：司機姓名、出勤天數、日薪、運費收入、過路費、柴油費、其他費用、發票稅%
 * 系統計算：基本薪資、勞保費(7%)、健保費(4.5%)、稅額、總成本、淨利潤
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, Download, Upload,
  TrendingUp, TrendingDown, Settings2, Users, DollarSign, Save,
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
  labor_ins_rate:  number;
  health_ins_rate: number;
}

interface Record {
  id:               number;
  report_month:     string;
  driver_name:      string;
  attendance_days:  number;
  daily_wage:       number;
  freight_income:   number;
  toll_fee:         number;
  diesel_fee:       number;
  other_fee:        number;
  invoice_tax_rate: number;
  notes:            string | null;
}

interface Computed {
  basic_salary:  number;
  labor_ins:     number;
  health_ins:    number;
  tax_amount:    number;
  total_cost:    number;
  net_profit:    number;
}

const EMPTY_FORM = {
  driver_name:      "",
  attendance_days:  "",
  daily_wage:       "",
  freight_income:   "",
  toll_fee:         "",
  diesel_fee:       "",
  other_fee:        "",
  invoice_tax_rate: "0",
  notes:            "",
};

const DEFAULT_PARAMS: Params = { labor_ins_rate: 0.07, health_ins_rate: 0.045 };

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function compute(r: Record, p: Params): Computed {
  const basic_salary = Number(r.attendance_days) * Number(r.daily_wage);
  const labor_ins    = Math.round(basic_salary * p.labor_ins_rate);
  const health_ins   = Math.round(basic_salary * p.health_ins_rate);
  const tax_amount   = Math.round(Number(r.freight_income) * Number(r.invoice_tax_rate) / 100);
  const total_cost   = basic_salary + labor_ins + health_ins +
                       Number(r.toll_fee) + Number(r.diesel_fee) +
                       Number(r.other_fee) + tax_amount;
  const net_profit   = Number(r.freight_income) - total_cost;
  return { basic_salary, labor_ins, health_ins, tax_amount, total_cost, net_profit };
}

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW").format(Math.round(n));
}
function fmtCurrency(n: number) {
  return `NT$${fmt(n)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function PayrollCostTab() {
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

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 載入 ──────────────────────────────────────────────────────────────────
  const loadParams = useCallback(async () => {
    try {
      const r = await fetch(apiUrl("/payroll-cost/params"));
      const d = await r.json();
      if (d.ok && d.params) {
        const p = { labor_ins_rate: Number(d.params.labor_ins_rate), health_ins_rate: Number(d.params.health_ins_rate) };
        setParams(p); setParamsDraft(p);
      }
    } catch {}
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/payroll-cost/records?month=${month}`));
      const d = await r.json();
      if (d.ok) setRecords(d.records);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [month, toast]);

  useEffect(() => { loadParams(); }, [loadParams]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── 參數儲存 ──────────────────────────────────────────────────────────────
  async function saveParams() {
    setSavingParams(true);
    try {
      const r = await fetch(apiUrl("/payroll-cost/params"), {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paramsDraft),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setParams(paramsDraft); setParamsOpen(false);
      toast({ title: "費率參數已更新" });
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSavingParams(false); }
  }

  // ── 記錄 CRUD ─────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true);
  }
  function openEdit(rec: Record) {
    setEditingId(rec.id);
    setForm({
      driver_name:      rec.driver_name,
      attendance_days:  String(rec.attendance_days),
      daily_wage:       String(rec.daily_wage),
      freight_income:   String(rec.freight_income),
      toll_fee:         String(rec.toll_fee),
      diesel_fee:       String(rec.diesel_fee),
      other_fee:        String(rec.other_fee),
      invoice_tax_rate: String(rec.invoice_tax_rate),
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
        attendance_days:  Number(form.attendance_days) || 0,
        daily_wage:       Number(form.daily_wage)       || 0,
        freight_income:   Number(form.freight_income)   || 0,
        toll_fee:         Number(form.toll_fee)         || 0,
        diesel_fee:       Number(form.diesel_fee)       || 0,
        other_fee:        Number(form.other_fee)        || 0,
        invoice_tax_rate: Number(form.invoice_tax_rate) || 0,
        notes:            form.notes.trim() || null,
      };
      const url    = editingId ? apiUrl(`/payroll-cost/records/${editingId}`) : apiUrl("/payroll-cost/records");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: editingId ? "更新成功" : "新增成功" });
      setDialogOpen(false); loadRecords();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function del(rec: Record) {
    if (!confirm(`確定刪除 ${rec.driver_name} 的 ${month} 記錄？`)) return;
    await fetch(apiUrl(`/payroll-cost/records/${rec.id}`), { method: "DELETE" });
    toast({ title: "已刪除" }); loadRecords();
  }

  // ── Excel 匯入 ─────────────────────────────────────────────────────────────
  async function importExcel(file?: File) {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("report_month", month);
      if (file) fd.append("file", file);
      const r = await fetch(apiUrl("/payroll-cost/import-excel"), { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) {
        toast({ title: `匯入完成：新增 ${d.inserted} 筆` });
        loadRecords();
      } else {
        toast({ title: "匯入失敗", description: d.error, variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "匯入失敗", description: String(e), variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── CSV 匯出 ───────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["司機姓名","出勤天數","日薪","基本薪資","勞保費","健保費",
                    "運費收入","過路費","柴油費","其他費用","發票稅%","稅額","總成本","淨利潤"];
    const rows = computed.map(r => [
      r.driver_name, r.attendance_days, r.daily_wage, r.basic_salary, r.labor_ins, r.health_ins,
      r.freight_income, r.toll_fee, r.diesel_fee, r.other_fee, r.invoice_tax_rate,
      r.tax_amount, r.total_cost, r.net_profit,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `薪資成本結算_${month}.csv`;
    a.click();
  }

  // ── 計算 ──────────────────────────────────────────────────────────────────
  const computed = records.map(r => ({ ...r, ...compute(r, params) }));
  const totals = computed.reduce(
    (acc, r) => ({
      attendance_days: acc.attendance_days + Number(r.attendance_days),
      freight_income:  acc.freight_income  + Number(r.freight_income),
      basic_salary:    acc.basic_salary    + r.basic_salary,
      labor_ins:       acc.labor_ins       + r.labor_ins,
      health_ins:      acc.health_ins      + r.health_ins,
      toll_fee:        acc.toll_fee        + Number(r.toll_fee),
      diesel_fee:      acc.diesel_fee      + Number(r.diesel_fee),
      other_fee:       acc.other_fee       + Number(r.other_fee),
      tax_amount:      acc.tax_amount      + r.tax_amount,
      total_cost:      acc.total_cost      + r.total_cost,
      net_profit:      acc.net_profit      + r.net_profit,
    }),
    { attendance_days:0, freight_income:0, basic_salary:0, labor_ins:0, health_ins:0,
      toll_fee:0, diesel_fee:0, other_fee:0, tax_amount:0, total_cost:0, net_profit:0 }
  );

  // ── 統計卡片 ──────────────────────────────────────────────────────────────
  const stats = [
    { icon: <Users className="w-4 h-4" />,        color: "#2563eb", bg: "#eff6ff", val: records.length,                    label: "司機人數" },
    { icon: <DollarSign className="w-4 h-4" />,    color: "#059669", bg: "#f0fdf4", val: fmtCurrency(totals.freight_income), label: "總運費收入" },
    { icon: <DollarSign className="w-4 h-4" />,    color: "#dc2626", bg: "#fef2f2", val: fmtCurrency(totals.total_cost),    label: "總成本" },
    {
      icon: totals.net_profit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />,
      color: totals.net_profit >= 0 ? "#059669" : "#dc2626",
      bg:    totals.net_profit >= 0 ? "#f0fdf4" : "#fef2f2",
      val:   (totals.net_profit >= 0 ? "+" : "") + fmtCurrency(totals.net_profit),
      label: "總淨利潤",
    },
  ];

  const thS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#374151", padding: "8px 8px", textAlign: "right", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" };
  const thL: React.CSSProperties = { ...thS, textAlign: "left" };
  const tdS: React.CSSProperties = { fontSize: 12, padding: "6px 8px", textAlign: "right", borderBottom: "1px solid #f3f4f6" };
  const tdL: React.CSSProperties = { ...tdS, textAlign: "left" };

  const inp = (key: keyof typeof form, label: string, type = "number", ph = "0") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} className="h-8 text-sm" placeholder={ph}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  // 新增表單的即時預覽
  const previewCompute = (): Computed => {
    const rec: any = {
      attendance_days:  Number(form.attendance_days)  || 0,
      daily_wage:       Number(form.daily_wage)        || 0,
      freight_income:   Number(form.freight_income)    || 0,
      toll_fee:         Number(form.toll_fee)          || 0,
      diesel_fee:       Number(form.diesel_fee)        || 0,
      other_fee:        Number(form.other_fee)         || 0,
      invoice_tax_rate: Number(form.invoice_tax_rate)  || 0,
    };
    return compute(rec, params);
  };
  const preview = previewCompute();

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
              <div className="text-base font-bold leading-tight" style={{ color: s.color }}>{s.val}</div>
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
              薪資成本結算表
              <span className="text-xs font-normal text-gray-400">（月度）</span>
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
              <Button variant="outline" size="sm" className="h-8"
                style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
                onClick={() => setParamsOpen(true)}>
                <Settings2 className="w-3.5 h-3.5 mr-1" />費率設定
              </Button>
              {/* Excel 匯入 */}
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
                    {/* 輸入欄（藍底提示） */}
                    <th style={{ ...thL, borderTop: "3px solid #3b82f6" }}>司機</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>出勤(天)</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>日薪</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>運費收入</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>過路費</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>柴油費</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>其他費</th>
                    <th style={{ ...thS, borderTop: "3px solid #3b82f6" }}>稅率%</th>
                    {/* 計算欄（綠底提示） */}
                    <th style={{ ...thS, borderTop: "3px solid #10b981", color: "#065f46" }}>基本薪資</th>
                    <th style={{ ...thS, borderTop: "3px solid #10b981", color: "#065f46" }}>勞保費</th>
                    <th style={{ ...thS, borderTop: "3px solid #10b981", color: "#065f46" }}>健保費</th>
                    <th style={{ ...thS, borderTop: "3px solid #10b981", color: "#065f46" }}>稅額</th>
                    <th style={{ ...thS, borderTop: "3px solid #dc2626", color: "#dc2626" }}>總成本</th>
                    <th style={{ ...thS, borderTop: "3px solid #7c3aed", color: "#7c3aed" }}>淨利潤</th>
                    <th style={{ ...thS, borderTop: "3px solid #6b7280" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.length === 0 ? (
                    <tr><td colSpan={15} style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                      尚無資料，點選「新增司機」或「匯入 Excel」
                    </td></tr>
                  ) : computed.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ ...tdL, fontWeight: 600 }}>{r.driver_name}</td>
                      <td style={tdS}>{r.attendance_days}</td>
                      <td style={tdS}>{fmt(Number(r.daily_wage))}</td>
                      <td style={{ ...tdS, color: "#059669", fontWeight: 600 }}>{fmt(Number(r.freight_income))}</td>
                      <td style={tdS}>{fmt(Number(r.toll_fee))}</td>
                      <td style={tdS}>{fmt(Number(r.diesel_fee))}</td>
                      <td style={tdS}>{fmt(Number(r.other_fee))}</td>
                      <td style={tdS}>{r.invoice_tax_rate}%</td>
                      {/* 計算欄 */}
                      <td style={{ ...tdS, color: "#065f46" }}>{fmt(r.basic_salary)}</td>
                      <td style={{ ...tdS, color: "#065f46", fontSize: 11 }}>{fmt(r.labor_ins)}</td>
                      <td style={{ ...tdS, color: "#065f46", fontSize: 11 }}>{fmt(r.health_ins)}</td>
                      <td style={{ ...tdS, color: "#92400e", fontSize: 11 }}>{fmt(r.tax_amount)}</td>
                      <td style={{ ...tdS, color: "#dc2626", fontWeight: 700 }}>{fmt(r.total_cost)}</td>
                      <td style={{ ...tdS, color: r.net_profit >= 0 ? "#7c3aed" : "#dc2626", fontWeight: 700 }}>
                        {r.net_profit >= 0 ? "+" : ""}{fmt(r.net_profit)}
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
                    <tr style={{ background: "#0f172a", color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...tdL, color: "#fbbf24" }}>合計（{records.length}人）</td>
                      <td style={{ ...tdS, color: "#e2e8f0" }}>{totals.attendance_days}</td>
                      <td style={tdS}>—</td>
                      <td style={{ ...tdS, color: "#6ee7b7" }}>{fmt(totals.freight_income)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmt(totals.toll_fee)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmt(totals.diesel_fee)}</td>
                      <td style={{ ...tdS, color: "#fcd34d" }}>{fmt(totals.other_fee)}</td>
                      <td style={tdS}>—</td>
                      <td style={{ ...tdS, color: "#a7f3d0" }}>{fmt(totals.basic_salary)}</td>
                      <td style={{ ...tdS, color: "#a7f3d0", fontSize: 11 }}>{fmt(totals.labor_ins)}</td>
                      <td style={{ ...tdS, color: "#a7f3d0", fontSize: 11 }}>{fmt(totals.health_ins)}</td>
                      <td style={{ ...tdS, color: "#fcd34d", fontSize: 11 }}>{fmt(totals.tax_amount)}</td>
                      <td style={{ ...tdS, color: "#f87171" }}>{fmt(totals.total_cost)}</td>
                      <td style={{ ...tdS, color: totals.net_profit >= 0 ? "#c4b5fd" : "#f87171" }}>
                        {totals.net_profit >= 0 ? "+" : ""}{fmt(totals.net_profit)}
                      </td>
                      <td style={tdS} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 底部公式說明列 */}
          <div className="px-4 py-2 border-t text-xs flex flex-wrap gap-4" style={{ background: "#f8fafc", color: "#6b7280" }}>
            <span>🔵 <b>藍色欄</b> = 手動輸入</span>
            <span>🟢 <b>綠色欄</b> = 系統計算</span>
            <span>勞保費率 <b style={{ color: "#059669" }}>{(params.labor_ins_rate * 100).toFixed(1)}%</b></span>
            <span>健保費率 <b style={{ color: "#059669" }}>{(params.health_ins_rate * 100).toFixed(1)}%</b></span>
            <span>總成本 = 基本薪資＋勞保＋健保＋過路＋柴油＋其他＋稅額</span>
            <span>淨利潤 = 運費收入 − 總成本</span>
          </div>
        </CardContent>
      </Card>

      {/* ── 費率設定 Dialog ── */}
      <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-violet-500" />費率參數設定
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">雇主勞保費率（%）</Label>
              <Input type="number" step="0.1" className="h-8 text-sm"
                value={(paramsDraft.labor_ins_rate * 100).toFixed(2)}
                onChange={e => setParamsDraft(p => ({ ...p, labor_ins_rate: Number(e.target.value) / 100 }))} />
              <p className="text-xs text-gray-400">
                目前：{(paramsDraft.labor_ins_rate * 100).toFixed(1)}%（預設：7%）
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">雇主健保費率（%）</Label>
              <Input type="number" step="0.1" className="h-8 text-sm"
                value={(paramsDraft.health_ins_rate * 100).toFixed(2)}
                onChange={e => setParamsDraft(p => ({ ...p, health_ins_rate: Number(e.target.value) / 100 }))} />
              <p className="text-xs text-gray-400">
                目前：{(paramsDraft.health_ins_rate * 100).toFixed(1)}%（預設：4.5%）
              </p>
            </div>
            <div className="rounded-lg p-2.5 text-xs" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
              💡 費率調整會立即重新計算所有月度記錄的勞保費及健保費估算
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParamsOpen(false)}>取消</Button>
            <Button onClick={saveParams} disabled={savingParams}>
              <Save className="w-3.5 h-3.5 mr-1" />{savingParams ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 新增 / 編輯 Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯司機記錄" : "新增司機記錄"} — {month}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* 分組：輸入欄 */}
            <div className="rounded-lg p-3" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
              <p className="text-xs font-bold text-blue-600 mb-2">🔵 手動輸入欄位</p>
              <div className="grid grid-cols-3 gap-3">
                {inp("driver_name",      "司機姓名 *", "text", "請輸入")}
                {inp("attendance_days",  "出勤天數",   "number", "22")}
                {inp("daily_wage",       "日薪（元）", "number", "1800")}
                {inp("freight_income",   "總運費收入（元）", "number", "100000")}
                {inp("toll_fee",         "過路費（元）",     "number", "3000")}
                {inp("diesel_fee",       "柴油費（元）",     "number", "12000")}
                {inp("other_fee",        "其他費用（元）",   "number", "2000")}
                {inp("invoice_tax_rate", "發票稅率（%）",    "number", "0")}
                <div className="space-y-1">
                  <Label className="text-xs">備註</Label>
                  <Input className="h-8 text-sm" placeholder="如：外包"
                    value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* 分組：即時計算預覽 */}
            <div className="rounded-lg p-3" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <p className="text-xs font-bold text-green-700 mb-2">🟢 系統計算預覽</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  { label: "基本薪資",   val: preview.basic_salary,  color: "#065f46" },
                  { label: `勞保費(${(params.labor_ins_rate*100).toFixed(1)}%)`, val: preview.labor_ins,    color: "#065f46" },
                  { label: `健保費(${(params.health_ins_rate*100).toFixed(1)}%)`,val: preview.health_ins,   color: "#065f46" },
                  { label: "稅額",       val: preview.tax_amount,    color: "#92400e" },
                  { label: "總成本",     val: preview.total_cost,    color: "#dc2626" },
                  { label: "淨利潤",     val: preview.net_profit,    color: preview.net_profit >= 0 ? "#7c3aed" : "#dc2626" },
                ].map(s => (
                  <div key={s.label} className="flex justify-between items-center bg-white rounded px-3 py-1.5 border"
                    style={{ borderColor: `${s.color}30` }}>
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <span className="font-bold text-sm" style={{ color: s.color }}>
                      {s.val >= 0 && s.label === "淨利潤" && s.val > 0 ? "+" : ""}
                      {fmtCurrency(s.val)}
                    </span>
                  </div>
                ))}
              </div>
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
