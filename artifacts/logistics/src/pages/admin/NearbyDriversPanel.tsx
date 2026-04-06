import { useState, useCallback } from "react";
import { Navigation, RefreshCw, Truck, MapPin, Wifi, WifiOff, RotateCcw, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface NearbyDriver {
  id: number;
  name: string;
  phone: string;
  vehicleType: string;
  licensePlate: string;
  status: string;
  lat: number | null;
  lng: number | null;
  currentLocation: string | null;
  distanceKm: number | null;
  withinRadius: boolean | null;
  hasLocation: boolean;
  commissionRate: number;
}

interface ReturnOpportunity {
  driverId: number;
  driverName: string;
  currentDeliveryAddress: string;
  orderId: number;
}

interface NearbyResult {
  pickupLat: number | null;
  pickupLng: number | null;
  pickupAddress: string | null;
  radiusKm: number;
  drivers: NearbyDriver[];
  nearbyCount: number;
  noLocationCount: number;
  returnOpportunities: ReturnOpportunity[];
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: "空車", cls: "bg-green-100 text-green-700" },
  assigned:  { label: "配送中", cls: "bg-amber-100 text-amber-700" },
  offline:   { label: "下線", cls: "bg-gray-100 text-gray-500" },
};

export default function NearbyDriversPanel({ defaultOrderId }: { defaultOrderId?: number }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState(defaultOrderId ? String(defaultOrderId) : "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState(15);
  const [result, setResult] = useState<NearbyResult | null>(null);
  const [tab, setTab] = useState<"nearby" | "return">("nearby");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ radiusKm: String(radiusKm) });
      if (orderId) params.set("orderId", orderId);
      if (pickupAddress && !orderId) params.set("address", pickupAddress);

      const data: NearbyResult = await fetch(apiUrl(`/smart-dispatch/nearby-drivers?${params}`))
        .then(r => r.json());
      if ((data as any).error) throw new Error((data as any).error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "載入失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderId, pickupAddress, radiusKm, toast]);

  const nearbyDrivers = result?.drivers.filter(d => d.withinRadius === true) ?? [];
  const outsideDrivers = result?.drivers.filter(d => d.withinRadius === false) ?? [];
  const noLocationDrivers = result?.drivers.filter(d => d.withinRadius === null) ?? [];

  function DistanceDot({ km }: { km: number | null }) {
    if (km === null) return <WifiOff className="w-3.5 h-3.5 text-gray-300" />;
    const color = km <= 5 ? "text-green-500" : km <= 10 ? "text-lime-500" : km <= 15 ? "text-amber-500" : "text-orange-500";
    return <span className={`font-mono font-bold text-xs ${color}`}>{km.toFixed(1)} km</span>;
  }

  function DriverRow({ d }: { d: NearbyDriver }) {
    const badge = STATUS_BADGE[d.status] ?? { label: d.status, cls: "bg-gray-100 text-gray-500" };
    return (
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${d.withinRadius ? "border-green-100 bg-green-50/50" : "bg-white border-gray-100"} hover:bg-gray-50 transition-colors`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{d.name}</p>
            <p className="text-xs text-gray-400 font-mono">{d.vehicleType} · {d.licensePlate}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {d.currentLocation && (
            <span className="text-[10px] text-gray-400 hidden sm:block max-w-20 truncate">
              {d.currentLocation}
            </span>
          )}
          <DistanceDot km={d.distanceKm} />
          <Badge className={`text-[10px] border-0 ${badge.cls}`}>{badge.label}</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">訂單編號（選填）</Label>
          <Input
            placeholder="自動取得取貨點"
            value={orderId}
            onChange={e => setOrderId(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">或輸入取貨地址</Label>
          <Input
            placeholder="台北市..."
            value={pickupAddress}
            onChange={e => setPickupAddress(e.target.value)}
            className="h-8 text-sm"
            disabled={!!orderId}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <Circle className="w-3 h-3 text-green-500 fill-green-500" />
              篩選半徑
            </Label>
            <span className="text-xs font-mono font-bold text-green-600">{radiusKm} km</span>
          </div>
          <Slider
            value={[radiusKm]}
            onValueChange={([v]) => setRadiusKm(v)}
            min={5} max={50} step={5}
          />
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>5 km</span><span>25 km</span><span>50 km</span>
          </div>
        </div>
      </div>

      <Button onClick={load} disabled={loading} className="w-full" size="sm">
        {loading
          ? <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" />搜尋中…</>
          : <><Navigation className="w-4 h-4 mr-1.5" />搜尋附近可用司機</>
        }
      </Button>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "半徑內", val: result.nearbyCount, color: "text-green-600", bg: "bg-green-50" },
              { label: "可用總數", val: result.drivers.length, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "無定位", val: result.noLocationCount, color: "text-gray-500", bg: "bg-gray-50" },
            ].map(({ label, val, color, bg }) => (
              <div key={label} className={`${bg} rounded-lg p-2.5 text-center`}>
                <p className={`text-lg font-bold ${color}`}>{val}</p>
                <p className="text-[10px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Tab buttons */}
          <div className="flex border rounded-lg overflow-hidden text-xs">
            <button
              className={`flex-1 py-1.5 flex items-center justify-center gap-1 ${tab === "nearby" ? "bg-green-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setTab("nearby")}
            >
              <MapPin className="w-3 h-3" />
              附近司機 ({nearbyDrivers.length})
            </button>
            <button
              className={`flex-1 py-1.5 flex items-center justify-center gap-1 ${tab === "return" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              onClick={() => setTab("return")}
            >
              <RotateCcw className="w-3 h-3" />
              回頭車機會 ({result.returnOpportunities.length})
            </button>
          </div>

          {tab === "nearby" && (
            <div className="space-y-2">
              {nearbyDrivers.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <WifiOff className="w-6 h-6 mx-auto mb-2" />
                  半徑 {radiusKm} km 內無可用司機
                </div>
              )}
              {nearbyDrivers.map(d => <DriverRow key={d.id} d={d} />)}
              {outsideDrivers.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-medium text-gray-400 mb-2 px-1">半徑外司機</p>
                  <div className="space-y-1.5 opacity-60">
                    {outsideDrivers.slice(0, 5).map(d => <DriverRow key={d.id} d={d} />)}
                    {outsideDrivers.length > 5 && (
                      <p className="text-xs text-gray-400 text-center">還有 {outsideDrivers.length - 5} 位…</p>
                    )}
                  </div>
                </div>
              )}
              {noLocationDrivers.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-medium text-gray-400 mb-1.5 flex items-center gap-1 px-1">
                    <WifiOff className="w-3 h-3" />未開啟定位（{noLocationDrivers.length} 位）
                  </p>
                  <div className="space-y-1 opacity-40">
                    {noLocationDrivers.slice(0, 3).map(d => <DriverRow key={d.id} d={d} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "return" && (
            <div className="space-y-2">
              {result.returnOpportunities.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <RotateCcw className="w-6 h-6 mx-auto mb-2" />
                  目前無回頭車機會
                </div>
              )}
              {result.returnOpportunities.map(r => (
                <Card key={r.driverId} className="border-indigo-100">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800">{r.driverName}</p>
                      <p className="text-xs text-gray-500 truncate">
                        正在送往：{r.currentDeliveryAddress}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-600 shrink-0">
                      訂單 #{r.orderId}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-700">
                <p className="font-medium mb-1">💡 回頭車撮合說明</p>
                <p>以上司機正在配送途中，返程路線若經過新訂單取貨點，可有效降低空車率，提升利潤。請調度員評估路線相符性後手動指派。</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
