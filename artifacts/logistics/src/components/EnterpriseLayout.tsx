import { Link, useLocation } from "wouter";
import { Building2, LayoutDashboard, FileText, Zap, UserCircle, LogOut, ChevronRight } from "lucide-react";

export type EnterpriseSession = {
  id: number;
  companyName: string;
  accountCode: string;
  contactPerson: string;
  phone: string;
  billingType: string;
  creditLimit: number;
  discountPercent: number;
  priorityDispatch: boolean;
  exclusiveNote: string | null;
  status: string;
};

export function getEnterpriseSession(): EnterpriseSession | null {
  try {
    const raw = localStorage.getItem("enterprise-session");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setEnterpriseSession(session: EnterpriseSession) {
  localStorage.setItem("enterprise-session", JSON.stringify(session));
}

export function clearEnterpriseSession() {
  localStorage.removeItem("enterprise-session");
}

const navItems = [
  { href: "/enterprise", icon: LayoutDashboard, label: "總覽", exact: true },
  { href: "/enterprise/quick-order", icon: Zap, label: "快速下單" },
  { href: "/enterprise/orders", icon: FileText, label: "對帳報表" },
  { href: "/enterprise/account", icon: UserCircle, label: "帳戶設定" },
];

export function EnterpriseLayout({ children, session }: { children: React.ReactNode; session: EnterpriseSession }) {
  const [location, navigate] = useLocation();

  function logout() {
    clearEnterpriseSession();
    navigate("/enterprise/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar on desktop / top bar on mobile */}
      <aside className="bg-[#0d2d6e] text-white flex flex-col w-full md:w-60 md:min-h-screen md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] shrink-0">
        {/* Company info */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/30">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm leading-tight truncate">{session.companyName}</p>
              <p className="text-blue-300 text-xs mt-0.5">{session.accountCode}</p>
            </div>
          </div>
          {session.priorityDispatch && (
            <div className="mt-3 flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs font-semibold px-2.5 py-1 rounded-full w-fit">
              <Zap className="w-3 h-3" />
              優先派車客戶
            </div>
          )}
        </div>

        {/* Mobile nav (horizontal) / Desktop nav (vertical) */}
        <nav className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:flex-1 md:p-3 md:gap-1 px-2 py-2 gap-1">
          {navItems.map(({ href, icon: Icon, label, exact }) => {
            const active = exact ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0
                  ${active ? "bg-white/20 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{label}</span>
                <span className="md:hidden">{label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto hidden md:block" />}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block p-3 border-t border-white/10">
          <button onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-white/50 hover:text-white hover:bg-white/10 rounded-xl text-sm font-medium transition-all">
            <LogOut className="w-4 h-4" />
            登出
          </button>
          <Link href="/">
            <span className="block text-center text-xs text-white/30 hover:text-white/50 mt-2 transition-colors cursor-pointer">
              回首頁
            </span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
