import { useState, useEffect, useCallback, useRef } from "react";
import {
  Printer, RefreshCw, Save, CheckCircle2, AlertCircle, Plus, Trash2,
  DollarSign, Fuel, Users, FileText, X, ChevronRight, Lock, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── helpers ─────────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("auth-jwt");
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}
function fapi(path: string) { return apiUrl(path); }
function fmt(v: number | string) {
  const n = Number(v ?? 0);
  return `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function nowPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function periodLabel(p: string) {
  const [y, m] = p.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
function recentMonths(n = 18): string[] {
  const res: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    res.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return res;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Fleet { id: number; fleet_name: string; contact_name: string | null; }
interface FuelRow { vehicle_plate: string; total: string; }
interface DriverRow {
  driver_id?: number; name: string; employee_id: string | null;
  completed_trips: number; base_salary: string; per_trip_bonus: string;
  meal_allowance: string; other_deduction: string; net_salary: string; locked?: boolean;
}
interface PenaltyRow { id: number; reason: string; amount: string; order_no: string | null; }
interface MiscRow { id?: number; label: string; amount: number; }
interface SettlementRecord {
  id: number; fleet_id: number; month: string; status: "draft" | "paid";
  paid_at: string | null; paid_by: string | null; note: string | null;
  shopee_income: string; fleet_receive: string; commission_rate: string;
  trip_count: number; fuel_total: string; salary_total: string;
  penalty_total: string; misc_total: string; cash_due: string;
}
interface LoadedData {
  fleet: { id: number; fleet_name: string; contact_name: string; contact_phone: string | null; commission_rate: number };
  month: string;
  income: { shopee_income: number; fleet_receive: number; commission_rate: number; trip_count: number };
  fuel_breakdown: FuelRow[];
  fuel_total: number;
  driver_salaries: DriverRow[];
  salary_total: number;
  penalties: PenaltyRow[];
  penalty_total: number;
  misc_deductions: MiscRow[];
  misc_total: number;
  cash_due: number;
  record: SettlementRecord | null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function CashSettlement() {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [selectedFleet, setSelectedFleet] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(nowPeriod());
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Misc deductions (editable)
  const [miscRows, setMiscRows] = useState<MiscRow[]>([]);

  // Print modal
  const [printOpen, setPrintOpen] = useState(false);
  const [printPayDate, setPrintPayDate] = useState("");
  const [printHandler, setPrintHandler] = useState("");

  // Mark-paid dialog
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [paidBy, setPaidBy] = useState("");
  const [markingPaid, setMarkingPaid] = useState(false);

  // Note
  const [note, setNote] = useState("");

  // ── Load fleets ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(fapi("/fusingao/fleets"), { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { if (d.ok) setFleets(d.fleets ?? []); })
      .catch(() => {});
  }, []);

  // ── Load settlement data ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedFleet || !selectedMonth) return;
    setLoading(true);
    try {
      const r = await fetch(fapi(`/fusingao/admin/cash-settlements/load?fleet_id=${selectedFleet}&month=${selectedMonth}`), { headers: authHeaders() });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setData(d);
      setMiscRows(d.misc_deductions ?? []);
      setNote(d.record?.note ?? "");
    } catch (err: any) {
      toast({ title: "載入失敗", description: err.message, variant: "destructive" });
      setData(null);
    } finally { setLoading(false); }
  }, [selectedFleet, selectedMonth]); // eslint-disable-line

  useEffect(() => { if (selectedFleet && selectedMonth) loadData(); }, [selectedFleet, selectedMonth]); // eslint-disable-line

  // ── Computed totals ──────────────────────────────────────────────────────
  const miscTotal = miscRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const cashDue = data
    ? data.income.fleet_receive - data.fuel_total - data.salary_total - data.penalty_total - miscTotal
    : 0;
  const isPaid = data?.record?.status === "paid";

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!data || !selectedFleet || !selectedMonth) return;
    if (isPaid) { toast({ title: "已付款結算單不可修改", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        fleet_id: Number(selectedFleet),
        month: selectedMonth,
        shopee_income: data.income.shopee_income,
        commission_rate: data.income.commission_rate,
        fleet_receive: data.income.fleet_receive,
        trip_count: data.income.trip_count,
        fuel_total: data.fuel_total,
        salary_total: data.salary_total,
        penalty_total: data.penalty_total,
        misc_total: miscTotal,
        cash_due: cashDue,
        note: note || null,
        misc_deductions: miscRows,
      };
      const r = await fetch(fapi("/fusingao/admin/cash-settlements/save"), {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "✅ 結算單已儲存" });
      loadData();
    } catch (err: any) {
      toast({ title: "儲存失敗", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Mark paid ────────────────────────────────────────────────────────────
  const handleMarkPaid = async () => {
    if (!data?.record?.id || !paidBy.trim()) return;
    setMarkingPaid(true);
    try {
      const r = await fetch(fapi(`/fusingao/admin/cash-settlements/${data.record.id}/mark-paid`), {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ paid_by: paidBy }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      toast({ title: "✅ 已標記為現金已付" });
      setPaidDialogOpen(false);
      setPaidBy("");
      loadData();
    } catch (err: any) {
      toast({ title: "標記失敗", description: err.message, variant: "destructive" });
    } finally { setMarkingPaid(false); }
  };

  // ── Misc deductions helpers ──────────────────────────────────────────────
  const addMiscRow = () => setMiscRows(p => [...p, { label: "", amount: 0 }]);
  const removeMiscRow = (i: number) => setMiscRows(p => p.filter((_, idx) => idx !== i));
  const updateMiscRow = (i: number, field: "label" | "amount", val: string) =>
    setMiscRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: field === "amount" ? Number(val) : val } : r));

  // ── Print ────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ─── Render ──────────────────────────────────────────────────────────────
  const monthOptions = recentMonths();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header toolbar ── */}
      <div className="bg-white border-b px-6 py-3 flex flex-wrap items-center gap-3 sticky top-0 z-30 no-print">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-orange-500" />
          <span className="text-base font-bold text-gray-800">現金結算管理</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-2">
          {/* Fleet selector */}
          <Select value={selectedFleet} onValueChange={setSelectedFleet}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="選擇車隊" />
            </SelectTrigger>
            <SelectContent>
              {fleets.map(f => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.fleet_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month selector */}
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="選擇月份" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m} value={m}>{periodLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadData} disabled={loading || !selectedFleet}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />重新整理
          </Button>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {data && !isPaid && (
            <Button size="sm" variant="outline" className="h-9 text-xs border-blue-300 text-blue-700 hover:bg-blue-50" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />{saving ? "儲存中…" : "儲存結算單"}
            </Button>
          )}
          {data && (
            <Button size="sm" className="h-9 text-xs bg-gray-800 hover:bg-gray-900 text-white" onClick={() => setPrintOpen(true)}>
              <Printer className="h-3.5 w-3.5 mr-1" />列印結算單
            </Button>
          )}
          {data && !isPaid && data.record && (
            <Button size="sm" className="h-9 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => setPaidDialogOpen(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />標記現金已付
            </Button>
          )}
          {isPaid && (
            <Badge className="bg-green-100 text-green-700 border-green-300 px-3 py-1.5 text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" />已付款
            </Badge>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {!selectedFleet && (
          <div className="text-center py-20 text-gray-400">
            <DollarSign className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">請先選擇車隊和月份</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-20 text-gray-400">
            <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-300" />
            <p className="text-sm">載入中…</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Status bar */}
            {isPaid && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <Lock className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-700">此結算單已付款鎖定</p>
                  <p className="text-xs text-green-600">
                    付款人：{data.record?.paid_by} ／ 時間：{data.record?.paid_at ? new Date(data.record.paid_at).toLocaleString("zh-TW") : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Basic info */}
            <Card>
              <CardContent className="px-5 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">車隊名稱</p>
                    <p className="font-semibold mt-0.5">{data.fleet.fleet_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">聯絡人</p>
                    <p className="font-semibold mt-0.5">{data.fleet.contact_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">結算月份</p>
                    <p className="font-semibold mt-0.5">{periodLabel(data.month)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">蝦皮趟次</p>
                    <p className="font-semibold mt-0.5">{data.income.trip_count.toLocaleString()} 趟</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ① Shopee income */}
            <Card className="border-blue-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-blue-800 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />① 蝦皮收入
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600">蝦皮運費總額</span>
                  <span className="font-mono font-semibold text-blue-700">{fmt(data.income.shopee_income)}</span>
                </div>
                <div className="flex justify-between border-b pb-2 text-orange-600">
                  <span>− 平台服務費（{data.income.commission_rate}%）</span>
                  <span className="font-mono">− {fmt(data.income.shopee_income * data.income.commission_rate / 100)}</span>
                </div>
                <div className="flex justify-between bg-blue-50 rounded-lg px-3 py-2 font-semibold text-blue-800">
                  <span>車隊實際收款</span>
                  <span className="font-mono">{fmt(data.income.fleet_receive)}</span>
                </div>
              </CardContent>
            </Card>

            {/* ② Fuel */}
            <Card className="border-orange-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-orange-800 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Fuel className="h-4 w-4" />② 油費支出（依車牌）</span>
                  <span className="font-mono text-orange-700 font-bold">{fmt(data.fuel_total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-4">
                {data.fuel_breakdown.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-orange-50/60 text-gray-500 text-xs">
                        <th className="text-left px-5 py-1.5">車牌號碼</th>
                        <th className="text-right px-5 py-1.5">油費金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fuel_breakdown.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-5 py-2 font-mono">{r.vehicle_plate}</td>
                          <td className="px-5 py-2 text-right font-mono">{fmt(Number(r.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-5 py-3 text-gray-400 text-xs">本月無油費記錄（可至加油管理頁新增）</p>
                )}
              </CardContent>
            </Card>

            {/* ③ Driver salaries */}
            <Card className="border-purple-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-purple-800 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" />③ 司機薪資</span>
                  <span className="font-mono text-purple-700 font-bold">{fmt(data.salary_total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-4">
                {data.driver_salaries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-purple-50/60 text-gray-500">
                          <th className="text-left px-5 py-1.5">司機</th>
                          <th className="text-right px-3 py-1.5">底薪</th>
                          <th className="text-right px-3 py-1.5">趟次×獎金</th>
                          <th className="text-right px-3 py-1.5">餐補</th>
                          <th className="text-right px-3 py-1.5">扣款</th>
                          <th className="text-right px-5 py-1.5">應付</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.driver_salaries.map((r, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-5 py-2">
                              {r.name}
                              {r.employee_id && <span className="text-gray-400 font-mono ml-1">#{r.employee_id}</span>}
                              {r.locked && <span className="ml-1 text-[10px] bg-green-100 text-green-600 px-1 rounded">已鎖定</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(Number(r.base_salary))}</td>
                            <td className="px-3 py-2 text-right font-mono">{r.completed_trips}×{fmt(Number(r.per_trip_bonus))}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmt(Number(r.meal_allowance))}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-500">−{fmt(Number(r.other_deduction))}</td>
                            <td className="px-5 py-2 text-right font-mono font-semibold text-purple-700">{fmt(Number(r.net_salary))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-3 text-gray-400 text-xs">本月無司機薪資記錄</p>
                )}
              </CardContent>
            </Card>

            {/* ④ Penalties */}
            <Card className="border-red-200">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-red-800 flex items-center justify-between">
                  <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />④ 罰款 / 扣款明細</span>
                  <span className="font-mono text-red-700 font-bold">{fmt(data.penalty_total)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-4">
                {data.penalties.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-red-50/60 text-gray-500 text-xs">
                        <th className="text-left px-5 py-1.5">原因</th>
                        <th className="text-left px-3 py-1.5">訂單號</th>
                        <th className="text-right px-5 py-1.5">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.penalties.map((r, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-5 py-2">{r.reason}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.order_no || "—"}</td>
                          <td className="px-5 py-2 text-right font-mono text-red-600">{fmt(Number(r.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-5 py-3 text-gray-400 text-xs">本月無罰款記錄</p>
                )}
              </CardContent>
            </Card>

            {/* ⑤ Misc deductions (editable) */}
            <Card className={`${isPaid ? "border-gray-200 opacity-80" : "border-amber-200"}`}>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-amber-800 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" />⑤ 雜項扣款（保險、代墊等）
                  </span>
                  <span className="font-mono text-amber-700 font-bold">{fmt(miscTotal)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-2">
                {miscRows.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      className="flex-1 border rounded px-2.5 py-1.5 text-sm disabled:bg-gray-50"
                      placeholder="項目說明（例：保費代付）"
                      value={r.label}
                      disabled={isPaid}
                      onChange={e => updateMiscRow(i, "label", e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-32 border rounded px-2.5 py-1.5 text-sm font-mono disabled:bg-gray-50"
                      placeholder="金額"
                      value={r.amount}
                      disabled={isPaid}
                      onChange={e => updateMiscRow(i, "amount", e.target.value)}
                    />
                    {!isPaid && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => removeMiscRow(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {!isPaid && (
                  <Button size="sm" variant="outline" className="h-8 text-xs border-dashed border-amber-400 text-amber-700 hover:bg-amber-50" onClick={addMiscRow}>
                    <Plus className="h-3.5 w-3.5 mr-1" />新增雜項扣款
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Note */}
            {!isPaid && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">備注說明（可選）</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="例：含補貼、預付…"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            )}

            {/* ⑥ Cash due summary */}
            <Card className="border-2 border-green-400">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-bold text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />⑥ 現金結算合計
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-1.5 text-sm">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-gray-600">車隊實際收款</span>
                  <span className="font-mono">{fmt(data.income.fleet_receive)}</span>
                </div>
                {data.fuel_total > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-red-600">
                    <span>− 油費</span>
                    <span className="font-mono">− {fmt(data.fuel_total)}</span>
                  </div>
                )}
                {data.salary_total > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-red-600">
                    <span>− 司機薪資</span>
                    <span className="font-mono">− {fmt(data.salary_total)}</span>
                  </div>
                )}
                {data.penalty_total > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-red-600">
                    <span>− 罰款扣款</span>
                    <span className="font-mono">− {fmt(data.penalty_total)}</span>
                  </div>
                )}
                {miscTotal > 0 && (
                  <div className="flex justify-between border-b pb-1.5 text-red-600">
                    <span>− 雜項扣款</span>
                    <span className="font-mono">− {fmt(miscTotal)}</span>
                  </div>
                )}
                <div className="bg-green-100 rounded-xl px-4 py-3 flex items-center justify-between mt-2">
                  <p className="font-bold text-green-800 text-base">應付車主現金</p>
                  <p className="font-mono font-bold text-green-800 text-2xl">{fmt(cashDue)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Record info */}
            {data.record && (
              <div className="text-xs text-gray-400 text-right">
                {data.record.status === "paid"
                  ? `已付款 · 付款人：${data.record.paid_by} · ${new Date(data.record.paid_at!).toLocaleString("zh-TW")}`
                  : `草稿 · 最後更新：${new Date(data.record?.created_at ?? "").toLocaleString("zh-TW")}`}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mark Paid Dialog ── */}
      <Dialog open={paidDialogOpen} onOpenChange={p => { if (!markingPaid) { setPaidDialogOpen(p); if (!p) setPaidBy(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />標記現金已付
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              確認標記 <strong>{data?.fleet.fleet_name}</strong> {data?.month && periodLabel(data.month)} 結算單為已付款？<br />
              付款後將鎖定結算單，無法再修改。
            </p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">付款人姓名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="請輸入付款人姓名"
                value={paidBy}
                onChange={e => setPaidBy(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPaidDialogOpen(false)} disabled={markingPaid}>取消</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleMarkPaid} disabled={markingPaid || !paidBy.trim()}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{markingPaid ? "處理中…" : "確認已付款"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Print Modal ── */}
      {printOpen && data && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-6 px-4">
          <style>{`
            @media print {
              body > * { display: none !important; }
              #admin-cash-slip { display: block !important; position: static !important; background: white; }
              .no-print { display: none !important; }
            }
          `}</style>
          <div id="admin-cash-slip" className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden">
            {/* Action bar */}
            <div className="no-print flex items-center justify-between px-5 py-3 bg-gray-100 border-b">
              <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="h-4 w-4" />車主現金結算單預覽
              </span>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs bg-gray-800 hover:bg-gray-900 text-white" onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5 mr-1" />列印 / 存PDF
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPrintOpen(false)}>
                  <X className="h-3.5 w-3.5 mr-1" />關閉
                </Button>
              </div>
            </div>

            {/* Slip content */}
            <div className="p-8 space-y-5 text-sm text-gray-800" style={{ fontFamily: "'Noto Sans TC', 'Microsoft JhengHei', sans-serif" }} ref={printRef}>
              {/* Header */}
              <div className="text-center border-b pb-4">
                <p className="text-xs text-gray-400 mb-0.5">富詠運輸股份有限公司</p>
                <h1 className="text-xl font-bold tracking-wide">車 主 現 金 結 算 單</h1>
                <p className="text-xs text-gray-500 mt-1">結算月份：{periodLabel(data.month)}</p>
                {isPaid && (
                  <div className="inline-flex items-center gap-1 mt-2 bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full">
                    <Lock className="h-3 w-3" />已付款 · {data.record?.paid_by} · {data.record?.paid_at ? new Date(data.record.paid_at).toLocaleDateString("zh-TW") : ""}
                  </div>
                )}
              </div>

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div className="flex gap-2"><span className="text-gray-500 shrink-0">車隊名稱：</span><span className="font-semibold">{data.fleet.fleet_name}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0">聯絡人：</span><span className="font-semibold">{data.fleet.contact_name || "—"}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0">結算期間：</span><span className="font-semibold">{periodLabel(data.month)}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0">蝦皮趟次：</span><span className="font-semibold">{data.income.trip_count.toLocaleString()} 趟</span></div>
              </div>

              {/* ① Shopee income */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-4 py-2 font-semibold text-blue-800 text-xs uppercase tracking-wide">① 蝦皮收入</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-4 py-2 text-gray-600">蝦皮運費總額</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold text-blue-700">{fmt(data.income.shopee_income)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2 text-gray-600">− 平台服務費（{data.income.commission_rate}%）</td>
                      <td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(data.income.shopee_income * data.income.commission_rate / 100)}</td>
                    </tr>
                    <tr className="bg-blue-50/60">
                      <td className="px-4 py-2 font-semibold">車隊實際收款</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-blue-800">{fmt(data.income.fleet_receive)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ② Fuel */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 font-semibold text-orange-800 text-xs flex justify-between">
                  <span>② 油費支出（依車牌）</span>
                  <span className="font-mono">合計：{fmt(data.fuel_total)}</span>
                </div>
                {data.fuel_breakdown.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-1.5 text-left">車牌</th><th className="px-4 py-1.5 text-right">金額</th></tr></thead>
                    <tbody>
                      {data.fuel_breakdown.map((r, i) => (
                        <tr key={i} className="border-b last:border-0"><td className="px-4 py-2 font-mono">{r.vehicle_plate}</td><td className="px-4 py-2 text-right font-mono">{fmt(Number(r.total))}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="px-4 py-3 text-gray-400 text-xs">本月無油費記錄</p>}
              </div>

              {/* ③ Driver salaries */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-purple-50 px-4 py-2 font-semibold text-purple-800 text-xs flex justify-between">
                  <span>③ 司機薪資</span>
                  <span className="font-mono">合計：{fmt(data.salary_total)}</span>
                </div>
                {data.driver_salaries.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50 text-gray-500 text-xs">
                      <th className="px-4 py-1.5 text-left">司機</th>
                      <th className="px-4 py-1.5 text-right">底薪</th>
                      <th className="px-4 py-1.5 text-right">趟次獎金</th>
                      <th className="px-4 py-1.5 text-right">餐補</th>
                      <th className="px-4 py-1.5 text-right">扣款</th>
                      <th className="px-4 py-1.5 text-right">應付</th>
                    </tr></thead>
                    <tbody>
                      {data.driver_salaries.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2">{r.name}{r.employee_id && <span className="text-gray-400 text-xs ml-1">#{r.employee_id}</span>}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{fmt(Number(r.base_salary))}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{r.completed_trips}×{fmt(Number(r.per_trip_bonus))}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs">{fmt(Number(r.meal_allowance))}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-red-600">−{fmt(Number(r.other_deduction))}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(Number(r.net_salary))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="px-4 py-3 text-gray-400 text-xs">本月無司機薪資記錄</p>}
              </div>

              {/* ④ Penalties */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-2 font-semibold text-red-800 text-xs flex justify-between">
                  <span>④ 罰款 / 扣款明細</span>
                  <span className="font-mono">合計：{fmt(data.penalty_total)}</span>
                </div>
                {data.penalties.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50 text-gray-500 text-xs"><th className="px-4 py-1.5 text-left">原因</th><th className="px-4 py-1.5 text-left">訂單號</th><th className="px-4 py-1.5 text-right">金額</th></tr></thead>
                    <tbody>
                      {data.penalties.map((r, i) => (
                        <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{r.reason}</td><td className="px-4 py-2 text-xs text-gray-500">{r.order_no||"—"}</td><td className="px-4 py-2 text-right font-mono text-red-600">{fmt(Number(r.amount))}</td></tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="px-4 py-3 text-gray-400 text-xs">本月無罰款記錄</p>}
              </div>

              {/* ⑤ Misc deductions */}
              {miscRows.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 font-semibold text-amber-800 text-xs flex justify-between">
                    <span>⑤ 雜項扣款</span>
                    <span className="font-mono">合計：{fmt(miscTotal)}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {miscRows.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2">{r.label || "（未填說明）"}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ⑥ Cash settlement */}
              <div className="border-2 border-green-400 rounded-lg overflow-hidden">
                <div className="bg-green-50 px-4 py-2 font-semibold text-green-800 text-xs">{miscRows.length > 0 ? "⑥" : "⑤"} 現金結算</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="px-4 py-2 text-gray-600">車隊實際收款</td><td className="px-4 py-2 text-right font-mono">{fmt(data.income.fleet_receive)}</td></tr>
                    {data.fuel_total > 0 && <tr className="border-b"><td className="px-4 py-2 text-gray-600">− 油費</td><td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(data.fuel_total)}</td></tr>}
                    {data.salary_total > 0 && <tr className="border-b"><td className="px-4 py-2 text-gray-600">− 司機薪資</td><td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(data.salary_total)}</td></tr>}
                    {data.penalty_total > 0 && <tr className="border-b"><td className="px-4 py-2 text-gray-600">− 罰款扣款</td><td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(data.penalty_total)}</td></tr>}
                    {miscTotal > 0 && <tr className="border-b"><td className="px-4 py-2 text-gray-600">− 雜項扣款</td><td className="px-4 py-2 text-right font-mono text-red-600">− {fmt(miscTotal)}</td></tr>}
                    <tr className="bg-green-100">
                      <td className="px-4 py-3 font-bold text-green-800 text-base">應付車主現金</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-green-800 text-xl">{fmt(cashDue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Note */}
              {note && <p className="text-xs text-gray-500 border-t pt-3">備注：{note}</p>}

              {/* Signature fields */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">確認簽署</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">付款日期</p>
                    <input type="date" className="no-print w-full border rounded px-2 py-1.5 text-sm" value={printPayDate} onChange={e => setPrintPayDate(e.target.value)} />
                    <div className="hidden border-b border-gray-400 h-7" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">經手人</p>
                    <input type="text" className="no-print w-full border rounded px-2 py-1.5 text-sm" value={printHandler} onChange={e => setPrintHandler(e.target.value)} placeholder="姓名" />
                    <div className="hidden border-b border-gray-400 h-7" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">車主簽名</p>
                    <div className="border-b border-gray-400 h-8" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 pt-1">本結算單由系統自動生成，如有疑問請聯繫富詠運輸管理部門。</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
