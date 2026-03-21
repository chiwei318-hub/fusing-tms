import { useState } from "react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, Truck, UserPlus, Settings2, Trash2 } from "lucide-react";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData, useCreateDriverMutation, useUpdateDriverMutation, useDeleteDriverMutation } from "@/hooks/use-drivers";
import { OrderStatusBadge, DriverStatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { OrderStatus, DriverStatus } from "@workspace/api-client-react/src/generated/api.schemas";

// --- Driver Form Schema ---
const driverFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  vehicleType: z.string().min(2, "車型必填"),
  licensePlate: z.string().min(3, "車牌必填"),
});
type DriverFormValues = z.infer<typeof driverFormSchema>;

export default function Admin() {
  const { toast } = useToast();
  
  // Data
  const { data: orders, isLoading: ordersLoading } = useOrdersData();
  const { data: drivers, isLoading: driversLoading } = useDriversData();
  
  // Mutations
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { mutateAsync: createDriver, isPending: creatingDriver } = useCreateDriverMutation();
  const { mutateAsync: updateDriver } = useUpdateDriverMutation();
  const { mutateAsync: deleteDriver } = useDeleteDriverMutation();

  // State
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);

  // Form
  const driverForm = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: { name: "", phone: "", vehicleType: "", licensePlate: "" },
  });

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
      toast({ title: "派車成功", description: `訂單 #${orderId} 狀態已更新` });
    } catch {
      toast({ title: "失敗", description: "無法指派司機", variant: "destructive" });
    }
  };

  const handleOrderStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await updateOrder({ id: orderId, data: { status } });
      toast({ title: "狀態更新", description: `訂單 #${orderId} 狀態已更新` });
    } catch {
      toast({ title: "失敗", description: "無法更新狀態", variant: "destructive" });
    }
  };

  const handleDriverStatus = async (driverId: number, status: DriverStatus) => {
    try {
      await updateDriver({ id: driverId, data: { status } });
      toast({ title: "狀態更新", description: `司機狀態已更新` });
    } catch {
      toast({ title: "失敗", description: "無法更新狀態", variant: "destructive" });
    }
  };

  const handleDeleteDriver = async (driverId: number) => {
    if (confirm("確定要刪除此司機資料嗎？")) {
      try {
        await deleteDriver({ id: driverId });
        toast({ title: "刪除成功", description: "司機資料已移除" });
      } catch {
        toast({ title: "失敗", description: "無法刪除司機", variant: "destructive" });
      }
    }
  };

  const availableDrivers = drivers?.filter(d => d.status === "available") || [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-primary" />
          後台管理中心
        </h1>
        <p className="text-slate-500 mt-2">集中管理派車作業與司機狀態。</p>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px] mb-6">
          <TabsTrigger value="orders" className="gap-2"><Package className="w-4 h-4" /> 派車管理</TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2"><Truck className="w-4 h-4" /> 司機管理</TabsTrigger>
        </TabsList>

        {/* --- ORDERS TAB --- */}
        <TabsContent value="orders" className="space-y-4 outline-none">
          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900/80 uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">單號/建立時間</th>
                    <th className="px-4 py-3 font-semibold">運送路線</th>
                    <th className="px-4 py-3 font-semibold">當前狀態</th>
                    <th className="px-4 py-3 font-semibold">指派司機</th>
                    <th className="px-4 py-3 font-semibold text-right">更改狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
                  {ordersLoading ? (
                     <tr><td colSpan={5} className="p-8 text-center text-slate-500">載入中...</td></tr>
                  ) : orders?.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium">#{order.id}</div>
                        <div className="text-xs text-slate-400 mt-1">{format(new Date(order.createdAt), "MM/dd HH:mm")}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="truncate text-slate-900" title={order.pickupAddress}>{order.pickupAddress}</div>
                        <div className="text-slate-400 text-xs">↓</div>
                        <div className="truncate text-slate-900" title={order.deliveryAddress}>{order.deliveryAddress}</div>
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Select 
                          value={order.driverId?.toString() || "none"} 
                          onValueChange={(val) => handleOrderAssign(order.id, val)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[140px]">
                            <SelectValue placeholder="選擇司機" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-slate-400 italic">未指派</SelectItem>
                            {/* Current driver if not in available list */}
                            {order.driver && !availableDrivers.find(d => d.id === order.driver?.id) && (
                              <SelectItem value={order.driver.id.toString()}>{order.driver.name} (目前)</SelectItem>
                            )}
                            {availableDrivers.map(d => (
                              <SelectItem key={d.id} value={d.id.toString()}>{d.name} ({d.vehicleType})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Select 
                          value={order.status} 
                          onValueChange={(val) => handleOrderStatus(order.id, val as OrderStatus)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[120px] ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">待處理</SelectItem>
                            <SelectItem value="assigned">已指派</SelectItem>
                            <SelectItem value="in_transit">運送中</SelectItem>
                            <SelectItem value="delivered">已送達</SelectItem>
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

        {/* --- DRIVERS TAB --- */}
        <TabsContent value="drivers" className="space-y-4 outline-none">
          <div className="flex justify-end mb-4">
            <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-md">
                  <UserPlus className="w-4 h-4" /> 新增司機
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>新增司機資料</DialogTitle>
                  <DialogDescription>填寫司機基本資料與車輛資訊</DialogDescription>
                </DialogHeader>
                <Form {...driverForm}>
                  <form onSubmit={driverForm.handleSubmit(onDriverSubmit)} className="space-y-4 py-4">
                    <FormField control={driverForm.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>姓名</FormLabel>
                        <FormControl><Input placeholder="例如：陳大文" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={driverForm.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>電話</FormLabel>
                        <FormControl><Input placeholder="09xx-xxx-xxx" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
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
                    <DialogFooter className="pt-4">
                      <Button type="submit" disabled={creatingDriver} className="w-full">
                        {creatingDriver ? "儲存中..." : "建立司機檔案"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900/80 uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-semibold">司機姓名 / 電話</th>
                  <th className="px-6 py-4 font-semibold">車輛資訊</th>
                  <th className="px-6 py-4 font-semibold">當前狀態</th>
                  <th className="px-6 py-4 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
                {driversLoading ? (
                   <tr><td colSpan={4} className="p-8 text-center text-slate-500">載入中...</td></tr>
                ) : drivers?.map((driver) => (
                  <tr key={driver.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{driver.name}</div>
                      <div className="text-slate-500 font-mono text-xs mt-1">{driver.phone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-700">{driver.vehicleType}</div>
                      <div className="text-slate-400 text-xs uppercase bg-slate-100 dark:bg-slate-800 inline-block px-1.5 py-0.5 rounded mt-1 border">
                        {driver.licensePlate}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Select 
                        value={driver.status} 
                        onValueChange={(val) => handleDriverStatus(driver.id, val as DriverStatus)}
                      >
                        <SelectTrigger className="h-9 w-[130px] border-0 shadow-none hover:bg-slate-100 transition-colors">
                          <div className="flex items-center">
                            <DriverStatusBadge status={driver.status} />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">可接單</SelectItem>
                          <SelectItem value="busy">忙碌中</SelectItem>
                          <SelectItem value="offline">下線</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteDriver(driver.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
