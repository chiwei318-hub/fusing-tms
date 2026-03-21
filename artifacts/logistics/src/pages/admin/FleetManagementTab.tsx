import { useState, useMemo } from "react";
import {
  AlertTriangle, Bell, Car, FileText, Search, Plus, Pencil, Trash2,
  CheckCircle2, Clock, XCircle, Truck, User, Phone, Calendar,
  Shield, ChevronDown, RefreshCw, Filter, Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useOrders } from "@/hooks/use-orders";
import { useDrivers, useUpdateDriver } from "@/hooks/use-drivers";
import {
  useLicenses, useCreateLicense, useUpdateLicense, useDeleteLicense,
  getLicenseStatus, getDaysUntilExpiry, type VehicleLicense, type VehicleLicenseInput,
} from "@/hooks/use-licenses";

// ─── Types ─────────────────────────────────────────────────────────────────────
const LICENSE_TYPES = ["職業駕照", "行車執照", "車輛保險", "其他"] as const;
const BODY_TYPES = ["廂型", "冷藏", "尾門", "平斗", "機車", "其他"] as const;
const TONNAGE_OPTIONS = ["機車", "0.5T", "1T", "1.5T", "2T", "3.5T", "5T", "8T", "11T", "17T", "25T"];
const STATUS_FILTER = ["全部", "有效", "即將到期", "已過期"] as const;

const EMPTY_LICENSE: VehicleLicenseInput = {
  driverId: null, licenseType: "行車執照", licenseNumber: "",
  ownerName: "", ownerPhone: "", vehiclePlate: "", issuedDate: "", expiryDate: "", notes: "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "expired") return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><XCircle className="w-3 h-3" />已過期</Badge>;
  if (status === "expiring") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><AlertTriangle className="w-3 h-3" />即將到期</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" />有效</Badge>;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ─── Section 1: 出發提醒警示 ──────────────────────────────────────────────────
function DepartureAlertsSection() {
  const { data: orders = [], isLoading: oLoading } = useOrders();
  const { data: drivers = [], isLoading: dLoading } = useDrivers();
  const today = todayStr();

  const unassigned = useMemo(() =>
    orders.filter(o => o.status === "pending" && !o.driverId),
    [orders]
  );
  const assignedNotDeparted = useMemo(() =>
    orders.filter(o => o.driverId && (o.status === "pending" || o.status === "assigned")),
    [orders]
  );
  const overdueToday = useMemo(() =>
    orders.filter(o => {
      if (!o.pickupDate || o.status === "delivered" || o.status === "cancelled") return false;
      return o.pickupDate <= today && o.status !== "delivered";
    }),
    [orders, today]
  );
  const offlineDrivers = useMemo(() =>
    drivers.filter(d => d.status === "offline"),
    [drivers]
  );
  const availableDrivers = useMemo(() =>
    drivers.filter(d => d.status === "available"),
    [drivers]
  );

  if (oLoading || dLoading) return (
    <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
      <RefreshCw className="w-4 h-4 animate-spin" /> 載入中…
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "未派單", value: unassigned.length, color: "bg-red-50 border-red-200", text: "text-red-700", icon: <AlertTriangle className="w-4 h-4" /> },
          { label: "已派未出發", value: assignedNotDeparted.length, color: "bg-amber-50 border-amber-200", text: "text-amber-700", icon: <Clock className="w-4 h-4" /> },
          { label: "今日逾期", value: overdueToday.length, color: "bg-orange-50 border-orange-200", text: "text-orange-700", icon: <XCircle className="w-4 h-4" /> },
          { label: "可接單司機", value: availableDrivers.length, color: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", icon: <CheckCircle2 className="w-4 h-4" /> },
        ].map(({ label, value, color, text, icon }) => (
          <Card key={label} className={`border ${color}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <span className={text}>{icon}</span>
              <div>
                <p className={`text-xl font-bold ${text}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Unassigned orders */}
      {unassigned.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2 pt-3 px-4 flex-row items-center gap-2 space-y-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <CardTitle className="text-sm text-red-700">待派單訂單（{unassigned.length} 筆）</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {unassigned.map(o => (
              <div key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <span className="font-mono text-muted-foreground text-xs w-8">#{o.id}</span>
                <span className="flex-1 truncate">{o.pickupAddress}</span>
                <span className="text-xs text-muted-foreground ml-2">{formatDate(o.pickupDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Assigned but not departed */}
      {assignedNotDeparted.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2 pt-3 px-4 flex-row items-center gap-2 space-y-0">
            <Clock className="w-4 h-4 text-amber-600" />
            <CardTitle className="text-sm text-amber-700">已指派未出發（{assignedNotDeparted.length} 筆）</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {assignedNotDeparted.map(o => {
              const driver = drivers.find(d => d.id === o.driverId);
              return (
                <div key={o.id} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                  <span className="font-mono text-muted-foreground text-xs w-8">#{o.id}</span>
                  <span className="flex-1 truncate">{o.pickupAddress}</span>
                  {driver && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      <Truck className="w-3 h-3 mr-1" />{driver.name}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{o.pickupTime || "未設時間"}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Overdue today */}
      {overdueToday.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2 pt-3 px-4 flex-row items-center gap-2 space-y-0">
            <XCircle className="w-4 h-4 text-orange-600" />
            <CardTitle className="text-sm text-orange-700">今日逾期未完成（{overdueToday.length} 筆）</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {overdueToday.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-0">
                <span className="font-mono text-muted-foreground text-xs w-8">#{o.id}</span>
                <span className="flex-1 truncate">{o.pickupAddress}</span>
                <Badge className={o.status === "in_transit" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"} variant="outline">
                  {o.status === "in_transit" ? "運送中" : o.status === "assigned" ? "已指派" : "待派車"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Offline drivers */}
      {offlineDrivers.length > 0 && (
        <Card className="border-gray-200">
          <CardHeader className="pb-2 pt-3 px-4 flex-row items-center gap-2 space-y-0">
            <Truck className="w-4 h-4 text-gray-500" />
            <CardTitle className="text-sm text-gray-600">下線車輛（{offlineDrivers.length} 輛）</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {offlineDrivers.map(d => (
                <Badge key={d.id} variant="outline" className="text-xs text-gray-500">
                  {d.name} · {d.licensePlate}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {unassigned.length === 0 && assignedNotDeparted.length === 0 && overdueToday.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
            <p className="font-medium">目前無待處理警示</p>
            <p className="text-sm mt-1">所有訂單均已正常調度</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Section 2: 證照管理 ────────────────────────────────────────────────────────
function LicenseDialog({
  open, onClose, editItem, drivers,
}: {
  open: boolean;
  onClose: () => void;
  editItem: VehicleLicense | null;
  drivers: any[];
}) {
  const { toast } = useToast();
  const create = useCreateLicense();
  const update = useUpdateLicense();
  const [form, setForm] = useState<VehicleLicenseInput>(EMPTY_LICENSE);

  useMemo(() => {
    if (editItem) {
      setForm({
        driverId: editItem.driverId,
        licenseType: editItem.licenseType,
        licenseNumber: editItem.licenseNumber ?? "",
        ownerName: editItem.ownerName ?? "",
        ownerPhone: editItem.ownerPhone ?? "",
        vehiclePlate: editItem.vehiclePlate ?? "",
        issuedDate: editItem.issuedDate ?? "",
        expiryDate: editItem.expiryDate,
        notes: editItem.notes ?? "",
      });
    } else {
      setForm(EMPTY_LICENSE);
    }
  }, [editItem, open]);

  const set = (k: keyof VehicleLicenseInput, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.expiryDate) {
      toast({ title: "請填寫到期日", variant: "destructive" });
      return;
    }
    try {
      if (editItem) {
        await update.mutateAsync({ id: editItem.id, data: form });
        toast({ title: "證照更新成功" });
      } else {
        await create.mutateAsync(form);
        toast({ title: "證照新增成功" });
      }
      onClose();
    } catch {
      toast({ title: "儲存失敗", variant: "destructive" });
    }
  }

  const isPending = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {editItem ? "編輯證照" : "新增證照"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">關聯司機（選填）</Label>
            <Select value={form.driverId?.toString() ?? "none"}
              onValueChange={v => set("driverId", v === "none" ? null : parseInt(v))}>
              <SelectTrigger className="h-9 mt-0.5">
                <SelectValue placeholder="選擇司機" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不關聯司機</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id.toString()}>
                    {d.name} · {d.licensePlate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">證照類型 *</Label>
            <Select value={form.licenseType} onValueChange={v => set("licenseType", v)}>
              <SelectTrigger className="h-9 mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">車主姓名</Label>
              <Input className="h-9 mt-0.5" placeholder="王大明" value={form.ownerName ?? ""}
                onChange={e => set("ownerName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">車主電話</Label>
              <Input className="h-9 mt-0.5" placeholder="0912-345-678" value={form.ownerPhone ?? ""}
                onChange={e => set("ownerPhone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">車牌號碼</Label>
              <Input className="h-9 mt-0.5 font-mono" placeholder="ABC-1234" value={form.vehiclePlate ?? ""}
                onChange={e => set("vehiclePlate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">證照號碼</Label>
              <Input className="h-9 mt-0.5" placeholder="A12345678" value={form.licenseNumber ?? ""}
                onChange={e => set("licenseNumber", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">核發日期</Label>
              <Input type="date" className="h-9 mt-0.5" value={form.issuedDate ?? ""}
                onChange={e => set("issuedDate", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">到期日期 *</Label>
              <Input type="date" className="h-9 mt-0.5" value={form.expiryDate}
                onChange={e => set("expiryDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">備註</Label>
            <Input className="h-9 mt-0.5" placeholder="備注說明" value={form.notes ?? ""}
              onChange={e => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>取消</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LicensesSection() {
  const { data: licenses = [], isLoading } = useLicenses();
  const { data: drivers = [] } = useDrivers();
  const deleteLicense = useDeleteLicense();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [typeFilter, setTypeFilter] = useState<string>("全部");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<VehicleLicense | null>(null);

  const filtered = useMemo(() => {
    let list = licenses;
    if (statusFilter !== "全部") {
      const map: Record<string, string> = { "有效": "valid", "即將到期": "expiring", "已過期": "expired" };
      list = list.filter(l => getLicenseStatus(l.expiryDate) === map[statusFilter]);
    }
    if (typeFilter !== "全部") list = list.filter(l => l.licenseType === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        l.ownerName?.toLowerCase().includes(q) ||
        l.vehiclePlate?.toLowerCase().includes(q) ||
        l.licenseNumber?.toLowerCase().includes(q) ||
        l.licenseType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [licenses, statusFilter, typeFilter, search]);

  const expiredCount = useMemo(() => licenses.filter(l => getLicenseStatus(l.expiryDate) === "expired").length, [licenses]);
  const expiringCount = useMemo(() => licenses.filter(l => getLicenseStatus(l.expiryDate) === "expiring").length, [licenses]);

  async function handleDelete(id: number) {
    if (!confirm("確定刪除此筆證照資料？")) return;
    try {
      await deleteLicense.mutateAsync(id);
      toast({ title: "已刪除" });
    } catch {
      toast({ title: "刪除失敗", variant: "destructive" });
    }
  }

  const getDriverName = (id: number | null) => {
    if (!id) return null;
    return drivers.find(d => d.id === id)?.name ?? null;
  };

  return (
    <div className="space-y-4">
      {/* Warning summary */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-red-700 font-medium">{expiredCount} 筆已過期</span>
            </div>
          )}
          {expiringCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-700 font-medium">{expiringCount} 筆即將到期（30天內）</span>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="搜尋車主、車牌、號碼…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTER.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部" className="text-xs">全部類型</SelectItem>
            {LICENSE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 gap-1.5 shrink-0" onClick={() => { setEditItem(null); setDialogOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> 新增證照
        </Button>
      </div>

      {/* License table */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">載入中…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm">尚無證照資料</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(lic => {
            const status = getLicenseStatus(lic.expiryDate);
            const days = getDaysUntilExpiry(lic.expiryDate);
            const driverName = getDriverName(lic.driverId);
            return (
              <Card key={lic.id} className={`border ${status === "expired" ? "border-red-200 bg-red-50/30" : status === "expiring" ? "border-amber-200 bg-amber-50/30" : ""}`}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      <span className="font-semibold text-sm">{lic.licenseType}</span>
                      {statusBadge(status)}
                      {status === "expiring" && (
                        <span className="text-xs text-amber-600 font-medium">還有 {days} 天到期</span>
                      )}
                      {status === "expired" && (
                        <span className="text-xs text-red-600 font-medium">已過期 {Math.abs(days)} 天</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      {lic.ownerName && <span><User className="inline w-3 h-3 mr-0.5" />{lic.ownerName}</span>}
                      {lic.vehiclePlate && <span className="font-mono"><Truck className="inline w-3 h-3 mr-0.5" />{lic.vehiclePlate}</span>}
                      {lic.licenseNumber && <span><FileText className="inline w-3 h-3 mr-0.5" />{lic.licenseNumber}</span>}
                      {driverName && <span><User className="inline w-3 h-3 mr-0.5" />{driverName}</span>}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {lic.issuedDate && <span>核發：{formatDate(lic.issuedDate)}</span>}
                      <span className={status !== "valid" ? "font-semibold" : ""}>
                        到期：{formatDate(lic.expiryDate)}
                      </span>
                      {lic.ownerPhone && <span><Phone className="inline w-3 h-3 mr-0.5" />{lic.ownerPhone}</span>}
                    </div>
                    {lic.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{lic.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditItem(lic); setDialogOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(lic.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <LicenseDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editItem={editItem}
        drivers={drivers}
      />
    </div>
  );
}

// ─── Section 3: 車輛資料 ────────────────────────────────────────────────────────
function VehicleDataDialog({
  open, onClose, driver,
}: {
  open: boolean;
  onClose: () => void;
  driver: any | null;
}) {
  const { toast } = useToast();
  const update = useUpdateDriver();
  const [form, setForm] = useState({ engineCc: "", vehicleYear: "", vehicleTonnage: "", vehicleBodyType: "" });

  useMemo(() => {
    if (driver) {
      setForm({
        engineCc: driver.engineCc?.toString() ?? "",
        vehicleYear: driver.vehicleYear?.toString() ?? "",
        vehicleTonnage: driver.vehicleTonnage ?? "",
        vehicleBodyType: driver.vehicleBodyType ?? "",
      });
    } else {
      setForm({ engineCc: "", vehicleYear: "", vehicleTonnage: "", vehicleBodyType: "" });
    }
  }, [driver, open]);

  async function handleSave() {
    if (!driver) return;
    try {
      await update.mutateAsync({
        id: driver.id,
        data: {
          engineCc: form.engineCc ? parseInt(form.engineCc) : null,
          vehicleYear: form.vehicleYear ? parseInt(form.vehicleYear) : null,
          vehicleTonnage: form.vehicleTonnage || null,
          vehicleBodyType: form.vehicleBodyType || null,
        } as any,
      });
      toast({ title: "車輛資料已更新" });
      onClose();
    } catch {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            編輯車輛資料 — {driver?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="p-3 bg-muted/40 rounded-lg text-sm">
            <p className="font-medium">{driver?.vehicleType}</p>
            <p className="text-muted-foreground font-mono text-xs">{driver?.licensePlate}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">噸數</Label>
              <Select value={form.vehicleTonnage || "none"} onValueChange={v => setForm(f => ({ ...f, vehicleTonnage: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 mt-0.5 text-sm"><SelectValue placeholder="選擇" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {TONNAGE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">型式</Label>
              <Select value={form.vehicleBodyType || "none"} onValueChange={v => setForm(f => ({ ...f, vehicleBodyType: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 mt-0.5 text-sm"><SelectValue placeholder="選擇" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {BODY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">排氣量（CC）</Label>
              <Input type="number" className="h-9 mt-0.5" placeholder="2400"
                value={form.engineCc} onChange={e => setForm(f => ({ ...f, engineCc: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">出廠年份</Label>
              <Input type="number" className="h-9 mt-0.5" placeholder="2020" min={1990} max={2030}
                value={form.vehicleYear} onChange={e => setForm(f => ({ ...f, vehicleYear: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleDataSection() {
  const { data: drivers = [], isLoading } = useDrivers();
  const [search, setSearch] = useState("");
  const [bodyFilter, setBodyFilter] = useState("全部");
  const [tonnageFilter, setTonnageFilter] = useState("全部");
  const [editDriver, setEditDriver] = useState<any | null>(null);

  const filtered = useMemo(() => {
    let list = [...drivers];
    if (bodyFilter !== "全部") list = list.filter(d => d.vehicleBodyType === bodyFilter);
    if (tonnageFilter !== "全部") list = list.filter(d => d.vehicleTonnage === tonnageFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.licensePlate.toLowerCase().includes(q) ||
        d.vehicleType.toLowerCase().includes(q) ||
        d.vehicleBodyType?.toLowerCase().includes(q) ||
        d.vehicleTonnage?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [drivers, bodyFilter, tonnageFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="搜尋司機、車牌、車型…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={bodyFilter} onValueChange={setBodyFilter}>
          <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部" className="text-xs">全部型式</SelectItem>
            {BODY_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tonnageFilter} onValueChange={setTonnageFilter}>
          <SelectTrigger className="h-8 text-xs w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="全部" className="text-xs">全部噸數</SelectItem>
            {TONNAGE_OPTIONS.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">載入中…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm">無符合條件的車輛</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(d => {
            const statusColors: Record<string, string> = {
              available: "bg-emerald-100 text-emerald-700",
              busy: "bg-amber-100 text-amber-700",
              offline: "bg-gray-100 text-gray-600",
            };
            const statusLabels: Record<string, string> = { available: "可接單", busy: "忙碌中", offline: "下線" };
            return (
              <Card key={d.id} className="border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                          {d.name[0]}
                        </div>
                        <span className="font-semibold text-sm">{d.name}</span>
                        <Badge className={`text-xs ${statusColors[d.status] || statusColors.offline}`} variant="outline">
                          {statusLabels[d.status] || d.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono pl-9">{d.licensePlate}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 -mt-0.5 -mr-0.5"
                      onClick={() => setEditDriver(d)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-sm font-medium">{d.vehicleType}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Package className="w-3 h-3" />
                        <span>{d.vehicleTonnage ? <span className="text-foreground font-medium">{d.vehicleTonnage}</span> : <span className="italic">噸數未設</span>}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Truck className="w-3 h-3" />
                        <span>{d.vehicleBodyType ? <span className="text-foreground font-medium">{d.vehicleBodyType}</span> : <span className="italic">型式未設</span>}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Car className="w-3 h-3" />
                        <span>{d.engineCc ? <span className="text-foreground">{d.engineCc} CC</span> : <span className="italic">CC未設</span>}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{d.vehicleYear ? <span className="text-foreground">{d.vehicleYear} 年</span> : <span className="italic">年份未設</span>}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <VehicleDataDialog
        open={!!editDriver}
        onClose={() => setEditDriver(null)}
        driver={editDriver}
      />
    </div>
  );
}

// ─── Main FleetManagementTab ────────────────────────────────────────────────────
export default function FleetManagementTab() {
  const { data: licenses = [] } = useLicenses();
  const expiredCount = useMemo(() => licenses.filter(l => getLicenseStatus(l.expiryDate) === "expired").length, [licenses]);
  const expiringCount = useMemo(() => licenses.filter(l => getLicenseStatus(l.expiryDate) === "expiring").length, [licenses]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> 營運提醒與車隊管理
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">出發警示、證照到期、車輛資料管理</p>
        </div>
        {(expiredCount > 0 || expiringCount > 0) && (
          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {expiredCount + expiringCount} 筆需注意
          </Badge>
        )}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList className="w-full h-9">
          <TabsTrigger value="alerts" className="flex-1 text-xs gap-1">
            <Bell className="w-3 h-3" /> 出發提醒
          </TabsTrigger>
          <TabsTrigger value="licenses" className="flex-1 text-xs gap-1 relative">
            <Shield className="w-3 h-3" /> 證照管理
            {(expiredCount + expiringCount) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                {expiredCount + expiringCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="flex-1 text-xs gap-1">
            <Truck className="w-3 h-3" /> 車輛資料
          </TabsTrigger>
        </TabsList>
        <TabsContent value="alerts" className="mt-4 outline-none">
          <DepartureAlertsSection />
        </TabsContent>
        <TabsContent value="licenses" className="mt-4 outline-none">
          <LicensesSection />
        </TabsContent>
        <TabsContent value="vehicles" className="mt-4 outline-none">
          <VehicleDataSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
