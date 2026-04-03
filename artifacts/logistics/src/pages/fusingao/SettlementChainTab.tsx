import { useState, useCallback, useEffect } from "react";
import { RefreshCw, ChevronDown, ChevronRight, ArrowRight, Users, Building2, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/api";

const NT = (v: number) => `NT$ ${Math.round(v).toLocaleString()}`;

interface FleetRow {
  id: number;
  fleet_name: string;
  commission_rate: string;
  route_count: string;
  shopee_income: string;
  fleet_payout: string;
  commission_earned: string;
  completed_count: string;
  billed_count: string;
}

interface DriverRow {
  driver_name: string;
  vehicle_plate: string;
  route_count: string;
  completed_count: string;
  earnings: string;
}

interface Summary {
  total_routes: string;
  platform_income: string;
  fleet_payout: string;
  platform_commission: string;
}

interface SettlementData {
  ok: boolean;
  summary: Summary;
  fleets: FleetRow[];
}

interface FleetDetail {
  ok: boolean;
  summary: { shopee_income: string; fleet_receive: string; commission_rate: string };
  drivers: DriverRow[];
}

// ── Chain node ────────────────────────────────────────────────────────────────
function ChainNode({
  icon: Icon, label, sublabel, amount, amountSub, color,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  amount: string;
  amountSub?: string;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center px-4 py-3 rounded-xl border-2 min-w-[130px] ${color}`}>
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/60 mb-2 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[11px] font-semibold text-gray-500 tracking-wide uppercase">{label}</p>
      <p className="text-[10px] text-gray-400 mb-2">{sublabel}</p>
      <p className="text-base font-bold leading-tight">{amount}</p>
      {amountSub && <p className="text-[10px] mt-0.5 opacity-70">{amountSub}</p>}
    </div>
  );
}

// ── Arrow ─────────────────────────────────────────────────────────────────────
function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-gray-400">
      <ArrowRight className="h-5 w-5" />
      {label && <span className="text-[9px] text-gray-400 mt-0.5 whitespace-nowrap">{label}</span>}
    </div>
  );
}

// ── Fleet Card ────────────────────────────────────────────────────────────────
function FleetCard({
  fleet, month,
}: {
  fleet: FleetRow;
  month: string;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FleetDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const shopeeIncome   = Number(fleet.shopee_income   || 0);
  const fleetPayout    = Number(fleet.fleet_payout    || 0);
  const commissionEarned = Number(fleet.commission_earned || 0);
  const commRate       = Number(fleet.commission_rate || 15);
  const routeCount     = Number(fleet.route_count     || 0);
  const completedCount = Number(fleet.completed_count || 0);

  const toggle = async () => {
    if (!open && !detail) {
      setLoading(true);
      try {
        const params = month ? `?month=${month}` : "";
        const d: FleetDetail = await fetch(apiUrl(`/fusingao/fleets/${fleet.id}/settlement${params}`)).then(r => r.json());
        setDetail(d);
      } finally {
        setLoading(false);
      }
    }
    setOpen(v => !v);
  };

  return (
    <Card className="overflow-hidden">
      {/* ── Fleet header ─────────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm">
          <Truck className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-800 truncate">{fleet.fleet_name}</p>
          <p className="text-[11px] text-gray-400">
            {routeCount} 條路線・{completedCount} 趟完成・佣金 {commRate}%
          </p>
        </div>
        {/* Mini chain amounts */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono shrink-0">
          <span className="text-blue-600 font-semibold">{NT(shopeeIncome)}</span>
          <ArrowRight className="h-3 w-3 text-gray-300" />
          <span className="text-orange-500 text-[11px]">抽 {commRate}%</span>
          <ArrowRight className="h-3 w-3 text-gray-300" />
          <span className="text-green-700 font-semibold">{NT(fleetPayout)}</span>
        </div>
        <div className="ml-2 text-gray-400">
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* ── Inline chain (always visible on mobile) ────────────────────── */}
      <div className="sm:hidden px-4 py-2 bg-white border-t flex items-center gap-1.5 text-xs font-mono overflow-x-auto">
        <span className="text-blue-600">{NT(shopeeIncome)}</span>
        <ArrowRight className="h-3 w-3 text-gray-300" />
        <span className="text-orange-500">抽{commRate}%</span>
        <ArrowRight className="h-3 w-3 text-gray-300" />
        <span className="text-green-700 font-semibold">{NT(fleetPayout)}</span>
        <span className="ml-auto text-orange-600 text-[11px]">佣金 {NT(commissionEarned)}</span>
      </div>

      {/* ── Fleet chain diagram ────────────────────────────────────────── */}
      {open && (
        <CardContent className="p-4 space-y-4">
          {/* Flow line */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <div className="flex flex-col items-center text-center px-3 py-2 rounded-lg border bg-blue-50 border-blue-200 min-w-[110px]">
              <Building2 className="h-4 w-4 text-blue-600 mb-1" />
              <p className="text-[10px] text-blue-500 font-medium">蝦皮付款</p>
              <p className="text-sm font-bold text-blue-700 font-mono">{NT(shopeeIncome)}</p>
              <p className="text-[10px] text-blue-400">{routeCount} 趟</p>
            </div>
            <div className="flex flex-col items-center px-1">
              <ArrowRight className="h-4 w-4 text-gray-300" />
              <span className="text-[9px] text-gray-400 whitespace-nowrap">扣佣金</span>
              <span className="text-[9px] text-orange-500 font-semibold">{NT(commissionEarned)}</span>
            </div>
            <div className="flex flex-col items-center text-center px-3 py-2 rounded-lg border bg-orange-50 border-orange-200 min-w-[110px]">
              <Building2 className="h-4 w-4 text-orange-500 mb-1" />
              <p className="text-[10px] text-orange-500 font-medium">閃電兔</p>
              <p className="text-sm font-bold text-orange-600 font-mono">{NT(commissionEarned)}</p>
              <p className="text-[10px] text-orange-400">佣金 {commRate}%</p>
            </div>
            <div className="flex flex-col items-center px-1">
              <ArrowRight className="h-4 w-4 text-gray-300" />
              <span className="text-[9px] text-gray-400 whitespace-nowrap">撥款</span>
            </div>
            <div className="flex flex-col items-center text-center px-3 py-2 rounded-lg border bg-green-50 border-green-200 min-w-[110px]">
              <Truck className="h-4 w-4 text-green-600 mb-1" />
              <p className="text-[10px] text-green-600 font-medium">車隊車主</p>
              <p className="text-sm font-bold text-green-700 font-mono">{NT(fleetPayout)}</p>
              <p className="text-[10px] text-green-500">{fleet.fleet_name}</p>
            </div>
            {detail && detail.drivers.length > 0 && (
              <>
                <div className="flex flex-col items-center px-1">
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                  <span className="text-[9px] text-gray-400 whitespace-nowrap">司機薪資</span>
                </div>
                <div className="flex flex-col items-center text-center px-3 py-2 rounded-lg border bg-purple-50 border-purple-200 min-w-[110px]">
                  <Users className="h-4 w-4 text-purple-600 mb-1" />
                  <p className="text-[10px] text-purple-500 font-medium">司機群</p>
                  <p className="text-sm font-bold text-purple-700 font-mono">
                    {NT(detail.drivers.reduce((a, d) => a + Number(d.earnings || 0), 0))}
                  </p>
                  <p className="text-[10px] text-purple-400">{detail.drivers.length} 位司機</p>
                </div>
              </>
            )}
          </div>

          {/* ── Driver breakdown ─────────────────────────────────────────── */}
          {detail ? (
            detail.drivers.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> 司機結算明細
                </p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">司機</th>
                        <th className="text-left px-3 py-2 font-medium">車牌</th>
                        <th className="text-right px-3 py-2 font-medium">路線數</th>
                        <th className="text-right px-3 py-2 font-medium">完成</th>
                        <th className="text-right px-3 py-2 font-medium">應付金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.drivers.map((d, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2.5 font-medium text-gray-800">
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                <User className="h-3 w-3 text-purple-500" />
                              </div>
                              {d.driver_name || "未指派"}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px]">
                            {d.vehicle_plate || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{d.route_count}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={Number(d.completed_count) === Number(d.route_count) ? "text-green-600" : "text-amber-500"}>
                              {d.completed_count}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-purple-700">
                            {NT(Number(d.earnings || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-gray-600">合計</td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-purple-700">
                          {NT(detail.drivers.reduce((a, d) => a + Number(d.earnings || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">此車隊本期無司機明細資料</p>
            )
          ) : (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SettlementChainTab({
  months,
}: {
  months: { month: string; month_label?: string }[];
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = month ? `?month=${month}` : "";
      const d: SettlementData = await fetch(apiUrl(`/fusingao/settlement${params}`)).then(r => r.json());
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [month]);

  // Auto-load on mount + month change
  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const fleets  = data?.fleets ?? [];

  const platformIncome     = Number(summary?.platform_income     || 0);
  const fleetPayoutTotal   = Number(summary?.fleet_payout        || 0);
  const commissionTotal    = Number(summary?.platform_commission  || 0);
  const totalRoutes        = Number(summary?.total_routes        || 0);

  return (
    <div className="space-y-5">
      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 items-center">
        <Select value={month || "all"} onValueChange={v => setMonth(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue placeholder="全部期間" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部期間</SelectItem>
            {months.map(m => (
              <SelectItem key={m.month} value={m.month}>{m.month_label ?? m.month}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          重新整理
        </Button>
        {totalRoutes > 0 && (
          <span className="ml-auto text-xs text-gray-400">共 {totalRoutes} 條路線</span>
        )}
      </div>

      {/* ── Top-level chain ───────────────────────────────────────────────── */}
      <Card className="bg-gradient-to-br from-gray-50 to-white overflow-hidden">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <span className="w-1 h-3 bg-orange-400 rounded-full inline-block" />
            結算流程鏈（{month || "全期間"}）
          </p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <ChainNode
              icon={Building2}
              label="福興高"
              sublabel="Shopee 平台"
              amount={NT(platformIncome)}
              amountSub={`${totalRoutes} 趟 × 費率`}
              color="border-blue-200 bg-blue-50 text-blue-700"
            />
            <Arrow label="請款收款" />
            <ChainNode
              icon={Building2}
              label="閃電兔"
              sublabel="居中管理"
              amount={`+${NT(commissionTotal)}`}
              amountSub={`佣金 ${fleets.length > 0 ? Number(fleets[0]?.commission_rate ?? 15).toFixed(0) : "—"}% avg`}
              color="border-orange-200 bg-orange-50 text-orange-700"
            />
            <Arrow label="撥款車隊" />
            <ChainNode
              icon={Truck}
              label="車隊車主"
              sublabel={`共 ${fleets.length} 個車隊`}
              amount={NT(fleetPayoutTotal)}
              amountSub="扣佣後應付"
              color="border-green-200 bg-green-50 text-green-700"
            />
            <Arrow label="付司機薪" />
            <ChainNode
              icon={Users}
              label="司機群"
              sublabel="完成車趟"
              amount="依車趟計"
              amountSub="各車隊自行結算"
              color="border-purple-200 bg-purple-50 text-purple-700"
            />
          </div>

          {/* Summary pills */}
          {platformIncome > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
              {[
                { label: "蝦皮總收入",   val: NT(platformIncome),   cls: "bg-blue-50 text-blue-700 border-blue-100" },
                { label: "平台佣金",     val: NT(commissionTotal),  cls: "bg-orange-50 text-orange-700 border-orange-100" },
                { label: "付出車隊",     val: NT(fleetPayoutTotal), cls: "bg-green-50 text-green-700 border-green-100" },
              ].map(k => (
                <div key={k.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${k.cls}`}>
                  <span className="opacity-60">{k.label}</span>
                  <span className="font-bold font-mono">{k.val}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per-fleet cards ───────────────────────────────────────────────── */}
      {fleets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            各車隊結算明細（點選展開司機明細）
          </p>
          {fleets.map(f => (
            <FleetCard key={f.id} fleet={f} month={month} />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="text-center py-16 text-gray-400">
            <Truck className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">尚無結算資料</p>
            <p className="text-xs mt-1">請確認已有路線記錄，並設定車隊佣金比例</p>
          </div>
        )
      )}
    </div>
  );
}
