import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, RefreshCw, Edit, Trash2, MapPin } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

const TW_COUNTIES = ["台北市","新北市","桃園市","台中市","台南市","高雄市","基隆市","新竹市","新竹縣","苗栗縣","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","屏東縣","宜蘭縣","花蓮縣","台東縣","澎湖縣","金門縣","連江縣"];

interface Township { id:number; county:string; district:string; zip_code?:string; }

function TownshipForm({ township, onClose, onSave }:{township:Township|null;onClose:()=>void;onSave:()=>void}) {
  const { toast } = useToast();
  const isNew = !township;
  const [form, setForm] = useState({ county:township?.county??"", district:township?.district??"", zipCode:township?.zip_code??"" });
  const [loading, setLoading] = useState(false);
  function f(k:keyof typeof form,v:string){setForm(p=>({...p,[k]:v}));}
  async function submit() {
    if (!form.county||!form.district){toast({title:"請填寫縣市和鄉鎮區",variant:"destructive"});return;}
    setLoading(true);
    try {
      const url=isNew?`${API}/townships`:`${API}/townships/${township!.id}`;
      const r=await fetch(url,{method:isNew?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json();if(!r.ok)throw new Error(d.error);
      toast({title:isNew?"已新增":"已更新"});onSave();
    }catch(e:any){toast({title:"操作失敗",description:e.message,variant:"destructive"});}
    finally{setLoading(false);}
  }
  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-blue-600"/>{isNew?"新增鄉鎮市區":"編輯鄉鎮市區"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>縣市 *</Label>
            <Select value={form.county||"__none"} onValueChange={v=>f("county",v==="__none"?"":v)}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="選擇縣市"/></SelectTrigger>
              <SelectContent>{TW_COUNTIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>鄉鎮市區 *</Label><Input value={form.district} onChange={e=>f("district",e.target.value)} placeholder="中正區"/></div>
          <div className="space-y-1"><Label>郵遞區號</Label><Input value={form.zipCode} onChange={e=>f("zipCode",e.target.value)} placeholder="100" maxLength={5}/></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button onClick={submit} disabled={loading}>{loading?"儲存中...":(isNew?"新增":"儲存")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TownshipTab() {
  const qc = useQueryClient(); const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterCounty, setFilterCounty] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Township|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Township|null>(null);

  const { data:townships=[], isLoading } = useQuery<Township[]>({
    queryKey:["townships",search,filterCounty],
    queryFn:()=>{const p=new URLSearchParams();if(search)p.set("search",search);if(filterCounty!=="all")p.set("county",filterCounty);return fetch(`${API}/townships?${p}`).then(r=>r.json());},
    staleTime:60000,
  });

  // Group by county for display
  const grouped = townships.reduce((acc,t)=>{
    if(!acc[t.county])acc[t.county]=[];acc[t.county].push(t);return acc;
  },{} as Record<string,Township[]>);

  async function handleDelete() {
    if (!deleteTarget)return;
    await fetch(`${API}/townships/${deleteTarget.id}`,{method:"DELETE"});
    toast({title:`已刪除 ${deleteTarget.county}${deleteTarget.district}`});
    setDeleteTarget(null);qc.invalidateQueries({queryKey:["townships"]});
  }

  const counties = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-3 bg-muted/30 text-sm text-muted-foreground flex items-center gap-2">
        <MapPin className="w-4 h-4 shrink-0"/>系統已預載台灣全部 22 縣市鄉鎮市區資料，可自行新增或修改。
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋縣市、區域、郵遞區號..."
            className="h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none w-52 focus:ring-2 focus:ring-primary/30 transition"/>
          {search&&<button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5"/></button>}
        </div>
        <Select value={filterCounty} onValueChange={setFilterCounty}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">全部縣市</SelectItem>{TW_COUNTIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex-1"/>
        <span className="text-xs text-muted-foreground">{townships.length} 筆</span>
        <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={()=>qc.invalidateQueries({queryKey:["townships"]})}><RefreshCw className="w-3.5 h-3.5"/></Button>
        <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={()=>setShowForm(true)}><Plus className="w-3.5 h-3.5"/>新增鄉鎮市區</Button>
      </div>

      {isLoading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse"/>)}</div>
      : search || filterCounty!=="all" ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{["郵遞區號","縣市","鄉鎮市區",""].map(h=><th key={h} className="p-2.5 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {townships.map(t=>(
                <tr key={t.id} className="hover:bg-muted/20">
                  <td className="p-2.5 font-mono">{t.zip_code||"─"}</td>
                  <td className="p-2.5">{t.county}</td>
                  <td className="p-2.5 font-medium">{t.district}</td>
                  <td className="p-2.5"><div className="flex gap-1">
                    <button onClick={()=>setEditing(t)} className="w-6 h-6 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><Edit className="w-3 h-3"/></button>
                    <button onClick={()=>setDeleteTarget(t)} className="w-6 h-6 flex items-center justify-center rounded border hover:bg-red-50 text-red-500"><Trash2 className="w-3 h-3"/></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {counties.map(county=>(
            <div key={county}>
              <h3 className="text-xs font-semibold text-muted-foreground mb-1.5 px-1">{county} <span className="font-normal">（{grouped[county].length} 區）</span></h3>
              <div className="flex flex-wrap gap-1.5">
                {grouped[county].map(t=>(
                  <div key={t.id} className="group relative flex items-center gap-1.5 px-2.5 py-1 bg-card border rounded-md text-xs hover:shadow-sm transition-all">
                    {t.zip_code&&<span className="text-muted-foreground font-mono">{t.zip_code}</span>}
                    <span>{t.district}</span>
                    <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 z-10">
                      <button onClick={()=>setEditing(t)} className="w-4 h-4 flex items-center justify-center rounded bg-white border shadow-sm text-blue-600"><Edit className="w-2.5 h-2.5"/></button>
                      <button onClick={()=>setDeleteTarget(t)} className="w-4 h-4 flex items-center justify-center rounded bg-white border shadow-sm text-red-500"><Trash2 className="w-2.5 h-2.5"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm&&<TownshipForm township={null} onClose={()=>setShowForm(false)} onSave={()=>{setShowForm(false);qc.invalidateQueries({queryKey:["townships"]});}}/>}
      {editing&&<TownshipForm township={editing} onClose={()=>setEditing(null)} onSave={()=>{setEditing(null);qc.invalidateQueries({queryKey:["townships"]});}}/>}
      <Dialog open={!!deleteTarget} onOpenChange={o=>{if(!o)setDeleteTarget(null);}}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4"/>確認刪除</DialogTitle></DialogHeader>
          <p className="text-sm py-2">確定刪除「{deleteTarget?.county}{deleteTarget?.district}」？</p>
          <DialogFooter><Button variant="outline" onClick={()=>setDeleteTarget(null)}>取消</Button><Button variant="destructive" onClick={handleDelete}>確認刪除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
