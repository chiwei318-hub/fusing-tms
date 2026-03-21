import { useState, useMemo } from "react";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { OrderStatusBadge } from "@/components/StatusBadge";
import {
  Truck, MapPin, Package, Weight, Users, Zap, CheckCircle2,
  AlertCircle, Info, Car,
} from "lucide-react";
import type { Order } from "@workspace/api-client-react";

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
  return l && w && h ? l * w * h : 0;
}

type StopSummary = { address: string; quantity?: string; weight?: number };

function parseStops(json: string | null | undefined): StopSummary[] {
  if (!json) return [];
  try { return JSON.parse(json) as StopSummary[]; } catch { return []; }
}

function GroupCard({
  regionDate, orders, drivers, onMerge, selected, onToggle,
}: {
  regionDate: string;
  orders: Order[];
  drivers: ReturnType<typeof useDriversData>["data"];
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
    ? { kg: cap.maxKg - totalWeight, m3: cap.maxM3 - totalVol }
    : null;

  const selCount = pendingOrders.filter(o => selected.has(o.id)).length;
  const canMerge = selCount >= 2;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {regionDate}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              共 {pendingOrders.length} 筆待運 · 總重 {totalWeight.toLocaleString()} kg
              {totalVol > 0 ? ` · ${totalVol.toFixed(2)} m³` : ""}
            </p>
          </div>
          {bestVehicle && (
            <Badge variant="outline" className="text-xs font-mono shrink-0">
              建議：{bestVehicle[0]}
            </Badge>
          )}
        </div>
        {remaining && (
          <div className="flex gap-3 mt-2">
            <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
              <Weight className="w-3 h-3" />
              剩餘載重 {remaining.kg.toLocaleString()} kg
            </div>
            {remaining.m3 > 0 && (
              <div className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                <Package className="w-3 h-3" />
                剩餘材積 {remaining.m3.toFixed(1)} m³
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {pendingOrders.map(order => {
          const stops = parseStops((order as any).extraDeliveryAddresses);
          const isSel = selected.has(order.id);
          return (
            <div
              key={order.id}
              onClick={() => onToggle(order.id)}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                isSel ? "border-primary bg-primary/5" : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-muted-foreground">#{order.id}</span>
                    <OrderStatusBadge status={order.status} />
                    {(order as any).orderGroupId && (
                      <Badge className="text-xs bg-violet-100 text-violet-700 border-violet-200">拼車中</Badge>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate">{order.customerName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    取：{order.pickupAddress}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    送：{order.deliveryAddress}
                    {stops.length > 0 && <span className="ml-1 text-blue-600 font-medium">+{stops.length}站</span>}
                  </p>
                  <div className="flex gap-3 mt-1.5">
                    {(order.cargoWeight ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground">{order.cargoWeight} kg</span>
                    )}
                    {order.cargoDescription && (
                      <span className="text-xs text-muted-foreground">{order.cargoDescription}</span>
                    )}
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
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

  const grouped = useMemo(() => {
    if (!orders) return [];
    const active = orders.filter(o => o.status === "pending" || o.status === "assigned");
    const map = new Map<string, Order[]>();
    for (const o of active) {
      const region = extractRegion(o.deliveryAddress);
      const date = o.pickupDate ?? "未指定日期";
      const key = `${date} · ${region}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o as Order);
    }
    return Array.from(map.entries())
      .filter(([, ords]) => ords.length > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const suggestions = useMemo(() => {
    return grouped.filter(([, ords]) => {
      const pending = ords.filter(o => o.status === "pending" || o.status === "assigned");
      return pending.length >= 2;
    });
  }, [grouped]);

  const handleMerge = async (ids: number[]) => {
    const groupId = `grp-${Date.now()}`;
    try {
      await Promise.all(ids.map(id => updateOrder({ id, data: { orderGroupId: groupId } as any })));
      toast({
        title: `✅ 拼車成功`,
        description: `${ids.length} 筆訂單已合併為車趟 ${groupId.slice(-6)}`,
      });
      setSelected(new Set());
    } catch {
      toast({ title: "拼車失敗", description: "請稍後再試", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Car className="w-5 h-5 text-violet-600" /> 拼車調度面板
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            依地區與日期分組，AI 建議可合併訂單，一鍵執行拼車
          </p>
        </div>
        <Badge className="bg-violet-100 text-violet-700 border-violet-200">
          {suggestions.length} 組可拼車
        </Badge>
      </div>

      {suggestions.length === 0 ? (
        <Card className="border bg-white">
          <CardContent className="p-8 text-center text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-semibold">目前無可拼車訂單</p>
            <p className="text-xs mt-1">同區域、同時段且有 2 筆以上待派訂單時，將自動建議拼車</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>以下訂單依目的地區域 + 取貨日期自動分組。勾選同一組的訂單後點「一鍵拼車」即可合併為同一車趟。</span>
          </div>
          {suggestions.map(([key, grpOrders]) => (
            <GroupCard
              key={key}
              regionDate={key}
              orders={grpOrders}
              drivers={drivers}
              onMerge={handleMerge}
              selected={selected}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      )}

      {grouped.filter(([, o]) => o.length === 1).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
            單筆訂單（無配對）
          </p>
          <div className="space-y-2">
            {grouped.filter(([, o]) => o.length === 1).map(([key, grpOrders]) => (
              <Card key={key} className="border bg-white">
                <CardContent className="p-3 flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{key}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      #{grpOrders[0].id} · {grpOrders[0].customerName} · {grpOrders[0].cargoDescription}
                    </p>
                  </div>
                  <OrderStatusBadge status={grpOrders[0].status} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
