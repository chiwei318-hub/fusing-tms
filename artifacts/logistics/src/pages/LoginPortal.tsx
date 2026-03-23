import { Link } from "wouter";
import { Truck, User, Building2, ChevronRight, Shield } from "lucide-react";

export default function LoginPortal() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-12">

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-2xl shadow-orange-500/40 mb-4">
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">富詠運輸</h1>
        <p className="text-blue-300 text-sm mt-1">請選擇您的登入身份</p>
      </div>

      <div className="w-full max-w-sm space-y-4">

        {/* Customer */}
        <Link href="/login/customer">
          <div className="group bg-white rounded-3xl shadow-2xl shadow-black/30 p-5 cursor-pointer hover:bg-orange-50 transition-colors border-2 border-transparent hover:border-orange-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
                <User className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-gray-900 text-base leading-tight">一般客戶</h2>
                <p className="text-gray-500 text-xs mt-0.5">手機號碼 簡訊驗證</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Driver */}
        <Link href="/login/driver">
          <div className="group bg-white rounded-3xl shadow-2xl shadow-black/30 p-5 cursor-pointer hover:bg-blue-50 transition-colors border-2 border-transparent hover:border-blue-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-gray-900 text-base leading-tight">司機</h2>
                <p className="text-gray-500 text-xs mt-0.5">帳號密碼登入</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Admin */}
        <Link href="/login/admin">
          <div className="group bg-white rounded-3xl shadow-2xl shadow-black/30 p-5 cursor-pointer hover:bg-slate-50 transition-colors border-2 border-transparent hover:border-slate-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-slate-200 transition-colors">
                <Shield className="w-6 h-6 text-slate-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-gray-900 text-base leading-tight">公司後台</h2>
                <p className="text-gray-500 text-xs mt-0.5">管理員 / 調度員 / 會計</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </div>
        </Link>

        {/* Enterprise link */}
        <Link href="/enterprise/login">
          <div className="group bg-white/10 border border-white/20 rounded-2xl px-5 py-3 cursor-pointer hover:bg-white/20 transition-colors flex items-center gap-3">
            <Building2 className="w-5 h-5 text-blue-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">企業客戶（合約帳號）</p>
              <p className="text-blue-300/70 text-xs">企業代碼登入</p>
            </div>
            <ChevronRight className="w-4 h-4 text-blue-300/50 group-hover:text-blue-300 transition-colors shrink-0" />
          </div>
        </Link>

        <div className="text-center pt-2">
          <p className="text-blue-300/60 text-xs">
            不確定身份類型？
            <a href="tel:0800000000" className="text-orange-300 font-semibold ml-1 hover:text-orange-200">聯絡客服 →</a>
          </p>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href="/">
          <span className="text-blue-300/50 hover:text-blue-300 text-xs transition-colors cursor-pointer">← 返回首頁</span>
        </Link>
      </div>
    </div>
  );
}
