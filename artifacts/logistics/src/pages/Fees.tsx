import { useState } from "react";
import { DollarSign, TrendingUp, Clock, CheckCircle2, Receipt, MapPin, Truck, Package, AlertCircle, ChevronDown } from "lucide-react";
import { useOrdersData } from "@/hooks/use-orders";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FeeStatus } from "@workspace/api-client-react/src/generated/api.schemas";

const BASE = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

type AnyOrder = Record<string, any>;

function canPrice(order: AnyOrder): boolean {
  return !!(
    order.pickupAddress &&
    order.deliveryAddress &&
    order.requiredVehicleType
  );
}

function getMissingFields(order: AnyOrder): string[] {
  const missing: string[] = [];
  if (!order.pickupAddress) missing.push("提貨地址");
  if (!order.deliveryAddress) missing.push("到貨地址");
  if (!order.requiredVehicleType) missing.push("車型");
  return missing;
}

type EditFeeState = {
  orderId: number;
  customerAmount: number | null;
  driverPay: number | null;
  feeStatus: FeeStatus;
};

export default function Fees() {
  const { toast } = useToast();
  const { data: rawOrders, isLoading } = useOrdersData();
  const orders = (rawOrders ?? []) as AnyOrder[];

  const [feeFilter, setFeeFilter] = useState<string>("all");
  const [editFee, setEditFee] = useState<EditFeeState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = orders.filter((o) => {
    if (feeFilter === "all") return true;
    return o.feeStatus === feeFilter;
  });

  const totalRevenue = orders.filter(o => o.feeStatus !== "unpaid").reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const unpaidAmount = orders.filter(o => o.feeStatus === "unpaid" && o.totalFee).reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const paidCount = orders.filter(o => o.feeStatus === "paid").length;
  const unpaidCount = orders.filter(o => o.feeStatus === "unpaid").length;

  const openEditFee = (order: AnyOrder) => {
    setEditFee({
      orderId: order.id,
      customerAmount: order.totalFee ?? null,
      driverPay: order.driverPay ?? null,
      feeStatus: (order.feeStatus as FeeStatus) ?? "unpaid",
    });
  };

  const handleFeeUpdate = async () => {
    if (!editFee) return;
    setIsSaving(true);
    try {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(`${BASE}/api/orders/${editFee.orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          totalFee: editFee.customerAmount,
          driverPay: editFee.driverPay,
          feeStatus: editFee.feeStatus,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "費用已更新", description: `訂單 #${editFee.orderId} 費用資訊已儲存` });
      setEditFee(null);
      // Refresh orders data
      window.dispatchEvent(new Event("orders-updated"));
    } catch {
      toast({ title: "更新失敗", description: "無法儲存費用資訊", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickFeeStatus = async (orderId: number, feeStatus: FeeStatus) => {
    try {
      const token = localStorage.getItem("auth-jwt");
      await fetch(`${BASE}/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ feeStatus }),
      });
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
            <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-3 font-semibold">單號</th>
                <th className="px-3 py-3 font-semibold hidden sm:table-cell">客戶</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">運送狀態</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">起訖點</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">車型</th>
                <th className="px-3 py-3 font-semibold hidden xl:table-cell">數量／重量</th>
                <th className="px-3 py-3 font-semibold">客戶請款</th>
                <th className="px-3 py-3 font-semibold hidden sm:table-cell">司機酬勞</th>
                <th className="px-3 py-3 font-semibold">收款狀態</th>
                <th className="px-3 py-3 font-semibold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-card">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p>目前沒有符合條件的訂單</p>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const priceable = canPrice(order);
                  const missing = getMissingFields(order);
                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      {/* 單號 */}
                      <td className="px-3 py-2.5 font-mono font-bold text-sm">#{order.id}</td>

                      {/* 客戶 */}
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="font-medium text-foreground text-sm leading-tight">{order.customerName}</div>
                        <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                      </td>

                      {/* 運送狀態 */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <OrderStatusBadge status={order.status} />
                      </td>

                      {/* 起訖點 */}
                      <td className="px-3 py-2.5 hidden lg:table-cell max-w-[200px]">
                        <div className="space-y-0.5">
                          {order.pickupAddress ? (
                            <div className="flex items-start gap-1 text-xs text-foreground/80">
                              <MapPin className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{order.pickupAddress}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">未設起點</span>
                          )}
                          {order.deliveryAddress ? (
                            <div className="flex items-start gap-1 text-xs text-foreground/80">
                              <MapPin className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-1">{order.deliveryAddress}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">未設訖點</span>
                          )}
                        </div>
                      </td>

                      {/* 車型 */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {order.requiredVehicleType ? (
                          <span className="inline-block text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                            {order.requiredVehicleType}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">未設</span>
                        )}
                      </td>

                      {/* 數量 / 重量 */}
                      <td className="px-3 py-2.5 hidden xl:table-cell">
                        <div className="space-y-0.5">
                          {order.cargoQuantity ? (
                            <div className="flex items-center gap-1 text-xs">
                              <Package className="w-3 h-3 text-muted-foreground" />
                              <span>{order.cargoQuantity}</span>
                            </div>
                          ) : null}
                          {order.cargoWeight != null ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Truck className="w-3 h-3" />
                              <span>{order.cargoWeight} kg</span>
                            </div>
                          ) : null}
                          {!order.cargoQuantity && order.cargoWeight == null && (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* 客戶請款 */}
                      <td className="px-3 py-2.5">
                        {order.totalFee != null ? (
                          <span className="font-bold text-foreground text-sm">NT${order.totalFee.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground italic text-xs">未設定</span>
                        )}
                      </td>

                      {/* 司機酬勞 */}
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        {order.driverPay != null ? (
                          <span className="font-semibold text-violet-700 text-sm">NT${order.driverPay.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* 收款狀態 */}
                      <td className="px-3 py-2.5">
                        <Select
                          value={order.feeStatus ?? "unpaid"}
                          onValueChange={(val) => handleQuickFeeStatus(order.id, val as FeeStatus)}
                        >
                          <SelectTrigger className="h-8 w-auto border-0 shadow-none p-0 bg-transparent gap-1">
                            <FeeStatusBadge status={order.feeStatus ?? "unpaid"} />
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unpaid">未收款</SelectItem>
                            <SelectItem value="paid">已收款</SelectItem>
                            <SelectItem value="invoiced">已開票</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* 操作 */}
                      <td className="px-3 py-2.5 text-right">
                        {priceable ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2.5"
                            onClick={() => openEditFee(order)}
                          >
                            設定費用
                          </Button>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2.5 text-muted-foreground"
                              onClick={() => openEditFee(order)}
                            >
                              設定費用
                            </Button>
                            <div className="group relative">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 cursor-help" />
                              <div className="hidden group-hover:block absolute right-0 bottom-full mb-1 z-50 bg-popover border text-popover-foreground text-xs rounded shadow-md px-2.5 py-1.5 whitespace-nowrap">
                                缺少：{missing.join("、")}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Fee Dialog */}
      <Dialog open={!!editFee} onOpenChange={() => setEditFee(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              設定費用 — 訂單 #{editFee?.orderId}
            </DialogTitle>
          </DialogHeader>
          {editFee && (
            <div className="space-y-4 py-2">
              {/* 客戶請款金額 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">客戶請款金額 (NT$)</Label>
                <p className="text-xs text-muted-foreground">向客戶收取的總運費金額</p>
                <Input
                  type="number"
                  placeholder="例如：3000"
                  value={editFee.customerAmount ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditFee((prev) => prev ? { ...prev, customerAmount: val } : prev);
                  }}
                />
              </div>

              {/* 司機酬勞 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">司機酬勞 (NT$)</Label>
                <p className="text-xs text-muted-foreground">支付給司機的運送報酬</p>
                <Input
                  type="number"
                  placeholder="例如：2000"
                  value={editFee.driverPay ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditFee((prev) => prev ? { ...prev, driverPay: val } : prev);
                  }}
                />
              </div>

              {/* 利潤預覽 */}
              {(editFee.customerAmount != null || editFee.driverPay != null) && (
                <div className="bg-muted/50 border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">客戶請款</span>
                    <span className="font-semibold">NT${(editFee.customerAmount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">司機酬勞</span>
                    <span className="font-semibold text-violet-700">NT${(editFee.driverPay ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">毛利</span>
                    <span className={`text-base font-bold ${((editFee.customerAmount ?? 0) - (editFee.driverPay ?? 0)) >= 0 ? "text-green-600" : "text-red-500"}`}>
                      NT${((editFee.customerAmount ?? 0) - (editFee.driverPay ?? 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* 收款狀態 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">收款狀態</Label>
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFee(null)}>取消</Button>
            <Button onClick={handleFeeUpdate} disabled={isSaving}>
              {isSaving ? "儲存中…" : "儲存費用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
