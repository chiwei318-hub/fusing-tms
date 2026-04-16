import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, RefreshCw, Edit, Trash2, CheckCircle2, AlertTriangle,
  TrendingDown, DollarSign, Calendar, Building2, Clock, ChevronDown, ChevronRight, FileText, X, Search
} from "lucide-react";

const API = import.meta.env.BASE_URL + "api";
const LOAN_TYPES = ["車輛貸款","設備貸款","營運周轉金","不動產貸款","其他"];
const BANKS = ["台灣銀行","合作金庫","第一銀行","華南銀行","彰化銀行","土地銀行","台灣企銀","中信銀行","玉山銀行","國泰世華","永豐銀行","台新銀行","元大銀行","兆豐銀行","其他"];

interface LoanAccount {
  id: number; loan_name: string; loan_type: string; bank_name?: string; bank_branch?: string;
  account_no?: string; vehicle_id?: number; plate_no?: string; principal: number;
  interest_rate: number; start_date: string; end_date: string; total_periods: number;
  monthly_payment: number; payment_day?: number; status: string;
  contact_person?: string; contact_phone?: string; notes?: string;
  brand?: string; model?: string; vehicle_type?: string;
  payments?: LoanPayment[];
}
interface LoanPayment {
  id: number; loan_id: number; period_no: number; due_date: string;
  principal_amt: number; interest_amt: number; total_amt: number; remaining_bal: number;
  paid_date?: string; paid_amount?: number; status: string; receipt_no?: string; notes?: string;
  loan_name?: string; plate_no?: string; bank_name?: string;
}
interface LoanStats {
  totalLoans: number; totalPrincipal: number; totalMonthly: number;
  remainingBalance: number; totalPaid: number; totalInterestPaid: number;
  overdueCount: number; overdueAmount: number;
  thisMonthCount: number; thisMonthAmount: number; upcomingCount: number;
  loanList: LoanAccount[]; recentPayments: LoanPayment[];
}

const STATUS_CFG: Record<string,{label:string;color:string;border:string}> = {
  pending:  {label:"待繳",color:"bg-amber-100 text-amber-700",border:"border-amber-300"},
  paid:     {label:"已繳",color:"bg-green-100 text-green-700",border:"border-green-300"},
  overdue:  {label:"逾期",color:"bg-red-100 text-red-700",border:"border-red-300"},
  active:   {label:"進行中",color:"bg-blue-100 text-blue-700",border:"border-blue-300"},
  closed:   {label:"已結清",color:"bg-gray-100 text-gray-500",border:"border-gray-300"},
  suspended:{label:"暫停",color:"bg-orange-100 text-orange-700",border:"border-orange-300"},
};

// ── Loan Form ────────────────────────────────────────────────────────────────
function LoanForm({ loan, vehicles, onClose, onSave }: { loan:LoanAccount|null; vehicles:any[]; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const isNew = !loan;
  const [form, setForm] = useState({
    loanName: loan?.loan_name ?? "", loanType: loan?.loan_type ?? "車輛貸款",
    bankName: loan?.bank_name ?? "", bankBranch: loan?.bank_branch ?? "",
    accountNo: loan?.account_no ?? "", vehicleId: loan?.vehicle_id ? String(loan.vehicle_id) : "",
    plateNo: loan?.plate_no ?? "", principal: String(loan?.principal ?? ""),
    interestRate: String(loan?.interest_rate ?? ""), startDate: loan?.start_date?.slice(0,10) ?? "",
    endDate: loan?.end_date?.slice(0,10) ?? "", totalPeriods: String(loan?.total_periods ?? ""),
    monthlyPayment: String(loan?.monthly_payment ?? ""), paymentDay: String(loan?.payment_day ?? "1"),
    status: loan?.status ?? "active", contactPerson: loan?.contact_person ?? "",
    contactPhone: loan?.contact_phone ?? "", notes: loan?.notes ?? "",
    generateSchedule: isNew,
  });
  const [loading, setLoading] = useState(false);
  function f(k:keyof typeof form,v:any){setForm(p=>({...p,[k]:v}));}

  // Auto-calc monthly payment (等額還款)
  function calcMonthly() {
    const p=parseFloat(form.principal), r=parseFloat(form.interestRate)/100/12, n=parseInt(form.totalPeriods);
    if (!p||!n) return;
    if (r===0) { f("monthlyPayment", (p/n).toFixed(0)); return; }
    const m = p * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
    f("monthlyPayment", m.toFixed(0));
  }

  async function submit() {
    if (!form.loanName||!form.startDate||!form.endDate) { toast({title:"請填寫貸款名稱和起訖日期",variant:"destructive"}); return; }
    setLoading(true);
    try {
      const selectedV = vehicles.find(v=>String(v.id)===form.vehicleId);
      const payload = { ...form, vehicleId:form.vehicleId?parseInt(form.vehicleId):undefined, plateNo:selectedV?.plate_no||form.plateNo, principal:parseFloat(form.principal)||0, interestRate:parseFloat(form.interestRate)||0, totalPeriods:parseInt(form.totalPeriods)||1, monthlyPayment:parseFloat(form.monthlyPayment)||0, paymentDay:parseInt(form.paymentDay)||1 };
      const url = isNew?`${API}/loans`:`${API}/loans/${loan!.id}`;
      const r = await fetch(url,{method:isNew?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      toast({title:isNew?"貸款已建立，還款明細已自動產生":"已更新"}); onSave();
    } catch(e:any){toast({title:"操作失敗",description:e.message,variant:"destructive"});}
    finally{setLoading(false);}
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600"/>{isNew?"新增貸款":"編輯貸款"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>貸款名稱 *</Label><Input value={form.loanName} onChange={e=>f("loanName",e.target.value)} placeholder="例：ABC-1234 車輛購車貸款"/></div>
          <div className="space-y-1"><Label>貸款類型</Label>
            <Select value={form.loanType} onValueChange={v=>f("loanType",v)}><SelectTrigger className="text-sm"><SelectValue/></SelectTrigger><SelectContent>{LOAN_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>狀態</Label>
            <Select value={form.status} onValueChange={v=>f("status",v)}><SelectTrigger className="text-sm"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(STATUS_CFG).filter(([k])=>["active","closed","suspended"].includes(k)).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>銀行</Label>
            <Select value={form.bankName||"__other"} onValueChange={v=>f("bankName",v==="__other"?"":v)}><SelectTrigger className="text-sm"><SelectValue placeholder="選擇銀行"/></SelectTrigger><SelectContent>{BANKS.map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>分行</Label><Input value={form.bankBranch} onChange={e=>f("bankBranch",e.target.value)} placeholder="台北分行"/></div>
          <div className="space-y-1"><Label>帳號</Label><Input value={form.accountNo} onChange={e=>f("accountNo",e.target.value)}/></div>
          <div className="space-y-1"><Label>關聯車輛</Label>
            <Select value={form.vehicleId||"__none"} onValueChange={v=>{if(v==="__none"){f("vehicleId","");}else{f("vehicleId",v);}}}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="選擇車輛（選填）"/></SelectTrigger>
              <SelectContent><SelectItem value="__none">─ 不關聯 ─</SelectItem>{vehicles.map(v=><SelectItem key={v.id} value={String(v.id)}>{v.plate_no} {v.vehicle_type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 border-t pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>貸款金額（元）</Label><Input type="number" value={form.principal} onChange={e=>f("principal",e.target.value)} placeholder="0"/></div>
              <div className="space-y-1"><Label>年利率（%）</Label><Input type="number" step="0.01" value={form.interestRate} onChange={e=>f("interestRate",e.target.value)} placeholder="2.5"/></div>
              <div className="space-y-1"><Label>期數（月）</Label><Input type="number" value={form.totalPeriods} onChange={e=>f("totalPeriods",e.target.value)} placeholder="60"/></div>
              <div className="space-y-1"><Label>每月還款（元）
                <button type="button" onClick={calcMonthly} className="ml-1 text-[10px] text-blue-600 underline">自動計算</button>
              </Label><Input type="number" value={form.monthlyPayment} onChange={e=>f("monthlyPayment",e.target.value)} placeholder="自動計算"/></div>
              <div className="space-y-1"><Label>每月繳款日</Label><Input type="number" min="1" max="31" value={form.paymentDay} onChange={e=>f("paymentDay",e.target.value)}/></div>
              <div className="space-y-1"><Label>貸款起始日 *</Label><Input type="date" value={form.startDate} onChange={e=>f("startDate",e.target.value)}/></div>
              <div className="space-y-1"><Label>貸款到期日 *</Label><Input type="date" value={form.endDate} onChange={e=>f("endDate",e.target.value)}/></div>
            </div>
          </div>
          <div className="space-y-1"><Label>聯絡人</Label><Input value={form.contactPerson} onChange={e=>f("contactPerson",e.target.value)}/></div>
          <div className="space-y-1"><Label>聯絡電話</Label><Input value={form.contactPhone} onChange={e=>f("contactPhone",e.target.value)}/></div>
          <div className="col-span-2 space-y-1"><Label>備註</Label><Textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={2}/></div>
          {isNew&&<div className="col-span-2 flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <input type="checkbox" id="gen" checked={form.generateSchedule} onChange={e=>f("generateSchedule",e.target.checked)} className="rounded"/>
            <label htmlFor="gen" className="text-xs text-blue-700 font-medium cursor-pointer">自動產生還款明細（依期數計算每期本金/利息/餘額）</label>
          </div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading?"儲存中...":(isNew?"建立貸款":"儲存變更")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Mark Paid Dialog ──────────────────────────────────────────────────────────
function MarkPaidDialog({ payment, onClose, onSave }: { payment:LoanPayment; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ paidDate: new Date().toISOString().slice(0,10), paidAmount: String(payment.total_amt), receiptNo: "" });
  const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/loan-payments/${payment.id}/mark-paid`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      toast({title:`第 ${payment.period_no} 期 已標記為已繳`}); onSave();
    } catch(e:any){toast({title:"失敗",description:e.message,variant:"destructive"});}
    finally{setLoading(false);}
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-green-600"><CheckCircle2 className="w-5 h-5"/>標記已繳款</DialogTitle></DialogHeader>
        <div className="text-sm bg-muted/40 rounded-lg p-3 space-y-1 mb-2">
          <div>{payment.loan_name} 第 <span className="font-bold">{payment.period_no}</span> 期</div>
          <div>應繳日：{payment.due_date?.slice(0,10)} ｜ 應繳：<span className="font-bold text-primary">NT${Number(payment.total_amt).toLocaleString()}</span></div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1"><Label>繳款日期</Label><Input type="date" value={form.paidDate} onChange={e=>setForm(p=>({...p,paidDate:e.target.value}))}/></div>
          <div className="space-y-1"><Label>實繳金額</Label><Input type="number" value={form.paidAmount} onChange={e=>setForm(p=>({...p,paidAmount:e.target.value}))}/></div>
          <div className="space-y-1"><Label>收據號碼</Label><Input value={form.receiptNo} onChange={e=>setForm(p=>({...p,receiptNo:e.target.value}))} placeholder="選填"/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={submit} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">{loading?"儲存中...":"確認已繳"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loan Detail (全部還款明細) ─────────────────────────────────────────────────
function LoanDetail({ loanId, onClose }: { loanId:number; onClose:()=>void }) {
  const { toast } = useToast(); const qc = useQueryClient();
  const [markPay, setMarkPay] = useState<LoanPayment|null>(null);
  const { data:loan } = useQuery<LoanAccount>({ queryKey:["loan-detail",loanId], queryFn:()=>fetch(`${API}/loans/${loanId}`).then(r=>r.json()) });
  if (!loan) return null;
  const today = new Date().toISOString().slice(0,10);
  const paid = (loan.payments||[]).filter(p=>p.status==="paid");
  const pending = (loan.payments||[]).filter(p=>p.status!=="paid");
  const paidTotal = paid.reduce((s,p)=>s+Number(p.paid_amount||p.total_amt),0);
  const remainTotal = pending.reduce((s,p)=>s+Number(p.total_amt),0);
  const pctDone = loan.total_periods>0 ? (paid.length/loan.total_periods*100) : 0;

  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-600"/>{loan.loan_name}
            <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_CFG[loan.status]?.color}`}>{STATUS_CFG[loan.status]?.label}</span>
          </DialogTitle>
        </DialogHeader>
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[["銀行",loan.bank_name||"─"],["貸款金額",`NT$${Number(loan.principal).toLocaleString()}`],["月還款",`NT$${Number(loan.monthly_payment).toLocaleString()}`],["利率",`${loan.interest_rate}%`]].map(([k,v])=>(
            <div key={k} className="bg-muted/40 rounded-lg p-2.5"><div className="text-muted-foreground">{k}</div><div className="font-semibold text-sm">{v}</div></div>
          ))}
        </div>
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>已繳 {paid.length}/{loan.total_periods} 期</span>
            <span>{pctDone.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all" style={{width:`${pctDone}%`}}/>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green-600 font-medium">已繳 NT${Math.round(paidTotal).toLocaleString()}</span>
            <span className="text-orange-600 font-medium">剩餘 NT${Math.round(remainTotal).toLocaleString()}</span>
          </div>
        </div>
        {/* Payment list */}
        <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 sticky top-0"><tr>{["期次","應繳日","本金","利息","應繳總額","剩餘餘額","狀態","繳款日","操作"].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {(loan.payments||[]).map(p=>{
                const isOverdue = p.status==="pending" && p.due_date<today;
                return (
                  <tr key={p.id} className={`${isOverdue?"bg-red-50/50":""} hover:bg-muted/20`}>
                    <td className="p-2 font-semibold">{p.period_no}</td>
                    <td className={`p-2 ${isOverdue?"text-red-600 font-semibold":""}`}>{p.due_date?.slice(0,10)}</td>
                    <td className="p-2">NT${Number(p.principal_amt).toLocaleString()}</td>
                    <td className="p-2 text-orange-600">NT${Number(p.interest_amt).toLocaleString()}</td>
                    <td className="p-2 font-semibold">NT${Number(p.total_amt).toLocaleString()}</td>
                    <td className="p-2 text-muted-foreground">NT${Number(p.remaining_bal).toLocaleString()}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isOverdue?"bg-red-100 text-red-700":STATUS_CFG[p.status]?.color}`}>{isOverdue?"逾期":STATUS_CFG[p.status]?.label}</span>
                    </td>
                    <td className="p-2">{p.paid_date?.slice(0,10)||"─"}</td>
                    <td className="p-2">
                      {p.status!=="paid"&&<button onClick={()=>setMarkPay(p)} className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 text-[10px] font-medium whitespace-nowrap">✓ 標記已繳</button>}
                    </td>
                  </tr>
                );
              })}
              {(loan.payments||[]).length===0&&<tr><td colSpan={9} className="p-6 text-center text-muted-foreground">尚無還款明細（建立貸款時可勾選自動產生）</td></tr>}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
      {markPay&&<MarkPaidDialog payment={markPay} onClose={()=>setMarkPay(null)} onSave={()=>{setMarkPay(null);qc.invalidateQueries({queryKey:["loan-detail",loanId]});qc.invalidateQueries({queryKey:["loan-stats"]});qc.invalidateQueries({queryKey:["loan-payments"]});}}/>}
    </Dialog>
  );
}

// ── Main LoanTab ──────────────────────────────────────────────────────────────
export default function LoanTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [view, setView] = useState<"overview"|"loans"|"events">("overview");
  const [search, setSearch] = useState("");
  const [evtFilter, setEvtFilter] = useState<"all"|"pending"|"overdue"|"paid">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LoanAccount|null>(null);
  const [detailId, setDetailId] = useState<number|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoanAccount|null>(null);
  const [markPay, setMarkPay] = useState<LoanPayment|null>(null);
  const today = new Date().toISOString().slice(0,10);

  const { data: stats, isLoading: statsLoading } = useQuery<LoanStats>({
    queryKey:["loan-stats"], queryFn:()=>fetch(`${API}/loans/stats`).then(r=>r.json()), refetchInterval:120000,
  });
  const { data: loans=[] } = useQuery<LoanAccount[]>({
    queryKey:["loans",search], queryFn:()=>{ const p=new URLSearchParams(); if(search)p.set("search",search); return fetch(`${API}/loans?${p}`).then(r=>r.json()); }, enabled: view==="loans",
  });
  const { data: payments=[] } = useQuery<LoanPayment[]>({
    queryKey:["loan-payments",evtFilter], queryFn:()=>{ const p=new URLSearchParams(); if(evtFilter!=="all")p.set("status",evtFilter); return fetch(`${API}/loan-payments?${p}`).then(r=>r.json()); }, enabled: view==="events",
  });
  const { data: vehicles=[] } = useQuery<any[]>({ queryKey:["vehicles-simple"], queryFn:()=>fetch(`${API}/vehicles`).then(r=>r.json()), staleTime:60000 });

  async function handleDelete() {
    if (!deleteTarget)return;
    await fetch(`${API}/loans/${deleteTarget.id}`,{method:"DELETE"});
    toast({title:"已刪除貸款"}); setDeleteTarget(null); qc.invalidateQueries({queryKey:["loans"]}); qc.invalidateQueries({queryKey:["loan-stats"]});
  }

  // Categorize payments for events view
  const overduePmts = payments.filter(p=>p.status!=="paid"&&p.due_date<today);
  const pendingPmts = payments.filter(p=>p.status!=="paid"&&p.due_date>=today);
  const paidPmts    = payments.filter(p=>p.status==="paid");

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="flex gap-1 border-b">
        {[["overview","📊 總覽統計"],["events","📅 還款事件"],["loans","🏦 貸款帳戶"]].map(([id,label])=>(
          <button key={id} onClick={()=>setView(id as any)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${view===id?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
        <div className="flex-1"/>
        <button onClick={()=>qc.invalidateQueries()} className="px-2 py-1 text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5"/></button>
        <Button size="sm" className="h-8 gap-1 text-xs mb-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增貸款</Button>
      </div>

      {/* ══ OVERVIEW ══════════════════════════════════════════════════════════ */}
      {view==="overview" && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {label:"貸款總筆數",value:stats?.totalLoans??"-",color:"text-primary",icon:<Building2 className="w-4 h-4"/>,sub:""},
              {label:"總負債餘額",value:stats?`NT$${Math.round(Number(stats.remainingBalance)).toLocaleString()}`:"─",color:"text-red-600",icon:<TrendingDown className="w-4 h-4"/>,sub:"剩餘未還"},
              {label:"本月應繳",value:stats?`NT$${Math.round(Number(stats.thisMonthAmount)).toLocaleString()}`:"─",color:"text-orange-600",icon:<Calendar className="w-4 h-4"/>,sub:`共 ${stats?.thisMonthCount??0} 筆`},
              {label:"逾期筆數",value:stats?.overdueCount??0,color:stats?.overdueCount?"text-red-600":"text-green-600",icon:<AlertTriangle className="w-4 h-4"/>,sub:stats?.overdueAmount?`NT$${Math.round(Number(stats.overdueAmount)).toLocaleString()}`:""},
            ].map(s=>(
              <div key={s.label} className={`border rounded-lg p-3 bg-card ${s.label==="逾期筆數"&&Number(s.value)>0?"border-red-300 bg-red-50/30":""}`}>
                <div className="flex items-center gap-2">
                  <span className={s.color}>{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-lg font-bold ${s.color} truncate`}>{s.value}</div>
                    {s.sub&&<div className="text-[10px] text-muted-foreground">{s.sub}</div>}
                    <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 次要指標 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {label:"已繳總額",value:`NT$${Math.round(Number(stats?.totalPaid??0)).toLocaleString()}`,color:"text-green-600"},
              {label:"已繳利息",value:`NT$${Math.round(Number(stats?.totalInterestPaid??0)).toLocaleString()}`,color:"text-orange-500"},
              {label:"每月固定支出",value:`NT$${Math.round(Number(stats?.totalMonthly??0)).toLocaleString()}`,color:"text-blue-600"},
            ].map(s=>(
              <div key={s.label} className="border rounded-lg p-3 bg-card text-center">
                <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {/* 貸款進度列表 */}
          {(stats?.loanList??[]).length>0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/60 text-xs font-semibold text-muted-foreground">各筆貸款進度</div>
              <div className="divide-y">
                {(stats?.loanList??[]).map(l=>{
                  const paid = (stats?.recentPayments??[]).filter(p=>p.loan_id===l.id&&p.status==="paid").length;
                  const pct  = l.total_periods>0?(paid/l.total_periods*100):0;
                  return (
                    <div key={l.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm truncate">{l.loan_name}</span>
                          {l.plate_no&&<span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-200">{l.plate_no}</span>}
                          <span className="text-[10px] text-muted-foreground">{l.bank_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" style={{width:`${pct}%`}}/>
                          </div>
                          <span className="text-[10px] text-muted-foreground w-20 shrink-0">{paid}/{l.total_periods}期 {pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold">月繳 NT${Number(l.monthly_payment).toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">利率 {l.interest_rate}%</div>
                      </div>
                    </div>
                  );
                })}
                {(stats?.loanList??[]).length===0&&<div className="p-6 text-center text-muted-foreground text-sm">尚無貸款資料</div>}
              </div>
            </div>
          )}
          {(stats?.loanList??[]).length===0&&!statsLoading&&(
            <div className="text-center py-12 border rounded-lg text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30"/>
              <div className="text-sm">尚無貸款資料</div>
              <Button size="sm" className="mt-3 gap-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增第一筆貸款</Button>
            </div>
          )}
        </div>
      )}

      {/* ══ EVENTS (還款事件) ══════════════════════════════════════════════════ */}
      {view==="events" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex rounded-md border overflow-hidden">
              {([["all","全部"],["overdue","⚠️ 逾期"],["pending","⏳ 未發生"],["paid","✅ 已發生"]] as const).map(([id,label])=>(
                <button key={id} onClick={()=>setEvtFilter(id)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${evtFilter===id?"bg-primary text-primary-foreground":"bg-card text-muted-foreground hover:bg-muted/40"}`}>{label}</button>
              ))}
            </div>
          </div>

          {/* 逾期 section */}
          {(evtFilter==="all"||evtFilter==="overdue") && overduePmts.length>0 && (
            <div className="border border-red-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-red-50 flex items-center gap-2 text-xs font-semibold text-red-700"><AlertTriangle className="w-3.5 h-3.5"/>逾期未繳 ({overduePmts.length} 筆)</div>
              <div className="divide-y divide-red-100">
                {overduePmts.map(p=>(
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 bg-red-50/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.loan_name}</span>
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">第 {p.period_no} 期</span>
                        <span className="text-[10px] text-muted-foreground">應繳：{p.due_date?.slice(0,10)}</span>
                      </div>
                    </div>
                    <span className="font-bold text-red-600">NT${Number(p.total_amt).toLocaleString()}</span>
                    <button onClick={()=>setMarkPay(p)} className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-[11px] font-medium whitespace-nowrap">標記已繳</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未發生 section */}
          {(evtFilter==="all"||evtFilter==="pending") && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/60 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock className="w-3.5 h-3.5"/>未發生（待繳） ({pendingPmts.length} 筆)</div>
              {pendingPmts.length===0?<div className="p-4 text-center text-xs text-muted-foreground">─</div>:(
                <div className="divide-y max-h-72 overflow-y-auto">
                  {pendingPmts.slice(0,30).map(p=>(
                    <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{p.loan_name}</span>
                          {p.plate_no&&<span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-200">{p.plate_no}</span>}
                          <span className="text-[10px] text-muted-foreground">第 {p.period_no} 期</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">應繳日：{p.due_date?.slice(0,10)} ｜{p.bank_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">NT${Number(p.total_amt).toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">利息 NT${Number(p.interest_amt).toLocaleString()}</div>
                      </div>
                      <button onClick={()=>setMarkPay(p)} className="px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 text-[11px] font-medium whitespace-nowrap">✓ 繳款</button>
                    </div>
                  ))}
                  {pendingPmts.length>30&&<div className="p-2 text-center text-xs text-muted-foreground">...還有 {pendingPmts.length-30} 筆</div>}
                </div>
              )}
            </div>
          )}

          {/* 已發生 section */}
          {(evtFilter==="all"||evtFilter==="paid") && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/60 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-green-600"/>已發生（已繳） ({paidPmts.length} 筆)</div>
              {paidPmts.length===0?<div className="p-4 text-center text-xs text-muted-foreground">─</div>:(
                <div className="divide-y max-h-72 overflow-y-auto">
                  {paidPmts.slice().reverse().slice(0,30).map(p=>(
                    <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 bg-green-50/20 hover:bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-muted-foreground">{p.loan_name}</span>
                          {p.plate_no&&<span className="text-[10px] bg-green-50 text-green-600 px-1.5 rounded border border-green-200">{p.plate_no}</span>}
                          <span className="text-[10px] text-green-600">第 {p.period_no} 期</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">繳款日：{p.paid_date?.slice(0,10)||"─"} ｜{p.bank_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm text-green-600">NT${Number(p.paid_amount||p.total_amt).toLocaleString()}</div>
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ 已繳</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ LOANS LIST ════════════════════════════════════════════════════════ */}
      {view==="loans" && (
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋貸款、銀行、車牌..."
                className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-52 focus:ring-2 focus:ring-primary/30 transition"/>
              {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5"/></button>}
            </div>
            <div className="flex-1"/>
            <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={()=>qc.invalidateQueries({queryKey:["loans"]})}><RefreshCw className="w-3.5 h-3.5"/></Button>
            <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增貸款</Button>
          </div>
          {loans.length===0?<div className="text-center py-12 border rounded-lg text-muted-foreground"><Building2 className="w-10 h-10 mx-auto mb-2 opacity-30"/><div className="text-sm">尚無貸款資料</div><Button size="sm" className="mt-3 gap-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增第一筆</Button></div>:(
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{["貸款名稱","銀行","貸款金額","月還款","利率","期數","到期日","狀態","操作"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {loans.map(l=>(
                    <tr key={l.id} className="hover:bg-muted/20">
                      <td className="p-3"><button onClick={()=>setDetailId(l.id)} className="font-semibold text-blue-600 hover:underline text-left">{l.loan_name}</button>
                        {l.plate_no&&<div className="text-[10px] text-muted-foreground">{l.plate_no}</div>}
                      </td>
                      <td className="p-3">{l.bank_name||"─"}</td>
                      <td className="p-3 font-mono">NT${Number(l.principal).toLocaleString()}</td>
                      <td className="p-3 font-mono font-semibold">NT${Number(l.monthly_payment).toLocaleString()}</td>
                      <td className="p-3">{l.interest_rate}%</td>
                      <td className="p-3">{l.total_periods} 期</td>
                      <td className="p-3">{l.end_date?.slice(0,10)}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CFG[l.status]?.color}`}>{STATUS_CFG[l.status]?.label}</span></td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button title="還款明細" onClick={()=>setDetailId(l.id)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><FileText className="w-3.5 h-3.5"/></button>
                          <button title="編輯" onClick={()=>setEditing(l)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-gray-50 text-gray-600"><Edit className="w-3.5 h-3.5"/></button>
                          <button title="刪除" onClick={()=>setDeleteTarget(l)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {showForm&&<LoanForm loan={null} vehicles={vehicles} onClose={()=>setShowForm(false)} onSave={()=>{setShowForm(false);qc.invalidateQueries({queryKey:["loans"]});qc.invalidateQueries({queryKey:["loan-stats"]});}}/>}
      {editing&&<LoanForm loan={editing} vehicles={vehicles} onClose={()=>setEditing(null)} onSave={()=>{setEditing(null);qc.invalidateQueries({queryKey:["loans"]});qc.invalidateQueries({queryKey:["loan-stats"]});}}/>}
      {detailId&&<LoanDetail loanId={detailId} onClose={()=>setDetailId(null)}/>}
      {markPay&&<MarkPaidDialog payment={markPay} onClose={()=>setMarkPay(null)} onSave={()=>{setMarkPay(null);qc.invalidateQueries({queryKey:["loan-payments"]});qc.invalidateQueries({queryKey:["loan-stats"]});}}/>}
      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定刪除「{deleteTarget?.loan_name}」？（相關還款明細一併刪除）</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" onClick={handleDelete}>確認刪除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
