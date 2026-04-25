import { Link, useLocation } from "wouter";
import {
  Package,
  LayoutDashboard,
  DollarSign,
  ClipboardList,
  Home,
  BarChart2,
  Fuel,
} from "lucide-react";
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
  { name: "客戶下單",  href: "/order-form",   icon: Package },
  { name: "訂單列表",  href: "/orders",        icon: ClipboardList },
  { name: "訂單報表",  href: "/report",        icon: BarChart2 },
  { name: "費用管理",  href: "/fees",          icon: DollarSign },
  { name: "⛽ 加油管理", href: "/fuel-cards",  icon: Fuel },
  { name: "後台管理",  href: "/admin",         icon: LayoutDashboard },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      {/* pt-11 offsets the fixed GlobalHeader */}
      <SidebarContent className="pt-11">
        <SidebarGroup className="mt-3">
          <SidebarGroupLabel className="text-xs uppercase tracking-wide text-sidebar-foreground/40 font-semibold px-3 mb-1">
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
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                    >
                      <Link
                        href={item.href}
                        className="flex items-center gap-2 px-3 py-2 transition-colors"
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
                <Link
                  href="/"
                  className="flex items-center gap-2 px-3 py-2 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                >
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
    "--sidebar-width": "9.5rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={{ ...style, minHeight: 0, height: "100%" }}>
      <div className="flex h-full w-full bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-12 flex items-center gap-3 px-4 md:px-6 bg-card border-b shrink-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <span className="text-sm font-semibold text-foreground hidden md:block">
              後台管理
            </span>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
