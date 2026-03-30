import { useState, useMemo } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Filter, ChevronRight, InboxIcon, Truck, Search, Calendar, Clock, Pencil } from "lucide-react";
import { useOrdersData } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import OrderEditSheet from "@/components/OrderEditSheet";

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

function DateTimeCell({ date, time, fallback = "—" }: { date?: string | null; time?: string | null; fallback?: string }) {
  if (!date && !time) return <span className="text-muted-foreground/50 text-xs italic">{fallback}</span>;
  return (
    <div className="whitespace-nowrap">
      {date && (
        <div className="flex items-center gap-1 text-xs text-foreground font-medium">
          <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
          {date}
        </div>
      )}
      {time && (
        <div className="flex items-center gap-1 text-xs text-primary font-semibold mt-0.5">
          <Clock className="w-3 h-3 shrink-0" />
          {time}
        </div>
      )}
    </div>
  );
}

function CreatedAtCell({ createdAt }: { createdAt: string }) {
  const d = new Date(createdAt);
  return (
    <div className="whitespace-nowrap">
      <div className="flex items-center gap-1 text-xs text-foreground font-medium">
        <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
        {format(d, "yyyy/MM/dd")}
      </div>
      <div className="flex items-center gap-1 text-xs text-primary font-semibold mt-0.5">
        <Clock className="w-3 h-3 shrink-0" />
        {format(d, "HH:mm:ss")}
      </div>
    </div>
  );
}

export default function OrderList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editOrder, setEditOrder] = useState<any | null>(null);

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
          <table className="w-full text-sm text-left" style={{ minWidth: "1050px" }}>
            <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-3 font-semibold">單號</th>
                <th className="px-3 py-3 font-semibold">客戶</th>
                <th className="px-3 py-3 font-semibold">狀態</th>
                <th className="px-3 py-3 font-semibold">司機</th>
                <th className="px-3 py-3 font-semibold">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                    提貨時間
                  </div>
                </th>
                <th className="px-3 py-3 font-semibold">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    到貨時間
                  </div>
                </th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">提貨地址</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">到貨地址</th>
                <th className="px-3 py-3 font-semibold hidden xl:table-cell">運費</th>
                <th className="px-3 py-3 font-semibold hidden xl:table-cell">收款</th>
                <th className="px-3 py-3 font-semibold">建單時間</th>
                <th className="px-3 py-3 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-card">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 12 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-muted-foreground">
                    <InboxIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="font-medium">{search ? "找不到符合的訂單" : "目前沒有訂單"}</p>
                    <p className="text-xs mt-1">{search ? "請嘗試不同的搜尋關鍵字" : "尚未有符合此條件的訂單記錄"}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors group">
                    {/* 單號 */}
                    <td className="px-3 py-3 font-mono font-bold text-foreground text-sm">
                      #{order.id}
                    </td>

                    {/* 客戶 */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground text-sm leading-tight">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{order.customerPhone}</div>
                    </td>

                    {/* 狀態 */}
                    <td className="px-3 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>

                    {/* 司機 */}
                    <td className="px-3 py-3">
                      {order.driver ? (
                        <div className="font-medium text-foreground text-sm">{order.driver.name}</div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">尚未指派</span>
                      )}
                    </td>

                    {/* 提貨時間 */}
                    <td className="px-3 py-3">
                      <DateTimeCell date={order.pickupDate} time={order.pickupTime} />
                    </td>

                    {/* 到貨時間 */}
                    <td className="px-3 py-3">
                      <DateTimeCell date={order.deliveryDate} time={order.deliveryTime} />
                    </td>

                    {/* 提貨地址 */}
                    <td className="px-3 py-3 hidden lg:table-cell max-w-[180px]">
                      <span className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                        {order.pickupAddress || <span className="italic text-muted-foreground/50">—</span>}
                      </span>
                    </td>

                    {/* 到貨地址 */}
                    <td className="px-3 py-3 hidden lg:table-cell max-w-[180px]">
                      <span className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                        {order.deliveryAddress || <span className="italic text-muted-foreground/50">—</span>}
                      </span>
                    </td>

                    {/* 運費 */}
                    <td className="px-3 py-3 hidden xl:table-cell">
                      {order.totalFee != null ? (
                        <span className="font-semibold text-foreground text-sm">NT${order.totalFee.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">未設定</span>
                      )}
                    </td>

                    {/* 收款 */}
                    <td className="px-3 py-3 hidden xl:table-cell">
                      <span className={`text-xs font-semibold ${feeStatusColor[order.feeStatus ?? "unpaid"] ?? "text-muted-foreground"}`}>
                        {feeStatusLabel[order.feeStatus ?? "unpaid"] ?? "—"}
                      </span>
                    </td>

                    {/* 建單時間 */}
                    <td className="px-3 py-3">
                      <CreatedAtCell createdAt={order.createdAt} />
                    </td>

                    {/* 操作 */}
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => setEditOrder(order)}
                          title="快速編輯"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity">
                          <Link href={`/orders/${order.id}`}>
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 快速編輯側邊欄 */}
      <OrderEditSheet
        order={editOrder}
        open={!!editOrder}
        onClose={() => setEditOrder(null)}
      />
    </div>
  );
}
