/**
 * FleetPortalDashboard.tsx
 * 路徑：artifacts/logistics/src/pages/fleet/FleetPortalDashboard.tsx
 *
 * 車隊後台首頁：
 *   - 本月損益總覽（富詠收入 vs 自接收入 vs 成本）
 *   - 自接單管理
 *   - 車輛成本登記
 *   - 歷史損益走勢
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
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const fleetId = (user as any)?.fleet_id ?? (user as any)?.id;
  const [tab, setTab]       = useState<Tab>("overview");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));

  const [orderForm, setOrderForm] = useState({
    customer_name: "", customer_phone: "",
    pickup_address: "", delivery_address: "",
    cargo_name: "", cargo_weight: "",
    vehicle_type: "小貨車", total_fee: "", driver_pay: "",
    pickup_date: format(new Date(), "yyyy-MM-dd"), note: "",
  });
  const [showOrderForm, setShowOrderForm] = useState(false);

  const [costForm, setCostForm] = useState({
    cost_type: "fuel", amount: "", description: "", receipt_no: "",
  });
  const [showCostForm, setShowCostForm] = useState(false);

  // ── 資料查詢 ─────────────────────────────────────────────────
  const { data: ledger } = useQuery({
    queryKey: ["fleet-ledger", fleetId, period],
    queryFn: () => apiFetch(`/fleet-system/ledger/${fleetId}`),
    enabled: !!fleetId,
  });
  const currentLedger = Array.isArray(ledger)
    ? ledger.find((l: any) => l.period === period)
    : null;

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

  // ── Mutations ────────────────────────────────────────────────
  const calcLedger = useMutation({
    mutationFn: () => apiFetch("/fleet-system/ledger/calculate", {
      method: "POST",
      body: JSON.stringify({ fleet_id: fleetId, period }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-ledger"] });
      toast({ title: "✅ 損益計算完成" });
    },
    onError: (e: any) => toast({ title: "計算失敗", description: e.message, variant: "destructive" }),
  });

  const createOrder = useMutation({
    mutationFn: () => apiFetch("/fleet-system/orders", {
      method: "POST",
      body: JSON.stringify({
        fleet_id: fleetId,
        ...orderForm,
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
      body: JSON.stringify({
        fleet_id: fleetId, period,
        ...costForm, amount: parseFloat(costForm.amount) || 0,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-costs"] });
      setShowCostForm(false);
      setCostForm({ cost_type:"fuel", amount:"", description:"", receipt_no:"" });
      toast({ title: "✅ 成本已登記" });
    },
    onError: (e: any) => toast({ title: "登記失敗", description: e.message, variant: "destructive" }),
  });

  const shiftMonth = (dir: 1|-1) => {
    const d = new Date(period+"-01");
    d.setMonth(d.getMonth() + dir);
    setPeriod(format(d, "yyyy-MM"));
  };

  const fusingaoIncome = toNum(currentLedger?.fusingao_income);
  const selfIncome     = toNum(currentLedger?.self_income);
  const totalIncome    = toNum(currentLedger?.total_income);
  const totalCost      = toNum(currentLedger?.total_cost);
  const grossProfit    = toNum(currentLedger?.gross_profit);
  const profitMargin   = toNum(currentLedger?.profit_margin);

  return (
    <div style={S.root}>
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

      <div style={S.kpiRow}>
        <KpiCard label="富詠收入" value={fmt(fusingaoIncome)}
          sub={`${currentLedger?.fusingao_trip_count ?? 0} 趟`} color="#3b82f6" icon="🚛" />
        <KpiCard label="自接收入" value={fmt(selfIncome)}
          sub={`${currentLedger?.self_trip_count ?? 0} 趟`} color="#f59e0b" icon="📦" />
        <KpiCard label="總收入" value={fmt(totalIncome)} sub="兩者合計" color="#e2e8f0" icon="💰" />
        <KpiCard label="總成本" value={fmt(totalCost)} sub="薪資＋車輛＋平台費" color="#ef4444" icon="📊" />
        <KpiCard label="本月毛利" value={fmt(grossProfit)}
          sub={`毛利率 ${fmtPct(profitMargin)}`}
          color={grossProfit >= 0 ? "#10b981" : "#ef4444"} icon="📈" />
      </div>

      <div style={S.tabBar}>
        {([
          ["overview",    "📊 損益總覽"],
          ["self_orders", "📦 自接訂單"],
          ["costs",       "🔧 車輛成本"],
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

        {/* 損益總覽 */}
        {tab==="overview" && (
          <div style={S.grid2}>
            <div style={S.card}>
              <CardTitle>💸 本月損益明細</CardTitle>
              <FR label="富詠派單收入" value={fmt(fusingaoIncome)} color="#3b82f6" />
              <FR label="自接單收入"   value={fmt(selfIncome)}     color="#f59e0b" />
              <div style={{ height:1, background:"#1e293b", margin:"8px 0" }} />
              <FR label="總收入" value={fmt(totalIncome)} color="#e2e8f0" bold />
              <div style={{ height:1, background:"#1e293b", margin:"8px 0" }} />
              <FR label="司機薪資" value={`－${fmt(toNum(currentLedger?.driver_cost))}`}         color="#94a3b8" small />
              <FR label="車輛成本" value={`－${fmt(toNum(currentLedger?.vehicle_cost))}`}         color="#94a3b8" small />
              <FR label="靠行費"   value={`－${fmt(toNum(currentLedger?.monthly_affiliation))}`}  color="#94a3b8" small />
              <FR label="平台費"   value={`－${fmt(toNum(currentLedger?.platform_fee))}`}          color="#94a3b8" small />
              <div style={{ height:1, background:"#1e293b", margin:"8px 0" }} />
              <FR label="淨利" value={fmt(grossProfit)}
                color={grossProfit >= 0 ? "#10b981" : "#ef4444"} bold />
              <button
                style={{ ...S.calcBtn, marginTop:16 }}
                disabled={calcLedger.isPending}
                onClick={() => calcLedger.mutate()}>
                {calcLedger.isPending ? "計算中…" : "⚡ 重新計算本月損益"}
              </button>
            </div>

            <div style={S.card}>
              <CardTitle>📊 收入來源分析</CardTitle>
              {totalIncome > 0 ? (
                <>
                  <BarRow label="富詠派單" value={fusingaoIncome} total={totalIncome} color="#3b82f6" />
                  <BarRow label="自接單"   value={selfIncome}     total={totalIncome} color="#f59e0b" />
                  <div style={{ marginTop:16, padding:"10px 12px",
                    background:"#0a1628", borderRadius:8, fontSize:12, color:"#64748b" }}>
                    富詠依存度：{totalIncome > 0
                      ? `${((fusingaoIncome/totalIncome)*100).toFixed(0)}%`
                      : "—"}
                    {fusingaoIncome/totalIncome > 0.8 &&
                      <span style={{ color:"#f59e0b", marginLeft:8 }}>
                        ⚠️ 建議開發自有客戶降低風險
                      </span>}
                  </div>
                </>
              ) : (
                <div style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"24px 0" }}>
                  尚無資料，請點「重新計算本月損益」
                </div>
              )}
              <div style={{ marginTop:16 }}>
                <CardTitle>🚛 趟次統計</CardTitle>
                <div style={{ display:"flex", gap:12 }}>
                  <TripStat label="富詠趟次" value={currentLedger?.fusingao_trip_count ?? 0} color="#3b82f6" />
                  <TripStat label="自接趟次" value={currentLedger?.self_trip_count ?? 0}     color="#f59e0b" />
                  <TripStat label="合計"
                    value={(currentLedger?.fusingao_trip_count ?? 0) + (currentLedger?.self_trip_count ?? 0)}
                    color="#e2e8f0" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 自接訂單 */}
        {tab==="self_orders" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" onClick={() => setShowOrderForm(true)}>＋ 新增自接單</Btn>
              <div style={{ fontSize:12, color:"#475569", alignSelf:"center" }}>
                本月 {selfOrders.length} 筆
              </div>
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
                  <Btn color="#6366f1"
                    disabled={createOrder.isPending || !orderForm.pickup_address}
                    onClick={() => createOrder.mutate()}>
                    {createOrder.isPending ? "建立中…" : "建立訂單"}
                  </Btn>
                </div>
              </div>
            )}
            <Tbl
              headers={["單號","客戶","取貨地址","金額","司機薪資","毛利","狀態","取貨日"]}
              rows={selfOrders.map((o: any) => {
                const profit = toNum(o.total_fee) - toNum(o.driver_pay);
                return [
                  <span style={{ fontFamily:"monospace", fontSize:11 }}>{o.order_no}</span>,
                  o.customer_name ?? "—",
                  <span style={{ fontSize:12 }}>{o.pickup_address}</span>,
                  fmt(toNum(o.total_fee)),
                  fmt(toNum(o.driver_pay)),
                  <span style={{ color: profit >= 0 ? "#10b981" : "#ef4444", fontWeight:700 }}>
                    {fmt(profit)}
                  </span>,
                  <SBadge status={o.status} />,
                  o.pickup_date ?? "—",
                ];
              })}
              empty="本月尚無自接單，點「新增自接單」開始"
            />
          </div>
        )}

        {/* 車輛成本 */}
        {tab==="costs" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
              <Btn color="#6366f1" onClick={() => setShowCostForm(true)}>＋ 登記成本</Btn>
              <div style={{ fontSize:12, color:"#475569" }}>
                本月總計：{fmt(costs.reduce((s: number, c: any) => s + toNum(c.amount), 0))}
              </div>
            </div>
            {showCostForm && (
              <div style={{ ...S.card, marginBottom:16 }}>
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
                  <Btn color="#6366f1"
                    disabled={addCost.isPending || !costForm.amount}
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
                c.description ?? "—",
                c.receipt_no ?? "—",
                c.created_at ? format(new Date(c.created_at),"M/d HH:mm") : "—",
              ])}
              empty="本月尚無成本記錄"
            />
          </div>
        )}

        {/* 歷史走勢 */}
        {tab==="history" && (
          <div>
            <Tbl
              headers={["月份","富詠收入","自接收入","總收入","總成本","毛利","毛利率"]}
              rows={(Array.isArray(ledger) ? ledger : []).map((l: any) => [
                l.period,
                fmt(toNum(l.fusingao_income)),
                fmt(toNum(l.self_income)),
                fmt(toNum(l.total_income)),
                fmt(toNum(l.total_cost)),
                <span style={{ color: toNum(l.gross_profit)>=0 ? "#10b981" : "#ef4444",
                  fontWeight:700 }}>{fmt(toNum(l.gross_profit))}</span>,
                <span style={{ color: toNum(l.profit_margin)>=0 ? "#10b981" : "#ef4444" }}>
                  {fmtPct(toNum(l.profit_margin))}
                </span>,
              ])}
              empty="尚無歷史資料，請先計算各月損益"
            />
          </div>
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
        <span style={{ fontSize:10, color:"#475569", textTransform:"uppercase" as const,
          letterSpacing:"0.1em" }}>{label}</span>
      </div>
      <div style={{ fontSize:20, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>{sub}</div>
    </div>
  );
}
function CardTitle({ children }: any) {
  return <div style={{ fontSize:11, fontWeight:700, color:"#475569",
    textTransform:"uppercase" as const, letterSpacing:"0.1em",
    marginBottom:12, paddingBottom:8, borderBottom:"1px solid #1e293b" }}>{children}</div>;
}
function FLabel({ children }: any) {
  return <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:600 }}>{children}</div>;
}
function FField({ label, value, onChange, type="text", span }: any) {
  return (
    <div style={{ gridColumn: span ? "1/-1" : undefined }}>
      <FLabel>{label}</FLabel>
      <input type={type} value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} style={S.input} />
    </div>
  );
}
function FR({ label, value, color, small, bold }: any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding: small?"3px 0":"7px 0" }}>
      <span style={{ fontSize: small?12:13, color: small?"#475569":"#94a3b8" }}>{label}</span>
      <span style={{ fontSize: small?12:13, fontWeight: bold?900:600,
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
    <div style={{ background:"#08111f", borderRadius:12,
      border:"1px solid #1e293b", overflow:"hidden" }}>
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
      padding:"8px 16px", borderRadius:8, border:"none",
      background:color, color:textColor, fontSize:13, fontWeight:700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, fontFamily:"inherit",
    }}>{children}</button>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:    { display:"flex", flexDirection:"column", height:"100%",
             background:"#060d1a", color:"#e2e8f0",
             fontFamily:"'Noto Sans TC','PingFang TC',sans-serif" },
  header:  { display:"flex", alignItems:"center", justifyContent:"space-between",
             padding:"0 24px", height:56, flexShrink:0,
             background:"#08111f", borderBottom:"1px solid #1e293b" },
  title:   { fontSize:15, fontWeight:900, color:"#f8fafc" },
  sub:     { fontSize:11, color:"#334155", marginTop:2 },
  kpiRow:  { display:"grid", gridTemplateColumns:"repeat(5,1fr)",
             gap:1, background:"#1e293b", flexShrink:0 },
  tabBar:  { display:"flex", background:"#08111f",
             borderBottom:"1px solid #1e293b", flexShrink:0 },
  tab:     { padding:"10px 18px", fontSize:12, fontWeight:600, cursor:"pointer" },
  content: { flex:1, overflowY:"auto", padding:"18px 24px" },
  grid2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  card:    { background:"#08111f", border:"1px solid #1e293b",
             borderRadius:12, padding:"16px 20px" },
  input:   { width:"100%", background:"#0a1628", border:"1px solid #1e293b",
             color:"#e2e8f0", padding:"7px 10px", borderRadius:7,
             fontSize:12, fontFamily:"inherit", boxSizing:"border-box" },
  calcBtn: { width:"100%", padding:"9px", borderRadius:8, border:"none",
             background:"#1e3a5f", color:"#60a5fa", fontSize:13,
             fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  pBtn:    { background:"#1e293b", color:"#94a3b8", border:"none",
             width:28, height:28, borderRadius:6, cursor:"pointer", fontSize:15 },
  pLabel:  { fontSize:14, fontWeight:700, color:"#e2e8f0",
             minWidth:100, textAlign:"center" },
};
