import { useState, useMemo } from "react";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OrderStatusBadge } from "@/components/StatusBadge";
import {
  Truck, MapPin, Package, Weight, Zap, CheckCircle2,
  AlertCircle, Info, Car, Users, X, ChevronDown, ChevronUp,
  TrendingUp, Navigation,
} from "lucide-react";
import type { Order } from "@workspace/api-client-react";

// ─── Vehicle capacity table ────────────────────────────────────────────────────
const BODY_CAPACITY: Record<string, { maxKg: number; maxM3: number }> = {
  "廂型1.5T": { maxKg: 1500, maxM3: 7 },
  "廂型3.5T": { maxKg: 3500, maxM3: 18 },
  "廂型5T":   { maxKg: 5000, maxM3: 30 },
  "平斗5T":   { maxKg: 5000, maxM3: 35 },
  "廂型8T":   { maxKg: 8000, maxM3: 40 },
  "廂型11T":  { maxKg: 11000, maxM3: 52 },
  "廂型17T":  { maxKg: 17000, maxM3: 65 },
};

function extractRegion(address: string): string {
  const m = address.match(/^(台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/);
  if (m) return m[1];
  return address.slice(0, 3) + "…";
}

function orderVolume(order: Order): number {
  const l = order.cargoLengthM ?? 0;
  const w = order.cargoWidthM ?? 0;
  const h = order.cargoHeightM ?? 0;
  return l && w && h ? +(l * w * h).toFixed(3) : 0;
}

function parseStops(json: unknown): { address: string; quantity?: string; weight?: number; signStatus?: string }[] {
  if (!json) return [];
  try { return JSON.parse(json as string) as any[]; } catch { return []; }
}

// ─── Compatibility score between two orders (0-100) ───────────────────────────
function compatibilityScore(a: Order, b: Order): number {
  let score = 0;
  // Same delivery region → big bonus
  if (extractRegion(a.deliveryAddress) === extractRegion(b.deliveryAddress)) score += 50;
  // Same pickup date → bonus
  if (a.pickupDate && b.pickupDate && a.pickupDate === b.pickupDate) score += 30;
  // Same pickup time window → bonus
  if (a.pickupTime && b.pickupTime && Math.abs(
    parseInt(a.pickupTime.replace(":", "")) - parseInt(b.pickupTime.replace(":", ""))
  ) <= 100) score += 20;
  return Math.min(score, 100);
}

// ─── GroupCard (pending orders) ───────────────────────────────────────────────
function GroupCard({
  regionDate, orders, onMerge, selected, onToggle,
}: {
  regionDate: string;
  orders: Order[];
  onMerge: (ids: number[]) => void;
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  const pendingOrders = orders.filter(o => o.status === "pending" || o.status === "assigned");
  const totalWeight = pendingOrders.reduce((s, o) => s + (o.cargoWeight ?? 0), 0);
  const totalVol = pendingOrders.reduce((s, o) => s + orderVolume(o), 0);

  const bestVehicle = Object.entries(BODY_CAPACITY).find(
    ([, cap]) => cap.maxKg >= totalWeight && cap.maxM3 >= totalVol
  );
  const cap = bestVehicle ? BODY_CAPACITY[bestVehicle[0]] : null;
  const remaining = cap
    ? { kg: cap.maxKg - totalWeight, m3: +(cap.maxM3 - totalVol).toFixed(2) }
    : null;

  const selCount = pendingOrders.filter(o => selected.has(o.id)).length;
  const canMerge = selCount >= 2;

  // Pairwise compatibility suggestions
  const pairs: { ids: [number, number]; score: number; }[] = [];
  for (let i = 0; i < pendingOrders.length; i++) {
    for (let j = i + 1; j < pendingOrders.length; j++) {
      const score = compatibilityScore(pendingOrders[i], pendingOrders[j]);
      if (score >= 50) pairs.push({ ids: [pendingOrders[i].id, pendingOrders[j].id], score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> {regionDate}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingOrders.length} 筆待運 · 合計 {totalWeight.toLocaleString()} kg
              {totalVol > 0 ? ` · ${totalVol.toFixed(2)} m³` : ""}
            </p>
          </div>
          {bestVehicle && (
            <Badge variant="outline" className="text-xs font-mono shrink-0 bg-white">
              AI建議：{bestVehicle[0]}
            </Badge>
          )}
        </div>

        {/* Capacity bars */}
        {remaining && (
          <div className="flex gap-2 mt-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              <Weight className="w-3 h-3" />
              剩餘載重 <span className="font-bold">{remaining.kg.toLocaleString()} kg</span>
            </div>
            {remaining.m3 > 0 && (
              <div className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <Package className="w-3 h-3" />
                剩餘材積 <span className="font-bold">{remaining.m3} m³</span>
              </div>
            )}
            {cap && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 border rounded px-2 py-1">
                利用率 {Math.round(Math.max((totalWeight / cap.maxKg), (totalVol / cap.maxM3)) * 100)}%
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-3 space-y-2">
        {/* AI compatibility hints */}
        {pairs.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700">
            <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
            <span>
              AI 建議：訂單 #{pairs[0].ids[0]} 與 #{pairs[0].ids[1]} 相容度 {pairs[0].score}%，適合合併拼車
            </span>
          </div>
        )}

        {pendingOrders.map(order => {
          const stops = parseStops((order as any).extraDeliveryAddresses);
          const vol = orderVolume(order);
          const isSel = selected.has(order.id);
          return (
            <div
              key={order.id}
              onClick={() => onToggle(order.id)}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                isSel ? "border-primary bg-primary/5 shadow-sm" : "border-gray-100 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-bold text-muted-foreground">#{order.id}</span>
                    <OrderStatusBadge status={order.status} />
                    {(order as any).orderGroupId && (
                      <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200">已拼車</Badge>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-foreground">{order.customerName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">取：{order.pickupAddress}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    送：{order.deliveryAddress}
                    {stops.length > 0 && <span className="ml-1 text-violet-600 font-medium">+{stops.length}站</span>}
                  </p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {(order.cargoWeight ?? 0) > 0 && (
                      <span className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded border border-orange-100 font-medium">{order.cargoWeight} kg</span>
                    )}
                    {vol > 0 && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-medium">{vol} m³</span>
                    )}
                    {order.requiredVehicleType && (
                      <span className="text-xs bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded border font-medium">{order.requiredVehicleType}</span>
                    )}
                    {order.cargoDescription && (
                      <span className="text-xs text-muted-foreground">{order.cargoDescription}</span>
                    )}
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                  isSel ? "border-primary bg-primary" : "border-gray-300"
                }`}>
                  {isSel && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-1">
          {canMerge ? (
            <Button
              size="sm"
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
              onClick={() => onMerge(pendingOrders.filter(o => selected.has(o.id)).map(o => o.id))}
            >
              <Zap className="w-4 h-4" />
              一鍵拼車（已選 {selCount} 單）
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">
              勾選 2 筆以上訂單以啟用拼車
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── MergedGroupCard (already merged groups) ──────────────────────────────────
function MergedGroupCard({
  groupId, orders, drivers, onDissolve, onAssignDriver,
}: {
  groupId: string;
  orders: Order[];
  drivers: any[] | undefined;
  onDissolve: (ids: number[]) => void;
  onAssignDriver: (ids: number[], driverId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const totalWeight = orders.reduce((s, o) => s + (o.cargoWeight ?? 0), 0);
  const totalVol = orders.reduce((s, o) => s + orderVolume(o), 0);
  const availDrivers = drivers?.filter(d => d.status === "available") ?? [];
  const shortId = groupId.slice(-8).toUpperCase();

  const assignedDriverIds = [...new Set(orders.map(o => o.driverId).filter(Boolean))];
  const assignedDriver = assignedDriverIds.length === 1
    ? drivers?.find(d => d.id === assignedDriverIds[0])
    : null;

  return (
    <Card className="border-2 border-violet-300 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4 border-b border-violet-100 bg-violet-50/50">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-violet-800">
              <Car className="w-4 h-4 text-violet-600" />
              拼車組 #{shortId}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {orders.length} 筆訂單 · {totalWeight.toLocaleString()} kg
              {totalVol > 0 ? ` · ${totalVol.toFixed(2)} m³` : ""}
              {assignedDriver ? ` · 司機：${assignedDriver.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {assignedDriver ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                <Truck className="w-3 h-3 mr-1" /> {assignedDriver.name}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">未派司機</Badge>
            )}
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Route summary */}
        <div className="mt-2 space-y-1">
          {orders.map((o, i) => (
            <div key={o.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-4 h-4 bg-violet-600 text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">{i + 1}</span>
              <Navigation className="w-2.5 h-2.5 text-violet-400 shrink-0" />
              <span className="truncate">{o.deliveryAddress}</span>
              <span className="font-mono text-[10px] text-violet-500 shrink-0">#{o.id}</span>
            </div>
          ))}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-3 space-y-3">
          {orders.map(order => (
            <div key={order.id} className="p-2.5 rounded-lg border bg-white text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold text-muted-foreground">#{order.id}</span>
                <OrderStatusBadge status={order.status} />
                <span className="font-semibold">{order.customerName}</span>
              </div>
              <p className="text-muted-foreground">取：{order.pickupAddress}</p>
              <p className="text-muted-foreground">送：{order.deliveryAddress}</p>
              <div className="flex gap-2 mt-1">
                {(order.cargoWeight ?? 0) > 0 && <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded border border-orange-100">{order.cargoWeight} kg</span>}
                {orderVolume(order) > 0 && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">{orderVolume(order)} m³</span>}
                {order.pickupDate && <span className="text-muted-foreground">{order.pickupDate}</span>}
              </div>
            </div>
          ))}

          {/* Driver assignment */}
          {!assignedDriver && availDrivers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-violet-600" /> 指派司機給此車趟
              </p>
              <div className="flex gap-2">
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger className="h-9 flex-1 text-xs">
                    <SelectValue placeholder="選擇司機" />
                  </SelectTrigger>
                  <SelectContent>
                    {availDrivers.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name} · {d.vehicleType} · {d.licensePlate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 shrink-0"
                  disabled={!selectedDriver}
                  onClick={() => selectedDriver && onAssignDriver(orders.map(o => o.id), parseInt(selectedDriver))}>
                  <Truck className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          <Button variant="outline" size="sm" className="w-full gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 text-xs"
            onClick={() => onDissolve(orders.map(o => o.id))}>
            <X className="w-3.5 h-3.5" /> 解散此車趟
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main CarpoolTab ───────────────────────────────────────────────────────────
export default function CarpoolTab() {
  const { data: orders } = useOrdersData();
  const { data: drivers } = useDriversData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Grouped pending orders (no groupId yet)
  const grouped = useMemo(() => {
    if (!orders) return [];
    const active = orders.filter(o =>
      (o.status === "pending" || o.status === "assigned") && !(o as any).orderGroupId
    );
    const map = new Map<string, Order[]>();
    for (const o of active) {
      const region = extractRegion(o.deliveryAddress);
      const date = o.pickupDate ?? "未指定日期";
      const key = `${date} · ${region}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o as Order);
    }
    return Array.from(map.entries())
      .filter(([, ords]) => ords.length >= 2)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  // Already-merged groups
  const mergedGroups = useMemo(() => {
    if (!orders) return [];
    const grouped = new Map<string, Order[]>();
    for (const o of orders) {
      const gid = (o as any).orderGroupId;
      if (!gid) continue;
      if (!grouped.has(gid)) grouped.set(gid, []);
      grouped.get(gid)!.push(o as Order);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const handleMerge = async (ids: number[]) => {
    const groupId = `grp-${Date.now()}`;
    try {
      await Promise.all(ids.map(id => updateOrder({ id, data: { orderGroupId: groupId } as any })));
      toast({ title: "✅ 拼車成功", description: `${ids.length} 筆訂單合併為車趟 ${groupId.slice(-8).toUpperCase()}` });
      setSelected(new Set());
    } catch {
      toast({ title: "拼車失敗", description: "請稍後再試", variant: "destructive" });
    }
  };

  const handleDissolve = async (ids: number[]) => {
    if (!confirm("確定要解散此車趟？所有訂單將恢復獨立狀態")) return;
    try {
      await Promise.all(ids.map(id => updateOrder({ id, data: { orderGroupId: null } as any })));
      toast({ title: "車趟已解散" });
    } catch {
      toast({ title: "操作失敗", variant: "destructive" });
    }
  };

  const handleAssignDriver = async (ids: number[], driverId: number) => {
    try {
      await Promise.all(ids.map(id => updateOrder({
        id,
        data: { driverId, status: "assigned" } as any,
      })));
      const driver = drivers?.find(d => d.id === driverId);
      toast({ title: "✅ 司機已派車", description: `${driver?.name ?? "司機"} 已指派給此車趟所有訂單` });
    } catch {
      toast({ title: "派車失敗", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Car className="w-5 h-5 text-violet-600" /> 拼車調度面板
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            系統依地區 + 日期自動分組，AI 分析相容度，一鍵合併為同一車趟
          </p>
        </div>
        <div className="flex gap-2">
          {mergedGroups.length > 0 && (
            <Badge className="bg-violet-100 text-violet-700 border-violet-200">
              {mergedGroups.length} 組已拼車
            </Badge>
          )}
          {grouped.length > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              {grouped.length} 組待配對
            </Badge>
          )}
        </div>
      </div>

      {/* Already-merged groups */}
      {mergedGroups.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 已建立車趟
          </p>
          {mergedGroups.map(([gid, grpOrders]) => (
            <MergedGroupCard
              key={gid}
              groupId={gid}
              orders={grpOrders}
              drivers={drivers}
              onDissolve={handleDissolve}
              onAssignDriver={handleAssignDriver}
            />
          ))}
        </div>
      )}

      {/* Pending suggestions */}
      {grouped.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> AI 拼車建議
          </p>
          <div className="flex items-start gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>依目的地區域 + 取貨日期分組，並計算訂單間相容度。勾選訂單後點「一鍵拼車」合併為同一車趟，再統一指派司機。</span>
          </div>
          {grouped.map(([key, grpOrders]) => (
            <GroupCard
              key={key}
              regionDate={key}
              orders={grpOrders}
              onMerge={handleMerge}
              selected={selected}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      ) : (
        mergedGroups.length === 0 && (
          <Card className="border bg-white">
            <CardContent className="p-8 text-center text-muted-foreground">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-semibold">目前無可拼車訂單</p>
              <p className="text-xs mt-1">同區域、同時段且有 2 筆以上待派訂單時，系統自動建議拼車</p>
            </CardContent>
          </Card>
        )
      )}

      {/* Unpaired singles */}
      {(() => {
        if (!orders) return null;
        const singles = orders.filter(o =>
          (o.status === "pending" || o.status === "assigned") &&
          !(o as any).orderGroupId
        );
        const inSuggestions = new Set(grouped.flatMap(([, os]) => os.map((o: Order) => o.id)));
        const unpaired = singles.filter(o => !inSuggestions.has(o.id));
        if (unpaired.length === 0) return null;
        return (
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> 無配對訂單
            </p>
            <div className="space-y-2">
              {unpaired.map(order => (
                <Card key={order.id} className="border bg-white">
                  <CardContent className="p-3 flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">
                        #{order.id} · {order.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {order.deliveryAddress}
                        {order.pickupDate ? ` · ${order.pickupDate}` : ""}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
