import { Link } from "wouter";
import {
  Package, Search, ArrowRight, Truck, Clock, CheckCircle, Phone,
  LogOut, Star, Shield, Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function CustomerHome() {
  const { user, logout } = useAuth();

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
          <p className="text-blue-200 text-sm">親愛的</p>
          <h1 className="text-2xl font-black leading-tight">{user?.name ?? ""} 您好 👋</h1>
          <p className="text-blue-200 text-sm mt-1">歡迎使用富詠運輸物流平台</p>
        </div>
      </div>

      {/* User card */}
      <div className="flex items-center justify-between bg-white border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-black text-primary">
            {(user?.name ?? "?").charAt(0)}
          </div>
          <div>
            <p className="font-bold text-sm">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.phone}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-destructive transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> 登出
        </button>
      </div>

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

        <Link href="/customer/track">
          <div className="bg-white border-2 border-blue-100 hover:border-blue-300 active:scale-[0.98] rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all shadow-sm">
            <div className="bg-blue-50 p-3 rounded-xl shrink-0">
              <Search className="w-7 h-7 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-black text-gray-900 text-xl">查詢訂單</p>
              <p className="text-gray-500 text-sm mt-0.5">輸入電話或單號查看狀態</p>
            </div>
            <div className="bg-blue-600 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </div>
        </Link>
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
            <p className="text-xs font-bold text-gray-800">{s.label}</p>
            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Service steps */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">服務流程</p>
        <div className="relative">
          <div className="absolute left-6 top-8 bottom-8 w-px bg-gradient-to-b from-orange-400 via-blue-400 to-green-400 opacity-30" />
          <div className="space-y-1">
            {[
              { icon: Package, label: "填寫下單表單", sub: "取送地址與貨物資訊", color: "bg-orange-500", num: "1" },
              { icon: Truck, label: "系統指派司機", sub: "即時派車通知確認", color: "bg-blue-600", num: "2" },
              { icon: Clock, label: "追蹤運送狀態", sub: "隨時查詢訂單進度", color: "bg-amber-500", num: "3" },
              { icon: CheckCircle, label: "簽收確認付款", sub: "完成配送回報付款", color: "bg-emerald-500", num: "4" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-white rounded-xl border border-gray-100 relative">
                <div className={`${step.color} w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-black text-sm shadow-sm z-10`}>
                  {step.num}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{step.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{step.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3 border border-gray-100">
        <div className="bg-blue-100 p-2.5 rounded-xl shrink-0">
          <Phone className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 text-sm">客服專線</p>
          <p className="text-gray-500 text-xs">週一至週六 08:00–20:00</p>
        </div>
        <a href="tel:0800000000" className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
          聯絡我們
        </a>
      </div>
    </div>
  );
}
