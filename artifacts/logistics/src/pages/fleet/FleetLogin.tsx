import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { Truck, LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function FleetLogin() {
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
    fetch(`${BASE_URL}/api/auth/google/url?role=fleet`)
      .then(r => r.json())
      .then(d => d.url && setGoogleUrl(d.url))
      .catch(() => {});
    const params = new URLSearchParams(search);
    const err = params.get("error");
    const hint = params.get("hint");
    if (err === "google_no_account") {
      setOauthError(`Google 帳號 ${hint ? `(${hint})` : ""} 尚未綁定任何車隊，請聯絡管理員`);
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
      const res = await fetch(`${BASE_URL}/api/auth/login/fleet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "登入失敗");
      login(data.token, data.user);
      setLocation("/fleet");
    } catch (err: any) {
      toast({ title: "登入失敗", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-orange-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4 shadow-lg">
            <Truck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">福興高合作車隊</h1>
          <p className="text-slate-300 text-sm mt-1">富詠運輸 × 蝦皮合作夥伴入口</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center text-gray-700">車隊帳號登入</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 mb-4 flex items-start gap-2">
              <span className="text-amber-500 text-sm mt-0.5">🔑</span>
              <div className="text-xs text-amber-800 leading-relaxed">
                <p className="font-bold mb-1">測試帳號</p>
                <p>帳號：<span className="font-mono font-semibold">fleet01</span></p>
                <p>密碼：<span className="font-mono font-semibold">test1234</span></p>
              </div>
            </div>
            {oauthError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                {oauthError}
              </div>
            )}
            <form onSubmit={handleSubmit} method="post" action="/api/auth/login/fleet" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm">帳號</Label>
                <Input
                  id="username"
                  name="username"
                  placeholder="車隊帳號"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm">密碼</Label>
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
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPw(p => !p)}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700" disabled={loading}>
                <LogIn className="h-4 w-4 mr-2" />
                {loading ? "登入中…" : "登入"}
              </Button>
            </form>
            {googleUrl && (
              <>
                <div className="flex items-center gap-2 mt-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400">或</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <a href={googleUrl} className="mt-3 flex items-center justify-center gap-2 w-full h-11 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-lg text-sm transition-colors border border-gray-200 shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  用 Google 登入
                </a>
              </>
            )}
            <p className="text-xs text-center text-gray-400 mt-4">
              帳號由富詠運輸福興高管理員提供
            </p>
          </CardContent>
        </Card>
        <div className="mt-5 text-center">
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
