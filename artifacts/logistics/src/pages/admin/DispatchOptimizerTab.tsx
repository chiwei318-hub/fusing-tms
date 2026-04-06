import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Truck, TrendingUp, RefreshCw, Settings, Target, BarChart3,
  CheckCircle2, AlertCircle, ArrowRight, MapPin, Package, Users,
  Repeat2, RotateCcw, Gauge, ChevronDown, ChevronUp, X, Star,
  Navigation, DollarSign, Clock, Route, Sparkles, Scan,
} from "lucide-react";
import NearbyDriversPanel from "./NearbyDriversPanel";
import SmartQuotePanel from "./SmartQuotePanel";
import OcrReceiptDialog from "./OcrReceiptDialog";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  driverId: number; driverName: string; phone: string;
  vehicleType: string; licensePlate: string; status: string;
  totalScore: number;
  distanceScore: number; vehicleScore: number; profitScore: number; timeScore: number;
  carpoolBonus: number; returnTripBonus: number;
  estimatedDistanceKm: number;
  estimatedRevenue: number; estimatedCost: number; estimatedProfit: number;
  isCarpool: boolean; isReturnTrip: boolean; savingsKm: number;
  reason: string; reasonDetail: string;
}

interface AnalyzeResult {
  orderId: number;
  candidates: ScoreBreakdown[];
  excluded: number;
}

interface DriverAvail {
  id: number; name: string; phone: string; vehicleType: string;
  licensePlate: string; status: string;
  lat?: number; lng?: number; currentLocation?: string;
  isBusy: boolean; orderCount: number;
  activeOrders: any[];
}

interface RevenueStats {
  total_orders: string; paid_orders: string; total_revenue: string;
  auto_dispatched: string; unassigned: string; active_drivers: string;
  carpool_count: string; return_trip_count: string; total_savings_km: string;
}

interface ConfigRow { id: number; key: string; value: string; label: string; }

interface PendingOrder {
  id: number; customerName: string; pickupAddress: string; deliveryAddress: string;
  cargoDescription: string; requiredVehicleType: string | null;
  totalFee: number | null; feeStatus: string; status: string;
  createdAt: string; pipeline: string;
}

interface DispatchLogRow {
  id: number; order_id: number; driver_id: number; action: string;
  reason: string; reason_detail: string; score: number;
  estimated_revenue: number; estimated_profit: number;
  is_carpool: boolean; is_return_trip: boolean; savings_km: number; distance_km: number;
  driver_name: string; vehicle_type: string;
  customer_name: string; pickup_address: string; delivery_address: string;
  created_at: string;
}

// ─── Score Ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg) translate(0px, -${size}px)`, fontSize: 11, fontWeight: "bold", fill: color }}>
        {score}
      </text>
    </svg>
  );
}

// ─── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBarRow({ label, value, color = "bg-primary" }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-5 text-right font-mono font-medium">{Math.round(value)}</span>
    </div>
  );
}

// ─── Driver Card ───────────────────────────────────────────────────────────────

function DriverCard({ driver }: { driver: DriverAvail }) {
  const statusColor = driver.status === "available" ? "bg-green-500" :
    driver.status === "busy" ? "bg-orange-400" : "bg-slate-300";
  const statusLabel = driver.status === "available" ? "空車" :
    driver.status === "busy" ? "出車中" : "下線";

  return (
    <div className={`border rounded-lg p-2.5 space-y-1.5 ${driver.isBusy ? "border-orange-200 bg-orange-50/30" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
            <span className="text-sm font-semibold">{driver.name}</span>
            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{driver.vehicleType} · {driver.licensePlate}</div>
        </div>
        {driver.orderCount > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 border-orange-300 text-orange-600 shrink-0">
            {driver.orderCount}趟
          </Badge>
        )}
      </div>
      {driver.currentLocation && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="w-2.5 h-2.5" />{driver.currentLocation}
        </div>
      )}
      {(driver.lat && driver.lng) && (
        <div className="text-[10px] text-muted-foreground font-mono">
          {driver.lat.toFixed(3)}, {driver.lng.toFixed(3)}
        </div>
      )}
      {driver.activeOrders.length > 0 && (
        <div className="text-[10px] bg-orange-100 rounded px-1.5 py-0.5 text-orange-700 truncate">
          → {driver.activeOrders[0]?.deliveryAddress ?? "配送中"}
        </div>
      )}
    </div>
  );
}

// ─── Candidate Row ─────────────────────────────────────────────────────────────

function CandidateRow({ c, rank, onAssign, loading }: {
  c: ScoreBreakdown; rank: number; onAssign: (driverId: number) => void; loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-lg overflow-hidden ${rank === 1 ? "border-primary/40 shadow-sm" : ""}`}>
      <div className="flex items-center gap-2 p-2 bg-card cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
          ${rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {rank}
        </div>
        <ScoreRing score={c.totalScore} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">{c.driverName}</span>
            <span className="text-xs text-muted-foreground">{c.vehicleType}</span>
            {c.isReturnTrip && <Badge className="text-[9px] h-4 py-0 bg-blue-100 text-blue-700 border-blue-200 font-medium">回頭車 ↩</Badge>}
            {c.isCarpool && <Badge className="text-[9px] h-4 py-0 bg-purple-100 text-purple-700 border-purple-200 font-medium">拼車 ⊕</Badge>}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{c.reason}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-bold text-green-600">+NT${c.estimatedProfit.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">{c.estimatedDistanceKm}km</div>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> :
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <ScoreBarRow label="距離" value={c.distanceScore} color="bg-blue-500" />
            <ScoreBarRow label="車型" value={c.vehicleScore} color="bg-purple-500" />
            <ScoreBarRow label="收益" value={c.profitScore} color="bg-green-500" />
            <ScoreBarRow label="時效" value={c.timeScore} color="bg-orange-500" />
          </div>
          <div className="text-[10px] text-muted-foreground bg-muted rounded p-2 leading-relaxed">
            {c.reasonDetail}
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="text-center">
              <div className="font-bold text-primary">NT${c.estimatedRevenue.toLocaleString()}</div>
              <div className="text-muted-foreground">預估收入</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-red-500">NT${c.estimatedCost.toLocaleString()}</div>
              <div className="text-muted-foreground">預估成本</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-green-600">NT${c.estimatedProfit.toLocaleString()}</div>
              <div className="text-muted-foreground">預估毛利</div>
            </div>
          </div>
          {c.savingsKm > 0 && (
            <div className="text-[10px] bg-blue-50 text-blue-700 rounded px-2 py-1 flex items-center gap-1">
              <Route className="w-3 h-3" /> 節省 {c.savingsKm}km 空車里程
            </div>
          )}
          <Button size="sm" className="w-full h-7 text-xs gap-1" disabled={loading}
            onClick={e => { e.stopPropagation(); onAssign(c.driverId); }}>
            <Zap className="w-3 h-3" /> 指派給 {c.driverName}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Order Analyze Card ────────────────────────────────────────────────────────

function OrderAnalyzeCard({ order, onRefetch }: { order: PendingOrder; onRefetch: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [dispatching, setDispatching] = useState(false);

  async function analyze() {
    setAnalyzing(true);
    try {
      const r = await fetch(`${API}/orders/${order.id}/analyze-dispatch`, { method: "POST" });
      const data = await r.json();
      setResult(data);
      setExpanded(true);
    } finally { setAnalyzing(false); }
  }

  async function assignDriver(driverId: number) {
    setDispatching(true);
    try {
      const r = await fetch(`${API}/orders/${order.id}/auto-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const data = await r.json();
      if (data.success) {
        toast({ title: `訂單 #${order.id} 已派給 ${data.driverName}`, description: data.reason });
        onRefetch();
      } else {
        toast({ title: "派車失敗", description: data.reason, variant: "destructive" });
      }
    } finally { setDispatching(false); }
  }

  const pipelineColors: Record<string, string> = {
    new: "text-slate-500", quoted: "text-blue-600", paid: "text-green-600",
    dispatched: "text-purple-600", in_transit: "text-orange-500", completed: "text-emerald-600",
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-start gap-2 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">#{order.id}</span>
            <span className="text-sm">{order.customerName}</span>
            {order.requiredVehicleType && (
              <Badge variant="outline" className="text-[10px] h-4 py-0">{order.requiredVehicleType}</Badge>
            )}
            {order.totalFee && (
              <span className="text-xs font-semibold text-green-600">NT${order.totalFee.toLocaleString()}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {order.pickupAddress} → {order.deliveryAddress}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {order.cargoDescription} ·
            <span className={` ml-1 font-medium ${pipelineColors[order.pipeline] ?? ""}`}>
              {order.pipeline === "paid" ? "✅ 已付款待派" : order.pipeline === "new" ? "待處理" : order.pipeline}
            </span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={analyze} disabled={analyzing}>
            <Target className="w-3 h-3" /> {analyzing ? "分析中..." : result ? "重新分析" : "分析最佳司機"}
          </Button>
          {!result && (
            <Button size="sm" className="h-7 text-xs gap-1" disabled={dispatching}
              onClick={async () => {
                setDispatching(true);
                try {
                  const r = await fetch(`${API}/orders/${order.id}/auto-dispatch`, { method: "POST" });
                  const data = await r.json();
                  if (data.success) { toast({ title: `已自動派給 ${data.driverName}`, description: data.reason }); onRefetch(); }
                  else toast({ title: "派車失敗", description: data.reason, variant: "destructive" });
                } finally { setDispatching(false); }
              }}>
              <Zap className="w-3 h-3" /> {dispatching ? "派車中..." : "自動派車"}
            </Button>
          )}
          {result && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {expanded && result && (
        <div className="border-t bg-muted/20 p-3 space-y-2">
          <div className="text-xs text-muted-foreground mb-2">
            共 {result.candidates.length} 位司機候選（排除 {result.excluded} 位占用中）
          </div>
          {result.candidates.length === 0 ? (
            <div className="text-xs text-center py-4 text-muted-foreground">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 opacity-40" />無可用司機
            </div>
          ) : (
            <div className="space-y-2">
              {result.candidates.map((c, i) => (
                <CandidateRow key={c.driverId} c={c} rank={i + 1} onAssign={assignDriver} loading={dispatching} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Weight Sliders ────────────────────────────────────────────────────────────

function WeightPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery<ConfigRow[]>({
    queryKey: ["pricing-config"],
    queryFn: () => fetch(`${API}/pricing-config`).then(r => r.json()),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const weightKeys = ["w_distance","w_vehicle","w_profit","w_time","carpool_bonus","return_bonus","max_dispatch_km","carpool_radius_km"];
  const weightConfigs = configs.filter(c => weightKeys.includes(c.key));
  const merged = weightConfigs.map(c => ({ ...c, value: edits[c.key] ?? c.value }));
  const sliderKeys = ["w_distance","w_vehicle","w_profit","w_time"];

  async function save() {
    await fetch(`${API}/pricing-config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edits),
    });
    qc.invalidateQueries({ queryKey: ["pricing-config"] });
    setEdits({});
    toast({ title: "派單權重已更新" });
  }

  const totalWeight = sliderKeys.reduce((s, k) => s + parseFloat(merged.find(c => c.key === k)?.value ?? "25"), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        {merged.map(c => {
          const isSlider = sliderKeys.includes(c.key);
          const val = parseFloat(c.value);
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <span className="text-xs font-mono font-bold">{Math.round(val)}</span>
              </div>
              <input type="range" min={0} max={isSlider ? 80 : 50} step={1}
                value={Math.round(val)}
                onChange={e => setEdits(prev => ({ ...prev, [c.key]: e.target.value }))}
                className="w-full h-1.5 accent-primary"
              />
            </div>
          );
        })}
      </div>
      {sliderKeys.length > 0 && (
        <div className={`text-[10px] rounded px-2 py-1 ${Math.abs(totalWeight - 100) < 5 ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"}`}>
          距離+車型+收益+時效 權重總計：{Math.round(totalWeight)}
          {Math.abs(totalWeight - 100) < 5 ? " ✓ 合理" : " ⚠ 建議總和接近 100"}
        </div>
      )}
      {Object.keys(edits).length > 0 && (
        <Button size="sm" onClick={save} className="w-full">儲存派單權重</Button>
      )}
    </div>
  );
}

// ─── Dispatch Log Panel ────────────────────────────────────────────────────────

function DispatchLogPanel() {
  const { data: logs = [] } = useQuery<DispatchLogRow[]>({
    queryKey: ["dispatch-log"],
    queryFn: () => fetch(`${API}/dispatch-log`).then(r => r.json()),
    refetchInterval: 20000,
  });

  const actionLabel: Record<string, string> = {
    auto_assign: "自動派車", manual_assign: "手動指派", failed: "派車失敗",
  };
  const actionColor: Record<string, string> = {
    auto_assign: "bg-purple-50 text-purple-700", manual_assign: "bg-blue-50 text-blue-700",
    failed: "bg-red-50 text-red-700",
  };

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {logs.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-6">尚無派車記錄</div>
      ) : logs.map(log => (
        <div key={log.id} className="border rounded-lg p-2.5 text-xs space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${actionColor[log.action] ?? "bg-muted"}`}>
              {actionLabel[log.action] ?? log.action}
            </span>
            <span className="font-bold">#{log.order_id}</span>
            <span className="text-muted-foreground">{log.customer_name}</span>
            {log.score > 0 && <span className="font-mono text-primary">{Math.round(log.score)}分</span>}
            {log.is_return_trip && <Badge className="text-[9px] h-4 py-0 bg-blue-100 text-blue-700">回頭車</Badge>}
            {log.is_carpool && <Badge className="text-[9px] h-4 py-0 bg-purple-100 text-purple-700">拼車</Badge>}
          </div>
          {log.driver_name && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Truck className="w-3 h-3" />{log.driver_name} · {log.vehicle_type}
              {log.distance_km > 0 && ` · ${log.distance_km}km`}
            </div>
          )}
          {log.reason && <div className="text-muted-foreground truncate">{log.reason}</div>}
          {log.estimated_profit > 0 && (
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-green-600 font-semibold">毛利 NT${Math.round(log.estimated_profit).toLocaleString()}</span>
              {log.savings_km > 0 && <span className="text-blue-600">省 {log.savings_km}km</span>}
            </div>
          )}
          <div className="text-muted-foreground text-[10px]">
            {log.created_at ? format(new Date(log.created_at), "MM/dd HH:mm") : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue Stats ─────────────────────────────────────────────────────────────

function RevenueStatsBar() {
  const { data: stats, isLoading } = useQuery<RevenueStats>({
    queryKey: ["revenue-stats"],
    queryFn: () => fetch(`${API}/revenue-stats`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const items = [
    { label: "總訂單", value: stats?.total_orders ?? "—", icon: <Package className="w-4 h-4" />, color: "text-blue-600" },
    { label: "已收款", value: `NT$${Math.round(parseFloat(stats?.total_revenue ?? "0")).toLocaleString()}`, icon: <DollarSign className="w-4 h-4" />, color: "text-green-600" },
    { label: "自動派車", value: stats?.auto_dispatched ?? "—", icon: <Zap className="w-4 h-4" />, color: "text-purple-600" },
    { label: "待派車", value: stats?.unassigned ?? "—", icon: <Clock className="w-4 h-4" />, color: "text-orange-500" },
    { label: "拼車次數", value: stats?.carpool_count ?? "—", icon: <Users className="w-4 h-4" />, color: "text-teal-600" },
    { label: "回頭車", value: stats?.return_trip_count ?? "—", icon: <Repeat2 className="w-4 h-4" />, color: "text-indigo-600" },
    { label: "省空車km", value: `${Math.round(parseFloat(stats?.total_savings_km ?? "0"))}km`, icon: <Route className="w-4 h-4" />, color: "text-cyan-600" },
    { label: "活躍司機", value: stats?.active_drivers ?? "—", icon: <Truck className="w-4 h-4" />, color: "text-slate-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
      {items.map(item => (
        <Card key={item.label} className="border shadow-sm">
          <CardContent className="p-2.5 flex items-center gap-1.5">
            <span className={item.color}>{item.icon}</span>
            <div className="min-w-0">
              <div className={`text-sm font-bold ${item.color} truncate`}>{isLoading ? "…" : item.value}</div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function DispatchOptimizerTab() {
  const qc = useQueryClient();
  const [view, setView] = useState<"orders" | "drivers" | "log" | "weights" | "nearby" | "quote">("orders");
  const [ocrOpen, setOcrOpen] = useState(false);

  const { data: pendingOrders = [], isLoading: ordersLoading, refetch: refetchOrders } = useQuery<PendingOrder[]>({
    queryKey: ["smart-orders"],
    queryFn: () => fetch(`${API}/smart-orders`).then(r => r.json()),
    refetchInterval: 20000,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverAvail[]>({
    queryKey: ["drivers-availability"],
    queryFn: () => fetch(`${API}/drivers/availability`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const dispatchAll = useMutation({
    mutationFn: async () => {
      const pending = pendingOrders.filter(o => o.feeStatus === "paid" && o.status === "pending");
      const results = [];
      for (const o of pending) {
        const r = await fetch(`${API}/orders/${o.id}/auto-dispatch`, { method: "POST" });
        results.push(await r.json());
      }
      return results;
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["smart-orders"] });
      const ok = results.filter(r => r.success).length;
      const fail = results.length - ok;
    },
  });

  const unassignedPaid = pendingOrders.filter(o => o.feeStatus === "paid" && o.status === "pending");
  const unassignedAll = pendingOrders.filter(o => !["dispatched","in_transit","completed","cancelled"].includes(o.pipeline));
  const availableDrivers = drivers.filter(d => d.status !== "offline" && !d.isBusy);

  return (
    <div className="space-y-4">
      <RevenueStatsBar />

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {[
            { key: "orders",  label: "待派訂單", count: unassignedAll.length },
            { key: "drivers", label: "司機狀態", count: availableDrivers.length },
            { key: "nearby",  label: "🗺 地理圍欄" },
            { key: "quote",   label: "✨ AI 報價" },
            { key: "log",     label: "派車記錄" },
            { key: "weights", label: "派單權重" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setView(tab.key as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all flex items-center gap-1
                ${view === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50"}`}>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[10px] rounded-full px-1.5 py-0 font-bold
                  ${view === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5"
          onClick={() => { qc.invalidateQueries({ queryKey: ["smart-orders"] }); qc.invalidateQueries({ queryKey: ["drivers-availability"] }); qc.invalidateQueries({ queryKey: ["revenue-stats"] }); }}>
          <RefreshCw className="w-3.5 h-3.5" /> 重新整理
        </Button>
        {unassignedPaid.length > 0 && (
          <Button size="sm" className="h-8 gap-1.5 bg-purple-600 hover:bg-purple-700"
            onClick={() => dispatchAll.mutate()} disabled={dispatchAll.isPending}>
            <Zap className="w-3.5 h-3.5" />
            {dispatchAll.isPending ? "批次派車中..." : `一鍵批次派車 (${unassignedPaid.length}筆)`}
          </Button>
        )}
      </div>

      {/* Panels */}
      {view === "orders" && (
        <div className="space-y-2">
          {/* Carpool/return suggestions banner */}
          {pendingOrders.filter(o => o.pipeline === "paid").length >= 2 && (
            <div className="flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
              <Users className="w-4 h-4 shrink-0" />
              <span>系統偵測到多筆已付款訂單，分析後可能有拼車或回頭車機會，點選「分析最佳司機」查看。</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">高優先（已付款待派）</div>
              {unassignedPaid.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6 border rounded-lg">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-500 opacity-60" />
                  已付款訂單已全數派車
                </div>
              ) : (
                unassignedPaid.map(o => (
                  <OrderAnalyzeCard key={o.id} order={o} onRefetch={refetchOrders} />
                ))
              )}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">其他待處理</div>
              {unassignedAll.filter(o => o.feeStatus !== "paid").length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6 border rounded-lg">無其他待處理訂單</div>
              ) : (
                unassignedAll.filter(o => o.feeStatus !== "paid").map(o => (
                  <OrderAnalyzeCard key={o.id} order={o} onRefetch={refetchOrders} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {view === "drivers" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />空車 {availableDrivers.length} 位</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />出車中 {drivers.filter(d => d.isBusy).length} 位</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />下線 {drivers.filter(d => d.status === "offline").length} 位</span>
          </div>
          {driversLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {drivers.map(d => <DriverCard key={d.id} driver={d} />)}
            </div>
          )}
        </div>
      )}

      {view === "log" && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> 派車記錄（含原因 / 收益 / 節省分析）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DispatchLogPanel />
          </CardContent>
        </Card>
      )}

      {view === "nearby" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Navigation className="w-4 h-4 text-green-600" /> 地理圍欄司機篩選
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NearbyDriversPanel />
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-indigo-600" /> 功能說明
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <div className="bg-green-50 rounded-lg p-3 space-y-1.5">
                <p className="font-semibold text-green-700">🗺 地理圍欄（Geofencing）</p>
                <p>系統依司機目前 GPS 位置，自動篩選半徑內的空車司機，優先推薦距離最近者，縮短等待時間並降低空車成本。</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 space-y-1.5">
                <p className="font-semibold text-indigo-700">↩ 回頭車撮合</p>
                <p>針對正在配送中的司機，系統偵測其目的地附近是否有新訂單的取貨點，促成「回頭車」，一趟車完成兩件任務，大幅降低空車率。</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-amber-700 text-xs">
                ⚠️ 司機需在 App 開啟定位分享才能顯示距離。無定位的司機仍會列出但無法計算距離。
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === "quote" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" /> AI 智慧報價引擎
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SmartQuotePanel />
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Scan className="w-4 h-4 text-violet-600" /> OCR 簽單 & 自動對帳
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-2">
                <div className="bg-violet-50 rounded-lg p-3 space-y-1.5">
                  <p className="font-semibold text-violet-700">✨ 報價引擎說明</p>
                  <p>結合車種基本費、里程單價、貨重、附加服務（尾板/液壓台車）、冷鏈費、尖峰時段乘數、急單係數，並對比歷史 90 天同類訂單的實際成交價，提供建議報價範圍。</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 space-y-1.5">
                  <p className="font-semibold text-emerald-700">📷 OCR 自動對帳</p>
                  <p>拍攝司機簽收單，AI 自動辨識訂單編號、司機、客戶、金額、簽收時間，自動計算平台抽成與司機應收款，一鍵寫入 AR 帳冊，解放財務人力。</p>
                </div>
              </div>
              <Button
                onClick={() => setOcrOpen(true)}
                className="w-full bg-violet-600 hover:bg-violet-700"
                size="sm"
              >
                <Scan className="w-4 h-4 mr-2" />
                開啟 OCR 簽單辨識
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {view === "weights" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="w-4 h-4" /> 派單評分權重
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeightPanel />
            </CardContent>
          </Card>
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings className="w-4 h-4" /> 評分說明
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <div className="space-y-1.5">
                {[
                  { color: "bg-blue-500", label: "距離分（0~100）", desc: "司機到取貨點的直線距離，越近越高分" },
                  { color: "bg-purple-500", label: "車型分（0~100）", desc: "車型完全符合 100，相容 75，過大 40，無法配送 0" },
                  { color: "bg-green-500", label: "收益分（0~100）", desc: "（訂單收入－估算成本）/ 訂單收入 × 200" },
                  { color: "bg-orange-500", label: "時效分（0~100）", desc: "距離取貨時間越近分數越高，緊急訂單 100 分" },
                  { color: "bg-blue-200", label: "回頭車加分", desc: "司機送完貨後目的地接近下一張取貨點時加分" },
                  { color: "bg-purple-200", label: "拼車加分", desc: "司機在途中且此訂單可合併時加分" },
                ].map(item => (
                  <div key={item.label} className="flex gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.color} shrink-0 mt-0.5`} />
                    <div>
                      <span className="font-medium text-foreground">{item.label}：</span>{item.desc}
                    </div>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="font-medium text-foreground text-[11px]">總分公式</div>
              <div className="bg-muted rounded p-2 font-mono text-[10px] leading-relaxed">
                總分 = (距離×W距 + 車型×W車 + 收益×W利 + 時效×W時) / 100<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 回頭車加分 + 拼車加分
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <OcrReceiptDialog open={ocrOpen} onClose={() => setOcrOpen(false)} />
    </div>
  );
}
