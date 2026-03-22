import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Truck, Star, Phone, MapPin, ArrowRight, CheckCircle,
  Building2, Zap, Clock, Users, Shield, ChevronDown,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Simulated live data (replace with real API later)
───────────────────────────────────────────── */
function useLiveStats() {
  const [nearbyTrucks, setNearbyTrucks] = useState(7);
  const [etaMin, setEtaMin] = useState(18);
  useEffect(() => {
    const t = setInterval(() => {
      setNearbyTrucks(v => Math.max(3, Math.min(15, v + (Math.random() > 0.5 ? 1 : -1))));
      setEtaMin(v => Math.max(10, Math.min(35, v + (Math.random() > 0.5 ? 1 : -1))));
    }, 4000);
    return () => clearInterval(t);
  }, []);
  return { nearbyTrucks, etaMin };
}

/* ─────────────────────────────────────────────
   Animated counter
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   Reviews data
───────────────────────────────────────────── */
const reviews = [
  {
    name: "王先生", company: "順達五金有限公司", stars: 5,
    text: "下午三點叫車，十八分鐘就到了！司機很專業，貨物完好無缺，推薦！",
  },
  {
    name: "林小姐", company: "欣葉餐飲集團", stars: 5,
    text: "長期配合兩年，每次準時，報價透明，再也不用擔心出貨問題。",
  },
  {
    name: "陳經理", company: "台北倉儲物流股份有限公司", stars: 5,
    text: "一次搬三個點，全部到位，司機還幫忙確認簽收。超乎期待。",
  },
];

/* ─────────────────────────────────────────────
   Quick-order mini form
───────────────────────────────────────────── */
function QuickOrderForm() {
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [, navigate] = useLocation();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem("quick-order-phone", phone);
    sessionStorage.setItem("quick-order-address", address);
    navigate("/customer/order");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="tel"
          required
          placeholder="您的聯絡電話"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30 focus:border-[#1a3a8f]"
        />
      </div>
      <div className="relative">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          required
          placeholder="取貨地址（縣市 + 地址）"
          value={address}
          onChange={e => setAddress(e.target.value)}
          className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]/30 focus:border-[#1a3a8f]"
        />
      </div>
      <button
        type="submit"
        className="w-full py-4 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-black text-base rounded-xl shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2"
      >
        <Zap className="w-5 h-5" />
        立即下單，馬上派車
        <ArrowRight className="w-4 h-4" />
      </button>
      <p className="text-center text-xs text-gray-400">其他資訊填完整後再補齊，司機接單後聯繫您</p>
    </form>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export default function Landing() {
  const { nearbyTrucks, etaMin } = useLiveStats();

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ══════════════════════════════════════
          HERO — dark blue gradient, full-screen
      ═══════════════════════════════════════ */}
      <section className="relative min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col overflow-hidden">

        {/* Background glow blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top nav bar */}
        <div className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/40">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="font-black text-white text-sm tracking-wide">富詠運輸</p>
              <p className="text-blue-300 text-[10px]">FUYI TRANSPORT</p>
            </div>
          </div>
          <a href="tel:0800000000"
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-3 py-2 rounded-full transition-colors">
            <Phone className="w-3.5 h-3.5" />
            免費客服
          </a>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 text-center pt-6 pb-8">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-bold px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            現在有 {nearbyTrucks} 台車可即時調派
          </div>

          {/* Main headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight mb-4 max-w-lg">
            富詠運輸
            <br />
            <span className="text-orange-400">最快30分鐘</span>到車
          </h1>

          <p className="text-blue-200 text-base sm:text-lg font-medium mb-2">
            全台接單 · 專業物流 · 即時派車
          </p>
          <p className="text-blue-300/70 text-sm mb-8">
            箱型車 · 冷藏車 · 尾門車 · 平板車，一鍵搞定
          </p>

          {/* Primary CTA */}
          <Link href="/customer/order">
            <button className="group relative inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-400 active:scale-[0.97] text-white font-black text-xl sm:text-2xl px-10 py-5 sm:py-6 rounded-2xl shadow-2xl shadow-orange-500/40 transition-all mb-4">
              <Truck className="w-6 h-6 sm:w-7 sm:h-7" />
              立即叫車
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>

          <p className="text-blue-300/60 text-xs">不用先填齊所有資料，司機確認後再補</p>

          {/* Live ETA chip */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              預估 <span className="text-orange-300 font-black">{etaMin}</span> 分鐘到達
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
              <Truck className="w-3.5 h-3.5 text-blue-300" />
              <span className="text-blue-200 font-black">{nearbyTrucks}</span> 台車待命中
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 flex flex-col items-center pb-6 text-blue-300/50 text-xs gap-1">
          <span>向下了解更多</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </section>

      {/* ══════════════════════════════════════
          TRUST METRICS
      ═══════════════════════════════════════ */}
      <section className="bg-[#1a3a8f] py-10 px-5">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { icon: CheckCircle, value: 12500, suffix: "+", label: "已完成訂單", color: "text-green-400" },
            { icon: Building2, value: 380, suffix: "+", label: "服務企業", color: "text-blue-300" },
            { icon: Star, value: 4.9, suffix: "★", label: "客戶評分", color: "text-orange-400" },
          ].map(({ icon: Icon, value, suffix, label, color }) => (
            <div key={label}>
              <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />
              <p className={`text-2xl sm:text-3xl font-black text-white leading-none`}>
                {typeof value === "number" && value > 100
                  ? <Counter target={value} suffix={suffix} />
                  : <>{value}{suffix}</>}
              </p>
              <p className="text-blue-300 text-xs mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════
          QUICK ORDER FORM
      ═══════════════════════════════════════ */}
      <section className="bg-white py-12 px-5">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-7">
            <span className="inline-block bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full mb-3">快速下單</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
              30秒完成叫車
            </h2>
            <p className="text-gray-500 text-sm mt-2">只需填電話 + 取貨地址，其他資料後補</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-100 p-6">
            <QuickOrderForm />
          </div>

          {/* Feature pills */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {[
              { icon: Zap, text: "即時調派" },
              { icon: Shield, text: "安全有保障" },
              { icon: Clock, text: "24H服務" },
              { icon: Users, text: "專業司機" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-full">
                <Icon className="w-3.5 h-3.5 text-[#1a3a8f]" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CUSTOMER REVIEWS
      ═══════════════════════════════════════ */}
      <section className="bg-blue-50 py-12 px-5">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-7">
            <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-3">客戶評價</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900">他們都信任富詠</h2>
          </div>

          <div className="space-y-4">
            {reviews.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-blue-100/60">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#1a3a8f] to-blue-600 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0">
                    {r.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{r.name}</p>
                        <p className="text-gray-400 text-xs truncate">{r.company}</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {Array.from({ length: r.stars }).map((_, j) => (
                          <Star key={j} className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-gray-700 text-sm mt-2.5 leading-relaxed">{r.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          BOTTOM CTA
      ═══════════════════════════════════════ */}
      <section className="bg-gradient-to-r from-orange-500 to-orange-600 py-10 px-5 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">現在就叫車</h2>
        <p className="text-orange-100 text-sm mb-6">最快30分鐘，司機到府</p>
        <Link href="/customer/order">
          <button className="inline-flex items-center gap-2 bg-white text-orange-600 font-black text-lg px-8 py-4 rounded-2xl shadow-xl active:scale-[0.97] transition-transform">
            <Truck className="w-5 h-5" />
            立即叫車
            <ArrowRight className="w-4 h-4" />
          </button>
        </Link>
      </section>

      {/* ══════════════════════════════════════
          FOOTER — portal access for staff
      ═══════════════════════════════════════ */}
      <footer className="bg-[#07152c] py-8 px-5">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-600 text-xs mb-4">員工 / 司機入口</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link href="/customer">
              <span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">
                客戶中心
              </span>
            </Link>
            <Link href="/enterprise/login">
              <span className="text-gray-500 hover:text-orange-400 text-xs underline underline-offset-2 transition-colors cursor-pointer">
                企業專屬
              </span>
            </Link>
            <Link href="/driver">
              <span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">
                司機接單
              </span>
            </Link>
            <Link href="/admin">
              <span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">
                後台管理
              </span>
            </Link>
          </div>
          <p className="text-gray-700 text-xs mt-6">© 富詠運輸股份有限公司 · 客服：0800-XXX-XXX</p>
        </div>
      </footer>
    </div>
  );
}
