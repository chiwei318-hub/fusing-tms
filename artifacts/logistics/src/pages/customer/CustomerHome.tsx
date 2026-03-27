import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Package, Search, ArrowRight, Truck, Clock, CheckCircle,
  Phone, LogOut, Star, Shield, Zap, Bell, MessageSquare,
  ChevronRight, AlertCircle, Navigation, MapPin, FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrl } from "@/lib/api";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Truck }> = {
  pending:    { label: "待派車", color: "bg-yellow-100 text-yellow-700",   icon: Clock },
  assigned:   { label: "已派車", color: "bg-blue-100 text-blue-700",       icon: Truck },
  in_transit: { label: "運送中", color: "bg-orange-100 text-orange-700",   icon: Navigation },
  delivered:  { label: "已完成", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled:  { label: "已取消", color: "bg-gray-100 text-gray-500",       icon: AlertCircle },
};

export default function CustomerHome() {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [trackInput, setTrackInput] = useState("");

  useEffect(() => {
    if (!user?.phone) return;
    setLoadingOrders(true);
    fetch(apiUrl(`/orders?phone=${encodeURIComponent(user.phone)}`))
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data ?? []);
        setOrders(list.slice(0, 6));
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
  const completedOrders = orders.filter(o => o.status === "delivered");

  return (
    <div className="space-y-5 pb-4">
      {/* Hero Banner */}
      <div className="rounded-2xl p-5 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(140deg, #071829 0%, #0c2444 55%, #0f2d58 100%)" }}>
        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        {/* Glow */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(217,119,6,0.10) 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#fbbf24" }} />
                <span className="text-xs font-semibold tracking-wider" style={{ color: "#fcd34d" }}>富詠運輸</span>
              </div>
              <p className="text-slate-300 text-sm">親愛的客戶</p>
              <h1 className="text-2xl font-black leading-tight text-white">{user?.name ?? user?.phone ?? ""} 您好</h1>
              <p className="text-slate-400 text-xs mt-1">歡迎使用富詠運輸物流平台</p>
            </div>
            <button onClick={logout} className="text-slate-400 text-xs flex items-center gap-1 hover:text-white transition-colors mt-1 shrink-0">
              <LogOut className="w-3 h-3" /> 登出
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white/8 border border-white/10 rounded-xl p-2.5 text-center">
              <p className="font-black text-lg text-white">{orders.length}</p>
              <p className="text-slate-400 text-[10px]">歷史訂單</p>
            </div>
            <div className="bg-white/8 border border-white/10 rounded-xl p-2.5 text-center">
              <p className="font-black text-lg" style={{ color: "#fbbf24" }}>{hasActive ? activeOrders.length : 0}</p>
              <p className="text-slate-400 text-[10px]">進行中</p>
            </div>
            <div className="bg-white/8 border border-white/10 rounded-xl p-2.5 text-center">
              <p className="font-black text-lg text-emerald-300">{completedOrders.length}</p>
              <p className="text-slate-400 text-[10px]">已完成</p>
            </div>
          </div>
        </div>
      </div>

      {/* Active order alert */}
      {hasActive && (
        <Link href="/customer/track">
          <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-orange-100 transition-colors shadow-sm">
            <div className="relative shrink-0">
              <div className="w-11 h-11 bg-orange-500 rounded-full flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-orange-800 text-sm">
                {activeOrders.length} 筆訂單{activeOrders.some(o => o.status === "in_transit") ? "運送中" : "已派車"}！
              </p>
              <p className="text-orange-600 text-xs truncate mt-0.5">
                {activeOrders[0]?.pickupAddress ?? ""} → {activeOrders[0]?.deliveryAddress ?? ""}
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <span className="text-xs font-bold text-orange-600">即時追蹤</span>
              <ChevronRight className="w-4 h-4 text-orange-500" />
            </div>
          </div>
        </Link>
      )}

      {/* Quick track search */}
      <div className="bg-card border rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">快速查詢訂單</p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={trackInput}
              onChange={e => setTrackInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && trackInput && window.location.assign(`/customer/track?q=${encodeURIComponent(trackInput)}`)}
              placeholder="輸入電話或訂單號碼"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
            />
          </div>
          <Link href={`/customer/track${trackInput ? `?q=${encodeURIComponent(trackInput)}` : ""}`}>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0">
              查詢
            </button>
          </Link>
        </div>
      </div>

      {/* Main CTAs */}
      <div className="space-y-2.5">
        <Link href="/customer/order">
          <div className="active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all shadow-lg"
            style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 8px 24px rgba(217,119,6,0.3)" }}>
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
                <MapPin className="w-6 h-6 text-blue-600" />
              </div>
              <p className="font-bold text-xs text-center text-foreground">即時追蹤</p>
            </div>
          </Link>
          <Link href="/chat">
            <div className="bg-card border-2 border-violet-100 hover:border-violet-300 active:scale-[0.98] rounded-2xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-all shadow-sm">
              <div className="bg-violet-50 p-2.5 rounded-xl">
                <MessageSquare className="w-6 h-6 text-violet-600" />
              </div>
              <p className="font-bold text-xs text-center text-foreground">AI 下單</p>
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
              <p className="font-bold text-xs text-center text-foreground">通知{unread > 0 ? `(${unread})` : ""}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-bold text-foreground">最近訂單</p>
          </div>
          <Link href="/customer/track">
            <span className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-0.5">
              查看全部 <ChevronRight className="w-3 h-3" />
            </span>
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
            <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Package className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <p className="font-bold text-muted-foreground text-sm">尚無訂單記錄</p>
            <p className="text-xs text-muted-foreground mt-1">立即下單體驗富詠運輸服務</p>
            <Link href="/customer/order">
              <div className="mt-4 inline-flex items-center gap-2 bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-xl">
                <Package className="w-3.5 h-3.5" /> 立即下單
              </div>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((o: any) => {
              const meta = STATUS_META[o.status ?? "pending"] ?? STATUS_META.pending;
              const Icon = meta.icon;
              const isActive = o.status === "in_transit" || o.status === "assigned";
              return (
                <Link key={o.id} href="/customer/track">
                  <div className={`bg-card border rounded-xl p-3.5 flex items-center gap-3 cursor-pointer transition-colors
                    ${isActive ? "border-orange-200 bg-orange-50/40 dark:bg-orange-950/10 hover:bg-orange-50/70" : "hover:bg-muted/30"}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0
                      ${isActive ? "bg-orange-100" : "bg-muted"}`}>
                      <Icon className={`w-4.5 h-4.5 ${isActive ? "text-orange-600" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {o.pickupAddress ?? o.pickup_address ?? "—"}
                        <span className="text-muted-foreground mx-1">→</span>
                        {o.deliveryAddress ?? o.delivery_address ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        #{o.id} · {o.cargoDescription ?? o.cargo_description ?? "—"} ·{" "}
                        {o.createdAt ? format(new Date(o.createdAt), "M/dd HH:mm", { locale: zhTW }) : ""}
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
          { icon: Zap, label: "快速派車", sub: "最快30分鐘", color: "text-orange-500 bg-orange-50 border-orange-100" },
          { icon: Shield, label: "安全保障", sub: "全程保險", color: "text-blue-600 bg-blue-50 border-blue-100" },
          { icon: Star, label: "4.9 評分", sub: "精英車隊", color: "text-amber-500 bg-amber-50 border-amber-100" },
        ].map(s => {
          const [textCls, bgCls, borderCls] = s.color.split(" ");
          return (
            <div key={s.label} className={`rounded-xl p-3 text-center border ${bgCls} ${borderCls}`}>
              <s.icon className={`w-5 h-5 mx-auto mb-1 ${textCls}`} />
              <p className="text-xs font-bold text-foreground">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Contact */}
      <div className="bg-card rounded-2xl p-4 flex items-center gap-3 border shadow-sm">
        <div className="bg-blue-100 p-2.5 rounded-xl shrink-0">
          <Phone className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">客服專線</p>
          <p className="text-muted-foreground text-xs">週一至週六 08:00–20:00</p>
        </div>
        <a href="tel:0800000000" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shrink-0">
          聯絡我們
        </a>
      </div>
    </div>
  );
}
