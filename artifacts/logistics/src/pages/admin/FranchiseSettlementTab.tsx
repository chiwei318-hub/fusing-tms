/**
 * FranchiseSettlementTab.tsx — 加盟主清算管理
 *
 * 功能：
 *  1. 費率設定（系統抽成 / 保險費 / 手續費）
 *  2. 清算預覽計算機
 *  3. 清算記錄列表（可按加盟主 / 司機篩選）
 *  4. 批次計算（選訂單批量生成清算）
 *  5. 標記撥款給加盟主
 *  6. 一鍵推送 ATOMS 淨分潤數據
 */
import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, Building2, Truck, RefreshCw, Send, Settings2,
  Calculator, ChevronRight, CheckCircle, AlertCircle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
interface RatesConfig {
  commissionRate: number;
  insuranceRate:  number;
  otherFeeRate:   number;
  otherFeeFixed:  number;
}

interface PreviewResult {
  totalFreight:     number;
  systemCommission: number;
  insuranceFee:     number;
  otherHandlingFee: number;
  totalDeductions:  number;
  franchiseePayout: number;
  effectiveRate:    number;
}

interface SettlementRow {
  id:                       number;
  order_id:                 number;
  order_no:                 string;
  driver_name:              string;
  driver_phone:             string;
  driver_vehicle_type:      string;
  franchisee_name:          string;
  franchisee_code:          string;
  pickup_date:              string;
  pickup_address:           string;
  delivery_address:         string;
  total_freight:            number;
  system_commission:        number;
  insurance_fee:            number;
  other_handling_fee:       number;
  total_deductions:         number;
  franchisee_payout:        number;
  payment_status:           string;
  franchisee_payment_status:string;
  franchisee_paid_at:       string | null;
  atoms_pushed_at:          string | null;
  created_at:               string;
}

interface SummaryData {
  total_orders:           number;
  total_freight:          number;
  total_system_commission:number;
  total_insurance_fee:    number;
  total_other_handling_fee:number;
  total_deductions:       number;
  total_franchisee_payout:number;
  unpaid_count:           number;
  paid_count:             number;
  pending_payout:         number;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n: number | string | undefined) =>
  Number(n ?? 0).toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("zh-TW") : "—";

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = "text-foreground" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 flex gap-3 items-start">
        <div className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FranchiseSettlementTab() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"list" | "calculator" | "config">("list");

  // ── Config state ──
  const [config, setConfig]       = useState<RatesConfig>({ commissionRate: 15, insuranceRate: 1, otherFeeRate: 0.5, otherFeeFixed: 0 });
  const [configDirty, setConfigDirty] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // ── Preview state ──
  const [previewFreight, setPreviewFreight] = useState("");
  const [preview, setPreview]     = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // ── List state ──
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [summary, setSummary]         = useState<SummaryData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [pushing, setPushing]         = useState(false);

  // ── Load config ──
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/franchise-settlements/config"));
      const data = await res.json();
      setConfig(data);
    } catch { /* silent */ }
  }, []);

  // ── Load settlements ──
  const loadSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterStatus !== "all") params.set("franchisee_payment_status", filterStatus);
      const [listRes, sumRes] = await Promise.all([
        fetch(apiUrl(`/franchise-settlements?${params}`)),
        fetch(apiUrl(`/franchise-settlements/summary`)),
      ]);
      const list = await listRes.json();
      const sum  = await sumRes.json();
      setSettlements(list.data ?? []);
      setSummary(sum);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadSettlements(); }, [loadSettlements]);

  // ── Save config ──
  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch(apiUrl("/franchise-settlements/config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) { toast({ title: "費率設定已儲存" }); setConfigDirty(false); }
      else toast({ title: "儲存失敗", variant: "destructive" });
    } finally { setSavingConfig(false); }
  };

  // ── Preview ──
  const runPreview = async () => {
    if (!previewFreight || isNaN(Number(previewFreight))) return;
    setPreviewing(true);
    try {
      const params = new URLSearchParams({
        total_freight:   previewFreight,
        commission_rate: String(config.commissionRate),
        insurance_rate:  String(config.insuranceRate),
        other_fee_rate:  String(config.otherFeeRate),
        other_fee_fixed: String(config.otherFeeFixed),
      });
      const res = await fetch(apiUrl(`/franchise-settlements/preview?${params}`));
      const data = await res.json();
      setPreview(data);
    } finally { setPreviewing(false); }
  };

  // ── Push to ATOMS ──
  const pushAtoms = async () => {
    setPushing(true);
    try {
      const res = await fetch(apiUrl("/franchise-settlements/push-atoms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      toast({ title: `已推送 ${data.pushed} 筆到 ATOMS（失敗 ${data.failed} 筆）` });
      loadSettlements();
    } catch {
      toast({ title: "推送失敗", variant: "destructive" });
    } finally { setPushing(false); }
  };

  // ── Mark paid ──
  const markPaid = async (id: number) => {
    try {
      const res = await fetch(apiUrl(`/franchise-settlements/${id}/pay-franchisee`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) { toast({ title: "✅ 已標記撥款完成" }); loadSettlements(); }
      else toast({ title: "更新失敗", variant: "destructive" });
    } catch { toast({ title: "更新失敗", variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            加盟主清算
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            每趟運費扣除平台服務費、保險費、手續費後撥付給加盟主；完成派車自動推送到 ATOMS
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadSettlements} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={pushAtoms} disabled={pushing}>
            <Send className="w-3.5 h-3.5" />
            {pushing ? "推送中…" : "推送 ATOMS"}
          </Button>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { id: "list"       as const, label: "清算列表", icon: <DollarSign className="w-3.5 h-3.5" /> },
          { id: "calculator" as const, label: "試算工具", icon: <Calculator className="w-3.5 h-3.5" /> },
          { id: "config"     as const, label: "費率設定", icon: <Settings2 className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button type="button" key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all border
              ${activeTab === t.id
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-indigo-300 hover:text-indigo-700"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── 清算列表 ── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={<Truck className="w-4 h-4 text-blue-600" />}
                label="總趟次" value={String(summary.total_orders)} />
              <StatCard icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
                label="總運費" value={`NT$ ${fmt(summary.total_freight)}`} />
              <StatCard icon={<DollarSign className="w-4 h-4 text-red-500" />}
                label="系統扣項" value={`NT$ ${fmt(summary.total_deductions)}`}
                sub={`抽成 ${fmt(summary.total_system_commission)} + 險 ${fmt(summary.total_insurance_fee)}`}
                color="text-red-600" />
              <StatCard icon={<Building2 className="w-4 h-4 text-indigo-600" />}
                label="已撥付加盟主" value={`NT$ ${fmt(summary.total_franchisee_payout)}`}
                color="text-indigo-700" />
              <StatCard icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
                label="待撥款" value={`NT$ ${fmt(summary.pending_payout)}`}
                sub={`${summary.unpaid_count} 筆未撥`}
                color="text-amber-600" />
              <StatCard icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
                label="已撥款筆數" value={`${summary.paid_count} 筆`} />
            </div>
          )}

          {/* Filter */}
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground shrink-0">加盟主付款</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="unpaid">待撥款</SelectItem>
                <SelectItem value="paid">已撥款</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card className="border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/60 border-b">
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">訂單</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap hidden sm:table-cell">司機</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap hidden md:table-cell">加盟主</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">總運費</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap hidden lg:table-cell">系統扣項</th>
                    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-indigo-700">撥付加盟主</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">付款狀態</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap hidden xl:table-cell">ATOMS</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                        尚無清算記錄，請於訂單完成後自動生成，或手動批次計算
                      </td>
                    </tr>
                  ) : settlements.map(s => (
                    <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-semibold text-primary">{s.order_no ?? `#${s.order_id}`}</div>
                        <div className="text-muted-foreground mt-0.5">{fmtDate(s.pickup_date ?? s.created_at)}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="font-medium">{s.driver_name ?? "—"}</div>
                        <div className="text-muted-foreground">{s.driver_vehicle_type ?? ""}</div>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="font-medium">{s.franchisee_name ?? "—"}</div>
                        <div className="text-muted-foreground">{s.franchisee_code ?? ""}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        NT$ {fmt(s.total_freight)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-red-600 hidden lg:table-cell">
                        <div>−NT$ {fmt(s.total_deductions)}</div>
                        <div className="text-muted-foreground text-[10px]">
                          抽 {fmt(s.system_commission)} + 險 {fmt(s.insurance_fee)} + 費 {fmt(s.other_handling_fee)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-bold text-indigo-700">NT$ {fmt(s.franchisee_payout)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {s.franchisee_payment_status === "paid" ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            <CheckCircle className="w-3 h-3 mr-1" />已撥款
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">
                            待撥款
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center hidden xl:table-cell">
                        {s.atoms_pushed_at ? (
                          <span className="text-[10px] text-emerald-600">✓ 已推</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {s.franchisee_payment_status !== "paid" && (
                          <button
                            onClick={() => markPaid(s.id)}
                            className="text-[10px] font-medium text-indigo-600 hover:underline px-2 py-1 border border-indigo-200 rounded-md hover:bg-indigo-50"
                          >
                            標記撥款
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ATOMS info */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>ATOMS 自動推送：</strong>訂單狀態改為「已送達」時，系統自動計算清算並推送
              <code className="mx-1 bg-blue-100 px-1 rounded">settlement.completed</code>
              事件到 ATOMS 加盟商後台。也可手動點「推送 ATOMS」補發所有未推送記錄。
            </span>
          </div>
        </div>
      )}

      {/* ── 試算工具 ── */}
      {activeTab === "calculator" && (
        <div className="max-w-lg space-y-5">
          <Card className="border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-600" />
                清算試算工具
              </CardTitle>
              <CardDescription>輸入每趟運費，即時看到各項扣款與加盟主到手金額</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">每趟運費 (NT$)</Label>
                <Input
                  type="number" min={0} step={100}
                  value={previewFreight}
                  onChange={e => setPreviewFreight(e.target.value)}
                  placeholder="例如：2000"
                  className="mt-1 h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                <div>系統服務費率：<strong className="text-foreground">{config.commissionRate}%</strong></div>
                <div>保險費率：<strong className="text-foreground">{config.insuranceRate}%</strong></div>
                <div>其他手續費率：<strong className="text-foreground">{config.otherFeeRate}%</strong></div>
                <div>固定手續費：<strong className="text-foreground">NT$ {config.otherFeeFixed}</strong></div>
              </div>

              <Button onClick={runPreview} disabled={previewing || !previewFreight} className="w-full gap-2">
                <Calculator className="w-4 h-4" />
                {previewing ? "計算中…" : "開始試算"}
              </Button>

              {preview && (
                <div className="space-y-3 border-t pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">試算結果</p>

                  {[
                    { label: "總運費（客戶付）", value: preview.totalFreight, color: "text-foreground", prefix: "" },
                    { label: "系統服務費（抽成）", value: preview.systemCommission, color: "text-red-600", prefix: "−" },
                    { label: "保險費", value: preview.insuranceFee, color: "text-red-600", prefix: "−" },
                    { label: "其他手續費", value: preview.otherHandlingFee, color: "text-red-600", prefix: "−" },
                    { label: "系統扣項合計", value: preview.totalDeductions, color: "text-red-700 font-bold", prefix: "−" },
                  ].map(({ label, value, color, prefix }) => (
                    <div key={label} className={`flex justify-between items-center py-1.5 border-b border-dashed border-border/50 text-sm ${color}`}>
                      <span className="text-muted-foreground text-xs">{label}</span>
                      <span className="font-semibold">{prefix}NT$ {fmt(value)}</span>
                    </div>
                  ))}

                  <div className="flex justify-between items-center py-2.5 bg-indigo-50 rounded-xl px-4 border border-indigo-200">
                    <span className="font-bold text-indigo-700 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      撥付給加盟主
                    </span>
                    <span className="text-xl font-black text-indigo-700">NT$ {fmt(preview.franchiseePayout)}</span>
                  </div>

                  <p className="text-center text-xs text-muted-foreground">
                    總扣除率 <strong>{preview.effectiveRate}%</strong>，加盟主實得 <strong>{(100 - preview.effectiveRate).toFixed(1)}%</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 費率設定 ── */}
      {activeTab === "config" && (
        <div className="max-w-md space-y-5">
          <Card className="border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                系統扣款費率設定
              </CardTitle>
              <CardDescription>
                修改後將套用於所有新計算的清算記錄，不影響已結算記錄
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "commissionRate" as keyof RatesConfig, label: "系統服務費率（%）", desc: "平台抽成，例如 15 = 15%" },
                { key: "insuranceRate"  as keyof RatesConfig, label: "保險費率（%）",     desc: "每趟運費的保險費比例" },
                { key: "otherFeeRate"   as keyof RatesConfig, label: "其他手續費率（%）", desc: "其他固定百分比費用" },
                { key: "otherFeeFixed"  as keyof RatesConfig, label: "固定手續費（NT$）", desc: "每趟固定加收的手續費金額" },
              ].map(({ key, label, desc }) => (
                <div key={key}>
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground mb-1">{desc}</p>
                  <Input
                    type="number" min={0} step={key === "otherFeeFixed" ? 10 : 0.1}
                    value={config[key]}
                    onChange={e => {
                      setConfig(c => ({ ...c, [key]: parseFloat(e.target.value) || 0 }));
                      setConfigDirty(true);
                    }}
                    className="h-10"
                  />
                </div>
              ))}

              {/* Preview panel */}
              {config && (
                <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-xs text-muted-foreground border">
                  <p className="font-semibold text-foreground mb-2">以 NT$2,000 運費為例：</p>
                  {(() => {
                    const t = 2000;
                    const comm = Math.round(t * config.commissionRate / 100);
                    const ins  = Math.round(t * config.insuranceRate  / 100);
                    const oth  = Math.round(t * config.otherFeeRate   / 100 + config.otherFeeFixed);
                    const ded  = comm + ins + oth;
                    const pay  = t - ded;
                    return (
                      <>
                        <div className="flex justify-between"><span>系統服務費</span><span className="text-red-600 font-medium">−NT$ {fmt(comm)}</span></div>
                        <div className="flex justify-between"><span>保險費</span><span className="text-red-600 font-medium">−NT$ {fmt(ins)}</span></div>
                        <div className="flex justify-between"><span>其他手續費</span><span className="text-red-600 font-medium">−NT$ {fmt(oth)}</span></div>
                        <div className="flex justify-between border-t pt-2 font-bold text-foreground">
                          <span>撥付加盟主</span><span className="text-indigo-700">NT$ {fmt(pay)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <Button onClick={saveConfig} disabled={savingConfig || !configDirty} className="w-full gap-2">
                <ChevronRight className="w-4 h-4" />
                {savingConfig ? "儲存中…" : "儲存費率設定"}
              </Button>

              {!configDirty && (
                <p className="text-center text-xs text-emerald-600 flex items-center justify-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 已是最新設定
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
