import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Package, Search, ArrowRight, Truck, Clock, CheckCircle,
  Phone, LogOut, Star, Shield, Zap, Bell, MessageSquare,
  ChevronRight, AlertCircle, Navigation,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrl } from "@/lib/api";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

const STATUS_META: Record<string, { label: string; color: string; dot: string; icon: typeof Truck }> = {
  pending:    { label: "待派車", color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-400", icon: Clock },
  assigned:   { label: "已派車", color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   icon: Truck },
  in_transit: { label: "運送中", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500", icon: Navigation },
  delivered:  { label: "已完成", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", icon: CheckCircle },
  cancelled:  { label: "已取消", color: "bg-gray-100 text-gray-500",   dot: "bg-gray-400",   icon: AlertCircle },
};

export default function CustomerHome() {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (!user?.phone) return;
    setLoadingOrders(true);
    fetch(apiUrl(`/orders?phone=${encodeURIComponent(user.phone)}`))
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data ?? []);
        setOrders(list.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
  }, [user?.phone]);

  useEffect(() => {
    if (!user?.id) return;
    fetch(apiUrl(`/customer-notifications/${user.id}`))
      .then(r => r.json())
      .then(d => setUnread(d.unread ?? 0))
      .catch(() => {});
  }, [user?.id]);

  const activeOrders = orders.filter(o => o.status === "in_transit" || o.status === "assigned");
  const hasActive = activeOrders.length > 0;

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-orange-500/20 rounded-full -ml-6 -mb-6" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-5 h-5 text-orange-400" />
            <span className="text-orange-300 text-xs font-semibold uppercase tracking-wide">富詠運輸</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-200 text-sm">親愛的</p>
              <h1 className="text-2xl font-black leading-tight">{user?.name ?? ""} 您好</h1>
              <p className="text-blue-200 text-sm mt-1">歡迎使用富詠運輸物流平台</p>
            </div>
            <button
              onClick={logout}
              className="text-blue-300 text-xs flex items-center gap-1 hover:text-white transition-colors mt-1"
            >
              <LogOut className="w-3 h-3" /> 登出
            </button>
          </div>
        </div>
      </div>

      {/* Active order alert */}
      {hasActive && (
        <Link href="/customer/track">
          <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-orange-100 transition-colors">
            <div className="relative">
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="font-black text-orange-800 text-sm">
                {activeOrders.length} 筆訂單運送中！
              </p>
              <p className="text-orange-600 text-xs">點擊即時追蹤位置與狀態</p>
            </div>
            <ChevronRight className="w-5 h-5 text-orange-500" />
          </div>
        </Link>
      )}

      {/* Main CTAs */}
      <div className="space-y-3">
        <Link href="/customer/order">
          <div className="bg-orange-500 hover:bg-orange-600 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all shadow-lg shadow-orange-500/30">
            <div className="bg-white/20 p-3 rounded-xl shrink-0">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-white text-xl">立即下單</p>
              <p className="text-orange-100 text-sm mt-0.5">填寫取送資訊，快速建立訂單</p>
            </div>
            <div className="bg-white/20 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-3 gap-2">
          <Link href="/customer/track">
            <div className="bg-card border-2 border-blue-100 hover:border-blue-300 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-all shadow-sm">
              <div className="bg-blue-50 p-2.5 rounded-xl">
                <Search className="w-6 h-6 text-blue-600" />
              </div>
              <p className="font-bold text-sm text-center">查詢訂單</p>
            </div>
          </Link>
          <Link href="/chat">
            <div className="bg-card border-2 border-violet-100 hover:border-violet-300 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-all shadow-sm">
              <div className="bg-violet-50 p-2.5 rounded-xl">
                <MessageSquare className="w-6 h-6 text-violet-600" />
              </div>
              <p className="font-bold text-sm text-center">AI 下單</p>
            </div>
          </Link>
          <Link href="/customer/notifications">
            <div className="bg-card border-2 border-red-100 hover:border-red-300 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-all shadow-sm relative">
              <div className="bg-red-50 p-2.5 rounded-xl relative">
                <Bell className="w-6 h-6 text-red-500" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-black px-1 py-px rounded-full min-w-[16px] text-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
              <p className="font-bold text-sm text-center">通知</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-foreground">最近訂單</p>
          <Link href="/customer/track">
            <span className="text-xs text-blue-600 font-medium hover:underline">查看全部</span>
          </Link>
        </div>

        {loadingOrders ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-card border rounded-2xl p-8 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-bold text-muted-foreground text-sm">尚無訂單記錄</p>
            <p className="text-xs text-muted-foreground mt-1">立即下單體驗富詠運輸服務</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o: any) => {
              const meta = STATUS_META[o.status ?? "pending"] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <Link key={o.id} href="/customer/track">
                  <div className="bg-card border rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center shrink-0">
                      <Icon className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {o.pickupAddress ?? o.pickup_address ?? "—"} → {o.deliveryAddress ?? o.delivery_address ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.cargoDescription ?? o.cargo_description ?? "—"} ·{" "}
                        {o.createdAt ? format(new Date(o.createdAt), "MM/dd HH:mm", { locale: zhTW }) : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                      {(o.totalFee ?? o.total_fee) != null && (
                        <span className="text-xs text-emerald-600 font-bold">
                          NT${Number(o.totalFee ?? o.total_fee).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Service highlights */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Zap, label: "快速派車", sub: "30分鐘內", color: "text-orange-500 bg-orange-50" },
          { icon: Shield, label: "安全保障", sub: "全程保險", color: "text-blue-600 bg-blue-50" },
          { icon: Star, label: "專業服務", sub: "精英車隊", color: "text-amber-500 bg-amber-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color.split(" ")[1]}`}>
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color.split(" ")[0]}`} />
            <p className="text-xs font-bold text-foreground">{s.label}</p>
            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Contact */}
      <div className="bg-card rounded-2xl p-4 flex items-center gap-3 border">
        <div className="bg-blue-100 p-2.5 rounded-xl shrink-0">
          <Phone className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground text-sm">客服專線</p>
          <p className="text-muted-foreground text-xs">週一至週六 08:00–20:00</p>
        </div>
        <a href="tel:0800000000" className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
          聯絡我們
        </a>
      </div>
    </div>
  );
}
