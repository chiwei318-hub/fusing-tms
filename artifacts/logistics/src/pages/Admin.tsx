import { useState, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, Truck, UserPlus, Settings2, Trash2, BarChart2,
  TrendingUp, Clock, CheckCircle, XCircle, DollarSign, Users, ClipboardList,
  Pencil, MessageCircle, MessageCircleOff, Eye, EyeOff, Info, Zap, Calculator,
  Layers, Map, Brain, Navigation, Car, Save, Plus, MapPin, Bell, Shield,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import VehicleTypeTab from "./admin/VehicleTypeTab";
import ReportCenter from "./admin/ReportCenter";
import AdminHome from "./admin/AdminHome";
import SmartDispatchTab from "./admin/SmartDispatchTab";
import HeatMapTab from "./admin/HeatMapTab";
import AIAnalyticsTab from "./admin/AIAnalyticsTab";
import FleetMapTab from "./admin/FleetMapTab";
import CarpoolTab from "./admin/CarpoolTab";
import FleetManagementTab from "./admin/FleetManagementTab";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData, useCreateDriverMutation, useUpdateDriverMutation, useDeleteDriverMutation } from "@/hooks/use-drivers";
import { useCustomersData, useCreateCustomerMutation, useUpdateCustomerMutation, useDeleteCustomerMutation } from "@/hooks/use-customers";
import { OrderStatusBadge, DriverStatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import HistoryInput from "@/components/HistoryInput";
import { useToast } from "@/hooks/use-toast";
import type { OrderStatus, DriverStatus, Driver, Customer, Order } from "@workspace/api-client-react";

const DRIVER_TYPE_LABELS: Record<string, string> = {
  self: "自有司機",
  affiliated: "靠行司機",
  external: "外車司機",
};

function calculateAutoQuote(order: Order): number {
  let total = 1500;
  const vehicleFees: Record<string, number> = {
    "小貨車": 0, "中型貨車": 800, "大貨車": 2000,
    "曳引車": 5000, "冷藏車": 3000, "不限": 0,
  };
  total += vehicleFees[order.requiredVehicleType ?? ""] ?? 0;
  const w = order.cargoWeight ?? 0;
  if (w > 300) total += 4000;
  else if (w > 100) total += 2000;
  else if (w > 50) total += 1000;
  else if (w > 10) total += 500;
  if (order.needTailgate === "yes") total += 500;
  if (order.needHydraulicPallet === "yes") total += 800;
  return total;
}

const driverFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  vehicleType: z.string().min(2, "車型必填"),
  licensePlate: z.string().min(3, "車牌必填"),
  driverType: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  lineUserId: z.string().optional(),
});
type DriverFormValues = z.infer<typeof driverFormSchema>;

const customerFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  taxId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerFormSchema>;

const extraStopEditSchema = z.object({
  address:     z.string().min(3, "請填寫地址"),
  contactName: z.string().optional(),
  phone:       z.string().optional(),
  company:     z.string().optional(),
  notes:       z.string().optional(),
  quantity:    z.string().optional(),
  weight:      z.coerce.number().optional(),
  signStatus:  z.enum(["pending", "signed"]).optional(),
});

const orderEditSchema = z.object({
  pickupDate: z.string().optional(),
  pickupTime: z.string().optional(),
  pickupAddress: z.string().min(5, "請填寫取貨地址"),
  pickupCompany: z.string().optional(),
  pickupContactPersonName: z.string().optional(),
  pickupContactPersonPhone: z.string().optional(),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
  deliveryAddress: z.string().min(5, "請填寫送貨地址"),
  deliveryCompany: z.string().optional(),
  deliveryContactPersonName: z.string().optional(),
  deliveryContactPersonPhone: z.string().optional(),
  requiredVehicleType: z.string().optional(),
  cargoWeight: z.coerce.number().optional(),
  cargoLengthM: z.coerce.number().optional(),
  cargoWidthM: z.coerce.number().optional(),
  cargoHeightM: z.coerce.number().optional(),
  specialRequirements: z.string().optional(),
  notes: z.string().optional(),
  extraDeliveryStops: z.array(extraStopEditSchema).optional(),
});
type OrderEditValues = z.infer<typeof orderEditSchema>;

function parseContactPerson(cp: string | null | undefined): { name: string; phone: string } {
  if (!cp) return { name: "", phone: "" };
  const parts = cp.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^0\d{7,9}$/.test(last.replace(/-/g, ""))) {
    return { name: parts.slice(0, -1).join(" "), phone: last };
  }
  return { name: cp, phone: "" };
}

function parseExtraStops(raw: unknown): Array<{ address: string; contactName?: string; phone?: string; company?: string; notes?: string; quantity?: string; weight?: number; signStatus?: "pending" | "signed" }> {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待派車",
  assigned: "已派車",
  in_transit: "運送中",
  delivered: "已完成",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-100 text-blue-700",
  in_transit: "bg-amber-100 text-amber-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</p>
            <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`${color} p-2.5 rounded-xl shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordInput({ field }: { field: React.InputHTMLAttributes<HTMLInputElement> & { value?: string } }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} {...field} value={field.value ?? ""} />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function DriverFormFields({ form }: { form: ReturnType<typeof useForm<DriverFormValues>> }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>姓名</FormLabel>
          <FormControl><Input placeholder="例如：陳大文" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="phone" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>電話</FormLabel>
          <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="vehicleType" render={({ field }) => (
        <FormItem>
          <FormLabel>車型</FormLabel>
          <FormControl><Input placeholder="3.5噸貨車" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="licensePlate" render={({ field }) => (
        <FormItem>
          <FormLabel>車牌</FormLabel>
          <FormControl><Input placeholder="ABC-1234" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="driverType" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>司機類型 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="選擇司機類型" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="self">自有司機</SelectItem>
              <SelectItem value="affiliated">靠行司機</SelectItem>
              <SelectItem value="external">外車司機</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="username" render={({ field }) => (
        <FormItem>
          <FormLabel>帳號 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl><Input placeholder="登入帳號" {...field} value={field.value ?? ""} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="password" render={({ field }) => (
        <FormItem>
          <FormLabel>密碼 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl><PasswordInput field={field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="lineUserId" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>LINE User ID <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl><Input placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" {...field} value={field.value ?? ""} /></FormControl>
          <FormDescription className="text-xs">綁定後，派車時自動透過 LINE 通知司機接單</FormDescription>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  );
}

function CustomerFormFields({ form }: { form: ReturnType<typeof useForm<CustomerFormValues>> }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>名稱 <span className="text-destructive">*</span></FormLabel>
          <FormControl><Input placeholder="例如：張小明 或 某某科技股份有限公司" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="phone" render={({ field }) => (
        <FormItem>
          <FormLabel>電話 <span className="text-destructive">*</span></FormLabel>
          <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="contactPerson" render={({ field }) => (
        <FormItem>
          <FormLabel>聯絡人 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl>
            <HistoryInput fieldKey="customer-contactPerson" placeholder="聯絡人姓名" {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="address" render={({ field }) => (
        <FormItem className="col-span-2">
          <FormLabel>地址 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl>
            <HistoryInput fieldKey="customer-address" placeholder="例如：台北市中山區XX路XX號" {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <FormField control={form.control} name="taxId" render={({ field }) => (
        <FormItem>
          <FormLabel>統一編號 <span className="text-muted-foreground font-normal">（選填）</span></FormLabel>
          <FormControl>
            <HistoryInput fieldKey="customer-taxId" placeholder="8 位數字" maxLength={8} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      <div className="col-span-2 border-t pt-3 mt-1">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">帳號資訊（選填）</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="username" render={({ field }) => (
            <FormItem>
              <FormLabel>帳號</FormLabel>
              <FormControl><Input placeholder="登入帳號" {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="password" render={({ field }) => (
            <FormItem>
              <FormLabel>密碼</FormLabel>
              <FormControl><PasswordInput field={field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const { data: orders, isLoading: ordersLoading } = useOrdersData();
  const { data: drivers, isLoading: driversLoading } = useDriversData();
  const { data: customers, isLoading: customersLoading } = useCustomersData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { mutateAsync: createDriver, isPending: creatingDriver } = useCreateDriverMutation();
  const { mutateAsync: updateDriver, isPending: updatingDriver } = useUpdateDriverMutation();
  const { mutateAsync: deleteDriver } = useDeleteDriverMutation();
  const { mutateAsync: createCustomer, isPending: creatingCustomer } = useCreateCustomerMutation();
  const { mutateAsync: updateCustomer, isPending: updatingCustomer } = useUpdateCustomerMutation();
  const { mutateAsync: deleteCustomer } = useDeleteCustomerMutation();

  const [activeTab, setActiveTab] = useState("home");
  const handleTabChange = useCallback((tab: string) => setActiveTab(tab), []);

  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [quoteOrder, setQuoteOrder] = useState<Order | null>(null);
  const [quoteAmount, setQuoteAmount] = useState<number>(0);

  const driverDefaults = { name: "", phone: "", vehicleType: "", licensePlate: "", driverType: "", username: "", password: "", lineUserId: "" };
  const createDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });
  const editDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });

  const customerDefaults = { name: "", phone: "", address: "", contactPerson: "", taxId: "", username: "", password: "" };
  const createCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });
  const editCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });

  const editOrderForm = useForm<OrderEditValues>({ resolver: zodResolver(orderEditSchema), defaultValues: {
    pickupDate: "", pickupTime: "", pickupAddress: "",
    pickupCompany: "", pickupContactPersonName: "", pickupContactPersonPhone: "",
    deliveryDate: "", deliveryTime: "", deliveryAddress: "",
    deliveryCompany: "", deliveryContactPersonName: "", deliveryContactPersonPhone: "",
    requiredVehicleType: "", specialRequirements: "", notes: "",
    extraDeliveryStops: [],
  }});
  const editStopsField = useFieldArray({ control: editOrderForm.control, name: "extraDeliveryStops" });

  const availableDrivers = drivers?.filter((d) => d.status === "available") || [];

  const onCreateDriverSubmit = async (data: DriverFormValues) => {
    try {
      await createDriver({
        data: {
          name: data.name,
          phone: data.phone,
          vehicleType: data.vehicleType,
          licensePlate: data.licensePlate,
          lineUserId: data.lineUserId || null,
          driverType: data.driverType || null,
          username: data.username || null,
          password: data.password || null,
        },
      });
      toast({ title: "成功", description: "已新增司機" });
      setDriverDialogOpen(false);
      createDriverForm.reset();
    } catch {
      toast({ title: "失敗", description: "無法新增司機", variant: "destructive" });
    }
  };

  const openEditDriverDialog = (driver: Driver) => {
    setEditingDriver(driver);
    editDriverForm.reset({
      name: driver.name,
      phone: driver.phone,
      vehicleType: driver.vehicleType,
      licensePlate: driver.licensePlate,
      driverType: driver.driverType ?? "",
      username: driver.username ?? "",
      password: driver.password ?? "",
      lineUserId: driver.lineUserId ?? "",
    });
  };

  const onEditDriverSubmit = async (data: DriverFormValues) => {
    if (!editingDriver) return;
    try {
      await updateDriver({
        id: editingDriver.id,
        data: {
          name: data.name,
          phone: data.phone,
          vehicleType: data.vehicleType,
          licensePlate: data.licensePlate,
          lineUserId: data.lineUserId || null,
          driverType: data.driverType || null,
          username: data.username || null,
          password: data.password || null,
        },
      });
      toast({ title: "成功", description: "司機資料已更新" });
      setEditingDriver(null);
    } catch {
      toast({ title: "失敗", description: "無法更新司機資料", variant: "destructive" });
    }
  };

  const onCreateCustomerSubmit = async (data: CustomerFormValues) => {
    try {
      await createCustomer({
        data: {
          name: data.name,
          phone: data.phone,
          address: data.address || null,
          contactPerson: data.contactPerson || null,
          taxId: data.taxId || null,
          username: data.username || null,
          password: data.password || null,
        } as any,
      });
      toast({ title: "成功", description: "已新增客戶" });
      setCustomerDialogOpen(false);
      createCustomerForm.reset();
    } catch {
      toast({ title: "失敗", description: "無法新增客戶", variant: "destructive" });
    }
  };

  const openEditCustomerDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    editCustomerForm.reset({
      name: customer.name,
      phone: customer.phone,
      address: (customer as any).address ?? "",
      contactPerson: (customer as any).contactPerson ?? "",
      taxId: (customer as any).taxId ?? "",
      username: customer.username ?? "",
      password: customer.password ?? "",
    });
  };

  const onEditCustomerSubmit = async (data: CustomerFormValues) => {
    if (!editingCustomer) return;
    try {
      await updateCustomer({
        id: editingCustomer.id,
        data: {
          name: data.name,
          phone: data.phone,
          address: data.address || null,
          contactPerson: data.contactPerson || null,
          taxId: data.taxId || null,
          username: data.username || null,
          password: data.password || null,
        } as any,
      });
      toast({ title: "成功", description: "客戶資料已更新" });
      setEditingCustomer(null);
    } catch {
      toast({ title: "失敗", description: "無法更新客戶資料", variant: "destructive" });
    }
  };

  const handleOrderAssign = async (orderId: number, driverIdStr: string) => {
    const driverId = driverIdStr === "none" ? null : parseInt(driverIdStr, 10);
    try {
      await updateOrder({ id: orderId, data: { driverId, status: driverId ? "assigned" : "pending" } });
      toast({ title: "派車成功", description: `訂單 #${orderId} 已指派` });
    } catch {
      toast({ title: "失敗", description: "無法指派司機", variant: "destructive" });
    }
  };

  const handleOrderStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await updateOrder({ id: orderId, data: { status } });
      toast({ title: "狀態更新", description: `訂單 #${orderId} 已更新` });
    } catch {
      toast({ title: "失敗", description: "無法更新狀態", variant: "destructive" });
    }
  };

  const handleSmartDispatch = async (orderId: number) => {
    const available = drivers?.filter(d => d.status === "available");
    if (!available || available.length === 0) {
      toast({ title: "無可用司機", description: "目前所有司機皆忙碌或離線", variant: "destructive" });
      return;
    }
    const best = available[0];
    try {
      await updateOrder({ id: orderId, data: { driverId: best.id, status: "assigned" } });
      toast({ title: `⚡ 已派車給 ${best.name}`, description: `${best.vehicleType} · ${best.licensePlate}` });
    } catch {
      toast({ title: "派車失敗", variant: "destructive" });
    }
  };

  const openQuoteDialog = (order: Order) => {
    setQuoteOrder(order);
    setQuoteAmount(calculateAutoQuote(order));
  };

  const applyQuote = async () => {
    if (!quoteOrder) return;
    try {
      await updateOrder({ id: quoteOrder.id, data: { totalFee: quoteAmount, feeStatus: "unpaid" } });
      toast({ title: "✅ 運費已套用", description: `NT$${quoteAmount.toLocaleString()}` });
      setQuoteOrder(null);
    } catch {
      toast({ title: "套用失敗", variant: "destructive" });
    }
  };

  const handleDriverStatus = async (driverId: number, status: DriverStatus) => {
    try {
      await updateDriver({ id: driverId, data: { status } });
      toast({ title: "狀態更新" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const handleDeleteDriver = async (driverId: number) => {
    if (!confirm("確定要刪除此司機資料嗎？")) return;
    try {
      await deleteDriver({ id: driverId });
      toast({ title: "刪除成功" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const handleDeleteCustomer = async (customerId: number) => {
    if (!confirm("確定要刪除此客戶資料嗎？")) return;
    try {
      await deleteCustomer({ id: customerId });
      toast({ title: "刪除成功" });
    } catch {
      toast({ title: "失敗", variant: "destructive" });
    }
  };

  const openEditOrderDialog = (order: Order) => {
    setEditingOrder(order);
    const pickup = parseContactPerson(order.pickupContactPerson);
    const delivery = parseContactPerson(order.deliveryContactPerson);
    const stops = parseExtraStops((order as any).extraDeliveryAddresses);
    editOrderForm.reset({
      pickupDate: order.pickupDate ?? "",
      pickupTime: order.pickupTime ?? "",
      pickupAddress: order.pickupAddress,
      pickupCompany: order.pickupContactName ?? "",
      pickupContactPersonName: pickup.name,
      pickupContactPersonPhone: pickup.phone,
      deliveryDate: order.deliveryDate ?? "",
      deliveryTime: order.deliveryTime ?? "",
      deliveryAddress: order.deliveryAddress,
      deliveryCompany: order.deliveryContactName ?? "",
      deliveryContactPersonName: delivery.name,
      deliveryContactPersonPhone: delivery.phone,
      requiredVehicleType: order.requiredVehicleType ?? "",
      cargoWeight: order.cargoWeight ?? undefined,
      cargoLengthM: order.cargoLengthM ?? undefined,
      cargoWidthM: order.cargoWidthM ?? undefined,
      cargoHeightM: order.cargoHeightM ?? undefined,
      specialRequirements: order.specialRequirements ?? "",
      notes: order.notes ?? "",
      extraDeliveryStops: stops,
    });
  };

  const onEditOrderSubmit = async (data: OrderEditValues) => {
    if (!editingOrder) return;
    const pickupCP = [data.pickupContactPersonName, data.pickupContactPersonPhone].filter(Boolean).join(" ");
    const deliveryCP = [data.deliveryContactPersonName, data.deliveryContactPersonPhone].filter(Boolean).join(" ");
    const extraDeliveryJson = data.extraDeliveryStops?.length
      ? JSON.stringify(data.extraDeliveryStops)
      : null;
    try {
      await updateOrder({
        id: editingOrder.id,
        data: {
          pickupDate: data.pickupDate || null,
          pickupTime: data.pickupTime || null,
          pickupAddress: data.pickupAddress,
          pickupContactName: data.pickupCompany || null,
          pickupContactPerson: pickupCP || null,
          deliveryDate: data.deliveryDate || null,
          deliveryTime: data.deliveryTime || null,
          deliveryAddress: data.deliveryAddress,
          deliveryContactName: data.deliveryCompany || null,
          deliveryContactPerson: deliveryCP || null,
          requiredVehicleType: data.requiredVehicleType || null,
          cargoWeight: data.cargoWeight || null,
          cargoLengthM: data.cargoLengthM || null,
          cargoWidthM: data.cargoWidthM || null,
          cargoHeightM: data.cargoHeightM || null,
          specialRequirements: data.specialRequirements || null,
          notes: data.notes || null,
          extraDeliveryAddresses: extraDeliveryJson,
        } as any,
      });
      toast({ title: "✅ 訂單已更新", description: `訂單 #${editingOrder.id} 資料已修改` });
      setEditingOrder(null);
    } catch {
      toast({ title: "更新失敗", description: "請稍後再試", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary">富詠運輸</span>
        </div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
          <Settings2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          後台管理中心
        </h1>
        <p className="text-muted-foreground mt-1 text-xs sm:text-sm hidden sm:block">訂單調派、司機管理、客戶管理、營運報表</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-5 w-full">
          <TabsTrigger value="home" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <span className="text-base leading-none sm:hidden">🏠</span>
            <span className="hidden sm:inline">🏠</span>
            <span className="text-[10px] sm:text-xs leading-tight">首頁</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <ClipboardList className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">訂單</span>
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Truck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">司機</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Users className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">客戶</span>
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <BarChart2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">報表</span>
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Truck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">車型庫</span>
          </TabsTrigger>
          <TabsTrigger value="smart" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Layers className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">智慧調度</span>
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Map className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">熱區圖</span>
          </TabsTrigger>
          <TabsTrigger value="fleetmap" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Navigation className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">車隊圖</span>
          </TabsTrigger>
          <TabsTrigger value="carpool" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Car className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">拼車</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Brain className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">AI 分析</span>
          </TabsTrigger>
          <TabsTrigger value="fleet" className="gap-1 text-xs flex-1 min-w-[44px] flex-col sm:flex-row sm:min-w-[70px] py-2 sm:py-1.5">
            <Bell className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="text-[10px] sm:text-xs leading-tight">車隊</span>
          </TabsTrigger>
        </TabsList>

        {/* ===== 首頁 TAB ===== */}
        <TabsContent value="home" className="outline-none">
          <AdminHome onTabChange={handleTabChange} />
        </TabsContent>

        {/* ===== 訂單 TAB ===== */}
        <TabsContent value="orders" className="outline-none space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">共 {orders?.length ?? 0} 筆訂單</p>
          </div>
          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[340px]">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-3 py-3 font-semibold">單號</th>
                    <th className="px-3 py-3 font-semibold hidden sm:table-cell">客戶 / 電話</th>
                    <th className="px-3 py-3 font-semibold hidden md:table-cell">貨物 / 金額</th>
                    <th className="px-3 py-3 font-semibold">狀態</th>
                    <th className="px-3 py-3 font-semibold">指派司機</th>
                    <th className="px-3 py-3 font-semibold text-right hidden sm:table-cell">更改狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {ordersLoading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">載入中...</td></tr>
                  ) : orders?.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">暫無訂單</td></tr>
                  ) : orders?.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3">
                        <div className="font-mono font-semibold text-foreground">#{order.id}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.createdAt), "MM/dd HH:mm")}</div>
                        {/* Mobile: show customer name inline */}
                        <div className="sm:hidden text-xs font-medium text-foreground mt-0.5">{order.customerName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => setSelectedOrder(order as Order)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                            <Info className="w-3 h-3" /> 詳情
                          </button>
                          {(order.status === "pending" || order.status === "assigned") && (
                            <button onClick={() => openEditOrderDialog(order as Order)} className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                              <Pencil className="w-3 h-3" /> 編輯
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <div className="font-medium text-foreground">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{order.customerPhone}</div>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        <div className="text-foreground text-xs truncate max-w-[120px]">{order.cargoDescription}</div>
                        {order.totalFee != null ? (
                          <div className="text-xs font-semibold text-primary mt-0.5">NT${order.totalFee.toLocaleString()}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-0.5">未設定運費</div>
                        )}
                        <button
                          onClick={() => openQuoteDialog(order as Order)}
                          className="mt-1 text-xs text-orange-600 hover:underline flex items-center gap-0.5 font-medium"
                        >
                          <Calculator className="w-3 h-3" /> 自動估價
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <OrderStatusBadge status={order.status} />
                        {/* Mobile: quote button */}
                        <button
                          onClick={() => openQuoteDialog(order as Order)}
                          className="mt-1.5 md:hidden text-xs text-orange-600 hover:underline flex items-center gap-0.5 font-medium"
                        >
                          <Calculator className="w-3 h-3" /> 估價
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {order.status === "pending" && !order.driverId && (
                          <button
                            onClick={() => handleSmartDispatch(order.id)}
                            className="mb-1.5 flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-1.5 rounded-lg shadow-sm"
                          >
                            <Zap className="w-3 h-3" /> <span className="hidden sm:inline">一鍵</span>派車
                          </button>
                        )}
                        <Select value={order.driverId?.toString() || "none"} onValueChange={(val) => handleOrderAssign(order.id, val)}>
                          <SelectTrigger className="h-8 text-xs w-[110px] sm:w-[130px]">
                            <SelectValue placeholder="選擇司機" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-muted-foreground italic">未指派</SelectItem>
                            {order.driver && !availableDrivers.find(d => d.id === order.driver?.id) && (
                              <SelectItem value={order.driver.id.toString()}>{order.driver.name} (目前)</SelectItem>
                            )}
                            {availableDrivers.map(d => (
                              <SelectItem key={d.id} value={d.id.toString()}>{d.name} ({d.vehicleType})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Mobile: status change inline */}
                        <div className="sm:hidden mt-1.5">
                          <Select value={order.status} onValueChange={(val) => handleOrderStatus(order.id, val as OrderStatus)}>
                            <SelectTrigger className="h-7 text-xs w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">待派車</SelectItem>
                              <SelectItem value="assigned">已派車</SelectItem>
                              <SelectItem value="in_transit">運送中</SelectItem>
                              <SelectItem value="delivered">已完成</SelectItem>
                              <SelectItem value="cancelled">已取消</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right hidden sm:table-cell">
                        <Select value={order.status} onValueChange={(val) => handleOrderStatus(order.id, val as OrderStatus)}>
                          <SelectTrigger className="h-8 text-xs w-[100px] ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">待派車</SelectItem>
                            <SelectItem value="assigned">已派車</SelectItem>
                            <SelectItem value="in_transit">運送中</SelectItem>
                            <SelectItem value="delivered">已完成</SelectItem>
                            <SelectItem value="cancelled">已取消</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Auto-quote Dialog */}
          <Dialog open={!!quoteOrder} onOpenChange={(o) => !o && setQuoteOrder(null)}>
            <DialogContent className="sm:max-w-[360px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-orange-500" /> 自動報價
                </DialogTitle>
                <DialogDescription>依貨物資訊自動計算建議運費</DialogDescription>
              </DialogHeader>
              {quoteOrder && (
                <div className="space-y-4 py-2">
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">基本費</span><span>NT$1,500</span>
                    </div>
                    {quoteOrder.requiredVehicleType && quoteOrder.requiredVehicleType !== "不限" && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">車型（{quoteOrder.requiredVehicleType}）</span>
                        <span>+NT${({ "小貨車": 0, "中型貨車": 800, "大貨車": 2000, "曳引車": 5000, "冷藏車": 3000 }[quoteOrder.requiredVehicleType] ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {(quoteOrder.cargoWeight ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">重量（{quoteOrder.cargoWeight}kg）</span>
                        <span>+NT${quoteOrder.cargoWeight! > 300 ? "4,000" : quoteOrder.cargoWeight! > 100 ? "2,000" : quoteOrder.cargoWeight! > 50 ? "1,000" : quoteOrder.cargoWeight! > 10 ? "500" : "0"}</span>
                      </div>
                    )}
                    {quoteOrder.needTailgate === "yes" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">尾門費</span><span>+NT$500</span></div>
                    )}
                    {quoteOrder.needHydraulicPallet === "yes" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">油壓板車費</span><span>+NT$800</span></div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-black text-orange-600 text-base">
                      <span>建議總費</span><span>NT${quoteAmount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold">調整金額（NT$）</label>
                    <Input
                      type="number"
                      value={quoteAmount}
                      onChange={e => setQuoteAmount(Number(e.target.value))}
                      className="mt-1.5 h-12 text-lg font-bold"
                    />
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setQuoteOrder(null)}>取消</Button>
                <Button className="bg-orange-500 hover:bg-orange-600" onClick={applyQuote}>
                  套用報價 NT${quoteAmount.toLocaleString()}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Order Edit Dialog */}
          <Dialog open={!!editingOrder} onOpenChange={(o) => !o && setEditingOrder(null)}>
            <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-orange-500" /> 編輯訂單 #{editingOrder?.id}
                </DialogTitle>
                <DialogDescription>修改預約訂單資訊，儲存後即時同步司機端與客戶端</DialogDescription>
              </DialogHeader>
              <Form {...editOrderForm}>
                <form onSubmit={editOrderForm.handleSubmit(onEditOrderSubmit)} className="space-y-4 py-2">

                  {/* 取貨資訊 */}
                  <div className="border border-orange-200 rounded-xl p-3 space-y-3 bg-orange-50/30">
                    <p className="text-xs font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> 取貨資訊
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="pickupDate" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">取貨日期</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="pickupTime" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">時段</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    <FormField control={editOrderForm.control} name="pickupAddress" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">取貨地址 <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input placeholder="○○縣○○市○○路○段○號" {...field} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="pickupCompany" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">公司名稱（選填）</FormLabel>
                        <FormControl><Input placeholder="○○股份有限公司" {...field} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="pickupContactPersonName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡人姓名</FormLabel>
                          <FormControl><Input placeholder="王先生" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="pickupContactPersonPhone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡電話</FormLabel>
                          <FormControl><Input type="tel" placeholder="0912-345-678" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  {/* 主要送貨地點 */}
                  <div className="border border-blue-200 rounded-xl p-3 space-y-3 bg-blue-50/30">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> 主要送達地點
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="deliveryDate" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">送達日期</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="deliveryTime" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">時段</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    <FormField control={editOrderForm.control} name="deliveryAddress" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">送達地址 <span className="text-destructive">*</span></FormLabel>
                        <FormControl><Input placeholder="○○縣○○市○○路○段○號" {...field} /></FormControl>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="deliveryCompany" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">公司名稱（選填）</FormLabel>
                        <FormControl><Input placeholder="○○股份有限公司" {...field} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={editOrderForm.control} name="deliveryContactPersonName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡人姓名</FormLabel>
                          <FormControl><Input placeholder="李小姐" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={editOrderForm.control} name="deliveryContactPersonPhone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">聯絡電話</FormLabel>
                          <FormControl><Input type="tel" placeholder="0988-765-432" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                  </div>

                  {/* 多站下貨點 (一取多卸) */}
                  <div className="border border-violet-200 rounded-xl p-3 space-y-3 bg-violet-50/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> 額外下貨站點（一取多卸）
                        {editStopsField.fields.length > 0 && (
                          <span className="font-normal text-violet-500">共 {editStopsField.fields.length} 站</span>
                        )}
                      </p>
                      {editStopsField.fields.length < 5 && (
                        <button type="button"
                          onClick={() => editStopsField.append({ address: "", contactName: "", phone: "", company: "", notes: "", quantity: "", weight: undefined, signStatus: "pending" })}
                          className="text-xs text-violet-700 border border-violet-300 rounded-lg px-2 py-1 hover:bg-violet-100 flex items-center gap-1 font-medium">
                          <Plus className="w-3 h-3" /> 新增站點
                        </button>
                      )}
                    </div>
                    {editStopsField.fields.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">尚未設定額外下貨站點，點右上角「新增站點」即可加入</p>
                    )}
                    {editStopsField.fields.map((sf, idx) => (
                      <div key={sf.id} className="border border-violet-100 rounded-xl p-3 space-y-2.5 bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-violet-700 flex items-center gap-1.5">
                            <span className="w-5 h-5 bg-violet-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                            站點 {idx + 1}
                          </span>
                          <button type="button" onClick={() => editStopsField.remove(idx)}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.address` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">地址 <span className="text-destructive">*</span></FormLabel>
                            <FormControl><Input placeholder="完整地址" {...field} /></FormControl>
                            <FormMessage /></FormItem>
                        )} />
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.company` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">公司（選填）</FormLabel>
                            <FormControl><Input placeholder="公司名稱" {...field} /></FormControl></FormItem>
                        )} />
                        <div className="grid grid-cols-2 gap-2">
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.contactName` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">聯絡人</FormLabel>
                              <FormControl><Input placeholder="姓名" {...field} /></FormControl></FormItem>
                          )} />
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.phone` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">電話</FormLabel>
                              <FormControl><Input type="tel" placeholder="09xx-xxx-xxx" {...field} /></FormControl></FormItem>
                          )} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.quantity` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">件數</FormLabel>
                              <FormControl><Input placeholder="如：3件" {...field} /></FormControl></FormItem>
                          )} />
                          <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.weight` as any} render={({ field }) => (
                            <FormItem><FormLabel className="text-xs">重量 (kg)</FormLabel>
                              <FormControl><Input type="number" min={0} step={0.1} placeholder="0.0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl></FormItem>
                          )} />
                        </div>
                        <FormField control={editOrderForm.control} name={`extraDeliveryStops.${idx}.notes` as any} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs">備註（樓層、搬運需求等）</FormLabel>
                            <FormControl><Textarea className="resize-none text-xs" rows={1} placeholder="例：3樓無電梯" {...field} /></FormControl></FormItem>
                        )} />
                      </div>
                    ))}
                  </div>

                  {/* 車輛 + 貨物 */}
                  <div className="border rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" /> 車輛與貨物
                    </p>
                    <FormField control={editOrderForm.control} name="requiredVehicleType" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">車型需求</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-9"><SelectValue placeholder="選擇車型" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {["廂型1.5T","廂型3.5T","廂型5T","平斗5T","廂型8T","廂型11T","廂型17T","不限"].map(v => (
                              <SelectItem key={v} value={v}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select></FormItem>
                    )} />
                    <div className="grid grid-cols-4 gap-2">
                      <FormField control={editOrderForm.control} name="cargoWeight" render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="text-xs">總重量 (kg)</FormLabel>
                          <FormControl><Input type="number" min={0} step={0.1} placeholder="0.0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl>
                        </FormItem>
                      )} />
                      {(["cargoLengthM","cargoWidthM","cargoHeightM"] as const).map((nm, i) => (
                        <FormField key={nm} control={editOrderForm.control} name={nm} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{["長","寬","高"][i]}(m)</FormLabel>
                            <FormControl><Input type="number" min={0} step={0.01} className="px-2" placeholder="0" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  </div>

                  {/* 備註 */}
                  <div className="grid grid-cols-1 gap-3">
                    <FormField control={editOrderForm.control} name="specialRequirements" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">特殊需求</FormLabel>
                        <FormControl><Textarea className="resize-none" rows={2} {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={editOrderForm.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">備註</FormLabel>
                        <FormControl><Textarea className="resize-none" rows={2} {...field} /></FormControl></FormItem>
                    )} />
                  </div>

                  <DialogFooter className="gap-2 pt-2">
                    <Button variant="outline" type="button" onClick={() => setEditingOrder(null)}>取消</Button>
                    <Button type="submit" className="gap-2 bg-orange-500 hover:bg-orange-600">
                      <Save className="w-4 h-4" /> 儲存所有變更
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Order Detail Dialog */}
          <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
            <DialogContent className="sm:max-w-[540px] max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" /> 訂單詳情 #{selectedOrder?.id}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  {selectedOrder && <OrderStatusBadge status={selectedOrder.status} />}
                  {selectedOrder && ` · 建立於 ${format(new Date(selectedOrder.createdAt), "yyyy/MM/dd HH:mm")}`}
                </DialogDescription>
              </DialogHeader>
              {selectedOrder && (() => {
                const extraStops = parseExtraStops((selectedOrder as any).extraDeliveryAddresses);
                const totalStops = 1 + extraStops.length;
                const signedCount = extraStops.filter((s: any) => s.signStatus === "signed").length;
                return (
                  <div className="space-y-4 text-sm py-2">

                    {/* 委託方 */}
                    <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">委託方</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">姓名</span><span className="font-semibold">{selectedOrder.customerName}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">電話</span><a href={`tel:${selectedOrder.customerPhone}`} className="font-mono text-blue-600 font-bold">{selectedOrder.customerPhone}</a></div>
                    </div>

                    {/* 取貨 */}
                    <div className="border border-orange-200 rounded-xl p-3 space-y-1.5 bg-orange-50/40">
                      <p className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" /> 取貨地點
                      </p>
                      {(selectedOrder.pickupDate || selectedOrder.pickupTime) && (
                        <div className="flex justify-between"><span className="text-muted-foreground">日期/時段</span><span className="font-medium">{selectedOrder.pickupDate} {selectedOrder.pickupTime}</span></div>
                      )}
                      {selectedOrder.pickupContactName && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span className="font-medium">{selectedOrder.pickupContactName}</span></div>}
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className="font-semibold text-right">{selectedOrder.pickupAddress}</span></div>
                      {selectedOrder.pickupContactPerson && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.pickupContactPerson}</span></div>}
                    </div>

                    {/* 路線圖：主送達 + 多站 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> 送達路線
                        </p>
                        {totalStops > 1 && (
                          <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 font-medium">
                            共 {totalStops} 站 · 已簽收 {signedCount + (selectedOrder.status === "delivered" ? 1 : 0)}/{totalStops}
                          </span>
                        )}
                      </div>

                      {/* Main stop */}
                      <div className="border border-blue-200 rounded-xl p-3 space-y-1.5 bg-blue-50/40">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">主</span>
                          <span className="text-xs font-bold text-blue-700">主要送達地點</span>
                          {selectedOrder.status === "delivered" && <span className="ml-auto text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已完成</span>}
                        </div>
                        {(selectedOrder.deliveryDate || selectedOrder.deliveryTime) && (
                          <div className="flex justify-between"><span className="text-muted-foreground">日期/時段</span><span className="font-medium">{selectedOrder.deliveryDate} {selectedOrder.deliveryTime}</span></div>
                        )}
                        {selectedOrder.deliveryContactName && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span className="font-medium">{selectedOrder.deliveryContactName}</span></div>}
                        <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className="font-semibold text-right">{selectedOrder.deliveryAddress}</span></div>
                        {selectedOrder.deliveryContactPerson && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.deliveryContactPerson}</span></div>}
                      </div>

                      {/* Extra stops */}
                      {extraStops.map((stop: any, idx: number) => {
                        const signed = stop.signStatus === "signed";
                        return (
                          <div key={idx} className={`mt-2 border rounded-xl p-3 space-y-1.5 ${signed ? "bg-emerald-50/50 border-emerald-200" : "border-violet-200 bg-violet-50/30"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 text-white ${signed ? "bg-emerald-500" : "bg-violet-600"}`}>{idx + 1}</span>
                              <span className="text-xs font-bold text-violet-700">站點 {idx + 1}</span>
                              {signed && <span className="ml-auto text-xs text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 已簽收</span>}
                            </div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground shrink-0">地址</span><span className={`font-semibold text-right ${signed ? "line-through opacity-60" : ""}`}>{stop.address}</span></div>
                            {stop.company && <div className="flex justify-between"><span className="text-muted-foreground">公司</span><span>{stop.company}</span></div>}
                            {stop.contactName && <div className="flex justify-between"><span className="text-muted-foreground">聯絡人</span><span>{stop.contactName}{stop.phone ? ` · ${stop.phone}` : ""}</span></div>}
                            {(stop.quantity || stop.weight) && (
                              <div className="flex gap-2 mt-1">
                                {stop.quantity && <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium border border-blue-100">{stop.quantity}</span>}
                                {stop.weight && <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-medium border border-orange-100">{stop.weight} kg</span>}
                              </div>
                            )}
                            {stop.notes && <p className="text-xs text-muted-foreground">📝 {stop.notes}</p>}
                          </div>
                        );
                      })}
                    </div>

                    {/* 貨物 + 車輛 */}
                    <div className="border rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">貨物 / 車輛</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">貨物描述</span><span className="font-medium">{selectedOrder.cargoDescription}</span></div>
                      {selectedOrder.cargoQuantity && <div className="flex justify-between"><span className="text-muted-foreground">總件數</span><span>{selectedOrder.cargoQuantity}</span></div>}
                      {selectedOrder.cargoWeight != null && <div className="flex justify-between"><span className="text-muted-foreground">總重量</span><span>{selectedOrder.cargoWeight} kg</span></div>}
                      {(selectedOrder.cargoLengthM || selectedOrder.cargoWidthM || selectedOrder.cargoHeightM) && (
                        <div className="flex justify-between"><span className="text-muted-foreground">材積</span>
                          <span>{selectedOrder.cargoLengthM?.toFixed(2)}×{selectedOrder.cargoWidthM?.toFixed(2)}×{selectedOrder.cargoHeightM?.toFixed(2)} m
                            {selectedOrder.cargoLengthM && selectedOrder.cargoWidthM && selectedOrder.cargoHeightM
                              ? ` (${(selectedOrder.cargoLengthM * selectedOrder.cargoWidthM * selectedOrder.cargoHeightM).toFixed(2)} m³)` : ""}</span>
                        </div>
                      )}
                      {selectedOrder.requiredVehicleType && <div className="flex justify-between"><span className="text-muted-foreground">車型需求</span><span className="font-medium">{selectedOrder.requiredVehicleType}</span></div>}
                      {selectedOrder.needTailgate === "yes" && <div className="flex justify-between"><span className="text-muted-foreground">需尾門</span><span className="text-amber-600">✔ 需要</span></div>}
                      {selectedOrder.needHydraulicPallet === "yes" && <div className="flex justify-between"><span className="text-muted-foreground">需油壓板車</span><span className="text-amber-600">✔ 需要</span></div>}
                    </div>

                    {(selectedOrder.specialRequirements || selectedOrder.notes) && (
                      <div className="border rounded-xl p-3 space-y-2">
                        {selectedOrder.specialRequirements && (
                          <div><p className="text-xs font-bold text-muted-foreground mb-1">特殊需求</p>
                            <p className="text-xs bg-blue-50 border border-blue-100 rounded p-2 text-blue-900">{selectedOrder.specialRequirements}</p></div>
                        )}
                        {selectedOrder.notes && (
                          <div><p className="text-xs font-bold text-muted-foreground mb-1">備註</p>
                            <p className="text-xs bg-amber-50 border border-amber-100 rounded p-2 text-amber-900">{selectedOrder.notes}</p></div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <DialogFooter className="gap-2">
                {selectedOrder && (selectedOrder.status === "pending" || selectedOrder.status === "assigned") && (
                  <Button variant="outline" className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => { openEditOrderDialog(selectedOrder!); setSelectedOrder(null); }}>
                    <Pencil className="w-3.5 h-3.5" /> 編輯
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedOrder(null)}>關閉</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ===== 司機 TAB ===== */}
        <TabsContent value="drivers" className="outline-none space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">共 {drivers?.length ?? 0} 位司機</p>
            <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" /> 新增司機
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>新增司機資料</DialogTitle>
                  <DialogDescription>填寫司機基本資料、帳號密碼與車輛資訊</DialogDescription>
                </DialogHeader>
                <Form {...createDriverForm}>
                  <form onSubmit={createDriverForm.handleSubmit(onCreateDriverSubmit)} className="space-y-4 py-2">
                    <DriverFormFields form={createDriverForm} />
                    <DialogFooter className="pt-2">
                      <Button type="submit" disabled={creatingDriver} className="w-full">
                        {creatingDriver ? "儲存中..." : "建立司機檔案"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Dialog open={!!editingDriver} onOpenChange={(open) => { if (!open) setEditingDriver(null); }}>
            <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>編輯司機資料</DialogTitle>
                <DialogDescription>修改司機基本資料、帳號密碼與車輛資訊</DialogDescription>
              </DialogHeader>
              <Form {...editDriverForm}>
                <form onSubmit={editDriverForm.handleSubmit(onEditDriverSubmit)} className="space-y-4 py-2">
                  <DriverFormFields form={editDriverForm} />
                  <DialogFooter className="pt-2">
                    <Button type="submit" disabled={updatingDriver} className="w-full">
                      {updatingDriver ? "儲存中..." : "儲存變更"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[300px]">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">姓名 / 電話</th>
                    <th className="px-4 py-3 font-semibold hidden sm:table-cell">類型</th>
                    <th className="px-4 py-3 font-semibold">車型 / 車牌</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">帳號</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">LINE</th>
                    <th className="px-4 py-3 font-semibold">狀態</th>
                    <th className="px-4 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {driversLoading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">載入中...</td></tr>
                  ) : drivers?.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">尚無司機資料，請新增</td></tr>
                  ) : drivers?.map((driver) => (
                    <tr key={driver.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{driver.name}</div>
                        <div className="text-muted-foreground font-mono text-xs mt-0.5">{driver.phone}</div>
                        {/* Mobile: show vehicle info inline */}
                        <div className="sm:hidden text-xs text-muted-foreground mt-0.5">{driver.vehicleType} · <span className="font-mono uppercase">{driver.licensePlate}</span></div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {driver.driverType ? (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm hidden sm:block">{driver.vehicleType}</div>
                        <span className="font-mono text-xs bg-muted border px-1.5 py-0.5 rounded uppercase hidden sm:inline">{driver.licensePlate}</span>
                        <span className="sm:hidden text-xs text-muted-foreground">—</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {driver.username ? (
                          <span className="text-xs font-mono text-foreground">{driver.username}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {driver.lineUserId ? (
                          <span title={driver.lineUserId} className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <MessageCircle className="w-3.5 h-3.5" /> 已綁定
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircleOff className="w-3.5 h-3.5" /> 未綁定
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={driver.status} onValueChange={(val) => handleDriverStatus(driver.id, val as DriverStatus)}>
                          <SelectTrigger className="h-8 w-[100px] sm:w-[110px] border-0 shadow-none p-1 hover:bg-muted/50">
                            <DriverStatusBadge status={driver.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">可接單</SelectItem>
                            <SelectItem value="busy">忙碌中</SelectItem>
                            <SelectItem value="offline">下線</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDriverDialog(driver)}
                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDriver(driver.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== 客戶 TAB ===== */}
        <TabsContent value="customers" className="outline-none space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">共 {customers?.length ?? 0} 位客戶</p>
            <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" /> 新增客戶
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>新增客戶資料</DialogTitle>
                  <DialogDescription>填寫客戶基本資料與登入帳號密碼</DialogDescription>
                </DialogHeader>
                <Form {...createCustomerForm}>
                  <form onSubmit={createCustomerForm.handleSubmit(onCreateCustomerSubmit)} className="space-y-4 py-2">
                    <CustomerFormFields form={createCustomerForm} />
                    <DialogFooter className="pt-2">
                      <Button type="submit" disabled={creatingCustomer} className="w-full">
                        {creatingCustomer ? "儲存中..." : "建立客戶檔案"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Dialog open={!!editingCustomer} onOpenChange={(open) => { if (!open) setEditingCustomer(null); }}>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>編輯客戶資料</DialogTitle>
                <DialogDescription>修改客戶基本資料與登入帳號密碼</DialogDescription>
              </DialogHeader>
              <Form {...editCustomerForm}>
                <form onSubmit={editCustomerForm.handleSubmit(onEditCustomerSubmit)} className="space-y-4 py-2">
                  <CustomerFormFields form={editCustomerForm} />
                  <DialogFooter className="pt-2">
                    <Button type="submit" disabled={updatingCustomer} className="w-full">
                      {updatingCustomer ? "儲存中..." : "儲存變更"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">名稱 / 電話</th>
                    <th className="px-4 py-3 font-semibold">聯絡人</th>
                    <th className="px-4 py-3 font-semibold">地址</th>
                    <th className="px-4 py-3 font-semibold">統編</th>
                    <th className="px-4 py-3 font-semibold">帳號</th>
                    <th className="px-4 py-3 font-semibold">建立時間</th>
                    <th className="px-4 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {customersLoading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">載入中...</td></tr>
                  ) : customers?.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">尚無客戶資料，請新增</td></tr>
                  ) : customers?.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{customer.name}</div>
                        <div className="text-muted-foreground font-mono text-xs mt-0.5">{customer.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        {(customer as any).contactPerson ? (
                          <span className="text-sm">{(customer as any).contactPerson}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        {(customer as any).address ? (
                          <span className="text-xs truncate block" title={(customer as any).address}>{(customer as any).address}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(customer as any).taxId ? (
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{(customer as any).taxId}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {customer.username ? (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{customer.username}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">{format(new Date(customer.createdAt), "MM/dd HH:mm")}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditCustomerDialog(customer)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteCustomer(customer.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== 報表 TAB ===== */}
        <TabsContent value="report" className="outline-none">
          <ReportCenter />
        </TabsContent>

        {/* ===== 車型庫 TAB ===== */}
        <TabsContent value="vehicles" className="outline-none">
          <VehicleTypeTab />
        </TabsContent>

        {/* ===== 智慧調度 TAB ===== */}
        <TabsContent value="smart" className="outline-none">
          <SmartDispatchTab />
        </TabsContent>

        {/* ===== 熱區地圖 TAB ===== */}
        <TabsContent value="heatmap" className="outline-none">
          <HeatMapTab />
        </TabsContent>

        {/* ===== 車隊地圖 TAB ===== */}
        <TabsContent value="fleetmap" className="outline-none">
          <FleetMapTab />
        </TabsContent>

        {/* ===== 拼車調度 TAB ===== */}
        <TabsContent value="carpool" className="outline-none">
          <CarpoolTab />
        </TabsContent>

        {/* ===== AI 分析 TAB ===== */}
        <TabsContent value="ai" className="outline-none">
          <AIAnalyticsTab />
        </TabsContent>

        {/* ===== 車隊管理 TAB ===== */}
        <TabsContent value="fleet" className="outline-none">
          <FleetManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
