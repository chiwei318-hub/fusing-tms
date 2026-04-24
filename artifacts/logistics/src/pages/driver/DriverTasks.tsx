/**
 * DriverTasks.tsx — 強化版
 * 任務卡片：取貨 → 運送中 → 完成，一步一步引導
 * 導航按鈕：直接開啟 Google Maps
 * 簽收：直接確認或附帶備注
 * 等待計時：抵達後開始計時
 * API: POST /orders/:id/driver-action  action=checkin|complete
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListOrders } from "@workspace/api-client-react";
import { useDriversData } from "@/hooks/use-drivers";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, isToday } from "date-fns";
import { zhTW } from "date-fns/locale";
import { apiUrl } from "@/lib/api";

// ── 型別 ──────────────────────────────────────────────────────────────────────
type TaskTab = "active" | "done";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  assigned:   { label: "待取貨", color: "#f59e0b", bg: "rgba(245,158,11,.15)" },
  in_transit: { label: "運送中", color: "#3b82f6", bg: "rgba(59,130,246,.15)" },
  delivered:  { label: "已送達", color: "#10b981", bg: "rgba(16,185,129,.15)" },
  cancelled:  { label: "已取消", color: "#ef4444", bg: "rgba(239,68,68,.15)" },
  pending:    { label: "待確認", color: "#94a3b8", bg: "rgba(148,163,184,.12)" },
};

// 下一步動作（對應 driver-action API）
const NEXT_ACTION: Record<string, { label: string; action: string; icon: string; color: string; bg: string }> = {
  assigned:   { label: "抵達取貨點", action: "checkin",  icon: "📦", color: "#f59e0b", bg: "#3f2a00" },
  in_transit: { label: "確認送達",   action: "complete", icon: "✅", color: "#10b981", bg: "#064e3b" },
};

// ── API ───────────────────────────────────────────────────────────────────────
async function driverAction(orderId: number, action: string, extra?: Record<string, unknown>) {
  const token = localStorage.getItem("token");
  const res = await fetch(apiUrl(`/orders/${orderId}/driver-action`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...extra }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function openGoogleMaps(address: string) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  window.open(url, "_blank");
}

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function DriverTasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: drivers } = useDriversData();
  const selectedDriver = drivers?.find((d: any) => d.id === user?.id);

  const [tab,         setTab]         = useState<TaskTab>("active");
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [confirmId,   setConfirmId]   = useState<number | null>(null);
  const [waitStart,   setWaitStart]   = useState<Record<number, Date>>({});

  // ── 資料 ────────────────────────────────────────────────────────────────────
  const { data: rawOrders } = useListOrders(
    user?.id ? { driverId: user.id } as any : undefined,
    { query: { enabled: !!user?.id, refetchInterval: 20_000 } }
  );

  const orders = (rawOrders ?? []) as any[];

  const activeOrders = orders
    .filter(o => ["assigned", "in_transit"].includes(o.status))
    .sort((a: any, b: any) => (a.status === "in_transit" ? -1 : b.status === "in_transit" ? 1 : 0));

  const doneOrders = orders
    .filter((o: any) => ["delivered", "cancelled"].includes(o.status))
    .sort((a: any, b: any) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  const todayDone = doneOrders.filter((o: any) =>
    o.status === "delivered" && o.updatedAt && isToday(new Date(o.updatedAt))
  );
  const todayEarnings = todayDone.reduce((s: number, o: any) => s + (o.driverPay ?? o.totalFee ?? 0), 0);
  const urgentOrder = activeOrders[0] ?? null;

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const actionMut = useMutation({
    mutationFn: ({ orderId, action, extra }: { orderId: number; action: string; extra?: Record<string, unknown> }) =>
      driverAction(orderId, action, extra),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (vars.action === "checkin") {
        setWaitStart(prev => ({ ...prev, [vars.orderId]: new Date() }));
        toast({ title: "📦 已到達取貨點，開始計時" });
      } else if (vars.action === "complete") {
        toast({ title: "✅ 已確認送達" });
        setConfirmId(null);
      }
    },
    onError: (e: Error) => toast({ title: "更新失敗", description: e.message, variant: "destructive" }),
  });

  const handleNextStep = useCallback((order: any) => {
    const next = NEXT_ACTION[order.status];
    if (!next) return;
    if (next.action === "complete") {
      setConfirmId(order.id);
    } else {
      actionMut.mutate({ orderId: order.id, action: next.action });
    }
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>{selectedDriver?.name ?? user?.name ?? "司機"}</div>
          <div style={S.sub}>任務管理</div>
        </div>
        <div style={S.statRow}>
          <MiniStat label="進行中"   value={activeOrders.length}   color="#f59e0b" />
          <MiniStat label="今日完成" value={todayDone.length}       color="#10b981" />
          <MiniStat label="今日收入" value={`$${todayEarnings.toLocaleString()}`} color="#60a5fa" />
        </div>
      </div>

      {/* 最急任務橫幅 */}
      {urgentOrder && (
        <div
          style={{
            ...S.urgentBanner,
            background: urgentOrder.status === "in_transit"
              ? "linear-gradient(135deg,#1e3a5f,#1e293b)"
              : "linear-gradient(135deg,#3f2a00,#1e293b)",
          }}
          onClick={() => setExpandedId(urgentOrder.id)}
        >
          <div style={{ fontSize: 22 }}>
            {urgentOrder.status === "in_transit" ? "🚛" : "📦"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
              {urgentOrder.status === "in_transit" ? "運送中" : "待取貨"} · #{urgentOrder.id}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {urgentOrder.status === "in_transit"
                ? (urgentOrder.deliveryAddress ?? urgentOrder.delivery_address)
                : (urgentOrder.pickupAddress   ?? urgentOrder.pickup_address)}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>展開 ›</div>
        </div>
      )}

      {/* Tab 列 */}
      <div style={S.tabBar}>
        {(["active", "done"] as TaskTab[]).map(t => (
          <div key={t} onClick={() => setTab(t)} style={{
            ...S.tab,
            color:        tab === t ? "#f59e0b" : "#475569",
            borderBottom: `2px solid ${tab === t ? "#f59e0b" : "transparent"}`,
          }}>
            {t === "active" ? `進行中 · ${activeOrders.length}` : `已完成 · ${doneOrders.length}`}
          </div>
        ))}
      </div>

      {/* 任務列表 */}
      <div style={S.list}>
        {tab === "active" && (
          <>
            {activeOrders.length === 0 && <Empty>目前沒有進行中任務</Empty>}
            {activeOrders.map((order: any) => (
              <TaskCard
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onNavigate={() => openGoogleMaps(
                  order.status === "in_transit"
                    ? (order.deliveryAddress ?? order.delivery_address ?? "")
                    : (order.pickupAddress   ?? order.pickup_address   ?? "")
                )}
                onNextStep={() => handleNextStep(order)}
                waitStart={waitStart[order.id]}
                isUpdating={actionMut.isPending && (actionMut.variables as any)?.orderId === order.id}
              />
            ))}
          </>
        )}
        {tab === "done" && (
          <>
            {doneOrders.length === 0 && <Empty>還沒有完成的任務</Empty>}
            {doneOrders.map((order: any) => <DoneCard key={order.id} order={order} />)}
          </>
        )}
      </div>

      {/* 確認送達 Modal */}
      {confirmId && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: "#f8fafc" }}>✅ 確認送達</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              請確認貨物已交付收件人，此操作完成後不可撤銷。
            </div>
            <button
              style={{ ...S.actionBtn, background: "#064e3b", color: "#4ade80", marginBottom: 10 }}
              disabled={actionMut.isPending}
              onClick={() => actionMut.mutate({ orderId: confirmId, action: "complete" })}
            >
              {actionMut.isPending ? "處理中…" : "✅ 確認已送達"}
            </button>
            <button
              style={{ ...S.actionBtn, background: "#1e293b", color: "#64748b" }}
              onClick={() => setConfirmId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 子元件 ────────────────────────────────────────────────────────────────────

function TaskCard({ order, expanded, onToggle, onNavigate, onNextStep, waitStart, isUpdating }: {
  order: any; expanded: boolean; onToggle: () => void;
  onNavigate: () => void; onNextStep: () => void;
  waitStart?: Date; isUpdating: boolean;
}) {
  const meta   = STATUS_META[order.status] ?? STATUS_META.pending;
  const action = NEXT_ACTION[order.status];
  const pickupAddr   = order.pickupAddress   ?? order.pickup_address   ?? "";
  const deliveryAddr = order.deliveryAddress ?? order.delivery_address ?? "";
  const targetAddr   = order.status === "in_transit" ? deliveryAddr : pickupAddr;

  return (
    <div style={{ ...S.card, border: `1px solid ${expanded ? "#334155" : "#1e293b"}` }}>
      {/* 標頭 */}
      <div onClick={onToggle} style={{ padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 20,
            fontWeight: 700, background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
            #{order.id}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>
          {targetAddr}
        </div>
        {order.cargoName && (
          <div style={{ fontSize: 11, color: "#475569" }}>
            {order.cargoName}
            {order.cargoWeight ? ` · ${order.cargoWeight} kg` : ""}
          </div>
        )}
      </div>

      {/* 展開詳情 */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", borderTop: "1px solid #1e293b" }}>
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            <AddrRow icon="📍" label="取貨" addr={pickupAddr} />
            <div style={{ width: 1, height: 12, background: "#334155", marginLeft: 10 }} />
            <AddrRow icon="🏁" label="送達" addr={deliveryAddr} />
          </div>

          {(order.deliveryContactName ?? order.customerPhone) && (
            <div style={{ ...S.infoBox, marginBottom: 10 }}>
              {order.deliveryContactName && (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>👤 {order.deliveryContactName}</div>
              )}
              {order.customerPhone && (
                <a href={`tel:${order.customerPhone}`}
                  style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}>
                  📞 {order.customerPhone}
                </a>
              )}
            </div>
          )}

          {order.notes && (
            <div style={{ ...S.infoBox, color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
              📝 {order.notes}
            </div>
          )}

          {waitStart && order.status === "in_transit" && (
            <WaitTimer startTime={waitStart} />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...S.actionBtn, flex: 1, background: "#172554", color: "#60a5fa" }}
              onClick={onNavigate}>
              🗺️ 導航
            </button>
            {action && (
              <button
                style={{ ...S.actionBtn, flex: 2, background: action.bg, color: action.color,
                  opacity: isUpdating ? 0.6 : 1 }}
                disabled={isUpdating}
                onClick={onNextStep}
              >
                {isUpdating ? "處理中…" : `${action.icon} ${action.label}`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DoneCard({ order }: { order: any }) {
  const meta = STATUS_META[order.status] ?? STATUS_META.delivered;
  const deliveryAddr = order.deliveryAddress ?? order.delivery_address ?? "";
  const pay = order.driverPay ?? order.totalFee;
  return (
    <div style={{ ...S.card, opacity: 0.75 }}>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20,
            fontWeight: 700, background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>#{order.id}</span>
          {pay != null && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#4ade80", fontWeight: 700 }}>
              +${Number(pay).toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>{deliveryAddr}</div>
        {order.updatedAt && (
          <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>
            {formatDistanceToNow(new Date(order.updatedAt), { addSuffix: true, locale: zhTW })}
          </div>
        )}
        {order.signaturePhotoUrl && (
          <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✓ 已簽收</div>
        )}
      </div>
    </div>
  );
}

function AddrRow({ icon, label, addr }: { icon: string; label: string; addr: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase",
          letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>{addr}</div>
      </div>
    </div>
  );
}

function WaitTimer({ startTime }: { startTime: Date }) {
  const [now, setNow] = useState(new Date());
  useState(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  });
  const mins = Math.floor((now.getTime() - startTime.getTime()) / 60_000);
  return (
    <div style={{ ...S.infoBox, color: mins > 30 ? "#f87171" : "#94a3b8",
      fontSize: 12, marginBottom: 10 }}>
      ⏱ 等待中 {mins} 分鐘{mins > 30 ? " · 請聯絡客戶" : ""}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0 12px", borderRight: "1px solid #1e293b" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#334155" }}>{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center", color: "#334155", fontSize: 13 }}>
      {children}
    </div>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#060d1a", color: "#e2e8f0",
    fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", background: "#08111f",
    borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 900, color: "#f8fafc" },
  sub:   { fontSize: 11, color: "#334155", marginTop: 2 },
  statRow: { display: "flex", alignItems: "center" },
  urgentBanner: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 16px", cursor: "pointer",
    borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  tabBar: {
    display: "flex", background: "#08111f",
    borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  tab: {
    flex: 1, textAlign: "center", padding: "10px",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    transition: "color .15s",
  },
  list:  { flex: 1, overflowY: "auto", padding: "10px" },
  card: {
    background: "#0a1628", borderRadius: 12,
    marginBottom: 8, overflow: "hidden",
    border: "1px solid #1e293b",
  },
  infoBox: {
    background: "#0c1523", borderRadius: 8,
    padding: "8px 12px", lineHeight: 1.6,
  },
  actionBtn: {
    width: "100%", padding: "10px", borderRadius: 9,
    border: "none", fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
    transition: "opacity .15s",
  },
  overlay: {
    position: "fixed", inset: 0, zIndex: 500,
    background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  },
  modal: {
    background: "#0d1626", borderRadius: "16px 16px 0 0",
    padding: "24px 20px 48px", width: "100%", maxWidth: 480,
    border: "1px solid #1e293b", borderBottom: "none",
  },
};
