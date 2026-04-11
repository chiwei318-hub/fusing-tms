import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Truck, User, FileText } from "lucide-react";

const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const fapi = (path: string) => `${BASE_URL}/api${path}`;
const NT = (v: number | string) => `NT$ ${Math.round(Number(v)).toLocaleString()}`;

interface ReportData {
  ok: boolean;
  fleet_name: string;
  month: string;
  summary: {
    shopee_income: string;
    fleet_receive: string;
    commission_rate: string;
  };
  drivers: {
    driver_name: string;
    vehicle_plate: string | null;
    route_count: string;
    completed_count: string;
    earnings: string;
  }[];
  adjustment: {
    extra_deduct_rate: string;
    fuel_amount: string;
    other_amount: string;
    other_label: string;
    note: string;
  } | null;
  routes: {
    route_id: string;
    route_prefix: string;
    station_count: number;
    fleet_completed_at: string | null;
    shopee_rate: number;
    fleet_rate: number;
    service_type: string;
  }[];
  error?: string;
}

export default function PublicFleetReport() {
  const [, params] = useRoute("/fleet/report/:token");
  const token = params?.token;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(fapi(`/fusingao/public-report/${token}`))
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Truck className="h-10 w-10 mx-auto mb-3 text-orange-300 animate-pulse" />
          <p>載入運費報表中...</p>
        </div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-red-500 space-y-2">
          <FileText className="h-10 w-10 mx-auto text-red-300" />
          <p className="font-semibold">{data?.error ?? "無效的報表連結"}</p>
          <p className="text-sm text-gray-400">此連結可能已過期或不存在</p>
        </div>
      </div>
    );
  }

  const shopeeIncome = Number(data.summary.shopee_income ?? 0);
  const fleetReceive = Number(data.summary.fleet_receive ?? 0);
  const commRate = Number(data.summary.commission_rate ?? 15);
  const commAmt = shopeeIncome - fleetReceive;

  const adj = data.adjustment;
  const extraDeductRate = Number(adj?.extra_deduct_rate ?? 0);
  const extraDeductAmt = fleetReceive * extraDeductRate / 100;
  const fuelAmt = Number(adj?.fuel_amount ?? 0);
  const otherAmt = Number(adj?.other_amount ?? 0);
  const netPayout = fleetReceive - extraDeductAmt - fuelAmt - otherAmt;

  const [ym] = data.month.split("-");
  const monthLabel = `${data.month.replace("-", "年")}月`;

  return (
    <div className="min-h-screen bg-orange-50/30">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-orange-700 px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 rounded-lg p-2 shrink-0">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">{data.fleet_name}</h1>
              <p className="text-orange-200 text-xs">{monthLabel} 運費對帳報表 · 富詠運輸</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Payout Summary */}
        <Card className="border-orange-200 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-600" />
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">實付金額明細（{monthLabel}）</p>

            {/* Breakdown rows */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-gray-600">蝦皮運費總額</span>
                <span className="font-mono font-semibold text-blue-700">{NT(shopeeIncome)}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b text-orange-700">
                <span>− 平台服務費（{commRate}%）</span>
                <span className="font-mono">− {NT(commAmt)}</span>
              </div>
              {extraDeductRate > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b text-red-600">
                  <span>− 額外扣除（{extraDeductRate}%）</span>
                  <span className="font-mono">− {NT(extraDeductAmt)}</span>
                </div>
              )}
              {fuelAmt > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b text-red-600">
                  <span>− 油費代付</span>
                  <span className="font-mono">− {NT(fuelAmt)}</span>
                </div>
              )}
              {otherAmt > 0 && (
                <div className="flex justify-between items-center py-1.5 border-b text-red-600">
                  <span>− {adj?.other_label || "其他代付"}</span>
                  <span className="font-mono">− {NT(otherAmt)}</span>
                </div>
              )}
            </div>

            {/* Net Payout */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 font-semibold">實付給加盟主</p>
                <p className="text-[10px] text-green-500 mt-0.5">{monthLabel} 結算金額</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-700 font-mono">{NT(netPayout)}</p>
                {shopeeIncome > 0 && (
                  <p className="text-xs text-green-500">{((netPayout / shopeeIncome) * 100).toFixed(1)}% of 蝦皮總額</p>
                )}
              </div>
            </div>

            {adj?.note && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                📌 備注：{adj.note}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Route Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "總趟次", val: String(data.routes.length) },
            { label: "已完成", val: String(data.routes.filter(r => r.fleet_completed_at).length) },
            { label: "司機人數", val: String(data.drivers.length) },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="font-bold text-lg text-gray-800">{k.val}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Driver Breakdown */}
        {data.drivers.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-semibold text-gray-700">司機業績</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="text-left px-4 py-2">司機</th>
                    <th className="text-right px-4 py-2">趟次</th>
                    <th className="text-right px-4 py-2">完成</th>
                    <th className="text-right px-4 py-2">業績</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drivers.map((d, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{d.driver_name}</div>
                        {d.vehicle_plate && <div className="text-[11px] text-gray-400 font-mono">{d.vehicle_plate}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{d.route_count}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={Number(d.completed_count) === Number(d.route_count) ? "text-green-600" : "text-amber-500"}>
                          {d.completed_count}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-orange-600">
                        {NT(d.earnings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {/* Route List */}
        {data.routes.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-gray-50">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  路線明細（共 {data.routes.length} 趟）
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b bg-gray-50">
                      <th className="text-left px-3 py-2">路線編號</th>
                      <th className="text-left px-3 py-2">類型</th>
                      <th className="text-right px-3 py-2">站點</th>
                      <th className="text-center px-3 py-2">完成</th>
                      <th className="text-right px-3 py-2">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.routes.map((r, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono text-gray-800">{r.route_id}</td>
                        <td className="px-3 py-1.5">
                          {r.service_type && (
                            <Badge className="text-[10px] bg-blue-50 text-blue-700 border-0">{r.service_type}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{r.station_count}</td>
                        <td className="px-3 py-1.5 text-center">
                          {r.fleet_completed_at
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                            : <Clock className="h-3.5 w-3.5 text-gray-300 mx-auto" />}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-orange-600">
                          {r.fleet_rate ? NT(r.fleet_rate) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-[10px] text-gray-400 pb-4">
          此報表由富詠運輸系統自動產生 · {new Date().toLocaleDateString("zh-TW")}
        </p>
      </div>
    </div>
  );
}
