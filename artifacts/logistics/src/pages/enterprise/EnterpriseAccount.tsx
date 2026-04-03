import { useLocation } from "wouter";
import {
  Building2, Phone, Mail, User, CreditCard, Star, Zap,
  LogOut, Shield, FileText, MapPin, Briefcase, Receipt,
  CalendarDays, Tag, TrendingUp, Clock, BadgeCheck,
} from "lucide-react";
import { type EnterpriseSession, clearEnterpriseSession } from "@/components/EnterpriseLayout";

export default function EnterpriseAccount({ session }: { session: EnterpriseSession }) {
  const [, navigate] = useLocation();

  function logout() {
    clearEnterpriseSession();
    navigate("/enterprise/login");
  }

  const val = (v: string | number | boolean | null | undefined, fallback = "—") => {
    if (v === null || v === undefined || v === "") return fallback;
    if (typeof v === "boolean") return v ? "是" : "否";
    return String(v);
  };

  const money = (v: number | null | undefined) =>
    v ? `NT$${v.toLocaleString()}` : "—";

  const Row = ({ icon: Icon, label, value, highlight }: {
    icon: React.ElementType; label: string; value: string; highlight?: boolean;
  }) => (
    <div className="px-5 py-3.5 flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="text-sm text-gray-500 w-28 shrink-0">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-[#0d2d6e]" : "text-gray-900"}`}>{value}</span>
    </div>
  );

  const SectionTitle = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
      <Icon className="w-4 h-4 text-[#0d2d6e]" />
      <span className="text-xs font-bold text-[#0d2d6e] uppercase tracking-wide">{title}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        <User className="w-5 h-5 text-[#0d2d6e]" />
        帳戶資料
      </h1>

      {/* Header card */}
      <div className="bg-gradient-to-r from-[#0d2d6e] to-[#1a3a8f] rounded-2xl px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-white text-lg leading-tight">{session.companyName}</h2>
              {session.shortName && (
                <span className="text-xs bg-white/20 text-white/80 px-2 py-0.5 rounded-full">{session.shortName}</span>
              )}
              {session.isVip && (
                <span className="text-xs bg-yellow-400/20 text-yellow-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="w-3 h-3" />VIP
                </span>
              )}
            </div>
            <p className="text-blue-300 text-sm mt-0.5">帳號：{session.accountCode}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {session.priorityDispatch && (
            <span className="text-xs bg-orange-500/20 border border-orange-400/30 text-orange-300 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <Zap className="w-3 h-3" />優先派車
            </span>
          )}
          {session.priceLevel && (
            <span className="text-xs bg-blue-400/20 text-blue-200 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
              <Tag className="w-3 h-3" />{session.priceLevel}
            </span>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            session.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
          }`}>
            {session.status === "active" ? "帳號正常" : "帳號停用"}
          </span>
        </div>
      </div>

      {/* 1. 基本聯絡資料 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionTitle icon={User} title="基本聯絡資料" />
        <div className="divide-y divide-gray-50">
          <Row icon={User}      label="聯絡人"   value={val(session.contactPerson)} />
          <Row icon={Phone}     label="聯絡電話" value={val(session.phone)} />
          <Row icon={Mail}      label="電子信箱" value={val(session.email)} />
          <Row icon={Briefcase} label="行業別"   value={val(session.industry)} />
        </div>
      </div>

      {/* 2. 公司法務資料 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionTitle icon={FileText} title="公司法務資料" />
        <div className="divide-y divide-gray-50">
          <Row icon={Building2} label="公司全名"   value={val(session.companyName)} />
          {session.shortName && <Row icon={Building2} label="簡稱" value={val(session.shortName)} />}
          <Row icon={Receipt}   label="統一編號"   value={val(session.taxId)} />
          <Row icon={FileText}  label="發票抬頭"   value={val(session.invoiceTitle)} />
        </div>
      </div>

      {/* 3. 地址資訊 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionTitle icon={MapPin} title="地址資訊" />
        <div className="divide-y divide-gray-50">
          <Row icon={MapPin} label="通訊地址" value={val(session.address)} />
          <Row icon={MapPin} label="郵遞區號" value={val(session.postalCode)} />
        </div>
      </div>

      {/* 4. 帳款條件 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionTitle icon={CreditCard} title="帳款條件" />
        <div className="divide-y divide-gray-50">
          <Row icon={CreditCard}  label="結帳方式"     value={session.billingType === "monthly" ? "月結" : session.billingType === "prepaid" ? "預付" : val(session.billingType)} />
          <Row icon={CreditCard}  label="付款方式"     value={val(session.paymentType)} />
          <Row icon={TrendingUp}  label="月結額度"     value={money(session.creditLimit)} />
          <Row icon={Clock}       label="帳期天數"     value={session.creditDays ? `${session.creditDays} 天` : "—"} />
          <Row icon={CalendarDays} label="月結日"      value={session.monthlyStatementDay ? `每月 ${session.monthlyStatementDay} 日` : "—"} />
          <Row icon={Tag}         label="折扣"         value={session.discountPercent > 0 ? `${session.discountPercent}% OFF` : "無折扣"} highlight={session.discountPercent > 0} />
          <Row icon={Tag}         label="價格等級"     value={val(session.priceLevel)} />
          <Row icon={TrendingUp}  label="固定單價"     value={money(session.unitPriceFixed)} />
          <Row icon={TrendingUp}  label="最低月消費"   value={money(session.minMonthlySpend)} />
        </div>
      </div>

      {/* 5. 合約資訊 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <SectionTitle icon={CalendarDays} title="合約資訊" />
        <div className="divide-y divide-gray-50">
          <Row icon={FileText}    label="合約類型"   value={val(session.contractType)} />
          <Row icon={CalendarDays} label="合約開始"  value={val(session.contractStart)} />
          <Row icon={CalendarDays} label="合約到期"  value={val(session.contractEnd)} />
        </div>
        {session.exclusiveNote && (
          <div className="mx-4 mb-4 mt-1 p-3 bg-blue-50 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1">專屬服務說明</p>
            <p className="text-xs text-blue-600 leading-relaxed">{session.exclusiveNote}</p>
          </div>
        )}
        {session.notes && (
          <div className="mx-4 mb-4 mt-1 p-3 bg-amber-50 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-1">備註</p>
            <p className="text-xs text-amber-600 leading-relaxed">{session.notes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        <a href="tel:0800000000"
          className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
          <Phone className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-gray-900">聯繫專屬客服</span>
        </a>
        <div className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
          <Shield className="w-4 h-4 text-[#0d2d6e]" />
          <span className="text-sm font-semibold text-gray-900">修改密碼（聯繫客服）</span>
        </div>
        <div className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer">
          <BadgeCheck className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-900">服務合約下載</span>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 transition-colors text-left">
          <LogOut className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-red-600">登出帳號</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 pb-4">如需修改帳戶資料，請聯繫富詠運輸客服</p>
    </div>
  );
}
