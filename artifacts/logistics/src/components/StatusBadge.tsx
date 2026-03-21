import { Badge } from "@/components/ui/badge";
import { OrderStatus, DriverStatus } from "@workspace/api-client-react/src/generated/api.schemas";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config: Record<OrderStatus, { label: string; className: string }> = {
    pending: { label: "待處理", className: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200" },
    assigned: { label: "已指派", className: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" },
    in_transit: { label: "運送中", className: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
    delivered: { label: "已送達", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" },
    cancelled: { label: "已取消", className: "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={`font-medium ${className}`}>
      {label}
    </Badge>
  );
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const config: Record<DriverStatus, { label: string; className: string }> = {
    available: { label: "可接單", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" },
    busy: { label: "忙碌中", className: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
    offline: { label: "下線", className: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200" },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={`font-medium ${className}`}>
      {label}
    </Badge>
  );
}
