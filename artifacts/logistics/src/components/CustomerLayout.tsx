import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Home, Users, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const isHome = location === "/customer" || location === "/customer/";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch(`/api/customer-notifications/${user.id}`);
        const data = await res.json();
        setUnread(data.unread ?? 0);
      } catch { /* silent */ }
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    return () => clearInterval(iv);
  }, [user?.id]);

  return (
    <div className="h-full bg-gradient-to-b from-blue-50 to-white flex flex-col overflow-hidden">
      <header className="bg-white border-b shadow-sm shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-12 flex items-center gap-3">
          {isHome ? (
            <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2 w-9 h-9" title="回首頁功能表">
              <Link href="/">
                <Home className="w-4 h-4 text-muted-foreground" />
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2 w-9 h-9">
              <Link href="/customer">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
          )}
          <div className="flex items-center gap-2 flex-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">客戶服務</span>
          </div>
          <Link href="/customer/notifications">
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors" title="通知">
              <Bell className="w-4.5 h-4.5 text-muted-foreground" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </Link>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}
