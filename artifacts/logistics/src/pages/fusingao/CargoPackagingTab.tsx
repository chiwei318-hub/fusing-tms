/**
 * CargoPackagingTab.tsx — 台灣貨品包裝類型參考表
 *
 * 10 大類 × 32 種貨品 × N 種包裝方式
 * - 分類 tab 篩選（全部 + 10 類）
 * - 關鍵字搜尋（貨品名稱 or 包裝方式）
 * - 卡片式 Grid 顯示，點擊包裝 badge 可複製
 */

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Package, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface PackagingItem {
  id:                number;
  category:          string;
  cargo_type:        string;
  packaging_methods: string[];
  is_custom:         boolean;
}

// 分類對應 emoji 與顏色
const CAT_META: Record<string, { emoji: string; color: string; bg: string }> = {
  "食品飲料類":    { emoji: "🍱", color: "#059669", bg: "#f0fdf4" },
  "農產品/飼料":   { emoji: "🌾", color: "#d97706", bg: "#fffbeb" },
  "生活用品/日用品": { emoji: "🧴", color: "#2563eb", bg: "#eff6ff" },
  "服飾/鞋類":     { emoji: "👗", color: "#db2777", bg: "#fdf2f8" },
  "3C/電器":      { emoji: "💻", color: "#7c3aed", bg: "#faf5ff" },
  "建材/工業品":   { emoji: "🏗️",  color: "#9a3412", bg: "#fff7ed" },
  "化工/原料":     { emoji: "⚗️",  color: "#dc2626", bg: "#fef2f2" },
  "醫療/保健":     { emoji: "💊", color: "#0891b2", bg: "#ecfeff" },
  "電商/零售":     { emoji: "📦", color: "#4f46e5", bg: "#eef2ff" },
  "特殊貨":        { emoji: "🚀", color: "#374151", bg: "#f9fafb" },
};

function getMeta(cat: string) {
  return CAT_META[cat] ?? { emoji: "📦", color: "#374151", bg: "#f9fafb" };
}

export default function CargoPackagingTab() {
  const { toast } = useToast();
  const [items, setItems]      = useState<PackagingItem[]>([]);
  const [cats, setCats]        = useState<string[]>([]);
  const [selCat, setSelCat]    = useState("全部");
  const [search, setSearch]    = useState("");
  const [loading, setLoading]  = useState(false);

  // ── 載入分類 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(apiUrl("/cargo-packaging/cats"))
      .then(r => r.json())
      .then(d => { if (d.ok) setCats(d.categories); })
      .catch(() => {});
  }, []);

  // ── 載入項目 ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selCat !== "全部") params.set("category", selCat);
      if (search.trim())    params.set("q", search.trim());
      const r = await fetch(apiUrl(`/cargo-packaging?${params}`));
      const d = await r.json();
      if (d.ok) setItems(d.items);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [selCat, search, toast]);

  useEffect(() => { load(); }, [load]);

  // 點擊 Badge 複製包裝方式
  function copyBadge(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    toast({ title: `已複製：${text}`, duration: 1500 });
  }

  // 依分類分組（全部模式）
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, PackagingItem[]>);

  const totalPkgCount = items.reduce((s, i) => s + i.packaging_methods.length, 0);

  return (
    <div className="space-y-4">

      {/* ── 頁首統計 ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "📦", val: cats.length,      label: "貨品大類",   color: "#2563eb", bg: "#eff6ff" },
          { icon: "🗂️", val: items.length,     label: "貨品細項",   color: "#059669", bg: "#f0fdf4" },
          { icon: "🏷️", val: totalPkgCount,    label: "包裝方式數", color: "#7c3aed", bg: "#faf5ff" },
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

      {/* ── 搜尋 & 分類篩選 ── */}
      <div className="space-y-2">
        {/* 搜尋框 */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9 h-9"
            placeholder="搜尋貨品名稱或包裝方式…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {loading && <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 animate-spin" />}
        </div>

        {/* 分類 tab 列 */}
        <div className="flex gap-1.5 flex-wrap">
          {["全部", ...cats].map(cat => {
            const meta = getMeta(cat);
            const active = selCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelCat(cat)}
                className="text-xs px-3 py-1.5 rounded-full font-medium transition-all"
                style={{
                  background: active ? meta.color : "#f3f4f6",
                  color:      active ? "#fff"      : "#374151",
                  border:     active ? `1px solid ${meta.color}` : "1px solid #e5e7eb",
                }}
              >
                {cat !== "全部" ? `${meta.emoji} ` : ""}{cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 結果顯示 ── */}
      {items.length === 0 && !loading ? (
        <div className="py-16 text-center text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">找不到符合條件的貨品</p>
        </div>
      ) : selCat === "全部" ? (
        // 全部模式：按分類展示區塊
        Object.entries(grouped).map(([cat, catItems]) => {
          const meta = getMeta(cat);
          return (
            <div key={cat}>
              {/* 分類標題 */}
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
        // 單分類模式：直接顯示 Grid
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {items.map(item => {
            const meta = getMeta(item.category);
            return <PackagingCard key={item.id} item={item} meta={meta} onCopy={copyBadge} />;
          })}
        </div>
      )}

      {/* 底部提示 */}
      <div className="text-center text-xs text-gray-400 py-2">
        點擊包裝方式標籤可複製文字 · 資料來源：台灣物流業通用標準
      </div>
    </div>
  );
}

// ── 單張貨品卡片 ─────────────────────────────────────────────────────────────
function PackagingCard({
  item, meta, onCopy,
}: {
  item: PackagingItem;
  meta: { emoji: string; color: string; bg: string };
  onCopy: (text: string) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${meta.color}` }}>
      <CardContent className="p-3">
        {/* 貨品名稱 */}
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
          <span className="text-sm font-semibold text-gray-800">{item.cargo_type}</span>
          {item.is_custom && (
            <Badge className="text-[10px] px-1 py-0" style={{ background: "#fef3c7", color: "#92400e" }}>
              自訂
            </Badge>
          )}
        </div>

        {/* 包裝方式 badges */}
        <div className="flex flex-wrap gap-1">
          {item.packaging_methods.map((pm, i) => (
            <button
              key={i}
              onClick={() => onCopy(pm)}
              title="點擊複製"
              className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 active:scale-95"
              style={{
                background: `${meta.color}12`,
                borderColor: `${meta.color}40`,
                color: meta.color,
                cursor: "pointer",
              }}
            >
              {pm}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
