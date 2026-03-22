import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Building2, Lock, User, Truck, Eye, EyeOff } from "lucide-react";
import { setEnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function EnterpriseLogin() {
  const [, navigate] = useLocation();
  const [accountCode, setAccountCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/enterprise/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountCode, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登入失敗"); return; }
      if (remember) {
        setEnterpriseSession(data.account);
      } else {
        sessionStorage.setItem("enterprise-session", JSON.stringify(data.account));
      }
      navigate("/enterprise");
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-12">
      {/* Brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-2xl shadow-orange-500/40 mb-4">
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">富詠運輸</h1>
        <p className="text-blue-300 text-sm mt-1">企業客戶專屬入口</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-black/30 p-7">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-[#0d2d6e] rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-base leading-none">企業帳號登入</h2>
            <p className="text-gray-400 text-xs mt-0.5">請輸入公司帳號與密碼</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Account code */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">公司帳號</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                required
                type="text"
                placeholder="請輸入帳號"
                value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/25 focus:border-[#0d2d6e]"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                required
                type={showPw ? "text" : "password"}
                placeholder="請輸入密碼"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/25 focus:border-[#0d2d6e]"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0d2d6e]" />
            <span className="text-xs text-gray-600">記住登入狀態</span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#0d2d6e] hover:bg-[#1a3a8f] text-white font-black text-sm rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "登入中..." : "登入企業帳號"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">尚未開通企業帳號？</p>
          <a href="tel:0800000000" className="text-xs font-semibold text-orange-500 hover:text-orange-600">
            聯繫專屬客服開通
          </a>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/">
          <span className="text-blue-300/60 hover:text-blue-300 text-xs transition-colors cursor-pointer">← 返回首頁</span>
        </Link>
      </div>
    </div>
  );
}
