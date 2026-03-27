import { useState, useMemo } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Filter, ChevronRight, InboxIcon, Truck, Search } from "lucide-react";
import { useOrdersData } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const feeStatusLabel: Record<string, string> = {
  unpaid: "未收款",
  paid: "已收款",
  invoiced: "已開票",
};

const feeStatusColor: Record<string, string> = {
  unpaid: "text-orange-600",
  paid: "text-green-600",
  invoiced: "text-blue-600",
};

export default function OrderList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data: orders, isLoading } = useOrdersData(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.customerPhone?.toLowerCase().includes(q) ||
      o.pickupAddress?.toLowerCase().includes(q) ||
      o.deliveryAddress?.toLowerCase().includes(q) ||
      String(o.id).includes(q)
    );
  }, [orders, search]);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary">富詠運輸</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">訂單列表</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            共 {isLoading ? "…" : filtered.length} 筆訂單
            {search && orders && filtered.length !== orders.length && (
              <span className="ml-1 text-primary font-medium">（已篩選）</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 w-[180px] bg-card text-sm"
              placeholder="搜尋客戶、地址、單號…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 bg-card">
              <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
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

      <Card className="border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
              <tr>
                <th className="px-4 py-3 font-semibold">單號</th>
                <th className="px-4 py-3 font-semibold">客戶</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">路線</th>
                <th className="px-4 py-3 font-semibold">狀態</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">司機</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">運費</th>
                <th className="px-4 py-3 font-semibold hidden lg:table-cell">收款</th>
                <th className="px-4 py-3 font-semibold hidden xl:table-cell">建單日期</th>
                <th className="px-4 py-3 font-semibold text-right">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-card">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                    <InboxIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">{search ? "找不到符合的訂單" : "目前沒有訂單"}</p>
                    <p className="text-xs mt-1">{search ? "請嘗試不同的搜尋關鍵字" : "尚未有符合此條件的訂單記錄"}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3 font-mono font-medium text-foreground">
                      #{order.id}
                      <div className="text-xs text-muted-foreground mt-0.5 md:hidden">
                        {format(new Date(order.createdAt), "MM/dd HH:mm")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{order.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col gap-1 text-xs max-w-[200px]">
                        <div className="flex items-center gap-1.5 text-foreground/80">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></div>
                          <span className="truncate">{order.pickupAddress}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-foreground/80">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                          <span className="truncate">{order.deliveryAddress}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {order.driver ? (
                        <div className="font-medium text-foreground text-sm">{order.driver.name}</div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">尚未指派</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {order.totalFee != null ? (
                        <span className="font-semibold text-foreground">NT${order.totalFee.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">未設定</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-xs font-medium ${feeStatusColor[order.feeStatus ?? "unpaid"] ?? "text-muted-foreground"}`}>
                        {feeStatusLabel[order.feeStatus ?? "unpaid"] ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(order.createdAt), "yyyy/MM/dd")}
                        <br />
                        <span className="text-muted-foreground/60">{format(new Date(order.createdAt), "HH:mm")}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" asChild className="opacity-60 group-hover:opacity-100 transition-opacity h-8 w-8">
                        <Link href={`/orders/${order.id}`}>
                          <ChevronRight className="w-4 h-4" />
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
