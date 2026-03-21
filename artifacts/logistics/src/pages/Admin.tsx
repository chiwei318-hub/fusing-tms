import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, Truck, UserPlus, Settings2, Trash2, BarChart2,
  TrendingUp, Clock, CheckCircle, XCircle, DollarSign, Users, ClipboardList,
  Pencil, MessageCircle, MessageCircleOff, Eye, EyeOff, Info, Zap, Calculator,
  Layers, Map, Brain,
} from "lucide-react";
import VehicleTypeTab from "./admin/VehicleTypeTab";
import ReportCenter from "./admin/ReportCenter";
import SmartDispatchTab from "./admin/SmartDispatchTab";
import HeatMapTab from "./admin/HeatMapTab";
import AIAnalyticsTab from "./admin/AIAnalyticsTab";
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
  username: z.string().optional(),
  password: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerFormSchema>;

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
          <FormLabel>姓名</FormLabel>
          <FormControl><Input placeholder="例如：張小明" {...field} /></FormControl>
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

  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [quoteOrder, setQuoteOrder] = useState<Order | null>(null);
  const [quoteAmount, setQuoteAmount] = useState<number>(0);

  const driverDefaults = { name: "", phone: "", vehicleType: "", licensePlate: "", driverType: "", username: "", password: "", lineUserId: "" };
  const createDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });
  const editDriverForm = useForm<DriverFormValues>({ resolver: zodResolver(driverFormSchema), defaultValues: driverDefaults });

  const customerDefaults = { name: "", phone: "", username: "", password: "" };
  const createCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });
  const editCustomerForm = useForm<CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: customerDefaults });

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
          username: data.username || null,
          password: data.password || null,
        },
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
          username: data.username || null,
          password: data.password || null,
        },
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

  return (
    <div className="space-y-5 pb-12">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary">富詠運輸</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
          <Settings2 className="w-6 h-6 text-primary" />
          後台管理中心
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">訂單調派、司機管理、客戶管理、營運報表</p>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-5 w-full">
          <TabsTrigger value="orders" className="gap-1 text-xs flex-1 min-w-[80px]">
            <ClipboardList className="w-3.5 h-3.5" /> 訂單
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Truck className="w-3.5 h-3.5" /> 司機
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Users className="w-3.5 h-3.5" /> 客戶
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1 text-xs flex-1 min-w-[80px]">
            <BarChart2 className="w-3.5 h-3.5" /> 報表
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Truck className="w-3.5 h-3.5" /> 車型庫
          </TabsTrigger>
          <TabsTrigger value="smart" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Layers className="w-3.5 h-3.5" /> 智慧調度
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Map className="w-3.5 h-3.5" /> 熱區地圖
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1 text-xs flex-1 min-w-[80px]">
            <Brain className="w-3.5 h-3.5" /> AI 分析
          </TabsTrigger>
        </TabsList>

        {/* ===== 訂單 TAB ===== */}
        <TabsContent value="orders" className="outline-none space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">共 {orders?.length ?? 0} 筆訂單</p>
          </div>
          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left min-w-[600px]">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-3 py-3 font-semibold">單號</th>
                    <th className="px-3 py-3 font-semibold">客戶 / 電話</th>
                    <th className="px-3 py-3 font-semibold">貨物 / 金額</th>
                    <th className="px-3 py-3 font-semibold">狀態</th>
                    <th className="px-3 py-3 font-semibold">指派司機</th>
                    <th className="px-3 py-3 font-semibold text-right">更改狀態</th>
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
                        <button onClick={() => setSelectedOrder(order as Order)} className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-1">
                          <Info className="w-3 h-3" /> 詳情
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{order.customerPhone}</div>
                      </td>
                      <td className="px-3 py-3">
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
                      </td>
                      <td className="px-3 py-3">
                        {order.status === "pending" && !order.driverId && (
                          <button
                            onClick={() => handleSmartDispatch(order.id)}
                            className="mb-1.5 flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-2.5 py-1.5 rounded-lg shadow-sm"
                          >
                            <Zap className="w-3 h-3" /> 一鍵派車
                          </button>
                        )}
                        <Select value={order.driverId?.toString() || "none"} onValueChange={(val) => handleOrderAssign(order.id, val)}>
                          <SelectTrigger className="h-8 text-xs w-[130px]">
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
                      </td>
                      <td className="px-3 py-3 text-right">
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

          {/* Order Detail Dialog */}
          <Dialog open={!!selectedOrder} onOpenChange={(o) => !o && setSelectedOrder(null)}>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>訂單詳情 #{selectedOrder?.id}</DialogTitle>
                <DialogDescription>完整訂單資訊</DialogDescription>
              </DialogHeader>
              {selectedOrder && (
                <div className="space-y-4 text-sm py-2">
                  <div className="space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">委託方</p>
                    <div className="grid grid-cols-2 gap-1">
                      <span className="text-muted-foreground">姓名</span><span className="font-medium">{selectedOrder.customerName}</span>
                      <span className="text-muted-foreground">電話</span><span className="font-mono">{selectedOrder.customerPhone}</span>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">收貨資訊</p>
                    <div className="grid grid-cols-2 gap-1">
                      {selectedOrder.pickupDate && <><span className="text-muted-foreground">收貨日期</span><span>{selectedOrder.pickupDate}</span></>}
                      {selectedOrder.pickupTime && <><span className="text-muted-foreground">收貨時間</span><span>{selectedOrder.pickupTime}</span></>}
                      {selectedOrder.requiredLicense && <><span className="text-muted-foreground">所需證照</span><span>{selectedOrder.requiredLicense}</span></>}
                      {selectedOrder.pickupContactName && <><span className="text-muted-foreground">客戶名稱</span><span className="font-medium">{selectedOrder.pickupContactName}</span></>}
                      <span className="text-muted-foreground">地址</span><span className="font-medium col-span-1">{selectedOrder.pickupAddress}</span>
                      {selectedOrder.pickupContactPerson && <><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.pickupContactPerson}</span></>}
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">到貨資訊</p>
                    <div className="grid grid-cols-2 gap-1">
                      {selectedOrder.deliveryDate && <><span className="text-muted-foreground">到貨日期</span><span>{selectedOrder.deliveryDate}</span></>}
                      {selectedOrder.deliveryTime && <><span className="text-muted-foreground">到貨時間</span><span>{selectedOrder.deliveryTime}</span></>}
                      {selectedOrder.deliveryContactName && <><span className="text-muted-foreground">客戶名稱</span><span className="font-medium">{selectedOrder.deliveryContactName}</span></>}
                      <span className="text-muted-foreground">地址</span><span className="font-medium">{selectedOrder.deliveryAddress}</span>
                      {selectedOrder.deliveryContactPerson && <><span className="text-muted-foreground">聯絡人/電話</span><span>{selectedOrder.deliveryContactPerson}</span></>}
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">貨物資訊</p>
                    <div className="grid grid-cols-2 gap-1">
                      <span className="text-muted-foreground">貨物描述</span><span className="font-medium">{selectedOrder.cargoDescription}</span>
                      {selectedOrder.cargoQuantity && <><span className="text-muted-foreground">數量</span><span>{selectedOrder.cargoQuantity}</span></>}
                      {selectedOrder.cargoWeight != null && <><span className="text-muted-foreground">重量</span><span>{selectedOrder.cargoWeight} kg</span></>}
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">車輛需求</p>
                    <div className="grid grid-cols-2 gap-1">
                      {selectedOrder.requiredVehicleType && <><span className="text-muted-foreground">車型</span><span>{selectedOrder.requiredVehicleType}</span></>}
                      {selectedOrder.needTailgate && <><span className="text-muted-foreground">需尾門</span><span>{selectedOrder.needTailgate === "yes" ? "需要" : "不需要"}</span></>}
                      {selectedOrder.needHydraulicPallet && <><span className="text-muted-foreground">需油壓板車</span><span>{selectedOrder.needHydraulicPallet === "yes" ? "需要" : "不需要"}</span></>}
                      {selectedOrder.specialRequirements && <><span className="text-muted-foreground">特殊要求</span><span>{selectedOrder.specialRequirements}</span></>}
                    </div>
                  </div>
                  {selectedOrder.notes && (
                    <div className="border-t pt-3">
                      <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-1">備註</p>
                      <p>{selectedOrder.notes}</p>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
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
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">姓名 / 電話</th>
                    <th className="px-4 py-3 font-semibold">類型</th>
                    <th className="px-4 py-3 font-semibold">車型 / 車牌</th>
                    <th className="px-4 py-3 font-semibold">帳號</th>
                    <th className="px-4 py-3 font-semibold">LINE</th>
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
                      </td>
                      <td className="px-4 py-3">
                        {driver.driverType ? (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            {DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{driver.vehicleType}</div>
                        <span className="font-mono text-xs bg-muted border px-1.5 py-0.5 rounded uppercase">{driver.licensePlate}</span>
                      </td>
                      <td className="px-4 py-3">
                        {driver.username ? (
                          <span className="text-xs font-mono text-foreground">{driver.username}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
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
                          <SelectTrigger className="h-8 w-[110px] border-0 shadow-none p-1 hover:bg-muted/50">
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
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteDriver(driver.id)}
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
                    <th className="px-4 py-3 font-semibold">姓名 / 電話</th>
                    <th className="px-4 py-3 font-semibold">帳號</th>
                    <th className="px-4 py-3 font-semibold">密碼</th>
                    <th className="px-4 py-3 font-semibold">建立時間</th>
                    <th className="px-4 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {customersLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">載入中...</td></tr>
                  ) : customers?.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">尚無客戶資料，請新增</td></tr>
                  ) : customers?.map((customer) => (
                    <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{customer.name}</div>
                        <div className="text-muted-foreground font-mono text-xs mt-0.5">{customer.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.username ? (
                          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{customer.username}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {customer.password ? (
                          <span className="text-xs font-mono text-muted-foreground">••••••••</span>
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

        {/* ===== AI 分析 TAB ===== */}
        <TabsContent value="ai" className="outline-none">
          <AIAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
