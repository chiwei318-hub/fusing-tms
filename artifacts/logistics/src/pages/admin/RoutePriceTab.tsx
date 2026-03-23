import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, MapPin, Truck, Search, X, FileDown } from "lucide-react";
import ExcelJS from "exceljs";

const API_BASE = import.meta.env.BASE_URL + "api";

interface RoutePrice {
  id: number;
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  basePrice: number;
  waitingFeePerHour: number;
  elevatorFee: number;
  taxRate: number;
  heapmachineOnly: boolean;
  notes: string | null;
  createdAt: string;
}

const formSchema = z.object({
  fromLocation: z.string().min(1, "請填寫起點"),
  toLocation: z.string().min(1, "請填寫訖點"),
  vehicleType: z.string().min(1, "請填寫車型"),
  basePrice: z.coerce.number().int().min(0, "不可為負數"),
  waitingFeePerHour: z.coerce.number().int().min(0).default(0),
  elevatorFee: z.coerce.number().int().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(5),
  heapmachineOnly: z.boolean().default(false),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

async function fetchRoutePrices(): Promise<RoutePrice[]> {
  const res = await fetch(`${API_BASE}/route-prices`);
  if (!res.ok) throw new Error("載入失敗");
  return res.json();
}

async function saveRoutePrice(data: FormValues & { id?: number }): Promise<RoutePrice> {
  const { id, ...body } = data;
  const res = await fetch(`${API_BASE}/route-prices${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("儲存失敗");
  return res.json();
}

async function deleteRoutePrice(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/route-prices/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("刪除失敗");
}

function RoutePriceForm({
  defaultValues,
  onSubmit,
  loading,
}: {
  defaultValues: Partial<FormValues>;
  onSubmit: (v: FormValues) => void;
  loading: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fromLocation: "桃園平鎮",
      waitingFeePerHour: 0,
      elevatorFee: 0,
      taxRate: 5,
      heapmachineOnly: false,
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 py-1">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="fromLocation" render={({ field }) => (
            <FormItem>
              <FormLabel>起點</FormLabel>
              <FormControl><Input placeholder="桃園平鎮" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="toLocation" render={({ field }) => (
            <FormItem>
              <FormLabel>訖點 *</FormLabel>
              <FormControl><Input placeholder="楊梅" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="vehicleType" render={({ field }) => (
            <FormItem>
              <FormLabel>車型 *</FormLabel>
              <FormControl><Input placeholder="10.5T" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="basePrice" render={({ field }) => (
            <FormItem>
              <FormLabel>基本費用（元）*</FormLabel>
              <FormControl><Input type="number" min={0} placeholder="2700" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="waitingFeePerHour" render={({ field }) => (
            <FormItem>
              <FormLabel>等候費/小時</FormLabel>
              <FormControl><Input type="number" min={0} placeholder="500" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="elevatorFee" render={({ field }) => (
            <FormItem>
              <FormLabel>電梯費</FormLabel>
              <FormControl><Input type="number" min={0} placeholder="1000" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="taxRate" render={({ field }) => (
            <FormItem>
              <FormLabel>稅率 %</FormLabel>
              <FormControl><Input type="number" min={0} max={100} step="0.1" placeholder="5" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem>
            <FormLabel>備註</FormLabel>
            <FormControl><Input placeholder="例：堆高機作業、需預約..." {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="heapmachineOnly" render={({ field }) => (
          <FormItem className="flex items-center gap-2 pt-1">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <FormLabel className="!mt-0 cursor-pointer">僅限堆高機作業</FormLabel>
          </FormItem>
        )} />
        <DialogFooter className="pt-2">
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function groupByRoute(rows: RoutePrice[]) {
  const map = new Map<string, RoutePrice[]>();
  for (const r of rows) {
    const key = `${r.fromLocation} → ${r.toLocation}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export default function RoutePriceTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<RoutePrice | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["route-prices"],
    queryFn: fetchRoutePrices,
  });

  const saveMut = useMutation({
    mutationFn: saveRoutePrice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route-prices"] });
      setAddOpen(false);
      setEditRow(null);
      toast({ title: "已儲存" });
    },
    onError: (e: any) => toast({ title: "儲存失敗", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: deleteRoutePrice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route-prices"] });
      toast({ title: "已刪除" });
    },
    onError: (e: any) => toast({ title: "刪除失敗", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.fromLocation.toLowerCase().includes(q) ||
      r.toLocation.toLowerCase().includes(q) ||
      r.vehicleType.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const grouped = useMemo(() => groupByRoute(filtered), [filtered]);

  async function handleExport() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("路線報價表");
    const headers = ["起點", "訖點", "車型", "基本費用", "等候費/小時", "電梯費", "稅率%", "限堆高機", "備註"];
    const hRow = ws.addRow(headers);
    hRow.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      c.alignment = { horizontal: "center" };
    });
    rows.forEach(r => ws.addRow([
      r.fromLocation, r.toLocation, r.vehicleType, r.basePrice,
      r.waitingFeePerHour, r.elevatorFee, r.taxRate,
      r.heapmachineOnly ? "是" : "否", r.notes ?? "",
    ]));
    ws.columns = headers.map(h => ({ header: h, width: h === "備註" ? 28 : 16 }));
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = "路線報價表.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋起訖點、車型..."
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
            <Plus className="w-3.5 h-3.5" /> 新增路線
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />)}
        </div>
      ) : grouped.size === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm border shadow-sm">
          <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
          {search ? "沒有符合搜尋的路線" : "尚無路線報價資料，點「新增路線」開始建立"}
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([routeKey, items]) => (
            <Card key={routeKey} className="border shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm">{routeKey}</span>
                <span className="ml-auto text-xs text-muted-foreground">{items.length} 個車型</span>
              </div>
              <div className="divide-y">
                {items.map(row => (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group">
                    <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-bold text-sm">{row.vehicleType}</span>
                        <span className="text-base font-bold text-primary">
                          NT$ {row.basePrice.toLocaleString()}
                        </span>
                        {row.taxRate > 0 && (
                          <span className="text-xs text-muted-foreground">（未稅，{row.taxRate}% 外加）</span>
                        )}
                        {row.heapmachineOnly && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4">堆高機</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                        {row.waitingFeePerHour > 0 && (
                          <span>等候費 +{row.waitingFeePerHour.toLocaleString()}/小時</span>
                        )}
                        {row.elevatorFee > 0 && (
                          <span>電梯費 +{row.elevatorFee.toLocaleString()}</span>
                        )}
                        {row.notes && <span>{row.notes}</span>}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditRow(row)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`確定刪除「${row.vehicleType} ${routeKey}」的報價？`)) delMut.mutate(row.id);
                        }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>新增路線報價</DialogTitle>
            <DialogDescription>設定起訖點、車型與對應費用</DialogDescription>
          </DialogHeader>
          <RoutePriceForm
            defaultValues={{}}
            onSubmit={v => saveMut.mutate(v)}
            loading={saveMut.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>編輯路線報價</DialogTitle>
            <DialogDescription>{editRow?.fromLocation} → {editRow?.toLocation} · {editRow?.vehicleType}</DialogDescription>
          </DialogHeader>
          {editRow && (
            <RoutePriceForm
              defaultValues={{
                fromLocation: editRow.fromLocation,
                toLocation: editRow.toLocation,
                vehicleType: editRow.vehicleType,
                basePrice: editRow.basePrice,
                waitingFeePerHour: editRow.waitingFeePerHour,
                elevatorFee: editRow.elevatorFee,
                taxRate: editRow.taxRate,
                heapmachineOnly: editRow.heapmachineOnly,
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
