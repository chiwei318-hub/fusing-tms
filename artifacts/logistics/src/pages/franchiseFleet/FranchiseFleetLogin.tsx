import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Store, LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export default function FranchiseFleetLogin() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

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
          <h2 className="text-slate-700 font-bold text-lg text-center mb-5">車行老闆登入</h2>
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
