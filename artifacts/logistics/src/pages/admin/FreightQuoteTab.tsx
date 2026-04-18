import { useState, useEffect } from "react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "").replace("/logistics", "") + "/api-server/api";

// ─── 型別 ────────────────────────────────────────────────────────────────────
interface RateConfig { id: number; car_type: string; label: string; base_price: number; km_rate: number; car_multiplier: number; platform_pct: number; driver_pct: number; active: boolean; }
interface SurchargeConfig { id: number; key: string; label: string; amount: number; pct_multiplier: number; description: string; active: boolean; }
interface Config { ok: boolean; rates: RateConfig[]; surcharges: SurchargeConfig[]; googleMapsAvailable: boolean; error?: string; }

interface QuoteResult {
  ok: boolean; error?: string;
  quote?: { total_quote: number; driver_payout: number; your_profit: number; platform_pct: number; driver_pct: number; };
  breakdown?: {
    base_price: number; distance_km: number; km_rate: number; distance_fee: number;
    car_label: string; car_multiplier: number; has_elevator: boolean;
    remote_area: string | null; remote_multiplier: number;
    surcharges: { key: string; label: string; amount: number; pct: number }[];
    pct_surcharge_added: number;
  };
  distance_source?: string; duration_min?: number | null;
}

// ─── 工具函式 ────────────────────────────────────────────────────────────────
function money(v: number) { return `$${Number(v).toLocaleString("zh-TW")}`; }

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export default function FreightQuoteTab() {
  const [config, setConfig]   = useState<Config | null>(null);
  const [viewTab, setViewTab] = useState<"calc" | "rates" | "surcharges">("calc");
  const [loading, setLoading] = useState(false);

  // ── 計算機狀態
  const [pickup,      setPickup]      = useState("");
  const [delivery,    setDelivery]    = useState("");
  const [carType,     setCarType]     = useState("3.5t");
  const [hasElevator, setHasElevator] = useState(true);
  const [services,    setServices]    = useState<Record<string, number | boolean>>({});
  const [result,      setResult]      = useState<QuoteResult | null>(null);

  // ── 費率編輯
  const [editingRate, setEditingRate] = useState<RateConfig | null>(null);
  const [editingSurcharge, setEditingSurcharge] = useState<SurchargeConfig | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      const r = await fetch(`${API}/freight-quote/config`);
      setConfig(await r.json());
    } catch { setConfig({ ok: false, rates: [], surcharges: [], googleMapsAvailable: false, error: "無法連線至後端" }); }
  }

  async function handleCalculate() {
    if (!pickup || !delivery) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API}/freight-quote/calculate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickup_address: pickup, delivery_address: delivery, car_type: carType, has_elevator: hasElevator, services }),
      });
      setResult(await res.json());
    } catch (e: any) { setResult({ ok: false, error: e.message }); }
    setLoading(false);
  }

  async function saveRate(rate: RateConfig) {
    setSavingId(`rate-${rate.id}`);
    await fetch(`${API}/freight-quote/config/rate/${rate.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rate),
    });
    setSavingId(null); setEditingRate(null); loadConfig();
  }

  async function saveSurcharge(s: SurchargeConfig) {
    setSavingId(`sc-${s.id}`);
    await fetch(`${API}/freight-quote/config/surcharge/${s.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
    });
    setSavingId(null); setEditingSurcharge(null); loadConfig();
  }

  function toggleService(key: string, qty?: number) {
    setServices(prev => {
      const cur = prev[key];
      if (qty !== undefined) return { ...prev, [key]: qty };
      return { ...prev, [key]: !cur };
    });
  }

  const rates = config?.rates ?? [];
  const surcharges = config?.surcharges ?? [];

  return (
    <div style={{ padding: "24px", maxWidth: 960 }}>
      {/* ── 標題 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 28 }}>🚚</span>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>台灣貨運報價計算機</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
            計算路線費用・偏遠加成・附加服務・財務分帳，取代 <code>calculate_taiwan_freight()</code> 腳本
          </p>
        </div>
      </div>

      {/* Google Maps 狀態提示 */}
      {config && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px", borderRadius: 20, marginBottom: 16, marginTop: 8, background: config.googleMapsAvailable ? "#f0fdf4" : "#fffbeb", color: config.googleMapsAvailable ? "#15803d" : "#92400e", border: `1px solid ${config.googleMapsAvailable ? "#86efac" : "#fcd34d"}` }}>
          {config.googleMapsAvailable ? "✅ Google Maps 已啟用（精準里程）" : "⚠️ 未設定 GOOGLE_MAPS_API_KEY，使用 Haversine 直線距離估算"}
        </div>
      )}

      {/* ── 分頁按鈕 ── */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #e5e7eb", marginBottom: 20 }}>
        {([["calc", "💰 即時報價"], ["rates", "🚛 車型費率"], ["surcharges", "➕ 附加服務"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setViewTab(v)}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: viewTab === v ? 700 : 400, border: "none", background: "none", cursor: "pointer", color: viewTab === v ? "#2563eb" : "#64748b", borderBottom: viewTab === v ? "2px solid #2563eb" : "2px solid transparent", marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ 即時報價 tab ══════════════ */}
      {viewTab === "calc" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* 左：輸入 */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                📦 取貨地址
                <input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="例：台北市內湖區瑞光路 xxx 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                📍 送達地址
                <input value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="例：台東市中華路一段 xxx 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
                🚛 車型
                <select value={carType} onChange={e => setCarType(e.target.value)}
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff" }}>
                  {rates.filter(r => r.active).map(r => (
                    <option key={r.car_type} value={r.car_type}>
                      {r.label}（起步 {money(r.base_price)} / 每公里 ${r.km_rate}）
                    </option>
                  ))}
                </select>
              </label>

              {/* 電梯/樓梯 開關（對應 get_quote_engine has_elevator） */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: hasElevator ? "#f0fdf4" : "#fef9c3", borderRadius: 10, border: `1px solid ${hasElevator ? "#bbf7d0" : "#fde68a"}` }}>
                <span style={{ fontSize: 18 }}>{hasElevator ? "🛗" : "🪜"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>目的地{hasElevator ? "有電梯" : "無電梯（搬樓梯費 +$500）"}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>對應 Python: has_elevator = {hasElevator ? "True" : "False"}</div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                  <span style={{ color: "#6b7280" }}>無</span>
                  <div style={{ position: "relative", width: 40, height: 22 }} onClick={() => setHasElevator(!hasElevator)}>
                    <div style={{ width: 40, height: 22, borderRadius: 11, background: hasElevator ? "#16a34a" : "#d1d5db", transition: "background 0.2s", cursor: "pointer" }} />
                    <div style={{ position: "absolute", top: 3, left: hasElevator ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                  </div>
                  <span style={{ color: "#374151" }}>有</span>
                </label>
              </div>

              {/* 附加服務選單 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>其他附加服務</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {surcharges.filter(s => s.active && s.key !== "no_elevator").map(s => {
                    const checked = !!services[s.key];
                    const isQty = s.key === "upstairs" || s.key === "wait_over30";
                    return (
                      <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleService(s.key, isQty && !checked ? 1 : undefined)}
                          style={{ width: 16, height: 16 }} />
                        <span style={{ flex: 1 }}>
                          {s.label}
                          <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>
                            {s.amount > 0 ? `+${money(s.amount)}` : ""}{s.pct_multiplier > 0 ? ` +${Math.round(s.pct_multiplier * 100)}%` : ""}
                          </span>
                        </span>
                        {isQty && checked && (
                          <input type="number" min={1} max={20} value={Number(services[s.key]) || 1}
                            onChange={e => toggleService(s.key, Number(e.target.value))}
                            style={{ width: 52, padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }} />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <button onClick={handleCalculate} disabled={loading || !pickup || !delivery}
                style={{ padding: "12px 0", background: pickup && delivery ? "#2563eb" : "#9ca3af", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: pickup && delivery ? "pointer" : "not-allowed" }}>
                {loading ? "計算中…" : "💰 立即計算報價"}
              </button>
            </div>
          </div>

          {/* 右：結果 */}
          <div>
            {result?.ok && result.quote && result.breakdown && (
              <div>
                {/* 報價總覽 */}
                <div style={{ background: "linear-gradient(135deg,#1e40af,#2563eb)", borderRadius: 14, padding: "20px 24px", color: "#fff", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{result.breakdown.car_label} · {result.breakdown.distance_km} km · {result.distance_source === "google" ? "Google Maps" : "估算里程"}</div>
                  <div style={{ fontSize: 36, fontWeight: 800 }}>{money(result.quote.total_quote)}</div>
                  <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
                    {result.duration_min ? `預計行車 ${result.duration_min} 分鐘` : ""}
                  </div>
                </div>

                {/* 財務分帳 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: "#fef3c7", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "#92400e" }}>老闆利潤（{result.quote.platform_pct}%）</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#92400e" }}>{money(result.quote.your_profit)}</div>
                  </div>
                  <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 12, color: "#15803d" }}>司機/加盟（{result.quote.driver_pct}%）</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#15803d" }}>{money(result.quote.driver_payout)}</div>
                  </div>
                </div>

                {/* 費用明細 */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, color: "#374151" }}>費用明細</div>
                  {[
                    { label: `起步費（${result.breakdown.car_label}）`, value: money(result.breakdown.base_price) },
                    { label: `里程費（${result.breakdown.distance_km}km × $${result.breakdown.km_rate}）`, value: money(result.breakdown.distance_fee) },
                    ...(result.breakdown.car_multiplier !== 1 ? [{
                      label: `車型係數（${result.breakdown.car_label} ×${result.breakdown.car_multiplier}）`,
                      value: `×${result.breakdown.car_multiplier}`, highlight: false, accent: true
                    }] : []),
                    ...(result.breakdown.remote_area ? [{
                      label: `偏遠加成（${result.breakdown.remote_area} ×${result.breakdown.remote_multiplier}）`,
                      value: `×${result.breakdown.remote_multiplier}`, highlight: true
                    }] : []),
                    ...(!result.breakdown.has_elevator ? [{
                      label: "無電梯搬樓梯費", value: "+$500", highlight: false
                    }] : []),
                    ...result.breakdown.surcharges
                      .filter(s => s.key !== "no_elevator")
                      .map(s => ({
                        label: s.label,
                        value: s.amount > 0 ? `+${money(s.amount)}` : `+${s.pct}%`
                      })),
                  ].map((row, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9", color: (row as any).highlight ? "#dc2626" : "#374151" }}>
                      <span>{row.label}</span>
                      <span style={{ fontWeight: 600 }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontWeight: 700, fontSize: 15, color: "#1e293b" }}>
                    <span>報價總計</span>
                    <span>{money(result.quote.total_quote)}</span>
                  </div>
                </div>
              </div>
            )}
            {result && !result.ok && (
              <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#b91c1c" }}>
                ❌ {result.error}
              </div>
            )}
            {!result && (
              <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14, border: "2px dashed #e2e8f0", borderRadius: 14 }}>
                輸入取貨和送達地址<br />按下「立即計算報價」查看結果
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ 車型費率 tab ══════════════ */}
      {viewTab === "rates" && (
        <div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            調整各車型的起步價、每公里費率、車型係數（×整體費用）和財務分帳比例。
            <span style={{ background: "#fef9c3", padding: "2px 8px", borderRadius: 6, marginLeft: 8, fontSize: 12 }}>車型係數 = Python 的 <code>car_multiplier</code></span>
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["車型代碼", "名稱", "起步價($)", "每公里費($)", "車型係數×", "老闆利潤(%)", "司機(%)", "啟用", "操作"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rates.map(r => {
                  const isEdit = editingRate?.id === r.id;
                  const ed = isEdit ? editingRate! : r;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", background: isEdit ? "#eff6ff" : "transparent" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64748b" }}>{r.car_type}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input value={ed.label} onChange={e => setEditingRate({ ...ed, label: e.target.value })} style={inputStyle} /> : r.label}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input type="number" value={ed.base_price} onChange={e => setEditingRate({ ...ed, base_price: +e.target.value })} style={{ ...inputStyle, width: 80 }} /> : money(r.base_price)}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input type="number" value={ed.km_rate} onChange={e => setEditingRate({ ...ed, km_rate: +e.target.value })} style={{ ...inputStyle, width: 70 }} /> : `$${r.km_rate}`}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit
                          ? <input type="number" step="0.1" min="0.1" max="10" value={ed.car_multiplier}
                              onChange={e => setEditingRate({ ...ed, car_multiplier: +e.target.value })}
                              style={{ ...inputStyle, width: 70 }} />
                          : <span style={{ fontWeight: 600, color: r.car_multiplier !== 1 ? "#7c3aed" : "#374151" }}>×{r.car_multiplier}</span>
                        }
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? (
                          <input type="number" min={0} max={100} value={ed.platform_pct}
                            onChange={e => setEditingRate({ ...ed, platform_pct: +e.target.value, driver_pct: 100 - +e.target.value })}
                            style={{ ...inputStyle, width: 60 }} />
                        ) : `${r.platform_pct}%`}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#15803d" }}>{isEdit ? `${100 - ed.platform_pct}%` : `${r.driver_pct}%`}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit
                          ? <input type="checkbox" checked={ed.active} onChange={e => setEditingRate({ ...ed, active: e.target.checked })} />
                          : <span style={{ color: r.active ? "#15803d" : "#9ca3af" }}>{r.active ? "✅" : "⛔"}</span>
                        }
                      </td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {isEdit ? (
                          <>
                            <button onClick={() => saveRate(ed)} disabled={savingId === `rate-${r.id}`} style={btnStyle("#16a34a")}>儲存</button>
                            <button onClick={() => setEditingRate(null)} style={{ ...btnStyle("#6b7280"), marginLeft: 6 }}>取消</button>
                          </>
                        ) : (
                          <button onClick={() => setEditingRate({ ...r })} style={btnStyle("#2563eb")}>編輯</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════ 附加服務 tab ══════════════ */}
      {viewTab === "surcharges" && (
        <div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>設定附加服務費用。「金額」為固定加收，「百分比」為整體費用乘數加成（如 0.2 = +20%）。</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["代碼", "服務名稱", "固定金額($)", "比例加成", "說明", "啟用", "操作"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {surcharges.map(s => {
                  const isEdit = editingSurcharge?.id === s.id;
                  const ed = isEdit ? editingSurcharge! : s;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6", background: isEdit ? "#eff6ff" : "transparent" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64748b", fontSize: 11 }}>{s.key}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input value={ed.label} onChange={e => setEditingSurcharge({ ...ed, label: e.target.value })} style={inputStyle} /> : s.label}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input type="number" value={ed.amount} onChange={e => setEditingSurcharge({ ...ed, amount: +e.target.value })} style={{ ...inputStyle, width: 80 }} /> : (s.amount > 0 ? money(s.amount) : "—")}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit ? <input type="number" step="0.05" value={ed.pct_multiplier} onChange={e => setEditingSurcharge({ ...ed, pct_multiplier: +e.target.value })} style={{ ...inputStyle, width: 70 }} />
                          : (s.pct_multiplier > 0 ? `+${Math.round(s.pct_multiplier * 100)}%` : "—")}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 160 }}>
                        {isEdit ? <input value={ed.description} onChange={e => setEditingSurcharge({ ...ed, description: e.target.value })} style={inputStyle} /> : s.description}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {isEdit
                          ? <input type="checkbox" checked={ed.active} onChange={e => setEditingSurcharge({ ...ed, active: e.target.checked })} />
                          : <span style={{ color: s.active ? "#15803d" : "#9ca3af" }}>{s.active ? "✅" : "⛔"}</span>
                        }
                      </td>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                        {isEdit ? (
                          <>
                            <button onClick={() => saveSurcharge(ed)} disabled={savingId === `sc-${s.id}`} style={btnStyle("#16a34a")}>儲存</button>
                            <button onClick={() => setEditingSurcharge(null)} style={{ ...btnStyle("#6b7280"), marginLeft: 6 }}>取消</button>
                          </>
                        ) : (
                          <button onClick={() => setEditingSurcharge({ ...s })} style={btnStyle("#2563eb")}>編輯</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "5px 8px", border: "1px solid #93c5fd", borderRadius: 6, fontSize: 13, width: "100%", background: "#fff" };
function btnStyle(bg: string): React.CSSProperties {
  return { padding: "4px 12px", background: bg, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" };
}
