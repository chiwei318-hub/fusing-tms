import { Badge } from "@/components/ui/badge";
import { OrderStatus, DriverStatus } from "@workspace/api-client-react/src/generated/api.schemas";

const ORDER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:    { label: "待派車", className: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200" },
  assigned:   { label: "已派車", className: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" },
  arrived:    { label: "司機到點", className: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-200" },
  loading:    { label: "裝貨中", className: "bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200" },
  in_transit: { label: "配送中", className: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
  delivered:  { label: "已完成", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" },
  exception:  { label: "異常", className: "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300 font-bold" },
  cancelled:  { label: "已取消", className: "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus | string }) {
  const { label, className } = ORDER_STATUS_CONFIG[status as string] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <Badge variant="outline" className={`font-medium ${className}`}>
      {label}
    </Badge>
  );
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const config: Record<DriverStatus, { label: string; className: string }> = {
    available: { label: "可接單", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" },
    busy:      { label: "忙碌中", className: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
    offline:   { label: "下線",   className: "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200" },
  };
  const { label, className } = config[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={`font-medium ${className}`}>
      {label}
    </Badge>
  );
}
