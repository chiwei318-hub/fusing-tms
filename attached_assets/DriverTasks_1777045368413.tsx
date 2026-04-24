/**
 * DriverTasks.tsx  —  強化版
 * 路徑：artifacts/logistics/src/pages/driver/DriverTasks.tsx
 *
 * 新增功能：
 *   1. 任務卡片：取貨 → 運送中 → 完成，一步一步引導
 *   2. 導航按鈕：直接開啟 Google Maps 導航
 *   3. 簽收功能：拍照上傳 or 手寫簽名確認
 *   4. 等待計時：抵達後開始計時等待
 *   5. 狀態更新 API 整合（PUT /orders/:id/status）
 *
 * 保留原有：
 *   - Tab 切換（進行中 / 已完成）
 *   - 統計三格、最急任務橫幅
 *   - useListOrders、useAuth、STATUS_META
 */

import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useListOrders } from "@/hooks/useListOrders";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

// ── 型別 ─────────────────────────────────────────────────────
type TaskTab = "active" | "done";

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  assigned:   { label: "待取貨", color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  in_transit: { label: "運送中", color: "#3b82f6", bg: "rgba(59,130,246,.12)" },
  delivered:  { label: "已送達", color: "#10b981", bg: "rgba(16,185,129,.12)" },
  cancelled:  { label: "已取消", color: "#ef4444", bg: "rgba(239,68,68,.12)" },
  pending:    { label: "待確認", color: "#94a3b8", bg: "rgba(148,163,184,.12)" },
};

// 下一步動作
const NEXT_ACTION: Record<string, { label: string; nextStatus: string; icon: string; color: string }> = {
  assigned:   { label: "抵達取貨點",  nextStatus: "in_transit", icon: "📦", color: "#f59e0b" },
  in_transit: { label: "確認送達",    nextStatus: "delivered",  icon: "✅", color: "#10b981" },
};

interface Order {
  id: number;
  order_no: string;
  status: string;
  pickup_address: string;
  pickup_city?: string;
  pickup_district?: string;
  delivery_address: string;
  delivery_city?: string;
  delivery_district?: string;
  cargo_name?: string;
  cargo_weight?: number;
  customer_name?: string;
  customer_phone?: string;
  delivery_contact_name?: string;
  total_fee?: number;
  driver_pay?: number;
  check_in_at?: string;
  completed_at?: string;
  pickup_date?: string;
  notes?: string;
  signature_photo_url?: string;
}

// ── API ──────────────────────────────────────────────────────
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function openGoogleMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  window.open(url, "_blank");
}

// ── 主元件 ───────────────────────────────────────────────────
export default function DriverTasks() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TaskTab>("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [signingOrderId, setSigningOrderId] = useState<number | null>(null);
  const [waitStart, setWaitStart] = useState<Record<number, Date>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingSignOrderId, setPendingSignOrderId] = useState<number | null>(null);

  // ── 資料 ─────────────────────────────────────────────────────
  const { data: orders = [] } = useListOrders(
    { driverId: user?.id },
    { refetchInterval: 20_000 }
  );

  const activeOrders = (orders as Order[])
    .filter(o => ["assigned", "in_transit"].includes(o.status))
    .sort((a, b) => (a.status === "in_transit" ? -1 : b.status === "in_transit" ? 1 : 0));

  const doneOrders = (orders as Order[])
    .filter(o => ["delivered", "cancelled"].includes(o.status))
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));

  const todayDone = doneOrders.filter(o => {
    if (!o.completed_at) return false;
    const today = new Date().toDateString();
    return new Date(o.completed_at).toDateString() === today;
  });

  const todayEarnings = todayDone.reduce((s, o) => s + (o.driver_pay ?? 0), 0);
  const urgentOrder = activeOrders[0] ?? null;

  // ── 狀態更新 ──────────────────────────────────────────────────
  const statusMut = useMutation({
    mutationFn: ({ orderId, status, extra }: {
      orderId: number; status: string; extra?: Record<string, unknown>;
    }) => apiFetch(`/orders/${orderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, ...extra }),
    }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      const label = STATUS_META[vars.status]?.label ?? vars.status;
      toast({ title: `✅ 已更新：${label}` });
      if (vars.status === "in_transit") {
        setWaitStart(prev => ({ ...prev, [vars.orderId]: new Date() }));
      }
    },
    onError: (e: Error) => toast({ title: "更新失敗", description: e.message, variant: "destructive" }),
  });

  // ── 簽收照片上傳 ──────────────────────────────────────────────
  const uploadMut = useMutation({
    mutationFn: async ({ orderId, file }: { orderId: number; file: File }) => {
      const form = new FormData();
      form.append("photo", file);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/orders/${orderId}/signature`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, vars) => {
      statusMut.mutate({ orderId: vars.orderId, status: "delivered" });
      setSigningOrderId(null);
    },
    onError: (e: Error) => toast({ title: "上傳失敗", description: e.message, variant: "destructive" }),
  });

  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingSignOrderId) return;
    uploadMut.mutate({ orderId: pendingSignOrderId, file });
    e.target.value = "";
  }, [pendingSignOrderId]);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>{user?.name ?? "司機"}</div>
          <div style={S.sub}>任務管理</div>
        </div>
        <div style={S.statRow}>
          <MiniStat label="進行中" value={activeOrders.length} color="#f59e0b" />
          <MiniStat label="今日完成" value={todayDone.length} color="#10b981" />
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
          onClick={() => navigate(`/driver/tasks/${urgentOrder.id}`)}
        >
          <div style={{ fontSize: 22 }}>
            {urgentOrder.status === "in_transit" ? "🚛" : "📦"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f8fafc" }}>
              {urgentOrder.status === "in_transit" ? "運送中" : "待取貨"} · {urgentOrder.order_no}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              {urgentOrder.status === "in_transit"
                ? urgentOrder.delivery_address
                : urgentOrder.pickup_address}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>查看 ›</div>
        </div>
      )}

      {/* Tab */}
      <div style={S.tabBar}>
        {(["active", "done"] as TaskTab[]).map(t => (
          <div key={t} onClick={() => setTab(t)} style={{
            ...S.tab,
            color: tab === t ? "#f59e0b" : "#475569",
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
            {activeOrders.map(order => (
              <TaskCard
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onNavigate={() => openGoogleMaps(
                  order.status === "in_transit" ? order.delivery_address : order.pickup_address
                )}
                onNextStep={() => {
                  const action = NEXT_ACTION[order.status];
                  if (!action) return;
                  if (action.nextStatus === "delivered") {
                    // 簽收流程
                    setPendingSignOrderId(order.id);
                    setSigningOrderId(order.id);
                  } else {
                    statusMut.mutate({ orderId: order.id, status: action.nextStatus });
                  }
                }}
                waitStart={waitStart[order.id]}
                isUpdating={statusMut.isPending && statusMut.variables?.orderId === order.id}
              />
            ))}
          </>
        )}

        {tab === "done" && (
          <>
            {doneOrders.length === 0 && <Empty>還沒有完成的任務</Empty>}
            {doneOrders.map(order => (
              <DoneCard key={order.id} order={order} />
            ))}
          </>
        )}
      </div>

      {/* 簽收 Modal */}
      {signingOrderId && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>📸 確認送達</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              請拍攝貨物或簽收單照片作為送達憑證
            </div>

            <button
              style={{ ...S.actionBtn, background: "#1e3a5f", color: "#60a5fa", marginBottom: 10 }}
              onClick={() => {
                setPendingSignOrderId(signingOrderId);
                fileInputRef.current?.click();
              }}
              disabled={uploadMut.isPending}
            >
              {uploadMut.isPending ? "上傳中…" : "📷 拍照上傳"}
            </button>

            <button
              style={{ ...S.actionBtn, background: "#10b981", color: "#fff", marginBottom: 10 }}
              onClick={() => {
                // 不上傳照片，直接標記完成
                statusMut.mutate({ orderId: signingOrderId, status: "delivered" });
                setSigningOrderId(null);
              }}
              disabled={statusMut.isPending}
            >
              ✅ 直接確認送達
            </button>

            <button
              style={{ ...S.actionBtn, background: "#1e293b", color: "#64748b" }}
              onClick={() => setSigningOrderId(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 隱藏 file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handlePhotoSelect}
      />
    </div>
  );
}

// ── 子元件 ───────────────────────────────────────────────────

function TaskCard({ order, expanded, onToggle, onNavigate, onNextStep, waitStart, isUpdating }: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  onNextStep: () => void;
  waitStart?: Date;
  isUpdating: boolean;
}) {
  const meta   = STATUS_META[order.status] ?? STATUS_META.pending;
  const action = NEXT_ACTION[order.status];
  const targetAddr = order.status === "in_transit"
    ? order.delivery_address
    : order.pickup_address;

  return (
    <div style={{ ...S.card, border: `1px solid ${expanded ? "#334155" : "#1e293b"}` }}>
      {/* 卡片標頭 */}
      <div onClick={onToggle} style={{ padding: "14px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
            background: meta.bg, color: meta.color,
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
            {order.order_no}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>

        {/* 地址 */}
        <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>
          {targetAddr}
        </div>
        {order.cargo_name && (
          <div style={{ fontSize: 11, color: "#475569" }}>
            {order.cargo_name}
            {order.cargo_weight ? ` · ${order.cargo_weight} kg` : ""}
          </div>
        )}
      </div>

      {/* 展開詳情 */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", borderTop: "1px solid #1e293b" }}>

          {/* 路線 */}
          <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            <AddrRow icon="📍" label="取貨" addr={order.pickup_address} />
            <div style={{ width: 1, height: 12, background: "#334155", marginLeft: 10 }} />
            <AddrRow icon="🏁" label="送達" addr={order.delivery_address} />
          </div>

          {/* 聯絡人 */}
          {(order.delivery_contact_name || order.customer_phone) && (
            <div style={{ ...S.infoBox, marginBottom: 10 }}>
              {order.delivery_contact_name && (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  👤 {order.delivery_contact_name}
                </div>
              )}
              {order.customer_phone && (
                <a
                  href={`tel:${order.customer_phone}`}
                  style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}
                >
                  📞 {order.customer_phone}
                </a>
              )}
            </div>
          )}

          {/* 備註 */}
          {order.notes && (
            <div style={{ ...S.infoBox, color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
              📝 {order.notes}
            </div>
          )}

          {/* 等待計時 */}
          {waitStart && order.status === "in_transit" && (
            <WaitTimer startTime={waitStart} />
          )}

          {/* 操作按鈕 */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={{ ...S.actionBtn, flex: 1, background: "#172554", color: "#60a5fa" }}
              onClick={onNavigate}>
              🗺️ 導航
            </button>
            {action && (
              <button
                style={{
                  ...S.actionBtn, flex: 2,
                  background: action.color === "#10b981" ? "#064e3b" : "#3f2a00",
                  color: action.color,
                  opacity: isUpdating ? 0.6 : 1,
                }}
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

function DoneCard({ order }: { order: Order }) {
  const meta = STATUS_META[order.status] ?? STATUS_META.delivered;
  return (
    <div style={{ ...S.card, opacity: 0.75 }}>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20,
            fontWeight: 700, background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11, color: "#334155", fontFamily: "monospace" }}>
            {order.order_no}
          </span>
          {order.driver_pay && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#4ade80", fontWeight: 700 }}>
              +${order.driver_pay.toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#475569" }}>
          {order.delivery_address}
        </div>
        {order.completed_at && (
          <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>
            {formatDistanceToNow(new Date(order.completed_at), { addSuffix: true, locale: zhTW })}
          </div>
        )}
        {order.signature_photo_url && (
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
    const t = setInterval(() => setNow(new Date()), 10_000);
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

// ── 樣式 ─────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#060d1a", color: "#e2e8f0",
    fontFamily: "'Noto Sans TC','PingFang TC',sans-serif",
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
  list: { flex: 1, overflowY: "auto", padding: "10px" },
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
    padding: "24px 20px 40px", width: "100%", maxWidth: 480,
    border: "1px solid #1e293b", borderBottom: "none",
  },
};
