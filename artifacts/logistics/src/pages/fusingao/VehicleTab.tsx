import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, RefreshCw, Edit, Trash2, ChevronRight, Truck, FileText, Shield, Tag } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vehicle {
  id: number; plate_no: string; vehicle_type?: string; brand?: string; model?: string;
  year?: number; color?: string; vin?: string; engine_no?: string; gross_weight?: number;
  owner_name?: string; owner_id?: string; assigned_driver?: string; fleet_name?: string;
  status: string; purchase_date?: string; notes?: string; created_at: string;
  tax?: any[]; insurance?: any[]; etag?: any[];
}

const VEHICLE_TYPES = ["1.5噸","2噸","3.5噸","5噸","7噸","10噸","17噸","20噸","冷藏車","曳引車","廂型車","平板車","小貨車"];
const STATUS_CFG: Record<string,{label:string;color:string}> = {
  active:   {label:"使用中",  color:"bg-green-100 text-green-700"},
  inactive: {label:"停用",    color:"bg-gray-100 text-gray-600"},
  sold:     {label:"已售出",  color:"bg-red-100 text-red-500"},
  repair:   {label:"維修中",  color:"bg-orange-100 text-orange-600"},
};

// ─── Vehicle Form ─────────────────────────────────────────────────────────────
function VehicleForm({ vehicle, onClose, onSave }: { vehicle: Vehicle|null; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const isNew = !vehicle;
  const [form, setForm] = useState({
    plateNo: vehicle?.plate_no ?? "", vehicleType: vehicle?.vehicle_type ?? "",
    brand: vehicle?.brand ?? "", model: vehicle?.model ?? "",
    year: String(vehicle?.year ?? ""), color: vehicle?.color ?? "",
    vin: vehicle?.vin ?? "", engineNo: vehicle?.engine_no ?? "",
    grossWeight: String(vehicle?.gross_weight ?? ""), ownerName: vehicle?.owner_name ?? "",
    ownerId: vehicle?.owner_id ?? "", assignedDriver: vehicle?.assigned_driver ?? "",
    status: vehicle?.status ?? "active", purchaseDate: vehicle?.purchase_date?.slice(0,10) ?? "",
    notes: vehicle?.notes ?? "",
  });
  const [loading, setLoading] = useState(false);
  function f(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); }
  async function submit() {
    if (!form.plateNo) { toast({title:"請填寫車牌號碼",variant:"destructive"}); return; }
    setLoading(true);
    try {
      const url = isNew ? `${API}/vehicles` : `${API}/vehicles/${vehicle!.id}`;
      const r = await fetch(url, { method: isNew?"POST":"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      toast({title: isNew?"車輛已新增":"車輛已更新"});
      onSave();
    } catch(e:any) { toast({title:"操作失敗",description:e.message,variant:"destructive"}); }
    finally { setLoading(false); }
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="w-5 h-5 text-blue-600"/>{isNew?"新增車輛":` 編輯車輛 ${vehicle?.plate_no}`}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>車牌號碼 *</Label><Input value={form.plateNo} onChange={e=>f("plateNo",e.target.value)} placeholder="ABC-1234" /></div>
          <div className="space-y-1"><Label>車型</Label>
            <Select value={form.vehicleType||"__none"} onValueChange={v=>f("vehicleType",v==="__none"?"":v)}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="選擇車型"/></SelectTrigger>
              <SelectContent><SelectItem value="__none">─</SelectItem>{VEHICLE_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>狀態</Label>
            <Select value={form.status} onValueChange={v=>f("status",v)}>
              <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
              <SelectContent>{Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>廠牌</Label><Input value={form.brand} onChange={e=>f("brand",e.target.value)} placeholder="ISUZU"/></div>
          <div className="space-y-1"><Label>型號</Label><Input value={form.model} onChange={e=>f("model",e.target.value)} placeholder="ELF"/></div>
          <div className="space-y-1"><Label>出廠年份</Label><Input type="number" value={form.year} onChange={e=>f("year",e.target.value)} placeholder="2020"/></div>
          <div className="space-y-1"><Label>顏色</Label><Input value={form.color} onChange={e=>f("color",e.target.value)} placeholder="白色"/></div>
          <div className="space-y-1"><Label>車身號碼(VIN)</Label><Input value={form.vin} onChange={e=>f("vin",e.target.value)} /></div>
          <div className="space-y-1"><Label>引擎號碼</Label><Input value={form.engineNo} onChange={e=>f("engineNo",e.target.value)} /></div>
          <div className="space-y-1"><Label>總重(噸)</Label><Input type="number" value={form.grossWeight} onChange={e=>f("grossWeight",e.target.value)} placeholder="3.5"/></div>
          <div className="space-y-1"><Label>購車日期</Label><Input type="date" value={form.purchaseDate} onChange={e=>f("purchaseDate",e.target.value)}/></div>
          <div className="space-y-1"><Label>所有人</Label><Input value={form.ownerName} onChange={e=>f("ownerName",e.target.value)} /></div>
          <div className="space-y-1"><Label>統編/身份證</Label><Input value={form.ownerId} onChange={e=>f("ownerId",e.target.value)} /></div>
          <div className="col-span-2 space-y-1"><Label>派用司機</Label><Input value={form.assignedDriver} onChange={e=>f("assignedDriver",e.target.value)} placeholder="司機姓名"/></div>
          <div className="col-span-2 space-y-1"><Label>備註</Label><Textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={2}/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading?"儲存中...":(isNew?"新增車輛":"儲存變更")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vehicle Detail (Tax / Insurance / eTag sub-tabs) ─────────────────────────
function VehicleDetail({ vehicleId, onClose }: { vehicleId:number; onClose:()=>void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sub, setSub] = useState<"tax"|"insurance"|"etag">("tax");
  const { data: v } = useQuery<Vehicle>({ queryKey:["vehicle-detail",vehicleId], queryFn:()=>fetch(`${API}/vehicles/${vehicleId}`).then(r=>r.json()) });
  if (!v) return null;

  async function addTax() {
    const year = new Date().getFullYear();
    const r = await fetch(`${API}/vehicles/${vehicleId}/tax`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({taxYear:year,taxType:"牌照稅",amount:0,status:"unpaid"}) });
    if (r.ok) { toast({title:"已新增稅務記錄"}); qc.invalidateQueries({queryKey:["vehicle-detail",vehicleId]}); }
  }
  async function addIns() {
    const r = await fetch(`${API}/vehicles/${vehicleId}/insurance`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({insuranceType:"強制險",status:"active"}) });
    if (r.ok) { toast({title:"已新增保險記錄"}); qc.invalidateQueries({queryKey:["vehicle-detail",vehicleId]}); }
  }
  async function addEtag() {
    const no = prompt("請輸入 eTag 號碼"); if (!no) return;
    const r = await fetch(`${API}/vehicles/${vehicleId}/etag`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({etagNo:no,status:"active"}) });
    if (r.ok) { toast({title:"已新增 eTag"}); qc.invalidateQueries({queryKey:["vehicle-detail",vehicleId]}); }
  }
  async function del(path:string) {
    if (!confirm("確認刪除？")) return;
    await fetch(`${API}/${path}`, {method:"DELETE"});
    qc.invalidateQueries({queryKey:["vehicle-detail",vehicleId]});
  }

  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="w-5 h-5 text-blue-600"/>{v.plate_no} {v.brand} {v.vehicle_type}
            <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CFG[v.status]?.color}`}>{STATUS_CFG[v.status]?.label}</span>
          </DialogTitle>
        </DialogHeader>
        {/* Basic info summary */}
        <div className="grid grid-cols-3 gap-2 text-xs bg-muted/40 rounded-lg p-3">
          {[["廠牌/型號",`${v.brand||"─"} ${v.model||""}`],["年份",v.year||"─"],["顏色",v.color||"─"],["所有人",v.owner_name||"─"],["派用司機",v.assigned_driver||"─"],["總重",v.gross_weight?`${v.gross_weight}噸`:"─"]].map(([k,val])=>(
            <div key={k}><span className="text-muted-foreground">{k}</span><div className="font-medium">{val}</div></div>
          ))}
        </div>
        {/* Sub-tabs */}
        <div className="flex gap-1 border-b">
          {([["tax","🧾 稅務"],["insurance","🛡️ 保險"],["etag","🏷️ eTag"]] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setSub(id)} className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${sub===id?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>
        {/* Tax */}
        {sub==="tax" && (
          <div className="space-y-2">
            <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTax}><Plus className="w-3 h-3"/>新增稅務</Button></div>
            {(v.tax??[]).length===0 ? <div className="text-center py-6 text-muted-foreground text-sm">尚無稅務記錄</div> : (
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted/60"><tr>{["年度","稅種","金額","繳費期限","繳費日","狀態",""].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{(v.tax??[]).map((t:any)=>(
                  <tr key={t.id}>
                    <td className="p-2">{t.tax_year}</td><td className="p-2">{t.tax_type}</td>
                    <td className="p-2 font-mono">NT${Number(t.amount).toLocaleString()}</td>
                    <td className="p-2">{t.due_date?.slice(0,10)||"─"}</td>
                    <td className="p-2">{t.paid_date?.slice(0,10)||"─"}</td>
                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${t.status==="paid"?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>{t.status==="paid"?"已繳":"未繳"}</span></td>
                    <td className="p-2"><button onClick={()=>del(`vehicle-tax/${t.id}`)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
        {/* Insurance */}
        {sub==="insurance" && (
          <div className="space-y-2">
            <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addIns}><Plus className="w-3 h-3"/>新增保險</Button></div>
            {(v.insurance??[]).length===0 ? <div className="text-center py-6 text-muted-foreground text-sm">尚無保險記錄</div> : (
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted/60"><tr>{["險種","保險公司","保單號碼","起保日","到期日","保費","狀態",""].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{(v.insurance??[]).map((ins:any)=>(
                  <tr key={ins.id}>
                    <td className="p-2">{ins.insurance_type}</td><td className="p-2">{ins.insurer||"─"}</td>
                    <td className="p-2">{ins.policy_no||"─"}</td><td className="p-2">{ins.start_date?.slice(0,10)||"─"}</td>
                    <td className={`p-2 ${ins.end_date && new Date(ins.end_date)<new Date()?"text-red-500 font-semibold":""}`}>{ins.end_date?.slice(0,10)||"─"}</td>
                    <td className="p-2 font-mono">{ins.premium?`NT${Number(ins.premium).toLocaleString()}`:"─"}</td>
                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${ins.status==="active"?"bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>{ins.status==="active"?"有效":"到期"}</span></td>
                    <td className="p-2"><button onClick={()=>del(`vehicle-insurance/${ins.id}`)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
        {/* eTag */}
        {sub==="etag" && (
          <div className="space-y-2">
            <div className="flex justify-end"><Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addEtag}><Plus className="w-3 h-3"/>新增 eTag</Button></div>
            {(v.etag??[]).length===0 ? <div className="text-center py-6 text-muted-foreground text-sm">尚無 eTag 記錄</div> : (
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted/60"><tr>{["eTag 號碼","綁定日期","狀態","備註",""].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{(v.etag??[]).map((e:any)=>(
                  <tr key={e.id}>
                    <td className="p-2 font-mono">{e.etag_no}</td><td className="p-2">{e.bind_date?.slice(0,10)||"─"}</td>
                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] ${e.status==="active"?"bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>{e.status==="active"?"使用中":"停用"}</span></td>
                    <td className="p-2">{e.notes||"─"}</td>
                    <td className="p-2"><button onClick={()=>del(`vehicle-etag/${e.id}`)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>關閉</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export default function VehicleTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false); const [editing, setEditing] = useState<Vehicle|null>(null);
  const [detailId, setDetailId] = useState<number|null>(null); const [deleteTarget, setDeleteTarget] = useState<Vehicle|null>(null);
  const { data: vehicles=[], isLoading } = useQuery<Vehicle[]>({
    queryKey:["vehicles",search,filterStatus],
    queryFn:()=>{ const p=new URLSearchParams(); if(search)p.set("search",search); if(filterStatus!=="all")p.set("status",filterStatus); return fetch(`${API}/vehicles?${p}`).then(r=>r.json()); },
    refetchInterval:60000,
  });
  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`${API}/vehicles/${deleteTarget.id}`,{method:"DELETE"});
    toast({title:`已刪除車輛 ${deleteTarget.plate_no}`});
    setDeleteTarget(null); qc.invalidateQueries({queryKey:["vehicles"]});
  }
  const stats = { total:vehicles.length, active:vehicles.filter(v=>v.status==="active").length, inactive:vehicles.filter(v=>v.status!=="active").length };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[{label:"車輛總數",value:stats.total,color:"text-primary",icon:<Truck className="w-4 h-4"/>},{label:"使用中",value:stats.active,color:"text-green-600",icon:<Truck className="w-4 h-4"/>},{label:"停用/其他",value:stats.inactive,color:"text-gray-400",icon:<Truck className="w-4 h-4"/>}].map(s=>(
          <div key={s.label} className="border rounded-lg p-3 bg-card"><div className="flex items-center gap-2"><span className={s.color}>{s.icon}</span><div><div className={`text-xl font-bold ${s.color}`}>{s.value}</div><div className="text-[10px] text-muted-foreground">{s.label}</div></div></div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋車牌、廠牌、司機..."
            className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-52 focus:ring-2 focus:ring-primary/30 transition"/>
          {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5"/></button>}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="h-9 w-28 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部</SelectItem>{Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
        <div className="flex-1"/>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={()=>qc.invalidateQueries({queryKey:["vehicles"]})}><RefreshCw className="w-3.5 h-3.5"/></Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增車輛</Button>
      </div>
      {isLoading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-16 bg-muted/60 rounded-lg animate-pulse"/>)}</div>
      : vehicles.length===0 ? <div className="text-center py-16 text-muted-foreground border rounded-lg"><Truck className="w-10 h-10 mx-auto mb-2 opacity-30"/><div className="text-sm">尚無車輛資料</div><Button size="sm" className="mt-3 gap-1" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增第一台車輛</Button></div>
      : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs"><tr>{["車牌","車型/廠牌","所有人","派用司機","狀態","操作"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {vehicles.map(v=>(
                <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-3"><button onClick={()=>setDetailId(v.id)} className="font-mono font-bold text-blue-600 hover:underline">{v.plate_no}</button></td>
                  <td className="p-3"><div className="font-medium">{v.vehicle_type||"─"}</div><div className="text-xs text-muted-foreground">{v.brand} {v.model} {v.year?`(${v.year})`:""}</div></td>
                  <td className="p-3">{v.owner_name||"─"}</td>
                  <td className="p-3">{v.assigned_driver||"─"}</td>
                  <td className="p-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CFG[v.status]?.color}`}>{STATUS_CFG[v.status]?.label||v.status}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button title="詳細(稅務/保險/eTag)" onClick={()=>setDetailId(v.id)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><FileText className="w-3.5 h-3.5"/></button>
                      <button title="編輯" onClick={()=>setEditing(v)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-gray-50 text-gray-600"><Edit className="w-3.5 h-3.5"/></button>
                      <button title="刪除" onClick={()=>setDeleteTarget(v)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm&&<VehicleForm vehicle={null} onClose={()=>setShowForm(false)} onSave={()=>{setShowForm(false);qc.invalidateQueries({queryKey:["vehicles"]});}}/>}
      {editing&&<VehicleForm vehicle={editing} onClose={()=>setEditing(null)} onSave={()=>{setEditing(null);qc.invalidateQueries({queryKey:["vehicles"]});}}/>}
      {detailId&&<VehicleDetail vehicleId={detailId} onClose={()=>setDetailId(null)}/>}
      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定刪除車輛「<span className="font-semibold">{deleteTarget?.plate_no}</span>」？（相關稅務、保險、eTag 一併刪除）</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" onClick={handleDelete}>確認刪除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
