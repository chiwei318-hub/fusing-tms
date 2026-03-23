import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import {
  Gavel, Trophy, Clock, Package, ChevronDown, ChevronRight,
  Plus, Check, X, TrendingDown, Users, Zap
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";

async function fetchOpenOrders() {
  return fetch(apiUrl("/orders/bids/open")).then(r => r.json());
}
async function fetchOrderBids(orderId: number) {
  return fetch(apiUrl(`/orders/${orderId}/bids`)).then(r => r.json());
}
async function fetchBiddingStats() {
  return fetch(apiUrl("/bidding/stats")).then(r => r.json());
}

export default function BiddingTab() {
  const qc = useQueryClient();
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [showSubmitBid, setShowSubmitBid] = useState<number | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState<number | null>(null);

  const { data: openOrders = [], isLoading } = useQuery({
    queryKey: ["bids-open-orders"],
    queryFn: fetchOpenOrders,
    refetchInterval: 15000,
  });

  const { data: stats } = useQuery({
    queryKey: ["bidding-stats"],
    queryFn: fetchBiddingStats,
  });

  const acceptMut = useMutation({
    mutationFn: (bidId: number) =>
      fetch(apiUrl(`/orders/bids/${bidId}/accept`), { method: "PATCH" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bids-open-orders"] });
      qc.invalidateQueries({ queryKey: ["order-bids"] });
      setExpandedOrder(null);
    },
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black flex items-center gap-2">
          <Gavel className="w-5 h-5 text-orange-500" />
          競標比價中心
        </h2>
        <p className="text-muted-foreground text-sm mt-0.5">開放訂單讓各車隊競標，選擇最佳報價</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-200 dark:border-orange-800">
            <Package className="w-4 h-4 text-orange-600 mb-1" />
            <p className="text-2xl font-black text-orange-700 dark:text-orange-300">{stats.open_orders ?? 0}</p>
            <p className="text-xs text-orange-600">競標中訂單</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
            <Gavel className="w-4 h-4 text-blue-600 mb-1" />
            <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{stats.total_pending_bids ?? 0}</p>
            <p className="text-xs text-blue-600">待審標單</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
            <Trophy className="w-4 h-4 text-emerald-600 mb-1" />
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{stats.unique_bidders ?? 0}</p>
            <p className="text-xs text-emerald-600">參與車隊</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 border border-purple-200 dark:border-purple-800">
            <TrendingDown className="w-4 h-4 text-purple-600 mb-1" />
            <p className="text-2xl font-black text-purple-700 dark:text-purple-300">
              {stats.avg_accepted_price ? `NT$${Number(stats.avg_accepted_price).toLocaleString()}` : "—"}
            </p>
            <p className="text-xs text-purple-600">平均得標價</p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-4 border border-orange-100 dark:border-orange-800">
        <h3 className="font-bold text-sm text-orange-800 dark:text-orange-300 mb-2 flex items-center gap-1.5">
          <Zap className="w-4 h-4" /> 競標流程
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {["1. 開放競標", "2. 車隊報價", "3. 選擇得標"].map((s, i) => (
            <div key={i} className="bg-white dark:bg-white/10 rounded-lg p-2">
              <p className="font-bold text-orange-700 dark:text-orange-300">{s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Open orders */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : openOrders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gavel className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">目前無競標中的訂單</p>
          <p className="text-sm mt-1">請前往訂單管理，將待接訂單開放競標</p>
        </div>
      ) : (
        <div className="space-y-3">
          {openOrders.map((order: any) => (
            <OrderBidCard
              key={order.id}
              order={order}
              expanded={expandedOrder === order.id}
              onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              onAcceptBid={(bidId) => acceptMut.mutate(bidId)}
              onSubmitBid={() => setShowSubmitBid(order.id)}
            />
          ))}
        </div>
      )}

      {/* Submit bid dialog */}
      {showSubmitBid !== null && (
        <SubmitBidDialog
          orderId={showSubmitBid}
          onClose={() => setShowSubmitBid(null)}
          onSubmitted={() => {
            qc.invalidateQueries({ queryKey: ["bids-open-orders"] });
            qc.invalidateQueries({ queryKey: ["order-bids", showSubmitBid] });
            setShowSubmitBid(null);
          }}
        />
      )}
    </div>
  );
}

function OrderBidCard({
  order, expanded, onToggle, onAcceptBid, onSubmitBid
}: {
  order: any;
  expanded: boolean;
  onToggle: () => void;
  onAcceptBid: (bidId: number) => void;
  onSubmitBid: () => void;
}) {
  const { data: bids = [] } = useQuery({
    queryKey: ["order-bids", order.id],
    queryFn: () => fetchOrderBids(order.id),
    enabled: expanded,
  });

  const lowestBid = bids.reduce((min: any, b: any) => (!min || b.bid_price < min.bid_price) ? b : min, null);

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded font-bold">
                #競標-{order.id}
              </span>
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                {Number(order.bid_count ?? 0)} 個報價
              </span>
            </div>
            <p className="font-bold text-sm truncate">{order.pickup_address}</p>
            <p className="text-xs text-muted-foreground truncate">→ {order.delivery_address}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{order.cargo_description}</p>
          </div>
          <div className="text-right shrink-0">
            {order.lowest_bid ? (
              <div>
                <p className="text-xs text-muted-foreground">最低報價</p>
                <p className="font-black text-lg text-emerald-600">NT${Number(order.lowest_bid).toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">等待報價</p>
            )}
            {expanded ? <ChevronDown className="w-4 h-4 ml-auto mt-1 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 ml-auto mt-1 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 p-4 space-y-3">
          {bids.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-4">尚無廠商報價</p>
          ) : (
            bids.map((bid: any, idx: number) => (
              <div
                key={bid.id}
                className={`bg-background rounded-xl p-3 border flex items-center gap-3 ${
                  lowestBid?.id === bid.id ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" : ""
                }`}
              >
                {lowestBid?.id === bid.id && (
                  <span className="absolute -mt-0 text-xs bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                    最低
                  </span>
                )}
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-sm font-black text-blue-700 dark:text-blue-300 shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{bid.bidder_name}</p>
                  {bid.vehicle_type && <p className="text-xs text-muted-foreground">{bid.vehicle_type}</p>}
                  {bid.estimated_arrival_min && (
                    <p className="text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      預計 {bid.estimated_arrival_min} 分鐘到達
                    </p>
                  )}
                  {bid.fleet_name && (
                    <p className="text-xs text-blue-600">{bid.fleet_name} · 評分 {bid.reliability_score}</p>
                  )}
                  {bid.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{bid.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-blue-700 dark:text-blue-300">
                    NT${Number(bid.bid_price).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(bid.submitted_at), { locale: zhTW, addSuffix: true })}
                  </p>
                  <button
                    onClick={() => {
                      if (confirm(`確認得標 ${bid.bidder_name}，報價 NT$${Number(bid.bid_price).toLocaleString()}？`)) {
                        onAcceptBid(bid.id);
                      }
                    }}
                    className="mt-1 px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    得標
                  </button>
                </div>
              </div>
            ))
          )}
          <button
            onClick={onSubmitBid}
            className="w-full py-2 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl text-blue-600 dark:text-blue-400 text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            代為輸入報價（廠商電話報價）
          </button>
        </div>
      )}
    </div>
  );
}

function SubmitBidDialog({ orderId, onClose, onSubmitted }: { orderId: number; onClose: () => void; onSubmitted: () => void }) {
  const [form, setForm] = useState({
    bidderName: "", bidPrice: "", vehicleType: "箱型車", estimatedArrivalMin: "", notes: "", fleetId: "",
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.bidderName || !form.bidPrice) return alert("請填寫廠商名稱和報價");
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/orders/${orderId}/bids`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bidderName: form.bidderName,
          bidPrice: Number(form.bidPrice),
          vehicleType: form.vehicleType,
          estimatedArrivalMin: form.estimatedArrivalMin ? Number(form.estimatedArrivalMin) : undefined,
          notes: form.notes || undefined,
          fleetId: form.fleetId ? Number(form.fleetId) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        return alert(err.error ?? "提交失敗");
      }
      onSubmitted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-background rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-black text-lg">輸入廠商報價 — 訂單 #{orderId}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-bold mb-1 block">廠商/司機名稱 *</label>
            <input
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="例：台灣物流車隊"
              value={form.bidderName}
              onChange={e => setForm(f => ({ ...f, bidderName: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">報價金額 (NT$) *</label>
              <input
                type="number"
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                placeholder="1500"
                value={form.bidPrice}
                onChange={e => setForm(f => ({ ...f, bidPrice: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">車型</label>
              <select
                className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
                value={form.vehicleType}
                onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}
              >
                {["機車", "轎車", "廂型車", "箱型車", "小貨車", "一噸半", "3.5噸"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">預計到達（分鐘）</label>
            <input
              type="number"
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
              placeholder="30"
              value={form.estimatedArrivalMin}
              onChange={e => setForm(f => ({ ...f, estimatedArrivalMin: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">附加說明</label>
            <textarea
              className="w-full border rounded-xl px-3 py-2 text-sm bg-background resize-none"
              rows={2}
              placeholder="特殊服務、設備、注意事項..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold hover:bg-muted">取消</button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "提交中..." : "提交報價"}
          </button>
        </div>
      </div>
    </div>
  );
}
