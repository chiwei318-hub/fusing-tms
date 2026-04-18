import { useState, useEffect } from "react";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface ConfigStatus { ok: boolean; hasCredentials: boolean; projectId?: string | null; }
interface PreviewRow { id: number; order_no: string; customer_name: string; total_fee: number; driver_payout: number; profit: number; status: string; created_at: string; }
interface PreviewResult { ok: boolean; count: number; rows: PreviewRow[]; error?: string; }
interface SyncResult { ok: boolean; synced?: number; message?: string; error?: string; }

function money(v: number) { return `$${Number(v).toLocaleString("zh-TW")}`; }
function statusLabel(s: string) {
  const m: Record<string, { text: string; color: string }> = {
    delivered: { text: "已送達", color: "#15803d" }, pending: { text: "待派車", color: "#92400e" },
    assigned:  { text: "已指派", color: "#1d4ed8" }, in_transit: { text: "運送中", color: "#7c3aed" },
    cancelled: { text: "已取消", color: "#6b7280" },
  };
  return m[s] ?? { text: s, color: "#374151" };
}

export default function FirebaseSyncTab() {
  const [config, setConfig]       = useState<ConfigStatus | null>(null);
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [mode, setMode]           = useState<"upsert" | "new_only">("upsert");
  const [preview, setPreview]     = useState<PreviewResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState<"bulk" | "how">("bulk");

  useEffect(() => {
    fetch(`${API}/firebase-sync/config-status`).then(r => r.json()).then(setConfig).catch(console.error);
  }, []);

  async function handlePreview() {
    setLoading(true); setPreview(null); setSyncResult(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const res = await fetch(`${API}/firebase-sync/preview?${params}`);
      setPreview(await res.json());
    } catch (e: any) { setPreview({ ok: false, count: 0, rows: [], error: e.message }); }
    setLoading(false);
  }

  async function handleSync() {
    setLoading(true); setSyncResult(null);
    try {
      const body: Record<string, unknown> = { mode };
      if (from) body.from = from;
      if (to)   body.to   = to;
      const res = await fetch(`${API}/firebase-sync/push`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setSyncResult(await res.json());
    } catch (e: any) { setSyncResult({ ok: false, error: e.message }); }
    setLoading(false);
  }

  const credOk = config?.hasCredentials;

  return (
    <div style={{ padding: "24px", maxWidth: 900 }}>
      {/* ── 標題 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>🔥</span>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Firebase 雲端金庫同步</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
            將派車單寫入 Firestore <code>orders</code> + <code>accounting</code> 兩個 collection，取代 <code>save_order_to_cloud()</code> 手動腳本
          </p>
        </div>
      </div>

      {/* ── 子分頁 ── */}
      <div style={{ display: "flex", gap: 4, margin: "16px 0", borderBottom: "2px solid #e5e7eb" }}>
        {([["bulk", "📤 批次同步"], ["how", "⚙️ 設定說明"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ padding: "8px 16px", fontWeight: tab === v ? 700 : 400, fontSize: 13, border: "none", background: "none", cursor: "pointer", borderBottom: tab === v ? "2px solid #f97316" : "2px solid transparent", color: tab === v ? "#ea580c" : "#64748b", marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "how" && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "20px 24px", lineHeight: 1.8 }}>
          <h3 style={{ margin: "0 0 12px", color: "#c2410c" }}>設定步驟</h3>
          <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, color: "#7c2d12" }}>
            <li>前往 <strong>Firebase Console</strong> → 選擇或建立專案</li>
            <li>專案設定 → 服務帳號 → 產生新的私密金鑰（下載 JSON）</li>
            <li>在本系統新增環境變數 <code style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 4 }}>FIREBASE_SERVICE_ACCOUNT</code>，值為 JSON 全文</li>
            <li>Firestore 資料庫 → 建立（測試模式或設定規則）</li>
            <li>回到此頁面，重新整理後即可使用</li>
          </ol>
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#fef9c3", borderRadius: 8, fontSize: 13 }}>
            <strong>寫入的 Firestore 結構：</strong>
            <pre style={{ margin: "8px 0 0", fontFamily: "monospace", fontSize: 12, color: "#1e293b" }}>{`orders/{order_no}
  ├── order_id, customer_name, status
  ├── total_fee, driver_payout, profit
  ├── created_at, completed_at, synced_at
  └── ...完整派車資訊

accounting/{order_no}_acc
  ├── order_id, client_name, amount
  ├── driver_payout, profit
  └── status: "pending_payout" | "payout_ready"`}</pre>
          </div>
        </div>
      )}

      {tab === "bulk" && (
        <>
          {/* ── 憑證狀態 ── */}
          <div style={{ background: credOk ? "#f0fdf4" : "#fffbeb", border: `1px solid ${credOk ? "#86efac" : "#fcd34d"}`, borderRadius: 10, padding: "12px 18px", marginBottom: 20 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: credOk ? "#15803d" : "#92400e" }}>
              {credOk
                ? `✅ Firebase 已連線${config?.projectId ? `（專案：${config.projectId}）` : ""}`
                : "⚠️ 尚未設定 FIREBASE_SERVICE_ACCOUNT 環境變數　→　切換至「設定說明」tab 查看步驟"
              }
            </span>
          </div>

          {/* ── 篩選與模式 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
              起始日期（空白 = 全部）
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
              結束日期（空白 = 全部）
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
              同步模式
              <select value={mode} onChange={e => setMode(e.target.value as "upsert" | "new_only")}
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff" }}>
                <option value="upsert">覆蓋更新（Upsert）</option>
                <option value="new_only">僅新增（不覆蓋）</option>
              </select>
            </label>
          </div>

          {/* ── 按鈕 ── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <button onClick={handlePreview} disabled={loading}
              style={{ padding: "10px 24px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              {loading ? "讀取中…" : "🔍 預覽訂單"}
            </button>
            <button onClick={handleSync} disabled={loading || !credOk}
              title={!credOk ? "請先設定 FIREBASE_SERVICE_ACCOUNT" : ""}
              style={{ padding: "10px 24px", background: credOk ? "#ea580c" : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: credOk ? "pointer" : "not-allowed" }}>
              {loading ? "同步中…" : "🔥 推送至 Firebase"}
            </button>
          </div>

          {/* ── 同步結果 ── */}
          {syncResult && (
            <div style={{ padding: "14px 18px", borderRadius: 10, marginBottom: 20, background: syncResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${syncResult.ok ? "#86efac" : "#fca5a5"}` }}>
              <span style={{ fontWeight: 600, color: syncResult.ok ? "#15803d" : "#b91c1c" }}>
                {syncResult.ok ? syncResult.message : `❌ 同步失敗：${syncResult.error}`}
              </span>
            </div>
          )}

          {/* ── 預覽表格 ── */}
          {preview && preview.ok && (
            <>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                共 <strong>{preview.count}</strong> 筆訂單符合條件（前 20 筆預覽）
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      {["訂單號", "客戶名稱", "客戶應付", "司機應得", "平台利潤", "狀態", "建立日期"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(r => {
                      const st = statusLabel(r.status);
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no}</td>
                          <td style={{ padding: "8px 12px" }}>{r.customer_name || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#1d4ed8" }}>{money(r.total_fee)}</td>
                          <td style={{ padding: "8px 12px", color: "#0f766e" }}>{money(r.driver_payout)}</td>
                          <td style={{ padding: "8px 12px", color: r.profit >= 0 ? "#7c3aed" : "#dc2626" }}>{money(r.profit)}</td>
                          <td style={{ padding: "8px 12px" }}><span style={{ background: "#f1f5f9", color: st.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{st.text}</span></td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{String(r.created_at).slice(0, 10)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {preview && !preview.ok && (
            <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#b91c1c" }}>
              ❌ {preview.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
