import { useState, useEffect, useCallback } from "react";
import {
  Fuel, CreditCard, BarChart2, RefreshCw, Plus, Edit2,
  PowerOff, ChevronDown, Download, AlertCircle, CheckCircle2,
  FileText, Droplets,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── 工具 ─────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("auth-jwt");
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

const NT = (v: number | string | null | undefined) =>
  `NT$ ${Number(v ?? 0).toLocaleString()}`;

function nowPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(p: string) {
  const [y, m] = p.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

// ─── Types ────────────────────────────────────────────────────
interface FuelCard {
  id: number;
  fleet_id: number;
  fleet_name: string;
  vehicle_plate: string;
  driver_name: string | null;
  card_no: string | null;
  card_type: string;
  monthly_limit: number | null;
  is_active: boolean;
  note: string | null;
  total_fills: number;
  total_amount: number;
}

interface VehicleReport {
  fleet_id: number;
  fleet_name: string;
  vehicle_plate: string;
  card_no: string | null;
  card_type: string | null;
  driver_name: string | null;
  fill_count: number;
  total_liters: number;
  total_amount: number;
  total_rebate: number;
  deducted_count: number;
}

interface GrandTotal {
  vehicle_count: number;
  fill_count: number;
  total_liters: number;
  total_amount: number;
  total_rebate: number;
}

// ─── KPI Card ─────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent: string;
}) {
  return (
    <Card className="border border-white/10 bg-white/5">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400">{label}</p>
            <p className={`text-xl font-bold mt-0.5 ${accent}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <Icon className={`w-5 h-5 mt-0.5 ${accent} opacity-60`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 1 — 加油卡清單
// ═══════════════════════════════════════════════════════════════
function CardListTab() {
  const { toast } = useToast();
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(nowPeriod());

  // 補填卡號 dialog
  const [editCard, setEditCard] = useState<FuelCard | null>(null);
  const [editNo, setEditNo] = useState("");
  const [editDriver, setEditDriver] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        apiUrl(`/fuel-cards/cards?fleet_id=170`),
        { headers: authHeaders() }
      );
      const d = await r.json();
      setCards(d.cards ?? []);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  async function handleToggleActive(card: FuelCard) {
    try {
      const r = await fetch(apiUrl(`/fuel-cards/cards/${card.id}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ is_active: !card.is_active }),
      });
      if (!r.ok) throw new Error();
      toast({ title: card.is_active ? "已停用加油卡" : "已啟用加油卡" });
      fetchCards();
    } catch {
      toast({ title: "操作失敗", variant: "destructive" });
    }
  }

  async function handleSaveEdit() {
    if (!editCard) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editNo.trim()) body.card_no = editNo.trim();
      if (editDriver.trim()) body.driver_name = editDriver.trim();
      if (editLimit) body.monthly_limit = Number(editLimit);

      const r = await fetch(apiUrl(`/fuel-cards/cards/${editCard.id}`), {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast({ title: "✅ 加油卡已更新" });
      setEditCard(null);
      fetchCards();
    } catch {
      toast({ title: "儲存失敗", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const active   = cards.filter(c => c.is_active).length;
  const inactive = cards.filter(c => !c.is_active).length;
  const noCard   = cards.filter(c => !c.card_no).length;

  return (
    <div className="space-y-5">
      {/* KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="加油卡總數" value={String(cards.length)} icon={CreditCard} accent="text-blue-400" />
        <KpiCard label="啟用中" value={String(active)} icon={CheckCircle2} accent="text-emerald-400" />
        <KpiCard label="停用/待補卡號" value={`${inactive} / ${noCard}`} icon={AlertCircle} accent="text-amber-400" />
        <KpiCard
          label="本月代墊合計"
          value={NT(cards.reduce((s, c) => s + Number(c.total_amount), 0))}
          icon={Fuel}
          accent="text-violet-400"
        />
      </div>

      {/* 表格 */}
      <Card className="border border-white/10 bg-white/5">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" /> 加油卡清單
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={fetchCards} className="text-slate-400 hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-slate-500">載入中…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400">
                    <th className="text-left px-4 py-2.5">車牌</th>
                    <th className="text-left px-4 py-2.5">司機</th>
                    <th className="text-left px-4 py-2.5">卡號</th>
                    <th className="text-left px-4 py-2.5">類型</th>
                    <th className="text-right px-4 py-2.5">月限額</th>
                    <th className="text-right px-4 py-2.5">加油次數</th>
                    <th className="text-right px-4 py-2.5">累計金額</th>
                    <th className="text-center px-4 py-2.5">狀態</th>
                    <th className="text-center px-4 py-2.5">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(card => (
                    <tr key={card.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-300">{card.vehicle_plate}</td>
                      <td className="px-4 py-3 text-slate-300">{card.driver_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {card.card_no
                          ? <span className="text-slate-200">{card.card_no}</span>
                          : <span className="text-amber-400 italic">（待補）</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-blue-900/50 text-blue-300 border-blue-700 text-xs">
                          {card.card_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 text-xs">
                        {card.monthly_limit ? NT(card.monthly_limit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{card.total_fills}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">{NT(card.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={card.is_active
                          ? "bg-emerald-900/50 text-emerald-400 border-emerald-700 text-xs"
                          : "bg-slate-800 text-slate-500 border-slate-700 text-xs"}>
                          {card.is_active ? "啟用" : "停用"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-xs text-blue-400 hover:text-blue-200"
                            onClick={() => {
                              setEditCard(card);
                              setEditNo(card.card_no ?? "");
                              setEditDriver(card.driver_name ?? "");
                              setEditLimit(card.monthly_limit ? String(card.monthly_limit) : "");
                            }}
                          >
                            <Edit2 className="w-3 h-3 mr-1" /> 編輯
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className={`h-7 px-2 text-xs ${card.is_active
                              ? "text-red-400 hover:text-red-200"
                              : "text-emerald-400 hover:text-emerald-200"}`}
                            onClick={() => handleToggleActive(card)}
                          >
                            <PowerOff className="w-3 h-3 mr-1" />
                            {card.is_active ? "停用" : "啟用"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cards.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-slate-500">尚無加油卡資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 補填卡號 Dialog */}
      <Dialog open={!!editCard} onOpenChange={open => !open && setEditCard(null)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400" />
              編輯加油卡 — {editCard?.vehicle_plate}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">卡號</Label>
              <Input
                className="bg-slate-800 border-white/10 text-white"
                placeholder="CPC88012345XXXXX（選填）"
                value={editNo}
                onChange={e => setEditNo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">司機姓名</Label>
              <Input
                className="bg-slate-800 border-white/10 text-white"
                placeholder="司機姓名（選填）"
                value={editDriver}
                onChange={e => setEditDriver(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">月限額（選填）</Label>
              <Input
                className="bg-slate-800 border-white/10 text-white"
                type="number"
                placeholder="例：8000"
                value={editLimit}
                onChange={e => setEditLimit(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-slate-400" onClick={() => setEditCard(null)}>取消</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleSaveEdit}
              disabled={saving}
            >
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 2 — 新增加油記錄
// ═══════════════════════════════════════════════════════════════
function AddRecordTab() {
  const { toast } = useToast();
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    card_id:      "",
    vehicle_plate:"",
    fleet_id:     "170",
    fuel_date:    today,
    fuel_station: "",
    liters:       "",
    amount:       "",
    receipt_no:   "",
    note:         "",
    period:       nowPeriod(),
  });

  useEffect(() => {
    fetch(apiUrl("/fuel-cards/cards?fleet_id=170"), { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setCards((d.cards ?? []).filter((c: FuelCard) => c.is_active)));
  }, []);

  const rebate = form.amount ? Math.round(Number(form.amount) * 0.01 * 100) / 100 : 0;

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  function handleCardSelect(cardId: string) {
    const card = cards.find(c => String(c.id) === cardId);
    setForm(f => ({
      ...f,
      card_id:       cardId,
      vehicle_plate: card?.vehicle_plate ?? "",
      fleet_id:      String(card?.fleet_id ?? 170),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicle_plate || !form.fuel_date || !form.amount) {
      toast({ title: "請填寫必填欄位", description: "車牌、日期、金額為必填", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        fleet_id:      Number(form.fleet_id),
        vehicle_plate: form.vehicle_plate,
        fuel_date:     form.fuel_date,
        amount:        Number(form.amount),
        period:        form.period,
      };
      if (form.card_id)      body.card_id      = Number(form.card_id);
      if (form.fuel_station) body.fuel_station  = form.fuel_station;
      if (form.liters)       body.liters        = Number(form.liters);
      if (form.receipt_no)   body.receipt_no    = form.receipt_no;
      if (form.note)         body.note          = form.note;

      const r = await fetch(apiUrl("/fuel-cards/record"), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "新增失敗");

      toast({
        title: "✅ 加油記錄已登錄",
        description: `${form.vehicle_plate}｜金額 NT$${form.amount}｜中油退款 NT$${rebate}`,
      });

      setForm(f => ({
        ...f, card_id: "", vehicle_plate: "", fuel_station: "",
        liters: "", amount: "", receipt_no: "", note: "",
        fuel_date: today,
      }));
    } catch (err: any) {
      toast({ title: "登錄失敗", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <Card className="border border-white/10 bg-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> 新增加油記錄
          </CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">富詠公司卡代墊，中油退款 1% 計入平台收益</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 選擇加油卡 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">
                選擇車牌 <span className="text-red-400">*</span>
              </Label>
              <Select value={form.card_id} onValueChange={handleCardSelect}>
                <SelectTrigger className="bg-slate-800 border-white/10 text-white">
                  <SelectValue placeholder="選擇車輛（從加油卡主檔）" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/10">
                  {cards.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-white hover:bg-slate-700">
                      <span className="font-mono font-bold text-blue-300">{c.vehicle_plate}</span>
                      <span className="text-slate-400 ml-2 text-xs">
                        {c.driver_name ? `— ${c.driver_name}` : ""}
                        {c.card_no ? ` ｜ ${c.card_no}` : " ｜ 卡號待補"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 日期 + 月份 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">
                  加油日期 <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="date" required
                  className="bg-slate-800 border-white/10 text-white"
                  value={form.fuel_date}
                  onChange={e => {
                    const v = e.target.value;
                    const p = v.slice(0, 7);
                    setForm(f => ({ ...f, fuel_date: v, period: p }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">結算月份</Label>
                <Input
                  className="bg-slate-800 border-white/10 text-slate-300"
                  value={form.period} readOnly
                  title="自動由加油日期帶入"
                />
              </div>
            </div>

            {/* 加油站 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">加油站名稱</Label>
              <Input
                className="bg-slate-800 border-white/10 text-white"
                placeholder="例：中油台北南機場站"
                value={form.fuel_station}
                onChange={e => set("fuel_station", e.target.value)}
              />
            </div>

            {/* 公升 + 金額 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">公升數</Label>
                <Input
                  type="number" step="0.01" min="0"
                  className="bg-slate-800 border-white/10 text-white"
                  placeholder="0.00"
                  value={form.liters}
                  onChange={e => set("liters", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">
                  金額（富詠代墊）<span className="text-red-400">*</span>
                </Label>
                <Input
                  type="number" step="0.01" min="0" required
                  className="bg-slate-800 border-white/10 text-white"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                />
              </div>
            </div>

            {/* 中油退款預覽 */}
            {rebate > 0 && (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5" /> 中油退款 1%（富詠收益）
                </span>
                <span className="text-emerald-300 font-bold text-sm">+ NT$ {rebate}</span>
              </div>
            )}

            {/* 油單號碼 + 備註 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">油單號碼</Label>
                <Input
                  className="bg-slate-800 border-white/10 text-white"
                  placeholder="CPC-XXXXXXXX"
                  value={form.receipt_no}
                  onChange={e => set("receipt_no", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">備註</Label>
                <Input
                  className="bg-slate-800 border-white/10 text-white"
                  placeholder="選填"
                  value={form.note}
                  onChange={e => set("note", e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              disabled={submitting || !form.vehicle_plate || !form.amount}
            >
              {submitting ? "登錄中…" : "登錄加油記錄"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab 3 — 月用油報表
// ═══════════════════════════════════════════════════════════════
function MonthlyReportTab() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(nowPeriod());
  const [rows, setRows] = useState<VehicleReport[]>([]);
  const [grand, setGrand] = useState<GrandTotal | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        apiUrl(`/fuel-cards/monthly-report?period=${period}`),
        { headers: authHeaders() }
      );
      const d = await r.json();
      setRows(d.by_vehicle ?? []);
      setGrand(d.grand_total ?? null);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [period, toast]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function exportCsv() {
    const header = "車牌,司機,加油次數,總公升,總金額,中油退款(1%),已扣款次數";
    const body = rows.map(r =>
      [r.vehicle_plate, r.driver_name ?? "", r.fill_count,
        Number(r.total_liters).toFixed(2),
        Number(r.total_amount).toFixed(0),
        Number(r.total_rebate).toFixed(2),
        r.deducted_count].join(",")
    ).join("\n");
    const footer = grand
      ? `合計,,${grand.fill_count},${Number(grand.total_liters).toFixed(2)},${Number(grand.total_amount).toFixed(0)},${Number(grand.total_rebate).toFixed(2)},`
      : "";
    const csv = `\uFEFF${header}\n${body}\n${footer}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `加油報表_${period}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "已匯出 CSV" });
  }

  // 月份選擇器
  function shiftMonth(delta: number) {
    const [y, m] = period.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-5">
      {/* 控制列 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg border border-white/10 px-3 py-1.5">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" onClick={() => shiftMonth(-1)}>‹</Button>
          <span className="text-sm font-semibold text-white min-w-[90px] text-center">{periodLabel(period)}</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400" onClick={() => shiftMonth(1)}>›</Button>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchReport} className="text-slate-400 hover:text-white border border-white/10">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> 重新整理
        </Button>
        <Button
          size="sm"
          className="bg-emerald-700 hover:bg-emerald-600 text-white ml-auto"
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" /> 匯出 CSV
        </Button>
      </div>

      {/* KPI 列 */}
      {grand && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="用油車輛" value={`${grand.vehicle_count} 台`} icon={Fuel} accent="text-blue-400" />
          <KpiCard label="加油次數" value={`${grand.fill_count} 次`} icon={FileText} accent="text-slate-300" />
          <KpiCard
            label="代墊油費合計"
            value={NT(grand.total_amount)}
            sub={`${Number(grand.total_liters).toFixed(1)} 公升`}
            icon={Droplets}
            accent="text-amber-400"
          />
          <KpiCard
            label="中油退款 1%"
            value={NT(grand.total_rebate)}
            sub="富詠平台收益"
            icon={BarChart2}
            accent="text-emerald-400"
          />
        </div>
      )}

      {/* 報表表格 */}
      <Card className="border border-white/10 bg-white/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-400" />
            {periodLabel(period)} 各車用油明細
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-slate-500">載入中…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400">
                    <th className="text-left px-4 py-2.5">車牌</th>
                    <th className="text-left px-4 py-2.5">司機</th>
                    <th className="text-left px-4 py-2.5">卡號</th>
                    <th className="text-right px-4 py-2.5">加油次數</th>
                    <th className="text-right px-4 py-2.5">公升數</th>
                    <th className="text-right px-4 py-2.5">代墊金額</th>
                    <th className="text-right px-4 py-2.5">中油退款(1%)</th>
                    <th className="text-right px-4 py-2.5">已月結扣款</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-300">{r.vehicle_plate}</td>
                      <td className="px-4 py-3 text-slate-300">{r.driver_name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.card_no ?? "（待補）"}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{r.fill_count} 次</td>
                      <td className="px-4 py-3 text-right text-slate-300">{Number(r.total_liters).toFixed(1)} L</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-300">{NT(r.total_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-400">{NT(r.total_rebate)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {r.deducted_count > 0
                          ? <Badge className="bg-emerald-900/40 text-emerald-400 border-emerald-800 text-xs">{r.deducted_count} 次</Badge>
                          : <Badge className="bg-slate-800 text-slate-500 border-slate-700 text-xs">未扣款</Badge>}
                      </td>
                    </tr>
                  ))}

                  {/* 合計列 */}
                  {grand && rows.length > 0 && (
                    <tr className="border-t-2 border-white/20 bg-slate-800/50 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-slate-300">合計</td>
                      <td className="px-4 py-3 text-right text-slate-300">{grand.fill_count} 次</td>
                      <td className="px-4 py-3 text-right text-slate-300">{Number(grand.total_liters).toFixed(1)} L</td>
                      <td className="px-4 py-3 text-right text-amber-300">{NT(grand.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{NT(grand.total_rebate)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">—</td>
                    </tr>
                  )}

                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-10 text-slate-500">{periodLabel(period)} 無用油記錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 主頁
// ═══════════════════════════════════════════════════════════════
export default function FuelCardManager() {
  return (
    <div
      className="min-h-screen text-white"
      style={{ background: "linear-gradient(135deg, #071829 0%, #0c2444 60%, #0f2d58 100%)" }}
    >
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)" }}>
            <Fuel className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">加油管理</h1>
            <p className="text-xs text-slate-400 mt-0.5">富詠公司卡代墊・中油退款 1%・車主月結扣款</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="cards">
          <TabsList className="bg-slate-800/70 border border-white/10 h-10 p-1 rounded-xl">
            <TabsTrigger
              value="cards"
              className="text-xs data-[state=active]:bg-blue-700 data-[state=active]:text-white text-slate-400 rounded-lg px-4"
            >
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> 加油卡清單
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="text-xs data-[state=active]:bg-emerald-700 data-[state=active]:text-white text-slate-400 rounded-lg px-4"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> 新增記錄
            </TabsTrigger>
            <TabsTrigger
              value="report"
              className="text-xs data-[state=active]:bg-amber-700 data-[state=active]:text-white text-slate-400 rounded-lg px-4"
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" /> 月用油報表
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="mt-4"><CardListTab /></TabsContent>
          <TabsContent value="add"   className="mt-4"><AddRecordTab /></TabsContent>
          <TabsContent value="report" className="mt-4"><MonthlyReportTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
