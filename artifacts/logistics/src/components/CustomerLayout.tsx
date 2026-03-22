import { Link, useLocation } from "wouter";
import { ArrowLeft, Home, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isHome = location === "/customer" || location === "/customer/";

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
        </div>
      </header>
      <main className="flex-1 overflow-y-auto w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        {children}
      </main>
    </div>
  );
}
