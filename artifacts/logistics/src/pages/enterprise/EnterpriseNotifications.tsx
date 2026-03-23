import { useEffect, useState } from "react";
import { Bell, CheckCheck, Package, Truck, XCircle, CreditCard, Info, Clock } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Notification = {
  id: number;
  enterpriseId: number;
  orderId: number | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

const TYPE_ICON: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  order_confirmed: { icon: Package, color: "text-blue-500", bg: "bg-blue-50" },
  order_assigned:  { icon: Truck, color: "text-purple-500", bg: "bg-purple-50" },
  order_delivered: { icon: CheckCheck, color: "text-emerald-500", bg: "bg-emerald-50" },
  order_cancelled: { icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
  payment_due:     { icon: CreditCard, color: "text-orange-500", bg: "bg-orange-50" },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(date).toLocaleDateString("zh-TW");
}

export default function EnterpriseNotifications({ session }: { session: EnterpriseSession }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`${BASE}/api/enterprise/${session.id}/notifications`)
      .then(r => r.json())
      .then(d => { setNotifications(d.notifications ?? []); setUnread(d.unread ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [session.id]);

  async function markRead(id: number) {
    await fetch(`${BASE}/api/enterprise/${session.id}/notifications/${id}/read`, { method: "PATCH" });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnread(u => Math.max(0, u - 1));
  }

  async function markAllRead() {
    setMarkingAll(true);
    await fetch(`${BASE}/api/enterprise/${session.id}/notifications/read-all`, { method: "PATCH" });
    setNotifications(ns => ns.map(n => ({ ...n, isRead: true })));
    setUnread(0);
    setMarkingAll(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#0d2d6e]" />
          系統通知
          {unread > 0 && (
            <span className="min-w-[22px] h-[22px] bg-red-500 text-white text-xs font-black flex items-center justify-center rounded-full px-1">
              {unread}
            </span>
          )}
        </h1>
        {unread > 0 && (
          <button onClick={markAllRead} disabled={markingAll}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0d2d6e] hover:text-[#1a3a8f] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
            <CheckCheck className="w-3.5 h-3.5" />
            {markingAll ? "標記中..." : "全部已讀"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-gray-400 text-sm">載入中...</div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold">目前沒有通知</p>
          <p className="text-gray-400 text-xs mt-1">訂單狀態更新時，我們將在此通知您</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
          {notifications.map(n => {
            const typeInfo = TYPE_ICON[n.type] ?? { icon: Info, color: "text-gray-500", bg: "bg-gray-50" };
            const Icon = typeInfo.icon;
            return (
              <div key={n.id}
                className={`flex items-start gap-4 px-5 py-4 transition-all cursor-pointer hover:bg-gray-50/60 ${!n.isRead ? "bg-blue-50/40" : ""}`}
                onClick={() => { if (!n.isRead) markRead(n.id); }}>
                <div className={`w-10 h-10 ${typeInfo.bg} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${typeInfo.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-bold ${!n.isRead ? "text-gray-900" : "text-gray-700"}`}>{n.title}</p>
                    {!n.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Clock className="w-3 h-3 text-gray-300" />
                    <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                    {n.orderId && <span className="text-xs text-gray-400">· 訂單 #{n.orderId}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">顯示最近 50 則通知</p>
    </div>
  );
}
