/**
 * OnlineUsersPanel — shows who's currently active in the system.
 * Polls GET /api/online-users every 30 seconds.
 * Users appear here when their app pings /api/presence/ping.
 */
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import { Users, ChevronDown, ChevronUp, Wifi } from "lucide-react";

interface OnlineUser {
  id: number;
  name: string;
  type: "admin" | "driver" | "customer";
  last_seen_at: string;
  // admin
  role_label?: string;
  username?: string;
  // driver
  vehicle_type?: string;
  driver_status?: string;
  // customer
  phone?: string;
}

interface OnlineData {
  total: number;
  admins: OnlineUser[];
  drivers: OnlineUser[];
  customers: OnlineUser[];
}

function secsAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分鐘前`;
  return `${Math.floor(diff / 3600)}小時前`;
}

function StatusDot({ lastSeen }: { lastSeen: string }) {
  const secsDiff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  const color = secsDiff < 60
    ? "bg-green-500"
    : secsDiff < 180
    ? "bg-yellow-400"
    : "bg-gray-400";
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />
  );
}

export function OnlineUsersPanel({ token }: { token: string | null }) {
  const [data, setData] = useState<OnlineData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Heartbeat — ping every 30s to mark self as online
  useEffect(() => {
    if (!token) return;
    const ping = () =>
      fetch(getApiUrl("/api/presence/ping"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, [token]);

  // Refresh online list every 30s
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/online-users"));
      if (!res.ok) return;
      const d = await res.json() as OnlineData;
      setData(d);
      setLastRefresh(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  const total = data?.total ?? 0;
  const adminCount = data?.admins.length ?? 0;
  const driverCount = data?.drivers.length ?? 0;
  const customerCount = data?.customers.length ?? 0;

  return (
    <div className="relative">
      {/* Trigger button */}
      <Button
        size="sm"
        variant="outline"
        className="gap-2 h-8 text-xs font-normal"
        onClick={() => setExpanded(p => !p)}
      >
        <Wifi className="w-3.5 h-3.5 text-green-500" />
        <span className="hidden sm:inline">在線</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
          total > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          {total}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>

      {/* Dropdown panel */}
      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-sm">線上人員</span>
              <Badge variant="secondary" className="text-xs">{total} 人</Badge>
            </div>
            <span className="text-[10px] text-gray-400">
              {lastRefresh ? secsAgo(lastRefresh.toISOString()) + "更新" : "更新中…"}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {total === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">目前沒有其他線上用戶</div>
            ) : (
              <div className="divide-y dark:divide-gray-800">

                {/* Admins */}
                {data!.admins.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                      管理員 / 調度員 ({adminCount})
                    </div>
                    {data!.admins.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <StatusDot lastSeen={u.last_seen_at} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-gray-400">{u.role_label} · {secsAgo(u.last_seen_at)}</div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Drivers */}
                {data!.drivers.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-green-50 dark:bg-green-950/40 text-[11px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                      司機 ({driverCount})
                    </div>
                    {data!.drivers.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <StatusDot lastSeen={u.last_seen_at} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-gray-400">
                            {u.vehicle_type && <span>{u.vehicle_type} · </span>}
                            {u.driver_status === "available" ? "待命" :
                             u.driver_status === "busy" ? "配送中" :
                             u.driver_status === "offline" ? "離線" : u.driver_status ?? ""}
                            {" · "}{secsAgo(u.last_seen_at)}
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Customers */}
                {data!.customers.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-orange-50 dark:bg-orange-950/40 text-[11px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                      客戶 ({customerCount})
                    </div>
                    {data!.customers.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <StatusDot lastSeen={u.last_seen_at} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{u.name}</div>
                          <div className="text-[11px] text-gray-400">{u.phone} · {secsAgo(u.last_seen_at)}</div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">每 30 秒自動更新 · 5 分鐘內活躍</span>
            <button
              className="text-[11px] text-blue-500 hover:underline"
              onClick={refresh}
            >
              立即更新
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
