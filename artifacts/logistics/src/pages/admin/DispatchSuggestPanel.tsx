/**
 * DispatchSuggestPanel - Admin view: ranked driver suggestions for an order
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Truck, MapPin, Package, Zap, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface SuggestDriver {
  id: number;
  name: string;
  license_plate: string;
  vehicle_type: string;
  status: "available" | "busy" | string;
  phone: string;
  avg_rating: number;
  rating_count: number;
  active_orders: number;
  week_trips: number;
  score: number;
  reasons: string[];
  match_level: "strong" | "moderate" | "weak";
}

interface SuggestResult {
  orderId: number | null;
  orderRegion: string | null;
  orderCargo: string | null;
  orderVehicle: string | null;
  suggestions: SuggestDriver[];
  total: number;
}

const MATCH_STYLES = {
  strong:   "border-emerald-400 bg-emerald-50",
  moderate: "border-blue-300   bg-blue-50",
  weak:     "border-gray-200   bg-white",
};

const MATCH_LABELS = {
  strong:   { label: "強力推薦", color: "bg-emerald-500 text-white" },
  moderate: { label: "適合",     color: "bg-blue-500 text-white" },
  weak:     { label: "備選",     color: "bg-gray-400 text-white" },
};

export function DispatchSuggestPanel({
  orderId,
  currentDriverId,
  onAssigned,
}: {
  orderId: number;
  currentDriverId?: number | null;
  onAssigned?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<SuggestResult>({
    queryKey: ["dispatch-suggest", orderId],
    queryFn: () => fetch(`${API}/dispatch/suggest?orderId=${orderId}&limit=8`).then(r => r.json()),
    staleTime: 60_000,
  });

  const assignMutation = useMutation({
    mutationFn: async (driverId: number) => {
      const res = await fetch(`${API}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, status: "assigned" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, driverId) => {
      toast({ title: "派車成功！", description: `已指派司機 #${driverId}` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", orderId] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-suggest", orderId] });
      onAssigned?.();
    },
    onError: (e) => toast({ title: "派車失敗", description: String(e), variant: "destructive" }),
    onSettled: () => setAssigningId(null),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> 計算派車建議中...
    </div>
  );

  if (!data || data.suggestions.length === 0) return (
    <div className="text-center py-8 text-muted-foreground">
      <Truck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
      <p className="font-semibold">目前無可用司機</p>
      <p className="text-xs mt-1">請檢查司機狀態或增加在線司機</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Order context */}
      <div className="flex flex-wrap gap-2 text-xs">
        {data.orderRegion  && <Badge variant="outline"><MapPin   className="w-3 h-3 mr-1 inline" />{data.orderRegion}</Badge>}
        {data.orderCargo   && <Badge variant="outline"><Package  className="w-3 h-3 mr-1 inline" />{data.orderCargo}</Badge>}
        {data.orderVehicle && <Badge variant="outline"><Truck    className="w-3 h-3 mr-1 inline" />{data.orderVehicle}</Badge>}
      </div>

      <p className="text-xs text-muted-foreground">共 {data.total} 位司機，顯示前 {data.suggestions.length} 名</p>

      {data.suggestions.map((drv, idx) => {
        const ml = MATCH_LABELS[drv.match_level];
        const isCurrent = drv.id === currentDriverId;
        const isAssigning = assigningId === drv.id;
        return (
          <div key={drv.id} className={`border-2 rounded-2xl p-3 ${MATCH_STYLES[drv.match_level]} ${isCurrent ? "ring-2 ring-blue-400" : ""}`}>
            <div className="flex items-start gap-3">
              {/* Rank badge */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0
                ${idx === 0 ? "bg-amber-400 text-white" : idx === 1 ? "bg-gray-400 text-white" : idx === 2 ? "bg-orange-700 text-white" : "bg-gray-200 text-gray-600"}`}>
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-foreground">{drv.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${ml.color}`}>{ml.label}</span>
                  {isCurrent && <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-500 text-white">當前派車</span>}
                </div>

                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Truck className="w-3 h-3" />{drv.vehicle_type ?? "—"}
                  </span>
                  <span>{drv.license_plate}</span>
                  <span className={`font-semibold ${drv.status === "available" ? "text-emerald-600" : "text-amber-600"}`}>
                    {drv.status === "available" ? "空閒" : `${drv.active_orders}件排隊`}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {drv.avg_rating.toFixed(1)}
                    {drv.rating_count > 0 && <span className="text-gray-400">({drv.rating_count})</span>}
                  </span>
                  <span>本週 {drv.week_trips} 趟</span>
                  <span className="font-bold text-blue-600 flex items-center gap-0.5">
                    <Zap className="w-3 h-3" />{drv.score}分
                  </span>
                </div>

                {/* Score reasons */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {drv.reasons.slice(0, 3).map((r, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white/70 rounded-md border border-gray-200 text-gray-500">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Assign button */}
              <div className="shrink-0">
                {isCurrent ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-blue-600">
                    <CheckCircle2 className="w-4 h-4" />已派
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs h-8"
                    disabled={isAssigning || assignMutation.isPending}
                    onClick={() => { setAssigningId(drv.id); assignMutation.mutate(drv.id); }}
                  >
                    {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "派車"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
