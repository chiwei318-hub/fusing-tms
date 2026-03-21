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

const driverFormSchema = z.object({
  name: z.string().min(2, "名稱必填"),
  phone: z.string().min(8, "電話必填"),
  vehicleType: z.string().min(2, "車型必填"),
  licensePlate: z.string().min(3, "車牌必填"),
});
type DriverFormValues = z.infer<typeof driverFormSchema>;

export default function Admin() {
  const { toast } = useToast();

  const { data: orders, isLoading: ordersLoading } = useOrdersData();
  const { data: drivers, isLoading: driversLoading } = useDriversData();

  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { mutateAsync: createDriver, isPending: creatingDriver } = useCreateDriverMutation();
  const { mutateAsync: updateDriver } = useUpdateDriverMutation();
  const { mutateAsync: deleteDriver } = useDeleteDriverMutation();

  const [driverDialogOpen, setDriverDialogOpen] = useState(false);

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
      toast({ title: "派車成功", description: `訂單 #${orderId} 已更新` });
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
      toast({ title: "狀態更新", description: "司機狀態已更新" });
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

  const availableDrivers = drivers?.filter((d) => d.status === "available") || [];

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-primary">富詠運輸</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
          <Settings2 className="w-7 h-7 text-primary" />
          後台管理中心
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">集中管理派車作業與司機狀態</p>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-xs mb-5">
          <TabsTrigger value="orders" className="gap-2 text-sm">
            <Package className="w-4 h-4" /> 派車管理
          </TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2 text-sm">
            <Truck className="w-4 h-4" /> 司機管理
          </TabsTrigger>
        </TabsList>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="outline-none">
          <Card className="border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-semibold">單號</th>
                    <th className="px-4 py-3 font-semibold hidden md:table-cell">路線</th>
                    <th className="px-4 py-3 font-semibold">狀態</th>
                    <th className="px-4 py-3 font-semibold">指派司機</th>
                    <th className="px-4 py-3 font-semibold text-right">更改狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {ordersLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">載入中...</td>
                    </tr>
                  ) : orders?.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium">#{order.id}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.createdAt), "MM/dd HH:mm")}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                        <div className="truncate text-foreground text-xs" title={order.pickupAddress}>{order.pickupAddress}</div>
                        <div className="text-muted-foreground text-xs">↓</div>
                        <div className="truncate text-foreground text-xs" title={order.deliveryAddress}>{order.deliveryAddress}</div>
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
                            <SelectItem value="none" className="text-muted-foreground italic">未指派</SelectItem>
                            {order.driver && !availableDrivers.find((d) => d.id === order.driver?.id) && (
                              <SelectItem value={order.driver.id.toString()}>
                                {order.driver.name} (目前)
                              </SelectItem>
                            )}
                            {availableDrivers.map((d) => (
                              <SelectItem key={d.id} value={d.id.toString()}>
                                {d.name} ({d.vehicleType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleOrderStatus(order.id, val as OrderStatus)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[110px] ml-auto">
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

        {/* DRIVERS TAB */}
        <TabsContent value="drivers" className="outline-none space-y-4">
          <div className="flex justify-end">
            <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
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
                    <th className="px-5 py-3 font-semibold">司機 / 電話</th>
                    <th className="px-5 py-3 font-semibold hidden sm:table-cell">車輛資訊</th>
                    <th className="px-5 py-3 font-semibold">狀態</th>
                    <th className="px-5 py-3 font-semibold text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-card">
                  {driversLoading ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">載入中...</td>
                    </tr>
                  ) : drivers?.map((driver) => (
                    <tr key={driver.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-bold text-foreground">{driver.name}</div>
                        <div className="text-muted-foreground font-mono text-xs mt-0.5">{driver.phone}</div>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <div className="font-medium text-foreground text-sm">{driver.vehicleType}</div>
                        <div className="text-xs text-muted-foreground bg-muted inline-block px-1.5 py-0.5 rounded mt-1 border font-mono uppercase">
                          {driver.licensePlate}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Select
                          value={driver.status}
                          onValueChange={(val) => handleDriverStatus(driver.id, val as DriverStatus)}
                        >
                          <SelectTrigger className="h-8 w-[120px] border-0 shadow-none hover:bg-muted/50 transition-colors p-1">
                            <DriverStatusBadge status={driver.status} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="available">可接單</SelectItem>
                            <SelectItem value="busy">忙碌中</SelectItem>
                            <SelectItem value="offline">下線</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteDriver(driver.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                        >
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
      </Tabs>
    </div>
  );
}
