import { useRoute } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Package, User, Clock, Truck, FileText } from "lucide-react";
import { Link } from "wouter";
import { useOrderDetail } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const id = parseInt(params?.id || "0", 10);
  
  const { data: order, isLoading, error } = useOrderDetail(id);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold text-slate-800">找不到此訂單</h2>
        <p className="text-slate-500 mt-2">請確認訂單編號是否正確。</p>
        <Button asChild className="mt-6">
          <Link href="/orders">返回訂單列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/orders">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">
              訂單 #{order.id}
            </h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-slate-500 mt-1 text-sm flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            建立於 {format(new Date(order.createdAt), "yyyy-MM-dd HH:mm")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                運送路線
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 relative">
              <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-slate-200 dark:bg-slate-800"></div>
              
              <div className="relative z-10 flex gap-6 mb-8">
                <div className="w-5 h-5 mt-1 rounded-full bg-blue-100 border-2 border-blue-500 flex-shrink-0"></div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm text-blue-600 mb-1">取貨地點</h3>
                  <p className="text-slate-700 dark:text-slate-300 font-medium text-lg leading-snug">{order.pickupAddress}</p>
                </div>
              </div>
              
              <div className="relative z-10 flex gap-6">
                <div className="w-5 h-5 mt-1 rounded-full bg-emerald-100 border-2 border-emerald-500 flex-shrink-0 shadow-[0_0_0_4px_white] dark:shadow-[0_0_0_4px_rgb(2,6,23)]"></div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm text-emerald-600 mb-1">送貨地點</h3>
                  <p className="text-slate-700 dark:text-slate-300 font-medium text-lg leading-snug">{order.deliveryAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                託運詳情
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6 text-sm">
                <div>
                  <dt className="text-slate-500 mb-1">貨物描述</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100 text-base">{order.cargoDescription}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 mb-1">預估重量</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100 text-base">
                    {order.cargoWeight ? `${order.cargoWeight} kg` : "未提供"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-slate-500 mb-1">備註說明</dt>
                  <dd className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                    {order.notes || "無"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                客戶資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">聯絡人</p>
                  <p className="font-medium">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">電話</p>
                  <p className="font-medium font-mono">{order.customerPhone}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                指派司機
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {order.driver ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {order.driver.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{order.driver.name}</p>
                      <p className="text-xs text-slate-500 font-mono">{order.driver.phone}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs mb-1">車型</p>
                      <p className="font-medium">{order.driver.vehicleType}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs mb-1">車牌</p>
                      <p className="font-medium font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-center border">{order.driver.licensePlate}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center mb-3">
                    <Truck className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm">目前尚未指派司機</p>
                  <p className="text-slate-400 text-xs mt-1">請至後台管理進行派車</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
