import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Truck, Phone, ArrowRight, Building2, Zap, Clock, Users, Shield, Star, CheckCircle,
} from "lucide-react";

function useLiveStats() {
  const [nearbyTrucks, setNearbyTrucks] = useState(5);
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/system-config/stats/overview");
        const data = await res.json();
        const n = Number(data?.drivers?.available ?? 0) + Number(data?.drivers?.busy ?? 0);
        if (n > 0) setNearbyTrucks(n);
      } catch { /* keep default */ }
    };
    fetch_();
    const t = setInterval(fetch_, 60000);
    return () => clearInterval(t);
  }, []);
  return nearbyTrucks;
}

export default function Landing() {
  const nearbyTrucks = useLiveStats();

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: "linear-gradient(160deg, #071829 0%, #0a2240 45%, #0f2d58 100%)" }}
    >
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "48px 48px" }} />
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.1) 0%, transparent 70%)" }} />

      {/* ── NAV ── */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-3 shrink-0">
        <img src="/logo-transparent.png" alt="富詠運輸" className="h-14 sm:h-16 w-auto object-contain drop-shadow-lg" />
        <div className="flex items-center gap-1.5">
          <Link href="/customer/order">
            <button className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-all shadow shadow-amber-500/30">
              <Truck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">客戶下單</span>
              <span className="sm:hidden">下單</span>
            </button>
          </Link>
          <Link href="/driver">
            <button className="flex items-center gap-1.5 text-slate-200/90 hover:text-white border border-white/20 hover:border-white/40 bg-white/8 hover:bg-white/15 text-xs font-semibold px-3 py-1.5 rounded-full transition-all">
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">司機登入</span>
              <span className="sm:hidden">司機</span>
            </button>
          </Link>
          <Link href="/enterprise/login">
            <button className="flex items-center gap-1.5 text-slate-200/90 hover:text-white border border-white/20 hover:border-white/40 bg-white/8 hover:bg-white/15 text-xs font-semibold px-3 py-1.5 rounded-full transition-all">
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">企業客戶</span>
              <span className="sm:hidden">企業</span>
            </button>
          </Link>
          <a href="tel:0800000000" className="hidden sm:flex items-center gap-1.5 text-slate-300/60 hover:text-white text-xs px-2 py-1.5 rounded-full transition-all">
            <Phone className="w-3.5 h-3.5" />
            免費客服
          </a>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center min-h-0">

        {/* Live badge */}
        <div className="inline-flex items-center gap-2 border text-xs font-semibold px-4 py-1.5 rounded-full mb-4"
          style={{ background: "rgba(217,119,6,0.12)", borderColor: "rgba(217,119,6,0.35)", color: "#fcd34d" }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#fbbf24" }} />
          現在有 <span className="font-black text-amber-300">{nearbyTrucks}</span> 台車可即時調派
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight mb-2">
          富詠運輸
        </h1>
        <p className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3" style={{ color: "#fbbf24" }}>
          最快30分鐘到車
        </p>
        <p className="text-slate-300 text-sm sm:text-base font-medium mb-6">
          全台接單 · 專業物流 · 即時派車 · 箱型車 / 冷藏車 / 尾門車 / 平板車
        </p>

        {/* Primary CTA */}
        <Link href="/customer/order">
          <button className="group inline-flex items-center gap-3 text-white font-black text-2xl sm:text-3xl px-10 sm:px-14 py-5 sm:py-6 rounded-2xl transition-all mb-5 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 16px 40px rgba(217,119,6,0.4)" }}>
            <Truck className="w-7 h-7 sm:w-8 sm:h-8" />
            立即叫車
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1.5 transition-transform" />
          </button>
        </Link>

        {/* Secondary entry buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-lg mb-5">
          <Link href="/quick">
            <button className="w-full flex items-center justify-center gap-1.5 border border-emerald-500/40 bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-300 text-xs sm:text-sm font-semibold px-3 py-3 rounded-xl transition-colors">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              零散客快速接單
            </button>
          </Link>
          <Link href="/enterprise/login">
            <button className="w-full flex items-center justify-center gap-1.5 border border-blue-400/30 bg-blue-400/10 hover:bg-blue-400/20 text-blue-300 text-xs sm:text-sm font-semibold px-3 py-3 rounded-xl transition-colors">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              企業客戶入口
            </button>
          </Link>
          <Link href="/driver">
            <button className="w-full flex items-center justify-center gap-1.5 border border-white/15 bg-white/6 hover:bg-white/12 text-slate-200 text-xs sm:text-sm font-semibold px-3 py-3 rounded-xl transition-colors">
              <Users className="w-3.5 h-3.5 shrink-0" />
              司機登入
            </button>
          </Link>
          <Link href="/chat">
            <button className="w-full flex items-center justify-center gap-1.5 border border-white/15 bg-white/6 hover:bg-white/12 text-slate-200 text-xs sm:text-sm font-semibold px-3 py-3 rounded-xl transition-colors">
              <span className="text-base leading-none">💬</span>
              AI客服報價
            </button>
          </Link>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/6 border border-white/10 text-slate-300 text-xs font-medium px-3.5 py-2 rounded-full">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            預估 <span className="font-black text-amber-300 mx-0.5">30</span> 分鐘到達
          </div>
          <div className="flex items-center gap-1.5 bg-white/6 border border-white/10 text-slate-300 text-xs font-medium px-3.5 py-2 rounded-full">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            已完成 <span className="font-black text-white mx-0.5">12,500+</span> 訂單
          </div>
          <div className="flex items-center gap-1.5 bg-white/6 border border-white/10 text-slate-300 text-xs font-medium px-3.5 py-2 rounded-full">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            評分 <span className="font-black text-white mx-0.5">4.9</span> / 5
          </div>
          <div className="flex items-center gap-1.5 bg-white/6 border border-white/10 text-slate-300 text-xs font-medium px-3.5 py-2 rounded-full">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            24H 全天候服務
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 shrink-0 flex items-center justify-between px-5 sm:px-8 py-2.5 border-t border-white/5">
        <p className="text-slate-700 text-xs">© 富詠運輸股份有限公司</p>
        <div className="flex items-center gap-3">
          <a href="tel:0800000000" className="sm:hidden text-slate-600 hover:text-slate-400 text-xs transition-colors flex items-center gap-1">
            <Phone className="w-3 h-3" /> 客服
          </a>
          <span className="text-slate-700 text-xs hover:text-slate-500 cursor-pointer transition-colors">服務條款</span>
          <span className="text-slate-700 text-xs hover:text-slate-500 cursor-pointer transition-colors">隱私政策</span>
          <Link href="/login/admin">
            <span className="text-slate-700 text-xs hover:text-slate-400 cursor-pointer transition-colors flex items-center gap-1">
              <Shield className="w-3 h-3" /> 後台登入
            </span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
