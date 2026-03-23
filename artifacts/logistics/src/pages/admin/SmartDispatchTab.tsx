import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator, CreditCard, Truck, CheckCircle2, Clock, AlertCircle,
  Zap, RefreshCw, Settings, TrendingUp, Package, DollarSign,
  ChevronRight, Play, Search, X, BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineOrder {
  id: number;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  cargoDescription: string;
  status: string;
  feeStatus: string;
  totalFee: number | null;
  suggestedPrice: number | null;
  paymentGateway: string | null;
  paymentConfirmedAt: string | null;
  autoDispatchedAt: string | null;
  dispatchAttempts: number | null;
  requiredVehicleType: string | null;
  createdAt: string;
  driver: { id: number; name: string; phone: string; vehicleType: string; plateNumber: string } | null;
  pipeline: string;
}

interface PricingConfigRow {
  id: number; key: string; value: string; label: string;
}

// ─── Pipeline Stage helpers ───────────────────────────────────────────────────

const STAGES: Record<string, { label: string; color: string; icon: React.ReactNode; order: number }> = {
  new:        { label: "待報價", color: "bg-slate-100 text-slate-600 border-slate-200",       icon: <Package className="w-3 h-3" />,     order: 0 },
  quoted:     { label: "已報價", color: "bg-blue-50 text-blue-700 border-blue-200",           icon: <Calculator className="w-3 h-3" />,  order: 1 },
  paid:       { label: "已付款", color: "bg-green-50 text-green-700 border-green-200",        icon: <CreditCard className="w-3 h-3" />,  order: 2 },
  dispatched: { label: "已派車", color: "bg-purple-50 text-purple-700 border-purple-200",     icon: <Truck className="w-3 h-3" />,       order: 3 },
  in_transit: { label: "配送中", color: "bg-orange-50 text-orange-700 border-orange-200",     icon: <Zap className="w-3 h-3" />,         order: 4 },
  completed:  { label: "已完成", color: "bg-emerald-50 text-emerald-700 border-emerald-200",  icon: <CheckCircle2 className="w-3 h-3" />,order: 5 },
  cancelled:  { label: "已取消", color: "bg-red-50 text-red-700 border-red-200",              icon: <X className="w-3 h-3" />,           order: 6 },
};

function StageBadge({ stage }: { stage: string }) {
  const s = STAGES[stage] ?? STAGES.new!;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
}

function PipelineBar({ pipeline }: { pipeline: string }) {
  const stageOrder = ["new","quoted","paid","dispatched","in_transit","completed"];
  const current = STAGES[pipeline]?.order ?? 0;
  if (pipeline === "cancelled") return null;
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {stageOrder.map((s, i) => {
        const done = i < current;
        const active = s === pipeline;
        return (
          <div key={s} className="flex items-center gap-0.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border transition-all
              ${active ? "bg-primary text-primary-foreground border-primary" :
                done ? "bg-primary/20 text-primary border-primary/30" :
                "bg-muted text-muted-foreground border-muted-foreground/20"}`}>
              {i + 1}
            </div>
            {i < stageOrder.length - 1 && (
              <div className={`h-0.5 w-3 rounded ${done ? "bg-primary/40" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Smart Quote Panel (modal) ─────────────────────────────────────────────────

function SmartQuoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    distanceKm: "", cargoWeightKg: "", vehicleType: "",
    pickupTime: "", needTailgate: false, needHydraulicPallet: false, waitingHours: "0",
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function calcQuote() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/smart-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceKm: parseFloat(form.distanceKm) || 0,
          cargoWeightKg: parseFloat(form.cargoWeightKg) || 0,
          vehicleType: form.vehicleType || undefined,
          pickupTime: form.pickupTime || undefined,
          needTailgate: form.needTailgate,
          needHydraulicPallet: form.needHydraulicPallet,
          waitingHours: parseFloat(form.waitingHours) || 0,
        }),
      });
      const data = await res.json();
      if (data.breakdown) setResult(data.breakdown);
      else toast({ title: "計算失敗", description: data.error, variant: "destructive" });
    } finally { setLoading(false); }
  }

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" /> 智能即時報價
          </DialogTitle>
          <DialogDescription>輸入貨物條件，系統自動計算建議價、最低價與尖峰加價</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <Label className="text-xs">距離 (公里)</Label>
            <Input placeholder="50" value={form.distanceKm} onChange={e => set("distanceKm", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">重量 (公斤)</Label>
            <Input placeholder="500" value={form.cargoWeightKg} onChange={e => set("cargoWeightKg", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">車型</Label>
            <Select value={form.vehicleType} onValueChange={v => set("vehicleType", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="自動推薦" /></SelectTrigger>
              <SelectContent>
                {["1.75T","3.5T","5T","8.8T","10.5T","15T","17T","26T","35T","43T"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">取貨時間（影響尖峰）</Label>
            <Input type="time" value={form.pickupTime} onChange={e => set("pickupTime", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">等候時數</Label>
            <Input placeholder="0" value={form.waitingHours} onChange={e => set("waitingHours", e.target.value)} className="mt-1" />
          </div>
          <div className="flex flex-col gap-2 justify-center">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.needTailgate} onChange={e => set("needTailgate", e.target.checked)} className="rounded" />
              需要尾門
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.needHydraulicPallet} onChange={e => set("needHydraulicPallet", e.target.checked)} className="rounded" />
              需要油壓板
            </label>
          </div>
        </div>

        <Button onClick={calcQuote} disabled={loading} className="w-full gap-2">
          <Zap className="w-4 h-4" /> {loading ? "計算中..." : "計算報價"}
        </Button>

        {result && (
          <div className="space-y-3 pt-1">
            <Separator />
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "最低價", value: result.min, color: "text-muted-foreground", sub: `毛利率 ${result.min && result.base ? Math.round(((result.min - result.base) / result.base) * 100) : 0}%` },
                { label: "建議售價", value: result.suggested, color: "text-primary font-bold", sub: "含毛利", primary: true },
                { label: result.isPeakHour ? `尖峰加價 ×${result.peakMultiplier}` : "尖峰加價", value: result.peak ?? result.suggested, color: result.isPeakHour ? "text-orange-600 font-bold" : "text-muted-foreground", sub: result.isPeakHour ? "⚡ 尖峰時段" : "非尖峰時段" },
              ].map(item => (
                <div key={item.label} className={`rounded-lg p-3 text-center border ${item.primary ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
                  <div className={`text-xl font-bold ${item.color}`}>NT${(item.value ?? 0).toLocaleString()}</div>
                  <div className="text-[11px] font-medium mt-0.5">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>成本基底：NT${result.base?.toLocaleString()}</span>
              <span>含稅 5%：NT${result.withTax?.toLocaleString()}</span>
              <span>報價有效：{result.expiresMinutes} 分鐘</span>
              <span className="text-orange-500">{result.isPeakHour ? "⚡ 目前尖峰時段" : "目前非尖峰"}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({ order, onClose, onSuccess }: {
  order: PipelineOrder | null; onClose: () => void; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [method, setMethod] = useState("bank_transfer");
  const [amount, setAmount] = useState("");
  const [txnId, setTxnId] = useState("");
  const [loading, setLoading] = useState(false);

  if (!order) return null;
  const suggestedAmt = order.totalFee ?? order.suggestedPrice ?? 0;

  async function handlePay() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/orders/${order.id}/process-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          amount: parseFloat(amount) || suggestedAmt,
          transactionId: txnId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "付款確認成功", description: data.autoDispatch?.success ? `已自動派車給 ${data.autoDispatch.driverName}` : "付款已確認" });
        onSuccess();
      } else {
        toast({ title: "付款失敗", description: data.error, variant: "destructive" });
      }
    } finally { setLoading(false); }
  }

  const methodLabels: Record<string, string> = {
    cash: "現金", bank_transfer: "銀行轉帳", line_pay: "LINE Pay", credit_card: "信用卡",
  };
  const methodIcons: Record<string, string> = { cash: "💵", bank_transfer: "🏦", line_pay: "💚", credit_card: "💳" };

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-600" /> 確認付款
          </DialogTitle>
          <DialogDescription>訂單 #{order.id} · {order.customerName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="p-3 rounded-lg bg-muted/40 text-sm space-y-1">
            <div className="text-xs text-muted-foreground">金額（建議 NT${suggestedAmt.toLocaleString()}）</div>
            <Input
              type="number"
              value={amount || suggestedAmt}
              onChange={e => setAmount(e.target.value)}
              className="font-bold text-lg h-10"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">付款方式</Label>
            <div className="grid grid-cols-2 gap-2">
              {["cash","bank_transfer","line_pay","credit_card"].map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`p-2.5 rounded-lg border text-sm text-left transition-all ${method === m ? "border-primary bg-primary/5 font-semibold" : "hover:bg-muted/50"}`}>
                  <span className="mr-1.5">{methodIcons[m]}</span>{methodLabels[m]}
                </button>
              ))}
            </div>
          </div>
          {(method === "bank_transfer" || method === "credit_card" || method === "line_pay") && (
            <div>
              <Label className="text-xs">交易號碼 / 末五碼</Label>
              <Input placeholder="可選填" value={txnId} onChange={e => setTxnId(e.target.value)} className="mt-1" />
            </div>
          )}
          {method === "bank_transfer" && (
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-1">
              <p className="font-semibold">公司帳戶資訊</p>
              <p>銀行：台灣銀行 004</p>
              <p>帳號：123-456-789-001</p>
              <p>戶名：富詠運輸有限公司</p>
            </div>
          )}
          {method === "line_pay" && (
            <div className="p-3 bg-green-50 rounded-lg text-xs text-green-700 text-center">
              <p className="font-semibold mb-1">LINE Pay 付款</p>
              <p className="text-muted-foreground">實際串接需設定 LINE Pay API 金鑰</p>
              <p className="text-muted-foreground">目前為模擬付款模式</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handlePay} disabled={loading} className="w-full gap-2 bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="w-4 h-4" />
            {loading ? "處理中..." : `確認收款 NT$${(parseFloat(amount) || suggestedAmt).toLocaleString()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pricing Config Panel ──────────────────────────────────────────────────────

function PricingConfigPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery<PricingConfigRow[]>({
    queryKey: ["pricing-config"],
    queryFn: () => fetch(`${API}/pricing-config`).then(r => r.json()),
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const merged = configs.map(c => ({ ...c, value: edits[c.key] ?? c.value }));

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${API}/pricing-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edits),
      });
      qc.invalidateQueries({ queryKey: ["pricing-config"] });
      setEdits({});
      toast({ title: "設定已儲存" });
    } finally { setSaving(false); }
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="w-4 h-4" /> 報價與派車設定
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {merged.map(c => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-36 shrink-0">{c.label}</span>
              <Input
                value={c.value}
                onChange={e => setEdits(prev => ({ ...prev, [c.key]: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
        {Object.keys(edits).length > 0 && (
          <Button size="sm" onClick={handleSave} disabled={saving} className="mt-2 w-full">
            {saving ? "儲存中..." : "儲存設定"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Order Pipeline Card ───────────────────────────────────────────────────────

function OrderPipelineCard({ order, onPay, onDispatch }: {
  order: PipelineOrder;
  onPay: (o: PipelineOrder) => void;
  onDispatch: (id: number) => void;
}) {
  const canPay = order.pipeline === "quoted" || (order.pipeline === "new" && (order.totalFee || order.suggestedPrice));
  const canDispatch = order.pipeline === "paid";

  return (
    <div className="border rounded-lg bg-card hover:shadow-sm transition-shadow p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold">#{order.id}</span>
            <span className="text-sm">{order.customerName}</span>
            <StageBadge stage={order.pipeline} />
            {order.autoDispatchedAt && <Badge variant="outline" className="text-[10px] py-0 h-4 border-purple-300 text-purple-600">自動派車</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {order.pickupAddress} → {order.deliveryAddress}
          </div>
        </div>
        <div className="text-right shrink-0">
          {(order.totalFee || order.suggestedPrice) ? (
            <div className="font-bold text-primary text-sm">
              NT${(order.totalFee ?? order.suggestedPrice ?? 0).toLocaleString()}
            </div>
          ) : <div className="text-xs text-muted-foreground">未報價</div>}
          <div className="text-[10px] text-muted-foreground">
            {format(new Date(order.createdAt), "MM/dd HH:mm")}
          </div>
        </div>
      </div>

      <PipelineBar pipeline={order.pipeline} />

      {order.driver && (
        <div className="flex items-center gap-1.5 text-xs bg-purple-50 px-2 py-1 rounded border border-purple-100">
          <Truck className="w-3 h-3 text-purple-500 shrink-0" />
          <span className="font-medium">{order.driver.name}</span>
          <span className="text-muted-foreground">{order.driver.phone}</span>
          {order.driver.plateNumber && <span className="font-mono bg-white px-1 rounded">{order.driver.plateNumber}</span>}
        </div>
      )}

      {order.paymentGateway && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          付款方式：{
            ({ cash: "現金", bank_transfer: "銀行轉帳", line_pay: "LINE Pay", credit_card: "信用卡" } as Record<string,string>)[order.paymentGateway] ?? order.paymentGateway
          }
          {order.paymentConfirmedAt && ` · ${format(new Date(order.paymentConfirmedAt), "MM/dd HH:mm")}`}
        </div>
      )}

      {(canPay || canDispatch) && (
        <div className="flex gap-2 pt-1">
          {canPay && (
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => onPay(order)}>
              <CreditCard className="w-3 h-3" /> 確認付款
            </Button>
          )}
          {canDispatch && (
            <Button size="sm" className="flex-1 h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-700"
              onClick={() => onDispatch(order.id)}>
              <Zap className="w-3 h-3" /> 手動觸發派車
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ orders }: { orders: PipelineOrder[] }) {
  const totalRevenue = orders.filter(o => o.feeStatus === "paid").reduce((s, o) => s + (o.totalFee ?? 0), 0);
  const autoDispatchCount = orders.filter(o => o.autoDispatchedAt).length;
  const pendingPayment = orders.filter(o => o.pipeline === "quoted").length;
  const todayOrders = orders.filter(o => {
    const d = new Date(o.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "今日訂單", value: todayOrders, icon: <Package className="w-4 h-4" />, color: "text-blue-600" },
        { label: "待付款", value: pendingPayment, icon: <Clock className="w-4 h-4" />, color: "text-orange-500" },
        { label: "自動派車", value: autoDispatchCount, icon: <Zap className="w-4 h-4" />, color: "text-purple-600" },
        { label: "已收金額", value: `NT$${Math.round(totalRevenue).toLocaleString()}`, icon: <TrendingUp className="w-4 h-4" />, color: "text-green-600" },
      ].map(item => (
        <Card key={item.label} className="border shadow-sm">
          <CardContent className="p-3 flex items-center gap-2">
            <span className={item.color}>{item.icon}</span>
            <div>
              <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
              <div className="text-[11px] text-muted-foreground">{item.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SmartDispatchTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [payingOrder, setPayingOrder] = useState<PipelineOrder | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const { data: orders = [], isLoading, refetch } = useQuery<PipelineOrder[]>({
    queryKey: ["smart-orders"],
    queryFn: () => fetch(`${API}/smart-orders`).then(r => r.json()),
    refetchInterval: 15000,
  });

  const dispatchMut = useMutation({
    mutationFn: (id: number) => fetch(`${API}/orders/${id}/auto-dispatch`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["smart-orders"] });
      if (data.success) toast({ title: `已派車給 ${data.driverName}` });
      else toast({ title: "派車失敗", description: data.reason, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let list = orders;
    if (filterStage !== "all") list = list.filter(o => o.pipeline === filterStage);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        String(o.id).includes(q) ||
        o.pickupAddress.toLowerCase().includes(q) ||
        o.deliveryAddress.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filterStage, search]);

  const stageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) counts[o.pipeline] = (counts[o.pipeline] ?? 0) + 1;
    return counts;
  }, [orders]);

  return (
    <div className="space-y-4">
      <StatsBar orders={orders} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setQuoteOpen(true)}>
          <Calculator className="w-3.5 h-3.5" /> 即時報價試算
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> 重新整理
        </Button>
        <Button size="sm" variant="outline" className={`gap-1.5 h-8 ${showConfig ? "bg-muted" : ""}`} onClick={() => setShowConfig(v => !v)}>
          <Settings className="w-3.5 h-3.5" /> 報價設定
        </Button>
      </div>

      {showConfig && <PricingConfigPanel />}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜尋客戶、電話、訂單號..."
            className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", ...Object.keys(STAGES)].map(stage => (
            <button key={stage} onClick={() => setFilterStage(stage)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${filterStage === stage ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50"}`}>
              {stage === "all" ? "全部" : STAGES[stage]?.label ?? stage}
              {stageCount[stage] !== undefined && stage !== "all" && (
                <span className="ml-1 opacity-70">({stageCount[stage]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted/60 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground text-sm border shadow-sm">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-30" />
          {search || filterStage !== "all" ? "沒有符合條件的訂單" : "尚無訂單資料"}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(o => (
            <OrderPipelineCard key={o.id} order={o} onPay={setPayingOrder} onDispatch={id => dispatchMut.mutate(id)} />
          ))}
        </div>
      )}

      <SmartQuoteModal open={quoteOpen} onClose={() => setQuoteOpen(false)} />
      <PaymentModal
        order={payingOrder}
        onClose={() => setPayingOrder(null)}
        onSuccess={() => { setPayingOrder(null); qc.invalidateQueries({ queryKey: ["smart-orders"] }); }}
      />
    </div>
  );
}
