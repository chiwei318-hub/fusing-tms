import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Truck, Plus, Pencil, Trash2, Search, X, Calculator,
  Fuel, Wrench, DollarSign, Users, ChevronDown, ChevronUp,
  FileDown,
} from "lucide-react";
import ExcelJS from "exceljs";

const API_BASE = import.meta.env.BASE_URL + "api";

interface VehicleCost {
  id: number;
  vehicleName: string;
  vehicleType: string | null;
  plateNumber: string | null;
  vehicleValue: number;
  depreciationYears: number;
  residualValue: number;
  fuelConsumptionPer100km: number;
  fuelPricePerLiter: number;
  licenseTaxYearly: number;
  fuelTaxYearly: number;
  maintenanceMonthly: number;
  wearMonthly: number;
  driverSalaryMonthly: number;
  insuranceYearly: number;
  otherMonthly: number;
  workingDaysMonthly: number;
  tripsPerDay: number;
  notes: string | null;
}

const formSchema = z.object({
  vehicleName: z.string().min(1, "請填寫車輛名稱"),
  vehicleType: z.string().optional(),
  plateNumber: z.string().optional(),
  vehicleValue: z.coerce.number().int().min(0).default(0),
  depreciationYears: z.coerce.number().int().min(1).default(5),
  residualValue: z.coerce.number().int().min(0).default(0),
  fuelConsumptionPer100km: z.coerce.number().min(0).default(10),
  fuelPricePerLiter: z.coerce.number().min(0).default(32),
  licenseTaxYearly: z.coerce.number().int().min(0).default(0),
  fuelTaxYearly: z.coerce.number().int().min(0).default(0),
  maintenanceMonthly: z.coerce.number().int().min(0).default(0),
  wearMonthly: z.coerce.number().int().min(0).default(0),
  driverSalaryMonthly: z.coerce.number().int().min(0).default(0),
  insuranceYearly: z.coerce.number().int().min(0).default(0),
  otherMonthly: z.coerce.number().int().min(0).default(0),
  workingDaysMonthly: z.coerce.number().int().min(1).default(25),
  tripsPerDay: z.coerce.number().int().min(1).default(2),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function calcCostPerTrip(v: VehicleCost, distanceKm: number) {
  const depreciationMonthly = v.depreciationYears > 0
    ? (v.vehicleValue - v.residualValue) / (v.depreciationYears * 12)
    : 0;
  const fixedMonthly =
    (v.licenseTaxYearly + v.fuelTaxYearly + v.insuranceYearly) / 12 +
    v.maintenanceMonthly + v.wearMonthly + v.driverSalaryMonthly +
    v.otherMonthly + depreciationMonthly;
  const tripsPerMonth = v.workingDaysMonthly * v.tripsPerDay;
  const fixedPerTrip = tripsPerMonth > 0 ? fixedMonthly / tripsPerMonth : 0;
  const fuelPerTrip = (distanceKm / 100) * v.fuelConsumptionPer100km * v.fuelPricePerLiter;

  return {
    depreciationMonthly: Math.round(depreciationMonthly),
    fixedMonthly: Math.round(fixedMonthly),
    tripsPerMonth,
    fixedPerTrip: Math.round(fixedPerTrip),
    fuelPerTrip: Math.round(fuelPerTrip),
    totalPerTrip: Math.round(fixedPerTrip + fuelPerTrip),
    breakdown: {
      depreciation: Math.round(depreciationMonthly / tripsPerMonth),
      tax: Math.round((v.licenseTaxYearly + v.fuelTaxYearly) / 12 / tripsPerMonth),
      insurance: Math.round(v.insuranceYearly / 12 / tripsPerMonth),
      maintenance: Math.round(v.maintenanceMonthly / tripsPerMonth),
      wear: Math.round(v.wearMonthly / tripsPerMonth),
      salary: Math.round(v.driverSalaryMonthly / tripsPerMonth),
      other: Math.round(v.otherMonthly / tripsPerMonth),
      fuel: Math.round(fuelPerTrip),
    },
  };
}

const FIELD_GROUPS = [
  {
    title: "基本資料",
    icon: <Truck className="w-4 h-4" />,
    fields: [
      { name: "vehicleName", label: "車輛名稱 *", placeholder: "10.5T 廂型車", col: 2 },
      { name: "vehicleType", label: "車型", placeholder: "10.5T", col: 1 },
      { name: "plateNumber", label: "車牌號碼", placeholder: "AA-1234", col: 1 },
    ],
  },
  {
    title: "折舊設定",
    icon: <DollarSign className="w-4 h-4" />,
    fields: [
      { name: "vehicleValue", label: "車輛原值（元）", placeholder: "2000000", col: 1, type: "number" },
      { name: "depreciationYears", label: "折舊年限（年）", placeholder: "5", col: 1, type: "number" },
      { name: "residualValue", label: "殘值（元）", placeholder: "200000", col: 1, type: "number" },
    ],
  },
  {
    title: "燃油設定",
    icon: <Fuel className="w-4 h-4" />,
    fields: [
      { name: "fuelConsumptionPer100km", label: "油耗（L/100km）", placeholder: "12", col: 1, type: "number", step: "0.1" },
      { name: "fuelPricePerLiter", label: "油價（元/公升）", placeholder: "32", col: 1, type: "number", step: "0.1" },
    ],
  },
  {
    title: "年度固定費用",
    icon: <DollarSign className="w-4 h-4" />,
    fields: [
      { name: "licenseTaxYearly", label: "牌照稅（元/年）", placeholder: "15120", col: 1, type: "number" },
      { name: "fuelTaxYearly", label: "燃料稅（元/年）", placeholder: "7200", col: 1, type: "number" },
      { name: "insuranceYearly", label: "保險費（元/年）", placeholder: "60000", col: 1, type: "number" },
    ],
  },
  {
    title: "每月固定費用",
    icon: <Wrench className="w-4 h-4" />,
    fields: [
      { name: "maintenanceMonthly", label: "保養費（元/月）", placeholder: "5000", col: 1, type: "number" },
      { name: "wearMonthly", label: "消磨耗損（元/月）", placeholder: "3000", col: 1, type: "number" },
      { name: "otherMonthly", label: "其他支出（元/月）", placeholder: "2000", col: 1, type: "number" },
    ],
  },
  {
    title: "人力設定",
    icon: <Users className="w-4 h-4" />,
    fields: [
      { name: "driverSalaryMonthly", label: "司機薪資（元/月）", placeholder: "45000", col: 1, type: "number" },
      { name: "workingDaysMonthly", label: "每月工作天數", placeholder: "25", col: 1, type: "number" },
      { name: "tripsPerDay", label: "每天趟數", placeholder: "2", col: 1, type: "number" },
    ],
  },
];

function VehicleForm({ defaultValues, onSubmit, loading }: {
  defaultValues: Partial<FormValues>;
  onSubmit: (v: FormValues) => void;
  loading: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      depreciationYears: 5, fuelConsumptionPer100km: 10,
      fuelPricePerLiter: 32, workingDaysMonthly: 25, tripsPerDay: 2,
      vehicleValue: 0, residualValue: 0, licenseTaxYearly: 0, fuelTaxYearly: 0,
      maintenanceMonthly: 0, wearMonthly: 0, driverSalaryMonthly: 0,
      insuranceYearly: 0, otherMonthly: 0,
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {FIELD_GROUPS.map(group => (
          <div key={group.title}>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {group.icon} {group.title}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.fields.map(f => (
                <FormField key={f.name} control={form.control} name={f.name as any} render={({ field }) => (
                  <FormItem className={f.col === 2 ? "col-span-2" : ""}>
                    <FormLabel className="text-xs">{f.label}</FormLabel>
                    <FormControl>
                      <Input
                        type={f.type ?? "text"}
                        placeholder={f.placeholder}
                        step={(f as any).step}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
            </div>
          </div>
        ))}
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">備註</FormLabel>
            <FormControl><Input placeholder="備註說明..." {...field} value={field.value ?? ""} /></FormControl>
          </FormItem>
        )} />
        <DialogFooter>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function CostCard({ vehicle }: { vehicle: VehicleCost }) {
  const [expanded, setExpanded] = useState(false);
  const [distance, setDistance] = useState("50");
  const km = parseFloat(distance) || 0;
  const calc = useMemo(() => calcCostPerTrip(vehicle, km), [vehicle, km]);

  const items = [
    { label: "折舊", value: calc.breakdown.depreciation, color: "bg-orange-400" },
    { label: "稅費", value: calc.breakdown.tax, color: "bg-yellow-400" },
    { label: "保險", value: calc.breakdown.insurance, color: "bg-blue-400" },
    { label: "保養", value: calc.breakdown.maintenance, color: "bg-green-400" },
    { label: "耗損", value: calc.breakdown.wear, color: "bg-purple-400" },
    { label: "薪資", value: calc.breakdown.salary, color: "bg-red-400" },
    { label: "其他", value: calc.breakdown.other, color: "bg-gray-400" },
    { label: "油錢", value: calc.breakdown.fuel, color: "bg-cyan-400" },
  ].filter(i => i.value > 0);

  const total = calc.totalPerTrip;
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-card cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm">{vehicle.vehicleName}</span>
            {vehicle.vehicleType && (
              <Badge variant="secondary" className="text-[10px] py-0 h-4">{vehicle.vehicleType}</Badge>
            )}
            {vehicle.plateNumber && (
              <span className="text-xs text-muted-foreground font-mono">{vehicle.plateNumber}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            固定成本 NT${calc.fixedMonthly.toLocaleString()}/月 ·
            每趟 {vehicle.workingDaysMonthly}天×{vehicle.tripsPerDay}趟 共 {calc.tripsPerMonth} 趟
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-lg text-primary">NT${calc.totalPerTrip.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">每趟成本（{km}km）</div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t bg-muted/10 px-4 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">每趟距離試算</span>
            <div className="flex items-center gap-1 ml-auto">
              <Input
                type="number"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                className="h-7 w-20 text-xs text-right"
                min={0}
              />
              <span className="text-xs text-muted-foreground">公里</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "固定成本/趟", value: calc.fixedPerTrip, sub: "不含油錢" },
              { label: "油錢/趟", value: calc.fuelPerTrip, sub: `${vehicle.fuelConsumptionPer100km}L/100km × NT$${vehicle.fuelPricePerLiter}` },
              { label: "總成本/趟", value: calc.totalPerTrip, sub: "固定＋油錢", primary: true },
              { label: "折舊/月", value: calc.depreciationMonthly, sub: `${vehicle.depreciationYears}年 殘值${vehicle.residualValue.toLocaleString()}` },
            ].map(item => (
              <div key={item.label} className={`rounded-lg p-3 text-center ${item.primary ? "bg-primary/10 border border-primary/20" : "bg-card border"}`}>
                <div className={`text-lg font-bold ${item.primary ? "text-primary" : ""}`}>
                  NT${item.value.toLocaleString()}
                </div>
                <div className="text-[11px] font-medium">{item.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>

          {items.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5 font-medium">費用結構（每趟）</div>
              <div className="flex rounded overflow-hidden h-3 mb-2">
                {items.map(i => (
                  <div key={i.label} className={`${i.color} transition-all`} style={{ width: `${pct(i.value)}%` }} title={`${i.label}: ${pct(i.value)}%`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {items.map(i => (
                  <div key={i.label} className="flex items-center gap-1 text-xs">
                    <span className={`w-2 h-2 rounded-full ${i.color} shrink-0`} />
                    <span className="text-muted-foreground">{i.label}</span>
                    <span className="font-mono">NT${i.value.toLocaleString()}</span>
                    <span className="text-muted-foreground">({pct(i.value)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            {[
              ["油耗", `${vehicle.fuelConsumptionPer100km} L/100km`],
              ["油價", `NT$${vehicle.fuelPricePerLiter}/升`],
              ["牌照稅", `NT$${(vehicle.licenseTaxYearly).toLocaleString()}/年`],
              ["燃料稅", `NT$${(vehicle.fuelTaxYearly).toLocaleString()}/年`],
              ["保險費", `NT$${(vehicle.insuranceYearly).toLocaleString()}/年`],
              ["保養費", `NT$${(vehicle.maintenanceMonthly).toLocaleString()}/月`],
              ["消磨耗損", `NT$${(vehicle.wearMonthly).toLocaleString()}/月`],
              ["司機薪資", `NT$${(vehicle.driverSalaryMonthly).toLocaleString()}/月`],
              ["其他支出", `NT$${(vehicle.otherMonthly).toLocaleString()}/月`],
              ["工作天數", `${vehicle.workingDaysMonthly}天/月`],
              ["每天趟數", `${vehicle.tripsPerDay}趟`],
              vehicle.notes ? ["備註", vehicle.notes] : null,
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} className="flex gap-1">
                <span className="text-muted-foreground shrink-0">{k}：</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchVehicleCosts(): Promise<VehicleCost[]> {
  const res = await fetch(`${API_BASE}/vehicle-costs`);
  if (!res.ok) throw new Error("載入失敗");
  return res.json();
}
async function saveVehicleCost(data: FormValues & { id?: number }): Promise<VehicleCost> {
  const { id, ...body } = data;
  const res = await fetch(`${API_BASE}/vehicle-costs${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("儲存失敗");
  return res.json();
}
async function deleteVehicleCost(id: number) {
  const res = await fetch(`${API_BASE}/vehicle-costs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("刪除失敗");
}

export default function VehicleCostTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<VehicleCost | null>(null);

  const { data: vehicles = [], isLoading } = useQuery({ queryKey: ["vehicle-costs"], queryFn: fetchVehicleCosts });

  const saveMut = useMutation({
    mutationFn: saveVehicleCost,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-costs"] }); setAddOpen(false); setEditRow(null); toast({ title: "已儲存" }); },
    onError: (e: any) => toast({ title: "儲存失敗", description: e.message, variant: "destructive" }),
  });
  const delMut = useMutation({
    mutationFn: deleteVehicleCost,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicle-costs"] }); toast({ title: "已刪除" }); },
    onError: (e: any) => toast({ title: "刪除失敗", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(v =>
      v.vehicleName.toLowerCase().includes(q) ||
      (v.vehicleType ?? "").toLowerCase().includes(q) ||
      (v.plateNumber ?? "").toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  async function handleExport() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("車輛成本");
    const headers = ["車輛名稱", "車型", "車牌", "車輛原值", "折舊年限", "殘值", "油耗L/100km", "油價元/升", "牌照稅/年", "燃料稅/年", "保險/年", "保養/月", "耗損/月", "薪資/月", "其他/月", "工作天/月", "趟數/天", "備註"];
    const hRow = ws.addRow(headers);
    hRow.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      c.alignment = { horizontal: "center" };
    });
    vehicles.forEach(v => ws.addRow([
      v.vehicleName, v.vehicleType ?? "", v.plateNumber ?? "",
      v.vehicleValue, v.depreciationYears, v.residualValue,
      v.fuelConsumptionPer100km, v.fuelPricePerLiter,
      v.licenseTaxYearly, v.fuelTaxYearly, v.insuranceYearly,
      v.maintenanceMonthly, v.wearMonthly, v.driverSalaryMonthly,
      v.otherMonthly, v.workingDaysMonthly, v.tripsPerDay, v.notes ?? "",
    ]));
    ws.columns = headers.map(h => ({ header: h, width: 14 }));
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = "車輛成本表.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜尋車輛名稱、車型、車牌..."
            className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={handleExport}>
            <FileDown className="w-3.5 h-3.5" /> 匯出 Excel
          </Button>
          <Button size="sm" className="gap-1.5 h-9" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> 新增車輛
          </Button>
        </div>
      </div>

      {!isLoading && vehicles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "車輛數", value: vehicles.length, unit: "輛" },
            { label: "平均固定成本/月", value: `NT$${Math.round(vehicles.reduce((s, v) => s + calcCostPerTrip(v, 0).fixedMonthly, 0) / vehicles.length).toLocaleString()}`, unit: "" },
            { label: "平均每趟成本(50km)", value: `NT$${Math.round(vehicles.reduce((s, v) => s + calcCostPerTrip(v, 50).totalPerTrip, 0) / vehicles.length).toLocaleString()}`, unit: "" },
            { label: "平均折舊/月", value: `NT$${Math.round(vehicles.reduce((s, v) => s + calcCostPerTrip(v, 0).depreciationMonthly, 0) / vehicles.length).toLocaleString()}`, unit: "" },
          ].map(item => (
            <Card key={item.label} className="border shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold">{item.value}{item.unit}</div>
                <div className="text-[11px] text-muted-foreground">{item.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/60 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm border shadow-sm">
          <Truck className="w-8 h-8 mx-auto mb-3 opacity-30" />
          {search ? "沒有符合搜尋的車輛" : "尚無車輛資料，點「新增車輛」開始建立"}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <div key={v.id} className="relative group">
              <CostCard vehicle={v} />
              <div className="absolute top-2.5 right-10 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm"
                  onClick={e => { e.stopPropagation(); setEditRow(v); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm text-destructive hover:bg-destructive/10"
                  onClick={e => { e.stopPropagation(); if (confirm(`確定刪除「${v.vehicleName}」？`)) delMut.mutate(v.id); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增車輛成本設定</DialogTitle>
            <DialogDescription>設定各項成本，系統自動試算每趟費用</DialogDescription>
          </DialogHeader>
          <VehicleForm defaultValues={{}} onSubmit={v => saveMut.mutate(v)} loading={saveMut.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯車輛成本設定</DialogTitle>
            <DialogDescription>{editRow?.vehicleName}</DialogDescription>
          </DialogHeader>
          {editRow && (
            <VehicleForm
              defaultValues={{
                vehicleName: editRow.vehicleName,
                vehicleType: editRow.vehicleType ?? "",
                plateNumber: editRow.plateNumber ?? "",
                vehicleValue: editRow.vehicleValue,
                depreciationYears: editRow.depreciationYears,
                residualValue: editRow.residualValue,
                fuelConsumptionPer100km: editRow.fuelConsumptionPer100km,
                fuelPricePerLiter: editRow.fuelPricePerLiter,
                licenseTaxYearly: editRow.licenseTaxYearly,
                fuelTaxYearly: editRow.fuelTaxYearly,
                maintenanceMonthly: editRow.maintenanceMonthly,
                wearMonthly: editRow.wearMonthly,
                driverSalaryMonthly: editRow.driverSalaryMonthly,
                insuranceYearly: editRow.insuranceYearly,
                otherMonthly: editRow.otherMonthly,
                workingDaysMonthly: editRow.workingDaysMonthly,
                tripsPerDay: editRow.tripsPerDay,
                notes: editRow.notes ?? "",
              }}
              onSubmit={v => saveMut.mutate({ ...v, id: editRow.id })}
              loading={saveMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
