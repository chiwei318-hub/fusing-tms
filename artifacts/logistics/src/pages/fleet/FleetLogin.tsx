import { useState } from "react";
import { useLocation, Link } from "wouter";
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
