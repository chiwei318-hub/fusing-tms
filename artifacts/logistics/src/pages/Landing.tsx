import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Truck, Star, Phone, MapPin, ArrowRight, CheckCircle,
  Building2, Zap, Clock, Users, Shield, ChevronDown, Sparkles,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL + "api";

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
    <span
      className={`font-black text-orange-300 tabular-nums transition-all duration-300 inline-block ${animate ? "scale-150 text-yellow-300" : "scale-100"}`}
    >
      {count}
    </span>
  );
}

const reviews = [
  { name: "王先生", company: "順達五金有限公司", stars: 5, text: "下午三點叫車，十八分鐘就到了！司機很專業，貨物完好無缺，推薦！" },
  { name: "林小姐", company: "欣葉餐飲集團", stars: 5, text: "長期配合兩年，每次準時，報價透明，再也不用擔心出貨問題。" },
  { name: "陳經理", company: "台北倉儲物流股份有限公司", stars: 5, text: "一次搬三個點，全部到位，司機還幫忙確認簽收。超乎期待。" },
];

interface QuickOrderSuccess { orderId: number; priceMin: number; priceMax: number; }

function QuickOrderForm() {
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<QuickOrderSuccess | null>(null);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/quick-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pickupAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "送出失敗");
      setSuccess(data);
    } catch (err: any) {
      setError(err.message ?? "送出失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center space-y-4 py-2">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <p className="font-black text-gray-900 text-xl">已送出！客服將聯絡你</p>
          <p className="text-gray-500 text-sm mt-1">訂單編號 #{success.orderId}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-orange-600 font-semibold mb-1">系統預估費用</p>
          <p className="text-2xl font-black text-orange-600">
            NT${success.priceMin.toLocaleString()} – NT${success.priceMax.toLocaleString()}
          </p>
          <p className="text-xs text-orange-500 mt-1">確切報價由調度員與你確認</p>
        </div>
        <p className="text-xs text-gray-400">通常 15 分鐘內有人聯絡你</p>
        <button
          onClick={() => { setSuccess(null); setPhone(""); setAddress(""); }}
          className="text-xs text-[#1a3a8f] underline"
        >
          再下一單
        </button>
      </div>
    );
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
      {error && <p className="text-red-500 text-xs text-center">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-5 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 text-white font-black text-xl rounded-2xl shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2"
      >
        <Zap className="w-6 h-6" />
        {loading ? "送出中..." : "快速叫車"}
        {!loading && <ArrowRight className="w-5 h-5" />}
      </button>
      <p className="text-center text-xs text-gray-400">其他資料後補，司機接單後聯繫你</p>
    </form>
  );
}

export default function Landing() {
  const { nearbyTrucks, etaMin } = useLiveStats();

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen bg-gradient-to-b from-[#05152e] via-[#0d2d6e] to-[#1a3a8f] flex flex-col overflow-hidden">

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Nav */}
        <div className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <img
              src="/logo-transparent.png"
              alt="富詠運輸"
              className="h-10 sm:h-12 w-auto object-contain drop-shadow-lg"
            />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <button className="hidden sm:flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-3 py-2 rounded-full transition-colors">
                <Building2 className="w-3.5 h-3.5" />
                後台管理
              </button>
            </Link>
            <a href="tel:0800000000" className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-3 py-2 rounded-full transition-colors">
              <Phone className="w-3.5 h-3.5" />
              免費客服
            </a>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 text-center pt-6 pb-8">

          {/* Live badge — animated truck count */}
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-300 text-xs font-bold px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            現在有&nbsp;<AnimatedTruckCount count={nearbyTrucks} />&nbsp;台車可即時調派
          </div>

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

          {/* ★ PRIMARY CTA — 1.5x bigger */}
          <Link href="/customer/order">
            <button className="group relative inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-400 active:scale-[0.97] text-white font-black text-3xl sm:text-4xl px-14 sm:px-16 py-7 sm:py-8 rounded-3xl shadow-2xl shadow-orange-500/50 transition-all mb-3">
              <Truck className="w-8 h-8 sm:w-10 sm:h-10" />
              立即叫車
              <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          <p className="text-orange-200 text-sm font-bold mb-1">👉 免註冊・1分鐘完成下單</p>
          <p className="text-blue-300/60 text-xs">不用先填齊所有資料，司機確認後再補</p>

          {/* Live chips */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              預估 <span className="text-orange-300 font-black">{etaMin}</span> 分鐘到達
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
              <Truck className="w-3.5 h-3.5 text-blue-300" />
              <AnimatedTruckCount count={nearbyTrucks} /> 台車待命中
            </div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center pb-6 text-blue-300/50 text-xs gap-1">
          <span>向下了解更多</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </section>

      {/* ═══════════════ TRUST METRICS ═══════════════ */}
      <section className="bg-[#1a3a8f] py-10 px-5">
        <div className="max-w-lg mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { icon: CheckCircle, value: 12500, suffix: "+", label: "已完成訂單", color: "text-green-400" },
            { icon: Building2, value: 380, suffix: "+", label: "服務企業", color: "text-blue-300" },
            { icon: Star, value: 4.9, suffix: "★", label: "客戶評分", color: "text-orange-400" },
          ].map(({ icon: Icon, value, suffix, label, color }) => (
            <div key={label}>
              <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />
              <p className="text-2xl sm:text-3xl font-black text-white leading-none">
                {typeof value === "number" && value > 100 ? <Counter target={value} suffix={suffix} /> : <>{value}{suffix}</>}
              </p>
              <p className="text-blue-300 text-xs mt-1 font-medium">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ QUICK ORDER ═══════════════ */}
      <section className="bg-white py-12 px-5">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-7">
            <span className="inline-block bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full mb-3">一鍵快速下單</span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">30秒完成叫車</h2>
            <p className="text-gray-500 text-sm mt-2">只需填電話 + 取貨地址，其他資料後補</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-100 p-6">
            <QuickOrderForm />
          </div>
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

      {/* ═══════════════ ENTERPRISE ═══════════════ */}
      <section className="bg-gradient-to-br from-[#07152c] to-[#1a3a8f] py-14 px-5">
        <div className="max-w-md mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/30 text-orange-300 text-xs font-bold px-3 py-1 rounded-full mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            企業方案
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">專屬企業物流服務</h2>
          <p className="text-blue-200 text-sm mb-4">月結 · 專屬價格 · 優先派車</p>

          <div className="grid grid-cols-3 gap-3 mb-7">
            {[
              { label: "月結帳期", icon: "📅" },
              { label: "專屬報價", icon: "💰" },
              { label: "優先派車", icon: "🚀" },
            ].map(item => (
              <div key={item.label} className="bg-white/10 border border-white/10 rounded-2xl py-4 text-center">
                <div className="text-2xl mb-1">{item.icon}</div>
                <p className="text-white text-xs font-semibold">{item.label}</p>
              </div>
            ))}
          </div>

          <Link href="/enterprise/login">
            <button className="w-full py-4 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-white font-black text-lg rounded-2xl shadow-xl shadow-orange-500/30 transition-all flex items-center justify-center gap-2 mb-3">
              <Building2 className="w-5 h-5" />
              企業快速接單入口
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
          <p className="text-blue-300/70 text-sm">
            還沒帳號？
            <Link href="/enterprise/login">
              <span className="text-orange-300 font-bold cursor-pointer hover:underline"> 3分鐘開通 →</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ═══════════════ REVIEWS ═══════════════ */}
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

      {/* ═══════════════ BOTTOM CTA ═══════════════ */}
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

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="bg-[#07152c] py-8 px-5">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gray-600 text-xs mb-4">員工 / 司機入口</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link href="/customer"><span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">客戶中心</span></Link>
            <Link href="/enterprise/login"><span className="text-gray-500 hover:text-orange-400 text-xs underline underline-offset-2 transition-colors cursor-pointer">企業專屬</span></Link>
            <Link href="/driver"><span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">司機接單</span></Link>
            <Link href="/admin"><span className="text-gray-500 hover:text-gray-300 text-xs underline underline-offset-2 transition-colors cursor-pointer">後台管理</span></Link>
          </div>
          <p className="text-gray-700 text-xs mt-6">© 富詠運輸股份有限公司 · 客服：0800-XXX-XXX</p>
        </div>
      </footer>
    </div>
  );
}
