import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Shield, User, Lock, LogIn, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function AdminLogin() {
  const { login, isLoggedIn, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn && user?.role === "admin") navigate("/admin");
  }, [isLoggedIn, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登入失敗"); return; }
      login(data.token, data.user);
      toast({ title: `歡迎，${data.user.name}！` });
      navigate("/admin");
    } catch { setError("網路錯誤，請稍後再試"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login">
          <button className="flex items-center gap-1 text-blue-300/70 hover:text-blue-200 text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> 返回選擇身份
          </button>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-slate-700 rounded-2xl flex items-center justify-center shadow-xl shadow-black/30">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">公司後台登入</h1>
            <p className="text-blue-300 text-xs">管理員 / 調度員 / 會計</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-3 flex items-start gap-2.5">
          <span className="text-amber-500 text-base mt-0.5">🔑</span>
          <div className="text-xs text-amber-800 leading-relaxed">
            <p className="font-bold mb-1">測試帳號</p>
            <p>帳號：<span className="font-mono font-semibold">admin</span></p>
            <p>密碼：<span className="font-mono font-semibold">admin123</span></p>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">帳號</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  name="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="請輸入帳號"
                  className="h-12 pl-9"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">密碼</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="password"
                  name="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 pl-9"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" className="w-full h-12 gap-2 bg-slate-800 hover:bg-slate-900 text-white" disabled={loading}>
              <LogIn className="w-4 h-4" />
              {loading ? "登入中..." : "登入後台"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
