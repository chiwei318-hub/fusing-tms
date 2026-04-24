/**
 * FinanceDashboard.tsx — 財務稅務總覽
 * 路徑：/finance
 * 設計哲學：與調度中心一致 — 深夜指揮中心工業風
 *
 * 四個分頁：
 *   📋 司機薪資  — 月結跑單費、扣繳、二代健保
 *   🏢 車隊應付  — 車隊應付帳款明細
 *   📊 平台收支  — 月度營收、營業稅申報
 *   📄 扣繳憑單  — 年度彙總
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── API ───────────────────────────────────────────────────────────────────────
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("auth-jwt") ?? localStorage.getItem("token") ?? "";
  return fetch(apiUrl(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
}

// ── 格式化 ────────────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
const fmtN = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("zh-TW");

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── 型別 ─────────────────────────────────────────────────────────────────────
interface PayrollRow {
  id?: number;
  driver_shopee_id: string;
  driver_name:      string | null;
  period:           string;
  total_trips:      number;
  gross_pay:        number;
  withholding_tax:  number;
  nhi_supplement:   number;
  net_pay:          number;
  paid_at?:         string | null;
  locked?:          boolean;
  withholding_applies?: boolean;
  nhi_applies?:         boolean;
}

interface PayrollSummary {
  driver_count:      number;
  total_gross:       number;
  total_withholding: number;
  total_nhi:         number;
  total_net:         number;
  locked_count?:     number;
  paid_count?:       number;
}

interface FleetPayable {
  id:              number;
  fleet_id:        number;
  fleet_name:      string;
  total_trips:     number;
  gross_amount:    number;
  withholding_tax: number;
  nhi_supplement:  number;
  net_payable:     number;
  has_tax_id:      boolean;
  paid_at?:        string | null;
  locked:          boolean;
}

interface LedgerLive {
  total_revenue: number;
  order_count:   number;
  vat_output:    number;
  net_revenue:   number;
}

interface LedgerSaved {
  period:             string;
  total_revenue:      number;
  total_cost:         number;
  vat_output:         number;
  vat_input:          number;
  vat_payable:        number;
  net_profit:         number;
  income_tax_payable: number;
}

type Tab = "payroll" | "fleet" | "ledger" | "withholding";

// ── 主元件 ────────────────────────────────────────────────────────────────────
export default function FinanceDashboard() {
  const { toast }  = useToast();
  const qc         = useQueryClient();
  const [tab, setTab]         = useState<Tab>("payroll");
  const [period, setPeriod]   = useState(currentPeriod());
  const [year, setYear]       = useState(new Date().getFullYear());
  const [closeVatInput, setCloseVatInput]   = useState("");
  const [closeTotalCost, setCloseTotalCost] = useState("");
  const [showClose, setShowClose]           = useState(false);

  // ── 司機薪資 queries ─────────────────────────────────────────────────────
  const payrollQ = useQuery({
    queryKey: ["tax-payroll", period],
    queryFn:  () => apiFetch(`/tax/driver-payroll?period=${period}`),
    enabled:  tab === "payroll",
  });
  const previewQ = useQuery({
    queryKey: ["tax-payroll-preview", period],
    queryFn:  () => apiFetch(`/tax/driver-payroll/preview?period=${period}`),
    enabled:  tab === "payroll",
    staleTime: 60_000,
  });
  const payroll: PayrollRow[]   = payrollQ.data?.payroll  ?? [];
  const preview: PayrollRow[]   = previewQ.data?.preview  ?? [];
  const pSummary: PayrollSummary = payrollQ.data?.summary ?? {};
  const pvTotal                  = previewQ.data?.total   ?? {};
  const hasGenerated = payroll.length > 0;

  // ── 車隊應付 query ───────────────────────────────────────────────────────
  const fleetQ = useQuery({
    queryKey: ["tax-fleet", period],
    queryFn:  () => apiFetch(`/tax/fleet-payables?period=${period}`),
    enabled:  tab === "fleet",
  });
  const fleetPayables: FleetPayable[] = fleetQ.data?.payables ?? [];
  const fleetSummary                  = fleetQ.data?.summary  ?? {};

  // ── 平台收支 query ───────────────────────────────────────────────────────
  const ledgerQ = useQuery({
    queryKey: ["tax-ledger", period],
    queryFn:  () => apiFetch(`/tax/ledger/summary?period=${period}`),
    enabled:  tab === "ledger",
  });
  const live:  LedgerLive   = ledgerQ.data?.live   ?? {};
  const saved: LedgerSaved  = ledgerQ.data?.saved  ?? null;

  // ── 扣繳憑單 query ───────────────────────────────────────────────────────
  const withholdingQ = useQuery({
    queryKey: ["tax-withholding", year],
    queryFn:  () => apiFetch(`/tax/withholding?year=${year}`),
    enabled:  tab === "withholding",
  });
  const certificates = withholdingQ.data?.certificates ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const generateMut = useMutation({
    mutationFn: () => apiFetch("/tax/driver-payroll/generate", {
      method: "POST",
      body: JSON.stringify({ period }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["tax-payroll", period] });
      toast({ title: `✅ 薪資單產生完成，共 ${d.generated} 筆` });
    },
    onError: (e: Error) => toast({ title: "產生失敗", description: e.message, variant: "destructive" }),
  });

  const calcFleetMut = useMutation({
    mutationFn: () => apiFetch("/tax/fleet-payables/calculate", {
      method: "POST",
      body: JSON.stringify({ period }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["tax-fleet", period] });
      toast({ title: `✅ 車隊應付計算完成，共 ${d.generated} 筆` });
    },
    onError: (e: Error) => toast({ title: "計算失敗", description: e.message, variant: "destructive" }),
  });

  const payDriverMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/tax/driver-payroll/${id}/pay`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax-payroll", period] }); toast({ title: "✅ 已標記付款" }); },
  });

  const payFleetMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/tax/fleet-payables/${id}/pay`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tax-fleet", period] }); toast({ title: "✅ 已標記付款" }); },
  });

  const closeLedgerMut = useMutation({
    mutationFn: () => apiFetch("/tax/ledger/close", {
      method: "POST",
      body: JSON.stringify({
        period,
        vatInput:   parseFloat(closeVatInput)   || 0,
        totalCost:  parseFloat(closeTotalCost)  || 0,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax-ledger", period] });
      setShowClose(false);
      toast({ title: "✅ 月帳已鎖定" });
    },
    onError: (e: Error) => toast({ title: "關帳失敗", description: e.message, variant: "destructive" }),
  });

  const genWithholdingMut = useMutation({
    mutationFn: () => apiFetch("/tax/withholding/generate", {
      method: "POST", body: JSON.stringify({ year }),
    }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["tax-withholding", year] }); toast({ title: `✅ 產生 ${d.generated} 張憑單` }); },
    onError: (e: Error) => toast({ title: "產生失敗", description: e.message, variant: "destructive" }),
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "payroll",     label: "📋 司機薪資" },
    { key: "fleet",       label: "🏢 車隊應付" },
    { key: "ledger",      label: "📊 平台收支" },
    { key: "withholding", label: "📄 扣繳憑單" },
  ];

  return (
    <div style={S.root}>

      {/* ── 頂部標題列 ───────────────────────────────────────────────────── */}
      <header style={S.header}>
        <div>
          <div style={S.title}>財務稅務總覽</div>
          <div style={S.sub}>富詠運輸 · 合規財務引擎</div>
        </div>

        {/* 期間選擇器 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tab !== "withholding" ? (
            <>
              <span style={{ fontSize: 11, color: "#475569" }}>期間</span>
              <input
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value)}
                style={S.picker}
              />
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: "#475569" }}>年度</span>
              <input
                type="number"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                min={2020} max={2099}
                style={{ ...S.picker, width: 80 }}
              />
            </>
          )}
        </div>
      </header>

      {/* ── 分頁選單 ─────────────────────────────────────────────────────── */}
      <nav style={S.nav}>
        {tabs.map(t => (
          <button key={t.key} style={{ ...S.navBtn, ...(tab === t.key ? S.navActive : {}) }}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── 內容區域 ─────────────────────────────────────────────────────── */}
      <div style={S.content}>

        {/* ════════════════ 司機薪資 ════════════════════════════════════════ */}
        {tab === "payroll" && (
          <div>
            {/* 摘要列 */}
            <div style={S.summaryRow}>
              <SummaryCard label="待命司機" value={fmtN(previewQ.data?.driver_count)} accent="#6366f1" />
              <SummaryCard label="跑單費合計" value={fmt(pvTotal.gross)}       accent="#f59e0b" />
              <SummaryCard label="應扣繳稅款" value={fmt(pvTotal.withholding)} accent="#ef4444" />
              <SummaryCard label="二代健保"   value={fmt(pvTotal.nhi)}         accent="#f97316" />
              <SummaryCard label="實領合計"   value={fmt(pvTotal.net)}         accent="#10b981" />
            </div>

            {/* 操作列 */}
            <div style={S.actionRow}>
              <Chip color="#1e293b" text="#64748b">
                {period} · {previewQ.data?.driver_count ?? 0} 位司機
              </Chip>
              <div style={{ flex: 1 }} />
              {hasGenerated && (
                <Chip color="#0d2616" text="#4ade80">
                  已產生 {payroll.length} 筆 · 已付 {pSummary.paid_count ?? 0}
                </Chip>
              )}
              <Btn
                color="#312e81"
                disabled={generateMut.isPending || (previewQ.data?.driver_count ?? 0) === 0}
                onClick={() => generateMut.mutate()}
              >
                {generateMut.isPending ? "計算中…" : hasGenerated ? "重新產生" : "📋 產生薪資單"}
              </Btn>
            </div>

            {/* 試算表（preview）vs 正式表（payroll） */}
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["司機", "Shopee ID", "趟次", "跑單費", "扣繳(10%)", "二代健保", "實領", "狀態", ""].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(hasGenerated ? payroll : preview).map((r, i) => (
                    <tr key={r.driver_shopee_id ?? i} style={i % 2 === 0 ? S.rowEven : {}}>
                      <Td>{r.driver_name ?? <span style={{ color: "#475569" }}>未知</span>}</Td>
                      <Td muted>{r.driver_shopee_id}</Td>
                      <Td>{r.total_trips}</Td>
                      <Td accent>{fmt(r.gross_pay)}</Td>
                      <Td red={r.withholding_applies || (r.withholding_tax ?? 0) > 0}>
                        {(r.withholding_tax ?? 0) > 0 ? fmt(r.withholding_tax) : "—"}
                      </Td>
                      <Td red={(r.nhi_supplement ?? 0) > 0}>
                        {(r.nhi_supplement ?? 0) > 0 ? fmt(r.nhi_supplement) : "—"}
                      </Td>
                      <Td green>{fmt(r.net_pay)}</Td>
                      <Td>
                        {hasGenerated
                          ? r.paid_at
                            ? <Tag color="#10b981">已付款</Tag>
                            : r.locked
                              ? <Tag color="#f59e0b">已鎖定</Tag>
                              : <Tag color="#475569">待付款</Tag>
                          : <Tag color="#334155">試算</Tag>
                        }
                      </Td>
                      <td style={{ padding: "10px 8px" }}>
                        {hasGenerated && r.id && !r.paid_at && (
                          <Btn color="#0d2616" textColor="#4ade80"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            disabled={payDriverMut.isPending}
                            onClick={() => payDriverMut.mutate(r.id!)}>
                            付款
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(hasGenerated ? payroll : preview).length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#334155", fontSize: 12 }}>
                      {payrollQ.isLoading || previewQ.isLoading ? "載入中…" : "本期無資料"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {!hasGenerated && (previewQ.data?.driver_count ?? 0) > 0 && (
              <div style={{ fontSize: 11, color: "#475569", padding: "8px 0", textAlign: "right" }}>
                ↑ 以上為試算預覽，點擊「產生薪資單」後正式寫入並可標記付款
              </div>
            )}
          </div>
        )}

        {/* ════════════════ 車隊應付 ════════════════════════════════════════ */}
        {tab === "fleet" && (
          <div>
            <div style={S.summaryRow}>
              <SummaryCard label="車隊數"     value={fmtN(fleetSummary.fleet_count)} accent="#6366f1" />
              <SummaryCard label="應付總額"   value={fmt(fleetSummary.total_gross)}  accent="#f59e0b" />
              <SummaryCard label="應扣繳"     value={fmt(fleetSummary.total_withholding)} accent="#ef4444" />
              <SummaryCard label="實付合計"   value={fmt(fleetSummary.total_net)}    accent="#10b981" />
              <SummaryCard label="已付款"     value={fmtN(fleetSummary.paid_count)}  accent="#22d3ee" />
            </div>

            <div style={S.actionRow}>
              <Chip color="#1e293b" text="#64748b">{period}</Chip>
              <div style={{ flex: 1 }} />
              <Btn color="#312e81" disabled={calcFleetMut.isPending}
                onClick={() => calcFleetMut.mutate()}>
                {calcFleetMut.isPending ? "計算中…" : "🏢 計算本期應付"}
              </Btn>
            </div>

            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["車隊", "趟次", "應付金額", "扣繳方式", "扣繳稅款", "二代健保", "實付", "統編", "狀態", ""].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fleetPayables.map((r, i) => (
                    <tr key={r.id} style={i % 2 === 0 ? S.rowEven : {}}>
                      <Td>{r.fleet_name}</Td>
                      <Td>{r.total_trips}</Td>
                      <Td accent>{fmt(r.gross_amount)}</Td>
                      <Td muted>{r.has_tax_id ? "1.9%（有統編）" : "10%（公司戶）"}</Td>
                      <Td red={r.withholding_tax > 0}>{fmt(r.withholding_tax)}</Td>
                      <Td red={r.nhi_supplement > 0}>{r.nhi_supplement > 0 ? fmt(r.nhi_supplement) : "—"}</Td>
                      <Td green>{fmt(r.net_payable)}</Td>
                      <Td>{r.has_tax_id ? <Tag color="#22d3ee">有統編</Tag> : <Tag color="#475569">無</Tag>}</Td>
                      <Td>{r.paid_at ? <Tag color="#10b981">已付</Tag> : r.locked ? <Tag color="#f59e0b">鎖定</Tag> : <Tag color="#475569">待付</Tag>}</Td>
                      <td style={{ padding: "10px 8px" }}>
                        {!r.paid_at && (
                          <Btn color="#0d2616" textColor="#4ade80"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            disabled={payFleetMut.isPending}
                            onClick={() => payFleetMut.mutate(r.id)}>
                            付款
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                  {fleetPayables.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#334155", fontSize: 12 }}>
                      {fleetQ.isLoading ? "載入中…" : "本期無資料，請先執行「計算本期應付」"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════ 平台收支 ════════════════════════════════════════ */}
        {tab === "ledger" && (
          <div>
            <div style={S.summaryRow}>
              <SummaryCard label="本月營收"   value={fmt(live.total_revenue)} accent="#f59e0b" />
              <SummaryCard label="訂單數"     value={fmtN(live.order_count)}  accent="#6366f1" />
              <SummaryCard label="銷項稅額"   value={fmt(live.vat_output)}    accent="#ef4444" />
              <SummaryCard label="不含稅收入" value={fmt(live.net_revenue)}   accent="#10b981" />
              <SummaryCard label="鎖帳狀態"   value={saved ? "已關帳" : "未關帳"} accent={saved ? "#10b981" : "#f59e0b"} />
            </div>

            <div style={S.actionRow}>
              <Chip color="#1e293b" text="#64748b">{period}</Chip>
              <div style={{ flex: 1 }} />
              {!showClose
                ? <Btn color="#312e81" onClick={() => setShowClose(true)}>📊 關帳 / 鎖定月帳</Btn>
                : <Btn color="#1e293b" textColor="#64748b" onClick={() => setShowClose(false)}>取消</Btn>
              }
            </div>

            {showClose && (
              <div style={S.closePanel}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc", marginBottom: 12 }}>關帳設定 — {period}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b" }}>進項稅額（成本發票可抵減）</label>
                    <input value={closeVatInput} onChange={e => setCloseVatInput(e.target.value)}
                      placeholder="0" style={S.input} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#64748b" }}>本月總成本（含車隊、人力…）</label>
                    <input value={closeTotalCost} onChange={e => setCloseTotalCost(e.target.value)}
                      placeholder="0" style={S.input} />
                  </div>
                </div>
                <Btn color="#4f46e5" disabled={closeLedgerMut.isPending} onClick={() => closeLedgerMut.mutate()}>
                  {closeLedgerMut.isPending ? "關帳中…" : "確認關帳"}
                </Btn>
              </div>
            )}

            {/* 雙欄：即時試算 vs 已鎖定帳本 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <LedgerCard title="即時試算" badge="未鎖定" badgeColor="#f59e0b">
                <LedgerRow label="本月含稅收入"  value={fmt(live.total_revenue)} />
                <LedgerRow label="銷項稅額(5%)"  value={fmt(live.vat_output)} red />
                <LedgerRow label="不含稅淨收入"  value={fmt(live.net_revenue)} accent />
                <div style={{ borderTop: "1px solid #1e293b", margin: "10px 0" }} />
                <div style={{ fontSize: 11, color: "#475569" }}>
                  ⚠ 進項稅額需手動輸入（請對照成本發票），點擊「關帳」填入後鎖定
                </div>
              </LedgerCard>

              <LedgerCard title="已鎖定帳本" badge={saved ? "已關帳" : "未關帳"} badgeColor={saved ? "#10b981" : "#334155"}>
                {saved ? <>
                  <LedgerRow label="含稅收入"        value={fmt(saved.total_revenue)} />
                  <LedgerRow label="總成本"           value={fmt(saved.total_cost)} red />
                  <LedgerRow label="銷項稅額"         value={fmt(saved.vat_output)} red />
                  <LedgerRow label="進項稅額（抵減）" value={fmt(saved.vat_input)} />
                  <LedgerRow label="應繳營業稅"       value={fmt(saved.vat_payable)} red />
                  <div style={{ borderTop: "1px solid #1e293b", margin: "10px 0" }} />
                  <LedgerRow label="淨利潤"     value={fmt(saved.net_profit)} accent />
                  <LedgerRow label="應繳營所稅(20%)" value={fmt(saved.income_tax_payable)} red />
                </> : (
                  <div style={{ fontSize: 12, color: "#334155", paddingTop: 12 }}>本期尚未關帳</div>
                )}
              </LedgerCard>
            </div>
          </div>
        )}

        {/* ════════════════ 扣繳憑單 ════════════════════════════════════════ */}
        {tab === "withholding" && (
          <div>
            <div style={S.summaryRow}>
              <SummaryCard label="憑單數"   value={fmtN(certificates.length)} accent="#6366f1" />
              <SummaryCard label="司機憑單" value={fmtN(certificates.filter((c: any) => c.payee_type === "driver").length)} accent="#f59e0b" />
              <SummaryCard label="車隊憑單" value={fmtN(certificates.filter((c: any) => c.payee_type === "fleet").length)}  accent="#22d3ee" />
              <SummaryCard label="總扣繳額"
                value={fmt(certificates.reduce((s: number, c: any) => s + Number(c.total_withheld ?? 0), 0))}
                accent="#ef4444" />
            </div>

            <div style={S.actionRow}>
              <Chip color="#1e293b" text="#64748b">{year} 年度</Chip>
              <div style={{ flex: 1 }} />
              <Btn color="#312e81" disabled={genWithholdingMut.isPending}
                onClick={() => genWithholdingMut.mutate()}>
                {genWithholdingMut.isPending ? "彙總中…" : "📄 產生年度憑單"}
              </Btn>
            </div>

            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["類型", "ID", "姓名 / 車隊", "年度", "給付總額", "扣繳稅額", "憑單號碼", "簽發日"].map(h => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((c: any, i: number) => (
                    <tr key={c.id} style={i % 2 === 0 ? S.rowEven : {}}>
                      <Td>
                        <Tag color={c.payee_type === "driver" ? "#312e81" : "#0c2a4a"}>
                          {c.payee_type === "driver" ? "司機" : "車隊"}
                        </Tag>
                      </Td>
                      <Td muted>{c.payee_id}</Td>
                      <Td>{c.payee_name ?? "—"}</Td>
                      <Td>{c.year}</Td>
                      <Td accent>{fmt(c.total_paid)}</Td>
                      <Td red={c.total_withheld > 0}>{fmt(c.total_withheld)}</Td>
                      <Td muted>{c.certificate_no ?? "—"}</Td>
                      <Td muted>{c.issued_at ? new Date(c.issued_at).toLocaleDateString("zh-TW") : "—"}</Td>
                    </tr>
                  ))}
                  {certificates.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#334155", fontSize: 12 }}>
                      {withholdingQ.isLoading ? "載入中…" : `${year} 年度尚無扣繳憑單，請先執行「產生年度憑單」`}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes finance-glow {
          0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,.2); }
          50%      { box-shadow: 0 0 0 4px rgba(99,102,241,.06); }
        }
      `}</style>
    </div>
  );
}

// ── 小元件 ────────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: "#08111f", border: "1px solid #1e293b", borderRadius: 10,
      padding: "14px 18px", flex: 1, borderTop: `2px solid ${accent}22`,
    }}>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function LedgerCard({ title, badge, badgeColor, children }: {
  title: string; badge: string; badgeColor: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#08111f", border: "1px solid #1e293b", borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>{title}</span>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
          background: `${badgeColor}22`, color: badgeColor,
        }}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

function LedgerRow({ label, value, red, accent }: { label: string; value: string; red?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #0c1523" }}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: red ? "#ef4444" : accent ? "#f59e0b" : "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700,
      color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em",
      background: "#0a1628", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap",
    }}>{children}</th>
  );
}

function Td({ children, muted, accent, red, green }: {
  children: React.ReactNode; muted?: boolean; accent?: boolean; red?: boolean; green?: boolean;
}) {
  const color = red ? "#ef4444" : green ? "#4ade80" : accent ? "#f59e0b" : muted ? "#475569" : "#e2e8f0";
  return (
    <td style={{
      padding: "10px 12px", fontSize: 12, color,
      fontWeight: accent || green ? 700 : 400,
      fontVariantNumeric: "tabular-nums",
      borderBottom: "1px solid #0c1523",
      whiteSpace: "nowrap",
    }}>{children}</td>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700,
      background: `${color}22`, color,
    }}>{children}</span>
  );
}

function Chip({ children, color, text }: { children: React.ReactNode; color: string; text: string }) {
  return (
    <span style={{
      fontSize: 11, padding: "5px 12px", borderRadius: 6,
      background: color, color: text, fontWeight: 600,
    }}>{children}</span>
  );
}

function Btn({ children, color, textColor = "#fff", disabled, onClick, style }: {
  children: React.ReactNode; color: string; textColor?: string;
  disabled?: boolean; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: "7px 16px", borderRadius: 8, border: "none",
      background: color, color: textColor, fontSize: 12, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
      fontFamily: "inherit", transition: "opacity .15s", ...style,
    }}>{children}</button>
  );
}

// ── 樣式 ──────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100%", minHeight: "100vh",
    background: "#060d1a", color: "#e2e8f0",
    fontFamily: "'Noto Sans TC','PingFang TC',system-ui,sans-serif",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 58, flexShrink: 0,
    background: "#08111f", borderBottom: "1px solid #1e293b",
  },
  title: { fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", color: "#f8fafc" },
  sub:   { fontSize: 11, color: "#334155", marginTop: 2 },
  picker: {
    background: "#0d1626", border: "1px solid #1e293b", borderRadius: 7,
    padding: "5px 10px", color: "#94a3b8", fontSize: 12, fontFamily: "inherit",
    outline: "none",
  },
  nav: {
    display: "flex", gap: 2, padding: "0 24px",
    background: "#08111f", borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  navBtn: {
    padding: "10px 18px", border: "none", background: "transparent",
    color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer",
    borderBottom: "2px solid transparent", transition: "all .15s",
    fontFamily: "inherit",
  },
  navActive: { color: "#6366f1", borderBottomColor: "#6366f1" },
  content: { flex: 1, overflowY: "auto", padding: 24 },
  summaryRow: { display: "flex", gap: 12, marginBottom: 16 },
  actionRow: {
    display: "flex", alignItems: "center", gap: 10,
    marginBottom: 14, flexWrap: "wrap",
  },
  tableWrap: {
    overflowX: "auto", borderRadius: 10,
    border: "1px solid #1e293b", background: "#08111f",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  rowEven: { background: "#050b17" },
  closePanel: {
    background: "#0d1626", border: "1px solid #1e293b",
    borderRadius: 10, padding: 18, marginBottom: 16,
  },
  input: {
    display: "block", width: "100%", marginTop: 6,
    background: "#060d1a", border: "1px solid #1e293b", borderRadius: 7,
    padding: "7px 10px", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit",
    outline: "none",
  },
};
