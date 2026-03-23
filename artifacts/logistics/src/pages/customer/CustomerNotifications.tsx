import { useState, useEffect } from "react";
import { Bell, BellOff, CheckCheck, Package, Truck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

interface CustomerNotification {
  id: number;
  order_id: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  order_created: { icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
  order_assigned: { icon: Truck, color: "text-purple-600", bg: "bg-purple-50" },
  order_in_transit: { icon: Truck, color: "text-orange-600", bg: "bg-orange-50" },
  order_delivered: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  order_cancelled: { icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  default: { icon: Bell, color: "text-gray-600", bg: "bg-gray-50" },
};

export default function CustomerNotifications({ customerId }: { customerId: number }) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = async () => {
    try {
      const res = await fetch(`/api/customer-notifications/${customerId}`);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, [customerId]);

  const markAllRead = async () => {
    await fetch(`/api/customer-notifications/${customerId}/read-all`, { method: "PATCH" });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  };

  const markOneRead = async (id: number) => {
    await fetch(`/api/customer-notifications/item/${id}/read`, { method: "PATCH" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">載入通知中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">訂單通知</h2>
          {unread > 0 && (
            <Badge className="bg-red-500 text-white text-xs">{unread} 則未讀</Badge>
          )}
        </div>
        {unread > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            全部已讀
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BellOff className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">目前沒有任何通知</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markOneRead(n.id)}
                className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  n.is_read ? "bg-background border-border/50 opacity-70" : "bg-white border-primary/20 shadow-sm"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4.5 h-4.5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${n.is_read ? "text-muted-foreground" : "text-foreground"}`}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!n.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(n.created_at), "MM/dd HH:mm", { locale: zhTW })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  {n.order_id && (
                    <Badge variant="outline" className="mt-1.5 text-xs">訂單 #{n.order_id}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
