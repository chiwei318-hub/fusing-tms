import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateOrderMutation } from "@/hooks/use-orders";
import { useToast } from "@/hooks/use-toast";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { Loader2, Save, X, MapPin, Calendar, Clock, FileText, Truck } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "pending",    label: "待處理" },
  { value: "assigned",   label: "已指派" },
  { value: "in_transit", label: "運送中" },
  { value: "delivered",  label: "已送達" },
  { value: "cancelled",  label: "已取消" },
];

const VEHICLE_OPTIONS = [
  { value: "", label: "不指定" },
  { value: "機車", label: "機車" },
  { value: "小貨車", label: "小貨車" },
  { value: "廂型車", label: "廂型車" },
  { value: "一噸半", label: "一噸半" },
  { value: "兩噸", label: "兩噸" },
  { value: "三噸半", label: "三噸半" },
  { value: "五噸", label: "五噸" },
  { value: "十噸", label: "十噸" },
];

interface OrderRow {
  id: number;
  status?: string;
  customerName?: string;
  pickupAddress?: string;
  pickupDate?: string | null;
  pickupTime?: string | null;
  pickupContactName?: string | null;
  deliveryAddress?: string;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  deliveryContactName?: string | null;
  notes?: string | null;
  requiredVehicleType?: string | null;
  totalFee?: number | null;
  feeStatus?: string | null;
}

interface Props {
  order: OrderRow | null;
  open: boolean;
  onClose: () => void;
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 border-t first:border-t-0 first:pt-0">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <span className="text-xs font-bold text-primary uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function OrderEditSheet({ order, open, onClose }: Props) {
  const { toast } = useToast();
  const updateOrder = useUpdateOrderMutation();

  const [form, setForm] = useState({
    status: "",
    pickupAddress: "",
    pickupDate: "",
    pickupTime: "",
    pickupContactName: "",
    deliveryAddress: "",
    deliveryDate: "",
    deliveryTime: "",
    deliveryContactName: "",
    notes: "",
    requiredVehicleType: "",
    totalFee: "",
    feeStatus: "",
  });

  useEffect(() => {
    if (order) {
      setForm({
        status: order.status ?? "pending",
        pickupAddress: order.pickupAddress ?? "",
        pickupDate: order.pickupDate ?? "",
        pickupTime: order.pickupTime ?? "",
        pickupContactName: order.pickupContactName ?? "",
        deliveryAddress: order.deliveryAddress ?? "",
        deliveryDate: order.deliveryDate ?? "",
        deliveryTime: order.deliveryTime ?? "",
        deliveryContactName: order.deliveryContactName ?? "",
        notes: order.notes ?? "",
        requiredVehicleType: order.requiredVehicleType ?? "",
        totalFee: order.totalFee != null ? String(order.totalFee) : "",
        feeStatus: order.feeStatus ?? "unpaid",
      });
    }
  }, [order]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    if (!order) return;
    try {
      await updateOrder.mutateAsync({
        id: order.id,
        data: {
          status: form.status as any,
          pickupAddress: form.pickupAddress || undefined,
          pickupDate: form.pickupDate || null,
          pickupTime: form.pickupTime || null,
          pickupContactName: form.pickupContactName || null,
          deliveryAddress: form.deliveryAddress || undefined,
          deliveryDate: form.deliveryDate || null,
          deliveryTime: form.deliveryTime || null,
          deliveryContactName: form.deliveryContactName || null,
          notes: form.notes || null,
          requiredVehicleType: form.requiredVehicleType || null,
          totalFee: form.totalFee ? Number(form.totalFee) : null,
          feeStatus: form.feeStatus as any || undefined,
        },
      });
      toast({ title: `訂單 #${order.id} 已更新`, description: "修改已儲存成功" });
      onClose();
    } catch (err: any) {
      toast({ title: "更新失敗", description: err?.message ?? "請稍後再試", variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-3">
            <span className="font-mono text-lg text-primary">#{order?.id}</span>
            <span className="text-base font-semibold text-foreground">{order?.customerName}</span>
            {order?.status && <OrderStatusBadge status={order.status} />}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-3 py-4 px-1">

          {/* 狀態 */}
          <SectionLabel icon={FileText} label="訂單狀態" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">狀態</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">收款狀態</Label>
              <Select value={form.feeStatus} onValueChange={v => setForm(f => ({ ...f, feeStatus: v }))}>
                <SelectTrigger className="h-9 text-sm">
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

          {/* 車輛 & 運費 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">車型需求</Label>
              <Select value={form.requiredVehicleType} onValueChange={v => setForm(f => ({ ...f, requiredVehicleType: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="不指定" />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_OPTIONS.map(o => (
                    <SelectItem key={o.value || "_none"} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">運費（元）</Label>
              <Input type="number" className="h-9 text-sm" placeholder="未設定" value={form.totalFee} onChange={set("totalFee")} />
            </div>
          </div>

          {/* 提貨資訊 */}
          <SectionLabel icon={MapPin} label="提貨資訊" />
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">提貨地址</Label>
            <Input className="h-9 text-sm" value={form.pickupAddress} onChange={set("pickupAddress")} placeholder="提貨地址" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 提貨日期
              </Label>
              <Input type="date" className="h-9 text-sm" value={form.pickupDate} onChange={set("pickupDate")} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Clock className="w-3 h-3" /> 提貨時間
              </Label>
              <Input type="time" className="h-9 text-sm" value={form.pickupTime} onChange={set("pickupTime")} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">提貨聯絡人</Label>
            <Input className="h-9 text-sm" value={form.pickupContactName} onChange={set("pickupContactName")} placeholder="聯絡人姓名" />
          </div>

          {/* 到貨資訊 */}
          <SectionLabel icon={Truck} label="到貨資訊" />
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">到貨地址</Label>
            <Input className="h-9 text-sm" value={form.deliveryAddress} onChange={set("deliveryAddress")} placeholder="到貨地址" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 到貨日期
              </Label>
              <Input type="date" className="h-9 text-sm" value={form.deliveryDate} onChange={set("deliveryDate")} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Clock className="w-3 h-3" /> 到貨時間
              </Label>
              <Input type="time" className="h-9 text-sm" value={form.deliveryTime} onChange={set("deliveryTime")} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">到貨聯絡人</Label>
            <Input className="h-9 text-sm" value={form.deliveryContactName} onChange={set("deliveryContactName")} placeholder="聯絡人姓名" />
          </div>

          {/* 備注 */}
          <SectionLabel icon={FileText} label="備注" />
          <Textarea
            className="text-sm resize-none"
            rows={3}
            placeholder="訂單備注…"
            value={form.notes}
            onChange={set("notes")}
          />
        </div>

        <SheetFooter className="border-t pt-4 gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={onClose} disabled={updateOrder.isPending}>
            <X className="w-4 h-4" /> 取消
          </Button>
          <Button className="flex-1 gap-2" onClick={handleSave} disabled={updateOrder.isPending}>
            {updateOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {updateOrder.isPending ? "儲存中…" : "儲存變更"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
