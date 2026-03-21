import { useState } from "react";
import { Link } from "wouter";
import {
  Package, Search, ArrowRight, Truck, Clock, CheckCircle, Phone,
  User, Lock, LogIn, LogOut, Star, Shield, Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

interface CustomerSession {
  id: number;
  name: string;
  phone: string;
  username: string | null;
}

function LoginForm({ onLogin }: { onLogin: (s: CustomerSession) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/customers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setError(msg ?? "登入失敗");
        return;
      }
      const customer = await res.json();
      onLogin(customer);
      toast({ title: `歡迎回來，${customer.name}！` });
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-primary/10 p-2 rounded-lg">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-bold text-sm">客戶登入</p>
            <p className="text-xs text-muted-foreground">登入後快速下單與查詢</p>
          </div>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">電話號碼</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0912-345-678"
                className="h-11 pl-9"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="h-11 pl-9"
                required
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}
          <Button type="submit" className="w-full h-11 gap-2" disabled={loading}>
            <LogIn className="w-4 h-4" />
            {loading ? "登入中..." : "登入"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            尚無帳號？請聯絡客服 <a href="tel:0800000000" className="text-primary underline">申請帳號</a>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CustomerHome() {
  const [session, setSession] = useLocalStorage<CustomerSession | null>("customer-session", null);
  const handleLogout = () => setSession(null);

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
          {session ? (
            <>
              <p className="text-blue-200 text-sm">親愛的</p>
              <h1 className="text-2xl font-black leading-tight">{session.name} 您好 👋</h1>
              <p className="text-blue-200 text-sm mt-1">歡迎使用富詠運輸物流平台</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black leading-tight">快速、安全<br />的物流服務</h1>
              <p className="text-blue-200 text-sm mt-2">24小時全台配送，準時到達</p>
            </>
          )}
        </div>
      </div>

      {/* Login card or greeting */}
      {session ? (
        <div className="flex items-center justify-between bg-white border rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center font-black text-primary">
              {session.name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-sm">{session.name}</p>
              <p className="text-xs text-muted-foreground">{session.phone}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-destructive transition-colors">
            <LogOut className="w-3.5 h-3.5" /> 登出
          </button>
        </div>
      ) : (
        <LoginForm onLogin={setSession} />
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
