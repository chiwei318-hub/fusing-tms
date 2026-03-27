import { useState } from "react";
import { Link } from "wouter";
import { Building2, Lock, User, Truck, Eye, EyeOff, UserCircle } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  onLogin: (session: EnterpriseSession, remember: boolean) => void;
}

export default function EnterpriseLogin({ onLogin }: Props) {
  const [tab, setTab] = useState<"main" | "sub">("main");
  const [accountCode, setAccountCode] = useState("");
  const [subCode, setSubCode] = useState("");
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
      const isMain = tab === "main";
      const endpoint = isMain ? "/api/enterprise/login" : "/api/enterprise/sub-login";
      const body = isMain ? { accountCode, password } : { subCode, password };

      const res = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "登入失敗"); return; }

      const session: EnterpriseSession = {
        ...data.account,
        subAccount: data.subAccount ?? null,
      };

      onLogin(session, remember);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-12">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-2xl shadow-orange-500/40 mb-4">
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">富詠運輸</h1>
        <p className="text-blue-300 text-sm mt-1">企業客戶專屬入口</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-black/30 p-7">
        {/* Tab */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
          <button onClick={() => { setTab("main"); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all
              ${tab === "main" ? "bg-white shadow-sm text-[#0d2d6e]" : "text-gray-500 hover:text-gray-700"}`}>
            <Building2 className="w-3.5 h-3.5" />
            公司帳號
          </button>
          <button onClick={() => { setTab("sub"); setError(""); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all
              ${tab === "sub" ? "bg-white shadow-sm text-[#0d2d6e]" : "text-gray-500 hover:text-gray-700"}`}>
            <UserCircle className="w-3.5 h-3.5" />
            員工帳號
          </button>
        </div>

        {tab === "main" ? (
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 bg-[#0d2d6e] rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-base leading-none">企業帳號登入</h2>
              <p className="text-gray-400 text-xs mt-0.5">請輸入公司帳號與密碼</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 bg-purple-600 rounded-xl flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-base leading-none">員工帳號登入</h2>
              <p className="text-gray-400 text-xs mt-0.5">請輸入子帳號代碼與密碼</p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              {tab === "main" ? "公司帳號" : "子帳號代碼"}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              {tab === "main" ? (
                <input required type="text" placeholder="請輸入公司帳號" value={accountCode}
                  onChange={e => setAccountCode(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/25 focus:border-[#0d2d6e]" />
              ) : (
                <input required type="text" placeholder="例：FY001-WANG" value={subCode}
                  onChange={e => setSubCode(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/25 focus:border-purple-500 font-mono" />
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">密碼</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input required type={showPw ? "text" : "password"} placeholder="請輸入密碼" value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/25 focus:border-[#0d2d6e]" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

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

          <button type="submit" disabled={loading}
            className={`w-full py-3.5 text-white font-black text-sm rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-60
              ${tab === "main" ? "bg-[#0d2d6e] hover:bg-[#1a3a8f] shadow-blue-900/20" : "bg-purple-600 hover:bg-purple-700 shadow-purple-900/20"}`}>
            {loading ? "登入中..." : tab === "main" ? "登入企業帳號" : "登入員工帳號"}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-gray-100 text-center space-y-1">
          <p className="text-xs text-gray-400">尚未開通企業帳號？</p>
          <Link href="/register/enterprise" className="text-xs font-semibold text-purple-600 hover:text-purple-700 underline">
            立即申請企業帳號
          </Link>
        </div>
      </div>

      <div className="mt-6 text-center space-y-2">
        <div><Link href="/login"><span className="text-blue-300/60 hover:text-blue-300 text-xs transition-colors cursor-pointer">← 返回登入選擇</span></Link></div>
        <div><Link href="/"><span className="text-blue-300/40 hover:text-blue-300/60 text-xs transition-colors cursor-pointer">返回首頁</span></Link></div>
      </div>
    </div>
  );
}
