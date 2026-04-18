/**
 * CargoPackagingTab.tsx — 台灣貨品包裝類型參考表 + 容器規格
 *
 * 頁籤一：貨品包裝 — 10 大類 × 33 種貨品 × N 包裝方式（分類篩選 + 關鍵字搜尋）
 * 頁籤二：容器規格 — 箱/籃/桶/袋 尺寸、體積、用途（體積視覺化比較）
 */

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Package, Tag, Ruler } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── 類型定義 ──────────────────────────────────────────────────────────────
interface PackagingItem {
  id: number; category: string; cargo_type: string;
  packaging_methods: string[]; is_custom: boolean;
}
interface Container {
  id: number; container_type: string; name_zh: string;
  size_desc: string; volume_m3: string; common_use: string; is_custom: boolean;
}

// ── 分類 Meta ─────────────────────────────────────────────────────────────
const CAT_META: Record<string, { emoji: string; color: string; bg: string }> = {
  "食品飲料類":      { emoji: "🍱", color: "#059669", bg: "#f0fdf4" },
  "農產品/飼料":     { emoji: "🌾", color: "#d97706", bg: "#fffbeb" },
  "生活用品/日用品": { emoji: "🧴", color: "#2563eb", bg: "#eff6ff" },
  "服飾/鞋類":       { emoji: "👗", color: "#db2777", bg: "#fdf2f8" },
  "3C/電器":         { emoji: "💻", color: "#7c3aed", bg: "#faf5ff" },
  "建材/工業品":     { emoji: "🏗️",  color: "#9a3412", bg: "#fff7ed" },
  "化工/原料":       { emoji: "⚗️",  color: "#dc2626", bg: "#fef2f2" },
  "醫療/保健":       { emoji: "💊", color: "#0891b2", bg: "#ecfeff" },
  "電商/零售":       { emoji: "📦", color: "#4f46e5", bg: "#eef2ff" },
  "特殊貨":          { emoji: "🚀", color: "#374151", bg: "#f9fafb" },
};
function getMeta(cat: string) {
  return CAT_META[cat] ?? { emoji: "📦", color: "#374151", bg: "#f9fafb" };
}

// ── 容器類型 Meta ─────────────────────────────────────────────────────────
const TYPE_META: Record<string, { emoji: string; color: string; bg: string }> = {
  "箱": { emoji: "📦", color: "#2563eb", bg: "#eff6ff" },
  "籃": { emoji: "🧺", color: "#059669", bg: "#f0fdf4" },
  "桶": { emoji: "🪣", color: "#d97706", bg: "#fffbeb" },
  "袋": { emoji: "👜", color: "#7c3aed", bg: "#faf5ff" },
};
function getTypeMeta(t: string) {
  return TYPE_META[t] ?? { emoji: "📦", color: "#374151", bg: "#f9fafb" };
}

export default function CargoPackagingTab() {
  const { toast } = useToast();
  const [view, setView] = useState<"packaging" | "containers">("packaging");

  return (
    <div className="space-y-4">
      {/* ── 主頁籤切換 ── */}
      <div style={{ display: "flex", gap: 8, borderBottom: "2px solid #e5e7eb", paddingBottom: 0 }}>
        {[
          { key: "packaging",   label: "📋 貨品包裝方式",  desc: "10大類 · 33種貨品" },
          { key: "containers",  label: "📐 容器尺寸規格",  desc: "箱籃桶袋 · 體積對照" },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key as "packaging" | "containers")}
            style={{
              padding: "8px 20px",
              borderBottom: view === v.key ? "2px solid #2563eb" : "2px solid transparent",
              color: view === v.key ? "#2563eb" : "#6b7280",
              fontWeight: view === v.key ? 700 : 400,
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              marginBottom: -2,
              transition: "all 0.15s",
            }}
          >
            {v.label}
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>{v.desc}</span>
          </button>
        ))}
      </div>

      {view === "packaging"
        ? <PackagingView toast={toast} />
        : <ContainersView toast={toast} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 頁籤一：貨品包裝方式
// ══════════════════════════════════════════════════════════════════════════
function PackagingView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [items, setItems]    = useState<PackagingItem[]>([]);
  const [cats, setCats]      = useState<string[]>([]);
  const [selCat, setSelCat]  = useState("全部");
  const [search, setSearch]  = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/cargo-packaging/cats"))
      .then(r => r.json())
      .then(d => { if (d.ok) setCats(d.categories); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (selCat !== "全部") p.set("category", selCat);
      if (search.trim())    p.set("q", search.trim());
      const d = await fetch(apiUrl(`/cargo-packaging?${p}`)).then(r => r.json());
      if (d.ok) setItems(d.items);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [selCat, search, toast]);

  useEffect(() => { load(); }, [load]);

  function copyBadge(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast({ title: `已複製：${text}`, duration: 1500 });
  }

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item); return acc;
  }, {} as Record<string, PackagingItem[]>);

  const totalPkg = items.reduce((s, i) => s + i.packaging_methods.length, 0);

  return (
    <div className="space-y-4">
      {/* 統計列 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "📦", val: cats.length,   label: "貨品大類",   color: "#2563eb", bg: "#eff6ff" },
          { icon: "🗂️", val: items.length,  label: "貨品細項",   color: "#059669", bg: "#f0fdf4" },
          { icon: "🏷️", val: totalPkg,      label: "包裝方式數", color: "#7c3aed", bg: "#faf5ff" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="text-2xl">{s.icon}</div>
            <div>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 搜尋 */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input className="pl-9 h-9" placeholder="搜尋貨品名稱或包裝方式…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {loading && <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 animate-spin" />}
      </div>

      {/* 分類篩選 */}
      <div className="flex gap-1.5 flex-wrap">
        {["全部", ...cats].map(cat => {
          const meta = getMeta(cat);
          const active = selCat === cat;
          return (
            <button key={cat} onClick={() => setSelCat(cat)}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
              style={{
                background: active ? meta.color : "#f3f4f6",
                color:      active ? "#fff"      : "#374151",
                border:     active ? `1px solid ${meta.color}` : "1px solid #e5e7eb",
              }}>
              {cat !== "全部" ? `${meta.emoji} ` : ""}{cat}
            </button>
          );
        })}
      </div>

      {/* 結果 */}
      {items.length === 0 && !loading ? (
        <div className="py-16 text-center text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">找不到符合條件的貨品</p>
        </div>
      ) : selCat === "全部" ? (
        Object.entries(grouped).map(([cat, catItems]) => {
          const meta = getMeta(cat);
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2 mt-2">
                <div className="text-base font-bold" style={{ color: meta.color }}>
                  {meta.emoji} {cat}
                </div>
                <div className="h-px flex-1" style={{ background: `${meta.color}30` }} />
                <span className="text-xs text-gray-400">{catItems.length} 種貨品</span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
                {catItems.map(item => (
                  <PackagingCard key={item.id} item={item} meta={meta} onCopy={copyBadge} />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {items.map(item => (
            <PackagingCard key={item.id} item={item} meta={getMeta(item.category)} onCopy={copyBadge} />
          ))}
        </div>
      )}

      <div className="text-center text-xs text-gray-400 py-2">
        點擊包裝方式標籤可複製文字 · 資料來源：台灣物流業通用標準
      </div>
    </div>
  );
}

function PackagingCard({
  item, meta, onCopy,
}: { item: PackagingItem; meta: { emoji: string; color: string; bg: string }; onCopy: (t: string) => void; }) {
  return (
    <Card className="hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${meta.color}` }}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
          <span className="text-sm font-semibold text-gray-800">{item.cargo_type}</span>
          {item.is_custom && (
            <Badge className="text-[10px] px-1 py-0" style={{ background: "#fef3c7", color: "#92400e" }}>自訂</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {item.packaging_methods.map((pm, i) => (
            <button key={i} onClick={() => onCopy(pm)} title="點擊複製"
              className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 active:scale-95"
              style={{ background: `${meta.color}12`, borderColor: `${meta.color}40`, color: meta.color, cursor: "pointer" }}>
              {pm}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 頁籤二：容器尺寸規格
// ══════════════════════════════════════════════════════════════════════════
const CONTAINER_TYPES = ["全部", "箱", "籃", "桶", "袋"];

function ContainersView({ toast }: { toast: ReturnType<typeof useToast>["toast"] }) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [selType, setSelType]       = useState("全部");
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (selType !== "全部") p.set("type", selType);
      if (search.trim())     p.set("q", search.trim());
      const d = await fetch(apiUrl(`/cargo-containers?${p}`)).then(r => r.json());
      if (d.ok) setContainers(d.containers);
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [selType, search, toast]);

  useEffect(() => { load(); }, [load]);

  // 最大體積（供視覺化比例）
  const maxVol = Math.max(...containers.map(c => Number(c.volume_m3)), 0.001);

  // 依類型分組
  const grouped = containers.reduce((acc, c) => {
    if (!acc[c.container_type]) acc[c.container_type] = [];
    acc[c.container_type].push(c); return acc;
  }, {} as Record<string, Container[]>);

  return (
    <div className="space-y-4">
      {/* 統計 */}
      <div className="grid grid-cols-4 gap-3">
        {CONTAINER_TYPES.filter(t => t !== "全部").map(t => {
          const meta = getTypeMeta(t);
          const cnt = containers.filter(c => c.container_type === t).length;
          return (
            <div key={t} className="rounded-xl p-3 text-center"
              style={{ background: meta.bg, border: `1px solid ${meta.color}22` }}>
              <div className="text-xl mb-0.5">{meta.emoji}</div>
              <div className="text-lg font-bold" style={{ color: meta.color }}>{cnt}</div>
              <div className="text-xs text-gray-500">{t} 類規格</div>
            </div>
          );
        })}
      </div>

      {/* 搜尋 + 類型篩選 */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input className="pl-9 h-9" placeholder="搜尋容器名稱、尺寸或用途…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {loading && <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 animate-spin" />}
        </div>
        <div className="flex gap-2">
          {CONTAINER_TYPES.map(t => {
            const meta = getTypeMeta(t);
            const active = selType === t;
            return (
              <button key={t} onClick={() => setSelType(t)}
                className="text-xs px-4 py-1.5 rounded-full font-medium transition-all"
                style={{
                  background: active ? meta.color : "#f3f4f6",
                  color:      active ? "#fff"      : "#374151",
                  border:     active ? `1px solid ${meta.color}` : "1px solid #e5e7eb",
                }}>
                {t !== "全部" ? `${meta.emoji} ` : ""}{t}
              </button>
            );
          })}
        </div>
      </div>

      {/* 結果：表格形式 */}
      {selType === "全部" ? (
        Object.entries(grouped).map(([type, items]) => {
          const meta = getTypeMeta(type);
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2 mt-3">
                <span className="text-base font-bold" style={{ color: meta.color }}>
                  {meta.emoji} {type}類容器
                </span>
                <div className="h-px flex-1" style={{ background: `${meta.color}30` }} />
                <span className="text-xs text-gray-400">{items.length} 種規格</span>
              </div>
              <ContainerTable items={items} maxVol={maxVol} meta={meta} />
            </div>
          );
        })
      ) : (
        <ContainerTable
          items={containers}
          maxVol={maxVol}
          meta={getTypeMeta(selType)}
        />
      )}

      <div className="text-center text-xs text-gray-400 py-2">
        <Ruler className="inline w-3 h-3 mr-1" />
        體積長條為相對比例（最大值 = 噸袋 1.000 m³）
      </div>
    </div>
  );
}

function ContainerTable({
  items, maxVol, meta,
}: { items: Container[]; maxVol: number; meta: { color: string; bg: string } }) {
  if (items.length === 0) return (
    <div className="py-8 text-center text-gray-400 text-sm">無資料</div>
  );

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: meta.bg }}>
            {["容器名稱", "尺寸 / 容量", "體積（m³）", "體積比例", "常見用途"].map(h => (
              <th key={h} style={{
                padding: "10px 14px", textAlign: "left",
                fontWeight: 600, color: meta.color,
                borderBottom: `2px solid ${meta.color}22`, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((c, i) => {
            const vol   = Number(c.volume_m3);
            const pct   = maxVol > 0 ? (vol / maxVol) * 100 : 0;
            const isLast = i === items.length - 1;
            return (
              <tr key={c.id}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                  borderBottom: isLast ? "none" : "1px solid #f3f4f6",
                }}
              >
                {/* 名稱 */}
                <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1f2937" }}>
                  {c.name_zh}
                  {c.is_custom && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 9 }}>
                      自訂
                    </span>
                  )}
                </td>
                {/* 尺寸 */}
                <td style={{ padding: "10px 14px", color: "#6b7280", fontFamily: "monospace", fontSize: 12 }}>
                  {c.size_desc}
                </td>
                {/* 體積數字 */}
                <td style={{ padding: "10px 14px", fontWeight: 700, color: meta.color, textAlign: "right", whiteSpace: "nowrap" }}>
                  {vol.toFixed(3)}
                </td>
                {/* 視覺長條 */}
                <td style={{ padding: "10px 14px", minWidth: 120 }}>
                  <div style={{ background: "#f3f4f6", borderRadius: 4, height: 10, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.max(pct, 2)}%`,
                      height: "100%",
                      background: meta.color,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{pct.toFixed(1)}%</div>
                </td>
                {/* 用途 */}
                <td style={{ padding: "10px 14px", color: "#374151" }}>
                  {c.common_use}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
