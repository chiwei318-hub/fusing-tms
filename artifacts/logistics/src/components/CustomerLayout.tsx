import { Link, useLocation } from "wouter";
import { Truck, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isHome = location === "/customer" || location === "/customer/";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <header className="bg-white border-b shadow-sm sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          {isHome ? (
            <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2" title="回首頁功能表">
              <Link href="/">
                <Home className="w-4 h-4 text-muted-foreground" />
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2">
              <Link href="/customer">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
          )}
          <div className="flex items-center gap-2.5 flex-1">
            <div className="bg-primary p-1.5 rounded-lg">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-bold text-sm text-foreground">富詠運輸</p>
              <p className="text-xs text-muted-foreground">客戶服務</p>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground border-t bg-white">
        © 富詠運輸股份有限公司 · 客服專線：0800-XXX-XXX
      </footer>
    </div>
  );
}
