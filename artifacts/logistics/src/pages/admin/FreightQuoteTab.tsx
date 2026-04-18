import { useState, useEffect } from "react";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

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

interface FuyongResult {
  ok: boolean; error?: string;
  quote?: { total_price: number };
  breakdown?: {
    distance_km: number; distance_source: string; duration_min: number | null;
    tier_label: string; base_price: number;
    special_nodes: { keyword: string; label: string; amount: number }[];
    surcharge: number; subtotal_before_holiday: number;
    is_holiday: boolean; holiday_multiplier: number; total_price: number;
  };
}

interface PartnerConfig {
  id: number; partner_id: string; partner_name: string; tier: string;
  base_price: number; rate_per_km: number; park_fee: number; mountain_fee: number;
  special_zone_fee: number; remote_fee: number; profit_margin: number;
  notes: string; active: boolean;
}

interface PartnerResult {
  ok: boolean; error?: string;
  // get_automated_quote() Python 格式
  client_name?: string;
  quote?: number;
  profit?: number;
  distance?: string;
  applied_surcharges?: string[];
  // generate_auto_quote() 兼容格式
  price?: number;
  detail?: string;
  // 完整前端結構
  partner?: { partner_id: string; partner_name: string; tier: string };
  breakdown?: {
    distance_km: number; distance_source: string; duration_min: number | null;
    base_price: number; rate_per_km: number; distance_fee: number;
    surcharges: { type: string; label: string; keyword: string; amount: number }[];
    surcharge_total: number; profit_margin: number; profit: number;
    total_price: number; detail: string;
  };
}

// ─── 工具函式 ────────────────────────────────────────────────────────────────
function money(v: number) { return `$${Number(v).toLocaleString("zh-TW")}`; }

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  VIP:   { bg: "#fef9c3", text: "#92400e", border: "#fde68a" },
  一般:  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  加盟商: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
};
function tierStyle(tier: string) { return TIER_COLORS[tier] ?? TIER_COLORS["一般"]; }

// ─── 主元件 ──────────────────────────────────────────────────────────────────
export default function FreightQuoteTab() {
  const [config, setConfig]   = useState<Config | null>(null);
  const [viewTab, setViewTab] = useState<"calc" | "rates" | "surcharges" | "partners">("calc");
  const [loading, setLoading] = useState(false);

  // ── 計算機狀態
  const [calcMode,    setCalcMode]    = useState<"generic" | "fuyong" | "partner">("generic");
  const [pickup,      setPickup]      = useState("");
  const [delivery,    setDelivery]    = useState("");
  const [carType,     setCarType]     = useState("3.5t");
  const [hasElevator, setHasElevator] = useState(true);
  const [services,    setServices]    = useState<Record<string, number | boolean>>({});
  const [result,      setResult]      = useState<QuoteResult | null>(null);

  // ── 富詠模式狀態
  const [fuyongOrigin,      setFuyongOrigin]      = useState("");
  const [fuyongDestination, setFuyongDestination] = useState("");
  const [isHoliday,         setIsHoliday]         = useState(false);
  const [fuyongResult,      setFuyongResult]      = useState<FuyongResult | null>(null);

  // ── 合約報價模式狀態
  const [partners,          setPartners]          = useState<PartnerConfig[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [partnerOrigin,     setPartnerOrigin]     = useState("");
  const [partnerDest,       setPartnerDest]       = useState("");
  const [partnerCarType,    setPartnerCarType]     = useState("3.5t");
  const [partnerResult,     setPartnerResult]     = useState<PartnerResult | null>(null);

  // ── 合約客戶管理狀態
  const [editingPartner,   setEditingPartner]   = useState<PartnerConfig | null>(null);
  const [showAddPartner,   setShowAddPartner]   = useState(false);
  const [newPartner,       setNewPartner]       = useState<Partial<PartnerConfig>>({ tier: "一般", base_price: 800, rate_per_km: 25, park_fee: 300, mountain_fee: 500 });

  // ── 費率編輯
  const [editingRate, setEditingRate] = useState<RateConfig | null>(null);
  const [editingSurcharge, setEditingSurcharge] = useState<SurchargeConfig | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => { loadConfig(); loadPartners(); }, []);

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

  async function handleFuyongCalculate() {
    if (!fuyongOrigin || !fuyongDestination) return;
    setLoading(true); setFuyongResult(null);
    try {
      const res = await fetch(`${API}/freight-quote/fuyong-calculate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: fuyongOrigin, destination: fuyongDestination, is_holiday: isHoliday }),
      });
      setFuyongResult(await res.json());
    } catch (e: any) { setFuyongResult({ ok: false, error: e.message }); }
    setLoading(false);
  }

  async function loadPartners() {
    try {
      const r = await fetch(`${API}/freight-quote/partners`);
      const d = await r.json();
      if (d.ok) {
        setPartners(d.partners);
        if (d.partners.length > 0 && !selectedPartnerId) {
          setSelectedPartnerId(d.partners[0].partner_id);
        }
      }
    } catch { /* silent */ }
  }

  async function handlePartnerCalculate() {
    if (!selectedPartnerId || !partnerOrigin || !partnerDest) return;
    setLoading(true); setPartnerResult(null);
    try {
      const res = await fetch(`${API}/freight-quote/partner-calculate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: selectedPartnerId, origin: partnerOrigin, destination: partnerDest, car_type: partnerCarType }),
      });
      setPartnerResult(await res.json());
    } catch (e: any) { setPartnerResult({ ok: false, error: e.message }); }
    setLoading(false);
  }

  async function savePartner(p: PartnerConfig) {
    setSavingId(`partner-${p.id}`);
    await fetch(`${API}/freight-quote/partners/${p.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    });
    setSavingId(null); setEditingPartner(null); loadPartners();
  }

  async function deletePartner(id: number) {
    if (!confirm("確定刪除此合約客戶？")) return;
    await fetch(`${API}/freight-quote/partners/${id}`, { method: "DELETE" });
    loadPartners();
  }

  async function createPartner() {
    if (!newPartner.partner_id || !newPartner.partner_name) return;
    setSavingId("new-partner");
    await fetch(`${API}/freight-quote/partners`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPartner),
    });
    setSavingId(null); setShowAddPartner(false);
    setNewPartner({ tier: "一般", base_price: 800, rate_per_km: 25, park_fee: 300, mountain_fee: 500 });
    loadPartners();
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
    <div style={{ padding: "24px", maxWidth: 960, fontSize: 15 }}>
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
        {([["calc", "💰 即時報價"], ["rates", "🚛 車型費率"], ["surcharges", "➕ 附加服務"], ["partners", "🤝 合約客戶"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setViewTab(v)}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: viewTab === v ? 700 : 400, border: "none", background: "none", cursor: "pointer", color: viewTab === v ? "#2563eb" : "#64748b", borderBottom: viewTab === v ? "2px solid #2563eb" : "2px solid transparent", marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════ 即時報價 tab ══════════════ */}
      {viewTab === "calc" && (
        <div>
          {/* ── 計費模式切換 ── */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" }}>
            {([
              ["generic", "🚛 通用報價", "calculate_taiwan_freight()"],
              ["fuyong",  "🏢 富詠專屬", "get_fuyong_quote()"],
              ["partner", "🤝 合約報價", "auto_quote_engine()"],
            ] as const).map(([mode, label, fn]) => (
              <button key={mode} onClick={() => setCalcMode(mode)}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: calcMode === mode ? 700 : 400, border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                  background: calcMode === mode ? "#fff" : "transparent",
                  color: calcMode === mode ? "#1e40af" : "#64748b",
                  boxShadow: calcMode === mode ? "0 1px 4px #0001" : "none" }}>
                {label}
                <span style={{ display: "block", fontSize: 10, opacity: 0.6, fontWeight: 400, fontFamily: "monospace" }}>{fn}</span>
              </button>
            ))}
          </div>

        {calcMode === "partner" ? (
          /* ══ 合約客戶報價面板 ══ */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* 左：輸入 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 原始碼對照卡片 */}
              <div style={{ background: "#1e1e2e", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#cdd6f4", fontFamily: "monospace", lineHeight: 1.7 }}>
                <div style={{ color: "#89dceb", marginBottom: 4 }}>▸ auto_quote_engine(partner_id, origin, destination, car_type)</div>
                <div style={{ color: "#a6e3a1" }}>  partner_config ← DB partner_contract_config</div>
                <div style={{ color: "#a6e3a1" }}>  total = base_price + (km × rate_per_km) + surcharge</div>
                <div style={{ color: "#f9e2af" }}>  科學園區 → +park_fee（各客戶自訂）</div>
                <div style={{ color: "#fab387" }}>  山區 → +mountain_fee（各客戶自訂）</div>
              </div>

              {/* 合約客戶選擇 */}
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                🤝 合約客戶
                <select value={selectedPartnerId} onChange={e => setSelectedPartnerId(e.target.value)}
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff" }}>
                  <option value="">── 選擇合約客戶 ──</option>
                  {partners.filter(p => p.active).map(p => {
                    const ts = tierStyle(p.tier);
                    return <option key={p.partner_id} value={p.partner_id}>{p.tier === "VIP" ? "⭐ " : ""}{p.partner_name}（{p.tier}）</option>;
                  })}
                </select>
              </label>

              {/* 選中客戶費率預覽 */}
              {selectedPartnerId && (() => {
                const p = partners.find(x => x.partner_id === selectedPartnerId);
                if (!p) return null;
                const ts = tierStyle(p.tier);
                return (
                  <div style={{ background: ts.bg, border: `1px solid ${ts.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ background: ts.border, color: ts.text, padding: "2px 8px", borderRadius: 12, fontWeight: 700, fontSize: 13 }}>{p.tier}</span>
                      <span style={{ fontWeight: 600, color: ts.text }}>{p.partner_name}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "#374151" }}>
                      <span>起步價：<b>{money(p.base_price)}</b></span>
                      <span>每公里：<b>${p.rate_per_km}</b></span>
                      <span>🏭 科學園區費：<b>+{money(p.park_fee)}</b></span>
                      <span>⛰️ 山區費：<b>+{money(p.mountain_fee)}</b></span>
                      <span>🏪 進倉/碼頭/機場：<b>+{money(p.special_zone_fee ?? 500)}</b></span>
                      <span>🚌 偏鄉/離島加成：<b>+{money(p.remote_fee ?? 1000)}</b></span>
                      <span style={{ gridColumn: "span 2", color: "#6b7280" }}>💰 平台利潤率：<b>{((p.profit_margin ?? 0.15) * 100).toFixed(0)}%</b></span>
                    </div>
                    {p.notes && <div style={{ marginTop: 6, color: "#64748b", fontStyle: "italic" }}>備注：{p.notes}</div>}
                  </div>
                );
              })()}

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📦 出發地（origin）
                <input value={partnerOrigin} onChange={e => setPartnerOrigin(e.target.value)}
                  placeholder="例：台北市內湖區瑞光路 100 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📍 目的地（destination）
                <input value={partnerDest} onChange={e => setPartnerDest(e.target.value)}
                  placeholder="例：新竹市科學園區工業東一路（自動偵測加成）"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>含「科學園區」或山區關鍵字時，以該客戶合約費率自動加成</span>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                🚛 車型
                <select value={partnerCarType} onChange={e => setPartnerCarType(e.target.value)}
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff" }}>
                  {rates.filter(r => r.active).map(r => (
                    <option key={r.car_type} value={r.car_type}>{r.label}</option>
                  ))}
                </select>
              </label>

              <button onClick={handlePartnerCalculate} disabled={loading || !selectedPartnerId || !partnerOrigin || !partnerDest}
                style={{ padding: "12px 0", background: selectedPartnerId && partnerOrigin && partnerDest ? "#0f766e" : "#9ca3af", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                {loading ? "計算中..." : "🤝 合約客戶報價計算"}
              </button>
            </div>

            {/* 右：結果 */}
            <div>
              {partnerResult?.ok && partnerResult.breakdown && partnerResult.price != null && partnerResult.partner && (() => {
                const b = partnerResult.breakdown;
                const total = partnerResult.price!;
                const profit = b.profit ?? partnerResult.profit ?? 0;
                const pt = partnerResult.partner;
                const ts = tierStyle(pt.tier);
                const surchargeIcon = (type: string) =>
                  type === "science_park" ? "🏭" : type === "mountain" ? "⛰️" : type === "special_zone" ? "🏪" : "🚌";
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* 客戶等級 badge + 報價大字 */}
                    <div style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)", borderRadius: 14, padding: "20px 24px", color: "#fff", textAlign: "center" }}>
                      <div style={{ background: "rgba(255,255,255,0.2)", display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 12, marginBottom: 6 }}>
                        {pt.tier} · {pt.partner_name}
                      </div>
                      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>合約報價</div>
                      <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 1 }}>{money(total)}</div>
                      {b.duration_min && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>預估車程約 {Math.round(b.duration_min)} 分鐘</div>}
                      <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>里程來源：{b.distance_source} · {partnerResult.distance}</div>
                    </div>

                    {/* 費用明細 */}
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 10 }}>費用明細</div>
                      {[
                        { label: `📏 ${b.distance_km.toFixed(1)}km × $${b.rate_per_km}/km`, value: money(b.distance_fee) },
                        { label: `🏠 起步費`, value: money(b.base_price) },
                        ...b.surcharges.map(s => ({
                          label: `${surchargeIcon(s.type)} ${s.label}（${s.keyword}）`,
                          value: `+${money(s.amount)}`
                        })),
                        { label: "━ 合約總計", value: money(total), total: true },
                      ].map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0",
                          borderBottom: i < b.surcharges.length + 1 ? "1px solid #f1f5f9" : "none",
                          fontWeight: (row as any).total ? 700 : 400, color: (row as any).total ? "#1e293b" : "#374151" }}>
                          <span>{row.label}</span>
                          <span style={{ fontWeight: 600 }}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* 平台利潤區塊 — 對應 Python: platform_profit = total_quote * profit_margin */}
                    <div style={{ background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)", borderRadius: 12, padding: "14px 18px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 2 }}>💰 平台利潤（{((b.profit_margin ?? 0.15) * 100).toFixed(0)}%）</div>
                        <div style={{ fontSize: 24, fontWeight: 800 }}>{money(profit)}</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13, opacity: 0.7 }}>
                        <div>客戶付款</div>
                        <div style={{ fontSize: 18, fontWeight: 700, opacity: 1 }}>{money(total)}</div>
                        <div style={{ marginTop: 4 }}>司機分潤</div>
                        <div style={{ fontSize: 16, fontWeight: 700, opacity: 1 }}>{money(total - profit)}</div>
                      </div>
                    </div>

                    {/* Python detail 字串 */}
                    <div style={{ background: "#1e1e2e", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#cdd6f4", fontFamily: "monospace" }}>
                      <div style={{ color: "#89b4fa", marginBottom: 4, fontWeight: 600 }}>// get_automated_quote() 回傳</div>
                      <div><span style={{ color: "#89dceb" }}>client_name: </span><span style={{ color: "#a6e3a1" }}>"{partnerResult.client_name}"</span></div>
                      <div><span style={{ color: "#89dceb" }}>quote: </span><span style={{ color: "#fab387" }}>{total}</span></div>
                      <div><span style={{ color: "#89dceb" }}>profit: </span><span style={{ color: "#fab387" }}>{profit}</span></div>
                      <div><span style={{ color: "#89dceb" }}>distance: </span><span style={{ color: "#a6e3a1" }}>"{partnerResult.distance}"</span></div>
                      <div><span style={{ color: "#89dceb" }}>applied_surcharges: </span><span style={{ color: "#cba6f7" }}>[{(partnerResult.applied_surcharges ?? []).map(t => `"${t}"`).join(", ")}]</span></div>
                    </div>

                    {/* 地點偵測結果 */}
                    <div style={{ background: b.surcharges.length > 0 ? "#fefce8" : "#f0fdf4", border: `1px solid ${b.surcharges.length > 0 ? "#fde68a" : "#bbf7d0"}`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>🔍 全方位地點偵測（科學園區 / 山區 / 進倉碼頭機場 / 偏鄉離島）</div>
                      {b.surcharges.length > 0
                        ? b.surcharges.map((s, i) => (
                            <div key={i}>{surchargeIcon(s.type)} 偵測到「{s.keyword}」→ {s.label} +{money(s.amount)}</div>
                          ))
                        : <div style={{ color: "#15803d" }}>✅ 一般地址（無加成）</div>
                      }
                    </div>
                  </div>
                );
              })()}
              {partnerResult && !partnerResult.ok && (
                <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#b91c1c" }}>❌ {partnerResult.error}</div>
              )}
              {!partnerResult && (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14, border: "2px dashed #e2e8f0", borderRadius: 14 }}>
                  選擇合約客戶並輸入地址<br />按下「合約客戶報價計算」查看結果
                </div>
              )}
            </div>
          </div>
        ) : calcMode === "fuyong" ? (
          /* ══ 富詠專屬報價面板 ══ */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* 左：輸入 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 原始碼對照卡片 */}
              <div style={{ background: "#1e1e2e", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#cdd6f4", fontFamily: "monospace", lineHeight: 1.7 }}>
                <div style={{ color: "#89dceb", marginBottom: 4 }}>▸ get_fuyong_quote(origin, destination, is_holiday)</div>
                <div style={{ color: "#a6e3a1" }}>  ≤10km → $800 固定</div>
                <div style={{ color: "#a6e3a1" }}>  &gt;10km → $800 + (km-10)×$25</div>
                <div style={{ color: "#f9e2af" }}>  科學園區 +$300 ／ 機場 +$500</div>
                <div style={{ color: "#f38ba8" }}>  is_holiday → ×1.2</div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📦 出發地（origin）
                <input value={fuyongOrigin} onChange={e => setFuyongOrigin(e.target.value)}
                  placeholder="例：台北市內湖區瑞光路 100 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📍 目的地（destination）
                <input value={fuyongDestination} onChange={e => setFuyongDestination(e.target.value)}
                  placeholder="例：新竹市科學園區工業東一路（自動偵測節點）"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>包含「科學園區」或「機場」關鍵字時自動加成</span>
              </label>

              {/* 假日開關 */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: isHoliday ? "#fef3c7" : "#f8fafc", borderRadius: 10, border: `1px solid ${isHoliday ? "#fcd34d" : "#e2e8f0"}` }}>
                <span style={{ fontSize: 18 }}>{isHoliday ? "🎉" : "📅"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{isHoliday ? "假日／夜間加成（×1.2）" : "一般工作日"}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{isHoliday ? "假日加成 ×1.2 已套用" : "一般工作日，不加成"}</div>
                </div>
                <div style={{ position: "relative", width: 40, height: 22 }} onClick={() => setIsHoliday(!isHoliday)}>
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: isHoliday ? "#d97706" : "#d1d5db", transition: "background 0.2s", cursor: "pointer" }} />
                  <div style={{ position: "absolute", top: 3, left: isHoliday ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
              </div>

              <button onClick={handleFuyongCalculate} disabled={loading || !fuyongOrigin || !fuyongDestination}
                style={{ padding: "12px 0", background: loading ? "#94a3b8" : "#7c3aed", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                {loading ? "計算中..." : "🏢 富詠報價計算"}
              </button>
            </div>

            {/* 右：結果 */}
            <div>
              {fuyongResult?.ok && fuyongResult.breakdown && fuyongResult.quote && (() => {
                const b = fuyongResult.breakdown;
                const q = fuyongResult.quote;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* 報價大字 */}
                    <div style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", borderRadius: 14, padding: "20px 24px", color: "#fff", textAlign: "center" }}>
                      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>富詠報價總額</div>
                      <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 1 }}>{money(q.total_price)}</div>
                      {b.duration_min && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>預估車程約 {Math.round(b.duration_min)} 分鐘</div>}
                      <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>里程來源：{b.distance_source}</div>
                    </div>

                    {/* 費用明細 */}
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 10 }}>費用明細</div>
                      {[
                        { label: `📏 里程（${b.distance_km.toFixed(1)}km）`, value: "" },
                        { label: `⚙️ ${b.tier_label}`, value: money(b.base_price) },
                        ...b.special_nodes.map(n => ({ label: `🏷️ ${n.label}`, value: `+${money(n.amount)}` })),
                        ...(b.is_holiday ? [{ label: `🎉 假日加成（×${b.holiday_multiplier}）`, value: `×${b.holiday_multiplier}`, holiday: true }] : []),
                        { label: "━ 合計", value: money(q.total_price), total: true },
                      ].map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < 3 + b.special_nodes.length ? "1px solid #f1f5f9" : "none",
                          color: (row as any).holiday ? "#d97706" : (row as any).total ? "#1e293b" : "#374151",
                          fontWeight: (row as any).total ? 700 : 400 }}>
                          <span>{row.label}</span>
                          <span style={{ fontWeight: 600 }}>{row.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* 節點偵測結果 */}
                    <div style={{ background: b.special_nodes.length > 0 ? "#fefce8" : "#f0fdf4", border: `1px solid ${b.special_nodes.length > 0 ? "#fde68a" : "#bbf7d0"}`, borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>🔍 特殊節點偵測</div>
                      {b.special_nodes.length > 0
                        ? b.special_nodes.map(n => <div key={n.keyword}>✅ 偵測到「{n.keyword}」→ +{money(n.amount)}</div>)
                        : <div style={{ color: "#15803d" }}>✅ 無特殊節點（一般地址）</div>
                      }
                    </div>
                  </div>
                );
              })()}
              {fuyongResult && !fuyongResult.ok && (
                <div style={{ padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, color: "#b91c1c" }}>❌ {fuyongResult.error}</div>
              )}
              {!fuyongResult && (
                <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14, border: "2px dashed #e2e8f0", borderRadius: 14 }}>
                  輸入出發地和目的地<br />按下「富詠報價計算」查看結果
                </div>
              )}
            </div>
          </div>
        ) : (
        /* ══ 通用報價面板（原有邏輯） ══ */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* 左：輸入 */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📦 取貨地址
                <input value={pickup} onChange={e => setPickup(e.target.value)} placeholder="例：台北市內湖區瑞光路 xxx 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
                📍 送達地址
                <input value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="例：台東市中華路一段 xxx 號"
                  style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, fontWeight: 600 }}>
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
                  <div style={{ fontSize: 15, fontWeight: 600 }}>目的地{hasElevator ? "有電梯" : "無電梯（搬樓梯費 +$500）"}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{hasElevator ? "目的地有電梯，不收搬樓梯費" : "目的地無電梯，自動加收搬樓梯費 $500"}</div>
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
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>其他附加服務</div>
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
                          <span style={{ color: "#64748b", fontSize: 13, marginLeft: 6 }}>
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
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64748b", fontSize: 13 }}>{s.key}</td>
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

      {/* ══════════════ 合約客戶 tab ══════════════ */}
      {viewTab === "partners" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                管理合約客戶的專屬費率——對應 Python <code>auto_quote_engine</code> 的 <code>partner_config</code>。
              </p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
                各客戶可設定獨立的起步價、公里費、科學園區費和山區費。
              </p>
            </div>
            <button onClick={() => setShowAddPartner(!showAddPartner)}
              style={{ padding: "8px 16px", background: showAddPartner ? "#64748b" : "#0f766e", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {showAddPartner ? "✕ 取消" : "＋ 新增客戶"}
            </button>
          </div>

          {/* 新增客戶表單 */}
          {showAddPartner && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#15803d" }}>新增合約客戶</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "客戶代碼（partner_id）", key: "partner_id", ph: "例：VIP002", type: "text" },
                  { label: "客戶名稱", key: "partner_name", ph: "例：台積電採購部", type: "text" },
                  { label: "起步價（$）", key: "base_price", ph: "800", type: "number" },
                  { label: "每公里費（$/km）", key: "rate_per_km", ph: "25", type: "number" },
                  { label: "🏭 科學園區費（$）", key: "park_fee", ph: "300", type: "number" },
                  { label: "⛰️ 山區費（$）", key: "mountain_fee", ph: "500", type: "number" },
                  { label: "🏪 進倉/碼頭/機場費（$）", key: "special_zone_fee", ph: "500", type: "number" },
                  { label: "🚌 偏鄉/離島加成（$）", key: "remote_fee", ph: "1000", type: "number" },
                  { label: "💰 平台利潤率（0~1）", key: "profit_margin", ph: "0.15", type: "number" },
                ].map(({ label, key, ph, type }) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                    {label}
                    <input type={type} placeholder={ph} value={(newPartner as any)[key] ?? ""}
                      onChange={e => setNewPartner(p => ({ ...p, [key]: type === "number" ? +e.target.value : e.target.value }))}
                      style={{ ...inputStyle }} />
                  </label>
                ))}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600 }}>
                  等級
                  <select value={newPartner.tier ?? "一般"} onChange={e => setNewPartner(p => ({ ...p, tier: e.target.value }))}
                    style={{ ...inputStyle }}>
                    <option>VIP</option><option>一般</option><option>加盟商</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 600, gridColumn: "span 2" }}>
                  備注
                  <input type="text" placeholder="合約說明..." value={newPartner.notes ?? ""}
                    onChange={e => setNewPartner(p => ({ ...p, notes: e.target.value }))}
                    style={{ ...inputStyle }} />
                </label>
              </div>
              <button onClick={createPartner} disabled={savingId === "new-partner" || !newPartner.partner_id || !newPartner.partner_name}
                style={{ marginTop: 14, padding: "8px 20px", background: "#15803d", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {savingId === "new-partner" ? "儲存中…" : "✓ 建立合約客戶"}
              </button>
            </div>
          )}

          {/* 客戶列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {partners.map(p => {
              const isEdit = editingPartner?.id === p.id;
              const ed = isEdit ? editingPartner! : p;
              const ts = tierStyle(p.tier);
              return (
                <div key={p.id} style={{ border: `1px solid ${isEdit ? "#93c5fd" : "#e5e7eb"}`, borderRadius: 12, padding: "14px 16px", background: isEdit ? "#eff6ff" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isEdit ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ background: ts.bg, color: ts.text, border: `1px solid ${ts.border}`, padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                        {p.tier}
                      </span>
                      {isEdit
                        ? <input value={ed.partner_name} onChange={e => setEditingPartner({ ...ed, partner_name: e.target.value })}
                            style={{ ...inputStyle, fontSize: 15, fontWeight: 700, width: 180 }} />
                        : <span style={{ fontSize: 15, fontWeight: 700 }}>{p.partner_name}</span>
                      }
                      <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>#{p.partner_id}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isEdit ? (
                        <>
                          <button onClick={() => savePartner(ed)} disabled={savingId === `partner-${p.id}`} style={btnStyle("#16a34a")}>儲存</button>
                          <button onClick={() => setEditingPartner(null)} style={btnStyle("#6b7280")}>取消</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditingPartner({ ...p })} style={btnStyle("#2563eb")}>編輯</button>
                          <button onClick={() => deletePartner(p.id)} style={btnStyle("#dc2626")}>刪除</button>
                        </>
                      )}
                    </div>
                  </div>
                  {isEdit ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 4 }}>
                      {([
                        ["起步價($)", "base_price"],
                        ["每公里費($)", "rate_per_km"],
                        ["🏭 科學園區費($)", "park_fee"],
                        ["⛰️ 山區費($)", "mountain_fee"],
                        ["🏪 進倉/碼頭/機場($)", "special_zone_fee"],
                        ["🚌 偏鄉/離島($)", "remote_fee"],
                        ["💰 利潤率(0~1)", "profit_margin"],
                      ] as [string, keyof PartnerConfig][]).map(([label, key]) => (
                        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 13, fontWeight: 600 }}>
                          {label}
                          <input type="number" value={ed[key] as number}
                            onChange={e => setEditingPartner({ ...ed, [key]: +e.target.value })}
                            style={{ ...inputStyle, width: "100%" }} />
                        </label>
                      ))}
                      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 13, fontWeight: 600 }}>
                        等級
                        <select value={ed.tier} onChange={e => setEditingPartner({ ...ed, tier: e.target.value })} style={{ ...inputStyle }}>
                          <option>VIP</option><option>一般</option><option>加盟商</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 20, marginTop: 8, fontSize: 12, color: "#64748b" }}>
                      <span>起步：<b style={{ color: "#374151" }}>{money(p.base_price)}</b></span>
                      <span>每公里：<b style={{ color: "#374151" }}>${p.rate_per_km}</b></span>
                      <span>🏭 科學園區：<b style={{ color: "#374151" }}>+{money(p.park_fee)}</b></span>
                      <span>⛰️ 山區：<b style={{ color: "#374151" }}>+{money(p.mountain_fee)}</b></span>
                      <span>🏪 進倉/碼頭/機場：<b style={{ color: "#374151" }}>+{money(p.special_zone_fee ?? 500)}</b></span>
                      <span>🚌 偏鄉/離島：<b style={{ color: "#374151" }}>+{money(p.remote_fee ?? 1000)}</b></span>
                      <span>💰 利潤率：<b style={{ color: "#6b7280" }}>{((p.profit_margin ?? 0.15) * 100).toFixed(0)}%</b></span>
                      {p.notes && <span style={{ fontStyle: "italic", color: "#9ca3af" }}>{p.notes}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {partners.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14, border: "2px dashed #e5e7eb", borderRadius: 12 }}>
                尚無合約客戶，點擊「新增客戶」建立第一筆
              </div>
            )}
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
