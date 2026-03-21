import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Search, Filter, ChevronRight, InboxIcon } from "lucide-react";
import { useOrdersData } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { OrderStatus } from "@workspace/api-client-react/src/generated/api.schemas";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrderList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: orders, isLoading } = useOrdersData(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">訂單列表</h1>
          <p className="text-slate-500 mt-2">檢視與追蹤所有物流派車訂單狀態。</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-white">
              <Filter className="w-4 h-4 mr-2 text-slate-500" />
              <SelectValue placeholder="篩選狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有狀態</SelectItem>
              <SelectItem value="pending">待處理</SelectItem>
              <SelectItem value="assigned">已指派</SelectItem>
              <SelectItem value="in_transit">運送中</SelectItem>
              <SelectItem value="delivered">已送達</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-0 shadow-md ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 bg-slate-50/80 dark:bg-slate-900/80 uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold">單號</th>
                <th className="px-6 py-4 font-semibold">客戶 / 聯絡電話</th>
                <th className="px-6 py-4 font-semibold">路線</th>
                <th className="px-6 py-4 font-semibold">狀態</th>
                <th className="px-6 py-4 font-semibold">負責司機</th>
                <th className="px-6 py-4 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16 rounded-full" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></td>
                  </tr>
                ))
              ) : orders?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <InboxIcon className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-base font-medium">目前沒有訂單</p>
                    <p className="text-sm">尚未有符合此條件的訂單記錄</p>
                  </td>
                </tr>
              ) : (
                orders?.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors group">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      #{order.id}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{order.customerName}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{order.customerPhone}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                          <span className="truncate max-w-[200px]">{order.pickupAddress}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          <span className="truncate max-w-[200px]">{order.deliveryAddress}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-4">
                      {order.driver ? (
                        <div className="text-sm font-medium">{order.driver.name}</div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">尚未指派</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/orders/${order.id}`}>
                          <ChevronRight className="w-5 h-5 text-slate-400 hover:text-primary" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
