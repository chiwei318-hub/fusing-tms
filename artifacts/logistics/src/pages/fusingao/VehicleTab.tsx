import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, X, RefreshCw, Edit, Trash2, FileText, Truck } from "lucide-react";

const API = import.meta.env.BASE_URL + "api";

interface Vehicle {
  id: number;
  plate_no: string; vehicle_no?: string; branch_company?: string;
  vehicle_type?: string; vehicle_category?: string; vehicle_model_type?: string;
  brand?: string; model?: string; year?: number; mfg_month?: number; color?: string;
  vin?: string; engine_no?: string;
  gross_weight?: number; empty_weight_kg?: number; max_load_kg?: number;
  max_cubic_feet?: number; max_pallets?: number;
  owner_name?: string; owner_id?: string; assigned_driver?: string; driver_code?: string;
  status: string; purchase_date?: string;
  license_issue_date?: string; deregister_date?: string; dealer_sponsor_date?: string;
  notes?: string; is_legal_id?: string;
  inner_length_cm?: number; inner_width_cm?: number; inner_height_cm?: number; lift_height_cm?: number;
  tire_size?: string; engine_cc?: number; fuel_type?: string;
  gps_vendor?: string; gps_cost?: number; sim_no?: string; sub_vehicle_code?: string;
  weighing_count?: number; insurance_km?: number; next_maintenance_km?: number;
  fuel_consumption?: number; per_trip_fee?: number; gate_type?: string;
  created_at: string;
  tax?: any[]; insurance?: any[]; etag?: any[];
}

const VEHICLE_TYPES = ["0.6噸","1噸","1.5噸","2噸","3.5噸","5噸","7噸","10噸","17噸","20噸","35噸","43噸","曳引車","冷藏車","廂型車","平板車","小貨車"];
const VEHICLE_CATEGORIES = ["營業半拖","營業貨運曳引車","自用貨車","租賃車","工程車","其他"];
const FUEL_TYPES = ["柴油","汽油","電動","天然氣","混合動力"];
const STATUS_CFG: Record<string,{label:string;color:string}> = {
  active:   {label:"行駛中",  color:"bg-green-100 text-green-700"},
  inactive: {label:"停用",    color:"bg-gray-100 text-gray-600"},
  sold:     {label:"已售出",  color:"bg-red-100 text-red-500"},
  repair:   {label:"維修中",  color:"bg-orange-100 text-orange-600"},
};

type FormSection = "basic" | "spec" | "gps" | "dates" | "other";

function VehicleForm({ vehicle, onClose, onSave }: { vehicle: Vehicle|null; onClose:()=>void; onSave:()=>void }) {
  const { toast } = useToast();
  const isNew = !vehicle;
  const [section, setSection] = useState<FormSection>("basic");
  const [form, setForm] = useState({
    plateNo: vehicle?.plate_no ?? "",
    vehicleNo: vehicle?.vehicle_no ?? "",
    branchCompany: vehicle?.branch_company ?? "",
    vehicleType: vehicle?.vehicle_type ?? "",
    vehicleCategory: vehicle?.vehicle_category ?? "",
    vehicleModelType: vehicle?.vehicle_model_type ?? "",
    brand: vehicle?.brand ?? "",
    model: vehicle?.model ?? "",
    year: String(vehicle?.year ?? ""),
    mfgMonth: String(vehicle?.mfg_month ?? ""),
    color: vehicle?.color ?? "",
    vin: vehicle?.vin ?? "",
    engineNo: vehicle?.engine_no ?? "",
    grossWeight: String(vehicle?.gross_weight ?? ""),
    emptyWeightKg: String(vehicle?.empty_weight_kg ?? ""),
    maxLoadKg: String(vehicle?.max_load_kg ?? ""),
    maxCubicFeet: String(vehicle?.max_cubic_feet ?? ""),
    maxPallets: String(vehicle?.max_pallets ?? ""),
    ownerName: vehicle?.owner_name ?? "",
    ownerId: vehicle?.owner_id ?? "",
    assignedDriver: vehicle?.assigned_driver ?? "",
    driverCode: vehicle?.driver_code ?? "",
    status: vehicle?.status ?? "active",
    purchaseDate: vehicle?.purchase_date?.slice(0,10) ?? "",
    licenseIssueDate: vehicle?.license_issue_date?.slice(0,10) ?? "",
    deregisterDate: vehicle?.deregister_date?.slice(0,10) ?? "",
    dealerSponsorDate: vehicle?.dealer_sponsor_date?.slice(0,10) ?? "",
    notes: vehicle?.notes ?? "",
    isLegalId: vehicle?.is_legal_id ?? "Y",
    innerLengthCm: String(vehicle?.inner_length_cm ?? ""),
    innerWidthCm: String(vehicle?.inner_width_cm ?? ""),
    innerHeightCm: String(vehicle?.inner_height_cm ?? ""),
    liftHeightCm: String(vehicle?.lift_height_cm ?? ""),
    tireSize: vehicle?.tire_size ?? "",
    engineCc: String(vehicle?.engine_cc ?? ""),
    fuelType: vehicle?.fuel_type ?? "",
    gpsVendor: vehicle?.gps_vendor ?? "",
    gpsCost: String(vehicle?.gps_cost ?? ""),
    simNo: vehicle?.sim_no ?? "",
    subVehicleCode: vehicle?.sub_vehicle_code ?? "",
    weighingCount: String(vehicle?.weighing_count ?? "0"),
    insuranceKm: String(vehicle?.insurance_km ?? ""),
    nextMaintenanceKm: String(vehicle?.next_maintenance_km ?? ""),
    fuelConsumption: String(vehicle?.fuel_consumption ?? ""),
    perTripFee: String(vehicle?.per_trip_fee ?? ""),
    gateType: vehicle?.gate_type ?? "",
  });
  const [loading, setLoading] = useState(false);
  function f(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); }

  async function submit() {
    if (!form.plateNo) { toast({title:"請填寫車牌號碼",variant:"destructive"}); return; }
    setLoading(true);
    try {
      const url = isNew ? `${API}/vehicles` : `${API}/vehicles/${vehicle!.id}`;
      const r = await fetch(url, {
        method: isNew?"POST":"PUT",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          ...form,
          year: form.year ? Number(form.year) : null,
          mfgMonth: form.mfgMonth ? Number(form.mfgMonth) : null,
          emptyWeightKg: form.emptyWeightKg ? Number(form.emptyWeightKg) : null,
          maxLoadKg: form.maxLoadKg ? Number(form.maxLoadKg) : null,
          maxCubicFeet: form.maxCubicFeet ? Number(form.maxCubicFeet) : null,
          maxPallets: form.maxPallets ? Number(form.maxPallets) : null,
          grossWeight: form.grossWeight ? Number(form.grossWeight) : null,
          innerLengthCm: form.innerLengthCm ? Number(form.innerLengthCm) : null,
          innerWidthCm: form.innerWidthCm ? Number(form.innerWidthCm) : null,
          innerHeightCm: form.innerHeightCm ? Number(form.innerHeightCm) : null,
          liftHeightCm: form.liftHeightCm ? Number(form.liftHeightCm) : null,
          engineCc: form.engineCc ? Number(form.engineCc) : null,
          gpsCost: form.gpsCost ? Number(form.gpsCost) : null,
          weighingCount: form.weighingCount ? Number(form.weighingCount) : 0,
          insuranceKm: form.insuranceKm ? Number(form.insuranceKm) : null,
          nextMaintenanceKm: form.nextMaintenanceKm ? Number(form.nextMaintenanceKm) : null,
          fuelConsumption: form.fuelConsumption ? Number(form.fuelConsumption) : null,
          perTripFee: form.perTripFee ? Number(form.perTripFee) : null,
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({title: isNew?"車輛已新增":"車輛已更新"});
      onSave();
    } catch(e:any) { toast({title:"操作失敗",description:e.message,variant:"destructive"}); }
    finally { setLoading(false); }
  }

  const SECTIONS: {id: FormSection; label: string}[] = [
    {id:"basic", label:"基本資料"},
    {id:"spec", label:"載重尺寸"},
    {id:"gps", label:"GPS/通訊"},
    {id:"dates", label:"日期/費用"},
    {id:"other", label:"其他"},
  ];

  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600"/>
            {isNew ? "新增車輛" : `編輯車輛 ${vehicle?.plate_no}`}
          </DialogTitle>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex gap-1 border-b shrink-0">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${section===s.id?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          {/* ── 基本資料 ── */}
          {section === "basic" && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="space-y-1"><Label>車牌號碼 *</Label><Input value={form.plateNo} onChange={e=>f("plateNo",e.target.value)} placeholder="ABC-1234"/></div>
              <div className="space-y-1"><Label>車號（內部）</Label><Input value={form.vehicleNo} onChange={e=>f("vehicleNo",e.target.value)} placeholder="03-DR"/></div>
              <div className="space-y-1"><Label>所屬分公司</Label><Input value={form.branchCompany} onChange={e=>f("branchCompany",e.target.value)} placeholder="泰立"/></div>
              <div className="space-y-1"><Label>子車代碼</Label><Input value={form.subVehicleCode} onChange={e=>f("subVehicleCode",e.target.value)} placeholder=""/></div>
              <div className="space-y-1"><Label>車輛種類</Label>
                <Select value={form.vehicleCategory||"__none"} onValueChange={v=>f("vehicleCategory",v==="__none"?"":v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="選擇種類"/></SelectTrigger>
                  <SelectContent><SelectItem value="__none">─</SelectItem>{VEHICLE_CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>車型</Label>
                <Select value={form.vehicleType||"__none"} onValueChange={v=>f("vehicleType",v==="__none"?"":v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="選擇車型"/></SelectTrigger>
                  <SelectContent><SelectItem value="__none">─</SelectItem>{VEHICLE_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>型式</Label><Input value={form.vehicleModelType} onChange={e=>f("vehicleModelType",e.target.value)} placeholder="YTF-21 / 204IS…"/></div>
              <div className="space-y-1"><Label>卡車廠牌</Label><Input value={form.brand} onChange={e=>f("brand",e.target.value)} placeholder="ISUZU / HINO…"/></div>
              <div className="space-y-1"><Label>車輛狀態</Label>
                <Select value={form.status} onValueChange={v=>f("status",v)}>
                  <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_CFG).map(([k,v])=><SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>出廠年份</Label><Input type="number" value={form.year} onChange={e=>f("year",e.target.value)} placeholder="2013"/></div>
              <div className="space-y-1"><Label>出廠月份</Label>
                <Select value={form.mfgMonth||"__none"} onValueChange={v=>f("mfgMonth",v==="__none"?"":v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="月份"/></SelectTrigger>
                  <SelectContent><SelectItem value="__none">─</SelectItem>{Array.from({length:12},(_,i)=><SelectItem key={i+1} value={String(i+1)}>{i+1} 月</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>顏色</Label><Input value={form.color} onChange={e=>f("color",e.target.value)} placeholder="白色"/></div>
              <div className="space-y-1"><Label>車身號碼 (VIN)</Label><Input value={form.vin} onChange={e=>f("vin",e.target.value)}/></div>
              <div className="space-y-1"><Label>引擎號碼</Label><Input value={form.engineNo} onChange={e=>f("engineNo",e.target.value)}/></div>
              <div className="space-y-1"><Label>燃料種類</Label>
                <Select value={form.fuelType||"__none"} onValueChange={v=>f("fuelType",v==="__none"?"":v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="選擇燃料"/></SelectTrigger>
                  <SelectContent><SelectItem value="__none">─</SelectItem>{FUEL_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>CC 數</Label><Input type="number" value={form.engineCc} onChange={e=>f("engineCc",e.target.value)} placeholder="11946"/></div>
              <div className="space-y-1"><Label>輪胎尺寸</Label><Input value={form.tireSize} onChange={e=>f("tireSize",e.target.value)} placeholder="11R22.5"/></div>
              <div className="space-y-1"><Label>扣門形式</Label><Input value={form.gateType} onChange={e=>f("gateType",e.target.value)} placeholder="捲門/廂門"/></div>
              <div className="space-y-1"><Label>所有人</Label><Input value={form.ownerName} onChange={e=>f("ownerName",e.target.value)}/></div>
              <div className="space-y-1"><Label>統編/身份證</Label><Input value={form.ownerId} onChange={e=>f("ownerId",e.target.value)}/></div>
              <div className="space-y-1"><Label>司機代號</Label><Input value={form.driverCode} onChange={e=>f("driverCode",e.target.value)} placeholder="DR-001"/></div>
              <div className="space-y-1"><Label>派用司機</Label><Input value={form.assignedDriver} onChange={e=>f("assignedDriver",e.target.value)} placeholder="司機姓名"/></div>
              <div className="space-y-1"><Label>是否合法辨識</Label>
                <Select value={form.isLegalId} onValueChange={v=>f("isLegalId",v)}>
                  <SelectTrigger className="text-sm"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="Y">Y — 是</SelectItem><SelectItem value="N">N — 否</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1"><Label>備註</Label><Textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={2}/></div>
            </div>
          )}

          {/* ── 載重尺寸 ── */}
          {section === "spec" && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="col-span-2 text-xs font-semibold text-muted-foreground pb-1 border-b">重量</div>
              <div className="space-y-1"><Label>總重 / 公噸</Label><Input type="number" step="0.01" value={form.grossWeight} onChange={e=>f("grossWeight",e.target.value)} placeholder="35"/></div>
              <div className="space-y-1"><Label>空車重 KG</Label><Input type="number" value={form.emptyWeightKg} onChange={e=>f("emptyWeightKg",e.target.value)} placeholder="20000"/></div>
              <div className="space-y-1"><Label>最大載重 KG</Label><Input type="number" value={form.maxLoadKg} onChange={e=>f("maxLoadKg",e.target.value)} placeholder="20000"/></div>
              <div className="space-y-1"><Label>最大才數</Label><Input type="number" value={form.maxCubicFeet} onChange={e=>f("maxCubicFeet",e.target.value)} placeholder="2000"/></div>
              <div className="space-y-1"><Label>最大板數</Label><Input type="number" value={form.maxPallets} onChange={e=>f("maxPallets",e.target.value)} placeholder="20"/></div>
              <div className="col-span-2 text-xs font-semibold text-muted-foreground pb-1 border-b pt-2">示範內徑 / CM</div>
              <div className="space-y-1"><Label>長 (CM)</Label><Input type="number" value={form.innerLengthCm} onChange={e=>f("innerLengthCm",e.target.value)} placeholder="1496"/></div>
              <div className="space-y-1"><Label>寬 (CM)</Label><Input type="number" value={form.innerWidthCm} onChange={e=>f("innerWidthCm",e.target.value)} placeholder="250"/></div>
              <div className="space-y-1"><Label>高 (CM)</Label><Input type="number" value={form.innerHeightCm} onChange={e=>f("innerHeightCm",e.target.value)} placeholder="380"/></div>
              <div className="space-y-1"><Label>起吊高度 (CM)</Label><Input type="number" value={form.liftHeightCm} onChange={e=>f("liftHeightCm",e.target.value)} placeholder="150"/></div>
            </div>
          )}

          {/* ── GPS/通訊 ── */}
          {section === "gps" && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="space-y-1"><Label>GPS 廠商</Label><Input value={form.gpsVendor} onChange={e=>f("gpsVendor",e.target.value)} placeholder="廠商名稱"/></div>
              <div className="space-y-1"><Label>GPS 費用 / 月</Label><Input type="number" value={form.gpsCost} onChange={e=>f("gpsCost",e.target.value)} placeholder="0"/></div>
              <div className="space-y-1"><Label>SIM 卡號碼</Label><Input value={form.simNo} onChange={e=>f("simNo",e.target.value)} placeholder="0912-345-678"/></div>
              <div className="col-span-2 text-xs font-semibold text-muted-foreground pb-1 border-b pt-2">里程管理</div>
              <div className="space-y-1"><Label>過磅次數</Label><Input type="number" value={form.weighingCount} onChange={e=>f("weighingCount",e.target.value)} placeholder="0"/></div>
              <div className="space-y-1"><Label>保費公里數</Label><Input type="number" value={form.insuranceKm} onChange={e=>f("insuranceKm",e.target.value)} placeholder="356579"/></div>
              <div className="space-y-1"><Label>下次保養里程數</Label><Input type="number" value={form.nextMaintenanceKm} onChange={e=>f("nextMaintenanceKm",e.target.value)} placeholder="15000"/></div>
              <div className="space-y-1"><Label>耗油量</Label><Input type="number" step="0.01" value={form.fuelConsumption} onChange={e=>f("fuelConsumption",e.target.value)} placeholder="公升/百公里"/></div>
            </div>
          )}

          {/* ── 日期/費用 ── */}
          {section === "dates" && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="space-y-1"><Label>購車日期</Label><Input type="date" value={form.purchaseDate} onChange={e=>f("purchaseDate",e.target.value)}/></div>
              <div className="space-y-1"><Label>發照日期</Label><Input type="date" value={form.licenseIssueDate} onChange={e=>f("licenseIssueDate",e.target.value)}/></div>
              <div className="space-y-1"><Label>除帳日期</Label><Input type="date" value={form.deregisterDate} onChange={e=>f("deregisterDate",e.target.value)}/></div>
              <div className="space-y-1"><Label>車廠贊助日期</Label><Input type="date" value={form.dealerSponsorDate} onChange={e=>f("dealerSponsorDate",e.target.value)}/></div>
              <div className="space-y-1"><Label>每行費</Label><Input type="number" value={form.perTripFee} onChange={e=>f("perTripFee",e.target.value)} placeholder="0"/></div>
            </div>
          )}

          {/* ── 其他 ── */}
          {section === "other" && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="col-span-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">
                此頁可記錄額外備查資訊，目前欄位請使用「備註」欄位填寫。
              </div>
              <div className="col-span-2 space-y-1"><Label>備註</Label><Textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={5}/></div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-2 border-t">
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
  const [sub, setSub] = useState<"info"|"tax"|"insurance"|"etag">("info");
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

  function Row({ label, value }: { label:string; value:any }) {
    if (!value && value !== 0) return null;
    return (
      <div className="flex gap-2">
        <span className="text-muted-foreground w-32 shrink-0 text-right">{label}：</span>
        <span className="font-medium">{value}</span>
      </div>
    );
  }

  return (
    <Dialog open onOpenChange={o=>{if(!o)onClose();}}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600"/>
            {v.plate_no} {v.brand} {v.vehicle_model_type||v.vehicle_type}
            <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CFG[v.status]?.color}`}>{STATUS_CFG[v.status]?.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-1 border-b shrink-0">
          {([["info","📋 車輛詳情"],["tax","🧾 稅務"],["insurance","🛡️ 保險"],["etag","🏷️ eTag"]] as const).map(([id,label])=>(
            <button key={id} onClick={()=>setSub(id)} className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${sub===id?"border-blue-500 text-blue-600":"border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">
          {/* 車輛詳情 */}
          {sub === "info" && (
            <div className="text-xs space-y-1 pt-2 columns-2 gap-4">
              <Row label="車牌" value={v.plate_no} />
              <Row label="車號" value={v.vehicle_no} />
              <Row label="所屬分公司" value={v.branch_company} />
              <Row label="子車代碼" value={v.sub_vehicle_code} />
              <Row label="車輛種類" value={v.vehicle_category} />
              <Row label="車型" value={v.vehicle_type} />
              <Row label="型式" value={v.vehicle_model_type} />
              <Row label="廠牌" value={v.brand} />
              <Row label="出廠年月" value={v.year ? `${v.year}/${v.mfg_month||"─"}` : null} />
              <Row label="顏色" value={v.color} />
              <Row label="車身號碼" value={v.vin} />
              <Row label="引擎號碼" value={v.engine_no} />
              <Row label="燃料種類" value={v.fuel_type} />
              <Row label="CC 數" value={v.engine_cc ? `${v.engine_cc} cc` : null} />
              <Row label="輪胎尺寸" value={v.tire_size} />
              <Row label="扣門" value={v.gate_type} />
              <Row label="空車重" value={v.empty_weight_kg ? `${Number(v.empty_weight_kg).toLocaleString()} kg` : null} />
              <Row label="最大載重" value={v.max_load_kg ? `${Number(v.max_load_kg).toLocaleString()} kg` : null} />
              <Row label="最大才數" value={v.max_cubic_feet} />
              <Row label="最大板數" value={v.max_pallets} />
              <Row label="內徑長/寬/高" value={v.inner_length_cm ? `${v.inner_length_cm}×${v.inner_width_cm}×${v.inner_height_cm} cm` : null} />
              <Row label="起吊高度" value={v.lift_height_cm ? `${v.lift_height_cm} cm` : null} />
              <Row label="GPS 廠商" value={v.gps_vendor} />
              <Row label="SIM NO" value={v.sim_no} />
              <Row label="保費公里數" value={v.insurance_km ? `${Number(v.insurance_km).toLocaleString()} km` : null} />
              <Row label="下次保養里程" value={v.next_maintenance_km ? `${Number(v.next_maintenance_km).toLocaleString()} km` : null} />
              <Row label="耗油量" value={v.fuel_consumption ? `${v.fuel_consumption} L/100km` : null} />
              <Row label="所有人" value={v.owner_name} />
              <Row label="統編/身份證" value={v.owner_id} />
              <Row label="司機代號" value={v.driver_code} />
              <Row label="派用司機" value={v.assigned_driver} />
              <Row label="購車日期" value={v.purchase_date?.slice(0,10)} />
              <Row label="發照日期" value={v.license_issue_date?.slice(0,10)} />
              <Row label="除帳日期" value={v.deregister_date?.slice(0,10)} />
              <Row label="每行費" value={v.per_trip_fee ? `NT$${Number(v.per_trip_fee).toLocaleString()}` : null} />
              <Row label="合法辨識" value={v.is_legal_id} />
              {v.notes && <div className="col-span-2 pt-2 border-t text-muted-foreground">{v.notes}</div>}
            </div>
          )}

          {/* Tax */}
          {sub==="tax" && (
            <div className="space-y-2 pt-2">
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
            <div className="space-y-2 pt-2">
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
            <div className="space-y-2 pt-2">
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
        </div>
        <DialogFooter className="shrink-0 pt-2 border-t"><Button variant="outline" onClick={onClose}>關閉</Button></DialogFooter>
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
    queryFn:()=>{ const p=new URLSearchParams(); if(search)p.set("search",search); if(filterStatus!=="all")p.set("status",filterStatus); return fetch(`${API}/vehicles?${p}`).then(r=>r.json()).then(d=>Array.isArray(d)?d:[]); },
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
        {[{label:"車輛總數",value:stats.total,color:"text-primary"},{label:"行駛中",value:stats.active,color:"text-green-600"},{label:"停用/其他",value:stats.inactive,color:"text-gray-400"}].map(s=>(
          <div key={s.label} className="border rounded-lg p-3 bg-card"><div className="flex items-center gap-2"><Truck className={`w-4 h-4 ${s.color}`}/><div><div className={`text-xl font-bold ${s.color}`}>{s.value}</div><div className="text-[10px] text-muted-foreground">{s.label}</div></div></div></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜尋車牌、廠牌、車號..."
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
        <div className="border rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-muted/60 text-muted-foreground"><tr>
              {["車號","車牌","分公司","車輛種類/型式","廠牌","出廠年月","最大載重","燃料","狀態","操作"].map(h=><th key={h} className="p-2.5 text-left whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y">
              {vehicles.map(v=>(
                <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                  <td className="p-2.5 font-mono text-muted-foreground">{v.vehicle_no||"─"}</td>
                  <td className="p-2.5"><button onClick={()=>setDetailId(v.id)} className="font-mono font-bold text-blue-600 hover:underline">{v.plate_no}</button></td>
                  <td className="p-2.5">{v.branch_company||"─"}</td>
                  <td className="p-2.5"><div className="font-medium">{v.vehicle_category||v.vehicle_type||"─"}</div><div className="text-muted-foreground">{v.vehicle_model_type||""}</div></td>
                  <td className="p-2.5">{v.brand||"─"}</td>
                  <td className="p-2.5">{v.year ? `${v.year}${v.mfg_month?`.${String(v.mfg_month).padStart(2,"0")}`:".01"}` : "─"}</td>
                  <td className="p-2.5">{v.max_load_kg ? `${Number(v.max_load_kg).toLocaleString()}kg` : v.gross_weight ? `${v.gross_weight}T` : "─"}</td>
                  <td className="p-2.5">{v.fuel_type||"─"}</td>
                  <td className="p-2.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CFG[v.status]?.color}`}>{STATUS_CFG[v.status]?.label||v.status}</span></td>
                  <td className="p-2.5">
                    <div className="flex gap-1">
                      <button title="詳細" onClick={()=>setDetailId(v.id)} className="w-7 h-7 flex items-center justify-center rounded border hover:bg-blue-50 text-blue-600"><FileText className="w-3.5 h-3.5"/></button>
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
