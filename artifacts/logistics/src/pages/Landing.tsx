import { Link } from "wouter";
import { Truck, Package, User, LayoutDashboard, ArrowRight, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 flex flex-col items-center justify-center px-4">
      {/* Brand */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center bg-white/10 backdrop-blur p-4 rounded-2xl mb-5 shadow-xl shadow-black/20">
          <Truck className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wide">富詠運輸</h1>
        <p className="text-blue-200 mt-2 text-sm md:text-base">派車管理系統 · 三端整合平台</p>
      </div>

      {/* Role cards */}
      <div className="w-full max-w-sm space-y-3">
        <Link href="/customer">
          <div className="group bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]">
            <div className="bg-blue-400/30 p-3 rounded-xl">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-lg">客戶端</p>
              <p className="text-blue-200 text-sm">下單、查訂單、付款回報</p>
            </div>
            <ArrowRight className="w-5 h-5 text-blue-300 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link href="/driver">
          <div className="group bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]">
            <div className="bg-emerald-400/30 p-3 rounded-xl">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-lg">司機端</p>
              <p className="text-blue-200 text-sm">接單、導航、打卡、完成</p>
            </div>
            <ArrowRight className="w-5 h-5 text-blue-300 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        <Link href="/order-form">
          <div className="group bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 hover:border-white/40 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02]">
            <div className="bg-slate-400/30 p-3 rounded-xl">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-lg">後台管理</p>
              <p className="text-blue-200 text-sm">派車、費用、報表管理</p>
            </div>
            <ArrowRight className="w-5 h-5 text-blue-300 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      <p className="mt-10 text-blue-300/60 text-xs text-center">
        © 富詠運輸股份有限公司 · 版本 2.0 MVP
      </p>
    </div>
  );
}
