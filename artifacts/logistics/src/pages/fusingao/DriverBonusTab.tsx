import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, RefreshCw, Edit, Trash2, DollarSign, CheckCircle2, Clock } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";
const BONUS_TYPES = ["績效獎金","全勤獎金","特別獎金","介紹獎金","節日獎金","其他"];
const STATUS_CFG: Record<string,{label:string;color:string}> = {
  pending: {label:"待發放",  color:"bg-amber-100 text-amber-700"},
  paid:    {label:"已發放",  color:"bg-green-100 text-green-700"},
  cancelled:{label:"已取消", color:"bg-gray-100 text-gray-500"},
};

interface DriverBonus {
  id: number; driver_name: string; driver_id?: number; bonus_date: string;
  bonus_type: string; amount: number; reason?: string;
  status: string; paid_date?: string; notes?: string;
}

function BonusForm({ bonus, onClose, onSave }: { bonus:DriverBonus|null; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const isNew = !bonus;
  const [form, setForm] = useState({
    driverName:bonus?.driver_name??"", bonusDate:bonus?.bonus_date?.slice(0,10)??new Date().toISOString().slice(0,10),
    bonusType:bonus?.bonus_type??"績效獎金", amount:String(bonus?.amount??""),
    reason:bonus?.reason??"", status:bonus?.status??"pending",
    paidDate:bonus?.paid_date?.slice(0,10)??"", notes:bonus?.notes??"",
  });
  const [loading, setLoading] = useState(false);
  function f(k:keyof typeof form,v:string){setForm(p=>({...p,[k]:v}));}
  async function submit() {
    if (!form.driverName||!form.bonusDate) { toast({title:"請填寫司機姓名與日期",variant:"destructive"}); return; }
    setLoading(true);
    try {
      const url = isNew?`${API}/driver-bonus`:`${API}/driver-bonus/${bonus!.id}`;
      const r = await fetch(url,{method:isNew?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,amount:parseFloat(form.amount)||0,paidDate:form.paidDate||undefined})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      toast({title:isNew?"已新增獎金":"已更新"}); onSave();
    } catch(e:any){toast({title:"操作失敗",description:e.message,variant:"destructive"});}
    finally{setLoading(false);}
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600"/>{isNew?"新增獎金":"編輯獎金"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>司機姓名 *</Label><Input value={form.driverName} onChange={e=>f("driverName",e.target.value)} placeholder="司機全名"/></div>
          <div className="space-y-1"><Label>獎金日期 *</Label><Input type="date" value={form.bonusDate} onChange={e=>f("bonusDate",e.target.value)}/></div>
          <div className="space-y-1"><Label>獎金類別</Label>
            <Select value={form.bonusType} onValueChange={v=>f("bonusType",v)}>
              <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>{BONUS_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>金額（元）</Label><Input type="number" value={form.amount} onChange={e=>f("amount",e.target.value)} placeholder="0"/></div>
          <div className="space-y-1"><Label>狀態</Label>
            <Select value={form.status} onValueChange={v=>f("status",v)}>
              <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.status==="paid"&&<div className="space-y-1"><Label>發放日期</Label><Input type="date" value={form.paidDate} onChange={e=>f("paidDate",e.target.value)}/></div>}
          <div className="col-span-2 space-y-1"><Label>原因 / 說明</Label><Input value={form.reason} onChange={e=>f("reason",e.target.value)} placeholder="獎金原因"/></div>
          <div className="col-span-2 space-y-1"><Label>備註</Label><Textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={2}/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading?"儲存中...":(isNew?"新增獎金":"儲存變更")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DriverBonusTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [search,setSearch]=useState(""); const [filterStatus,setFilterStatus]=useState("all");
  const [dateFrom,setDateFrom]=useState(()=>{const d=new Date();d.setMonth(d.getMonth()-3);return d.toISOString().slice(0,10);});
  const [dateTo,setDateTo]=useState(()=>new Date().toISOString().slice(0,10));
  const [showForm,setShowForm]=useState(false); const [editing,setEditing]=useState<DriverBonus|null>(null); const [deleteTarget,setDeleteTarget]=useState<DriverBonus|null>(null);

  const { data:bonuses=[], isLoading } = useQuery<DriverBonus[]>({
    queryKey:["driver-bonus",search,filterStatus,dateFrom,dateTo],
    queryFn:()=>{const p=new URLSearchParams();if(search)p.set("search",search);if(filterStatus!=="all")p.set("status",filterStatus);if(dateFrom)p.set("dateFrom",dateFrom);if(dateTo)p.set("dateTo",dateTo);return fetch(`${API}/driver-bonus?${p}`).then(r=>r.json());},
  });

  const stats = useMemo(()=>({
    total:bonuses.length, pending:bonuses.filter(b=>b.status==="pending").length,
    paid:bonuses.filter(b=>b.status==="paid").length,
    totalAmount:bonuses.reduce((s,b)=>s+Number(b.amount),0),
    pendingAmount:bonuses.filter(b=>b.status==="pending").reduce((s,b)=>s+Number(b.amount),0),
  }),[bonuses]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`${API}/driver-bonus/${deleteTarget.id}`,{method:"DELETE"});
    toast({title:"已刪除"}); setDeleteTarget(null); qc.invalidateQueries({queryKey:["driver-bonus"]});
  }
  async function markPaid(b:DriverBonus) {
    await fetch(`${API}/driver-bonus/${b.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...b,status:"paid",paidDate:new Date().toISOString().slice(0,10)})});
    toast({title:`已標記 ${b.driver_name} 獎金為已發放`}); qc.invalidateQueries({queryKey:["driver-bonus"]});
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[{label:"待發放",value:stats.pending,color:"text-amber-600",sub:`NT$${Math.round(stats.pendingAmount).toLocaleString()}`},
          {label:"已發放",value:stats.paid,color:"text-green-600",sub:""},
          {label:"獎金總額",value:`NT$${Math.round(stats.totalAmount).toLocaleString()}`,color:"text-primary",sub:""},
          {label:"筆數",value:stats.total,color:"text-muted-foreground",sub:""},
        ].map(s=>(
          <div key={s.label} className="border rounded-lg p-3 bg-card"><div className={`text-lg font-bold ${s.color}`}>{s.value}</div>{s.sub&&<div className="text-[10px] text-orange-500 font-medium">{s.sub}</div>}<div className="text-[10px] text-muted-foreground">{s.label}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋司機、類別..." className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-44 focus:ring-2 focus:ring-primary/30 transition"/>
          {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5"/></button>}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="h-9 w-28 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="h-9 w-36 text-xs"/>
        <span className="text-xs text-muted-foreground">~</span>
        <Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="h-9 w-36 text-xs"/>
        <div className="flex-1"/>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={()=>qc.invalidateQueries({queryKey:["driver-bonus"]})}><RefreshCw className="w-3.5 h-3.5"/></Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增獎金</Button>
      </div>

      {isLoading ? <div className="h-32 bg-muted/60 rounded-lg animate-pulse"/> :
      bonuses.length===0 ? <div className="text-center py-16 text-muted-foreground border rounded-lg"><DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30"/><div className="text-sm">尚無獎金記錄</div><Button size="sm" className="mt-3 gap-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增第一筆</Button></div> :
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs"><tr>{["日期","司機","類別","金額","原因","狀態","發放日","操作"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {bonuses.map(b=>(
              <tr key={b.id} className="hover:bg-muted/20">
                <td className="p-3">{b.bonus_date?.slice(0,10)}</td>
                <td className="p-3 font-semibold">{b.driver_name}</td>
                <td className="p-3">{b.bonus_type}</td>
                <td className="p-3 font-semibold text-green-700">NT${Number(b.amount).toLocaleString()}</td>
                <td className="p-3 text-muted-foreground max-w-[160px] truncate">{b.reason||"─"}</td>
                <td className="p-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CFG[b.status]?.color}`}>{STATUS_CFG[b.status]?.label}</span></td>
                <td className="p-3">{b.paid_date?.slice(0,10)||"─"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {b.status==="pending"&&<button title="標記已發放" onClick={()=>markPaid(b)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-green-50 text-green-600"><CheckCircle2 className="w-3.5 h-3.5"/></button>}
                    <button onClick={()=>setEditing(b)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><Edit className="w-3.5 h-3.5"/></button>
                    <button onClick={()=>setDeleteTarget(b)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {showForm&&<BonusForm bonus={null} onClose={()=>setShowForm(false)} onSave={()=>{setShowForm(false);qc.invalidateQueries({queryKey:["driver-bonus"]});}}/>}
      {editing&&<BonusForm bonus={editing} onClose={()=>setEditing(null)} onSave={()=>{setEditing(null);qc.invalidateQueries({queryKey:["driver-bonus"]});}}/>}
      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定刪除 {deleteTarget?.driver_name} 的獎金記錄（NT${Number(deleteTarget?.amount).toLocaleString()}）？</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" onClick={handleDelete}>確認刪除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
