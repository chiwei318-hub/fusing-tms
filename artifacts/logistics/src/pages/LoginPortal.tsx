import { Link } from "wouter";
import { Truck, User, Building2, ChevronRight, Shield } from "lucide-react";

export default function LoginPortal() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #071829 0%, #0a2240 45%, #0f2d58 100%)" }}>

      {/* Grid texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      {/* Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.1) 0%, transparent 70%)" }} />

      <div className="relative z-10 text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-2xl mb-4"
          style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 12px 30px rgba(217,119,6,0.4)" }}>
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">富詠運輸</h1>
        <p className="text-slate-400 text-sm mt-1">請選擇您的登入身份</p>
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-3">

        {/* Customer */}
        <Link href="/login/customer">
          <div className="group bg-white rounded-2xl shadow-xl shadow-black/20 p-5 cursor-pointer hover:shadow-2xl transition-all border border-slate-100 hover:border-amber-200 hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                style={{ background: "rgba(217,119,6,0.10)" }}>
                <User className="w-6 h-6" style={{ color: "#d97706" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-slate-900 text-base leading-tight">一般客戶</h2>
                <p className="text-slate-400 text-xs mt-0.5">手機號碼 簡訊驗證</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 group-hover:text-amber-500 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Driver */}
        <Link href="/login/driver">
          <div className="group bg-white rounded-2xl shadow-xl shadow-black/20 p-5 cursor-pointer hover:shadow-2xl transition-all border border-slate-100 hover:border-blue-200 hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(29,78,216,0.08)" }}>
                <Truck className="w-6 h-6" style={{ color: "#1d4ed8" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-slate-900 text-base leading-tight">司機</h2>
                <p className="text-slate-400 text-xs mt-0.5">帳號密碼登入</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 group-hover:text-blue-500 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Admin */}
        <Link href="/login/admin">
          <div className="group bg-white rounded-2xl shadow-xl shadow-black/20 p-5 cursor-pointer hover:shadow-2xl transition-all border border-slate-100 hover:border-slate-300 hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-slate-900 text-base leading-tight">公司後台</h2>
                <p className="text-slate-400 text-xs mt-0.5">管理員 / 調度員 / 會計</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-0.5 group-hover:text-slate-500 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Enterprise */}
        <Link href="/enterprise/login">
          <div className="group bg-white/8 border border-white/14 rounded-2xl px-5 py-3.5 cursor-pointer hover:bg-white/14 transition-colors flex items-center gap-3">
            <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">企業客戶（合約帳號）</p>
              <p className="text-slate-500 text-xs">企業代碼登入</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
          </div>
        </Link>

        <div className="text-center pt-2">
          <p className="text-slate-600 text-xs">
            不確定身份類型？
            <a href="tel:0800000000" className="font-semibold ml-1 hover:underline transition-colors" style={{ color: "#fcd34d" }}>聯絡客服</a>
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-8 text-center">
        <Link href="/">
          <span className="text-slate-600 hover:text-slate-300 text-xs transition-colors cursor-pointer">← 返回首頁</span>
        </Link>
      </div>
    </div>
  );
}
