/**
 * OwnerDashboard.tsx
 * 路徑：artifacts/logistics/src/pages/owner/OwnerDashboard.tsx
 *
 * 靠行車主後台：
 *   - 本月代收款明細
 *   - 月結單（代收代付明細）
 *   - 車輛管理
 *   - 司機管理 + 薪資設定
 *   - 不需要請會計
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("token");
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

type Tab = "overview" | "vehicles" | "drivers" | "history";

const PAY_TYPE_LABEL: Record<string, string> = {
  per_trip: "趟次計費", daily: "日薪", monthly: "月薪",
};

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ownerId = (user as any)?.id;

  const [tab, setTab]       = useState<Tab>("overview");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));

  // 車輛表單
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vForm, setVForm] = useState({
    plate_no: "", vehicle_type: "小貨車", vehicle_brand: "",
    year: "", max_load_kg: "", insurance_expiry: "", inspection_expiry: "",
  });

  // 司機表單
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [dForm, setDForm] = useState({
    driver_name: "", driver_phone: "", license_no: "",
    vehicle_id: "", pay_type: "per_trip",
    base_pay: "", per_trip_rate: "",
  });

  // ── 查詢 ─────────────────────────────────────────────────────
  const { data: stmtRaw } = useQuery({
    queryKey: ["owner-statement", ownerId, period],
    queryFn: () => apiFetch(`/affiliated-owners/${ownerId}/statement?period=${period}`),
    enabled: !!ownerId,
  });
  const statements = Array.isArray(stmtRaw) ? stmtRaw : [];
  const currentStmt = statements.find((s: any) => s.period === period);

  const { data: receivablesRaw } = useQuery({
    queryKey: ["owner-receivables", ownerId, period],
    queryFn: () => apiFetch(`/affiliated-owners/${ownerId}/receivables?period=${period}`)
      .catch(() => []),
    enabled: !!ownerId,
  });
  const receivables = Array.isArray(receivablesRaw) ? receivablesRaw : [];

  const { data: vehiclesRaw } = useQuery({
    queryKey: ["owner-vehicles", ownerId],
    queryFn: () => apiFetch(`/affiliated-owners/${ownerId}/vehicles`),
    enabled: !!ownerId && tab === "vehicles",
  });
  const vehicles = Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const { data: driversRaw } = useQuery({
    queryKey: ["owner-drivers", ownerId],
    queryFn: () => apiFetch(`/affiliated-owners/${ownerId}/drivers`),
    enabled: !!ownerId && (tab === "drivers" || tab === "overview"),
  });
  const drivers = Array.isArray(driversRaw) ? driversRaw : [];

  // ── Mutations ────────────────────────────────────────────────
  const addVehicle = useMutation({
    mutationFn: () => apiFetch(`/affiliated-owners/${ownerId}/vehicles`, {
      method: "POST", body: JSON.stringify(vForm),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-vehicles"] });
      setShowVehicleForm(false);
      setVForm({ plate_no:"", vehicle_type:"小貨車", vehicle_brand:"",
        year:"", max_load_kg:"", insurance_expiry:"", inspection_expiry:"" });
      toast({ title: "✅ 車輛已新增" });
    },
  });

  const addDriver = useMutation({
    mutationFn: () => apiFetch(`/affiliated-owners/${ownerId}/drivers`, {
      method: "POST",
      body: JSON.stringify({
        ...dForm,
        base_pay: parseFloat(dForm.base_pay) || 0,
        per_trip_rate: parseFloat(dForm.per_trip_rate) || 0,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-drivers"] });
      setShowDriverForm(false);
      setDForm({ driver_name:"", driver_phone:"", license_no:"",
        vehicle_id:"", pay_type:"per_trip", base_pay:"", per_trip_rate:"" });
      toast({ title: "✅ 司機已新增" });
    },
  });

  const shiftMonth = (dir: 1|-1) => {
    const d = new Date(period+"-01");
    d.setMonth(d.getMonth() + dir);
    setPeriod(format(d, "yyyy-MM"));
  };

  // 月結單數字
  const totalIncome    = toNum(currentStmt?.total_income);
  const affiliationFee = toNum(currentStmt?.affiliation_fee);
  const platformFee    = toNum(currentStmt?.platform_fee);
  const driverPayroll  = toNum(currentStmt?.driver_payroll);
  const vehicleCost    = toNum(currentStmt?.vehicle_cost);
  const penaltyDeduct  = toNum(currentStmt?.penalty_deduct);
  const totalDeduct    = toNum(currentStmt?.total_deduct);
  const netPayout      = toNum(currentStmt?.net_payout);

  return (
    <div style={S.root}>

      {/* Header */}
      <header style={S.header}>
        <div>
          <div style={S.title}>{(user as any)?.name ?? "車主後台"}</div>
          <div style={S.sub}>靠行車主 · 代收代付管理中心</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={S.pBtn} onClick={() => shiftMonth(-1)}>‹</button>
          <div style={S.pLabel}>{format(new Date(period+"-01"), "yyyy年 M月", { locale:zhTW })}</div>
          <button style={S.pBtn} onClick={() => shiftMonth(1)}>›</button>
        </div>
      </header>

      {/* KPI */}
      <div style={S.kpiRow}>
        <KpiCard label="代收款項" value={fmt(totalIncome)} sub="富詠代收蝦皮款" color="#3b82f6" icon="💰" />
        <KpiCard label="應扣費用" value={fmt(totalDeduct)} sub="掛靠費+薪資+成本" color="#ef4444" icon="📊" />
        <KpiCard label="本月淨撥款" value={fmt(netPayout)}
          sub={currentStmt?.status === "paid" ? "✅ 已撥款" : "待撥款"}
          color={netPayout >= 0 ? "#10b981" : "#ef4444"} icon="🏦" />
        <KpiCard label="旗下司機" value={`${drivers.length} 人`} sub="目前在職" color="#f59e0b" icon="👷" />
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {([ ["overview","📊 月結總覽"], ["vehicles","🚛 車輛管理"],
            ["drivers","👷 司機管理"], ["history","📈 歷史記錄"] ] as [Tab,string][])
          .map(([id,label]) => (
            <div key={id} onClick={() => setTab(id)} style={{
              ...S.tab,
              color: tab===id ? "#f59e0b" : "#475569",
              borderBottom: `2px solid ${tab===id ? "#f59e0b" : "transparent"}`,
            }}>{label}</div>
          ))}
      </div>

      {/* 內容 */}
      <div style={S.content}>

        {/* 月結總覽 */}
        {tab==="overview" && (
          <div style={S.grid2}>
            {/* 代收代付明細 */}
            <div style={S.card}>
              <CT>💸 本月代收代付明細</CT>

              <div style={{ marginBottom:12, padding:"10px 12px",
                background:"#0f1f35", borderRadius:8, fontSize:12, color:"#64748b" }}>
                代收款項（富詠幫你收的蝦皮款）
              </div>

              {receivables.length > 0 ? receivables.map((r: any, i: number) => (
                <FR key={i} label={`${r.route_type ?? "趟次"} (${r.trip_count}趟)`}
                  value={fmt(toNum(r.net_income))} color="#3b82f6" />
              )) : (
                <FR label="蝦皮趟次款項" value={fmt(totalIncome)} color="#3b82f6" />
              )}

              <div style={{ height:1, background:"#1e293b", margin:"10px 0" }} />
              <div style={{ fontSize:11, color:"#475569", marginBottom:8 }}>應扣費用</div>

              <FR label={`掛靠費`}      value={`－${fmt(affiliationFee)}`}  color="#94a3b8" small />
              <FR label="平台使用費"    value={`－${fmt(platformFee)}`}      color="#94a3b8" small />
              <FR label="司機薪資"      value={`－${fmt(driverPayroll)}`}    color="#94a3b8" small />
              <FR label="車輛相關成本"  value={`－${fmt(vehicleCost)}`}      color="#94a3b8" small />
              {penaltyDeduct > 0 && (
                <FR label="⚠️ 罰款扣款" value={`－${fmt(penaltyDeduct)}`}   color="#ef4444" small />
              )}

              <div style={{ height:1, background:"#1e293b", margin:"10px 0" }} />
              <div style={{ display:"flex", justifyContent:"space-between",
                padding:"10px 12px", background: netPayout >= 0 ? "#0a1f14" : "#1f0a0a",
                borderRadius:8, border: `1px solid ${netPayout >= 0 ? "#166534" : "#7f1d1d"}` }}>
                <span style={{ fontWeight:700, fontSize:14, color:"#e2e8f0" }}>
                  富詠應撥款給您
                </span>
                <span style={{ fontWeight:900, fontSize:18,
                  color: netPayout >= 0 ? "#4ade80" : "#f87171" }}>
                  {fmt(netPayout)}
                </span>
              </div>

              {currentStmt?.status === "paid" && (
                <div style={{ marginTop:8, fontSize:12, color:"#10b981", textAlign:"center" as const }}>
                  ✅ 已於 {currentStmt.paid_at
                    ? format(new Date(currentStmt.paid_at), "M月d日")
                    : "—"} 撥款
                  {currentStmt.payment_ref && ` · 參考編號：${currentStmt.payment_ref}`}
                </div>
              )}
            </div>

            {/* 司機薪資快覽 */}
            <div style={S.card}>
              <CT>👷 本月司機薪資</CT>
              {drivers.length === 0 ? (
                <div style={{ color:"#334155", fontSize:13, textAlign:"center" as const, padding:"24px 0" }}>
                  尚未新增司機<br />
                  <button style={{ ...S.addBtn, marginTop:12 }}
                    onClick={() => setTab("drivers")}>
                    前往新增司機 →
                  </button>
                </div>
              ) : (
                <>
                  {drivers.map((d: any) => (
                    <div key={d.id} style={{ display:"flex", alignItems:"center",
                      justifyContent:"space-between", padding:"8px 0",
                      borderBottom:"1px solid #0f172a" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{d.driver_name}</div>
                        <div style={{ fontSize:11, color:"#475569" }}>
                          {PAY_TYPE_LABEL[d.pay_type]} ·
                          {d.pay_type === "per_trip"
                            ? ` 每趟 ${fmt(toNum(d.per_trip_rate))}`
                            : ` 底薪 ${fmt(toNum(d.base_pay))}`}
                        </div>
                      </div>
                      <span style={{ fontSize:11, color:"#64748b" }}>
                        {d.plate_no ?? "未指定車輛"}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginTop:12, padding:"8px 12px",
                    background:"#0a1628", borderRadius:8,
                    fontSize:12, color:"#64748b", textAlign:"center" as const }}>
                    本月司機薪資合計：{fmt(driverPayroll)}
                  </div>
                </>
              )}
            </div>

            {/* 重要提醒 */}
            <div style={{ ...S.card, gridColumn:"1/-1",
              background:"#0a1628", border:"1px solid #1e293b" }}>
              <CT>📋 靠行說明</CT>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                gap:12, fontSize:12, color:"#64748b" }}>
                <InfoBox icon="🚛" title="車輛登記" desc="在平台登記車輛，行照保險到期自動提醒" />
                <InfoBox icon="👷" title="司機薪資" desc="設定趟次費或底薪，系統自動計算月薪" />
                <InfoBox icon="💰" title="代收代付" desc="富詠代收蝦皮款，扣除各項費用後自動撥款" />
              </div>
            </div>
          </div>
        )}

        {/* 車輛管理 */}
        {tab==="vehicles" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" onClick={() => setShowVehicleForm(true)}>＋ 新增車輛</Btn>
              <div style={{ fontSize:12, color:"#475569", alignSelf:"center" }}>
                共 {vehicles.length} 台車輛
              </div>
            </div>

            {showVehicleForm && (
              <div style={{ ...S.card, marginBottom:16 }}>
                <CT>🚛 新增車輛</CT>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <FF label="車牌號碼 *" value={vForm.plate_no}
                    onChange={v => setVForm(p=>({...p,plate_no:v}))} />
                  <div>
                    <FL>車輛類型</FL>
                    <select value={vForm.vehicle_type}
                      onChange={e => setVForm(p=>({...p,vehicle_type:e.target.value}))}
                      style={S.input}>
                      {["機車","小貨車","中貨車","大貨車","冷凍車","廂型車"].map(t=>(
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <FF label="廠牌" value={vForm.vehicle_brand}
                    onChange={v => setVForm(p=>({...p,vehicle_brand:v}))} />
                  <FF label="年份" value={vForm.year} type="number"
                    onChange={v => setVForm(p=>({...p,year:v}))} />
                  <FF label="最大載重(kg)" value={vForm.max_load_kg} type="number"
                    onChange={v => setVForm(p=>({...p,max_load_kg:v}))} />
                  <FF label="保險到期日" value={vForm.insurance_expiry} type="date"
                    onChange={v => setVForm(p=>({...p,insurance_expiry:v}))} />
                  <FF label="驗車到期日" value={vForm.inspection_expiry} type="date"
                    onChange={v => setVForm(p=>({...p,inspection_expiry:v}))} />
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn color="#1e293b" textColor="#64748b"
                    onClick={() => setShowVehicleForm(false)}>取消</Btn>
                  <Btn color="#6366f1"
                    disabled={addVehicle.isPending || !vForm.plate_no}
                    onClick={() => addVehicle.mutate()}>
                    {addVehicle.isPending ? "新增中…" : "新增車輛"}
                  </Btn>
                </div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
              {vehicles.map((v: any) => (
                <div key={v.id} style={{ ...S.card, padding:"14px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center",
                    justifyContent:"space-between", marginBottom:10 }}>
                    <div style={{ fontWeight:700, fontSize:16, color:"#f8fafc",
                      fontFamily:"monospace" }}>{v.plate_no}</div>
                    <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20,
                      background:"rgba(16,185,129,.15)", color:"#10b981" }}>
                      {v.vehicle_type}
                    </span>
                  </div>
                  {v.vehicle_brand && (
                    <div style={{ fontSize:12, color:"#64748b" }}>{v.vehicle_brand} {v.year && `(${v.year}年)`}</div>
                  )}
                  {v.insurance_expiry && (
                    <div style={{ fontSize:11, marginTop:6,
                      color: new Date(v.insurance_expiry) < new Date() ? "#ef4444" : "#475569" }}>
                      保險到期：{format(new Date(v.insurance_expiry), "yyyy/M/d")}
                      {new Date(v.insurance_expiry) < new Date() && " ⚠️ 已逾期"}
                    </div>
                  )}
                  {v.inspection_expiry && (
                    <div style={{ fontSize:11,
                      color: new Date(v.inspection_expiry) < new Date() ? "#ef4444" : "#475569" }}>
                      驗車到期：{format(new Date(v.inspection_expiry), "yyyy/M/d")}
                      {new Date(v.inspection_expiry) < new Date() && " ⚠️ 已逾期"}
                    </div>
                  )}
                </div>
              ))}
              {vehicles.length === 0 && (
                <div style={{ gridColumn:"1/-1", color:"#334155",
                  textAlign:"center" as const, padding:"32px" }}>
                  尚未登記車輛，點「新增車輛」開始
                </div>
              )}
            </div>
          </div>
        )}

        {/* 司機管理 */}
        {tab==="drivers" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" onClick={() => setShowDriverForm(true)}>＋ 新增司機</Btn>
            </div>

            {showDriverForm && (
              <div style={{ ...S.card, marginBottom:16 }}>
                <CT>👷 新增司機</CT>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <FF label="司機姓名 *" value={dForm.driver_name}
                    onChange={v => setDForm(p=>({...p,driver_name:v}))} />
                  <FF label="手機號碼" value={dForm.driver_phone}
                    onChange={v => setDForm(p=>({...p,driver_phone:v}))} />
                  <FF label="駕照號碼" value={dForm.license_no}
                    onChange={v => setDForm(p=>({...p,license_no:v}))} />
                  <div>
                    <FL>指定車輛</FL>
                    <select value={dForm.vehicle_id}
                      onChange={e => setDForm(p=>({...p,vehicle_id:e.target.value}))}
                      style={S.input}>
                      <option value="">未指定</option>
                      {vehicles.map((v: any) => (
                        <option key={v.id} value={v.id}>{v.plate_no} ({v.vehicle_type})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FL>薪資方式</FL>
                    <select value={dForm.pay_type}
                      onChange={e => setDForm(p=>({...p,pay_type:e.target.value}))}
                      style={S.input}>
                      <option value="per_trip">趟次計費</option>
                      <option value="daily">日薪</option>
                      <option value="monthly">月薪</option>
                    </select>
                  </div>
                  {dForm.pay_type === "per_trip" ? (
                    <FF label="每趟費率（元）" value={dForm.per_trip_rate} type="number"
                      onChange={v => setDForm(p=>({...p,per_trip_rate:v}))} />
                  ) : (
                    <FF label={dForm.pay_type === "daily" ? "日薪（元）" : "月薪（元）"}
                      value={dForm.base_pay} type="number"
                      onChange={v => setDForm(p=>({...p,base_pay:v}))} />
                  )}
                </div>
                <div style={{ display:"flex", gap:8, marginTop:14 }}>
                  <Btn color="#1e293b" textColor="#64748b"
                    onClick={() => setShowDriverForm(false)}>取消</Btn>
                  <Btn color="#6366f1"
                    disabled={addDriver.isPending || !dForm.driver_name}
                    onClick={() => addDriver.mutate()}>
                    {addDriver.isPending ? "新增中…" : "新增司機"}
                  </Btn>
                </div>
              </div>
            )}

            <Tbl
              headers={["司機","電話","指定車輛","薪資方式","費率","狀態"]}
              rows={drivers.map((d: any) => [
                d.driver_name,
                d.driver_phone ?? "—",
                d.plate_no ?? "未指定",
                PAY_TYPE_LABEL[d.pay_type],
                d.pay_type === "per_trip"
                  ? `每趟 ${fmt(toNum(d.per_trip_rate))}`
                  : `${fmt(toNum(d.base_pay))} / ${d.pay_type === "daily" ? "日" : "月"}`,
                <SBadge status={d.is_active ? "active" : "inactive"} />,
              ])}
              empty="尚未新增司機"
            />
          </div>
        )}

        {/* 歷史記錄 */}
        {tab==="history" && (
          <Tbl
            headers={["月份","代收款","掛靠費","薪資","車輛成本","罰款","淨撥款","狀態"]}
            rows={statements.map((s: any) => [
              s.period,
              fmt(toNum(s.total_income)),
              fmt(toNum(s.affiliation_fee)),
              fmt(toNum(s.driver_payroll)),
              fmt(toNum(s.vehicle_cost)),
              toNum(s.penalty_deduct) > 0
                ? <span style={{ color:"#ef4444" }}>{fmt(toNum(s.penalty_deduct))}</span>
                : "—",
              <strong style={{ color: toNum(s.net_payout)>=0 ? "#4ade80" : "#f87171" }}>
                {fmt(toNum(s.net_payout))}
              </strong>,
              <SBadge status={s.status} />,
            ])}
            empty="尚無歷史記錄"
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
        <span style={{ fontSize:10, color:"#475569", textTransform:"uppercase" as const }}>{label}</span>
      </div>
      <div style={{ fontSize:20, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:"#334155", marginTop:2 }}>{sub}</div>
    </div>
  );
}
function CT({ children }: any) {
  return <div style={{ fontSize:11, fontWeight:700, color:"#475569",
    textTransform:"uppercase" as const, letterSpacing:"0.1em",
    marginBottom:12, paddingBottom:8, borderBottom:"1px solid #1e293b" }}>{children}</div>;
}
function FL({ children }: any) {
  return <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:600 }}>{children}</div>;
}
function FF({ label, value, onChange, type="text" }: any) {
  return (
    <div>
      <FL>{label}</FL>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={S.input} />
    </div>
  );
}
function FR({ label, value, color, small }: any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding: small?"3px 0":"7px 0" }}>
      <span style={{ fontSize: small?12:13, color: small?"#475569":"#94a3b8" }}>{label}</span>
      <span style={{ fontSize: small?12:13, color, fontVariantNumeric:"tabular-nums", fontWeight:600 }}>{value}</span>
    </div>
  );
}
function InfoBox({ icon, title, desc }: any) {
  return (
    <div style={{ padding:"10px 12px", background:"#0f172a", borderRadius:8 }}>
      <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", marginBottom:2 }}>{title}</div>
      <div style={{ fontSize:11, color:"#475569", lineHeight:1.5 }}>{desc}</div>
    </div>
  );
}
function SBadge({ status }: { status: string }) {
  const M: Record<string,[string,string]> = {
    draft:    ["草稿","#475569"], paid:    ["已撥款","#10b981"],
    active:   ["在職","#10b981"], inactive:["離職","#475569"],
    confirmed:["確認","#3b82f6"],
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
                textTransform:"uppercase" as const, borderBottom:"1px solid #1e293b" }}>{h}</th>
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
                  <td key={j} style={{ padding:"8px 12px", fontSize:12, color:"#94a3b8" }}>{cell}</td>
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
  kpiRow:  { display:"grid", gridTemplateColumns:"repeat(4,1fr)",
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
  addBtn:  { background:"#1e3a5f", color:"#60a5fa", border:"none",
             padding:"6px 14px", borderRadius:7, fontSize:12,
             fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  pBtn:    { background:"#1e293b", color:"#94a3b8", border:"none",
             width:28, height:28, borderRadius:6, cursor:"pointer", fontSize:15 },
  pLabel:  { fontSize:14, fontWeight:700, color:"#e2e8f0",
             minWidth:100, textAlign:"center" },
};
