import { Link, useLocation } from "wouter";
import { Truck, ClipboardList, Home, LayoutGrid } from "lucide-react";

export function DriverLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/driver", icon: Home, label: "首頁", exact: true },
    { href: "/driver/tasks", icon: ClipboardList, label: "任務", exact: false },
    { href: "/", icon: LayoutGrid, label: "功能表", exact: true },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16 md:pb-0 md:flex-row">
      {/* Top header on mobile / Left sidebar on desktop */}
      <header className="bg-primary text-primary-foreground sticky top-14 z-30 shadow-md md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] md:w-56 md:flex md:flex-col md:shadow-xl md:shrink-0">
        <div className="max-w-xl mx-auto md:mx-0 px-4 md:px-5 h-14 md:h-auto md:pt-6 md:pb-4 flex items-center gap-3 border-b border-white/10">
          <div className="bg-white/20 p-1.5 rounded-lg shrink-0">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-sm">富詠運輸</p>
            <p className="text-xs opacity-75 hidden sm:block">司機作業系統</p>
          </div>
        </div>

        {/* Desktop nav items */}
        <nav className="hidden md:flex md:flex-col md:flex-1 md:p-3 md:gap-1 md:mt-2">
          {navItems.map((item) => {
            const active = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            const isMenuLink = item.href === "/";
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm transition-all
                  ${isMenuLink ? "text-orange-300 hover:bg-white/10" : active ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block md:p-4 md:border-t md:border-white/10 md:text-xs md:text-white/40 md:text-center">
          © 富詠運輸
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto md:mx-0 md:max-w-none px-4 sm:px-6 md:px-8 py-5 md:py-8 md:overflow-y-auto">
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
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors
                  ${isMenuLink ? "text-orange-500 hover:text-orange-600" : active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <item.icon className={`w-5 h-5 ${isMenuLink ? "text-orange-500" : active ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
