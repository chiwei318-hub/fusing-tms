import { Link } from "wouter";
import { Truck, ArrowRight, CheckCircle, DollarSign, LogOut, Zap } from "lucide-react";
import { useDriversData } from "@/hooks/use-drivers";
import { useListOrders } from "@workspace/api-client-react";
import { DriverStatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { isToday } from "date-fns";

export default function DriverHome() {
  const { user, logout } = useAuth();
  const { data: drivers, isLoading } = useDriversData();
  const driver = drivers?.find(d => d.id === user?.id);

  const { data: myOrders } = useListOrders(
    user?.id ? { driverId: user.id } as any : undefined,
    { query: { enabled: !!user?.id } }
  );

  const todayCompleted = myOrders?.filter(o =>
    o.status === "delivered" && isToday(new Date(o.updatedAt))
  ) ?? [];

  const todayEarnings = todayCompleted.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);
  const activeTasks = myOrders?.filter(o => o.status === "assigned" || o.status === "in_transit") ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">已登入</p>
          <h1 className="text-2xl font-black text-foreground">歡迎，{user?.name}</h1>
          {driver && <p className="text-muted-foreground text-sm mt-0.5">{driver.vehicleType} · {driver.licensePlate}</p>}
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors mt-1">
          <LogOut className="w-3.5 h-3.5" /> 登出
        </button>
      </div>

      {/* Stats card */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full -mr-8 -mt-8" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-orange-500/20 rounded-full -ml-4 -mb-4" />
        <div className="relative z-10 flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white font-black text-xl shrink-0">
            {(user?.name ?? "?").charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white text-base leading-tight">{user?.name}</p>
            {driver && <DriverStatusBadge status={driver.status} />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <CheckCircle className="w-4 h-4 text-green-300 mx-auto mb-1" />
            <p className="font-black text-lg text-white">{todayCompleted.length}</p>
            <p className="text-blue-200 text-xs">今日完成</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <Truck className="w-4 h-4 text-orange-300 mx-auto mb-1" />
            <p className="font-black text-lg text-white">{activeTasks.length}</p>
            <p className="text-blue-200 text-xs">進行中</p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 text-center">
            <DollarSign className="w-4 h-4 text-yellow-300 mx-auto mb-1" />
            <p className="font-black text-base text-white">
              {todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : "—"}
            </p>
            <p className="text-blue-200 text-xs">今日收入</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 gap-3">
        <Link href="/driver/grab">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all shadow-lg shadow-orange-500/30">
            <div className="bg-white/20 p-3 rounded-xl shrink-0">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-lg">搶單中心</p>
              <p className="text-orange-100 text-sm">查看待接訂單，主動出擊搶先接單</p>
            </div>
            <div className="bg-white/20 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
        <Link href="/driver/tasks">
          <div className="bg-slate-700 hover:bg-slate-800 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all">
            <div className="bg-white/10 p-3 rounded-xl shrink-0">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-lg">我的任務</p>
              <p className="text-slate-300 text-sm">
                {activeTasks.length > 0 ? `${activeTasks.length} 筆任務進行中` : "查看指派的派車任務"}
              </p>
            </div>
            <div className="bg-white/10 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
