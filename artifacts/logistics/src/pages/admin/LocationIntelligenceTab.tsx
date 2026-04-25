/**
 * LocationIntelligenceTab.tsx
 * 地點智慧分析 — 常跑路線、熱門地點、司機熟悉度
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, TrendingUp, Truck, Clock, Route, Search, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getApiUrl } from "@/lib/api";

interface PopularLocation {
  address: string;
  type: string;
  frequency: number;
  avg_price: number | null;
  driver_count: number;
  last_used: string | null;
}

interface RouteStats {
  pickup_address: string;
  delivery_address: string;
  trip_count: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  driver_count: number;
  last_trip: string | null;
}

interface DriverFamiliarity {
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  trip_count: number;
  avg_price: number | null;
  last_trip: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  return `${Math.floor(days / 30)} 個月前`;
}

export default function LocationIntelligenceTab() {
  const [addressQuery, setAddressQuery] = useState("");

  const { data: popular = [], isLoading: loadingPopular } = useQuery<PopularLocation[]>({
    queryKey: ["locations-popular"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/api/locations/popular?limit=30"));
      return r.ok ? r.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: routes = [], isLoading: loadingRoutes } = useQuery<RouteStats[]>({
    queryKey: ["locations-routes"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/api/locations/route-stats?limit=30"));
      return r.ok ? r.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: drivers = [], isLoading: loadingDrivers } = useQuery<DriverFamiliarity[]>({
    queryKey: ["locations-drivers", addressQuery],
    queryFn: async () => {
      if (!addressQuery.trim()) return [];
      const r = await fetch(getApiUrl(`/api/locations/driver-familiarity?address=${encodeURIComponent(addressQuery)}&limit=10`));
      return r.ok ? r.json() : [];
    },
    enabled: addressQuery.trim().length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const pickupLocations  = popular.filter(l => l.type === "pickup").slice(0, 10);
  const deliveryLocations = popular.filter(l => l.type === "delivery").slice(0, 10);
  const topRoutes        = routes.slice(0, 15);

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <MapPin className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold">地點智慧分析</h2>
          <p className="text-sm text-muted-foreground">基於歷史訂單的地點頻次、報價、司機熟悉度分析</p>
        </div>
      </div>

      <Tabs defaultValue="routes">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="routes" className="text-xs gap-1.5">
            <Route className="w-3.5 h-3.5" /> 常跑路線
          </TabsTrigger>
          <TabsTrigger value="popular" className="text-xs gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> 熱門地點
          </TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs gap-1.5">
            <Truck className="w-3.5 h-3.5" /> 司機熟悉度
          </TabsTrigger>
        </TabsList>

        {/* ── 常跑路線 ─────────────────────────────────────────────── */}
        <TabsContent value="routes" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Route className="w-4 h-4 text-primary" />
                最常見取送配對（依次數排序）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRoutes ? (
                <div className="py-8 text-center text-muted-foreground text-sm">載入中…</div>
              ) : topRoutes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">暫無資料</div>
              ) : (
                <div className="space-y-2">
                  {topRoutes.map((r, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                      {/* Rank */}
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      {/* Route */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 text-sm">
                            <span className="text-xs text-orange-600 font-semibold shrink-0">取</span>
                            <span className="text-sm font-medium truncate max-w-[180px]">{r.pickup_address}</span>
                          </div>
                          <span className="text-muted-foreground text-xs">→</span>
                          <div className="flex items-center gap-1 text-sm">
                            <span className="text-xs text-blue-600 font-semibold shrink-0">送</span>
                            <span className="text-sm font-medium truncate max-w-[180px]">{r.delivery_address}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> {r.trip_count} 次
                          </span>
                          {r.driver_count > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Truck className="w-3 h-3" /> {r.driver_count} 位司機
                            </span>
                          )}
                          {r.last_trip && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {timeAgo(r.last_trip)}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Pricing */}
                      {r.avg_price && Number(r.avg_price) > 0 && (
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-primary">${Number(r.avg_price).toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">平均</p>
                          {r.min_price !== r.max_price && r.min_price && r.max_price && (
                            <p className="text-[10px] text-muted-foreground">
                              {Number(r.min_price).toLocaleString()}–{Number(r.max_price).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 熱門地點 ─────────────────────────────────────────────── */}
        <TabsContent value="popular" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* 取貨地點 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="text-orange-600 font-bold text-xs bg-orange-100 px-1.5 py-0.5 rounded">取</span>
                  最熱門取貨地點
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPopular ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">載入中…</div>
                ) : pickupLocations.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">暫無資料</div>
                ) : (
                  <div className="space-y-2">
                    {pickupLocations.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                        <span className={`text-xs font-bold w-5 text-center shrink-0
                          ${i === 0 ? "text-yellow-600" : i < 3 ? "text-orange-500" : "text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{l.address}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{l.frequency} 次</span>
                            {l.driver_count > 0 && <span>{l.driver_count} 位司機</span>}
                          </div>
                        </div>
                        {l.avg_price && Number(l.avg_price) > 0 && (
                          <Badge variant="outline" className="text-[11px] shrink-0">
                            均 ${Number(l.avg_price).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 送達地點 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="text-blue-600 font-bold text-xs bg-blue-100 px-1.5 py-0.5 rounded">送</span>
                  最熱門送達地點
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPopular ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">載入中…</div>
                ) : deliveryLocations.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground text-sm">暫無資料</div>
                ) : (
                  <div className="space-y-2">
                    {deliveryLocations.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                        <span className={`text-xs font-bold w-5 text-center shrink-0
                          ${i === 0 ? "text-yellow-600" : i < 3 ? "text-blue-500" : "text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{l.address}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{l.frequency} 次</span>
                            {l.driver_count > 0 && <span>{l.driver_count} 位司機</span>}
                          </div>
                        </div>
                        {l.avg_price && Number(l.avg_price) > 0 && (
                          <Badge variant="outline" className="text-[11px] shrink-0">
                            均 ${Number(l.avg_price).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 司機熟悉度 ───────────────────────────────────────────── */}
        <TabsContent value="drivers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                查詢哪位司機最熟悉某個地點
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="輸入地址關鍵字，例如：三重區、南京東路…"
                  value={addressQuery}
                  onChange={e => setAddressQuery(e.target.value)}
                />
              </div>
              {addressQuery.trim().length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  輸入地址關鍵字，查看哪位司機跑過最多次
                </div>
              ) : loadingDrivers ? (
                <div className="py-8 text-center text-muted-foreground text-sm">查詢中…</div>
              ) : drivers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  沒有找到跑過「{addressQuery}」的司機記錄
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">跑過「{addressQuery}」的司機（依熟悉度排序）：</p>
                  {drivers.map((d, i) => (
                    <div key={d.driver_id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? "bg-yellow-100 text-yellow-700" : "bg-muted text-muted-foreground"}`}>
                        {i === 0 ? <Star className="w-4 h-4" /> : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{d.driver_name}</p>
                        <p className="text-xs text-muted-foreground">{d.driver_phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">{d.trip_count} 次</p>
                        {d.avg_price && Number(d.avg_price) > 0 && (
                          <p className="text-xs text-muted-foreground">均 ${Number(d.avg_price).toLocaleString()}</p>
                        )}
                        {d.last_trip && (
                          <p className="text-xs text-muted-foreground">{timeAgo(d.last_trip)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
