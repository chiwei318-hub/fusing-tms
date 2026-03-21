import { Link } from "wouter";
import { Truck, Package, Shield, ArrowRight, CheckCircle, Clock, Star } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a2463] via-[#1a3a8f] to-[#0d1f5c] flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-12 pb-6">
        {/* Logo + Brand */}
        <div className="text-center mb-10">
          <div className="relative inline-flex mb-5">
            <div className="w-24 h-24 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center shadow-2xl shadow-black/30 border border-white/20">
              <Truck className="w-14 h-14 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
              <Star className="w-3.5 h-3.5 text-white fill-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">富詠運輸</h1>
          <p className="text-blue-200 mt-2 text-base font-medium">專業貨運派車管理系統</p>

          {/* Tag pills */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {["快速", "準時", "可靠"].map(tag => (
              <span key={tag} className="bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-semibold px-3 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Role Cards */}
        <div className="w-full max-w-sm space-y-3">
          {/* Customer */}
          <Link href="/customer">
            <div className="group relative overflow-hidden bg-white rounded-2xl p-5 flex items-center gap-4 cursor-pointer shadow-xl shadow-black/20 active:scale-[0.98] transition-transform">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="bg-blue-600 p-3.5 rounded-xl shadow-lg shadow-blue-600/30 shrink-0 z-10">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 z-10">
                <p className="font-black text-gray-900 text-lg leading-tight">客戶下單</p>
                <p className="text-gray-500 text-sm mt-0.5">取送貨 · 查訂單 · 付款回報</p>
              </div>
              <div className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center shadow shrink-0 z-10 group-hover:bg-blue-700 transition-colors">
                <ArrowRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </Link>

          {/* Driver */}
          <Link href="/driver">
            <div className="group relative overflow-hidden bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-5 flex items-center gap-4 cursor-pointer shadow-xl shadow-orange-500/30 active:scale-[0.98] transition-transform">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10" />
              <div className="bg-white/20 p-3.5 rounded-xl shrink-0 z-10">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1 z-10">
                <p className="font-black text-white text-lg leading-tight">司機接單</p>
                <p className="text-orange-100 text-sm mt-0.5">接單 · 導航 · 打卡 · 簽收</p>
              </div>
              <div className="bg-white/25 w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10">
                <ArrowRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </Link>

          {/* Admin */}
          <Link href="/admin">
            <div className="group bg-white/10 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all active:scale-[0.98]">
              <div className="bg-white/15 p-3.5 rounded-xl shrink-0">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-black text-white text-lg leading-tight">後台管理</p>
                <p className="text-blue-200 text-sm mt-0.5">派車 · 司機 · 費用 · 報表</p>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-300 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Trust bar */}
        <div className="mt-10 grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { icon: CheckCircle, label: "準時率", value: "98%" },
            { icon: Truck, label: "合作車輛", value: "50+" },
            { icon: Clock, label: "24H服務", value: "全天" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="text-center">
              <Icon className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <p className="text-white font-bold text-lg leading-none">{value}</p>
              <p className="text-blue-300 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-blue-400/50 text-xs text-center pb-5">© 富詠運輸股份有限公司</p>
    </div>
  );
}
