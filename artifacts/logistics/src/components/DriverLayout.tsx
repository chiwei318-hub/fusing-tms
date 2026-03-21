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
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <header className="bg-primary text-primary-foreground sticky top-0 z-30 shadow-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <div className="bg-white/20 p-1.5 rounded-lg">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-sm">富詠運輸</p>
            <p className="text-xs opacity-75">司機作業系統</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-5">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30">
        <div className="max-w-lg mx-auto flex">
          {navItems.map((item) => {
            const active = item.exact
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");
            const isHome = item.href === "/";
            return (
              <Link key={item.href} href={item.href} className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors
                ${isHome ? "text-orange-500 hover:text-orange-600" : active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <item.icon className={`w-5 h-5 ${isHome ? "text-orange-500" : active ? "text-primary" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
