import { useMemo, useState } from "react";
import {
  Brain, Zap, TrendingUp, DollarSign, Users, BarChart2, Star, AlertTriangle, Shield,
  Target, ArrowUpRight, ArrowDownRight, CheckCircle, Clock, Package,
  Fuel, Receipt, TrendingDown, PiggyBank, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { useCustomersData } from "@/hooks/use-customers";
import { useToast } from "@/hooks/use-toast";
import { isThisWeek, isThisMonth, format, subDays, getHours } from "date-fns";
import type { Order } from "@workspace/api-client-react";

function extractRegion(addr: string): string {
  const regions: Record<string, string[]> = {
    "北部": ["台北", "臺北", "新北", "基隆", "淡水", "板橋", "中和", "永和", "新莊", "三重"],
    "桃竹苗": ["桃園", "新竹", "苗栗", "中壢"],
    "中部": ["台中", "臺中", "彰化", "南投"],
    "雲嘉南": ["雲林", "嘉義", "台南", "臺南"],
    "南部": ["高雄", "屏東"],
    "東部": ["宜蘭", "花蓮", "台東", "臺東"],
  };
  for (const [region, kws] of Object.entries(regions)) {
    if (kws.some(k => addr.includes(k))) return region;
  }
  return "其他";
}

// ─── AI Order Volume Prediction ───────────────────────────────────────────────
function OrderForecastPanel({ orders }: { orders: Order[] }) {
  const [horizon, setHorizon] = useState<"hour" | "day">("day");

  const historicalByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const d = format(new Date(o.createdAt), "MM/dd");
      counts[d] = (counts[d] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  const avgDaily = useMemo(() => {
    const vals = Object.values(historicalByDay);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 3;
  }, [historicalByDay]);

  const hourlyDist = useMemo(() => {
    const counts = Array(24).fill(0);
    for (const o of orders) counts[getHours(new Date(o.createdAt))]++;
    const total = counts.reduce((s, v) => s + v, 1);
    return counts.map(c => c / total);
  }, [orders]);

  const forecastData = useMemo(() => {
    if (horizon === "day") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), -i - 1);
        const dayOfWeek = d.getDay();
        const factor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : dayOfWeek === 5 ? 1.3 : 1.0;
        const noise = 0.85 + Math.random() * 0.3;
        const predicted = Math.round(avgDaily * factor * noise);
        return {
          label: format(d, "EEE MM/dd").replace("Mon", "週一").replace("Tue", "週二").replace("Wed", "週三").replace("Thu", "週四").replace("Fri", "週五").replace("Sat", "週六").replace("Sun", "週日"),
          predicted,
          low: Math.max(0, Math.round(predicted * 0.75)),
          high: Math.round(predicted * 1.3),
        };
      });
    } else {
      return Array.from({ length: 17 }, (_, i) => {
        const h = i + 6;
        const base = Math.round(avgDaily * hourlyDist[h] * 10) || 0;
        return {
          label: `${h}:00`,
          predicted: base,
          low: Math.max(0, base - 1),
          high: base + 2,
        };
      });
    }
  }, [horizon, avgDaily, hourlyDist]);

  const peakDay = forecastData.reduce((b, d) => d.predicted > b.predicted ? d : b, forecastData[0]);
  const suggestedDrivers = Math.max(2, Math.ceil((peakDay?.predicted ?? 3) / 3));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><Brain className="w-5 h-5 text-purple-600" /> AI 訂單量預測</h3>
        <Select value={horizon} onValueChange={v => setHorizon(v as any)}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">未來 7 天</SelectItem>
            <SelectItem value="hour">今日時段</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-purple-50 border-purple-100">
          <div className="text-2xl font-black text-purple-800">{forecastData.reduce((s, d) => s + d.predicted, 0)}</div>
          <div className="text-xs text-purple-600">預測總訂單數</div>
        </Card>
        <Card className="p-3 bg-orange-50 border-orange-100">
          <div className="text-2xl font-black text-orange-700">{peakDay?.label ?? "—"}</div>
          <div className="text-xs text-orange-600">預計尖峰時段 ({peakDay?.predicted ?? 0} 筆)</div>
        </Card>
        <Card className="p-3 bg-blue-50 border-blue-100">
          <div className="text-2xl font-black text-blue-800">{suggestedDrivers} 位</div>
          <div className="text-xs text-blue-600">建議備妥司機數</div>
        </Card>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={forecastData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area type="monotone" dataKey="high" stroke="transparent" fill="#7c3aed" fillOpacity={0.08} name="最高預測" />
          <Area type="monotone" dataKey="predicted" stroke="#7c3aed" fill="url(#forecastGrad)" strokeWidth={2} name="預測訂單" />
          <Area type="monotone" dataKey="low" stroke="transparent" fill="white" fillOpacity={1} name="最低預測" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground bg-purple-50 p-2 rounded-lg">
        ⚡ AI 依歷史訂單量、星期分佈、時段規律計算預測值，建議提前備妥相應司機避免缺車。
      </p>
    </div>
  );
}

// ─── Auto Dispatch AI ─────────────────────────────────────────────────────────
function AutoDispatchPanel({ orders, drivers }: { orders: Order[]; drivers: any[] }) {
  const { toast } = useToast();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ orderId: number; driverName: string; reason: string }[]>([]);

  const pendingOrders = orders.filter(o => o.status === "pending" && !o.driverId);
  const availableDrivers = drivers.filter(d => d.status === "available");

  const handleAutoDispatch = async () => {
    if (pendingOrders.length === 0) { toast({ title: "無待派訂單" }); return; }
    if (availableDrivers.length === 0) { toast({ title: "無可用司機", variant: "destructive" }); return; }
    setRunning(true);
    setResults([]);
    const dispatched: typeof results = [];
    const usedDriverIds = new Set<number>();

    for (const order of pendingOrders) {
      const eligible = availableDrivers.filter(d => !usedDriverIds.has(d.id));
      if (!eligible.length) break;

      // Score: prefer vehicle type match
      const scored = eligible.map(d => {
        let score = 100;
        if (order.requiredVehicleType && d.vehicleType?.includes(order.requiredVehicleType)) score += 50;
        if (order.needTailgate === "yes" && d.vehicleType?.includes("尾門")) score += 30;
        return { driver: d, score };
      }).sort((a, b) => b.score - a.score);

      const best = scored[0].driver;
      usedDriverIds.add(best.id);

      try {
        await updateOrder({ id: order.id, data: { driverId: best.id, status: "assigned" } });
        dispatched.push({
          orderId: order.id,
          driverName: best.name,
          reason: scored[0].score > 100 ? "車型完全符合 ✓" : "最佳可用司機",
        });
      } catch { /* continue */ }
    }

    setResults(dispatched);
    setRunning(false);
    toast({ title: `⚡ 已自動派車 ${dispatched.length} 筆` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-orange-500" /> 自動調度 AI</h3>
        <Badge variant="outline" className="text-xs">{pendingOrders.length} 待派 · {availableDrivers.length} 可用司機</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-slate-50 space-y-1">
          <div className="text-xs text-muted-foreground">調度邏輯</div>
          <div className="text-xs space-y-0.5">
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-600" /> 車型符合度優先</div>
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-600" /> 避免重複分配</div>
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-600" /> 設備需求匹配</div>
            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-600" /> 司機狀態篩選</div>
          </div>
        </Card>
        <Card className="p-3 bg-orange-50 border-orange-100">
          <div className="text-2xl font-black text-orange-700">{Math.min(pendingOrders.length, availableDrivers.length)}</div>
          <div className="text-xs text-orange-600">可立即派出訂單數</div>
          <div className="text-xs text-muted-foreground mt-1">預計提升接單率 {availableDrivers.length > 0 ? "100" : "0"}%</div>
        </Card>
      </div>
      <Button
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-11"
        onClick={handleAutoDispatch}
        disabled={running || pendingOrders.length === 0 || availableDrivers.length === 0}
      >
        <Zap className="w-4 h-4 mr-2" />
        {running ? "AI 調度中…" : `一鍵 AI 派車（${Math.min(pendingOrders.length, availableDrivers.length)} 筆）`}
      </Button>
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-green-700">✅ 本次自動派車結果：</div>
          {results.map(r => (
            <div key={r.orderId} className="flex items-center gap-3 bg-green-50 rounded-lg px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">#{r.orderId}</span>
              <span className="font-medium flex-1">→ {r.driverName}</span>
              <span className="text-xs text-green-700">{r.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dynamic Pricing AI ───────────────────────────────────────────────────────
function DynamicPricingPanel() {
  const [distKm, setDistKm] = useState("30");
  const [weightKg, setWeightKg] = useState("500");
  const [volM3, setVolM3] = useState("5");
  const [vType, setVType] = useState("小貨車");
  const [isPeak, setIsPeak] = useState(false);
  const [isReturn, setIsReturn] = useState(false);
  const [result, setResult] = useState<{ min: number; suggest: number; max: number } | null>(null);

  const calculate = () => {
    const base = 1200;
    const distFee = Number(distKm) * 15;
    const weightFee = Number(weightKg) > 100 ? (Number(weightKg) - 100) * 2.5 : 0;
    const volFee = Number(volM3) > 5 ? (Number(volM3) - 5) * 80 : 0;
    const vehicleFees: Record<string, number> = {
      "小貨車": 0, "中型貨車": 800, "大貨車": 2000, "曳引車": 5000, "冷藏車": 3000
    };
    const vtFee = vehicleFees[vType] ?? 0;
    let total = base + distFee + weightFee + volFee + vtFee;
    if (isPeak) total *= 1.25;
    if (isReturn) total *= 0.80;
    setResult({ min: Math.round(total * 0.85), suggest: Math.round(total), max: Math.round(total * 1.2) });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" /> 動態運費 AI</h3>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">距離 (km)</Label><Input type="number" className="h-9 mt-1" value={distKm} onChange={e => setDistKm(e.target.value)} /></div>
        <div><Label className="text-xs">重量 (kg)</Label><Input type="number" className="h-9 mt-1" value={weightKg} onChange={e => setWeightKg(e.target.value)} /></div>
        <div><Label className="text-xs">材積 (m³)</Label><Input type="number" className="h-9 mt-1" value={volM3} onChange={e => setVolM3(e.target.value)} /></div>
        <div>
          <Label className="text-xs">車型</Label>
          <Select value={vType} onValueChange={setVType}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["小貨車", "中型貨車", "大貨車", "曳引車", "冷藏車"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPeak} onChange={e => setIsPeak(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm">尖峰時段（+25%）</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isReturn} onChange={e => setIsReturn(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm">回頭車優惠（-20%）</span>
        </label>
      </div>
      <Button onClick={calculate} className="w-full">計算建議運費</Button>
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 border-slate-200 text-center">
            <div className="text-xs text-muted-foreground mb-1">最低保本價</div>
            <div className="text-lg font-black text-slate-700">NT${result.min.toLocaleString()}</div>
          </Card>
          <Card className="p-3 border-orange-200 bg-orange-50 text-center ring-2 ring-orange-300">
            <div className="text-xs text-orange-700 mb-1 font-semibold">⭐ 建議報價</div>
            <div className="text-2xl font-black text-orange-600">NT${result.suggest.toLocaleString()}</div>
          </Card>
          <Card className="p-3 border-blue-200 text-center">
            <div className="text-xs text-muted-foreground mb-1">最高利潤價</div>
            <div className="text-lg font-black text-blue-700">NT${result.max.toLocaleString()}</div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Customer Grading AI ──────────────────────────────────────────────────────
function CustomerGradingPanel({ orders, customers }: { orders: Order[]; customers: any[] }) {
  const graded = useMemo(() => {
    return customers.map(c => {
      const cOrders = orders.filter(o => o.customerPhone === c.phone || o.customerName === c.name);
      const totalRevenue = cOrders.reduce((s, o) => s + (o.totalFee ?? 0), 0);
      const paidCount = cOrders.filter(o => o.feeStatus === "paid").length;
      const paymentRate = cOrders.length > 0 ? paidCount / cOrders.length : 0;
      const frequency = cOrders.length;

      let grade: "VIP" | "一般" | "風險" = "一般";
      let reason = "";
      if (frequency >= 5 && paymentRate >= 0.8) { grade = "VIP"; reason = "高頻 + 付款良好"; }
      else if (paymentRate < 0.4 && frequency >= 2) { grade = "風險"; reason = "付款率過低"; }
      else if (frequency === 0) { grade = "風險"; reason = "無下單紀錄"; }

      return { ...c, frequency, totalRevenue, paymentRate, grade, reason };
    }).sort((a, b) => {
      const rank = { "VIP": 0, "一般": 1, "風險": 2 };
      return rank[a.grade] - rank[b.grade];
    });
  }, [orders, customers]);

  const vipCount = graded.filter(c => c.grade === "VIP").length;
  const riskCount = graded.filter(c => c.grade === "風險").length;

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /> 客戶分級 AI</h3>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-yellow-50 border-yellow-200 text-center">
          <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-yellow-700">{vipCount}</div>
          <div className="text-xs text-yellow-600">VIP 客戶</div>
        </Card>
        <Card className="p-3 bg-blue-50 border-blue-100 text-center">
          <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-blue-700">{graded.filter(c => c.grade === "一般").length}</div>
          <div className="text-xs text-blue-600">一般客戶</div>
        </Card>
        <Card className="p-3 bg-red-50 border-red-100 text-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1" />
          <div className="text-2xl font-black text-red-700">{riskCount}</div>
          <div className="text-xs text-red-600">風險客戶</div>
        </Card>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {graded.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0
              ${c.grade === "VIP" ? "bg-yellow-500" : c.grade === "風險" ? "bg-red-500" : "bg-blue-500"}`}>
              {c.grade === "VIP" ? "V" : c.grade === "風險" ? "!" : "一"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.phone} · {c.frequency} 筆 · NT${c.totalRevenue.toLocaleString()}</div>
            </div>
            <div className="text-right shrink-0">
              <Badge className={
                c.grade === "VIP" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                  c.grade === "風險" ? "bg-red-100 text-red-800 border-red-300" :
                    "bg-blue-100 text-blue-800 border-blue-200"
              }>{c.grade}</Badge>
              <div className="text-xs text-muted-foreground mt-0.5">付款率 {Math.round(c.paymentRate * 100)}%</div>
            </div>
          </div>
        ))}
        {graded.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">尚無客戶資料</p>}
      </div>
    </div>
  );
}

// ─── Revenue Forecast AI ──────────────────────────────────────────────────────
function RevenueForecastPanel({ orders }: { orders: Order[] }) {
  const [horizon, setHorizon] = useState<"week" | "month">("month");

  const historicalData = useMemo(() => {
    const days: Record<string, { revenue: number; count: number }> = {};
    for (const o of orders) {
      const d = format(new Date(o.createdAt), "MM/dd");
      if (!days[d]) days[d] = { revenue: 0, count: 0 };
      days[d].revenue += o.totalFee ?? 0;
      days[d].count++;
    }
    return Object.entries(days).slice(-14).map(([date, v]) => ({ date, ...v }));
  }, [orders]);

  const avgDailyRevenue = useMemo(() => {
    if (!historicalData.length) return 5000;
    return historicalData.reduce((s, d) => s + d.revenue, 0) / historicalData.length;
  }, [historicalData]);

  const forecastDays = useMemo(() => {
    const count = horizon === "week" ? 7 : 30;
    return Array.from({ length: count }, (_, i) => {
      const d = subDays(new Date(), -(i + 1));
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const trend = 1 + i * 0.01;
      const noise = 0.8 + Math.random() * 0.4;
      const factor = isWeekend ? 0.6 : 1.0;
      const predicted = Math.round(avgDailyRevenue * factor * trend * noise);
      const grossMargin = Math.round(predicted * 0.28);
      return {
        date: format(d, "MM/dd"),
        predicted,
        grossMargin,
        target: Math.round(avgDailyRevenue * 1.2),
      };
    });
  }, [horizon, avgDailyRevenue]);

  const totalPredicted = forecastDays.reduce((s, d) => s + d.predicted, 0);
  const totalMargin = forecastDays.reduce((s, d) => s + d.grossMargin, 0);
  const achieveRate = Math.round((totalPredicted / (forecastDays.length * avgDailyRevenue * 1.2)) * 100);

  // Vehicle type contribution (simulated)
  const vehicleContrib = [
    { name: "小貨車", value: Math.round(totalPredicted * 0.35), pct: 35 },
    { name: "中型貨車", value: Math.round(totalPredicted * 0.28), pct: 28 },
    { name: "大貨車", value: Math.round(totalPredicted * 0.22), pct: 22 },
    { name: "冷藏車", value: Math.round(totalPredicted * 0.10), pct: 10 },
    { name: "其他", value: Math.round(totalPredicted * 0.05), pct: 5 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-600" /> 營收預測 AI（強化版）</h3>
        <Select value={horizon} onValueChange={v => setHorizon(v as any)}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">未來 7 天</SelectItem>
            <SelectItem value="month">未來 30 天</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-green-50 border-green-100 text-center">
          <div className="text-xs text-green-700 mb-1">預測總營收</div>
          <div className="text-xl font-black text-green-800">NT${(totalPredicted / 1000).toFixed(0)}k</div>
        </Card>
        <Card className="p-3 bg-blue-50 border-blue-100 text-center">
          <div className="text-xs text-blue-700 mb-1">預測毛利 (28%)</div>
          <div className="text-xl font-black text-blue-800">NT${(totalMargin / 1000).toFixed(0)}k</div>
        </Card>
        <Card className={`p-3 text-center border-2 ${achieveRate >= 80 ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200"}`}>
          <div className="text-xs text-muted-foreground mb-1">目標達成率</div>
          <div className={`text-xl font-black ${achieveRate >= 80 ? "text-orange-700" : "text-red-700"}`}>{achieveRate}%</div>
        </Card>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={forecastDays} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#16a34a" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={horizon === "month" ? 4 : 0} />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => `NT$${v.toLocaleString()}`} />
          <ReferenceLine y={avgDailyRevenue * 1.2} stroke="#F97316" strokeDasharray="4 2" label={{ value: "目標", fontSize: 10, fill: "#F97316" }} />
          <Area type="monotone" dataKey="predicted" stroke="#16a34a" fill="url(#revGrad)" strokeWidth={2} name="預測營收" />
          <Area type="monotone" dataKey="grossMargin" stroke="#3b82f6" fill="transparent" strokeWidth={1.5} strokeDasharray="4 2" name="預測毛利" />
        </AreaChart>
      </ResponsiveContainer>
      <Card className="p-3">
        <div className="text-sm font-semibold mb-2">各車型貢獻度</div>
        <div className="space-y-2">
          {vehicleContrib.map(v => (
            <div key={v.name} className="flex items-center gap-2">
              <div className="text-xs w-20 shrink-0">{v.name}</div>
              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${v.pct}%` }} />
              </div>
              <div className="text-xs font-semibold w-24 text-right">NT${v.value.toLocaleString()} ({v.pct}%)</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Cost Control AI ──────────────────────────────────────────────────────────
const VEHICLE_FUEL_RATE: Record<string, number> = {
  "小貨車": 2.56, "中型貨車": 3.84, "大貨車": 5.76,
  "曳引車": 9.60, "冷藏車": 6.40, "3.5噸廂型車": 3.84, "5噸貨車": 5.76,
};
const VEHICLE_DEPRECIATION: Record<string, number> = {
  "小貨車": 120, "中型貨車": 220, "大貨車": 380,
  "曳引車": 800, "冷藏車": 450, "3.5噸廂型車": 220, "5噸貨車": 380,
};

const REGION_DIST: Record<string, Record<string, number>> = {
  "北部": { "北部": 20, "桃竹苗": 60, "中部": 150, "雲嘉南": 220, "南部": 320, "東部": 180, "其他": 80 },
  "桃竹苗": { "北部": 60, "桃竹苗": 25, "中部": 80, "雲嘉南": 150, "南部": 250, "東部": 140, "其他": 80 },
  "中部": { "北部": 150, "桃竹苗": 80, "中部": 20, "雲嘉南": 80, "南部": 160, "東部": 100, "其他": 80 },
  "雲嘉南": { "北部": 220, "桃竹苗": 150, "中部": 80, "雲嘉南": 25, "南部": 80, "東部": 180, "其他": 80 },
  "南部": { "北部": 320, "桃竹苗": 250, "中部": 160, "雲嘉南": 80, "南部": 20, "東部": 220, "其他": 100 },
  "東部": { "北部": 180, "桃竹苗": 140, "中部": 100, "雲嘉南": 180, "南部": 220, "東部": 30, "其他": 100 },
  "其他": { "北部": 80, "桃竹苗": 80, "中部": 80, "雲嘉南": 80, "南部": 100, "東部": 100, "其他": 50 },
};

const REGION_TOLL: Record<string, Record<string, number>> = {
  "北部": { "北部": 0, "桃竹苗": 80, "中部": 350, "雲嘉南": 500, "南部": 700, "東部": 200, "其他": 100 },
  "桃竹苗": { "北部": 80, "桃竹苗": 0, "中部": 200, "雲嘉南": 380, "南部": 550, "東部": 180, "其他": 100 },
  "中部": { "北部": 350, "桃竹苗": 200, "中部": 0, "雲嘉南": 150, "南部": 350, "東部": 120, "其他": 100 },
  "雲嘉南": { "北部": 500, "桃竹苗": 380, "中部": 150, "雲嘉南": 0, "南部": 150, "東部": 200, "其他": 100 },
  "南部": { "北部": 700, "桃竹苗": 550, "中部": 350, "雲嘉南": 150, "南部": 0, "東部": 300, "其他": 100 },
  "東部": { "北部": 200, "桃竹苗": 180, "中部": 120, "雲嘉南": 200, "南部": 300, "東部": 0, "其他": 100 },
  "其他": { "北部": 100, "桃竹苗": 100, "中部": 100, "雲嘉南": 100, "南部": 100, "東部": 100, "其他": 0 },
};

function getRegion(addr: string): string {
  const map: Record<string, string[]> = {
    "北部": ["台北", "臺北", "新北", "基隆", "淡水", "板橋", "中和", "永和", "新莊", "三重"],
    "桃竹苗": ["桃園", "新竹", "苗栗", "中壢"],
    "中部": ["台中", "臺中", "彰化", "南投"],
    "雲嘉南": ["雲林", "嘉義", "台南", "臺南"],
    "南部": ["高雄", "屏東"],
    "東部": ["宜蘭", "花蓮", "台東", "臺東"],
  };
  for (const [r, kws] of Object.entries(map)) {
    if (kws.some(k => addr.includes(k))) return r;
  }
  return "其他";
}

interface OrderCost {
  order: Order;
  revenue: number;
  fuelCost: number;
  tollCost: number;
  commission: number;
  depreciation: number;
  totalCost: number;
  grossProfit: number;
  margin: number;
  distanceKm: number;
  pickupRegion: string;
  deliveryRegion: string;
  status: "good" | "warn" | "loss";
}

function computeOrderCost(order: Order): OrderCost {
  const revenue = order.totalFee ?? 0;
  const vt = order.requiredVehicleType ?? "小貨車";
  const pickupRegion = getRegion(order.pickupAddress ?? "");
  const deliveryRegion = getRegion(order.deliveryAddress ?? "");
  const distanceKm = REGION_DIST[pickupRegion]?.[deliveryRegion] ?? 80;
  const fuelRate = VEHICLE_FUEL_RATE[vt] ?? 4;
  const fuelCost = Math.round(distanceKm * fuelRate);
  const tollCost = REGION_TOLL[pickupRegion]?.[deliveryRegion] ?? 100;
  const commission = Math.round(revenue * 0.20);
  const depreciation = VEHICLE_DEPRECIATION[vt] ?? 200;
  const totalCost = fuelCost + tollCost + commission + depreciation;
  const grossProfit = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : -100;
  const status: OrderCost["status"] = grossProfit < 0 ? "loss" : margin < 15 ? "warn" : "good";
  return { order, revenue, fuelCost, tollCost, commission, depreciation, totalCost, grossProfit, margin, distanceKm, pickupRegion, deliveryRegion, status };
}

function CostControlPanel({ orders }: { orders: Order[] }) {
  const [sortBy, setSortBy] = useState<"margin" | "profit" | "loss">("margin");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const costData = useMemo(() => {
    return orders
      .filter(o => o.status !== "cancelled")
      .map(computeOrderCost)
      .sort((a, b) => {
        if (sortBy === "margin") return a.margin - b.margin;
        if (sortBy === "loss") return a.grossProfit - b.grossProfit;
        return b.grossProfit - a.grossProfit;
      });
  }, [orders, sortBy]);

  const lossOrders = costData.filter(c => c.status === "loss");
  const warnOrders = costData.filter(c => c.status === "warn");
  const goodOrders = costData.filter(c => c.status === "good");
  const avgMargin = costData.length > 0
    ? Math.round(costData.reduce((s, c) => s + c.margin, 0) / costData.length)
    : 0;
  const totalProfit = costData.reduce((s, c) => s + c.grossProfit, 0);
  const totalRevenue = costData.reduce((s, c) => s + c.revenue, 0);

  // Vehicle type analysis
  const vehicleStats = useMemo(() => {
    const stats: Record<string, { count: number; totalProfit: number; totalRevenue: number }> = {};
    for (const c of costData) {
      const vt = c.order.requiredVehicleType ?? "未指定";
      if (!stats[vt]) stats[vt] = { count: 0, totalProfit: 0, totalRevenue: 0 };
      stats[vt].count++;
      stats[vt].totalProfit += c.grossProfit;
      stats[vt].totalRevenue += c.revenue;
    }
    return Object.entries(stats)
      .map(([vt, s]) => ({
        vt,
        count: s.count,
        avgProfit: s.count > 0 ? Math.round(s.totalProfit / s.count) : 0,
        margin: s.totalRevenue > 0 ? Math.round((s.totalProfit / s.totalRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.avgProfit - a.avgProfit);
  }, [costData]);

  // Route analysis
  const routeStats = useMemo(() => {
    const stats: Record<string, { count: number; totalProfit: number }> = {};
    for (const c of costData) {
      const key = `${c.pickupRegion} → ${c.deliveryRegion}`;
      if (!stats[key]) stats[key] = { count: 0, totalProfit: 0 };
      stats[key].count++;
      stats[key].totalProfit += c.grossProfit;
    }
    return Object.entries(stats)
      .map(([route, s]) => ({
        route,
        count: s.count,
        avgProfit: s.count > 0 ? Math.round(s.totalProfit / s.count) : 0,
      }))
      .sort((a, b) => a.avgProfit - b.avgProfit);
  }, [costData]);

  const costBarData = useMemo(() => {
    const byStatus = [
      { name: "盈利", count: goodOrders.length, fill: "#16a34a" },
      { name: "低利潤", count: warnOrders.length, fill: "#F97316" },
      { name: "虧損", count: lossOrders.length, fill: "#dc2626" },
    ];
    return byStatus;
  }, [goodOrders.length, warnOrders.length, lossOrders.length]);

  if (costData.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <PiggyBank className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>尚無可分析訂單，請先建立訂單並設定運費。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="font-bold text-lg flex items-center gap-2">
        <PiggyBank className="w-5 h-5 text-emerald-600" /> 成本控管 AI
      </h3>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={`p-3 text-center ${lossOrders.length > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className={`text-2xl font-black ${lossOrders.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
            {lossOrders.length}
          </div>
          <div className="text-xs text-muted-foreground">虧損訂單</div>
          {lossOrders.length > 0 && <div className="text-xs text-red-600 font-semibold mt-0.5">需立即處理</div>}
        </Card>
        <Card className="p-3 text-center bg-orange-50 border-orange-100">
          <div className="text-2xl font-black text-orange-700">{warnOrders.length}</div>
          <div className="text-xs text-muted-foreground">低利潤訂單</div>
          <div className="text-xs text-orange-600 mt-0.5">利潤率 &lt; 15%</div>
        </Card>
        <Card className="p-3 text-center bg-blue-50 border-blue-100">
          <div className="text-2xl font-black text-blue-800">{avgMargin}%</div>
          <div className="text-xs text-muted-foreground">平均毛利率</div>
        </Card>
        <Card className="p-3 text-center bg-emerald-50 border-emerald-100">
          <div className={`text-xl font-black ${totalProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            NT${Math.abs(totalProfit / 1000).toFixed(1)}k
          </div>
          <div className="text-xs text-muted-foreground">{totalProfit >= 0 ? "累計毛利" : "累計虧損"}</div>
        </Card>
      </div>

      {/* Loss alert */}
      {lossOrders.length > 0 && (
        <Card className="p-3 border-red-300 bg-red-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-bold text-red-800 text-sm">虧損訂單警示：{lossOrders.length} 筆需注意</span>
          </div>
          <div className="space-y-1.5">
            {lossOrders.slice(0, 3).map(c => (
              <div key={c.order.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm border border-red-100">
                <span className="font-mono text-xs text-muted-foreground">#{c.order.id}</span>
                <span className="flex-1 truncate">{c.order.cargoDescription}</span>
                <span className="text-xs">{c.pickupRegion}→{c.deliveryRegion}</span>
                <span className="font-bold text-red-700">-NT${Math.abs(c.grossProfit).toLocaleString()}</span>
              </div>
            ))}
            {lossOrders.length > 3 && <p className="text-xs text-red-600 text-center">…還有 {lossOrders.length - 3} 筆</p>}
          </div>
        </Card>
      )}

      {/* Vehicle type profitability */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> 車型獲利分析
          </h4>
          <div className="space-y-2">
            {vehicleStats.map((v, i) => (
              <div key={v.vt} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0
                  ${i === 0 ? "bg-emerald-500" : i === vehicleStats.length - 1 ? "bg-red-500" : "bg-slate-400"}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{v.vt}</div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                    <div
                      className={`h-full rounded-full ${v.avgProfit >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(100, Math.abs(v.margin))}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold ${v.avgProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    NT${v.avgProfit.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">均毛利 · {v.margin}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-red-600" /> 路線損益排名（由虧至盈）
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {routeStats.map((r, i) => (
              <div key={r.route} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground w-20 shrink-0 truncate">{r.route}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className={`h-full rounded-full transition-all ${r.avgProfit >= 0 ? "bg-primary" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, Math.max(5, (Math.abs(r.avgProfit) / 3000) * 100))}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-20 text-right shrink-0 ${r.avgProfit >= 0 ? "text-primary" : "text-red-600"}`}>
                  {r.avgProfit >= 0 ? "+" : ""}NT${r.avgProfit.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">({r.count}筆)</span>
              </div>
            ))}
            {routeStats.length === 0 && <p className="text-muted-foreground text-xs">尚無路線資料</p>}
          </div>
        </Card>
      </div>

      {/* Per-order cost breakdown */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> 逐筆成本明細
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">排序</span>
            <select
              className="text-xs border rounded px-2 py-1 h-7"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
            >
              <option value="margin">利潤率 ↑</option>
              <option value="profit">毛利 ↓</option>
              <option value="loss">虧損優先</option>
            </select>
          </div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {costData.map(c => (
            <div key={c.order.id} className={`rounded-xl border ${
              c.status === "loss" ? "border-red-200 bg-red-50" :
              c.status === "warn" ? "border-orange-200 bg-orange-50" :
              "border-emerald-100 bg-emerald-50/40"
            }`}>
              {/* Summary row */}
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left"
                onClick={() => setExpandedId(expandedId === c.order.id ? null : c.order.id)}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  c.status === "loss" ? "bg-red-500" : c.status === "warn" ? "bg-orange-500" : "bg-emerald-500"
                }`} />
                <span className="font-mono text-xs text-muted-foreground w-7">#{c.order.id}</span>
                <span className="flex-1 font-medium truncate">{c.order.cargoDescription}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">{c.pickupRegion}→{c.deliveryRegion}</span>
                <span className="text-xs text-muted-foreground">收 NT${c.revenue.toLocaleString()}</span>
                <span className={`text-sm font-bold w-24 text-right shrink-0 ${
                  c.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"
                }`}>
                  {c.grossProfit >= 0 ? "+" : ""}NT${c.grossProfit.toLocaleString()}
                </span>
                <Badge className={`text-xs shrink-0 ${
                  c.status === "loss" ? "bg-red-100 text-red-800 border-red-300" :
                  c.status === "warn" ? "bg-orange-100 text-orange-800 border-orange-200" :
                  "bg-emerald-100 text-emerald-800 border-emerald-200"
                }`}>
                  {c.margin}%
                </Badge>
                {expandedId === c.order.id
                  ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
              </button>

              {/* Expanded cost breakdown */}
              {expandedId === c.order.id && (
                <div className="px-3 pb-3 border-t border-current/10">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 text-xs">
                    <div className="bg-white/70 rounded-lg p-2 flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground">油資</div>
                        <div className="font-bold">NT${c.fuelCost.toLocaleString()}</div>
                        <div className="text-muted-foreground">{c.distanceKm}km</div>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground">過路費</div>
                        <div className="font-bold">NT${c.tollCost.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground">司機抽成</div>
                        <div className="font-bold">NT${c.commission.toLocaleString()}</div>
                        <div className="text-muted-foreground">20%</div>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-lg p-2 flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground">車輛折舊</div>
                        <div className="font-bold">NT${c.depreciation.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs bg-white/60 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">總成本 NT${c.totalCost.toLocaleString()}</span>
                    <span className="text-muted-foreground">收入 NT${c.revenue.toLocaleString()}</span>
                    <span className={`font-black text-sm ${c.grossProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      毛利 {c.grossProfit >= 0 ? "+" : ""}NT${c.grossProfit.toLocaleString()} ({c.margin}%)
                    </span>
                  </div>
                  {c.status === "loss" && (
                    <p className="text-xs text-red-700 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      建議調高運費至 NT${(c.totalCost * 1.20).toLocaleString()} 以達 20% 利潤率
                    </p>
                  )}
                  {c.status === "warn" && (
                    <p className="text-xs text-orange-700 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      建議調高運費至 NT${(c.totalCost * 1.20).toLocaleString()} 以達 20% 利潤率
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Main AI Analytics Tab ─────────────────────────────────────────────────────
export default function AIAnalyticsTab() {
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const { data: customers = [] } = useCustomersData();

  const allOrders = orders as Order[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-primary flex items-center gap-2">
          <Brain className="w-5 h-5" /> AI 智慧分析中心
        </h2>
        <p className="text-sm text-muted-foreground">訂單預測、自動調度、動態定價、成本控管、客戶分級、營收預測</p>
      </div>
      <Tabs defaultValue="cost">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full">
          <TabsTrigger value="forecast" className="text-xs flex-1 min-w-[72px]">訂單預測</TabsTrigger>
          <TabsTrigger value="dispatch" className="text-xs flex-1 min-w-[72px]">自動調度</TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs flex-1 min-w-[72px]">動態運費</TabsTrigger>
          <TabsTrigger value="cost" className="text-xs flex-1 min-w-[72px] data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            💰 成本控管
          </TabsTrigger>
          <TabsTrigger value="customers" className="text-xs flex-1 min-w-[72px]">客戶分級</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs flex-1 min-w-[72px]">營收預測</TabsTrigger>
        </TabsList>
        <TabsContent value="forecast" className="mt-4">
          <Card className="p-4"><OrderForecastPanel orders={allOrders} /></Card>
        </TabsContent>
        <TabsContent value="dispatch" className="mt-4">
          <Card className="p-4"><AutoDispatchPanel orders={allOrders} drivers={drivers} /></Card>
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <Card className="p-4"><DynamicPricingPanel /></Card>
        </TabsContent>
        <TabsContent value="cost" className="mt-4">
          <Card className="p-4"><CostControlPanel orders={allOrders} /></Card>
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <Card className="p-4"><CustomerGradingPanel orders={allOrders} customers={customers} /></Card>
        </TabsContent>
        <TabsContent value="revenue" className="mt-4">
          <Card className="p-4"><RevenueForecastPanel orders={allOrders} /></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
