import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  FileText, Zap, Phone, Building2, CreditCard, Star,
  TrendingUp, Package, CheckCircle, Clock, ArrowRight,
} from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MonthlySummary = { year: number; month: number; count: number; total: number };

export default function EnterpriseDashboard({ session }: { session: EnterpriseSession }) {
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [thisMonth, setThisMonth] = useState<{ totalFee: number; orderCount: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    fetch(`${BASE}/api/enterprise/${session.id}/monthly-summary`)
      .then(r => r.json()).then(setSummary).catch(() => {});

    fetch(`${BASE}/api/enterprise/${session.id}/orders?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then(r => r.json()).then(d => setThisMonth({ totalFee: d.totalFee, orderCount: d.orderCount })).catch(() => {});
  }, [session.id]);

  const now = new Date();
  const creditUsed = thisMonth?.totalFee ?? 0;
  const creditPct = session.creditLimit > 0 ? Math.min(100, (creditUsed / session.creditLimit) * 100) : 0;
  const creditColor = creditPct > 85 ? "bg-red-500" : creditPct > 60 ? "bg-orange-500" : "bg-emerald-500";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#0d2d6e] to-[#1a3a8f] rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-blue-300 text-sm font-medium">{now.getFullYear()}年{now.getMonth() + 1}月</p>
            <h1 className="text-2xl font-black mt-0.5">
              歡迎，{session.contactPerson}
            </h1>
            <p className="text-blue-200 text-sm mt-1">{session.companyName}</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {session.priorityDispatch && (
              <span className="flex items-center gap-1.5 bg-orange-500/25 border border-orange-400/40 text-orange-300 text-xs font-bold px-3 py-1.5 rounded-full">
                <Zap className="w-3 h-3" /> 優先派車
              </span>
            )}
            {session.discountPercent > 0 && (
              <span className="flex items-center gap-1.5 bg-green-500/20 border border-green-400/30 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full">
                <Star className="w-3 h-3" /> {session.discountPercent}% 專屬折扣
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border
              ${session.billingType === "monthly" ? "bg-purple-500/20 border-purple-400/30 text-purple-300" : "bg-blue-500/20 border-blue-400/30 text-blue-300"}`}>
              <CreditCard className="w-3 h-3" />
              {session.billingType === "monthly" ? "月結客戶" : "預付客戶"}
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/enterprise/quick-order">
          <div className="bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white rounded-2xl p-4 cursor-pointer transition-all shadow-lg shadow-orange-500/25 flex flex-col gap-2">
            <Zap className="w-5 h-5" />
            <p className="font-black text-base leading-tight">快速下單</p>
            <p className="text-orange-100 text-xs">使用常用範本</p>
          </div>
        </Link>
        <Link href="/enterprise/orders">
          <div className="bg-white hover:bg-gray-50 active:scale-[0.98] rounded-2xl p-4 cursor-pointer transition-all border border-gray-100 shadow-sm flex flex-col gap-2">
            <FileText className="w-5 h-5 text-[#0d2d6e]" />
            <p className="font-black text-base text-gray-900 leading-tight">對帳報表</p>
            <p className="text-gray-500 text-xs">查看帳單明細</p>
          </div>
        </Link>
        <a href="tel:0800000000" className="block">
          <div className="bg-white hover:bg-gray-50 active:scale-[0.98] rounded-2xl p-4 cursor-pointer transition-all border border-gray-100 shadow-sm flex flex-col gap-2">
            <Phone className="w-5 h-5 text-emerald-500" />
            <p className="font-black text-base text-gray-900 leading-tight">專屬客服</p>
            <p className="text-gray-500 text-xs">立即通話</p>
          </div>
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Package, label: "本月訂單", value: thisMonth?.orderCount ?? 0, unit: "筆", color: "text-blue-600" },
          { icon: TrendingUp, label: "本月消費", value: `NT$${((thisMonth?.totalFee ?? 0) / 1000).toFixed(1)}k`, unit: "", color: "text-orange-500" },
          { icon: CheckCircle, label: "累計訂單", value: summary.reduce((s, r) => s + r.count, 0), unit: "筆", color: "text-emerald-600" },
          { icon: Star, label: "折扣優惠", value: session.discountPercent, unit: "%", color: "text-purple-600" },
        ].map(({ icon: Icon, label, value, unit, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <Icon className={`w-5 h-5 ${color} mb-2`} />
            <p className={`text-xl font-black ${color} leading-none`}>{value}{unit}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Credit status (if monthly billing) */}
      {session.billingType === "monthly" && session.creditLimit > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#0d2d6e]" />
              <span className="font-bold text-gray-900 text-sm">月結信用額度</span>
            </div>
            <span className="text-xs text-gray-500">
              NT${creditUsed.toLocaleString()} / NT${session.creditLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${creditColor}`} style={{ width: `${creditPct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {creditPct > 85
              ? "⚠️ 額度即將用盡，請聯繫客服"
              : `剩餘 NT$${(session.creditLimit - creditUsed).toLocaleString()}`}
          </p>
        </div>
      )}

      {/* Exclusive perks */}
      {session.exclusiveNote && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-purple-600" />
            <span className="font-bold text-purple-900 text-sm">專屬服務說明</span>
          </div>
          <p className="text-purple-700 text-sm leading-relaxed">{session.exclusiveNote}</p>
        </div>
      )}

      {/* Recent months summary */}
      {summary.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <span className="font-bold text-gray-900 text-sm">近期月份統計</span>
            <Link href="/enterprise/orders">
              <span className="text-xs text-orange-500 font-semibold flex items-center gap-1 cursor-pointer hover:text-orange-600">
                完整報表 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {summary.slice(0, 4).map(row => (
              <div key={`${row.year}-${row.month}`} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-700 font-medium">{row.year}年{row.month}月</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">{row.count} 筆</span>
                  <span className="font-bold text-[#0d2d6e]">NT${row.total.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
