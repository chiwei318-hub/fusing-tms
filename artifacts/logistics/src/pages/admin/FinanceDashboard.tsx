/**
 * FinanceDashboard.tsx — v2
 * 路徑：artifacts/logistics/src/pages/admin/FinanceDashboard.tsx
 *
 * 五個 Tab：
 *   📊 總覽    — 金流四層 + 稅務行事曆 + 待處理事項
 *   👷 司機薪資 — 產生薪資單 + 付款流程（含付款參考編號）
 *   🚛 車隊應付 — 計算應付款 + 付款流程
 *   🧾 電子發票 — 開立 / 查詢 / 作廢
 *   📋 扣繳憑單 — 年度憑單 + 法規提醒
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

function toArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["data","items","results","rows"]) {
      if (Array.isArray((v as any)[k])) return (v as any)[k];
    }
  }
  return [];
}
const toNum = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
const fmt   = (n: number)  => `$${Math.round(n).toLocaleString("zh-TW")}`;
const fmtPct= (a: number, b: number) => b > 0 ? `${((a/b)*100).toFixed(1)}%` : "—";

type Tab = "overview" | "payroll" | "fleet" | "invoice" | "tax";

export default function FinanceDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab]       = useState<Tab>("overview");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [year, setYear]     = useState(new Date().getFullYear());

  const [payModal, setPayModal] = useState<{
    type: "payroll"|"fleet"; id: number; name: string; amount: number;
  } | null>(null);
  const [payRef,  setPayRef]  = useState("");
  const [payDate, setPayDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invForm, setInvForm] = useState({
    order_no: "", customer_name: "", customer_tax_id: "",
    amount: "", carrier_type: "B2C",
  });

  // ── 查詢 ─────────────────────────────────────────────────────
  const { data: payrollRaw } = useQuery({
    queryKey: ["driver-payroll", period],
    queryFn: () => apiFetch(`/tax/driver-payroll?period=${period}`),
  });
  const payrolls = toArray(payrollRaw);

  const { data: fleetRaw } = useQuery({
    queryKey: ["fleet-payables", period],
    queryFn: () => apiFetch(`/tax/fleet-payables?period=${period}`),
  });
  const fleetPayables = toArray(fleetRaw);

  const { data: ledger } = useQuery({
    queryKey: ["ledger-summary", period],
    queryFn: () => apiFetch(`/tax/ledger/summary?period=${period}`).catch(() => ({})),
  });

  const { data: invoicesRaw } = useQuery({
    queryKey: ["invoices", period],
    queryFn: () => apiFetch(`/invoices?from=${period}-01`),
    enabled: tab === "invoice",
  });
  const invoices = toArray(invoicesRaw);

  const { data: withholdingRaw } = useQuery({
    queryKey: ["withholding", year],
    queryFn: () => apiFetch(`/tax/withholding?year=${year}`),
    enabled: tab === "tax",
  });
  const withholdings = toArray(withholdingRaw);

  // ── 統計 ─────────────────────────────────────────────────────
  const totalPayroll  = payrolls.reduce((s: number, r: any) => s + toNum(r.net_pay), 0);
  const totalFleet    = fleetPayables.reduce((s: number, r: any) => s + toNum(r.net_payable), 0);
  const totalRevenue  = toNum((ledger as any)?.total_revenue);
  const totalProfit   = toNum((ledger as any)?.net_profit);
  const totalVat      = toNum((ledger as any)?.vat_payable);
  const unpaidPayroll = payrolls.filter((p: any) => !p.paid_at).length;
  const unpaidFleet   = fleetPayables.filter((f: any) => !f.paid_at).length;

  // ── Mutations ────────────────────────────────────────────────
  const generatePayroll = useMutation({
    mutationFn: () => apiFetch("/tax/driver-payroll/generate", {
      method: "POST", body: JSON.stringify({ period, overwrite: false }),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["driver-payroll"] });
      toast({ title: `✅ 薪資單產生 ${d.generated ?? 0} 筆` });
    },
    onError: (e: Error) => toast({ title: "產生失敗", description: e.message, variant: "destructive" }),
  });

  const calcFleet = useMutation({
    mutationFn: () => apiFetch("/tax/fleet-payables/calculate", {
      method: "POST", body: JSON.stringify({ period }),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["fleet-payables"] });
      toast({ title: `✅ 車隊應付款計算完成，共 ${d.generated ?? 0} 筆` });
    },
    onError: (e: Error) => toast({ title: "計算失敗", description: e.message, variant: "destructive" }),
  });

  const markPaid = useMutation({
    mutationFn: ({ type, id }: { type: "payroll"|"fleet"; id: number }) =>
      apiFetch(`/tax/${type === "payroll" ? "driver-payroll" : "fleet-payables"}/${id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ paidAt: payDate, paymentRef: payRef }),
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [v.type === "payroll" ? "driver-payroll" : "fleet-payables"] });
      setPayModal(null); setPayRef("");
      toast({ title: "✅ 已標記付款" });
    },
    onError: (e: Error) => toast({ title: "操作失敗", description: e.message, variant: "destructive" }),
  });

  const issueInvoice = useMutation({
    mutationFn: () => apiFetch("/invoices/issue", {
      method: "POST",
      body: JSON.stringify({ ...invForm, amount: parseFloat(invForm.amount) }),
    }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setInvoiceModal(false);
      setInvForm({ order_no:"", customer_name:"", customer_tax_id:"", amount:"", carrier_type:"B2C" });
      toast({ title: `✅ 發票開立成功：${d.invoice_no}` });
    },
    onError: (e: Error) => toast({ title: "開立失敗", description: e.message, variant: "destructive" }),
  });

  const voidInvoiceMut = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/invoices/${id}/void-post`, {
        method: "POST", body: JSON.stringify({ reason: "手動作廢" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "✅ 發票已作廢" });
    },
    onError: (e: Error) => toast({ title: "作廢失敗", description: e.message, variant: "destructive" }),
  });

  const openPay = useCallback((type: "payroll"|"fleet", id: number, name: string, amount: number) => {
    setPayModal({ type, id, name, amount });
    setPayRef("");
    setPayDate(format(new Date(), "yyyy-MM-dd"));
  }, []);

  const shiftMonth = (dir: 1|-1) => {
    const d = new Date(period + "-01");
    d.setMonth(d.getMonth() + dir);
    setPeriod(format(d, "yyyy-MM"));
  };

  return (
    <div style={S.root}>

      {/* Header */}
      <header style={S.header}>
        <div>
          <div style={S.title}>財務總覽</div>
          <div style={S.sub}>富詠運輸 · 帳務結算中心</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button style={S.pBtn} onClick={() => shiftMonth(-1)}>‹</button>
          <div style={S.pLabel}>{format(new Date(period+"-01"), "yyyy年 M月", { locale: zhTW })}</div>
          <button style={S.pBtn} onClick={() => shiftMonth(1)}>›</button>
        </div>
      </header>

      {/* KPI */}
      <div style={S.kpiRow}>
        <KpiCard label="本月營收"   value={fmt(totalRevenue)} sub="含稅總額"                            color="#f59e0b" icon="💰" />
        <KpiCard label="平台毛利"   value={fmt(totalProfit)}  sub={`毛利率 ${fmtPct(totalProfit,totalRevenue)}`} color="#10b981" icon="📈" />
        <KpiCard label="應繳營業稅" value={fmt(totalVat)}     sub="銷項－進項"                          color="#3b82f6" icon="🧾" />
        <KpiCard label="司機待付"   value={`${unpaidPayroll} 筆`} sub={fmt(totalPayroll)} color={unpaidPayroll>0?"#ef4444":"#10b981"} icon="👷" />
        <KpiCard label="車隊待付"   value={`${unpaidFleet} 筆`}  sub={fmt(totalFleet)}   color={unpaidFleet>0?"#f97316":"#10b981"} icon="🚛" />
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {([ ["overview","📊 總覽"], ["payroll","👷 司機薪資"], ["fleet","🚛 車隊應付"],
            ["invoice","🧾 電子發票"], ["tax","📋 扣繳憑單"] ] as [Tab,string][])
          .map(([id,label]) => (
            <div key={id} onClick={() => setTab(id)} style={{
              ...S.tab,
              color: tab===id ? "#f59e0b" : "#475569",
              borderBottom: `2px solid ${tab===id ? "#f59e0b" : "transparent"}`,
            }}>{label}</div>
          ))}
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* 總覽 */}
        {tab==="overview" && (
          <div style={S.grid2}>
            <div style={S.card}>
              <CardTitle>💸 本月金流</CardTitle>
              <FR label="客戶付款（含稅）"  value={fmt(totalRevenue)} color="#f59e0b" />
              <Arrow />
              <FR label="營業稅（5%）"   value={`－${fmt(totalVat)}`}     color="#94a3b8" small />
              <FR label="司機薪資成本"   value={`－${fmt(totalPayroll)}`}  color="#94a3b8" small />
              <FR label="車隊應付成本"   value={`－${fmt(totalFleet)}`}    color="#94a3b8" small />
              <Arrow />
              <FR label="平台淨利" value={fmt(totalProfit)} color="#10b981" bold />
              <div style={{ marginTop:12, padding:"10px 14px", background:"#0a1628",
                borderRadius:8, fontSize:14, color:"#64748b" }}>
                預估營所稅（20%）：{fmt(toNum((ledger as any)?.income_tax_payable))}
              </div>
            </div>

            <div style={S.card}>
              <CardTitle>📅 稅務行事曆</CardTitle>
              {[["每月15日前","薪資扣繳申報","#f59e0b"],
                ["雙月25日前","營業稅申報（401）","#3b82f6"],
                ["次年1月底","扣繳憑單申報","#10b981"],
                ["次年5月底","營利事業所得稅","#8b5cf6"],
              ].map(([date,label,color],i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:14,
                  padding:"13px 0", borderBottom:"1px solid #0f172a" }}>
                  <div style={{ width:4, height:36, borderRadius:2, background:color, flexShrink:0 }} />
                  <div>
                    <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0" }}>{label}</div>
                    <div style={{ fontSize:13, color:"#64748b", marginTop:2 }}>{date}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...S.card, gridColumn:"1/-1" }}>
              <CardTitle>⚠️ 待處理事項</CardTitle>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {unpaidPayroll>0 && <Chip color="#ef4444"
                  label={`${unpaidPayroll} 筆司機薪資未付（${fmt(totalPayroll)}）`}
                  onClick={() => setTab("payroll")} />}
                {unpaidFleet>0 && <Chip color="#f97316"
                  label={`${unpaidFleet} 筆車隊款項未付（${fmt(totalFleet)}）`}
                  onClick={() => setTab("fleet")} />}
                {unpaidPayroll===0 && unpaidFleet===0 &&
                  <div style={{ fontSize:15, color:"#10b981" }}>✅ 本期無待處理事項</div>}
              </div>
            </div>
          </div>
        )}

        {/* 司機薪資 */}
        {tab==="payroll" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" disabled={generatePayroll.isPending}
                onClick={() => generatePayroll.mutate()}>
                {generatePayroll.isPending ? "產生中…" : "⚡ 產生本月薪資單"}
              </Btn>
            </div>
            <Tbl
              headers={["司機","趟次","應付","扣繳","健保補費","實領","操作"]}
              rows={payrolls.map((p: any) => [
                p.driver_name || `ID:${p.driver_shopee_id}`,
                String(p.total_trips),
                fmt(toNum(p.gross_pay)),
                fmt(toNum(p.withholding_tax)),
                fmt(toNum(p.nhi_supplement)),
                <strong style={{ color:"#f59e0b" }}>{fmt(toNum(p.net_pay))}</strong>,
                !p.paid_at
                  ? <Btn size="sm" color="#064e3b" textColor="#4ade80"
                      onClick={() => openPay("payroll", p.id, p.driver_name || `ID:${p.driver_shopee_id}`, toNum(p.net_pay))}>付款</Btn>
                  : <span style={{ fontSize:13, color:"#10b981" }}>
                      ✅ {format(new Date(p.paid_at),"M/d")}
                    </span>,
              ])}
              empty="本月尚無薪資資料，請點「產生本月薪資單」"
            />
          </div>
        )}

        {/* 車隊應付 */}
        {tab==="fleet" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <Btn color="#6366f1" disabled={calcFleet.isPending}
                onClick={() => calcFleet.mutate()}>
                {calcFleet.isPending ? "計算中…" : "⚡ 計算本月應付款"}
              </Btn>
            </div>
            <Tbl
              headers={["車隊","趟次","應付","扣繳","健保補費","實付","操作"]}
              rows={fleetPayables.map((f: any) => [
                f.fleet_name,
                String(f.total_trips ?? f.trip_count ?? "—"),
                fmt(toNum(f.gross_amount)),
                fmt(toNum(f.withholding_tax)),
                fmt(toNum(f.nhi_supplement)),
                <strong style={{ color:"#f59e0b" }}>{fmt(toNum(f.net_payable))}</strong>,
                !f.paid_at
                  ? <Btn size="sm" color="#064e3b" textColor="#4ade80"
                      onClick={() => openPay("fleet", f.id, f.fleet_name, toNum(f.net_payable))}>付款</Btn>
                  : <span style={{ fontSize:13, color:"#10b981" }}>
                      ✅ {format(new Date(f.paid_at),"M/d")}
                    </span>,
              ])}
              empty="本月尚無車隊應付資料，請點「計算本月應付款」"
            />
          </div>
        )}

        {/* 電子發票 */}
        {tab==="invoice" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
              <Btn color="#6366f1" onClick={() => setInvoiceModal(true)}>＋ 開立發票</Btn>
              <div style={{ fontSize:14, color:"#64748b" }}>
                本期 {invoices.length} 張 · 總額 {fmt(invoices.reduce((s:number,i:any)=>
                  s+toNum(i.total_amount||i.amount),0))}
              </div>
            </div>
            <Tbl
              headers={["發票號碼","客戶","統編","未稅","稅額","含稅","狀態","操作"]}
              rows={invoices.map((inv: any) => [
                <span style={{ fontFamily:"monospace", fontSize:14 }}>
                  {inv.invoice_no || inv.invoice_number}
                </span>,
                inv.customer_name || inv.buyer_name || "—",
                inv.customer_tax_id || inv.buyer_tax_id || "一般",
                fmt(toNum(inv.amount || inv.subtotal)),
                fmt(toNum(inv.tax_amount)),
                <strong style={{ color:"#f59e0b" }}>
                  {fmt(toNum(inv.total_amount || inv.amount))}
                </strong>,
                <SBadge status={
                  inv.status==="voided"||inv.status==="void" ? "void" : "issued"
                } />,
                inv.status!=="voided" && inv.status!=="void"
                  ? <Btn size="sm" color="#3f0000" textColor="#f87171"
                      onClick={() => {
                        if (confirm("確定作廢？"))
                          voidInvoiceMut.mutate({ id: inv.id });
                      }}>作廢</Btn>
                  : <span style={{ fontSize:13, color:"#475569" }}>已作廢</span>,
              ])}
              empty="本期尚無發票記錄"
            />
          </div>
        )}

        {/* 扣繳憑單 */}
        {tab==="tax" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center" }}>
              <select value={year} onChange={e=>setYear(Number(e.target.value))} style={S.select}>
                {[2026,2025,2024].map(y=><option key={y} value={y}>{y} 年</option>)}
              </select>
              <Btn color="#6366f1" onClick={() =>
                apiFetch("/tax/withholding/generate",{method:"POST",body:JSON.stringify({year})})
                  .then(()=>{ qc.invalidateQueries({queryKey:["withholding"]}); toast({title:"✅ 扣繳憑單產生完成"}); })
                  .catch((e:Error)=>toast({title:"產生失敗",description:e.message,variant:"destructive"}))}>
                產生年度憑單
              </Btn>
            </div>
            <Tbl
              headers={["受款人","類型","全年付款","全年扣繳","實領","扣繳率"]}
              rows={withholdings.map((w:any)=>[
                w.payee_name,
                w.payee_type==="driver" ? "🧑 司機" : "🏢 車隊",
                fmt(toNum(w.total_paid)), fmt(toNum(w.total_withheld)),
                fmt(toNum(w.total_paid)-toNum(w.total_withheld)),
                fmtPct(toNum(w.total_withheld),toNum(w.total_paid)),
              ])}
              empty="尚無扣繳憑單資料"
            />
            <div style={{ marginTop:16, padding:"16px 20px", background:"#0a1628",
              border:"1px solid #1e293b", borderRadius:10, fontSize:14,
              color:"#64748b", lineHeight:2 }}>
              <div style={{ fontWeight:700, color:"#94a3b8", marginBottom:6, fontSize:15 }}>📋 台灣扣繳法規</div>
              <div>• 執行業務所得（9A）：月累計 &gt; NT$20,010 → 扣繳 10%</div>
              <div>• 二代健保：單次 &gt; NT$24,000 → 扣 2.11%</div>
              <div>• 車隊公司戶：10%；有統編：1.9%</div>
              <div>• 每月15日前申報；次年1月底前開立憑單</div>
            </div>
          </div>
        )}
      </div>

      {/* 付款 Modal */}
      {payModal && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:19, marginBottom:6 }}>💳 標記付款</div>
            <div style={{ fontSize:15, color:"#64748b", marginBottom:20 }}>
              {payModal.name} · {fmt(payModal.amount)}
            </div>
            <FLabel>付款日期</FLabel>
            <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}
              style={{ ...S.input, marginBottom:12 }} />
            <FLabel>付款參考編號（選填）</FLabel>
            <input placeholder="銀行轉帳末5碼 / 支票號碼"
              value={payRef} onChange={e=>setPayRef(e.target.value)}
              style={{ ...S.input, marginBottom:20 }} />
            <div style={{ display:"flex", gap:8 }}>
              <Btn color="#1e293b" textColor="#64748b" style={{ flex:1 }}
                onClick={() => setPayModal(null)}>取消</Btn>
              <Btn color="#10b981" style={{ flex:2 }}
                disabled={markPaid.isPending}
                onClick={() => markPaid.mutate({ type:payModal.type, id:payModal.id })}>
                {markPaid.isPending ? "處理中…" : "✅ 確認付款"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* 發票 Modal */}
      {invoiceModal && (
        <div style={S.overlay}>
          <div style={{ ...S.modal, maxWidth:460 }}>
            <div style={{ fontWeight:800, fontSize:19, marginBottom:20 }}>🧾 開立電子發票</div>
            <FLabel>訂單編號（選填）</FLabel>
            <input placeholder="FY2026..." value={invForm.order_no}
              onChange={e=>setInvForm(p=>({...p,order_no:e.target.value}))}
              style={{ ...S.input, marginBottom:10 }} />
            <FLabel>客戶名稱</FLabel>
            <input placeholder="公司或個人名稱" value={invForm.customer_name}
              onChange={e=>setInvForm(p=>({...p,customer_name:e.target.value}))}
              style={{ ...S.input, marginBottom:10 }} />
            <div style={{ display:"flex", gap:10, marginBottom:10 }}>
              <div style={{ flex:1 }}>
                <FLabel>統一編號（B2B 填）</FLabel>
                <input placeholder="留空=一般消費者" value={invForm.customer_tax_id}
                  onChange={e=>setInvForm(p=>({...p,customer_tax_id:e.target.value}))}
                  style={S.input} />
              </div>
              <div style={{ flex:1 }}>
                <FLabel>未稅金額</FLabel>
                <input type="number" placeholder="0" value={invForm.amount}
                  onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}
                  style={S.input} />
              </div>
            </div>
            {invForm.amount && (
              <div style={{ fontSize:14, color:"#64748b", marginBottom:14 }}>
                稅額 {fmt(parseFloat(invForm.amount||"0")*0.05)} · 含稅 {fmt(parseFloat(invForm.amount||"0")*1.05)}
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <Btn color="#1e293b" textColor="#64748b" style={{ flex:1 }}
                onClick={() => setInvoiceModal(false)}>取消</Btn>
              <Btn color="#6366f1" style={{ flex:2 }}
                disabled={issueInvoice.isPending||!invForm.customer_name||!invForm.amount}
                onClick={() => issueInvoice.mutate()}>
                {issueInvoice.isPending ? "開立中…" : "開立發票"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 小元件 ───────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: any) {
  return (
    <div style={{ background:"#08111f", border:"1px solid #1e293b",
      padding:"20px 24px", borderTop:`3px solid ${color}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <span style={{ fontSize:13, color:"#64748b", textTransform:"uppercase" as const,
          letterSpacing:"0.08em", fontWeight:700 }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:900, color, fontVariantNumeric:"tabular-nums" }}>{value}</div>
      <div style={{ fontSize:13, color:"#475569", marginTop:4 }}>{sub}</div>
    </div>
  );
}
function CardTitle({ children }: any) {
  return <div style={{ fontSize:13, fontWeight:700, color:"#64748b",
    textTransform:"uppercase" as const, letterSpacing:"0.08em",
    marginBottom:14, paddingBottom:12, borderBottom:"1px solid #1e293b" }}>{children}</div>;
}
function FLabel({ children }: any) {
  return <div style={{ fontSize:13, color:"#64748b", marginBottom:6, fontWeight:600 }}>{children}</div>;
}
function FR({ label, value, color, small, bold }: any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding: small?"4px 0":"9px 0" }}>
      <span style={{ fontSize: small?13:15, color: small?"#64748b":"#94a3b8" }}>{label}</span>
      <span style={{ fontSize: small?13:15, fontWeight: bold?900:600,
        color, fontVariantNumeric:"tabular-nums" }}>{value}</span>
    </div>
  );
}
function Arrow() {
  return <div style={{ textAlign:"center" as const, color:"#334155", fontSize:16, margin:"4px 0" }}>▼</div>;
}
function Chip({ label, color, onClick }: any) {
  return (
    <div onClick={onClick} style={{ display:"inline-flex", alignItems:"center", gap:7,
      padding:"7px 16px", borderRadius:20, cursor:"pointer",
      background:`${color}18`, border:`1px solid ${color}40`,
      fontSize:14, color, fontWeight:600 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }} />
      {label}
    </div>
  );
}
function SBadge({ status }: { status: string }) {
  const M: Record<string, [string,string]> = {
    draft:  ["草稿","#475569"], locked:["鎖定","#3b82f6"],
    paid:   ["已付","#10b981"], pending:["待付","#f59e0b"],
    issued: ["已開","#10b981"], void:   ["已廢","#ef4444"],
  };
  const [label,color] = M[status] ?? [status,"#475569"];
  return <span style={{ fontSize:13, padding:"3px 10px", borderRadius:20,
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
              <th key={i} style={{ padding:"12px 16px", textAlign:"left" as const,
                fontSize:13, color:"#64748b", fontWeight:700,
                textTransform:"uppercase" as const, letterSpacing:"0.06em",
                borderBottom:"1px solid #1e293b" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length===0
            ? <tr><td colSpan={headers.length} style={{ padding:"36px",
                textAlign:"center" as const, color:"#475569", fontSize:14 }}>{empty}</td></tr>
            : rows.map((row:any[],i:number) => (
              <tr key={i} style={{ borderBottom:"1px solid #0c1523" }}>
                {row.map((cell:any,j:number) => (
                  <td key={j} style={{ padding:"12px 16px", fontSize:14, color:"#94a3b8" }}>{cell}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
function Btn({ children, color, textColor="#fff", disabled, onClick, size="md", style:sx }: any) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: size==="sm" ? "6px 14px" : "10px 20px",
      borderRadius:8, border:"none", background:color, color:textColor,
      fontSize: size==="sm" ? 13 : 14, fontWeight:700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, fontFamily:"inherit",
      transition:"opacity .15s", ...sx,
    }}>{children}</button>
  );
}

const S: Record<string, React.CSSProperties> = {
  root:    { display:"flex", flexDirection:"column", height:"100%",
             background:"#060d1a", color:"#e2e8f0",
             fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
             fontSize:15 },
  header:  { display:"flex", alignItems:"center", justifyContent:"space-between",
             padding:"0 28px", height:66, flexShrink:0,
             background:"#08111f", borderBottom:"1px solid #1e293b" },
  title:   { fontSize:20, fontWeight:900, letterSpacing:"0.03em", color:"#f8fafc" },
  sub:     { fontSize:13, color:"#475569", marginTop:3 },
  kpiRow:  { display:"grid", gridTemplateColumns:"repeat(5,1fr)",
             gap:1, background:"#1e293b", flexShrink:0 },
  tabBar:  { display:"flex", background:"#08111f",
             borderBottom:"1px solid #1e293b", flexShrink:0 },
  tab:     { padding:"13px 22px", fontSize:14, fontWeight:600,
             cursor:"pointer", transition:"color .15s" },
  content: { flex:1, overflowY:"auto", padding:"22px 28px" },
  grid2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 },
  card:    { background:"#08111f", border:"1px solid #1e293b",
             borderRadius:12, padding:"20px 24px" },
  overlay: { position:"fixed", inset:0, zIndex:500,
             background:"rgba(0,0,0,.7)", backdropFilter:"blur(6px)",
             display:"flex", alignItems:"center", justifyContent:"center" },
  modal:   { background:"#0d1626", border:"1px solid #1e293b", borderRadius:14,
             padding:28, width:"90%", maxWidth:420,
             boxShadow:"0 32px 80px rgba(0,0,0,.7)" },
  input:   { width:"100%", background:"#0a1628", border:"1px solid #1e293b",
             color:"#e2e8f0", padding:"10px 14px", borderRadius:8,
             fontSize:14, fontFamily:"inherit", boxSizing:"border-box" },
  pBtn:    { background:"#1e293b", color:"#94a3b8", border:"none",
             width:32, height:32, borderRadius:6, cursor:"pointer", fontSize:17 },
  pLabel:  { fontSize:16, fontWeight:700, color:"#e2e8f0",
             minWidth:110, textAlign:"center" },
  select:  { background:"#1e293b", color:"#e2e8f0", border:"1px solid #334155",
             borderRadius:8, padding:"8px 14px", fontSize:14, fontFamily:"inherit" },
};
