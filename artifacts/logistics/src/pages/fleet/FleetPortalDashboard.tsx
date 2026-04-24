/**
 * FleetPortalDashboard.tsx
 * 車隊後台損益中心
 *
 * 車主實領公式：
 *   蝦皮趟次款 × (1-7%) × (1-15%) + 自接收入 - 掛靠費 - 司機薪資 - 罰款 = 車主實領
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("auth-jwt");
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const fmt   = (n: number)  => `$${Math.round(n).toLocaleString("zh-TW")}`;
const fmtPct= (n: number)  => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const FLEET_TYPE_LABEL: Record<string, string> = {
  affiliated: "靠行車", owner: "車主車",
  external: "外車", agency: "貨運行",
};
const COST_TYPE_LABEL: Record<string, string> = {
  fuel: "🛢️ 油費", insurance: "🛡️ 保險",
  maintenance: "🔧 保養維修", toll: "🛣️ 過路費", other: "📦 其他",
};

type Tab = "overview" | "self_orders" | "costs" | "history";

export default function FleetPortalDashboard() {
  const { user }  = useAuth();
  const { toast } = useToast();
  const qc        = useQueryClient();

  const fleetId = (user as any)?.fleet_id ?? (user as any)?.id;
  const [tab, setTab]       = useState<Tab>("overview");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));

  // 表單狀態
  const [orderForm, setOrderForm] = useState({
    customer_name: "", customer_phone: "", pickup_address: "",
    delivery_address: "", cargo_name: "", cargo_weight: "",
    vehicle_type: "小貨車", total_fee: "", driver_pay: "",
    pickup_date: format(new Date(), "yyyy-MM-dd"), note: "",
  });
  const [showOrderForm, setShowOrderForm] = useState(false);

  const [costForm, setCostForm] = useState({
    cost_type: "fuel", amount: "", description: "", receipt_no: "",
  });
  const [showCostForm, setShowCostForm] = useState(false);

  const [penaltyForm, setPenaltyForm] = useState({
    reason: "", amount: "", order_no: "",
  });
  const [showPenaltyForm, setShowPenaltyForm] = useState(false);

  // ── 資料查詢 ─────────────────────────────────────────────────
  const { data: ledger } = useQuery({
    queryKey: ["fleet-ledger", fleetId, period],
    queryFn: () => apiFetch(`/fleet-system/ledger/${fleetId}`),
    enabled: !!fleetId,
  });
  const L = Array.isArray(ledger) ? ledger.find((l: any) => l.period === period) : null;

  const { data: selfOrdersRaw } = useQuery({
    queryKey: ["fleet-self-orders", fleetId, period],
    queryFn: () => apiFetch(`/fleet-system/orders/${fleetId}?source=self&from=${period}-01`),
    enabled: !!fleetId && tab === "self_orders",
  });
  const selfOrders = Array.isArray(selfOrdersRaw) ? selfOrdersRaw : [];

  const { data: costsRaw } = useQuery({
    queryKey: ["fleet-costs", fleetId, period],
    queryFn: () => apiFetch(`/fleet-system/vehicle-costs/${fleetId}?period=${period}`),
    enabled: !!fleetId && tab === "costs",
  });
  const costs = Array.isArray(costsRaw) ? costsRaw : [];

  const { data: penaltiesRaw } = useQuery({
    queryKey: ["fleet-penalties", fleetId, period],
    queryFn: () => apiFetch(`/fleet-system/penalties/${fleetId}?period=${period}`),
    enabled: !!fleetId && tab === "costs",
  });
  const penalties = Array.isArray(penaltiesRaw) ? penaltiesRaw : [];

  // ── Mutations ────────────────────────────────────────────────
  const calcLedger = useMutation({
    mutationFn: () => apiFetch("/fleet-system/ledger/calculate", {
      method: "POST",
      body: JSON.stringify({ fleet_id: fleetId, period }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet-ledger"] }); toast({ title: "✅ 損益計算完成" }); },
    onError: (e: any) => toast({ title: "計算失敗", description: e.message, variant: "destructive" }),
  });

  const createOrder = useMutation({
    mutationFn: () => apiFetch("/fleet-system/orders", {
      method: "POST",
      body: JSON.stringify({
        fleet_id: fleetId, ...orderForm,
        cargo_weight: parseFloat(orderForm.cargo_weight) || 0,
        total_fee:    parseFloat(orderForm.total_fee) || 0,
        driver_pay:   parseFloat(orderForm.driver_pay) || 0,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-self-orders"] });
      setShowOrderForm(false);
      setOrderForm({ customer_name:"", customer_phone:"", pickup_address:"",
        delivery_address:"", cargo_name:"", cargo_weight:"", vehicle_type:"小貨車",
        total_fee:"", driver_pay:"", pickup_date: format(new Date(),"yyyy-MM-dd"), note:"" });
      toast({ title: "✅ 自接單已建立" });
    },
    onError: (e: any) => toast({ title: "建立失敗", description: e.message, variant: "destructive" }),
  });

  const addCost = useMutation({
    mutationFn: () => apiFetch("/fleet-system/vehicle-costs", {
      method: "POST",
      body: JSON.stringify({ fleet_id: fleetId, period, ...costForm, amount: parseFloat(costForm.amount) || 0 }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-costs"] });
      setShowCostForm(false);
      setCostForm({ cost_type:"fuel", amount:"", description:"", receipt_no:"" });
      toast({ title: "✅ 成本已登記" });
    },
    onError: (e: any) => toast({ title: "登記失敗", description: e.message, variant: "destructive" }),
  });

  const addPenalty = useMutation({
    mutationFn: () => apiFetch("/fleet-system/penalties", {
      method: "POST",
      body: JSON.stringify({ fleet_id: fleetId, period, ...penaltyForm, amount: parseFloat(penaltyForm.amount) || 0 }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-penalties"] });
      setShowPenaltyForm(false);
      setPenaltyForm({ reason:"", amount:"", order_no:"" });
      toast({ title: "✅ 罰款已登記" });
    },
    onError: (e: any) => toast({ title: "登記失敗", description: e.message, variant: "destructive" }),
  });

  const delPenalty = useMutation({
    mutationFn: (id: number) => apiFetch(`/fleet-system/penalties/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fleet-penalties"] }); toast({ title: "✅ 罰款已刪除" }); },
  });

  const shiftMonth = (dir: 1|-1) => {
    const d = new Date(period+"-01");
    d.setMonth(d.getMonth() + dir);
    setPeriod(format(d, "yyyy-MM"));
  };

  // ── 損益數據 ─────────────────────────────────────────────────
  const shopeeGross           = toNum(L?.shopee_gross);
  const fusingaoCommissionAmt = toNum(L?.fusingao_commission_amt);
  const fuyingCommissionAmt   = toNum(L?.fuying_commission_amt);
  const fusingaoIncome        = toNum(L?.fusingao_income);
  const selfIncome            = toNum(L?.self_income);
  const totalIncome           = toNum(L?.total_income);
  const driverCost            = toNum(L?.driver_cost);
  const vehicleCost           = toNum(L?.vehicle_cost);
  const monthlyAff            = toNum(L?.monthly_affiliation);
  const platformFee           = toNum(L?.platform_fee);
  const penaltiesAmt          = toNum(L?.penalties);
  const totalCost             = toNum(L?.total_cost);
  const grossProfit           = toNum(L?.gross_profit);
  const netOwnerPay           = toNum(L?.net_owner_pay);
  const profitMargin          = toNum(L?.profit_margin);

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div>
          <div style={S.title}>{(user as any)?.fleet_name ?? "車隊後台"}</div>
          <div style={S.sub}>
            {FLEET_TYPE_LABEL[(user as any)?.fleet_type ?? "owner"] ?? "車隊"} · 損益管理中心
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={S.pBtn} onClick={() => shiftMonth(-1)}>‹</button>
          <div style={S.pLabel}>
            {format(new Date(period+"-01"), "yyyy年 M月", { locale: zhTW })}
          </div>
          <button style={S.pBtn} onClick={() => shiftMonth(1)}>›</button>
        </div>
      </header>

      {/* KPI */}
      <div style={S.kpiRow}>
        <KpiCard label="蝦皮趟次款（毛）" value={fmt(shopeeGross)}
          sub={`${L?.fusingao_trip_count ?? 0} 趟`} color="#94a3b8" icon="🛵" />
        <KpiCard label="富詠入帳" value={fmt(fusingaoIncome)}
          sub={`-${(toNum((user as any)?.fusingao_commission_rate) || 7).toFixed(0)}% -${(toNum((user as any)?.commission_rate) || 15).toFixed(0)}%`}
          color="#3b82f6" icon="🚛" />
        <KpiCard label="自接收入" value={fmt(selfIncome)}
          sub={`${L?.self_trip_count ?? 0} 趟`} color="#f59e0b" icon="📦" />
        <KpiCard label="罰款扣減" value={`－${fmt(penaltiesAmt)}`}
          sub={`掛靠 ${fmt(monthlyAff)}`}
          color={penaltiesAmt > 0 ? "#ef4444" : "#475569"} icon="⚠️" />
        <KpiCard label="車主實領" value={fmt(netOwnerPay)}
          sub={`毛利率 ${fmtPct(profitMargin)}`}
          color={netOwnerPay >= 0 ? "#10b981" : "#ef4444"} icon="💰" />
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {([
          ["overview",    "📊 損益總覽"],
          ["self_orders", "📦 自接訂單"],
          ["costs",       "🔧 成本＆罰款"],
          ["history",     "📈 歷史走勢"],
        ] as [Tab,string][]).map(([id,label]) => (
          <div key={id} onClick={() => setTab(id)} style={{
            ...S.tab,
            color: tab===id ? "#f59e0b" : "#475569",
            borderBottom: `2px solid ${tab===id ? "#f59e0b" : "transparent"}`,
          }}>{label}</div>
        ))}
      </div>

      <div style={S.content}>

        {/* ── 損益總覽 ── */}
        {tab==="overview" && (
          <div style={S.grid2}>
            {/* 公式拆解 */}
            <div style={S.card}>
              <CardTitle>💸 車主實領公式拆解</CardTitle>

              {/* 收入段 */}
              <div style={S.formulaSection}>
                <SectionLabel color="#94a3b8">蝦皮趟次款</SectionLabel>
                <FR label={`蝦皮趟次款（${L?.fusingao_trip_count ?? 0} 趟）`}
                  value={fmt(shopeeGross)} color="#94a3b8" />
                <FR label={`　× (1 - 7%) 福興高抽成`}
                  value={`－${fmt(fusingaoCommissionAmt)}`} color="#ef4444" small />
                <FR label={`　× (1 - 15%) 富詠抽成`}
                  value={`－${fmt(fuyingCommissionAmt)}`} color="#ef4444" small />
                <Divider />
                <FR label="富詠入帳" value={fmt(fusingaoIncome)} color="#3b82f6" bold />
              </div>

              <div style={{ margin:"12px 0", fontSize:11, color:"#334155", textAlign:"center" as const }}>＋</div>

              <div style={S.formulaSection}>
                <SectionLabel color="#f59e0b">自接收入</SectionLabel>
                <FR label={`自接單（${L?.self_trip_count ?? 0} 趟）`}
                  value={fmt(selfIncome)} color="#f59e0b" />
              </div>

              <Divider />
              <FR label="總收入" value={fmt(totalIncome)} color="#e2e8f0" bold />

              {/* 扣除段 */}
              <div style={{ margin:"12px 0" }} />
              <div style={S.formulaSection}>
                <SectionLabel color="#ef4444">扣除項目</SectionLabel>
                {monthlyAff > 0 && <FR label="　掛靠費（月）"  value={`－${fmt(monthlyAff)}`}  color="#94a3b8" small />}
                {driverCost > 0 && <FR label="　司機薪資"     value={`－${fmt(driverCost)}`}  color="#94a3b8" small />}
                {vehicleCost > 0 && <FR label="　車輛成本"    value={`－${fmt(vehicleCost)}`}  color="#94a3b8" small />}
                {platformFee > 0 && <FR label="　平台費"      value={`－${fmt(platformFee)}`}  color="#94a3b8" small />}
                {penaltiesAmt > 0 && <FR label="　罰款"       value={`－${fmt(penaltiesAmt)}`} color="#ef4444" small />}
                {(monthlyAff + driverCost + vehicleCost + platformFee + penaltiesAmt) === 0 &&
                  <div style={{ color:"#334155", fontSize:12, padding:"4px 0" }}>（尚無扣除項）</div>}
              </div>

              <Divider />
              <FR label="🏆 車主實領" value={fmt(netOwnerPay)}
                color={netOwnerPay >= 0 ? "#10b981" : "#ef4444"} bold />
              {grossProfit !== netOwnerPay && (
                <FR label="　整體毛利（含車輛成本）" value={fmt(grossProfit)}
                  color={grossProfit >= 0 ? "#10b981" : "#ef4444"} small />
              )}

              <button style={{ ...S.calcBtn, marginTop:16 }}
                disabled={calcLedger.isPending}
                onClick={() => calcLedger.mutate()}>
                {calcLedger.isPending ? "計算中…" : "⚡ 重新計算本月損益"}
              </button>
            </div>

            {/* 收入來源分析 */}
            <div style={S.card}>
              <CardTitle>📊 收入來源分析</CardTitle>
              {totalIncome > 0 ? (
                <>
                  <BarRow label="富詠派單" value={fusingaoIncome} total={totalIncome} color="#3b82f6" />
                  <BarRow label="自接單"   value={selfIncome}     total={totalIncome} color="#f59e0b" />
                  <div style={{ marginTop:16, padding:"10px 12px", background:"#0a1628",
                    borderRadius:8, fontSize:12, color:"#64748b" }}>
                    富詠依存度：{`${((fusingaoIncome/totalIncome)*100).toFixed(0)}%`}
                    {fusingaoIncome/totalIncome > 0.8 &&
                      <span style={{ color:"#f59e0b", marginLeft:8 }}>⚠️ 建議開發自有客戶</span>}
                  </div>

                  {/* 抽成對比 */}
                  <div style={{ marginTop:16 }}>
                    <CardTitle>📉 抽成流失分析</CardTitle>
                    <FR label="蝦皮趟次款（毛）" value={fmt(shopeeGross)} color="#94a3b8" />
                    <FR label="　扣福興高（7%）" value={`－${fmt(fusingaoCommissionAmt)}`} color="#f97316" small />
                    <FR label="　扣富詠（15%）"  value={`－${fmt(fuyingCommissionAmt)}`}   color="#ef4444" small />
                    <FR label="實入帳" value={fmt(fusingaoIncome)} color="#3b82f6" bold />
                    <div style={{ marginTop:8, padding:"8px 10px", background:"#0a1628",
                      borderRadius:6, fontSize:11, color:"#64748b" }}>
                      保留率：{shopeeGross > 0
                        ? `${((fusingaoIncome/shopeeGross)*100).toFixed(1)}%`
                        : "—"}
                      （福興高+富詠共扣 {shopeeGross > 0
                        ? `${(((fusingaoCommissionAmt+fuyingCommissionAmt)/shopeeGross)*100).toFixed(1)}%`
                        : "—"}）
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"24px 0" }}>
                  尚無資料，請點「重新計算本月損益」
                </div>
              )}

              {/* 趟次統計 */}
              <div style={{ marginTop:16 }}>
                <CardTitle>🚛 趟次統計</CardTitle>
                <div style={{ display:"flex", gap:12 }}>
                  <TripStat label="富詠趟次" value={L?.fusingao_trip_count ?? 0} color="#3b82f6" />
                  <TripStat label="自接趟次" value={L?.self_trip_count ?? 0}     color="#f59e0b" />
                  <TripStat label="合計"
                    value={(L?.fusingao_trip_count ?? 0) + (L?.self_trip_count ?? 0)}
                    color="#e2e8f0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 自接訂單 ── */}
        {tab==="self_orders" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" onClick={() => setShowOrderForm(true)}>＋ 新增自接單</Btn>
              <div style={{ fontSize:12, color:"#475569", alignSelf:"center" }}>本月 {selfOrders.length} 筆</div>
            </div>
            {showOrderForm && (
              <div style={{ ...S.card, marginBottom:16 }}>
                <CardTitle>📦 新增自接單</CardTitle>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <FField label="客戶名稱" value={orderForm.customer_name}
                    onChange={(v:string) => setOrderForm(p=>({...p,customer_name:v}))} />
                  <FField label="聯絡電話" value={orderForm.customer_phone}
                    onChange={(v:string) => setOrderForm(p=>({...p,customer_phone:v}))} />
                  <FField label="取貨地址" value={orderForm.pickup_address}
                    onChange={(v:string) => setOrderForm(p=>({...p,pickup_address:v}))} span />
                  <FField label="送達地址" value={orderForm.delivery_address}
                    onChange={(v:string) => setOrderForm(p=>({...p,delivery_address:v}))} span />
                  <FField label="貨物名稱" value={orderForm.cargo_name}
                    onChange={(v:string) => setOrderForm(p=>({...p,cargo_name:v}))} />
                  <FField label="重量(kg)" value={orderForm.cargo_weight} type="number"
                    onChange={(v:string) => setOrderForm(p=>({...p,cargo_weight:v}))} />
                  <FField label="收費金額" value={orderForm.total_fee} type="number"
                    onChange={(v:string) => setOrderForm(p=>({...p,total_fee:v}))} />
                  <FField label="司機薪資" value={orderForm.driver_pay} type="number"
                    onChange={(v:string) => setOrderForm(p=>({...p,driver_pay:v}))} />
                  <FField label="取貨日期" value={orderForm.pickup_date} type="date"
                    onChange={(v:string) => setOrderForm(p=>({...p,pickup_date:v}))} />
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn color="#1e293b" textColor="#64748b" onClick={() => setShowOrderForm(false)}>取消</Btn>
                  <Btn color="#6366f1" disabled={createOrder.isPending || !orderForm.pickup_address}
                    onClick={() => createOrder.mutate()}>
                    {createOrder.isPending ? "建立中…" : "建立訂單"}
                  </Btn>
                </div>
              </div>
            )}
            <Tbl
              headers={["單號","客戶","取貨地址","金額","司機薪資","毛利","狀態","取貨日"]}
              rows={selfOrders.map((o: any) => {
                const p = toNum(o.total_fee) - toNum(o.driver_pay);
                return [
                  <span style={{ fontFamily:"monospace", fontSize:11 }}>{o.order_no}</span>,
                  o.customer_name ?? "—",
                  <span style={{ fontSize:12 }}>{o.pickup_address}</span>,
                  fmt(toNum(o.total_fee)), fmt(toNum(o.driver_pay)),
                  <span style={{ color: p >= 0 ? "#10b981" : "#ef4444", fontWeight:700 }}>{fmt(p)}</span>,
                  <SBadge status={o.status} />,
                  o.pickup_date ?? "—",
                ];
              })}
              empty="本月尚無自接單，點「新增自接單」開始"
            />
          </div>
        )}

        {/* ── 成本 & 罰款 ── */}
        {tab==="costs" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* 車輛成本 */}
            <div>
              <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#94a3b8" }}>🔧 車輛成本</span>
                <Btn color="#6366f1" onClick={() => setShowCostForm(true)}>＋ 登記成本</Btn>
                <div style={{ fontSize:12, color:"#475569" }}>
                  合計：{fmt(costs.reduce((s: number, c: any) => s + toNum(c.amount), 0))}
                </div>
              </div>
              {showCostForm && (
                <div style={{ ...S.card, marginBottom:12 }}>
                  <CardTitle>🔧 登記車輛成本</CardTitle>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div>
                      <FLabel>成本類型</FLabel>
                      <select value={costForm.cost_type}
                        onChange={e => setCostForm(p=>({...p,cost_type:e.target.value}))}
                        style={S.input}>
                        {Object.entries(COST_TYPE_LABEL).map(([k,v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <FField label="金額" value={costForm.amount} type="number"
                      onChange={(v:string) => setCostForm(p=>({...p,amount:v}))} />
                    <FField label="說明" value={costForm.description}
                      onChange={(v:string) => setCostForm(p=>({...p,description:v}))} />
                    <FField label="收據號碼（選填）" value={costForm.receipt_no}
                      onChange={(v:string) => setCostForm(p=>({...p,receipt_no:v}))} />
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:14 }}>
                    <Btn color="#1e293b" textColor="#64748b" onClick={() => setShowCostForm(false)}>取消</Btn>
                    <Btn color="#6366f1" disabled={addCost.isPending || !costForm.amount}
                      onClick={() => addCost.mutate()}>
                      {addCost.isPending ? "登記中…" : "登記"}
                    </Btn>
                  </div>
                </div>
              )}
              <Tbl
                headers={["類型","金額","說明","收據","登記時間"]}
                rows={costs.map((c: any) => [
                  COST_TYPE_LABEL[c.cost_type] ?? c.cost_type,
                  <strong style={{ color:"#ef4444" }}>{fmt(toNum(c.amount))}</strong>,
                  c.description ?? "—", c.receipt_no ?? "—",
                  c.created_at ? format(new Date(c.created_at),"M/d HH:mm") : "—",
                ])}
                empty="本月尚無成本記錄"
              />
            </div>

            {/* 罰款 */}
            <div>
              <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#ef4444" }}>⚠️ 罰款記錄</span>
                <Btn color="#dc2626" onClick={() => setShowPenaltyForm(true)}>＋ 登記罰款</Btn>
                <div style={{ fontSize:12, color:"#475569" }}>
                  本月合計：{fmt(penalties.reduce((s: number, p: any) => s + toNum(p.amount), 0))}
                </div>
              </div>
              {showPenaltyForm && (
                <div style={{ ...S.card, marginBottom:12, borderColor:"#dc262640" }}>
                  <CardTitle>⚠️ 登記罰款</CardTitle>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <FField label="罰款原因" value={penaltyForm.reason}
                      onChange={(v:string) => setPenaltyForm(p=>({...p,reason:v}))} span />
                    <FField label="罰款金額" value={penaltyForm.amount} type="number"
                      onChange={(v:string) => setPenaltyForm(p=>({...p,amount:v}))} />
                    <FField label="關聯單號（選填）" value={penaltyForm.order_no}
                      onChange={(v:string) => setPenaltyForm(p=>({...p,order_no:v}))} />
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:14 }}>
                    <Btn color="#1e293b" textColor="#64748b" onClick={() => setShowPenaltyForm(false)}>取消</Btn>
                    <Btn color="#dc2626" disabled={addPenalty.isPending || !penaltyForm.reason || !penaltyForm.amount}
                      onClick={() => addPenalty.mutate()}>
                      {addPenalty.isPending ? "登記中…" : "確認登記"}
                    </Btn>
                  </div>
                </div>
              )}
              <Tbl
                headers={["原因","金額","關聯單號","登記時間",""]}
                rows={penalties.map((p: any) => [
                  p.reason,
                  <strong style={{ color:"#ef4444" }}>{fmt(toNum(p.amount))}</strong>,
                  p.order_no ?? "—",
                  p.created_at ? format(new Date(p.created_at),"M/d HH:mm") : "—",
                  <button onClick={() => delPenalty.mutate(p.id)}
                    style={{ background:"none", border:"none", color:"#ef4444",
                      cursor:"pointer", fontSize:14 }}>🗑</button>,
                ])}
                empty="本月尚無罰款記錄"
              />
            </div>
          </div>
        )}

        {/* ── 歷史走勢 ── */}
        {tab==="history" && (
          <Tbl
            headers={["月份","趟次款（毛）","福興高扣","富詠扣","入帳","自接","罰款","車主實領","毛利率"]}
            rows={(Array.isArray(ledger) ? ledger : []).map((l: any) => [
              l.period,
              fmt(toNum(l.shopee_gross)),
              <span style={{ color:"#f97316" }}>－{fmt(toNum(l.fusingao_commission_amt))}</span>,
              <span style={{ color:"#ef4444" }}>－{fmt(toNum(l.fuying_commission_amt))}</span>,
              fmt(toNum(l.fusingao_income)),
              fmt(toNum(l.self_income)),
              toNum(l.penalties) > 0
                ? <span style={{ color:"#ef4444" }}>－{fmt(toNum(l.penalties))}</span>
                : "—",
              <span style={{ color: toNum(l.net_owner_pay)>=0 ? "#10b981" : "#ef4444",
                fontWeight:700 }}>{fmt(toNum(l.net_owner_pay))}</span>,
              <span style={{ color: toNum(l.profit_margin)>=0 ? "#10b981" : "#ef4444" }}>
                {fmtPct(toNum(l.profit_margin))}
              </span>,
            ])}
            empty="尚無歷史資料，請先計算各月損益"
          />
        )}
      </div>
    </div>
  );
}

// ── 小元件 ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: any) {
  return (
    <div style={{ background:"#08111f", borderTop:`3px solid ${color}`, padding:"14px 18px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        <span>{icon}</span>
        <span style={{ fontSize:9, color:"#475569", textTransform:"uppercase" as const,
          letterSpacing:"0.08em" }}>{label}</span>
      </div>
      <div style={{ fontSize:18, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>{sub}</div>
    </div>
  );
}
function CardTitle({ children }: any) {
  return <div style={{ fontSize:11, fontWeight:700, color:"#475569",
    textTransform:"uppercase" as const, letterSpacing:"0.1em",
    marginBottom:12, paddingBottom:8, borderBottom:"1px solid #1e293b" }}>{children}</div>;
}
function SectionLabel({ children, color }: any) {
  return <div style={{ fontSize:10, color, fontWeight:700, marginBottom:6,
    textTransform:"uppercase" as const, letterSpacing:"0.08em" }}>{children}</div>;
}
function FLabel({ children }: any) {
  return <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:600 }}>{children}</div>;
}
function FField({ label, value, onChange, type="text", span }: any) {
  return (
    <div style={{ gridColumn: span ? "1/-1" : undefined }}>
      <FLabel>{label}</FLabel>
      <input type={type} value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        style={S.input} />
    </div>
  );
}
function Divider() {
  return <div style={{ height:1, background:"#1e293b", margin:"8px 0" }} />;
}
function FR({ label, value, color, small, bold }: any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding: small?"2px 0":"7px 0" }}>
      <span style={{ fontSize: small?11:13, color: small?"#475569":"#94a3b8" }}>{label}</span>
      <span style={{ fontSize: small?11:13, fontWeight: bold?900:600,
        color, fontVariantNumeric:"tabular-nums" }}>{value}</span>
    </div>
  );
}
function BarRow({ label, value, total, color }: any) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
        <span style={{ color:"#94a3b8" }}>{label}</span>
        <span style={{ color, fontWeight:700 }}>{fmt(value)} ({pct.toFixed(0)}%)</span>
      </div>
      <div style={{ height:6, background:"#1e293b", borderRadius:3 }}>
        <div style={{ height:"100%", borderRadius:3, background:color,
          width:`${pct}%`, transition:"width .5s" }} />
      </div>
    </div>
  );
}
function TripStat({ label, value, color }: any) {
  return (
    <div style={{ flex:1, background:"#0a1628", borderRadius:8, padding:"10px 12px",
      textAlign:"center" as const }}>
      <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:"#475569" }}>{label}</div>
    </div>
  );
}
function SBadge({ status }: { status: string }) {
  const M: Record<string,[string,string]> = {
    pending:    ["待派","#f59e0b"], assigned:   ["已派","#3b82f6"],
    in_transit: ["配送中","#f97316"], delivered: ["已送","#10b981"],
    cancelled:  ["取消","#ef4444"],
  };
  const [label,color] = M[status] ?? [status,"#475569"];
  return <span style={{ fontSize:10, padding:"2px 7px", borderRadius:20,
    background:`${color}18`, color, fontWeight:700 }}>{label}</span>;
}
function Tbl({ headers, rows, empty }: any) {
  return (
    <div style={{ background:"#08111f", borderRadius:12, border:"1px solid #1e293b", overflow:"hidden" }}>
      <table style={{ width:"100%", borderCollapse:"collapse" as const }}>
        <thead>
          <tr style={{ background:"#0a1628" }}>
            {headers.map((h:string,i:number) => (
              <th key={i} style={{ padding:"8px 12px", textAlign:"left" as const,
                fontSize:10, color:"#475569", fontWeight:700,
                textTransform:"uppercase" as const,
                borderBottom:"1px solid #1e293b" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length===0
            ? <tr><td colSpan={headers.length} style={{ padding:"28px",
                textAlign:"center" as const, color:"#334155", fontSize:13 }}>{empty}</td></tr>
            : rows.map((row:any[],i:number) => (
              <tr key={i} style={{ borderBottom:"1px solid #0c1523" }}>
                {row.map((cell:any,j:number) => (
                  <td key={j} style={{ padding:"9px 12px", fontSize:12, color:"#94a3b8" }}>{cell}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
function Btn({ children, color, textColor="#fff", disabled, onClick }: any) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding:"7px 14px", borderRadius:8, border:"none",
      background:color, color:textColor, fontSize:12, fontWeight:700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, fontFamily:"inherit",
    }}>{children}</button>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:           { display:"flex", flexDirection:"column", height:"100%",
                    background:"#060d1a", color:"#e2e8f0",
                    fontFamily:"'Noto Sans TC','PingFang TC',sans-serif" },
  header:         { display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"0 24px", height:56, flexShrink:0,
                    background:"#08111f", borderBottom:"1px solid #1e293b" },
  title:          { fontSize:15, fontWeight:900, color:"#f8fafc" },
  sub:            { fontSize:11, color:"#334155", marginTop:2 },
  kpiRow:         { display:"grid", gridTemplateColumns:"repeat(5,1fr)",
                    gap:1, background:"#1e293b", flexShrink:0 },
  tabBar:         { display:"flex", background:"#08111f",
                    borderBottom:"1px solid #1e293b", flexShrink:0 },
  tab:            { padding:"10px 18px", fontSize:12, fontWeight:600, cursor:"pointer" },
  content:        { flex:1, overflowY:"auto", padding:"18px 24px" },
  grid2:          { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  card:           { background:"#08111f", border:"1px solid #1e293b",
                    borderRadius:12, padding:"16px 20px" },
  formulaSection: { background:"#0a1628", borderRadius:8,
                    padding:"10px 12px", marginBottom:4 },
  input:          { width:"100%", background:"#0a1628", border:"1px solid #1e293b",
                    color:"#e2e8f0", padding:"7px 10px", borderRadius:7,
                    fontSize:12, fontFamily:"inherit", boxSizing:"border-box" },
  calcBtn:        { width:"100%", padding:"9px", borderRadius:8, border:"none",
                    background:"#1e3a5f", color:"#60a5fa", fontSize:13,
                    fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  pBtn:           { background:"#1e293b", color:"#94a3b8", border:"none",
                    width:28, height:28, borderRadius:6, cursor:"pointer", fontSize:15 },
  pLabel:         { fontSize:14, fontWeight:700, color:"#e2e8f0",
                    minWidth:100, textAlign:"center" },
};
