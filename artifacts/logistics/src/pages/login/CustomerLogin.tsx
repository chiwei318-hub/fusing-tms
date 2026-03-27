import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Phone, MessageSquare, KeyRound, RotateCcw, Truck, ChevronLeft, ExternalLink } from "lucide-react";
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

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [lineUrl, setLineUrl] = useState<string | null>(null);
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
  }, []);

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
            <p className="text-blue-300 text-xs">手機簡訊驗證身份</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          {/* Step header */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === "phone" ? "bg-orange-500 text-white" : "bg-green-100 text-green-700"}`}>
              {step === "phone" ? "1" : "✓"}
            </div>
            <div className={`flex-1 h-0.5 ${step === "otp" ? "bg-orange-300" : "bg-gray-100"}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === "otp" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400"}`}>2</div>
          </div>

          {step === "phone" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">手機號碼</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0912345678"
                    className="h-12 pl-9 text-base"
                    onKeyDown={e => e.key === "Enter" && sendOtp()}
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button onClick={sendOtp} className="w-full h-12 gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading || !phone.trim()}>
                <MessageSquare className="w-4 h-4" />
                {loading ? "發送中..." : "發送簡訊驗證碼"}
              </Button>
              {lineUrl && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-400">或</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <a href={lineUrl} className="flex items-center justify-center gap-2 w-full h-12 bg-[#06C755] hover:bg-[#05b34d] text-white font-bold rounded-xl text-sm transition-colors">
                    <ExternalLink className="w-4 h-4" />
                    LINE 登入
                  </a>
                </>
              )}
              <p className="text-center text-xs text-gray-400">
                尚未有帳號？<Link href="/register/customer" className="text-orange-500 underline font-medium">立即免費申請</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
              <Input
                ref={otpRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="______"
                className="h-16 text-center text-3xl font-mono tracking-[0.6em] font-black"
                onKeyDown={e => e.key === "Enter" && otp.length === 6 && verifyOtp()}
              />
              <p className="text-xs text-gray-400 text-center">驗證碼 5 分鐘內有效</p>
              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <Button onClick={verifyOtp} className="w-full h-12 gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading || otp.length !== 6}>
                <KeyRound className="w-4 h-4" />
                {loading ? "驗證中..." : "驗證並登入"}
              </Button>
              <button
                onClick={sendOtp}
                disabled={cooldown > 0 || loading}
                className="w-full text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed py-1"
              >
                {cooldown > 0 ? `重新發送（${cooldown}s）` : "重新發送驗證碼"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
