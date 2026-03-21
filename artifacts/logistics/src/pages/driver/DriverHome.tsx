import { Link } from "wouter";
import { Truck, ArrowRight, User } from "lucide-react";
import { useDriversData } from "@/hooks/use-drivers";
import { DriverStatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocalStorage } from "@/hooks/use-mobile";

export default function DriverHome() {
  const { data: drivers, isLoading } = useDriversData();
  const [selectedId, setSelectedId] = useLocalStorage<number | null>("driver-session-id", null);

  const selectedDriver = drivers?.find(d => d.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">司機登入</h1>
        <p className="text-muted-foreground text-sm mt-1">請選擇您的司機身份</p>
      </div>

      {selectedDriver && (
        <Card className="border-2 border-primary bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl shrink-0">
              {selectedDriver.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-bold text-foreground text-lg">{selectedDriver.name}</p>
              <p className="text-sm text-muted-foreground">{selectedDriver.vehicleType} · {selectedDriver.licensePlate}</p>
              <DriverStatusBadge status={selectedDriver.status} />
            </div>
          </CardContent>
        </Card>
      )}

      {selectedDriver && (
        <Link href="/driver/tasks">
          <div className="bg-primary rounded-2xl p-5 flex items-center gap-4 cursor-pointer shadow-lg shadow-primary/30 hover:shadow-xl transition-shadow">
            <Truck className="w-8 h-8 text-white shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-white text-lg">進入工作頁面</p>
              <p className="text-primary-foreground/70 text-sm">查看我的派車任務</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
        </Link>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {selectedDriver ? "切換身份" : "選擇您的帳號"}
        </p>
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))
          ) : drivers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">尚無司機資料，請聯繫後台管理員新增</p>
            </div>
          ) : (
            drivers?.map(driver => (
              <div
                key={driver.id}
                onClick={() => setSelectedId(driver.id)}
                className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all
                  ${driver.id === selectedId
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border bg-white hover:border-primary/50 hover:bg-muted/30"}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0
                  ${driver.id === selectedId ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                  {driver.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">{driver.name}</p>
                    <DriverStatusBadge status={driver.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{driver.vehicleType} · {driver.licensePlate}</p>
                </div>
                {driver.id === selectedId && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
