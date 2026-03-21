import { useState } from "react";
import { format } from "date-fns";
import { DollarSign, TrendingUp, Clock, CheckCircle2, Receipt } from "lucide-react";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FeeStatus } from "@workspace/api-client-react/src/generated/api.schemas";

const feeStatusLabel: Record<string, string> = {
  unpaid: "未收款",
  paid: "已收款",
  invoiced: "已開票",
};

const feeStatusColor: Record<string, string> = {
  unpaid: "bg-orange-100 text-orange-700 border-orange-200",
  paid: "bg-green-100 text-green-700 border-green-200",
  invoiced: "bg-blue-100 text-blue-700 border-blue-200",
};

function FeeStatusBadge({ status }: { status: string }) {
  const label = feeStatusLabel[status] ?? status;
  const color = feeStatusColor[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

type EditFeeState = {
  orderId: number;
  basePrice: number | null;
  extraFee: number | null;
  totalFee: number | null;
  feeStatus: FeeStatus;
};

export default function Fees() {
  const { toast } = useToast();
  const { data: orders, isLoading } = useOrdersData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();

  const [feeFilter, setFeeFilter] = useState<string>("all");
  const [editFee, setEditFee] = useState<EditFeeState | null>(null);

  const filtered = orders?.filter((o) => {
    if (feeFilter === "all") return true;
    return o.feeStatus === feeFilter;
  }) ?? [];

  const totalRevenue = orders?.filter(o => o.feeStatus !== "unpaid").reduce((s, o) => s + (o.totalFee ?? 0), 0) ?? 0;
  const unpaidAmount = orders?.filter(o => o.feeStatus === "unpaid").reduce((s, o) => s + (o.totalFee ?? 0), 0) ?? 0;
  const paidCount = orders?.filter(o => o.feeStatus === "paid").length ?? 0;
  const unpaidCount = orders?.filter(o => o.feeStatus === "unpaid").length ?? 0;

  const openEditFee = (order: NonNullable<typeof orders>[0]) => {
    setEditFee({
      orderId: order.id,
      basePrice: order.basePrice ?? null,
      extraFee: order.extraFee ?? null,
      totalFee: order.totalFee ?? null,
      feeStatus: (order.feeStatus as FeeStatus) ?? "unpaid",
    });
  };

  const handleFeeUpdate = async () => {
    if (!editFee) return;
    try {
      const base = editFee.basePrice ?? 0;
      const extra = editFee.extraFee ?? 0;
      const total = editFee.totalFee ?? base + extra;
      await updateOrder({
        id: editFee.orderId,
        data: {
          basePrice: editFee.basePrice,
          extraFee: editFee.extraFee,
          totalFee: total,
          feeStatus: editFee.feeStatus,
        },
      });
      toast({ title: "費用已更新", description: `訂單 #${editFee.orderId} 費用資訊已儲存` });
      setEditFee(null);
    } catch {
      toast({ title: "更新失敗", description: "無法儲存費用資訊", variant: "destructive" });
    }
  };

  const handleQuickFeeStatus = async (orderId: number, feeStatus: FeeStatus) => {
    try {
      await updateOrder({ id: orderId, data: { feeStatus } });
      toast({ title: "收款狀態已更新" });
    } catch {
      toast({ title: "更新失敗", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2.5">
          <DollarSign className="w-7 h-7 text-primary" />
          費用管理
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">管理訂單運費與收款狀態</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">已收款總額</p>
                <p className="text-xl md:text-2xl font-bold text-foreground mt-1">
                  NT${totalRevenue.toLocaleString()}
                </p>
              </div>
              <div className="bg-green-100 p-2.5 rounded-xl">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">待收款金額</p>
                <p className="text-xl md:text-2xl font-bold text-orange-500 mt-1">
                  NT${unpaidAmount.toLocaleString()}
                </p>
              </div>
              <div className="bg-orange-100 p-2.5 rounded-xl">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">已收款筆數</p>
                <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{paidCount}</p>
              </div>
              <div className="bg-blue-100 p-2.5 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">未收款筆數</p>
                <p className="text-xl md:text-2xl font-bold text-orange-500 mt-1">{unpaidCount}</p>
              </div>
              <div className="bg-orange-100 p-2.5 rounded-xl">
                <Receipt className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={feeFilter} onValueChange={setFeeFilter}>
          <SelectTrigger className="w-[160px] bg-card">
            <SelectValue placeholder="篩選收款狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部訂單</SelectItem>
            <SelectItem value="unpaid">未收款</SelectItem>
            <SelectItem value="paid">已收款</SelectItem>
            <SelectItem value="invoiced">已開票</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Fee Table */}
      <Card className="border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
              <tr>
                <th className="px-4 py-3 font-semibold">單號</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">客戶</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">運送狀態</th>
                <th className="px-4 py-3 font-semibold">基本運費</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">附加費用</th>
                <th className="px-4 py-3 font-semibold">總計</th>
                <th className="px-4 py-3 font-semibold">收款狀態</th>
                <th className="px-4 py-3 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">載入中...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p>目前沒有符合條件的訂單</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">#{order.id}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="font-medium text-foreground">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      {order.basePrice != null ? (
                        <span className="font-medium">NT${order.basePrice.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">未設定</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {order.extraFee != null && order.extraFee > 0 ? (
                        <span className="text-orange-600 font-medium">+NT${order.extraFee.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {order.totalFee != null ? (
                        <span className="font-bold text-foreground">NT${order.totalFee.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">未設定</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={order.feeStatus ?? "unpaid"}
                        onValueChange={(val) => handleQuickFeeStatus(order.id, val as FeeStatus)}
                      >
                        <SelectTrigger className="h-8 w-[100px] border-0 shadow-none p-0 bg-transparent">
                          <FeeStatusBadge status={order.feeStatus ?? "unpaid"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">未收款</SelectItem>
                          <SelectItem value="paid">已收款</SelectItem>
                          <SelectItem value="invoiced">已開票</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => openEditFee(order)}
                      >
                        設定費用
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Fee Dialog */}
      <Dialog open={!!editFee} onOpenChange={() => setEditFee(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              設定運費 — 訂單 #{editFee?.orderId}
            </DialogTitle>
          </DialogHeader>
          {editFee && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">基本運費 (NT$)</label>
                <Input
                  type="number"
                  placeholder="例如：2000"
                  value={editFee.basePrice ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditFee((prev) => {
                      if (!prev) return prev;
                      const base = val ?? 0;
                      const extra = prev.extraFee ?? 0;
                      return { ...prev, basePrice: val, totalFee: base + extra };
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">附加費用 (NT$)</label>
                <Input
                  type="number"
                  placeholder="例如：500（過路費、山地加價等）"
                  value={editFee.extraFee ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditFee((prev) => {
                      if (!prev) return prev;
                      const base = prev.basePrice ?? 0;
                      const extra = val ?? 0;
                      return { ...prev, extraFee: val, totalFee: base + extra };
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">總計運費 (NT$)</label>
                <Input
                  type="number"
                  placeholder="可手動調整"
                  value={editFee.totalFee ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditFee((prev) => prev ? { ...prev, totalFee: val } : prev);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">收款狀態</label>
                <Select
                  value={editFee.feeStatus}
                  onValueChange={(val) =>
                    setEditFee((prev) => prev ? { ...prev, feeStatus: val as FeeStatus } : prev)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">未收款</SelectItem>
                    <SelectItem value="paid">已收款</SelectItem>
                    <SelectItem value="invoiced">已開票</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editFee.totalFee != null && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">應收總額</span>
                  <span className="text-xl font-bold text-primary">
                    NT${editFee.totalFee.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFee(null)}>取消</Button>
            <Button onClick={handleFeeUpdate}>儲存費用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
