import { useEffect, useState } from "react";
import { Download, ChevronLeft, ChevronRight, FileText, Clock, X, MapPin, Package, Truck, RotateCcw, Ban, CheckCircle } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";
import { type Order } from "@workspace/db";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:    { label: "待派車", color: "bg-amber-100 text-amber-700" },
  assigned:   { label: "已派車", color: "bg-blue-100 text-blue-700" },
  in_transit: { label: "運送中", color: "bg-purple-100 text-purple-700" },
  delivered:  { label: "已完成", color: "bg-emerald-100 text-emerald-700" },
  cancelled:  { label: "已取消", color: "bg-gray-100 text-gray-500" },
};

type MonthlyData = { orders: Order[]; totalFee: number; paid: number; unpaid: number; orderCount: number; year: number; month: number };

export default function EnterpriseOrders({ session }: { session: EnterpriseSession }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [, navigate] = useLocation();

  const loadOrders = () => {
    setLoading(true);
    fetch(`${BASE}/api/enterprise/${session.id}/orders?year=${year}&month=${month}&status=${statusFilter}`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { loadOrders(); }, [session.id, year, month, statusFilter]);

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

  function exportExcel() {
    window.open(`${BASE}/api/enterprise/${session.id}/orders/export-excel?year=${year}&month=${month}`);
  }

  async function cancelOrder(orderId: number) {
    if (!confirm(`確認取消訂單 #${orderId}？`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/orders/${orderId}/cancel`, { method: "PATCH" });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "取消失敗"); return; }
      setCancelSuccess(true);
      setDetail(null);
      loadOrders();
      setTimeout(() => setCancelSuccess(false), 3000);
    } finally { setCancelling(false); }
  }

  function reorder(order: Order) {
    sessionStorage.setItem("reorder-pickup", order.pickupAddress);
    sessionStorage.setItem("reorder-delivery", order.deliveryAddress ?? "");
    sessionStorage.setItem("reorder-cargo", order.cargoDescription ?? "");
    sessionStorage.setItem("reorder-vehicle", order.requiredVehicleType ?? "");
    navigate("/enterprise/place-order");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#0d2d6e]" />
          訂單記錄
        </h1>
        <button onClick={exportExcel}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-[0.97]">
          <Download className="w-4 h-4" />
          匯出 Excel
        </button>
      </div>

      {cancelSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-700 font-semibold">訂單已成功取消</span>
        </div>
      )}

      {/* Month picker + summary */}
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
        {data && (
          <div className="mt-4 grid grid-cols-4 gap-2 pt-4 border-t border-gray-50">
            {[
              { label: "訂單筆數", value: String(data.orderCount), cls: "text-[#0d2d6e]" },
              { label: "本月總額", value: `NT$${data.totalFee.toLocaleString()}`, cls: "text-gray-900" },
              { label: "已收款", value: `NT$${data.paid.toLocaleString()}`, cls: "text-emerald-600" },
              { label: "待收款", value: `NT$${data.unpaid.toLocaleString()}`, cls: "text-orange-500" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-lg font-black ${s.cls}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "all", label: "全部" },
          { key: "pending", label: "待派車" },
          { key: "assigned", label: "已派車" },
          { key: "in_transit", label: "運送中" },
          { key: "delivered", label: "已完成" },
          { key: "cancelled", label: "已取消" },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all
              ${statusFilter === f.key ? "bg-[#0d2d6e] text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:border-[#0d2d6e] hover:text-[#0d2d6e]"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <span className="font-bold text-gray-900 text-sm">訂單明細</span>
        </div>
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">載入中...</div>
        ) : !data || data.orders.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">本月無訂單記錄</p>
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.orders.map(order => {
                  const s = STATUS_MAP[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-500" };
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer" onClick={() => setDetail(order)}>
                      <td className="px-4 py-3 font-bold text-[#0d2d6e]">#{order.id}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString("zh-TW")}
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden sm:table-cell max-w-[180px] truncate">{order.pickupAddress}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell max-w-[140px] truncate">{order.cargoDescription}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {order.totalFee ? `NT$${order.totalFee.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => reorder(order)}
                          className="text-xs text-gray-400 hover:text-[#0d2d6e] font-semibold flex items-center gap-1 transition-colors">
                          <RotateCcw className="w-3 h-3" /> 再下單
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-700">合計（{data.orderCount} 筆）</td>
                  <td className="px-4 py-3 text-right font-black text-[#0d2d6e] text-base">NT${data.totalFee.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-black text-gray-900">訂單 #{detail.id}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{new Date(detail.createdAt).toLocaleString("zh-TW")}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">狀態</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${(STATUS_MAP[detail.status] ?? STATUS_MAP["pending"]).color}`}>
                  {(STATUS_MAP[detail.status] ?? STATUS_MAP["pending"]).label}
                </span>
              </div>
              {[
                { icon: MapPin, label: "取貨地址", value: detail.pickupAddress, cls: "text-blue-400" },
                { icon: MapPin, label: "送貨地址", value: detail.deliveryAddress, cls: "text-orange-400" },
                { icon: Package, label: "貨品說明", value: detail.cargoDescription, cls: "text-gray-400" },
                { icon: Truck, label: "車型", value: detail.requiredVehicleType, cls: "text-gray-400" },
              ].map(({ icon: Icon, label, value, cls }) => value && (
                <div key={label} className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 ${cls} shrink-0 mt-0.5`} />
                  <div>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
              {detail.specialRequirements && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700 font-semibold">特殊需求</p>
                  <p className="text-sm text-blue-800 mt-0.5">{detail.specialRequirements}</p>
                </div>
              )}
              {detail.totalFee && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                  <span className="text-sm text-gray-500">費用</span>
                  <span className="text-xl font-black text-[#0d2d6e]">NT${detail.totalFee.toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => reorder(detail)}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
                <RotateCcw className="w-4 h-4" /> 再下一單
              </button>
              {detail.status === "pending" && (
                <button onClick={() => cancelOrder(detail.id)} disabled={cancelling}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60">
                  <Ban className="w-4 h-4" />
                  {cancelling ? "取消中..." : "取消訂單"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
