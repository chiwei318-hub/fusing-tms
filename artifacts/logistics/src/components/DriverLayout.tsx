import { Link, useLocation } from "wouter";
import { Truck, ClipboardList, Home, LayoutGrid, Zap, DollarSign } from "lucide-react";
import { useListOrders } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export function DriverLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();

  const { data: pendingOrders } = useListOrders(
    { status: "pending" } as any,
    { query: { refetchInterval: 12000, select: (data: any[]) => data?.filter((o: any) => o.status === "pending" && o.driverId == null) } }
  );
  const pendingCount = pendingOrders?.length ?? 0;

  const { data: myOrders } = useListOrders(
    user?.id ? { driverId: user.id } as any : undefined,
    { query: { enabled: !!user?.id, refetchInterval: 15000,
        select: (data: any[]) => data?.filter((o: any) => o.status === "assigned" || o.status === "in_transit") } }
  );
  const activeTaskCount = myOrders?.length ?? 0;

  const navItems = [
    { href: "/driver", icon: Home, label: "首頁", exact: true },
    { href: "/driver/grab", icon: Zap, label: "搶單", exact: false },
    { href: "/driver/tasks", icon: ClipboardList, label: "任務", exact: false },
    { href: "/driver/income", icon: DollarSign, label: "收入", exact: false },
    { href: "/", icon: LayoutGrid, label: "功能表", exact: true },
  ];

  return (
    <div className="h-full bg-slate-50 flex flex-col overflow-hidden pb-16 md:pb-0 md:flex-row">
      {/* Mobile top bar / Desktop left sidebar */}
      <header className="bg-primary text-primary-foreground shrink-0 z-30 shadow-md md:h-full md:w-52 md:flex md:flex-col md:shadow-xl">

        {/* Mobile: compact top bar */}
        <div className="flex items-center gap-2 px-4 h-10 md:hidden border-b border-white/10">
          <Truck className="w-4 h-4 opacity-70" />
          <span className="text-sm font-semibold opacity-90">司機作業系統</span>
          {pendingCount > 0 && (
            <span className="ml-auto bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {pendingCount}
            </span>
          )}
        </div>

        {/* Desktop: nav label */}
        <div className="hidden md:block px-5 pt-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">司機作業系統</p>
        </div>

        {/* Desktop nav items */}
        <nav className="hidden md:flex md:flex-col md:flex-1 md:p-3 md:gap-1">
          {navItems.map((item) => {
            const active = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            const isMenuLink = item.href === "/";
            const isGrab = item.href === "/driver/grab";
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm transition-all
                  ${isMenuLink ? "text-orange-300 hover:bg-white/10"
                  : isGrab ? active ? "bg-orange-500 text-white" : "text-orange-300 hover:bg-orange-500/20 hover:text-orange-200"
                  : active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
                {isGrab && pendingCount > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                    {pendingCount}
                  </span>
                )}
                {isGrab && pendingCount === 0 && (
                  <span className="ml-auto text-[10px] font-black bg-orange-500/30 text-orange-200 px-1.5 py-0.5 rounded-full">搶</span>
                )}
                {item.href === "/driver/tasks" && activeTaskCount > 0 && (
                  <span className="ml-auto bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                    {activeTaskCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block md:p-4 md:border-t md:border-white/10 md:text-xs md:text-white/40 md:text-center">
          © 富詠運輸
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full px-4 sm:px-6 md:px-8 py-5 md:py-8">
        <div className="max-w-2xl md:max-w-3xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30 md:hidden">
        <div className="max-w-xl mx-auto flex">
          {navItems.map((item) => {
            const active = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            const isMenuLink = item.href === "/";
            const isGrab = item.href === "/driver/grab";
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors relative
                  ${isMenuLink ? "text-orange-500 hover:text-orange-600"
                  : isGrab ? active ? "text-orange-500" : "text-orange-400 hover:text-orange-500"
                  : active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <div className="relative">
                  <item.icon className={`w-5 h-5 ${isMenuLink || isGrab ? "text-orange-500" : active ? "text-primary" : ""}`} />
                  {isGrab && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-orange-500 text-white text-[9px] font-black px-1 py-px rounded-full min-w-[14px] text-center leading-tight">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                  {item.href === "/driver/tasks" && activeTaskCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-green-500 text-white text-[9px] font-black px-1 py-px rounded-full min-w-[14px] text-center leading-tight">
                      {activeTaskCount > 9 ? "9+" : activeTaskCount}
                    </span>
                  )}
                </div>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
