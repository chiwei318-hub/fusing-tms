import { useEffect, useState } from "react";
import { Download, ChevronLeft, ChevronRight, FileText, Clock } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";
import { type Order } from "@workspace/db";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:     { label: "待派車", color: "bg-amber-100 text-amber-700" },
  assigned:    { label: "已派車", color: "bg-blue-100 text-blue-700" },
  in_transit:  { label: "運送中", color: "bg-purple-100 text-purple-700" },
  delivered:   { label: "已完成", color: "bg-emerald-100 text-emerald-700" },
  cancelled:   { label: "已取消", color: "bg-gray-100 text-gray-500" },
};

type MonthlyData = { orders: Order[]; totalFee: number; orderCount: number; year: number; month: number };

export default function EnterpriseOrders({ session }: { session: EnterpriseSession }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/enterprise/${session.id}/orders?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.id, year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    const today = new Date();
    if (year === today.getFullYear() && month === today.getMonth() + 1) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function exportCsv() {
    window.open(`${BASE}/api/enterprise/${session.id}/orders/export?year=${year}&month=${month}`);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0d2d6e]" />
          對帳報表
        </h1>
        <button onClick={exportCsv}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-[0.97]">
          <Download className="w-4 h-4" />
          匯出 Excel
        </button>
      </div>

      {/* Month picker */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-black text-lg text-gray-900">{year} 年 {month} 月</span>
          <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Summary */}
        {data && (
          <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-gray-50">
            <div className="text-center">
              <p className="text-2xl font-black text-[#0d2d6e]">{data.orderCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">訂單筆數</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-emerald-600">NT${data.totalFee.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">本月總金額</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-orange-500">
                {data.orderCount > 0 ? `NT${Math.round(data.totalFee / data.orderCount).toLocaleString()}` : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">每筆均價</p>
            </div>
          </div>
        )}
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <span className="font-bold text-gray-900 text-sm">訂單明細</span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">載入中...</div>
        ) : !data || data.orders.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">本月無訂單紀錄</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs font-semibold">
                  <th className="px-4 py-3 text-left">編號</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">取貨地址</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">貨品</th>
                  <th className="px-4 py-3 text-left">狀態</th>
                  <th className="px-4 py-3 text-right">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.orders.map(order => {
                  const s = STATUS_MAP[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-500" };
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#0d2d6e]">#{order.id}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString("zh-TW")}
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden sm:table-cell max-w-[180px] truncate">
                        {order.pickupAddress}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell max-w-[140px] truncate">
                        {order.cargoDescription}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {order.totalFee ? `NT$${order.totalFee.toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700 hidden md:table-cell">合計</td>
                  <td colSpan={2} className="px-4 py-3 text-right font-black text-[#0d2d6e] text-base">
                    NT${data.totalFee.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
