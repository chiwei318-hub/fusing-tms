import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Building2, LayoutDashboard, FileText, Zap, UserCircle, LogOut, ChevronRight, Bell, Users, ShoppingCart } from "lucide-react";

export type EnterpriseSubAccountInfo = {
  id: number;
  name: string;
  subCode: string;
  role: string;
  email?: string | null;
  phone?: string | null;
};

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
  subAccount?: EnterpriseSubAccountInfo | null;
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function EnterpriseLayout({ children, session }: { children: React.ReactNode; session: EnterpriseSession }) {
  const [location, navigate] = useLocation();
  const [unread, setUnread] = useState(0);

  const isAdmin = !session.subAccount || session.subAccount.role === "admin";

  useEffect(() => {
    const load = () => {
      fetch(`${BASE}/api/enterprise/${session.id}/notifications`)
        .then(r => r.json())
        .then(d => setUnread(d.unread ?? 0))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [session.id]);

  const navItems = [
    { href: "/enterprise", icon: LayoutDashboard, label: "總覽", exact: true, badge: 0 },
    { href: "/enterprise/place-order", icon: ShoppingCart, label: "快速下單", exact: false, badge: 0 },
    { href: "/enterprise/orders", icon: FileText, label: "訂單記錄", exact: false, badge: 0 },
    ...(isAdmin ? [{ href: "/enterprise/sub-accounts", icon: Users, label: "子帳號", exact: false, badge: 0 }] : []),
    { href: "/enterprise/notifications", icon: Bell, label: "通知", exact: false, badge: unread },
    { href: "/enterprise/account", icon: UserCircle, label: "帳戶設定", exact: false, badge: 0 },
  ];

  function logout() {
    clearEnterpriseSession();
    navigate("/enterprise/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="bg-[#0d2d6e] text-white flex flex-col w-full md:w-60 md:min-h-screen md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] shrink-0">
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
          {session.subAccount && (
            <div className="mt-2.5 flex items-center gap-1.5 bg-white/10 text-white/80 text-xs font-medium px-2.5 py-1 rounded-full w-fit">
              <UserCircle className="w-3 h-3" />
              {session.subAccount.name}（{session.subAccount.role === "admin" ? "主管" : "採購"}）
            </div>
          )}
          {session.priorityDispatch && (
            <div className="mt-2 flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs font-semibold px-2.5 py-1 rounded-full w-fit">
              <Zap className="w-3 h-3" />
              優先派車客戶
            </div>
          )}
        </div>

        <nav className="flex md:flex-col overflow-x-auto md:overflow-x-visible md:flex-1 md:p-3 md:gap-1 px-2 py-2 gap-1">
          {navItems.map(({ href, icon: Icon, label, exact, badge }) => {
            const active = exact ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0 relative
                  ${active ? "bg-white/20 text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{label}</span>
                <span className="md:hidden">{label}</span>
                {badge > 0 ? (
                  <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full px-1 hidden md:flex">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : active ? (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto hidden md:block" />
                ) : null}
                {badge > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full md:hidden" />
                )}
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

      <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
