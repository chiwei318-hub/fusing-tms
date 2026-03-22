import { useLocation } from "wouter";
import {
  Building2, Phone, Mail, User, CreditCard, Star, Zap,
  LogOut, Shield, FileText,
} from "lucide-react";
import { type EnterpriseSession, clearEnterpriseSession } from "@/components/EnterpriseLayout";

export default function EnterpriseAccount({ session }: { session: EnterpriseSession }) {
  const [, navigate] = useLocation();

  function logout() {
    clearEnterpriseSession();
    navigate("/enterprise/login");
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        <User className="w-5 h-5 text-[#0d2d6e]" />
        帳戶設定
      </h1>

      {/* Company info card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#0d2d6e] to-[#1a3a8f] px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-black text-white text-lg leading-tight">{session.companyName}</h2>
              <p className="text-blue-300 text-sm mt-0.5">帳號：{session.accountCode}</p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {[
            { icon: User, label: "聯絡人", value: session.contactPerson },
            { icon: Phone, label: "聯絡電話", value: session.phone },
            { icon: Mail, label: "電子信箱", value: session.email ?? "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="px-5 py-3.5 flex items-center gap-3">
              <Icon className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 w-20 shrink-0">{label}</span>
              <span className="text-sm font-semibold text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Billing & credit */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-[#0d2d6e]" />
          帳款設定
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">付款方式</span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full
              ${session.billingType === "monthly" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
              {session.billingType === "monthly" ? "月結帳款" : "預付款項"}
            </span>
          </div>
          {session.billingType === "monthly" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">月結額度</span>
              <span className="text-sm font-bold text-gray-900">
                {session.creditLimit > 0 ? `NT$${session.creditLimit.toLocaleString()}` : "無上限"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Exclusive perks */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
          <Star className="w-4 h-4 text-orange-500" />
          專屬優惠
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">專屬折扣</span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full
              ${session.discountPercent > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {session.discountPercent > 0 ? `${session.discountPercent}% OFF` : "無折扣"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              優先派車
            </span>
            <span className={`text-sm font-bold px-3 py-1 rounded-full
              ${session.priorityDispatch ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
              {session.priorityDispatch ? "✓ 已開通" : "未開通"}
            </span>
          </div>
        </div>
        {session.exclusiveNote && (
          <div className="mt-4 p-3 bg-blue-50 rounded-xl">
            <p className="text-xs font-semibold text-blue-700 mb-1">專屬服務說明</p>
            <p className="text-xs text-blue-600 leading-relaxed">{session.exclusiveNote}</p>
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
          <FileText className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-900">服務合約下載</span>
        </div>
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 transition-colors text-left">
          <LogOut className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-red-600">登出帳號</span>
        </button>
      </div>
    </div>
  );
}
