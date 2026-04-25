import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Phone, MessageSquare, KeyRound, RotateCcw, Truck, ChevronLeft, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const RESEND_COOLDOWN = 60;

export default function CustomerLogin() {
  const { login, isLoggedIn, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoggedIn && user?.role === "customer") navigate("/customer");
  }, [isLoggedIn, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    fetch(`${BASE_URL}/api/auth/line/url?role=customer`)
      .then(r => r.json())
      .then(d => d.url && setLineUrl(d.url))
      .catch(() => {});
    fetch(`${BASE_URL}/api/auth/google/url?role=customer`)
      .then(r => r.json())
      .then(d => d.url && setGoogleUrl(d.url))
      .catch(() => {});
  }, []);

  const loginWithPassword = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/customer/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登入失敗"); return; }
      login(data.token, data.user);
      toast({ title: `歡迎回來，${data.user.name}！` });
      navigate("/customer");
    } catch { setError("網路錯誤，請稍後再試"); }
    finally { setLoading(false); }
  };

  const sendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "發送失敗"); return; }
      setStep("otp");
      setCooldown(RESEND_COOLDOWN);
      setDevOtp(data.devOtp ?? null);
      toast({ title: "驗證碼已發送", description: `已發送至 ${phone}` });
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch { setError("網路錯誤，請稍後再試"); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "驗證失敗"); return; }
      login(data.token, data.user);
      toast({ title: `歡迎回來，${data.user.name}！` });
      navigate("/customer");
    } catch { setError("網路錯誤，請稍後再試"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* Back */}
        <Link href="/login">
          <button className="flex items-center gap-1 text-blue-300/70 hover:text-blue-200 text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 返回選擇身份
          </button>
        </Link>

        {/* Brand */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/30">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">一般客戶登入</h1>
            <p className="text-blue-300 text-xs">{mode === "otp" ? "手機簡訊驗證身份" : "手機號碼＋密碼登入"}</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
            <button onClick={() => { setMode("otp"); setError(""); setStep("phone"); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "otp" ? "bg-white text-orange-500 shadow-sm" : "text-gray-500"}`}>
              📱 簡訊驗證碼
            </button>
            <button onClick={() => { setMode("password"); setError(""); }} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "password" ? "bg-white text-orange-500 shadow-sm" : "text-gray-500"}`}>
              🔑 密碼登入
            </button>
          </div>

          {mode === "password" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">帳號或手機號碼</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="text" name="username" autoComplete="username" value={phone} onChange={e => setPhone(e.target.value)} placeholder="帳號 或 0912345678" className="h-12 pl-9 text-base" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">密碼</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="請輸入密碼" className="h-12 pl-9 text-base" onKeyDown={e => e.key === "Enter" && loginWithPassword()} />
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button onClick={loginWithPassword} className="w-full h-12 gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading || !phone.trim() || !password.trim()}>
                <KeyRound className="w-4 h-4" />
                {loading ? "登入中..." : "密碼登入"}
              </Button>
              {googleUrl && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">或</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <a href={googleUrl} className="flex items-center justify-center gap-2 w-full h-12 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition-colors border border-gray-200 shadow-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    用 Google 登入
                  </a>
                </>
              )}
              <p className="text-center text-xs text-gray-400">
                尚未有帳號？<Link href="/register/customer" className="text-orange-500 underline font-medium">立即免費申請</Link>
              </p>
            </div>
          ) : step === "phone" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-orange-500 text-white">1</div>
                <div className="flex-1 h-0.5 bg-gray-100" />
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-gray-100 text-gray-400">2</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">手機號碼</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912345678" className="h-12 pl-9 text-base" onKeyDown={e => e.key === "Enter" && sendOtp()} />
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button onClick={sendOtp} className="w-full h-12 gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading || !phone.trim()}>
                <MessageSquare className="w-4 h-4" />
                {loading ? "發送中..." : "發送簡訊驗證碼"}
              </Button>
              {(lineUrl || googleUrl) && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">或</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {lineUrl && (
                      <a href={lineUrl} className="flex items-center justify-center gap-2 w-full h-12 bg-[#06C755] hover:bg-[#05b34d] text-white font-bold rounded-xl text-sm transition-colors">
                        <ExternalLink className="w-4 h-4" />
                        LINE 登入
                      </a>
                    )}
                    {googleUrl && (
                      <a href={googleUrl} className="flex items-center justify-center gap-2 w-full h-12 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition-colors border border-gray-200 shadow-sm">
                        <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        用 Google 登入
                      </a>
                    )}
                  </div>
                </>
              )}
              <p className="text-center text-xs text-gray-400">
                尚未有帳號？<Link href="/register/customer" className="text-orange-500 underline font-medium">立即免費申請</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-green-100 text-green-700">✓</div>
                <div className="flex-1 h-0.5 bg-orange-300" />
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-orange-500 text-white">2</div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">輸入驗證碼</p>
                  <p className="text-xs text-gray-400 mt-0.5">已發送至 {phone}</p>
                </div>
                <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1" onClick={() => { setStep("phone"); setOtp(""); setError(""); setDevOtp(null); }}>
                  <RotateCcw className="w-3 h-3" /> 換號碼
                </button>
              </div>
              {devOtp && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  <span className="font-bold">🧪 測試模式：</span> 驗證碼為 <span className="font-mono font-black text-lg tracking-[0.3em] text-amber-800">{devOtp}</span>
                </div>
              )}
              <Input ref={otpRef} type="text" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="______" className="h-16 text-center text-3xl font-mono tracking-[0.6em] font-black" onKeyDown={e => e.key === "Enter" && otp.length === 6 && verifyOtp()} />
              <p className="text-xs text-gray-400 text-center">驗證碼 5 分鐘內有效</p>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button onClick={verifyOtp} className="w-full h-12 gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading || otp.length !== 6}>
                <KeyRound className="w-4 h-4" />
                {loading ? "驗證中..." : "驗證並登入"}
              </Button>
              <button onClick={sendOtp} disabled={cooldown > 0 || loading} className="w-full text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed py-1">
                {cooldown > 0 ? `重新發送（${cooldown}s）` : "重新發送驗證碼"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
