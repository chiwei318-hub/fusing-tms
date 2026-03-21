import { Link, useLocation } from "wouter";
import { Package, Truck, LayoutDashboard, DollarSign, ClipboardList, Home } from "lucide-react";
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
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  { name: "客戶下單", href: "/order-form", icon: Package },
  { name: "訂單列表", href: "/orders", icon: ClipboardList },
  { name: "費用管理", href: "/fees", icon: DollarSign },
  { name: "後台管理", href: "/admin", icon: LayoutDashboard },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        {/* Brand Header */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-xl shadow-lg shadow-blue-500/30">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight text-sidebar-foreground tracking-wide">
                富詠運輸
              </h1>
              <p className="text-xs text-sidebar-foreground/50 mt-0.5">派車管理系統</p>
            </div>
          </div>
        </div>

        <SidebarGroup className="mt-3">
          <SidebarGroupLabel className="text-xs uppercase tracking-widest text-sidebar-foreground/40 font-semibold px-4 mb-1">
            功能選單
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors"
                      >
                        <item.icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Footer — back to landing */}
        <div className="mt-auto border-t border-sidebar-border">
          <SidebarMenu className="px-2 py-2">
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="回首頁功能表">
                <Link href="/" className="flex items-center gap-3 px-4 py-2.5 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
                  <Home className="w-4 h-4" />
                  <span className="font-medium text-sm">回首頁功能表</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <p className="text-xs text-sidebar-foreground/30 text-center pb-3">
            © 富詠運輸股份有限公司
          </p>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center gap-4 px-4 md:px-6 bg-card border-b sticky top-0 z-30 shadow-sm">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary md:hidden" />
              <span className="font-semibold text-sm text-foreground md:hidden">富詠運輸</span>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
