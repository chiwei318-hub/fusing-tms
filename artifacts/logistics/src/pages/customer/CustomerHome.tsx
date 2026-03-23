import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Package, Search, ArrowRight, Truck, Clock, CheckCircle, Phone,
  User, LogOut, Star, Shield, Zap, MessageSquare, RotateCcw, KeyRound,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

interface CustomerSession {
  id: number;
  name: string;
  phone: string;
  username: string | null;
}

const RESEND_COOLDOWN = 60;

function OtpLoginForm({ onLogin }: { onLogin: (s: CustomerSession) => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/customers/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "發送失敗");
        return;
      }
      setStep("otp");
      setCooldown(RESEND_COOLDOWN);
      setDevOtp(data.devOtp ?? null);
      toast({ title: "驗證碼已發送", description: `已發送至 ${phone}` });
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/customers/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "驗證失敗");
        return;
      }
      onLogin(data);
      toast({ title: `歡迎回來，${data.name}！` });
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendOtp();
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyOtp();
  };

  return (
    <Card className="border bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="bg-primary/10 p-2 rounded-lg">
            {step === "phone" ? (
              <Phone className="w-4 h-4 text-primary" />
            ) : (
              <KeyRound className="w-4 h-4 text-primary" />
            )}
          </div>
          <div>
            <p className="font-bold text-sm">
              {step === "phone" ? "客戶登入" : "輸入驗證碼"}
            </p>
            <p className="text-xs text-muted-foreground">
              {step === "phone"
                ? "以手機簡訊驗證身份登入"
                : `驗證碼已發送至 ${phone}`}
            </p>
          </div>
          {step === "otp" && (
            <button
              className="ml-auto text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => { setStep("phone"); setOtp(""); setError(""); setDevOtp(null); }}
            >
              <RotateCcw className="w-3 h-3" /> 換號碼
            </button>
          )}
        </div>

        {step === "phone" ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">手機號碼</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0912345678"
                  className="h-11 pl-9"
                  inputMode="numeric"
                  required
                />
              </div>
            </div>
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button type="submit" className="w-full h-11 gap-2" disabled={loading || !phone.trim()}>
              <MessageSquare className="w-4 h-4" />
              {loading ? "發送中..." : "發送驗證碼"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              尚無帳號？請聯絡客服{" "}
              <a href="tel:0800000000" className="text-primary underline">申請帳號</a>
            </p>
            <p className="text-center text-xs text-muted-foreground pt-1 border-t">
              企業客戶？<Link href="/login" className="text-primary underline">切換登入身份</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-3">
            {devOtp && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <span className="font-bold">測試模式：</span> 驗證碼為 <span className="font-mono font-bold text-base tracking-widest">{devOtp}</span>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">6位數驗證碼</label>
              <Input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="_ _ _ _ _ _"
                className="h-14 text-center text-2xl font-mono tracking-[0.5em] font-bold"
                required
              />
              <p className="text-xs text-muted-foreground mt-1 text-center">驗證碼 5 分鐘內有效</p>
            </div>
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading || otp.length !== 6}
            >
              {loading ? "驗證中..." : "驗證並登入"}
            </Button>
            <button
              type="button"
              onClick={sendOtp}
              disabled={cooldown > 0 || loading}
              className="w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors py-1"
            >
              {cooldown > 0 ? `重新發送（${cooldown}s）` : "重新發送驗證碼"}
            </button>
          </form>
        )}
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
        <OtpLoginForm onLogin={setSession} />
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
