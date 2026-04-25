import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { Store, LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function FranchiseFleetLogin() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_URL}/api/auth/google/url?role=owner`)
      .then(r => r.json())
      .then(d => d.url && setGoogleUrl(d.url))
      .catch(() => {});
    const params = new URLSearchParams(search);
    const err = params.get("error");
    const hint = params.get("hint");
    if (err === "google_no_account") {
      setOauthError(`Google 帳號 ${hint ? `(${hint})` : ""} 尚未綁定任何車行，請聯絡管理員`);
    } else if (err === "account_inactive") {
      setOauthError("帳號已停用，請聯絡管理員");
    } else if (err === "google_failed") {
      setOauthError("Google 登入失敗，請稍後再試");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/fleet-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登入失敗");
      login(data.token, {
        id: data.user.franchisee_id,
        role: "fleet_owner",
        name: data.user.franchisee_name,
        username: data.user.username,
        franchisee_id: data.user.franchisee_id,
        franchisee_name: data.user.franchisee_name,
        fleet_code: data.user.code,
      });
      setLocation("/franchise-fleet");
    } catch (err: any) {
      toast({ title: "登入失敗", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #071829 0%, #0a2240 45%, #0f2d58 100%)" }}>

      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(22,163,74,0.1) 0%, transparent 70%)" }} />

      <div className="relative z-10 text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-2xl"
          style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 12px 30px rgba(22,163,74,0.4)" }}>
          <Store className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">加盟車行後台</h1>
        <p className="text-slate-400 text-sm mt-1">富詠運輸 · 加盟車行管理系統</p>
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/30 p-7">
          <h2 className="text-slate-700 font-bold text-lg text-center mb-4">車行老闆登入</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2">
            <span className="text-amber-500 text-sm mt-0.5">🔑</span>
            <div className="text-xs text-amber-800 leading-relaxed">
              <p className="font-bold mb-1">測試帳號</p>
              <p>帳號：<span className="font-mono font-semibold">testfleet</span></p>
              <p>密碼：<span className="font-mono font-semibold">Test1234</span></p>
            </div>
          </div>
          {oauthError && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {oauthError}
            </div>
          )}
          <form onSubmit={handleSubmit} method="post" action="/api/auth/login/fleet-owner" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm text-slate-600">帳號</Label>
              <Input
                id="username"
                name="username"
                placeholder="請輸入車行帳號"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm text-slate-600">密碼</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="請輸入密碼"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 pr-10"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPw(p => !p)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-bold text-white" disabled={loading}
              style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)" }}>
              <LogIn className="h-4 w-4 mr-2" />
              {loading ? "登入中…" : "登入後台"}
            </Button>
          </form>
          {googleUrl && (
            <>
              <div className="flex items-center gap-2 mt-4">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400">或</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>
              <a href={googleUrl} className="mt-3 flex items-center justify-center gap-2 w-full h-11 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-sm transition-colors border border-gray-200 shadow-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                用 Google 登入
              </a>
            </>
          )}
          <p className="text-xs text-center text-slate-400 mt-4">
            帳號由富詠運輸平台管理員提供
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/">
            <span className="text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> 返回首頁
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
