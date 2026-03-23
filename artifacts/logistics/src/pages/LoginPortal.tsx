import { Link } from "wouter";
import { Truck, Phone, Building2, ArrowRight, ChevronRight, User, Badge } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LoginPortal() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col items-center justify-center px-5 py-12">

      {/* Brand */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl shadow-2xl shadow-orange-500/40 mb-4">
          <Truck className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-white font-black text-2xl">富詠運輸</h1>
        <p className="text-blue-300 text-sm mt-1">請選擇您的登入身份</p>
      </div>

      <div className="w-full max-w-sm space-y-4">

        {/* Individual Customer */}
        <Link href="/customer">
          <div className="group bg-white rounded-3xl shadow-2xl shadow-black/30 p-6 cursor-pointer hover:bg-orange-50 transition-colors border-2 border-transparent hover:border-orange-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-orange-200 transition-colors">
                <User className="w-6 h-6 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-gray-900 text-base leading-tight">一般客戶登入</h2>
                <p className="text-gray-500 text-xs mt-0.5">以手機號碼 + 密碼登入</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0" />
                散客或偶爾叫車的個人用戶
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0" />
                以電話號碼作為帳號，即叫即付
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full shrink-0" />
                可查詢訂單紀錄與追蹤狀態
              </p>
            </div>
          </div>
        </Link>

        {/* Enterprise Customer */}
        <Link href="/enterprise/login">
          <div className="group bg-white rounded-3xl shadow-2xl shadow-black/30 p-6 cursor-pointer hover:bg-blue-50 transition-colors border-2 border-transparent hover:border-blue-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#0d2d6e]/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-[#0d2d6e]/20 transition-colors">
                <Building2 className="w-6 h-6 text-[#0d2d6e]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-gray-900 text-base leading-tight">企業客戶登入</h2>
                  <span className="inline-block bg-orange-100 text-orange-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">合約</span>
                </div>
                <p className="text-gray-500 text-xs mt-0.5">以企業帳號代碼 + 密碼登入</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#0d2d6e] rounded-full shrink-0" />
                已與富詠運輸簽訂合約的公司行號
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#0d2d6e] rounded-full shrink-0" />
                享有月結帳期、專屬折扣、優先派車
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#0d2d6e] rounded-full shrink-0" />
                帳號由業務專員開通，非自助註冊
              </p>
            </div>
          </div>
        </Link>

        {/* "Not sure?" hint */}
        <div className="text-center pt-2">
          <p className="text-blue-300/60 text-xs">
            不確定帳號類型？
            <a href="tel:0800000000" className="text-orange-300 font-semibold ml-1 hover:text-orange-200">
              聯絡客服確認 →
            </a>
          </p>
        </div>

        {/* Guest shortcut */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
          <p className="text-blue-200 text-xs mb-2">不想登入？</p>
          <Link href="/customer/order">
            <button className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors">
              <Truck className="w-4 h-4" />
              直接叫車（免登入）
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Link>
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
