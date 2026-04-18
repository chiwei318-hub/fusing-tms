import { useState, useEffect } from "react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/logistics", "") + "/api-server/api";

interface PreviewRow {
  id: number; order_no: string; trip_date: string;
  customer_name: string; client_bill: number; driver_payout: number;
  profit: number; vehicle_type: string; status: string;
}
interface PreviewResult {
  ok: boolean; count: number;
  summary: { totalClientBill: number; totalDriverPay: number; totalProfit: number };
  rows: PreviewRow[];
  error?: string;
}
interface ConfigStatus { ok: boolean; hasCredentials: boolean; hasDefaultSheetId: boolean; defaultSheetId?: string; }

function money(v: number) { return `$${Number(v).toLocaleString("zh-TW")}`; }

export default function SheetsBackupTab() {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [sheetId, setSheetId]     = useState("");
  const [sheetTitle, setSheetTitle] = useState("財務備份");
  const [preview, setPreview]     = useState<PreviewResult | null>(null);
  const [config, setConfig]       = useState<ConfigStatus | null>(null);
  const [loading, setLoading]     = useState(false);
  const [backupResult, setBackupResult] = useState<{ ok: boolean; inserted?: number; error?: string } | null>(null);

  useEffect(() => {
    fetch(`${API}/sheets-export/config-status`).then(r => r.json()).then(setConfig).catch(console.error);
  }, []);

  async function handlePreview() {
    setLoading(true); setPreview(null); setBackupResult(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const res = await fetch(`${API}/sheets-export/preview?${params}`);
      setPreview(await res.json());
    } catch (e: any) { setPreview({ ok: false, count: 0, summary: { totalClientBill: 0, totalDriverPay: 0, totalProfit: 0 }, rows: [], error: e.message }); }
    setLoading(false);
  }

  async function handleBackup() {
    setLoading(true); setBackupResult(null);
    try {
      const body: Record<string, string> = { sheetTitle };
      if (from)    body.from    = from;
      if (to)      body.to      = to;
      if (sheetId) body.sheetId = sheetId;
      const res = await fetch(`${API}/sheets-export/backup`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setBackupResult(await res.json());
    } catch (e: any) { setBackupResult({ ok: false, error: e.message }); }
    setLoading(false);
  }

  const credOk = config?.hasCredentials;

  return (
    <div style={{ padding: "24px", maxWidth: 900 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Google Sheets 財務備份</h2>
      <p style={{ color: "#555", marginBottom: 24, fontSize: 14 }}>
        將已完成訂單的財務資料（日期、訂單號、客戶應付、司機應得、平台利潤）匯出至 Google 試算表，取代 <code>backup_to_sheets()</code> 手動腳本。
      </p>

      {/* ── 設定狀態提示 ── */}
      <div style={{ background: credOk ? "#f0fdf4" : "#fffbeb", border: `1px solid ${credOk ? "#86efac" : "#fcd34d"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 24 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: credOk ? "#15803d" : "#92400e" }}>
          {credOk ? "✅ Google 服務帳號憑證已設定" : "⚠️ 尚未設定 Google 服務帳號憑證"}
        </div>
        {!credOk && (
          <ol style={{ fontSize: 13, color: "#78350f", paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
            <li>至 Google Cloud Console → API 和服務 → 憑證 → 建立服務帳號</li>
            <li>下載 JSON 金鑰檔（<code>service_account.json</code>）</li>
            <li>將 JSON 全文貼入環境變數 <strong>GOOGLE_SHEETS_CREDENTIALS</strong></li>
            <li>把試算表的「編輯者」權限分享給服務帳號的 email</li>
            <li>（選用）將試算表 ID 設定為 <strong>GOOGLE_BACKUP_SHEET_ID</strong></li>
          </ol>
        )}
        {credOk && config?.hasDefaultSheetId && (
          <div style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>
            預設試算表 ID：<code>{config.defaultSheetId}</code>
          </div>
        )}
      </div>

      {/* ── 篩選條件 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
          起始日期（空白 = 不限）
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
          結束日期（空白 = 不限）
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 20 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
          試算表 ID（空白 = 使用環境變數預設值）
          <input value={sheetId} onChange={e => setSheetId(e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
          工作表名稱
          <input value={sheetTitle} onChange={e => setSheetTitle(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
        </label>
      </div>

      {/* ── 動作按鈕 ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button onClick={handlePreview} disabled={loading}
          style={{ padding: "10px 24px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {loading ? "讀取中…" : "🔍 預覽資料"}
        </button>
        <button onClick={handleBackup} disabled={loading || !credOk}
          title={!credOk ? "請先設定 GOOGLE_SHEETS_CREDENTIALS 環境變數" : ""}
          style={{ padding: "10px 24px", background: credOk ? "#16a34a" : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: credOk ? "pointer" : "not-allowed" }}>
          {loading ? "備份中…" : "☁️ 備份至 Google Sheets"}
        </button>
      </div>

      {/* ── 備份結果 ── */}
      {backupResult && (
        <div style={{ padding: "14px 18px", borderRadius: 10, marginBottom: 20, background: backupResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${backupResult.ok ? "#86efac" : "#fca5a5"}` }}>
          {backupResult.ok
            ? <span style={{ color: "#15803d", fontWeight: 600 }}>✅ 成功備份 {backupResult.inserted} 筆資料至工作表「{sheetTitle}」</span>
            : <span style={{ color: "#b91c1c", fontWeight: 600 }}>❌ 備份失敗：{backupResult.error}</span>
          }
        </div>
      )}

      {/* ── 預覽結果 ── */}
      {preview && preview.ok && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "客戶應付合計", val: preview.summary.totalClientBill, color: "#1d4ed8" },
              { label: "司機應得合計", val: preview.summary.totalDriverPay,  color: "#0f766e" },
              { label: "平台利潤合計", val: preview.summary.totalProfit,      color: "#7c3aed" },
            ].map(c => (
              <div key={c.label} style={{ padding: "16px 20px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{money(c.val)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
            共 <strong>{preview.count}</strong> 筆已完成訂單（前 20 筆預覽）
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["日期", "訂單號", "客戶名稱", "客戶應付", "司機應得", "平台利潤", "車型"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px" }}>{String(r.trip_date).slice(0, 10)}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.order_no}</td>
                    <td style={{ padding: "8px 12px" }}>{r.customer_name || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#1d4ed8" }}>{money(r.client_bill)}</td>
                    <td style={{ padding: "8px 12px", color: "#0f766e" }}>{money(r.driver_payout)}</td>
                    <td style={{ padding: "8px 12px", color: r.profit >= 0 ? "#7c3aed" : "#dc2626" }}>{money(r.profit)}</td>
                    <td style={{ padding: "8px 12px" }}>{r.vehicle_type || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {preview && !preview.ok && (
        <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#b91c1c" }}>
          ❌ {preview.error}
        </div>
      )}
    </div>
  );
}
