import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Truck, ArrowRight, User, CheckCircle, DollarSign, LogIn, Zap } from "lucide-react";
import { useDriversData } from "@/hooks/use-drivers";
import { useListOrders } from "@workspace/api-client-react";
import { DriverStatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/use-mobile";
import { isToday } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function DriverHome() {
  const { data: drivers, isLoading } = useDriversData();
  const [selectedId, setSelectedId] = useLocalStorage<number | null>("driver-session-id", null);
  const selectedDriver = drivers?.find(d => d.id === selectedId);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const prevSelectedId = useRef<number | null>(selectedId);

  const { data: myOrders } = useListOrders(
    selectedId ? { driverId: selectedId } as any : undefined,
    { query: { enabled: !!selectedId } }
  );

  const todayCompleted = myOrders?.filter(o =>
    o.status === "delivered" && isToday(new Date(o.updatedAt))
  ) ?? [];

  const todayEarnings = todayCompleted.reduce((sum, o) => sum + (o.totalFee ?? 0), 0);
  const activeTasks = myOrders?.filter(o => o.status === "assigned" || o.status === "in_transit") ?? [];

  const handleSelectDriver = (id: number) => {
    const isNew = id !== prevSelectedId.current;
    setSelectedId(id);
    prevSelectedId.current = id;
    if (isNew) {
      const driver = drivers?.find(d => d.id === id);
      toast({ title: `已切換帳號：${driver?.name ?? ""}`, description: "即將前往搶單中心" });
      setTimeout(() => navigate("/driver/grab"), 900);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        {selectedDriver ? (
          <>
            <p className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-1">已登入</p>
            <h1 className="text-2xl font-black text-foreground">歡迎回來，{selectedDriver.name}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{selectedDriver.vehicleType} · {selectedDriver.licensePlate}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-foreground">司機入口</h1>
            <p className="text-muted-foreground text-sm mt-1">選擇您的帳號開始接單</p>
          </>
        )}
      </div>

      {/* Logged-in driver stats card */}
      {selectedDriver && (
        <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/5 rounded-full -mr-8 -mt-8" />
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-orange-500/20 rounded-full -ml-4 -mb-4" />
          <div className="relative z-10 flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white font-black text-xl shrink-0">
              {selectedDriver.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <DriverStatusBadge status={selectedDriver.status} />
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
                {todayEarnings > 0 ? `$${todayEarnings.toLocaleString()}` : todayCompleted.length > 0 ? "$0" : "—"}
              </p>
              <p className="text-blue-200 text-xs">今日收入</p>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {selectedDriver && (
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
      )}

      {/* Driver selection list */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <LogIn className="w-3.5 h-3.5" />
          {selectedDriver ? "切換帳號" : "選擇您的帳號"}
        </p>
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-2xl" />
            ))
          ) : drivers?.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border">
              <User className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm text-muted-foreground">尚無司機資料</p>
              <p className="text-xs text-muted-foreground mt-1">請聯繫後台管理員新增</p>
            </div>
          ) : (
            drivers?.map(driver => {
              const isSelected = driver.id === selectedId;
              return (
                <div
                  key={driver.id}
                  onClick={() => handleSelectDriver(driver.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98]
                    ${isSelected
                      ? "border-blue-600 bg-blue-50 shadow-md shadow-blue-600/10"
                      : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm"}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-base shrink-0
                    ${isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                    {driver.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground">{driver.name}</p>
                      <DriverStatusBadge status={driver.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {driver.vehicleType} · {driver.licensePlate}
                    </p>
                  </div>
                  {isSelected ? (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
