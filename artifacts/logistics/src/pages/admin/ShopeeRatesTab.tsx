import { useState, useEffect, useCallback } from "react";
import { Tag, RefreshCw, Search, Truck, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface RateItem {
  id: number;
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number;
  price_unit: string;
}

interface RateData {
  ok: boolean;
  items: RateItem[];
  summary: { service_type: string; count: string }[];
}

const SERVICE_TYPES = [
  { value: "店配模式",   label: "店配模式", color: "bg-blue-100 text-blue-800" },
  { value: "NDD快速到貨", label: "NDD快速到貨", color: "bg-purple-100 text-purple-800" },
  { value: "轉運車-趟次", label: "轉運車趟次", color: "bg-orange-100 text-orange-800" },
  { value: "賣家上收",   label: "賣家上收", color: "bg-green-100 text-green-800" },
  { value: "轉運車-包時", label: "轉運車包時", color: "bg-yellow-100 text-yellow-800" },
  { value: "WH NDD",    label: "WH NDD", color: "bg-red-100 text-red-800" },
];

const VEHICLE_ORDER = ["6.2T", "8.5T", "11T", "17T", "26T", "35T", "46T"];

// Format price as NT$
const fmt = (p: number | null) =>
  p ? `NT$${p.toLocaleString()}` : "—";

function RateTable({ items, search }: { items: RateItem[]; search: string }) {
  // Filter by search
  const filtered = items.filter((r) => {
    if (!search) return true;
    return r.route.includes(search);
  });

  // Group by route
  const byRoute: Record<string, Record<string, number>> = {};
  const vehicleSet = new Set<string>();
  for (const item of filtered) {
    if (!byRoute[item.route]) byRoute[item.route] = {};
    byRoute[item.route][item.vehicle_type] = item.unit_price;
    vehicleSet.add(item.vehicle_type);
  }

  const vehicles = VEHICLE_ORDER.filter((v) => vehicleSet.has(v));
  const routes = Object.keys(byRoute).sort();

  if (routes.length === 0) {
    return <p className="text-center py-8 text-gray-400 text-sm">無資料</p>;
  }

  const priceUnit = filtered[0]?.price_unit || "趟";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500">
            <th className="text-left p-2 font-medium">起訖地點</th>
            {vehicles.map((v) => (
              <th key={v} className="text-right p-2 font-medium">
                <span className="flex flex-col items-end">
                  <span className="font-semibold text-gray-700">{v}</span>
                  <span className="text-[10px] text-gray-400">/{priceUnit}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routes.map((route, idx) => (
            <tr key={route} className={`border-b hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}>
              <td className="p-2 font-medium text-gray-700">{route}</td>
              {vehicles.map((v) => {
                const price = byRoute[route][v];
                return (
                  <td key={v} className="p-2 text-right">
                    {price ? (
                      <span className="font-mono text-blue-700 font-medium">
                        {price.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right text-xs text-gray-400 mt-2">
        共 {routes.length} 條路線・單位：新台幣（未稅）・{priceUnit}計
        {priceUnit === "趟" && "・爆量支援適用7折"}
      </p>
    </div>
  );
}

export default function ShopeeRatesTab() {
  const { toast } = useToast();
  const [data, setData] = useState<RateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeService, setActiveService] = useState("店配模式");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/shopee-rates"));
      const d = await r.json();
      setData(d);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const getItemsForService = (serviceType: string) =>
    (data?.items ?? []).filter((r) => r.service_type === serviceType);

  const getCountForService = (serviceType: string) =>
    data?.summary.find((s) => s.service_type === serviceType)?.count ?? "0";

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {SERVICE_TYPES.map((st) => (
          <Card
            key={st.value}
            className={`cursor-pointer transition-all border-2 ${
              activeService === st.value ? "border-blue-400 shadow-md" : "border-transparent"
            }`}
            onClick={() => setActiveService(st.value)}
          >
            <CardContent className="p-3 text-center">
              <Badge className={`${st.color} text-xs mb-1 whitespace-nowrap`}>
                {st.label}
              </Badge>
              <p className="text-lg font-bold text-gray-700">
                {getCountForService(st.value)}
              </p>
              <p className="text-[10px] text-gray-400">費率筆數</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Rate Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-500" />
              蝦皮福興高報價單 — {SERVICE_TYPES.find((s) => s.value === activeService)?.label}
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  className="pl-7 h-8 text-sm w-48"
                  placeholder="搜尋路線..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeService} onValueChange={setActiveService}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-4 bg-gray-100 p-1">
              {SERVICE_TYPES.map((st) => (
                <TabsTrigger
                  key={st.value}
                  value={st.value}
                  className="text-xs px-2 py-1"
                >
                  {st.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {SERVICE_TYPES.map((st) => (
              <TabsContent key={st.value} value={st.value}>
                <RateTable items={getItemsForService(st.value)} search={search} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">計費注意事項</p>
          <ul className="text-xs text-amber-600 space-y-0.5 list-disc list-inside">
            <li>爆量支援（單趟多點作業，如只配送或只收貨）：運費按原定價格的 7 折計算</li>
            <li>NDD 模式：桃園到台中的路線除外，不適用折扣</li>
            <li>轉運車包時：每車次最長 4 小時；超過 30 分鐘以上 1 小時以下按 1 小時計</li>
            <li>以上運費均不包含加值營業稅</li>
            <li>三配時段 17-18；彰化 13-14；21:30 收貨；19:30 前送貨完；~00-01 返倉</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
