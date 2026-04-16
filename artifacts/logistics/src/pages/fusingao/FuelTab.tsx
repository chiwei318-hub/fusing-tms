import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, RefreshCw, Edit, Trash2, BarChart3, Fuel } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";
const FUEL_TYPES = ["柴油","92無鉛","95無鉛","98無鉛","電力"];

interface FuelRecord {
  id: number; plate_no?: string; vehicle_type?: string; fuel_date: string;
  fuel_type: string; liters: number; unit_price: number; total_amount: number;
  mileage?: number; station_name?: string; driver_name?: string; receipt_no?: string; notes?: string;
}

function FuelForm({ record, vehicles, onClose, onSave }: { record:FuelRecord|null; vehicles:any[]; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const isNew = !record;
  const [form, setForm] = useState({
    vehicleId:"", plateNo:record?.plate_no??"", fuelDate:record?.fuel_date?.slice(0,10)??new Date().toISOString().slice(0,10),
    fuelType:record?.fuel_type??"柴油", liters:String(record?.liters??""),
    unitPrice:String(record?.unit_price??""), totalAmount:String(record?.total_amount??""),
    mileage:String(record?.mileage??""), stationName:record?.station_name??"",
    driverName:record?.driver_name??"", receiptNo:record?.receipt_no??"", notes:record?.notes??"",
  });
  const [loading, setLoading] = useState(false);
  function f(k:keyof typeof form, v:string) { setForm(p=>({...p,[k]:v})); }
  // Auto-calc total
  function calcTotal(liters:string, price:string) {
    const l=parseFloat(liters), p=parseFloat(price);
    if (!isNaN(l)&&!isNaN(p)) setForm(prev=>({...prev,totalAmount:String((l*p).toFixed(0))}));
  }
  async function submit() {
    if (!form.fuelDate||(!form.vehicleId&&!form.plateNo)) { toast({title:"請填寫車牌與日期",variant:"destructive"}); return; }
    setLoading(true);
    try {
      const selectedV = vehicles.find(v=>String(v.id)===form.vehicleId);
      const payload = { ...form, vehicleId:form.vehicleId?parseInt(form.vehicleId):undefined, plateNo:selectedV?.plate_no||form.plateNo, liters:parseFloat(form.liters)||0, unitPrice:parseFloat(form.unitPrice)||0, totalAmount:parseFloat(form.totalAmount)||0, mileage:parseInt(form.mileage)||undefined };
      const url = isNew ? `${API}/fuel-records` : `${API}/fuel-records/${record!.id}`;
      const r = await fetch(url, { method:isNew?"POST":"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      toast({title:isNew?"已新增加油記錄":"已更新"}); onSave();
    } catch(e:any) { toast({title:"操作失敗",description:e.message,variant:"destructive"}); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Fuel className="w-5 h-5 text-orange-500"/>{isNew?"新增加油記錄":"編輯加油記錄"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>選擇車輛</Label>
            <Select value={form.vehicleId||"__manual"} onValueChange={v=>{ if(v==="__manual"){f("vehicleId","");}else{f("vehicleId",v);f("plateNo","");} }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="選擇車輛（或手動輸入車牌）"/></SelectTrigger>
              <SelectContent><SelectItem value="__manual">─ 手動輸入車牌 ─</SelectItem>{vehicles.map(v=><SelectItem key={v.id} value={String(v.id)}>{v.plate_no} {v.vehicle_type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!form.vehicleId&&<div className="col-span-2 space-y-1"><Label>車牌號碼</Label><Input value={form.plateNo} onChange={e=>f("plateNo",e.target.value)} placeholder="ABC-1234"/></div>}
          <div className="space-y-1"><Label>加油日期 *</Label><Input type="date" value={form.fuelDate} onChange={e=>f("fuelDate",e.target.value)}/></div>
          <div className="space-y-1"><Label>油品種類</Label>
            <Select value={form.fuelType} onValueChange={v=>f("fuelType",v)}>
              <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>{FUEL_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>加油量（公升）</Label><Input type="number" value={form.liters} onChange={e=>{f("liters",e.target.value);calcTotal(e.target.value,form.unitPrice);}} placeholder="0"/></div>
          <div className="space-y-1"><Label>單價（元/升）</Label><Input type="number" value={form.unitPrice} onChange={e=>{f("unitPrice",e.target.value);calcTotal(form.liters,e.target.value);}} placeholder="0"/></div>
          <div className="col-span-2 space-y-1"><Label>總金額（元）</Label><Input type="number" value={form.totalAmount} onChange={e=>f("totalAmount",e.target.value)} placeholder="自動計算"/></div>
          <div className="space-y-1"><Label>當前里程（公里）</Label><Input type="number" value={form.mileage} onChange={e=>f("mileage",e.target.value)} placeholder="0"/></div>
          <div className="space-y-1"><Label>加油站</Label><Input value={form.stationName} onChange={e=>f("stationName",e.target.value)} placeholder="台塑石油"/></div>
          <div className="space-y-1"><Label>司機姓名</Label><Input value={form.driverName} onChange={e=>f("driverName",e.target.value)}/></div>
          <div className="space-y-1"><Label>發票號碼</Label><Input value={form.receiptNo} onChange={e=>f("receiptNo",e.target.value)}/></div>
          <div className="col-span-2 space-y-1"><Label>備註</Label><Input value={form.notes} onChange={e=>f("notes",e.target.value)}/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading?"儲存中...":(isNew?"新增":"儲存")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FuelTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [view, setView] = useState<"records"|"comparison">("records");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<FuelRecord|null>(null); const [deleteTarget, setDeleteTarget] = useState<FuelRecord|null>(null);

  const { data: records=[], isLoading } = useQuery<FuelRecord[]>({
    queryKey:["fuel-records",search,dateFrom,dateTo],
    queryFn:()=>{ const p=new URLSearchParams(); if(search)p.set("search",search); if(dateFrom)p.set("dateFrom",dateFrom); if(dateTo)p.set("dateTo",dateTo); return fetch(`${API}/fuel-records?${p}`).then(r=>r.json()).then(d=>Array.isArray(d)?d:[]); },
  });
  const { data: vehicles=[] } = useQuery<any[]>({ queryKey:["vehicles-simple"], queryFn:()=>fetch(`${API}/vehicles`).then(r=>r.json()).then(d=>Array.isArray(d)?d:[]), staleTime:60000 });

  // Comparison stats
  const stats = useMemo(()=>{
    const map = new Map<string,{liters:number;amount:number;count:number}>();
    records.forEach(r=>{
      const k=r.plate_no||"未知";
      const cur=map.get(k)||{liters:0,amount:0,count:0};
      map.set(k,{liters:cur.liters+Number(r.liters),amount:cur.amount+Number(r.total_amount),count:cur.count+1});
    });
    return Array.from(map.entries()).map(([plate,v])=>({plate,...v,avgPerFill:(v.liters/v.count).toFixed(1)})).sort((a,b)=>b.amount-a.amount);
  },[records]);

  const totals = useMemo(()=>({ liters:records.reduce((s,r)=>s+Number(r.liters),0), amount:records.reduce((s,r)=>s+Number(r.total_amount),0), count:records.length }),[records]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`${API}/fuel-records/${deleteTarget.id}`,{method:"DELETE"});
    toast({title:"已刪除"}); setDeleteTarget(null); qc.invalidateQueries({queryKey:["fuel-records"]});
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[{label:"加油次數",value:totals.count,suffix:"次"},{label:"總加油量",value:totals.liters.toFixed(1),suffix:"升"},{label:"總金額",value:`NT$${Math.round(totals.amount).toLocaleString()}`,suffix:""}].map(s=>(
          <div key={s.label} className="border rounded-lg p-3 bg-card"><div className="text-lg font-bold text-primary">{s.value}<span className="text-xs font-normal ml-1 text-muted-foreground">{s.suffix}</span></div><div className="text-[10px] text-muted-foreground">{s.label}</div></div>
        ))}
      </div>
      {/* View toggle + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-md border overflow-hidden">
          <button onClick={()=>setView("records")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view==="records"?"bg-primary text-primary-foreground":"bg-card text-muted-foreground hover:bg-muted/40"}`}>📋 加油記錄</button>
          <button onClick={()=>setView("comparison")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view==="comparison"?"bg-primary text-primary-foreground":"bg-card text-muted-foreground hover:bg-muted/40"}`}>📊 比較報表</button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋車牌、司機..." className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-44 focus:ring-2 focus:ring-primary/30 transition"/>
          {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5"/></button>}
        </div>
        <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="h-9 w-36 text-xs"/>
        <span className="text-muted-foreground text-xs">~</span>
        <Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="h-9 w-36 text-xs"/>
        <div className="flex-1"/>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={()=>qc.invalidateQueries({queryKey:["fuel-records"]})}><RefreshCw className="w-3.5 h-3.5"/></Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增加油記錄</Button>
      </div>

      {/* Records view */}
      {view==="records" && (
        isLoading ? <div className="h-32 bg-muted/60 rounded-lg animate-pulse"/> :
        records.length===0 ? <div className="text-center py-16 text-muted-foreground border rounded-lg"><Fuel className="w-10 h-10 mx-auto mb-2 opacity-30"/><div className="text-sm">尚無加油記錄</div><Button size="sm" className="mt-3 gap-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增第一筆</Button></div> :
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs"><tr>{["日期","車牌","油品","加油量","單價","金額","里程","加油站","司機",""].map(h=><th key={h} className="p-2.5 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {records.map(r=>(
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="p-2.5">{r.fuel_date?.slice(0,10)}</td>
                  <td className="p-2.5 font-mono font-semibold">{r.plate_no||"─"}</td>
                  <td className="p-2.5">{r.fuel_type}</td>
                  <td className="p-2.5">{Number(r.liters).toFixed(1)} L</td>
                  <td className="p-2.5">{r.unit_price?`$${r.unit_price}`:"─"}</td>
                  <td className="p-2.5 font-semibold">NT${Number(r.total_amount).toLocaleString()}</td>
                  <td className="p-2.5 text-muted-foreground">{r.mileage?`${r.mileage.toLocaleString()} km`:"─"}</td>
                  <td className="p-2.5">{r.station_name||"─"}</td>
                  <td className="p-2.5">{r.driver_name||"─"}</td>
                  <td className="p-2.5">
                    <div className="flex gap-1">
                      <button onClick={()=>setEditing(r)} className="w-6 h-6 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><Edit className="w-3 h-3"/></button>
                      <button onClick={()=>setDeleteTarget(r)} className="w-6 h-6 flex items-center justify-center rounded border hover:bg-red-50 text-red-500"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comparison view */}
      {view==="comparison" && (
        <div className="space-y-3">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs"><tr>{["車牌","加油次數","總加油量","平均每次(L)","總金額","佔比"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {stats.map((s,i)=>{
                  const pct=totals.amount>0?(s.amount/totals.amount*100).toFixed(1):"0";
                  return (
                    <tr key={s.plate} className="hover:bg-muted/20">
                      <td className="p-3 font-mono font-semibold">{s.plate}</td>
                      <td className="p-3">{s.count} 次</td>
                      <td className="p-3">{s.liters.toFixed(1)} L</td>
                      <td className="p-3">{s.avgPerFill} L</td>
                      <td className="p-3 font-semibold">NT${Math.round(s.amount).toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2"><div className="flex-1 bg-muted rounded-full h-1.5"><div className="bg-primary h-1.5 rounded-full" style={{width:`${pct}%`}}/></div><span className="text-xs text-muted-foreground w-10">{pct}%</span></div>
                      </td>
                    </tr>
                  );
                })}
                {stats.length===0&&<tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">此區間無資料</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm&&<FuelForm record={null} vehicles={vehicles} onClose={()=>setShowForm(false)} onSave={()=>{setShowForm(false);qc.invalidateQueries({queryKey:["fuel-records"]});}}/>}
      {editing&&<FuelForm record={editing} vehicles={vehicles} onClose={()=>setEditing(null)} onSave={()=>{setEditing(null);qc.invalidateQueries({queryKey:["fuel-records"]});}}/>}
      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定刪除 {deleteTarget?.fuel_date?.slice(0,10)} {deleteTarget?.plate_no} 的加油記錄？</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" onClick={handleDelete}>確認刪除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
