import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Truck, User, Lock, LogIn, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function DriverLogin() {
  const { login, isLoggedIn, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn && user?.role === "driver") navigate("/driver");
  }, [isLoggedIn, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登入失敗"); return; }
      login(data.token, data.user);
      toast({ title: `歡迎，${data.user.name}！` });
      navigate("/driver");
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
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-600/30">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl leading-tight">司機登入</h1>
            <p className="text-blue-300 text-xs">帳號密碼登入司機平台</p>
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
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  className="h-12 pl-9"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <Button type="submit" className="w-full h-12 gap-2 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
              <LogIn className="w-4 h-4" />
              {loading ? "登入中..." : "登入"}
            </Button>
            <p className="text-center text-xs text-gray-400">
              還沒有帳號？<Link href="/register/driver" className="text-blue-600 underline font-medium">申請加入成為司機</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
