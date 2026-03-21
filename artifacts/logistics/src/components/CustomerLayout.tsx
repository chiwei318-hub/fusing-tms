import { Link, useLocation } from "wouter";
import { ArrowLeft, Home, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isHome = location === "/customer" || location === "/customer/";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <header className="bg-white border-b shadow-sm sticky top-14 z-30">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
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
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground border-t bg-white">
        © 富詠運輸股份有限公司 · 客服專線：0800-XXX-XXX
      </footer>
    </div>
  );
}
