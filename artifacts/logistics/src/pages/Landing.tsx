import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  Truck, Star, Phone, MapPin, ArrowRight, CheckCircle,
  Building2, Zap, Clock, Users, Shield, ChevronDown, Sparkles,
} from "lucide-react";

function useLiveStats() {
  const [nearbyTrucks, setNearbyTrucks] = useState(5);
  const etaMin = 30;
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/system-config/stats/overview");
        const data = await res.json();
        const avail = Number(data?.drivers?.available ?? 0);
        const busy  = Number(data?.drivers?.busy ?? 0);
        if (avail + busy > 0) setNearbyTrucks(avail + busy);
      } catch { /* keep default */ }
    };
    fetchStats();
    const t = setInterval(fetchStats, 60000);
    return () => clearInterval(t);
  }, []);
  return { nearbyTrucks, etaMin };
}

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = target / 60;
      const t = setInterval(() => {
        start = Math.min(start + step, target);
        setVal(Math.floor(start));
        if (start >= target) clearInterval(t);
      }, 16);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

function AnimatedTruckCount({ count }: { count: number }) {
  const [prev, setPrev] = useState(count);
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (count !== prev) {
      setAnimate(true);
      const t = setTimeout(() => { setAnimate(false); setPrev(count); }, 600);
      return () => clearTimeout(t);
    }
  }, [count, prev]);
  return (
    <span className={`font-black text-amber-300 tabular-nums transition-all duration-300 inline-block ${animate ? "scale-150 text-yellow-200" : "scale-100"}`}>
      {count}
    </span>
  );
}

const reviews = [
  { name: "王先生", company: "順達五金有限公司", stars: 5, text: "下午三點叫車，十八分鐘就到了！司機很專業，貨物完好無缺，推薦！" },
  { name: "林小姐", company: "欣葉餐飲集團", stars: 5, text: "長期配合兩年，每次準時，報價透明，再也不用擔心出貨問題。" },
  { name: "陳經理", company: "台北倉儲物流股份有限公司", stars: 5, text: "三個據點同步調度，全部到位，司機主動確認簽收，服務超乎期待。" },
];

function QuickOrderForm() {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm text-slate-500 mb-4">
        免登入 · 即時報價 · 線上付款 · 自動派車，最快 3 分鐘完成預訂
      </p>
      <Link href="/quick">
        <button className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-white font-bold text-lg rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2">
          <Zap className="w-5 h-5" />
          立即開始快速下單
          <ArrowRight className="w-5 h-5" />
        </button>
      </Link>
      <p className="text-center text-xs text-slate-400">免註冊 · 即時報價 · 線上付款 · 自動派車</p>
    </div>
  );
}

export default function Landing() {
  const { nearbyTrucks, etaMin } = useLiveStats();

  return (
    <div className="min-h-screen bg-white text-slate-900">

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col overflow-hidden"
        style={{ background: "linear-gradient(160deg, #071829 0%, #0a2240 40%, #0f2d58 70%, #0d2448 100%)" }}>

        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        {/* Glow orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)" }} />
        <div className="absolute bottom-10 right-0 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(217,119,6,0.08) 0%, transparent 70%)" }} />

        {/* Nav */}
        <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 pt-4 pb-2 gap-2">
          <img src="/logo-transparent.png" alt="富詠運輸" className="h-20 sm:h-24 w-auto object-contain drop-shadow-lg shrink-0" />
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Link href="/customer/order">
              <button className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-2 rounded-full transition-all shadow shadow-amber-500/30">
                <Truck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">客戶下單</span>
                <span className="sm:hidden">下單</span>
              </button>
            </Link>
            <Link href="/driver">
              <button className="flex items-center gap-1.5 text-slate-200/90 hover:text-white border border-white/20 hover:border-white/40 bg-white/8 hover:bg-white/15 text-xs font-semibold px-3 py-2 rounded-full transition-all">
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">司機登入</span>
                <span className="sm:hidden">司機</span>
              </button>
            </Link>
            <Link href="/enterprise/login">
              <button className="flex items-center gap-1.5 text-slate-200/90 hover:text-white border border-white/20 hover:border-white/40 bg-white/8 hover:bg-white/15 text-xs font-semibold px-3 py-2 rounded-full transition-all">
                <Building2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">企業客戶</span>
                <span className="sm:hidden">企業</span>
              </button>
            </Link>
            <a href="tel:0800000000" className="flex items-center gap-1.5 text-slate-200/70 hover:text-white border border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10 text-xs font-medium px-3 py-2 rounded-full transition-all">
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">免費客服</span>
            </a>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 text-center pt-4 pb-10">

          {/* Live badge */}
          <div className="inline-flex items-center gap-2 border text-xs font-semibold px-4 py-1.5 rounded-full mb-7"
            style={{ background: "rgba(217,119,6,0.12)", borderColor: "rgba(217,119,6,0.35)", color: "#fcd34d" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#fbbf24" }} />
            現在有&nbsp;<AnimatedTruckCount count={nearbyTrucks} />&nbsp;台車可即時調派
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight mb-4 max-w-lg">
            富詠運輸
            <br />
            <span style={{ color: "#fbbf24" }}>最快30分鐘</span>到車
          </h1>

          <p className="text-slate-300 text-base sm:text-lg font-medium mb-1.5">
            全台接單 · 專業物流 · 即時派車
          </p>
          <p className="text-slate-400/80 text-sm mb-9">
            箱型車 · 冷藏車 · 尾門車 · 平板車，一鍵搞定
          </p>

          {/* Primary CTA */}
          <Link href="/customer/order">
            <button className="group relative inline-flex items-center gap-3 text-white font-black text-3xl sm:text-4xl px-12 sm:px-16 py-6 sm:py-7 rounded-2xl transition-all mb-4"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 20px 50px rgba(217,119,6,0.4)" }}>
              <Truck className="w-8 h-8 sm:w-9 sm:h-9" />
              立即叫車
              <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 group-hover:translate-x-1.5 transition-transform" />
            </button>
          </Link>

          <p className="text-amber-300/80 text-sm font-semibold mb-2">免註冊 · 1分鐘完成下單</p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1.5">
            <Link href="/quick">
              <button className="inline-flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-sm font-semibold px-5 py-2.5 rounded-full transition-colors">
                <Zap className="w-3.5 h-3.5" />
                零散客快速接單（免登入）
              </button>
            </Link>
            <Link href="/chat">
              <button className="inline-flex items-center gap-2 bg-white/8 hover:bg-white/14 border border-white/15 text-slate-200 text-sm font-medium px-5 py-2.5 rounded-full transition-colors">
                AI 客服報價下單
              </button>
            </Link>
          </div>

          {/* Live chips */}
          <div className="mt-7 flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white/8 border border-white/12 text-slate-200/90 text-xs font-medium px-3.5 py-2 rounded-full">
              <Clock className="w-3.5 h-3.5" style={{ color: "#fbbf24" }} />
              預估 <span className="font-black mx-0.5" style={{ color: "#fcd34d" }}>{etaMin}</span> 分鐘到達
            </div>
            <div className="flex items-center gap-1.5 bg-white/8 border border-white/12 text-slate-200/90 text-xs font-medium px-3.5 py-2 rounded-full">
              <Truck className="w-3.5 h-3.5 text-blue-300" />
              <AnimatedTruckCount count={nearbyTrucks} /> 台車待命中
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center pb-6 text-slate-500 text-xs gap-1">
          <span>向下了解更多</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </section>

      {/* ── TRUST METRICS ─────────────────────────────────────────── */}
      <section className="py-10 px-5" style={{ background: "linear-gradient(90deg, #071829, #0c2444, #071829)" }}>
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { icon: CheckCircle, value: 12500, suffix: "+", label: "已完成訂單", color: "#34d399" },
            { icon: Building2, value: 380, suffix: "+", label: "服務企業", color: "#93c5fd" },
            { icon: Star, value: 4.9, suffix: "★", label: "客戶評分", color: "#fbbf24" },
          ].map(({ icon: Icon, value, suffix, label, color }) => (
            <div key={label} className="relative">
              <div className="w-8 h-8 mx-auto mb-2.5 flex items-center justify-center rounded-xl"
                style={{ background: `${color}18` }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white leading-none tabular-nums">
                {typeof value === "number" && value > 100 ? <Counter target={value} suffix={suffix} /> : <>{value}{suffix}</>}
              </p>
              <p className="text-slate-400 text-xs mt-1.5 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── QUICK ORDER ───────────────────────────────────────────── */}
      <section className="bg-white py-14 px-5">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-3.5 py-1 rounded-full mb-3">一鍵快速下單</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">30秒完成叫車</h2>
            <p className="text-slate-500 text-sm mt-2">只需填電話與取貨地址，其他資料後補</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-100/80 p-6">
            <QuickOrderForm />
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[
              { icon: Zap, text: "即時調派" },
              { icon: Shield, text: "安全有保障" },
              { icon: Clock, text: "24H服務" },
              { icon: Users, text: "專業司機" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-full">
                <Icon className="w-3.5 h-3.5" style={{ color: "#1d4ed8" }} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VEHICLE TYPES ─────────────────────────────────────────── */}
      <section className="bg-slate-50 py-14 px-5">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <span className="inline-block bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold px-3.5 py-1 rounded-full mb-3">車型方案</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">選擇適合您的車型</h2>
            <p className="text-slate-500 text-sm mt-2">依貨物大小選車，報價透明不收隱藏費</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "🚐", type: "箱型車", capacity: "1.5噸", desc: "一般貨物、電器運送首選", from: "800", popular: false },
              { icon: "🚛", type: "冷藏車", capacity: "1.5–5噸", desc: "食品、藥品、低溫食材", from: "1,200", popular: true },
              { icon: "🚚", type: "尾門車", capacity: "2–5噸", desc: "重型貨物、工廠機械設備", from: "1,500", popular: false },
              { icon: "🏗️", type: "平板車", capacity: "5–20噸", desc: "大型工程機具、超長貨物", from: "2,500", popular: false },
            ].map(v => (
              <div key={v.type}
                className={`relative bg-white rounded-2xl p-4 border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${v.popular ? "border-amber-300 shadow-amber-100" : "border-slate-100"}`}>
                {v.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "#d97706" }}>最受歡迎</span>
                )}
                <div className="text-3xl mb-2.5">{v.icon}</div>
                <p className="font-black text-slate-900 text-base">{v.type}</p>
                <p className="text-xs text-slate-400 mb-2.5">{v.capacity} · {v.desc}</p>
                <p className="text-xs text-slate-400">起價</p>
                <p className="font-black text-amber-600 text-lg">NT${v.from}<span className="text-xs font-normal text-slate-400"> 起</span></p>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center">
            <Link href="/quick">
              <button className="inline-flex items-center gap-2 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all shadow-lg"
                style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)", boxShadow: "0 8px 20px rgba(29,78,216,0.25)" }}>
                <Zap className="w-4 h-4" /> 立即免費報價
              </button>
            </Link>
            <p className="text-xs text-slate-400 mt-2">最快 3 分鐘完成報價，確認後即時派車</p>
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE ────────────────────────────────────────────── */}
      <section className="py-14 px-5" style={{ background: "linear-gradient(145deg, #071829 0%, #0c2444 60%, #0f2a50 100%)" }}>
        <div className="max-w-md mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 border text-xs font-semibold px-3.5 py-1 rounded-full mb-5"
            style={{ background: "rgba(217,119,6,0.12)", borderColor: "rgba(217,119,6,0.35)", color: "#fcd34d" }}>
            <Sparkles className="w-3.5 h-3.5" />
            企業方案
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2.5">專屬企業物流服務</h2>
          <p className="text-slate-400 text-sm mb-7">月結帳期 · 專屬報價 · 優先調派</p>

          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { label: "月結帳期", icon: "📅" },
              { label: "專屬報價", icon: "💰" },
              { label: "優先派車", icon: "🚀" },
            ].map(item => (
              <div key={item.label} className="bg-white/6 border border-white/10 rounded-2xl py-5 text-center hover:bg-white/10 transition-colors">
                <div className="text-2xl mb-1.5">{item.icon}</div>
                <p className="text-slate-200 text-xs font-semibold">{item.label}</p>
              </div>
            ))}
          </div>

          <Link href="/enterprise/login">
            <button className="w-full py-4 text-white font-bold text-base rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 mb-3"
              style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 16px 32px rgba(217,119,6,0.3)" }}>
              <Building2 className="w-5 h-5" />
              企業快速接單入口
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <p className="text-slate-500 text-sm">
            還沒帳號？
            <Link href="/enterprise/login">
              <span className="font-semibold cursor-pointer hover:underline ml-1" style={{ color: "#fcd34d" }}>3分鐘開通</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ── REVIEWS ───────────────────────────────────────────────── */}
      <section className="bg-slate-50 py-14 px-5">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-3.5 py-1 rounded-full mb-3">客戶評價</span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">他們都信任富詠</h2>
          </div>
          <div className="space-y-4">
            {reviews.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-md shadow-slate-100 border border-slate-100 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                    style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)" }}>
                    {r.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{r.name}</p>
                        <p className="text-slate-400 text-xs truncate">{r.company}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {Array.from({ length: r.stars }).map((_, j) => (
                          <Star key={j} className="w-3.5 h-3.5 fill-amber-400" style={{ color: "#fbbf24" }} />
                        ))}
                      </div>
                    </div>
                    <p className="text-slate-600 text-sm mt-2.5 leading-relaxed">{r.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ────────────────────────────────────────────── */}
      <section className="py-14 px-5 text-center" style={{ background: "linear-gradient(135deg, #071829, #0c2444)" }}>
        <div className="mb-1.5 inline-flex items-center gap-1.5 bg-white/6 border border-white/10 text-slate-300 text-xs font-medium px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          24小時全天候服務中
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white mt-4 mb-2">現在就叫車</h2>
        <p className="text-slate-400 text-sm mb-7">最快30分鐘，司機到府服務</p>
        <Link href="/customer/order">
          <button className="inline-flex items-center gap-2.5 text-white font-bold text-lg px-10 py-4 rounded-xl shadow-2xl active:scale-[0.97] transition-all"
            style={{ background: "linear-gradient(135deg, #d97706, #f59e0b)", boxShadow: "0 16px 40px rgba(217,119,6,0.35)" }}>
            <Truck className="w-5 h-5" />
            立即叫車
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────── */}
      <footer className="py-10 px-5" style={{ background: "#050e1a" }}>
        <div className="max-w-lg mx-auto">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 mb-7">
            <div>
              <p className="text-white font-black text-base mb-1">富詠運輸</p>
              <p className="text-slate-600 text-xs">全台物流 · 快速派車 · 專業到府</p>
              <p className="text-slate-700 text-xs mt-1.5">客服：0800-XXX-XXX</p>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-slate-600 text-xs mb-3">各身份登入</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center sm:justify-end">
                <Link href="/quick"><span className="text-amber-500 hover:text-amber-400 text-xs font-semibold transition-colors cursor-pointer">快速下單</span></Link>
                <Link href="/chat"><span className="text-emerald-500 hover:text-emerald-400 text-xs font-semibold transition-colors cursor-pointer">AI 客服</span></Link>
                <Link href="/login"><span className="text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">客戶登入</span></Link>
                <Link href="/driver"><span className="text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">司機登入</span></Link>
                <Link href="/enterprise/login"><span className="text-slate-500 hover:text-slate-300 text-xs transition-colors cursor-pointer">企業登入</span></Link>
                {/* 後台管理入口：不顯示，直接輸入 /admin 進入 */}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-900 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-slate-700 text-xs">© 富詠運輸股份有限公司 版權所有</p>
            <div className="flex gap-4">
              <span className="text-slate-700 text-xs hover:text-slate-500 cursor-pointer transition-colors">服務條款</span>
              <span className="text-slate-700 text-xs hover:text-slate-500 cursor-pointer transition-colors">隱私政策</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
