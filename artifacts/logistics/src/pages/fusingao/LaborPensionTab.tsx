/**
 * LaborPensionTab.tsx — 6% 勞退提撥管理（加盟者專用）
 *
 * ① 流程說明面板（可折疊）
 * ② 繳交時程提醒（月底 → 次月5日 → 次月15日）
 * ③ 月度提撥名冊（按加盟者分組，自動計算6%）
 * ④ 加盟者彙總卡片
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  CheckCircle2, Clock, AlertCircle, Users, DollarSign, Calendar,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── 型別 ────────────────────────────────────────────────────────────────────
interface PensionRecord {
  id:                number;
  report_month:      string;
  franchisee_name:   string;
  employee_name:     string;
  id_number:         string | null;
  monthly_salary:    number;
  contribution_rate: number;
  contribution_amt:  number;
  paid_at:           string | null;
  payment_method:    string | null;
  notes:             string | null;
}

interface Summary {
  franchisee_name:    string;
  employee_count:     number;
  total_salary:       number;
  total_contribution: number;
  paid_count:         number;
}

const EMPTY_FORM = {
  franchisee_name:   "",
  employee_name:     "",
  id_number:         "",
  monthly_salary:    "",
  contribution_rate: "0.06",
  paid_at:           "",
  payment_method:    "",
  notes:             "",
};

const PAYMENT_METHODS = ["超商", "銀行臨櫃", "網路轉帳", "郵局", "勞保局平台"];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat("zh-TW").format(Math.round(n));
}

// ── 時程步驟元件 ─────────────────────────────────────────────────────────────
function TimelineStep({ icon, color, bg, date, title, items }: {
  icon: React.ReactNode; color: string; bg: string;
  date: string; title: string; items: string[];
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: bg, color }}>
          {icon}
        </div>
        <div className="w-0.5 flex-1 mt-1" style={{ background: `${color}30`, minHeight: 20 }} />
      </div>
      <div className="pb-4 flex-1">
        <div className="text-xs font-bold mb-0.5" style={{ color }}>{date}</div>
        <div className="text-sm font-semibold text-gray-700 mb-1">{title}</div>
        <ul className="space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
              <span style={{ color, marginTop: 2 }}>•</span>{item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function LaborPensionTab() {
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [records, setRecords] = useState<PensionRecord[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(apiUrl(`/labor-pension/records?month=${month}`)),
        fetch(apiUrl(`/labor-pension/summary?month=${month}`)),
      ]);
      const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
      if (d1.ok) setRecords(d1.records);
      if (d2.ok) setSummary(d2.summary);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [month, toast]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function openEdit(r: PensionRecord) {
    setEditingId(r.id);
    setForm({
      franchisee_name:   r.franchisee_name,
      employee_name:     r.employee_name,
      id_number:         r.id_number ?? "",
      monthly_salary:    String(r.monthly_salary),
      contribution_rate: String(r.contribution_rate),
      paid_at:           r.paid_at?.slice(0, 10) ?? "",
      payment_method:    r.payment_method ?? "",
      notes:             r.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.employee_name.trim()) {
      toast({ title: "員工姓名為必填", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const payload = {
        report_month:      month,
        franchisee_name:   form.franchisee_name.trim(),
        employee_name:     form.employee_name.trim(),
        id_number:         form.id_number.trim() || null,
        monthly_salary:    Number(form.monthly_salary) || 0,
        contribution_rate: Number(form.contribution_rate) || 0.06,
        paid_at:           form.paid_at || null,
        payment_method:    form.payment_method || null,
        notes:             form.notes.trim() || null,
      };
      const url    = editingId ? apiUrl(`/labor-pension/records/${editingId}`) : apiUrl("/labor-pension/records");
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "儲存失敗");
      toast({ title: editingId ? "更新成功" : "新增成功" });
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      toast({ title: "儲存失敗", description: String(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function del(r: PensionRecord) {
    if (!confirm(`確定刪除 ${r.employee_name} 的 ${month} 記錄？`)) return;
    await fetch(apiUrl(`/labor-pension/records/${r.id}`), { method: "DELETE" });
    toast({ title: "已刪除" });
    load();
  }

  // 標記已繳費
  async function markPaid(r: PensionRecord) {
    const paid_at = new Date().toISOString().slice(0, 10);
    await fetch(apiUrl(`/labor-pension/records/${r.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_at, payment_method: r.payment_method ?? "網路轉帳" }),
    });
    toast({ title: `${r.employee_name} 已標記繳費` });
    load();
  }

  // 依加盟者分組
  const groups = records.reduce((acc, r) => {
    const key = r.franchisee_name || "（未指定加盟者）";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {} as Record<string, PensionRecord[]>);

  const totalContribution = records.reduce((s, r) => s + Number(r.contribution_amt), 0);
  const paidCount         = records.filter(r => r.paid_at).length;

  const thS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#374151", padding: "8px 10px", textAlign: "right", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
  const thL: React.CSSProperties = { ...thS, textAlign: "left" };
  const tdS: React.CSSProperties = { fontSize: 12, padding: "7px 10px", textAlign: "right", borderBottom: "1px solid #f3f4f6" };
  const tdL: React.CSSProperties = { ...tdS, textAlign: "left" };

  const inp = (key: keyof typeof form, label: string, type = "text", ph = "") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} className="h-8 text-sm" placeholder={ph}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── 統計卡片 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <Users className="w-4 h-4" />,      color: "#2563eb", bg: "#eff6ff", val: records.length,                label: "提撥人數" },
          { icon: <DollarSign className="w-4 h-4" />, color: "#059669", bg: "#f0fdf4", val: `NT$${fmt(totalContribution)}`, label: "本月總提撥" },
          { icon: <CheckCircle2 className="w-4 h-4" />,color: "#7c3aed", bg: "#faf5ff", val: paidCount,                    label: "已繳筆數" },
          { icon: <AlertCircle className="w-4 h-4" />, color: "#d97706", bg: "#fffbeb", val: records.length - paidCount,   label: "待繳筆數" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${s.color}18`, color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div className="text-lg font-bold leading-tight" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── 流程說明 + 時程（可折疊）── */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setGuideOpen(o => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              6% 勞退提撥流程說明與繳交時程（加盟者專用）
            </CardTitle>
            {guideOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </div>
        </CardHeader>
        {guideOpen && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-6">
              {/* 左：流程步驟 */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">【流程說明】</p>
                {[
                  { num: "1", title: "員工薪資核算", desc: "每月底計算當月薪資。例：月薪 $30,000 × 6% = 勞退提撥 $1,800" },
                  { num: "2", title: "編列提撥清單", desc: "由加盟者（雇主）或委任會計建立「勞退提繳名冊」" },
                  { num: "3", title: "繳費方式選擇", desc: "超商、銀行臨櫃、網路轉帳、郵局、勞保局合作平台均可" },
                  { num: "4", title: "指定繳交對象", desc: "每位員工對應一組「個人退休金帳戶（由勞保局管理）」" },
                  { num: "5", title: "查詢與佐證", desc: "員工可至勞保局 e 化平台查詢記錄；雇主留存繳費收據備查" },
                ].map(s => (
                  <div key={s.num} className="flex gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {s.num}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-700">{s.title}</div>
                      <div className="text-xs text-gray-500">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 右：時程圖 */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">【繳交時程圖】</p>
                <TimelineStep
                  icon={<Calendar className="w-4 h-4" />}
                  color="#059669" bg="#f0fdf4"
                  date="🗓 月底"
                  title="完成薪資計算"
                  items={[
                    "勞保、健保費依政府公布級距計算",
                    "勞退提撥額 = 薪資 × 6%（雇主全額負擔）",
                  ]}
                />
                <TimelineStep
                  icon={<FileText className="w-4 h-4" />}
                  color="#2563eb" bg="#eff6ff"
                  date="📄 次月 5 日前"
                  title="完成保費報表與提撥名冊"
                  items={[
                    "委託記帳士填報",
                    "或自行使用勞保局報繳工具",
                  ]}
                />
                <TimelineStep
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  color="#7c3aed" bg="#faf5ff"
                  date="💰 次月 15 日前"
                  title="完成繳費"
                  items={[
                    "勞保費：雇主＋員工分擔",
                    "健保費：雇主＋員工分擔",
                    "勞退提撥：雇主全額負擔",
                  ]}
                />
                <div className="mt-2 rounded-lg p-2.5 text-xs" style={{ background: "#fafafa", border: "1px solid #e5e7eb", color: "#6b7280" }}>
                  📅 <b>每年建議：</b>檢查員工提撥累積狀況，主動提供年度勞退提撥紀錄
                  <br />🔗 <a href="https://edesk.bli.gov.tw" target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 underline">勞保局 e 化平台查詢</a>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── 提撥名冊 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              提撥名冊
              <span className="text-xs font-normal text-gray-400">（依加盟者分組）</span>
            </CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-gray-500">報表月份</Label>
                <Input type="month" className="h-8 text-sm w-36"
                  value={month} onChange={e => setMonth(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5 mr-1" />新增員工
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">載入中…</div>
          ) : Object.keys(groups).length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">本月尚無提撥記錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {Object.entries(groups).map(([franchisee, rows]) => {
                const subtotal = rows.reduce((s, r) => s + Number(r.contribution_amt), 0);
                const paidRows = rows.filter(r => r.paid_at);
                return (
                  <div key={franchisee}>
                    {/* 加盟者標題列 */}
                    <div className="px-4 py-2 flex items-center justify-between"
                      style={{ background: "#f0f4ff", borderTop: "1px solid #e0e7ff", borderBottom: "1px solid #e0e7ff" }}>
                      <span className="text-sm font-bold text-indigo-700">🏢 {franchisee}</span>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>員工 <b className="text-indigo-600">{rows.length}</b> 人</span>
                        <span>本月提撥 <b className="text-green-600">NT${fmt(subtotal)}</b></span>
                        <span>
                          <b className="text-purple-600">{paidRows.length}/{rows.length}</b> 已繳
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thL}>員工姓名</th>
                          <th style={thL}>身分證號</th>
                          <th style={thS}>月薪（NT$）</th>
                          <th style={thS}>提撥率</th>
                          <th style={{ ...thS, color: "#059669" }}>提撥金額</th>
                          <th style={thL}>繳費方式</th>
                          <th style={thL}>繳費日期</th>
                          <th style={thL}>狀態</th>
                          <th style={thS}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                            <td style={tdL}><span className="font-medium">{r.employee_name}</span></td>
                            <td style={{ ...tdL, fontFamily: "monospace", color: "#6b7280", fontSize: 11 }}>
                              {r.id_number ?? "—"}
                            </td>
                            <td style={tdS}>{fmt(Number(r.monthly_salary))}</td>
                            <td style={tdS}>{(Number(r.contribution_rate) * 100).toFixed(0)}%</td>
                            <td style={{ ...tdS, color: "#059669", fontWeight: 700 }}>
                              {fmt(Number(r.contribution_amt))}
                            </td>
                            <td style={tdL}>{r.payment_method ?? "—"}</td>
                            <td style={{ ...tdL, fontSize: 11 }}>{r.paid_at?.slice(0, 10) ?? "—"}</td>
                            <td style={tdL}>
                              {r.paid_at ? (
                                <Badge style={{ background: "#dcfce7", color: "#166534", fontSize: 10, padding: "2px 6px" }}>
                                  ✅ 已繳
                                </Badge>
                              ) : (
                                <Badge style={{ background: "#fef9c3", color: "#92400e", fontSize: 10, padding: "2px 6px" }}>
                                  ⏳ 待繳
                                </Badge>
                              )}
                            </td>
                            <td style={tdS}>
                              <div className="flex gap-1 justify-end">
                                {!r.paid_at && (
                                  <button
                                    onClick={() => markPaid(r)}
                                    title="標記已繳費"
                                    className="p-1 rounded hover:bg-green-50 text-green-500"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
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
                        {/* 小計 */}
                        <tr style={{ background: "#eef2ff" }}>
                          <td style={{ ...tdL, fontWeight: 700, color: "#4338ca" }} colSpan={4}>小計</td>
                          <td style={{ ...tdS, fontWeight: 700, color: "#4338ca" }}>NT${fmt(subtotal)}</td>
                          <td colSpan={4} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* 總計列 */}
              {records.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{ background: "#1e3a5f", color: "#fff" }}>
                  <span className="text-sm font-bold text-yellow-300">
                    全部合計（{Object.keys(groups).length} 個加盟者，共 {records.length} 人）
                  </span>
                  <span className="text-base font-bold text-green-300">
                    本月總提撥：NT${fmt(totalContribution)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 新增 / 編輯 Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "編輯提撥記錄" : "新增提撥記錄"} — {month}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {inp("franchisee_name", "加盟者名稱", "text", "例：小楊車行")}
            {inp("employee_name",   "員工姓名 *", "text", "請輸入")}
            {inp("id_number",       "身分證字號", "text", "A123456789")}
            {inp("monthly_salary",  "月薪（NT$）", "number", "30000")}

            <div className="space-y-1">
              <Label className="text-xs">提撥率</Label>
              <div className="flex gap-2">
                {[0.06, 0.07, 0.08].map(r => (
                  <button key={r}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, contribution_rate: String(r) }))}
                    className="flex-1 h-8 text-xs rounded border font-medium transition-colors"
                    style={{
                      background: form.contribution_rate === String(r) ? "#4f46e5" : "#fff",
                      color:      form.contribution_rate === String(r) ? "#fff"    : "#374151",
                      borderColor: form.contribution_rate === String(r) ? "#4f46e5" : "#d1d5db",
                    }}
                  >
                    {(r * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">預估提撥金額</Label>
              <div className="h-8 px-3 flex items-center rounded border bg-gray-50 text-sm font-semibold text-green-600">
                NT$ {fmt(Math.round(Number(form.monthly_salary || 0) * Number(form.contribution_rate || 0.06)))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">繳費方式</Label>
              <select
                className="w-full h-8 text-sm rounded border border-gray-200 bg-white px-2"
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
              >
                <option value="">— 選擇 —</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">繳費日期（留空=未繳）</Label>
              <Input type="date" className="h-8 text-sm"
                value={form.paid_at}
                onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs">備註</Label>
              <Input className="h-8 text-sm" placeholder="如：兼職、外包等"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            <div className="col-span-2 rounded-lg p-3 text-xs" style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af" }}>
              💡 勞退提撥費用由<b>雇主全額負擔</b>，不從員工薪資扣除。<br />
              次月 15 日前完成繳費，避免罰款。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : editingId ? "更新記錄" : "新增記錄"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
