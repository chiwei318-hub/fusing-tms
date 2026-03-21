import { useMemo, useState } from "react";
import { Layers, RotateCcw, Package, MapPin, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useOrdersData, useUpdateOrderMutation } from "@/hooks/use-orders";
import { useDriversData } from "@/hooks/use-drivers";
import type { Order } from "@workspace/api-client-react";

// Simple region extractor from address
function extractRegion(addr: string): string {
  const regions: Record<string, string[]> = {
    "北部": ["台北", "臺北", "新北", "基隆", "淡水", "板橋", "中和", "永和", "新莊", "三重"],
    "桃竹苗": ["桃園", "新竹", "苗栗", "中壢", "平鎮"],
    "中部": ["台中", "臺中", "彰化", "南投", "豐原", "清水"],
    "雲嘉南": ["雲林", "嘉義", "台南", "臺南", "斗六", "新營"],
    "南部": ["高雄", "屏東", "鳳山", "岡山", "旗山"],
    "東部": ["宜蘭", "花蓮", "台東", "臺東", "羅東"],
  };
  for (const [region, keywords] of Object.entries(regions)) {
    if (keywords.some(k => addr.includes(k))) return region;
  }
  return "其他";
}

interface ConsolidationGroup {
  region: string;
  orders: Order[];
  totalWeight: number;
  totalVolume: number;
  estimatedExtraRevenue: number;
}

export default function SmartDispatchTab() {
  const { toast } = useToast();
  const { data: orders = [] } = useOrdersData();
  const { data: drivers = [] } = useDriversData();
  const { mutateAsync: updateOrder } = useUpdateOrderMutation();
  const [assigningId, setAssigningId] = useState<number | null>(null);

  // LTL Consolidation Groups
  const consolidationGroups = useMemo<ConsolidationGroup[]>(() => {
    const pending = (orders as Order[]).filter(o => o.status === "pending" && !o.driverId);
    const byRegion: Record<string, Order[]> = {};
    for (const o of pending) {
      const region = extractRegion(o.pickupAddress ?? "");
      if (!byRegion[region]) byRegion[region] = [];
      byRegion[region].push(o);
    }
    return Object.entries(byRegion)
      .filter(([, os]) => os.length >= 2)
      .map(([region, os]) => ({
        region,
        orders: os,
        totalWeight: os.reduce((s, o) => s + (o.cargoWeight ?? 0), 0),
        totalVolume: 0,
        estimatedExtraRevenue: os.reduce((s, o) => s + (o.totalFee ?? 1500), 0),
      }))
      .sort((a, b) => b.orders.length - a.orders.length);
  }, [orders]);

  // Return trip recommendations
  const returnTrips = useMemo(() => {
    const completedOrInTransit = (orders as Order[]).filter(o =>
      (o.status === "delivered" || o.status === "in_transit") && o.driverId
    );
    const pendingUnassigned = (orders as Order[]).filter(o => o.status === "pending" && !o.driverId);

    return completedOrInTransit.map(done => {
      const deliveryRegion = extractRegion(done.deliveryAddress ?? "");
      const nearbyPending = pendingUnassigned.filter(pending => {
        const pickupRegion = extractRegion(pending.pickupAddress ?? "");
        return pickupRegion === deliveryRegion || pickupRegion === "其他";
      }).slice(0, 3);

      const driver = drivers.find(d => d.id === done.driverId);
      if (!nearbyPending.length || !driver) return null;
      return { done, driver, nearby: nearbyPending, deliveryRegion };
    }).filter(Boolean) as { done: Order; driver: typeof drivers[0]; nearby: Order[]; deliveryRegion: string }[];
  }, [orders, drivers]);

  const handleAssignReturn = async (orderId: number, driverId: number, driverName: string) => {
    setAssigningId(orderId);
    try {
      await updateOrder({ id: orderId, data: { driverId, status: "assigned" } });
      toast({ title: `✅ 回頭車已派給 ${driverName}` });
    } catch {
      toast({ title: "派車失敗", variant: "destructive" });
    }
    setAssigningId(null);
  };

  return (
    <div className="space-y-6">
      {/* LTL Consolidation */}
      <div>
        <h2 className="text-xl font-black text-primary flex items-center gap-2 mb-1">
          <Layers className="w-5 h-5" /> 混載拼車推薦
        </h2>
        <p className="text-sm text-muted-foreground mb-4">同區域待派訂單可合併同車，提升載貨率與收益</p>

        {consolidationGroups.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>目前無可拼車訂單（需同區域 2 筆以上待派訂單）</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {consolidationGroups.map(group => (
              <Card key={group.region} className="p-4 border-blue-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-bold text-primary">{group.region}</span>
                    <Badge className="bg-primary text-white text-xs">{group.orders.length} 筆可拼</Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-orange-600">預估增收 NT${group.estimatedExtraRevenue.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">總重 {group.totalWeight.toFixed(0)} kg</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.orders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground w-8">#{o.id}</span>
                      <span className="font-medium flex-1 truncate">{o.cargoDescription}</span>
                      <span className="text-xs text-muted-foreground">{o.cargoWeight ? `${o.cargoWeight}kg` : "—"}</span>
                      {o.totalFee && <span className="text-xs font-semibold text-primary">NT${o.totalFee.toLocaleString()}</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg p-2">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  合併後可減少 {group.orders.length - 1} 趟空車、提升接單效率，建議指派 1 位空車司機一次取件。
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Return trip recommendations */}
      <div>
        <h2 className="text-xl font-black text-primary flex items-center gap-2 mb-1">
          <RotateCcw className="w-5 h-5" /> 回頭車推薦
        </h2>
        <p className="text-sm text-muted-foreground mb-4">依送達地點自動配對附近待接訂單，減少空趟</p>

        {returnTrips.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <RotateCcw className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>目前無可配對的回頭車訂單</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {returnTrips.map(rt => (
              <Card key={rt.done.id} className="p-4 border-green-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                    <RotateCcw className="w-4 h-4 text-green-700" />
                  </div>
                  <div>
                    <div className="font-bold">{rt.driver.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {rt.driver.vehicleType} · 送達 <span className="font-medium text-green-700">{rt.deliveryRegion}</span> 後空車返程
                    </div>
                  </div>
                  <Badge className="ml-auto bg-green-100 text-green-800 border-green-200 text-xs">空趟可接單</Badge>
                </div>
                <div className="space-y-2">
                  {rt.nearby.map(o => (
                    <div key={o.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{o.cargoDescription}</div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          <span>📍 {o.pickupAddress?.slice(0, 20)}…</span>
                          {o.cargoWeight && <span>⚖️ {o.cargoWeight}kg</span>}
                          {o.totalFee && <span className="text-primary font-semibold">NT${o.totalFee.toLocaleString()}</span>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={assigningId === o.id}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2.5"
                        onClick={() => handleAssignReturn(o.id, rt.driver.id, rt.driver.name)}
                      >
                        {assigningId === o.id ? "派車中…" : "指派回頭車"}
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 p-2 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  回頭接單可省去空趟油費，提升司機每日收益約 15–30%。
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
