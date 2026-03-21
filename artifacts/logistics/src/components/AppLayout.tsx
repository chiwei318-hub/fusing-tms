import { Link, useLocation } from "wouter";
import { Package, Truck, LayoutDashboard, Menu } from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { name: "客戶下單", href: "/order-form", icon: Package },
  { name: "訂單列表", href: "/orders", icon: Menu },
  { name: "後台管理", href: "/admin", icon: LayoutDashboard },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <div className="p-6 flex items-center gap-3 border-b">
          <div className="bg-primary/10 p-2 rounded-xl">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <h1 className="font-display font-bold text-lg text-foreground">
            物流派車系統
          </h1>
        </div>
        
        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-4 mb-2">
            主選單
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href || (location.startsWith(item.href) && item.href !== '/');
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link href={item.href} className="flex items-center gap-3 px-4 py-2 transition-colors">
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex min-h-screen w-full bg-slate-50 dark:bg-slate-950">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <header className="h-16 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
