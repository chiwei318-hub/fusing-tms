import React, { useState, useEffect, useCallback } from "react";

const API = import.meta.env.BASE_URL + "api";
const POLL_MS = 30_000; // 30 秒自動刷新

interface Route {
  id: number;
  week_label: string;
  route_no: string;
  route_type: string;
  vehicle_type: string;
  shopee_driver_id: string;
  driver_name: string;
  driver_phone: string;
  departure_time: string;
  dock_no: string;
  stop_count: number;
}

interface Stop {
  id: number;
  stop_order: number;
  store_name: string;
  store_address: string;
  is_ndd: boolean;
  ndd_type: string;
}

interface Week {
  week_label: string;
  route_count: number;
  total_stops: number;
  imported_at: string;
}

type TypeFilter = "全部" | "WH NDD" | "快速到貨" | "流水線" | "NDD";
const TYPE_OPTS: TypeFilter[] = ["全部", "WH NDD", "快速到貨", "流水線", "NDD"];
const TYPE_COLORS: Record<string, string> = {
  "WH NDD": "#7c3aed",
  "快速到貨": "#059669",
  "流水線": "#0284c7",
  "NDD": "#d97706",
  "一般": "#6b7280",
};

export default function ShopeeScheduleTab() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("全部");
  const [driverFilter, setDriverFilter] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadWeeks = useCallback(async () => {
    try {
      const r = await fetch(`${API}/shopee-schedules/weeks`);
      const j = await r.json();
      if (j.ok) {
        setWeeks(j.weeks);
        if (!selectedWeek && j.weeks.length) setSelectedWeek(j.weeks[0].week_label);
      }
    } catch {}
  }, [selectedWeek]);

  const loadRoutes = useCallback(async () => {
    if (!selectedWeek) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ week: selectedWeek });
      if (typeFilter !== "全部") params.set("type", typeFilter);
      if (driverFilter.trim()) params.set("driver", driverFilter.trim());
      const r = await fetch(`${API}/shopee-schedules?${params}`);
      const j = await r.json();
      if (j.ok) { setRoutes(j.routes); setLastRefresh(new Date()); }
    } catch {} finally { setLoading(false); }
  }, [selectedWeek, typeFilter, driverFilter]);

  useEffect(() => { loadWeeks(); }, []);
  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  // 自動 polling
  useEffect(() => {
    const t = setInterval(() => { loadRoutes(); }, POLL_MS);
    return () => clearInterval(t);
  }, [loadRoutes]);

  const handleImport = async () => {
    setImporting(true); setImportMsg("");
    try {
      const r = await fetch(`${API}/shopee-schedules/import`, { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setImportMsg(`✅ 匯入完成！路線 ${j.totalRoutes} 條、站點 ${j.totalStops} 個、週別 ${j.weeks} 個`);
        await loadWeeks(); await loadRoutes();
      } else { setImportMsg(`❌ ${j.error}`); }
    } catch (e: any) { setImportMsg(`❌ ${e.message}`); }
    finally { setImporting(false); }
  };

  const loadStops = async (routeId: number) => {
    if (expandedId === routeId) { setExpandedId(null); return; }
    setExpandedId(routeId); setStopsLoading(true);
    try {
      const r = await fetch(`${API}/shopee-schedules/${routeId}/stops`);
      const j = await r.json();
      if (j.ok) setStops(j.stops);
    } catch {} finally { setStopsLoading(false); }
  };

  const selectedWeekData = weeks.find(w => w.week_label === selectedWeek);
  const routeTypes = Array.from(new Set(routes.map(r => r.route_type)));
  const groupedByType: Record<string, Route[]> = {};
  for (const r of routes) {
    if (!groupedByType[r.route_type]) groupedByType[r.route_type] = [];
    groupedByType[r.route_type].push(r);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── 頂部統計卡 ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "已匯入週別", val: weeks.length, icon: "📅", bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
          { label: "本週路線數", val: selectedWeekData?.route_count ?? 0, icon: "🚛", bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
          { label: "本週門市站點", val: selectedWeekData?.total_stops ?? 0, icon: "🏪", bg: "#fdf4ff", border: "#e9d5ff", text: "#7c3aed" },
          { label: "顯示路線", val: routes.length, icon: "📋", bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 140, padding: "14px 16px", borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 22 }}>{c.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: c.text, lineHeight: 1.2 }}>{c.val.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── 匯入工具列 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "12px 16px", background: "#f9fafb", border: "1px solid #e5e7eb",
        borderRadius: 10, marginBottom: 16 }}>
        <button onClick={handleImport} disabled={importing}
          style={{ padding: "8px 18px", background: importing ? "#9ca3af" : "#1d4ed8",
            color: "#fff", border: "none", borderRadius: 8, cursor: importing ? "default" : "pointer",
            fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          {importing ? "⏳ 匯入中…" : "📥 重新匯入 Excel"}
        </button>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          自動刷新 每 {POLL_MS / 1000} 秒 &nbsp;·&nbsp; 最後更新：{lastRefresh.toLocaleTimeString("zh-TW")}
        </div>
        {importMsg && (
          <div style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6,
            background: importMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
            color: importMsg.startsWith("✅") ? "#166534" : "#dc2626",
            border: `1px solid ${importMsg.startsWith("✅") ? "#bbf7d0" : "#fecaca"}` }}>
            {importMsg}
          </div>
        )}
      </div>

      {/* ── 篩選列 ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        {/* 週別 */}
        <div>
          <label style={{ fontSize: 12, color: "#6b7280", marginRight: 6 }}>週別</label>
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6,
              fontSize: 13, background: "#fff" }}>
            {weeks.map(w => (
              <option key={w.week_label} value={w.week_label}>
                {w.week_label}（{w.route_count} 路線）
              </option>
            ))}
          </select>
        </div>
        {/* 路線類型 */}
        <div style={{ display: "flex", gap: 6 }}>
          {TYPE_OPTS.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              style={{ padding: "5px 12px", border: "1px solid",
                borderColor: typeFilter === t ? "#1d4ed8" : "#d1d5db",
                background: typeFilter === t ? "#1d4ed8" : "#fff",
                color: typeFilter === t ? "#fff" : "#374151",
                borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: typeFilter === t ? 600 : 400 }}>
              {t}
            </button>
          ))}
        </div>
        {/* 司機搜尋 */}
        <input value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
          placeholder="🔍 搜尋司機工號…"
          style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6,
            fontSize: 13, width: 160 }} />
        <button onClick={loadRoutes} style={{ padding: "6px 14px", background: "#f3f4f6",
          border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
          🔄 刷新
        </button>
      </div>

      {/* ── 路線表格 ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>⏳ 載入中…</div>
      ) : routes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
          尚無班表資料，請點擊「📥 重新匯入 Excel」
        </div>
      ) : (
        Object.entries(groupedByType).map(([type, typeRoutes]) => (
          <div key={type} style={{ marginBottom: 24 }}>
            {/* 類型分組標頭 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2,
                background: TYPE_COLORS[type] || "#6b7280" }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{type}</span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>（{typeRoutes.length} 條路線）</span>
            </div>

            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)" }}>
                    {["路線編號", "車型", "司機工號", "司機姓名", "出車時段", "碼頭", "站點數", "操作"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left",
                        color: "#fff", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {typeRoutes.map((r, i) => (
                    <React.Fragment key={r.id}>
                      <tr style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb",
                        borderBottom: "1px solid #f3f4f6",
                        transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#eff6ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#f9fafb")}>
                        <td style={{ padding: "8px 14px", fontWeight: 700, color: "#1e3a8a" }}>
                          {r.route_no}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11,
                            background: "#f3f4f6", color: "#374151" }}>
                            {r.vehicle_type || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", fontFamily: "monospace",
                          color: r.shopee_driver_id ? "#0284c7" : "#9ca3af" }}>
                          {r.shopee_driver_id || "—"}
                        </td>
                        <td style={{ padding: "8px 14px", color: "#374151" }}>
                          {r.driver_name || <span style={{ color: "#9ca3af" }}>—</span>}
                          {r.driver_phone && (
                            <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 6 }}>
                              {r.driver_phone}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          {r.departure_time ? (
                            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11,
                              background: "#dbeafe", color: "#1e40af", fontWeight: 600 }}>
                              {r.departure_time}
                            </span>
                          ) : <span style={{ color: "#9ca3af" }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>
                          {r.dock_no || "—"}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11,
                            background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>
                            {r.stop_count} 站
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <button onClick={() => loadStops(r.id)}
                            style={{ padding: "4px 12px", border: "1px solid #d1d5db",
                              borderRadius: 6, fontSize: 12, cursor: "pointer",
                              background: expandedId === r.id ? "#1d4ed8" : "#fff",
                              color: expandedId === r.id ? "#fff" : "#374151",
                              fontWeight: expandedId === r.id ? 600 : 400 }}>
                            {expandedId === r.id ? "▲ 收合" : "▼ 展開路線"}
                          </button>
                        </td>
                      </tr>
                      {/* 展開：門市站點 */}
                      {expandedId === r.id && (
                        <tr>
                          <td colSpan={8} style={{ padding: "0 14px 12px 14px",
                            background: "#f0f9ff", borderBottom: "1px solid #e0f2fe" }}>
                            {stopsLoading ? (
                              <div style={{ padding: 12, color: "#9ca3af" }}>⏳ 載入站點…</div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#0284c7",
                                  padding: "10px 0 6px" }}>
                                  📍 路線站點（共 {stops.length} 站）
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {stops.map(s => (
                                    <div key={s.id} style={{ display: "flex", alignItems: "center",
                                      gap: 6, padding: "4px 10px",
                                      background: s.is_ndd ? "#fdf4ff" : "#fff",
                                      border: `1px solid ${s.is_ndd ? "#e9d5ff" : "#e5e7eb"}`,
                                      borderRadius: 8, fontSize: 12 }}>
                                      <span style={{ color: "#9ca3af", fontSize: 11, minWidth: 20,
                                        textAlign: "center", fontWeight: 700 }}>
                                        {s.stop_order}
                                      </span>
                                      <span style={{ color: "#111827" }}>{s.store_name}</span>
                                      {s.is_ndd && (
                                        <span style={{ fontSize: 10, padding: "1px 5px",
                                          background: "#ede9fe", color: "#6d28d9", borderRadius: 4 }}>
                                          日配
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {stops[0]?.store_address && (
                                  <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
                                    首站地址：{stops[0].store_address}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
