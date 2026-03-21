import { useState, useMemo } from "react";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, Truck, UserPlus, Settings2, Trash2, BarChart2,
  TrendingUp, Clock, CheckCircle, XCircle, DollarSign, Users, ClipboardList
} from "lucide-react";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData, useCreateDriverMutation, useUpdateDriverMutation, useDeleteDriverMutation } from "@/hooks/use-drivers";
import { OrderStatusBadge, DriverStatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { OrderStatus, DriverStatus } from "@workspace/api-client-react/src/generated/api.schemas";

const driverFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  vehicleType: z.string().min(2, "車型必填"),
  licensePlate: z.string().min(3, "車牌必填"),
});
type DriverFormValues = z.infer<typeof driverFormSchema>;

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

export default function Admin() {
  const { toast } = useToast();
  const { data: orders, isLoading: ordersLoading } = useOrdersData();
  const { data: drivers, isLoading: driversLoading } = useDriversData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { mutateAsync: createDriver, isPending: creatingDriver } = useCreateDriverMutation();
  const { mutateAsync: updateDriver } = useUpdateDriverMutation();
  const { mutateAsync: deleteDriver } = useDeleteDriverMutation();
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [reportRange, setReportRange] = useState<"today" | "week" | "month" | "all">("today");

  const driverForm = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: { name: "", phone: "", vehicleType: "", licensePlate: "" },
  });

  // --- Derived stats ---
  const stats = useMemo(() => {
    if (!orders) return null;
    const filterFn = (o: typeof orders[0]) => {
      const d = new Date(o.createdAt);
      if (reportRange === "today") return isToday(d);
      if (reportRange === "week") return isThisWeek(d, { weekStartsOn: 1 });
      if (reportRange === "month") return isThisMonth(d);
      return true;
    };
    const filtered = orders.filter(filterFn);
    const byStatus = {
      pending: filtered.filter(o => o.status === "pending").length,
      assigned: filtered.filter(o => o.status === "assigned").length,
      in_transit: filtered.filter(o => o.status === "in_transit").length,
      delivered: filtered.filter(o => o.status === "delivered").length,
      cancelled: filtered.filter(o => o.status === "cancelled").length,
    };
    const totalRevenue = filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const paidRevenue = filtered.filter(o => o.feeStatus === "paid").reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const unpaidRevenue = filtered.filter(o => o.feeStatus === "unpaid" && o.totalFee).reduce((s, o) => s + (o.totalFee ?? 0), 0);
    return { total: filtered.length, byStatus, totalRevenue, paidRevenue, unpaidRevenue, filtered };
  }, [orders, reportRange]);

  const availableDrivers = drivers?.filter((d) => d.status === "available") || [];

  const onDriverSubmit = async (data: DriverFormValues) => {
    try {
      await createDriver({ data });
      toast({ title: "成功", description: "已新增司機" });
      setDriverDialogOpen(false);
      driverForm.reset();
    } catch {
      toast({ title: "失敗", description: "無法新增司機", variant: "destructive" });
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

  const rangeLabels = { today: "今日", week: "本週", month: "本月", all: "全部" };

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
        <p className="text-muted-foreground mt-1 text-sm">訂單調派、司機管理、營運報表</p>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-sm mb-5">
          <TabsTrigger value="orders" className="gap-1.5 text-xs md:text-sm">
            <ClipboardList className="w-3.5 h-3.5" /> 訂單
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-1.5 text-xs md:text-sm">
            <Truck className="w-3.5 h-3.5" /> 司機
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5 text-xs md:text-sm">
            <BarChart2 className="w-3.5 h-3.5" /> 報表
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
                      </td>
                      <td className="px-3 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-3 py-3">
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
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>新增司機資料</DialogTitle>
                  <DialogDescription>填寫司機基本資料與車輛資訊</DialogDescription>
                </DialogHeader>
                <Form {...driverForm}>
                  <form onSubmit={driverForm.handleSubmit(onDriverSubmit)} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={driverForm.control} name="name" render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>姓名</FormLabel>
                          <FormControl><Input placeholder="例如：陳大文" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={driverForm.control} name="phone" render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>電話</FormLabel>
                          <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={driverForm.control} name="vehicleType" render={({ field }) => (
                        <FormItem>
                          <FormLabel>車型</FormLabel>
                          <FormControl><Input placeholder="3.5噸貨車" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={driverForm.control} name="licensePlate" render={({ field }) => (
                        <FormItem>
                          <FormLabel>車牌</FormLabel>
                          <FormControl><Input placeholder="ABC-1234" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
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

          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">姓名 / 電話</th>
                    <th className="px-4 py-3 font-semibold">車型</th>
                    <th className="px-4 py-3 font-semibold">車牌</th>
                    <th className="px-4 py-3 font-semibold">狀態</th>
                    <th className="px-4 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {driversLoading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">載入中...</td></tr>
                  ) : drivers?.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">尚無司機資料，請新增</td></tr>
                  ) : drivers?.map((driver) => (
                    <tr key={driver.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground">{driver.name}</div>
                        <div className="text-muted-foreground font-mono text-xs mt-0.5">{driver.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{driver.vehicleType}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-muted border px-2 py-0.5 rounded uppercase">{driver.licensePlate}</span>
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
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteDriver(driver.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ===== 報表 TAB ===== */}
        <TabsContent value="report" className="outline-none space-y-5">
          {/* Time range selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {(["today", "week", "month", "all"] as const).map((r) => (
              <Button
                key={r}
                variant={reportRange === r ? "default" : "outline"}
                size="sm"
                onClick={() => setReportRange(r)}
                className="text-xs"
              >
                {rangeLabels[r]}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-1">統計時段</span>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="訂單總數" value={stats?.total ?? 0} sub="筆" icon={ClipboardList} color="bg-blue-100 text-blue-600" />
            <StatCard title="已完成" value={stats?.byStatus.delivered ?? 0} sub="筆" icon={CheckCircle} color="bg-emerald-100 text-emerald-600" />
            <StatCard
              title="總運費"
              value={`NT$${(stats?.totalRevenue ?? 0).toLocaleString()}`}
              sub="含未收款"
              icon={DollarSign}
              color="bg-primary/10 text-primary"
            />
            <StatCard
              title="待收款"
              value={`NT$${(stats?.unpaidRevenue ?? 0).toLocaleString()}`}
              sub={`${(orders?.filter(o => o.feeStatus === "unpaid" && o.totalFee).length ?? 0)} 筆`}
              icon={Clock}
              color="bg-orange-100 text-orange-600"
            />
          </div>

          {/* Status breakdown */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                訂單狀態分佈
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {stats && Object.entries(stats.byStatus).map(([status, count]) => {
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                      <span className="font-medium text-foreground">{count} 筆 <span className="text-muted-foreground">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {stats?.total === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">此時段無訂單資料</p>
              )}
            </CardContent>
          </Card>

          {/* Driver stats */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                司機狀態總覽
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "可接單", key: "available", color: "text-emerald-600 bg-emerald-50" },
                  { label: "忙碌中", key: "busy", color: "text-amber-600 bg-amber-50" },
                  { label: "下線中", key: "offline", color: "text-slate-600 bg-slate-100" },
                ].map(({ label, key, color }) => (
                  <div key={key} className={`rounded-xl p-3 ${color}`}>
                    <div className="text-2xl font-bold">
                      {drivers?.filter(d => d.status === key).length ?? 0}
                    </div>
                    <div className="text-xs font-medium mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent orders in range */}
          {stats && stats.filtered.length > 0 && (
            <Card className="border shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {rangeLabels[reportRange]}訂單明細
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[500px]">
                  <thead className="text-xs text-muted-foreground bg-muted/50 border-b uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">單號</th>
                      <th className="px-4 py-2.5 font-semibold">客戶</th>
                      <th className="px-4 py-2.5 font-semibold">司機</th>
                      <th className="px-4 py-2.5 font-semibold">狀態</th>
                      <th className="px-4 py-2.5 font-semibold text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y bg-card">
                    {stats.filtered.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono font-medium">#{order.id}</td>
                        <td className="px-4 py-2.5">{order.customerName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {order.driver?.name ?? <span className="italic text-xs">未指派</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          {order.totalFee != null ? `NT$${order.totalFee.toLocaleString()}` : <span className="text-muted-foreground text-xs italic">未設定</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
