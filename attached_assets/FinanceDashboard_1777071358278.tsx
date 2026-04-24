/**
 * FinanceDashboard.tsx
 * 路徑：artifacts/logistics/src/pages/admin/FinanceDashboard.tsx
 *
 * 財務總覽：司機薪資 / 車隊應付 / 平台收支 / 扣繳憑單
 * 設計：深色工業風，數字優先，一頁看清所有錢的去向
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";

// ── API ──────────────────────────────────────────────────────
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

function toArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    for (const k of ["data", "items", "results", "rows"]) {
      if (Array.isArray((v as any)[k])) return (v as any)[k];
    }
  }
  return [];
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0;
}

// ── 型別 ─────────────────────────────────────────────────────
type Tab = "overview" | "payroll" | "fleet" | "tax";

interface DriverPayroll {
  id: number;
  driver_name: string;
  period: string;
  total_trips: number;
  gross_pay: number;
  withholding_tax: number;
  nhi_supplement: number;
  net_pay: number;
  status: "draft" | "locked" | "paid";
  paid_at?: string;
}

interface FleetPayable {
  id: number;
  fleet_name: string;
  period: string;
  gross_amount: number;
  withholding_tax: number;
  nhi_supplement: number;
  net_payable: number;
  status: "pending" | "paid";
  paid_at?: string;
}

interface LedgerSummary {
  period: string;
  total_revenue: number;
  total_cost: number;
  vat_output: number;
  vat_input: number;
  vat_payable: number;
  net_profit: number;
  income_tax_payable: number;
}

interface WithholdingCert {
  id: number;
  payee_name: string;
  payee_type: "driver" | "fleet";
  year: number;
  total_paid: number;
  total_withheld: number;
}

// ── 格式化工具 ────────────────────────────────────────────────
const fmt = (n: number) =>
  `$${Math.round(n).toLocaleString("zh-TW")}`;

const fmtPct = (a: number, b: number) =>
  b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";

// ── 主元件 ───────────────────────────────────────────────────
export default function FinanceDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [year, setYear] = useState(new Date().getFullYear());

  // ── 資料查詢 ─────────────────────────────────────────────────
  const { data: payrollRaw, isLoading: loadPayroll } = useQuery({
    queryKey: ["driver-payroll", period],
    queryFn: () => apiFetch(`/tax/driver-payroll?period=${period}`),
  });
  const payrolls: DriverPayroll[] = toArray(payrollRaw);

  const { data: previewRaw } = useQuery({
    queryKey: ["driver-payroll-preview", period],
    queryFn: () => apiFetch(`/tax/driver-payroll/preview?period=${period}`),
    enabled: tab === "payroll",
  });
  const preview: DriverPayroll[] = toArray(previewRaw);

  const { data: fleetRaw } = useQuery({
    queryKey: ["fleet-payables", period],
    queryFn: () => apiFetch(`/tax/fleet-payables?period=${period}`),
  });
  const fleetPayables: FleetPayable[] = toArray(fleetRaw);

  const { data: ledger } = useQuery<LedgerSummary>({
    queryKey: ["ledger-summary", period],
    queryFn: () => apiFetch(`/tax/ledger/summary?period=${period}`),
  });

  const { data: withholdingRaw } = useQuery({
    queryKey: ["withholding", year],
    queryFn: () => apiFetch(`/tax/withholding?year=${year}`),
    enabled: tab === "tax",
  });
  const withholdings: WithholdingCert[] = toArray(withholdingRaw);

  // ── Mutations ────────────────────────────────────────────────
  const generatePayroll = useMutation({
    mutationFn: () => apiFetch("/tax/driver-payroll/generate", {
      method: "POST",
      body: JSON.stringify({ period, overwrite: false }),
    }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["driver-payroll"] });
      toast({ title: `✅ 薪資單產生完成，共 ${d.count ?? 0} 筆` });
    },
    onError: (e: Error) => toast({ title: "產生失敗", description: e.message, variant: "destructive" }),
  });

  const calcFleet = useMutation({
    mutationFn: () => apiFetch("/tax/fleet-payables/calculate", {
      method: "POST",
      body: JSON.stringify({ period }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-payables"] });
      toast({ title: "✅ 車隊應付款計算完成" });
    },
  });

  const markPaid = useMutation({
    mutationFn: ({ type, id }: { type: "payroll" | "fleet"; id: number }) =>
      apiFetch(`/tax/${type === "payroll" ? "driver-payroll" : "fleet-payables"}/${id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [v.type === "payroll" ? "driver-payroll" : "fleet-payables"] });
      toast({ title: "✅ 已標記付款" });
    },
  });

  // ── 總覽計算 ─────────────────────────────────────────────────
  const totalPayroll   = payrolls.reduce((s, r) => s + toNum(r.net_pay), 0);
  const totalFleet     = fleetPayables.reduce((s, r) => s + toNum(r.net_payable), 0);
  const totalRevenue   = toNum(ledger?.total_revenue);
  const totalProfit    = toNum(ledger?.net_profit);
  const totalVat       = toNum(ledger?.vat_payable);
  const unpaidPayroll  = payrolls.filter(p => p.status !== "paid").length;
  const unpaidFleet    = fleetPayables.filter(f => f.status !== "paid").length;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={S.root}>

      {/* ══ Header ══════════════════════════════════════════════ */}
      <header style={S.header}>
        <div>
          <div style={S.title}>財務總覽</div>
          <div style={S.sub}>富詠運輸 · 帳務結算中心</div>
        </div>

        {/* 期間選擇 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={S.periodBtn}
            onClick={() => setPeriod(format(subMonths(new Date(period + "-01"), 1), "yyyy-MM"))}>
            ‹
          </button>
          <div style={S.periodLabel}>
            {format(new Date(period + "-01"), "yyyy年 M月", { locale: zhTW })}
          </div>
          <button style={S.periodBtn}
            onClick={() => setPeriod(format(new Date(period + "-01").setMonth(new Date(period + "-01").getMonth() + 1), "yyyy-MM"))}>
            ›
          </button>
        </div>
      </header>

      {/* ══ KPI 橫列 ══════════════════════════════════════════════ */}
      <div style={S.kpiRow}>
        <KpiCard label="本月營收" value={fmt(totalRevenue)} sub="含稅總額"
          color="#f59e0b" icon="💰" />
        <KpiCard label="平台毛利" value={fmt(totalProfit)}
          sub={`毛利率 ${fmtPct(totalProfit, totalRevenue)}`}
          color="#10b981" icon="📈" />
        <KpiCard label="應繳營業稅" value={fmt(totalVat)} sub="銷項－進項"
          color="#3b82f6" icon="🧾" />
        <KpiCard label="司機待付款" value={`${unpaidPayroll} 筆`}
          sub={`共 ${fmt(totalPayroll)}`}
          color={unpaidPayroll > 0 ? "#ef4444" : "#10b981"} icon="👷" />
        <KpiCard label="車隊待付款" value={`${unpaidFleet} 筆`}
          sub={`共 ${fmt(totalFleet)}`}
          color={unpaidFleet > 0 ? "#f97316" : "#10b981"} icon="🚛" />
      </div>

      {/* ══ Tab 列 ══════════════════════════════════════════════ */}
      <div style={S.tabBar}>
        {([
          { id: "overview", label: "📊 總覽" },
          { id: "payroll",  label: "👷 司機薪資" },
          { id: "fleet",    label: "🚛 車隊應付" },
          { id: "tax",      label: "🧾 扣繳憑單" },
        ] as { id: Tab; label: string }[]).map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            ...S.tab,
            color: tab === t.id ? "#f59e0b" : "#475569",
            borderBottom: `2px solid ${tab === t.id ? "#f59e0b" : "transparent"}`,
          }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ══ 內容區 ══════════════════════════════════════════════ */}
      <div style={S.content}>

        {/* ── 總覽 ───────────────────────────────────────────── */}
        {tab === "overview" && (
          <div style={S.grid2}>
            {/* 金流四層 */}
            <div style={S.card}>
              <CardTitle>💸 本月金流四層</CardTitle>
              <FlowRow label="客戶付款（含稅）" value={fmt(totalRevenue)} color="#f59e0b" />
              <FlowArrow />
              <FlowRow label="營業稅（5%）" value={`－${fmt(totalVat)}`} color="#94a3b8" small />
              <FlowRow label="司機成本" value={`－${fmt(totalPayroll)}`} color="#94a3b8" small />
              <FlowRow label="車隊成本" value={`－${fmt(totalFleet)}`} color="#94a3b8" small />
              <FlowArrow />
              <FlowRow label="平台淨利" value={fmt(totalProfit)} color="#10b981" bold />
              <div style={{ marginTop: 12, padding: "10px 12px", background: "#0a1628",
                borderRadius: 8, fontSize: 12, color: "#64748b" }}>
                預估營所稅（20%）：{fmt(toNum(ledger?.income_tax_payable))}
              </div>
            </div>

            {/* 稅務行事曆 */}
            <div style={S.card}>
              <CardTitle>📅 稅務行事曆</CardTitle>
              {[
                { date: "每月15日前", label: "薪資扣繳申報", color: "#f59e0b" },
                { date: "雙月25日前", label: "營業稅申報（401）", color: "#3b82f6" },
                { date: "次年1月底", label: "扣繳憑單申報", color: "#10b981" },
                { date: "次年5月底", label: "營利事業所得稅", color: "#8b5cf6" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", borderBottom: "1px solid #0f172a",
                }}>
                  <div style={{
                    width: 3, height: 32, borderRadius: 2,
                    background: item.color, flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
                      {item.date}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 待處理事項 */}
            <div style={{ ...S.card, gridColumn: "1 / -1" }}>
              <CardTitle>⚠️ 待處理事項</CardTitle>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {unpaidPayroll > 0 && (
                  <AlertChip color="#ef4444"
                    label={`${unpaidPayroll} 筆司機薪資未付（${fmt(totalPayroll)}）`}
                    onClick={() => setTab("payroll")} />
                )}
                {unpaidFleet > 0 && (
                  <AlertChip color="#f97316"
                    label={`${unpaidFleet} 筆車隊款項未付（${fmt(totalFleet)}）`}
                    onClick={() => setTab("fleet")} />
                )}
                {totalVat > 0 && (
                  <AlertChip color="#3b82f6"
                    label={`本期營業稅 ${fmt(totalVat)} 待申報`}
                    onClick={() => {}} />
                )}
                {unpaidPayroll === 0 && unpaidFleet === 0 && totalVat === 0 && (
                  <div style={{ fontSize: 13, color: "#10b981" }}>✅ 本期無待處理事項</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 司機薪資 ───────────────────────────────────────── */}
        {tab === "payroll" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Btn color="#6366f1"
                disabled={generatePayroll.isPending}
                onClick={() => generatePayroll.mutate()}>
                {generatePayroll.isPending ? "產生中…" : "⚡ 產生本月薪資單"}
              </Btn>
              <div style={{ fontSize: 12, color: "#475569", alignSelf: "center" }}>
                {payrolls.length > 0
                  ? `已產生 ${payrolls.length} 筆，待付 ${unpaidPayroll} 筆`
                  : "尚未產生，點擊右側按鈕試算"}
              </div>
            </div>

            {/* 試算預覽（若還沒產生） */}
            {payrolls.length === 0 && preview.length > 0 && (
              <div style={{ marginBottom: 16, padding: "10px 14px",
                background: "#1a2c1a", border: "1px solid #166534",
                borderRadius: 8, fontSize: 12, color: "#4ade80" }}>
                📋 試算結果：{preview.length} 位司機，合計 {fmt(preview.reduce((s, r) => s + toNum(r.net_pay), 0))}
              </div>
            )}

            <Table
              headers={["司機", "趟次", "應付", "扣繳", "健保補費", "實領", "狀態", "操作"]}
              rows={payrolls.map(p => [
                p.driver_name,
                String(p.total_trips),
                fmt(toNum(p.gross_pay)),
                fmt(toNum(p.withholding_tax)),
                fmt(toNum(p.nhi_supplement)),
                <strong style={{ color: "#f59e0b" }}>{fmt(toNum(p.net_pay))}</strong>,
                <StatusBadge status={p.status} />,
                p.status !== "paid" ? (
                  <Btn color="#064e3b" textColor="#4ade80" size="sm"
                    onClick={() => markPaid.mutate({ type: "payroll", id: p.id })}>
                    標記已付
                  </Btn>
                ) : (
                  <span style={{ fontSize: 11, color: "#334155" }}>
                    {p.paid_at ? format(new Date(p.paid_at), "M/d") : "—"}
                  </span>
                ),
              ])}
              empty="本月尚無薪資資料，請點「產生本月薪資單」"
            />
          </div>
        )}

        {/* ── 車隊應付 ───────────────────────────────────────── */}
        {tab === "fleet" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Btn color="#6366f1"
                disabled={calcFleet.isPending}
                onClick={() => calcFleet.mutate()}>
                {calcFleet.isPending ? "計算中…" : "⚡ 計算本月應付款"}
              </Btn>
            </div>

            <Table
              headers={["車隊", "應付金額", "扣繳(10%)", "健保補費", "實付金額", "狀態", "操作"]}
              rows={fleetPayables.map(f => [
                f.fleet_name,
                fmt(toNum(f.gross_amount)),
                fmt(toNum(f.withholding_tax)),
                fmt(toNum(f.nhi_supplement)),
                <strong style={{ color: "#f59e0b" }}>{fmt(toNum(f.net_payable))}</strong>,
                <StatusBadge status={f.status} />,
                f.status !== "paid" ? (
                  <Btn color="#064e3b" textColor="#4ade80" size="sm"
                    onClick={() => markPaid.mutate({ type: "fleet", id: f.id })}>
                    標記已付
                  </Btn>
                ) : (
                  <span style={{ fontSize: 11, color: "#334155" }}>
                    {f.paid_at ? format(new Date(f.paid_at), "M/d") : "—"}
                  </span>
                ),
              ])}
              empty="本月尚無車隊應付資料"
            />
          </div>
        )}

        {/* ── 扣繳憑單 ───────────────────────────────────────── */}
        {tab === "tax" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                style={{ ...S.select }}>
                {[2026, 2025, 2024].map(y => (
                  <option key={y} value={y}>{y} 年</option>
                ))}
              </select>
              <Btn color="#6366f1"
                onClick={() => apiFetch("/tax/withholding/generate", {
                  method: "POST",
                  body: JSON.stringify({ year }),
                }).then(() => {
                  qc.invalidateQueries({ queryKey: ["withholding"] });
                  toast({ title: "✅ 扣繳憑單產生完成" });
                })}>
                產生年度憑單
              </Btn>
            </div>

            <Table
              headers={["受款人", "類型", "全年付款", "全年扣繳", "實領金額", "扣繳率"]}
              rows={withholdings.map(w => [
                w.payee_name,
                w.payee_type === "driver" ? "🧑 司機" : "🏢 車隊",
                fmt(toNum(w.total_paid)),
                fmt(toNum(w.total_withheld)),
                fmt(toNum(w.total_paid) - toNum(w.total_withheld)),
                fmtPct(toNum(w.total_withheld), toNum(w.total_paid)),
              ])}
              empty="尚無扣繳憑單資料"
            />

            {/* 申報注意事項 */}
            <div style={{ marginTop: 16, padding: "14px 16px",
              background: "#0a1628", border: "1px solid #1e293b",
              borderRadius: 10, fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>
                📋 台灣扣繳法規提醒
              </div>
              <div>• 執行業務所得（9A）：月累計超過 NT$20,010 → 扣繳 10%</div>
              <div>• 二代健保補充保費：單次給付超過 NT$24,000 → 扣 2.11%</div>
              <div>• 車隊（公司戶）：扣繳 10%；有統編且非個人：1.9%</div>
              <div>• 每月15日前申報上月扣繳；次年1月底前開立憑單</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 子元件 ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: string;
}) {
  return (
    <div style={{
      background: "#08111f", border: "1px solid #1e293b",
      borderRadius: 12, padding: "16px 20px",
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: "#475569", textTransform: "uppercase",
          letterSpacing: "0.1em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #1e293b" }}>
      {children}
    </div>
  );
}

function FlowRow({ label, value, color, small, bold }: {
  label: string; value: string; color: string; small?: boolean; bold?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between",
      padding: small ? "4px 0" : "8px 0", alignItems: "center" }}>
      <span style={{ fontSize: small ? 12 : 13, color: small ? "#475569" : "#94a3b8" }}>
        {label}
      </span>
      <span style={{ fontSize: small ? 12 : 14, fontWeight: bold ? 900 : 600,
        color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div style={{ textAlign: "center", color: "#1e293b", fontSize: 16,
      margin: "4px 0", lineHeight: 1 }}>▼</div>
  );
}

function AlertChip({ label, color, onClick }: {
  label: string; color: string; onClick: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 20, cursor: "pointer",
      background: `${color}18`, border: `1px solid ${color}40`,
      fontSize: 12, color, fontWeight: 600,
      transition: "opacity .15s",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%",
        background: color, flexShrink: 0 }} />
      {label}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    draft:   { label: "草稿", color: "#475569" },
    locked:  { label: "鎖定", color: "#3b82f6" },
    paid:    { label: "已付", color: "#10b981" },
    pending: { label: "待付", color: "#f59e0b" },
  };
  const m = meta[status] ?? { label: status, color: "#475569" };
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20,
      background: `${m.color}18`, color: m.color, fontWeight: 700 }}>
      {m.label}
    </span>
  );
}

function Table({ headers, rows, empty }: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  empty: string;
}) {
  return (
    <div style={{ background: "#08111f", borderRadius: 12,
      border: "1px solid #1e293b", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#0a1628" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "10px 14px", textAlign: "left",
                fontSize: 11, color: "#475569", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em",
                borderBottom: "1px solid #1e293b" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length}
                style={{ padding: "32px", textAlign: "center",
                  color: "#334155", fontSize: 13 }}>
                {empty}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #0c1523" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "10px 14px",
                  fontSize: 13, color: "#94a3b8" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Btn({ children, color, textColor = "#fff", disabled, onClick, size = "md", style: sx }: {
  children: React.ReactNode; color: string; textColor?: string;
  disabled?: boolean; onClick?: () => void;
  size?: "sm" | "md"; style?: React.CSSProperties;
}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: size === "sm" ? "4px 10px" : "8px 16px",
      borderRadius: 8, border: "none",
      background: color, color: textColor,
      fontSize: size === "sm" ? 11 : 13, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, fontFamily: "inherit",
      transition: "opacity .15s", ...sx,
    }}>
      {children}
    </button>
  );
}

// ── 樣式 ─────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#060d1a", color: "#e2e8f0",
    fontFamily: "'Noto Sans TC','PingFang TC',sans-serif",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 24px", height: 58, flexShrink: 0,
    background: "#08111f", borderBottom: "1px solid #1e293b",
  },
  title: { fontSize: 15, fontWeight: 900, letterSpacing: "0.05em", color: "#f8fafc" },
  sub:   { fontSize: 11, color: "#334155", marginTop: 2 },
  kpiRow: {
    display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
    gap: 1, background: "#1e293b", flexShrink: 0,
  },
  tabBar: {
    display: "flex", background: "#08111f",
    borderBottom: "1px solid #1e293b", flexShrink: 0,
  },
  tab: {
    padding: "10px 20px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", transition: "color .15s",
  },
  content: {
    flex: 1, overflowY: "auto", padding: "20px 24px",
  },
  grid2: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
  },
  card: {
    background: "#08111f", border: "1px solid #1e293b",
    borderRadius: 12, padding: "16px 20px",
  },
  periodBtn: {
    background: "#1e293b", color: "#94a3b8", border: "none",
    width: 28, height: 28, borderRadius: 6,
    cursor: "pointer", fontSize: 16, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  periodLabel: {
    fontSize: 14, fontWeight: 700, color: "#e2e8f0",
    minWidth: 100, textAlign: "center",
  },
  select: {
    background: "#1e293b", color: "#e2e8f0",
    border: "1px solid #334155", borderRadius: 8,
    padding: "7px 12px", fontSize: 13,
    fontFamily: "inherit", cursor: "pointer",
  },
};
