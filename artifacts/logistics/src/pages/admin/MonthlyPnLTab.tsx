import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { RefreshCw, PlusCircle, Save, Zap, Printer, Edit2, Check, X, ChevronRight } from "lucide-react";

// ─── 常數 ──────────────────────────────────────────────────────────────────────
const DEFAULT_CUSTOMERS = [
  "天賜爾","貝克休斯","佳禾","佶慶","協新","和成","昆言",
  "東友","迎輝","保綱","新鑫","嘉敬","福星高","聚創",
  "聯發","薇薾登","鑫詮","其他",
];
const DEFAULT_DRIVERS = ["黃成裕(小鳥)","泰立","甘秉弘","吳昱陞","鄧澤民","楊忠祥"];
const EXPENSE_LABELS: Record<string, string> = {
  rent: "租金支出", fuel: "油資", telecom: "郵電費",
  facebook_ads: "FB廣告費", utilities: "水電費", entertainment: "交際費",
  labor: "勞務費", maintenance: "修繕保養", fines: "罰單",
};
const fmtN = (n: number) => n === 0 ? "" : n.toLocaleString();
const fmtCell = (n: number) => n === 0 ? "—" : n.toLocaleString();
const num = (v: any) => parseFloat(String(v ?? 0)) || 0;

interface Report { id: number; roc_year: number; month: number; status: string; created_at: string; }
interface PnlData {
  customers: string[];
  drivers: string[];
  transport_income: Record<string, number>;
  parking_income: number;
  fuel_price_diff: number;
  misc_income: number;
  revenue_adj: {
    prev_month_invoice: Record<string, number>;
    next_month_invoice: Record<string, number>;
    deductions: Record<string, number>;
    agency_receipts: number;
    adj_fines: Record<string, number>;
  };
  driver_costs: Record<string, Record<string, number>>;
  expenses: Record<string, number>;
  other_expenses_per_customer: Record<string, number>;
  income_tax: number;
}

// ─── 計算工具 ─────────────────────────────────────────────────────────────────
function calcTotals(data: PnlData) {
  const custs = data.customers;
  const transportTotal = custs.reduce((s, c) => s + num(data.transport_income[c]), 0);
  const otherRevTotal  = num(data.parking_income) + num(data.fuel_price_diff) + num(data.misc_income);
  const revenueByCustomer = Object.fromEntries(
    custs.map(c => [c, num(data.transport_income[c])])
  );
  revenueByCustomer["其他"] = (revenueByCustomer["其他"] ?? 0) + otherRevTotal;

  const driverCostByCustomer: Record<string, number> = Object.fromEntries(custs.map(c => [c, 0]));
  for (const driver of data.drivers) {
    for (const c of custs) {
      driverCostByCustomer[c] = (driverCostByCustomer[c] ?? 0) + num(data.driver_costs[driver]?.[c]);
    }
  }

  const totalDriverCost = custs.reduce((s, c) => s + driverCostByCustomer[c], 0);
  const totalExpenses   = Object.values(data.expenses ?? {}).reduce((s, v) => s + num(v), 0);
  const otherExpPerCust = data.other_expenses_per_customer ?? {};
  const totalOtherExp   = custs.reduce((s, c) => s + num(otherExpPerCust[c]), 0);
  const grandExpenses   = totalExpenses + totalOtherExp;

  const netByCustomer: Record<string, number> = Object.fromEntries(
    custs.map(c => {
      const rev  = num(data.transport_income[c]) + (c === "其他" ? otherRevTotal : 0);
      const cost = driverCostByCustomer[c];
      const exp  = c === "其他"
        ? totalExpenses + num(otherExpPerCust[c])
        : num(otherExpPerCust[c]);
      return [c, rev - cost - exp];
    })
  );
  const netTotal = custs.reduce((s, c) => s + netByCustomer[c], 0) - num(data.income_tax);

  // 銷貨收入調節表
  const adjInvoiceByCustomer: Record<string, number> = Object.fromEntries(
    custs.map(c => {
      const base   = num(data.transport_income[c]);
      const prev   = num(data.revenue_adj?.prev_month_invoice?.[c]);
      const nxt    = num(data.revenue_adj?.next_month_invoice?.[c]);
      const deduct = num(data.revenue_adj?.deductions?.[c]);
      const fines  = num(data.revenue_adj?.adj_fines?.[c]);
      return [c, base + prev + nxt + deduct + fines];
    })
  );
  const miscInvoice = num(data.misc_income) + num(data.revenue_adj?.agency_receipts);
  adjInvoiceByCustomer["其他"] = (adjInvoiceByCustomer["其他"] ?? 0) + miscInvoice;
  const adjTotal = custs.reduce((s, c) => s + adjInvoiceByCustomer[c], 0);

  return {
    transportTotal, otherRevTotal, revenueByCustomer,
    driverCostByCustomer, totalDriverCost, totalExpenses,
    totalOtherExp, grandExpenses, netByCustomer, netTotal,
    adjInvoiceByCustomer, adjTotal,
  };
}

// ─── 可編輯數字格 ─────────────────────────────────────────────────────────────
function EditCell({ value, onChange, editing }: {
  value: number; onChange: (v: number) => void; editing: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  if (!editing) return <span className={value < 0 ? "text-red-600" : ""}>{fmtCell(value)}</span>;
  return (
    <input
      ref={ref}
      type="number"
      defaultValue={value === 0 ? "" : value}
      onBlur={e => onChange(parseFloat(e.target.value) || 0)}
      onKeyDown={e => { if (e.key === "Enter") ref.current?.blur(); }}
      className="w-full text-right bg-yellow-50 border border-yellow-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-400"
    />
  );
}

// ─── 主元件 ───────────────────────────────────────────────────────────────────
export default function MonthlyPnLTab() {
  const [reports, setReports]       = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pnlData, setPnlData]       = useState<PnlData | null>(null);
  const [reportMeta, setReportMeta] = useState<Report | null>(null);
  const [loading, setLoading]       = useState(false);
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [activeTab, setActiveTab]   = useState<"pnl" | "adj">("pnl");
  const [createRocYear, setCreateRocYear] = useState(115);
  const [createMonth, setCreateMonth]     = useState(3);
  const [showCreate, setShowCreate]       = useState(false);

  const loadList = useCallback(async () => {
    const r = await fetch(apiUrl("/monthly-pnl")).then(x => x.json());
    if (r.ok) setReports(r.reports ?? []);
  }, []);

  const loadReport = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl(`/monthly-pnl/${id}`)).then(x => x.json());
      if (r.ok) {
        const d = r.report.data as PnlData;
        if (!d.revenue_adj) d.revenue_adj = {
          prev_month_invoice: {}, next_month_invoice: {},
          deductions: {}, agency_receipts: 0, adj_fines: {},
        };
        if (!d.other_expenses_per_customer) d.other_expenses_per_customer = {};
        setPnlData(d);
        setReportMeta(r.report);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedId) loadReport(selectedId);
    else { setPnlData(null); setReportMeta(null); }
  }, [selectedId, loadReport]);

  const createReport = async () => {
    const r = await fetch(apiUrl("/monthly-pnl"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roc_year: createRocYear, month: createMonth }),
    }).then(x => x.json());
    if (r.ok) {
      toast.success(`${createRocYear}年${createMonth}月損益表已建立`);
      await loadList();
      setSelectedId(r.report.id);
      setShowCreate(false);
    } else {
      toast.error(r.error ?? "建立失敗");
    }
  };

  const save = async () => {
    if (!selectedId || !pnlData) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/monthly-pnl/${selectedId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: pnlData }),
      });
      toast.success("已儲存");
      setEditing(false);
    } catch { toast.error("儲存失敗"); }
    finally { setSaving(false); }
  };

  const autoFill = async () => {
    if (!selectedId) return;
    setAutofilling(true);
    try {
      const r = await fetch(apiUrl(`/monthly-pnl/${selectedId}/autofill`), { method: "POST" }).then(x => x.json());
      if (r.ok) {
        toast.success(`已從訂單自動填入運輸收入（${r.orders_found} 筆訂單）`);
        await loadReport(selectedId);
      } else {
        toast.error(r.error ?? "自動填入失敗");
      }
    } finally { setAutofilling(false); }
  };

  // ── 更新 pnlData helpers ──
  const setTransport = (customer: string, val: number) => {
    setPnlData(d => d ? { ...d, transport_income: { ...d.transport_income, [customer]: val } } : d);
  };
  const setDriverCost = (driver: string, customer: string, val: number) => {
    setPnlData(d => {
      if (!d) return d;
      return { ...d, driver_costs: { ...d.driver_costs, [driver]: { ...(d.driver_costs[driver] ?? {}), [customer]: val } } };
    });
  };
  const setExpense = (key: string, val: number) => {
    setPnlData(d => d ? { ...d, expenses: { ...d.expenses, [key]: val } } : d);
  };
  const setOtherExpCust = (customer: string, val: number) => {
    setPnlData(d => d ? { ...d, other_expenses_per_customer: { ...(d.other_expenses_per_customer ?? {}), [customer]: val } } : d);
  };
  const setAdj = (field: string, customer: string | null, val: number) => {
    setPnlData(d => {
      if (!d) return d;
      const adj = { ...(d.revenue_adj ?? {}) } as any;
      if (customer === null) adj[field] = val;
      else adj[field] = { ...(adj[field] ?? {}), [customer]: val };
      return { ...d, revenue_adj: adj };
    });
  };

  if (!pnlData && !loading) {
    // ── 選擇或建立月報 ──
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-xl font-bold">富詠運輸 月度損益表</h2>
          <p className="text-sm text-muted-foreground mt-0.5">選擇月份或建立新月報</p>
        </div>

        {reports.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">選擇已有月報</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {reports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  >
                    <p className="font-semibold">{r.roc_year}年{r.month}月</p>
                    <Badge variant="outline" className="text-xs mt-1">
                      {r.status === "final" ? "✅ 結算完成" : "草稿"}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">建立新月報</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={String(createRocYear)} onValueChange={v => setCreateRocYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[113,114,115,116].map(y => <SelectItem key={y} value={String(y)}>{y}年（民）</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(createMonth)} onValueChange={v => setCreateMonth(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({length:12},(_,i)=>i+1).map(m => (
                    <SelectItem key={m} value={String(m)}>{m}月</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createReport}>
                <PlusCircle className="w-4 h-4 mr-2" />
                建立 {createRocYear}年{createMonth}月
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />載入中...</div>;
  if (!pnlData) return null;

  const custs = pnlData.customers;
  const totals = calcTotals(pnlData);

  // ── 通用表格標頭 ──
  const colClass = "text-right text-xs px-2 py-1.5 border-b border-r border-slate-200 whitespace-nowrap";
  const hdrClass = "text-right text-xs font-bold px-2 py-2 bg-slate-100 border-b border-r border-slate-300 whitespace-nowrap";
  const rowLabelClass = "text-left text-xs px-2 py-1.5 border-b border-r border-slate-200 font-medium bg-slate-50 whitespace-nowrap sticky left-0 z-10";
  const groupHdrClass = "text-left text-xs font-bold px-2 py-1.5 bg-blue-50 border-b border-slate-200 sticky left-0 z-10";
  const calcClass = "text-right text-xs font-semibold px-2 py-1.5 border-b border-r border-slate-200 bg-slate-50 whitespace-nowrap";

  const cellVal = (v: number) => (
    <span className={v < 0 ? "text-red-600 font-medium" : v === 0 ? "text-slate-300" : ""}>
      {v === 0 ? "—" : v.toLocaleString()}
    </span>
  );

  // ── 合計欄 ──
  const transportGrand   = custs.reduce((s, c) => s + num(pnlData.transport_income[c]), 0);
  const driverCostGrand  = custs.reduce((s, c) => s + totals.driverCostByCustomer[c], 0);
  const otherExpGrand    = custs.reduce((s, c) => s + num(pnlData.other_expenses_per_customer?.[c]), 0);
  const expenseGrand     = Object.values(pnlData.expenses ?? {}).reduce((s, v) => s + num(v), 0) + otherExpGrand;
  const netGrand         = custs.reduce((s, c) => s + totals.netByCustomer[c], 0) - num(pnlData.income_tax);

  return (
    <div className="flex flex-col h-full">
      {/* ── 頂部工具列 ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-white sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedId(null)} className="text-xs text-muted-foreground hover:text-foreground">← 月報列表</button>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-bold text-sm">
            {reportMeta?.roc_year}年{reportMeta?.month}月 損益表
          </span>
          <Badge variant={reportMeta?.status === "final" ? "default" : "outline"} className="text-xs">
            {reportMeta?.status === "final" ? "✅ 完成" : "草稿"}
          </Badge>
        </div>

        <div className="flex-1" />

        <Button size="sm" variant="outline" onClick={autoFill} disabled={autofilling || editing}>
          <Zap className={`w-3.5 h-3.5 mr-1.5 ${autofilling ? "animate-pulse" : ""}`} />
          {autofilling ? "抓取中..." : "自動填入運輸收入"}
        </Button>

        {editing ? (
          <>
            <Button size="sm" onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {saving ? "儲存中..." : "儲存"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); loadReport(selectedId!); }}>
              <X className="w-3.5 h-3.5 mr-1.5" />
              取消
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit2 className="w-3.5 h-3.5 mr-1.5" />
            編輯
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1.5" />
          列印
        </Button>
      </div>

      {/* ── 子頁籤 ── */}
      <div className="flex border-b bg-white px-4 gap-1">
        {([["pnl","損益表"],["adj","銷貨收入調節表"]] as [string,string][]).map(([k,label]) => (
          <button
            key={k}
            onClick={() => setActiveTab(k as any)}
            className={`text-sm px-4 py-2 border-b-2 font-medium transition-colors ${activeTab === k ? "border-blue-600 text-blue-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 損益表 ── */}
      {activeTab === "pnl" && (
        <div className="overflow-auto flex-1 print:overflow-visible">
          <div className="p-2 print:p-0">
            <div className="text-center mb-3 print:mb-4">
              <p className="text-base font-bold">富詠運輸有限公司</p>
              <p className="text-sm font-bold">損  益  表</p>
              <p className="text-xs text-muted-foreground">{reportMeta?.roc_year}年{reportMeta?.month}月</p>
            </div>

            <table className="w-max text-sm border-collapse border border-slate-300 print:text-xs">
              <thead>
                <tr>
                  <th className={`${hdrClass} text-left sticky left-0 z-10 min-w-[120px]`}>項目╲客戶</th>
                  {custs.map(c => <th key={c} className={hdrClass}>{c}</th>)}
                  <th className={`${hdrClass} bg-blue-100`}>合  計</th>
                </tr>
              </thead>
              <tbody>
                {/* ── 運輸收入 ── */}
                <tr><td className={groupHdrClass} colSpan={custs.length + 2}>收  入</td></tr>
                <tr>
                  <td className={rowLabelClass}>運輸收入</td>
                  {custs.map(c => (
                    <td key={c} className={colClass}>
                      <EditCell value={num(pnlData.transport_income[c])} onChange={v => setTransport(c, v)} editing={editing} />
                    </td>
                  ))}
                  <td className={`${calcClass} bg-blue-50`}>{cellVal(transportGrand)}</td>
                </tr>

                {/* 靠行收入 / 油資價差 / 其他收入 — 只填「其他」欄 */}
                {[
                  ["parking_income",  "靠行收入"],
                  ["fuel_price_diff", "油資價差"],
                  ["misc_income",     "其他收入"],
                ].map(([key, label]) => (
                  <tr key={key}>
                    <td className={rowLabelClass}>{label}</td>
                    {custs.map(c => (
                      <td key={c} className={colClass}>
                        {c === "其他"
                          ? <EditCell value={num((pnlData as any)[key])} onChange={v => setPnlData(d => d ? { ...d, [key]: v } : d)} editing={editing} />
                          : <span className="text-slate-200">—</span>
                        }
                      </td>
                    ))}
                    <td className={`${calcClass} bg-blue-50`}>{cellVal(num((pnlData as any)[key]))}</td>
                  </tr>
                ))}

                {/* 總收入 */}
                <tr className="bg-blue-50/60">
                  <td className={`${rowLabelClass} font-bold text-blue-800`}>總  收  入</td>
                  {custs.map(c => {
                    const otherAdd = c === "其他" ? num(pnlData.parking_income)+num(pnlData.fuel_price_diff)+num(pnlData.misc_income) : 0;
                    const rev = num(pnlData.transport_income[c]) + otherAdd;
                    return <td key={c} className={`${calcClass} font-bold text-blue-800`}>{cellVal(rev)}</td>;
                  })}
                  <td className={`${calcClass} font-bold text-blue-800 bg-blue-100`}>
                    {cellVal(transportGrand + num(pnlData.parking_income)+num(pnlData.fuel_price_diff)+num(pnlData.misc_income))}
                  </td>
                </tr>

                {/* ── 運費成本 ── */}
                <tr><td className={groupHdrClass} colSpan={custs.length + 2}>運 費 成 本</td></tr>
                {pnlData.drivers.map(driver => (
                  <tr key={driver}>
                    <td className={rowLabelClass}>{driver}</td>
                    {custs.map(c => (
                      <td key={c} className={colClass}>
                        <EditCell
                          value={num(pnlData.driver_costs[driver]?.[c])}
                          onChange={v => setDriverCost(driver, c, v)}
                          editing={editing}
                        />
                      </td>
                    ))}
                    <td className={`${calcClass} bg-blue-50`}>
                      {cellVal(custs.reduce((s, c) => s + num(pnlData.driver_costs[driver]?.[c]), 0))}
                    </td>
                  </tr>
                ))}

                {/* 運費成本小計 = 總成本 */}
                <tr className="bg-orange-50/60">
                  <td className={`${rowLabelClass} font-bold text-orange-800`}>運費成本小計</td>
                  {custs.map(c => (
                    <td key={c} className={`${calcClass} font-bold text-orange-800`}>
                      {cellVal(totals.driverCostByCustomer[c])}
                    </td>
                  ))}
                  <td className={`${calcClass} font-bold text-orange-800 bg-orange-100`}>{cellVal(driverCostGrand)}</td>
                </tr>

                {/* ── 費用 ── */}
                <tr><td className={groupHdrClass} colSpan={custs.length + 2}>營 業 費 用</td></tr>
                {Object.entries(EXPENSE_LABELS).map(([key, label]) => (
                  <tr key={key}>
                    <td className={rowLabelClass}>{label}</td>
                    {custs.map(c => (
                      <td key={c} className={colClass}>
                        {c === "其他"
                          ? <EditCell value={num(pnlData.expenses[key])} onChange={v => setExpense(key, v)} editing={editing} />
                          : <span className="text-slate-200">—</span>
                        }
                      </td>
                    ))}
                    <td className={`${calcClass} bg-blue-50`}>{cellVal(num(pnlData.expenses[key]))}</td>
                  </tr>
                ))}

                {/* 其他費用（可按客戶分配）*/}
                <tr>
                  <td className={rowLabelClass}>其他費用</td>
                  {custs.map(c => (
                    <td key={c} className={colClass}>
                      <EditCell
                        value={num(pnlData.other_expenses_per_customer?.[c])}
                        onChange={v => setOtherExpCust(c, v)}
                        editing={editing}
                      />
                    </td>
                  ))}
                  <td className={`${calcClass} bg-blue-50`}>{cellVal(otherExpGrand)}</td>
                </tr>

                {/* 營業費用小計 */}
                <tr className="bg-red-50/50">
                  <td className={`${rowLabelClass} font-bold text-red-800`}>營  業  費  用</td>
                  {custs.map(c => {
                    const total = (c === "其他" ? expenseGrand - otherExpGrand : 0) + num(pnlData.other_expenses_per_customer?.[c]);
                    return <td key={c} className={`${calcClass} font-bold text-red-800`}>{cellVal(total)}</td>;
                  })}
                  <td className={`${calcClass} font-bold text-red-800 bg-red-100`}>{cellVal(expenseGrand)}</td>
                </tr>

                {/* 營所稅費用 */}
                <tr>
                  <td className={rowLabelClass}>營所稅費用</td>
                  {custs.map(c => (
                    <td key={c} className={colClass}>
                      {c === "其他"
                        ? <EditCell value={num(pnlData.income_tax)} onChange={v => setPnlData(d => d ? { ...d, income_tax: v } : d)} editing={editing} />
                        : <span className="text-slate-200">—</span>
                      }
                    </td>
                  ))}
                  <td className={`${calcClass} bg-blue-50`}>{cellVal(num(pnlData.income_tax))}</td>
                </tr>

                {/* 淨利 */}
                <tr className="bg-green-50/60">
                  <td className={`${rowLabelClass} font-bold text-green-800`}>營業淨利（損）</td>
                  {custs.map(c => {
                    const v = totals.netByCustomer[c] - (c === "其他" ? num(pnlData.income_tax) : 0);
                    return (
                      <td key={c} className={`text-right text-xs font-bold px-2 py-1.5 border-b border-r border-slate-200 ${v < 0 ? "text-red-700 bg-red-50" : "text-green-700 bg-green-50"}`}>
                        {cellVal(v)}
                      </td>
                    );
                  })}
                  <td className={`text-right text-xs font-bold px-2 py-1.5 border-b border-r ${netGrand < 0 ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100"}`}>
                    {cellVal(netGrand)}
                  </td>
                </tr>
              </tbody>
            </table>

            {editing && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
                ✏️ 編輯模式：點擊數字格可輸入，Enter 或點擊其他地方確認。完成後請按「儲存」。
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 銷貨收入調節表 ── */}
      {activeTab === "adj" && (
        <div className="overflow-auto flex-1 print:overflow-visible">
          <div className="p-2 print:p-0">
            <div className="text-center mb-3">
              <p className="text-base font-bold">富詠運輸有限公司</p>
              <p className="text-sm font-bold">銷 貨 收 入 調 節 表</p>
              <p className="text-xs text-muted-foreground">{reportMeta?.roc_year}年{reportMeta?.month}月31日</p>
            </div>

            <table className="w-max text-sm border-collapse border border-slate-300 print:text-xs">
              <thead>
                <tr>
                  <th className={`${hdrClass} text-left sticky left-0 z-10 min-w-[160px]`}>項目╲客戶</th>
                  {custs.map(c => <th key={c} className={hdrClass}>{c}</th>)}
                  <th className={`${hdrClass} bg-blue-100`}>合  計</th>
                </tr>
              </thead>
              <tbody>
                {/* 運輸收入 */}
                <tr>
                  <td className={rowLabelClass}>運輸收入</td>
                  {custs.map(c => (
                    <td key={c} className={colClass}>
                      <EditCell value={num(pnlData.transport_income[c])} onChange={v => setTransport(c, v)} editing={editing} />
                    </td>
                  ))}
                  <td className={`${calcClass} bg-blue-50`}>{cellVal(transportGrand)}</td>
                </tr>

                {/* 其他收入 */}
                <tr>
                  <td className={rowLabelClass}>其他收入</td>
                  {custs.map(c => (
                    <td key={c} className={colClass}>
                      {c === "其他"
                        ? <EditCell value={num(pnlData.misc_income)} onChange={v => setPnlData(d => d ? { ...d, misc_income: v } : d)} editing={editing} />
                        : <span className="text-slate-200">—</span>}
                    </td>
                  ))}
                  <td className={`${calcClass} bg-blue-50`}>{cellVal(num(pnlData.misc_income))}</td>
                </tr>

                {/* 調節項目 */}
                {[
                  ["prev_month_invoice", `${reportMeta?.month! - 1}月收入${reportMeta?.month}月發票`, false],
                  ["next_month_invoice", `${reportMeta?.month}月收入${reportMeta?.month! + 1}月發票`, false],
                  ["deductions", "扣除費用", false],
                  ["agency_receipts", "代收代付", true],
                  ["adj_fines", "罰單", false],
                ].map(([field, label, isScalar]) => (
                  <tr key={field as string}>
                    <td className={rowLabelClass}>{label as string}</td>
                    {custs.map(c => (
                      <td key={c} className={colClass}>
                        {isScalar
                          ? c === "其他"
                            ? <EditCell value={num(pnlData.revenue_adj?.[field as any])} onChange={v => setAdj(field as string, null, v)} editing={editing} />
                            : <span className="text-slate-200">—</span>
                          : <EditCell value={num(pnlData.revenue_adj?.[field as any]?.[c])} onChange={v => setAdj(field as string, c, v)} editing={editing} />
                        }
                      </td>
                    ))}
                    <td className={`${calcClass} bg-blue-50`}>
                      {cellVal(isScalar
                        ? num(pnlData.revenue_adj?.[field as any])
                        : custs.reduce((s, c) => s + num(pnlData.revenue_adj?.[field as any]?.[c]), 0)
                      )}
                    </td>
                  </tr>
                ))}

                {/* 發票開立金額（未稅） */}
                <tr className="bg-blue-50">
                  <td className={`${rowLabelClass} font-bold text-blue-800`}>發票開立金額（未稅）</td>
                  {custs.map(c => (
                    <td key={c} className={`${calcClass} font-bold text-blue-800`}>
                      {cellVal(totals.adjInvoiceByCustomer[c])}
                    </td>
                  ))}
                  <td className={`${calcClass} font-bold text-blue-800 bg-blue-100`}>{cellVal(totals.adjTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
