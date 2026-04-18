/**
 * PlatformRequirementsTab.tsx — 物流媒合平台客戶需求確認表
 *
 * 5大類 × 23項功能，每項可標記：✅需要 / ❌不需要 / ⬜待確認
 * - 即時更新（逐項儲存）
 * - 進度統計圓餅視覺化
 * - 匯出 CSV、列印確認書
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Printer, Download, RotateCcw, CheckCircle2, XCircle, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── 類型 ─────────────────────────────────────────────────────────────────
interface RequirementItem {
  id:          number;
  seq:         number;
  category:    string;
  feature:     string;
  description: string;
  is_needed:   "pending" | "yes" | "no";
  notes:       string | null;
}

// ── 分類 meta ─────────────────────────────────────────────────────────────
const CAT_META: Record<string, { emoji: string; color: string; bg: string }> = {
  "貨主端(App/Web)": { emoji: "📦", color: "#2563eb", bg: "#eff6ff" },
  "司機端(App)":     { emoji: "🚛", color: "#059669", bg: "#f0fdf4" },
  "管理後台":        { emoji: "🖥️",  color: "#7c3aed", bg: "#faf5ff" },
  "加盟制度/投資端": { emoji: "💼", color: "#d97706", bg: "#fffbeb" },
  "技術需求":        { emoji: "⚙️",  color: "#0891b2", bg: "#ecfeff" },
};
function catMeta(cat: string) {
  return CAT_META[cat] ?? { emoji: "📋", color: "#374151", bg: "#f9fafb" };
}

// ── 狀態 meta ────────────────────────────────────────────────────────────
const STATUS_META = {
  pending: { label: "待確認", color: "#9ca3af", bg: "#f3f4f6", icon: <Circle    className="w-4 h-4" /> },
  yes:     { label: "需要",   color: "#059669", bg: "#f0fdf4", icon: <CheckCircle2 className="w-4 h-4" /> },
  no:      { label: "不需要", color: "#dc2626", bg: "#fef2f2", icon: <XCircle    className="w-4 h-4" /> },
};

export default function PlatformRequirementsTab() {
  const { toast } = useToast();
  const [items, setItems]       = useState<RequirementItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState<number | null>(null);  // id being saved
  const [notes, setNotes]       = useState<Record<number, string>>({});

  // ── 載入 ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch(apiUrl("/platform-requirements")).then(r => r.json());
      if (d.ok) {
        setItems(d.items);
        const n: Record<number, string> = {};
        d.items.forEach((i: RequirementItem) => { n[i.id] = i.notes ?? ""; });
        setNotes(n);
      }
    } catch { toast({ title: "載入失敗", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── 更新單項 ────────────────────────────────────────────────────────────
  async function update(item: RequirementItem, is_needed: "pending" | "yes" | "no") {
    setSaving(item.id);
    try {
      const d = await fetch(apiUrl(`/platform-requirements/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_needed, notes: notes[item.id] || null }),
      }).then(r => r.json());
      if (d.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_needed } : i));
      }
    } catch { toast({ title: "儲存失敗", variant: "destructive" }); }
    finally { setSaving(null); }
  }

  async function saveNotes(item: RequirementItem) {
    await fetch(apiUrl(`/platform-requirements/${item.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_needed: item.is_needed, notes: notes[item.id] || null }),
    });
  }

  // ── 重設 ────────────────────────────────────────────────────────────────
  async function reset() {
    if (!confirm("確定重設所有項目為「待確認」？")) return;
    await fetch(apiUrl("/platform-requirements/reset"), { method: "POST" });
    toast({ title: "已重設所有項目" });
    load();
  }

  // ── 匯出 CSV ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["序號", "類別", "功能", "描述", "是否需要", "備註"];
    const rows = items.map(i => [
      i.seq, i.category, i.feature, i.description,
      i.is_needed === "yes" ? "需要" : i.is_needed === "no" ? "不需要" : "待確認",
      i.notes ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `物流媒合平台需求確認表_${new Date().toLocaleDateString("zh-TW").replace(/\//g,"-")}.csv`;
    a.click();
  }

  // ── 列印確認書 ─────────────────────────────────────────────────────────
  function print() {
    const grouped = items.reduce((acc, i) => {
      if (!acc[i.category]) acc[i.category] = [];
      acc[i.category].push(i); return acc;
    }, {} as Record<string, RequirementItem[]>);

    const catHtml = Object.entries(grouped).map(([cat, catItems]) => `
      <h3 style="margin:16px 0 6px;color:#1e40af;border-bottom:2px solid #bfdbfe;padding-bottom:4px">${cat}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px;text-align:left;font-size:12px;border:1px solid #e2e8f0">功能</th>
          <th style="padding:6px;text-align:left;font-size:12px;border:1px solid #e2e8f0">描述</th>
          <th style="padding:6px;text-align:center;font-size:12px;border:1px solid #e2e8f0;width:70px">是否需要</th>
          <th style="padding:6px;text-align:left;font-size:12px;border:1px solid #e2e8f0">備註</th>
        </tr></thead>
        <tbody>
        ${catItems.map(i => `
          <tr>
            <td style="padding:6px;border:1px solid #e2e8f0;font-size:12px;font-weight:600">${i.feature}</td>
            <td style="padding:6px;border:1px solid #e2e8f0;font-size:11px;color:#555">${i.description}</td>
            <td style="padding:6px;border:1px solid #e2e8f0;text-align:center;font-size:12px;
              color:${i.is_needed==="yes"?"#059669":i.is_needed==="no"?"#dc2626":"#9ca3af"}">
              ${i.is_needed==="yes"?"✅ 需要":i.is_needed==="no"?"❌ 不需要":"⬜ 待確認"}
            </td>
            <td style="padding:6px;border:1px solid #e2e8f0;font-size:11px">${i.notes ?? ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>`).join("");

    const yesCount = items.filter(i => i.is_needed === "yes").length;
    const noCount  = items.filter(i => i.is_needed === "no").length;
    const html = `
<html><head><meta charset="utf-8"><title>物流媒合平台客戶需求確認表</title>
<style>body{font-family:sans-serif;padding:24px;max-width:900px;margin:auto}
@media print{body{padding:0}}
</style></head><body>
<h1 style="text-align:center;margin-bottom:4px">物流媒合平台</h1>
<h2 style="text-align:center;margin:0 0 4px;color:#555;font-size:16px">客戶需求確認表</h2>
<p style="text-align:center;color:#888;font-size:12px;margin:0 0 16px">列印日期：${new Date().toLocaleDateString("zh-TW")}</p>
<div style="display:flex;gap:24px;justify-content:center;margin-bottom:20px;font-size:13px">
  <span style="color:#059669">✅ 需要：${yesCount} 項</span>
  <span style="color:#dc2626">❌ 不需要：${noCount} 項</span>
  <span style="color:#9ca3af">⬜ 待確認：${items.length - yesCount - noCount} 項</span>
</div>
${catHtml}
<div style="margin-top:40px;display:flex;justify-content:space-between">
  <div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">客戶確認簽名</div>
  <div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">業務代表簽名</div>
</div>
</body></html>`;
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // ── 統計 ────────────────────────────────────────────────────────────────
  const yesCount     = items.filter(i => i.is_needed === "yes").length;
  const noCount      = items.filter(i => i.is_needed === "no").length;
  const pendingCount = items.filter(i => i.is_needed === "pending").length;
  const total        = items.length;
  const confirmedPct = total > 0 ? Math.round(((yesCount + noCount) / total) * 100) : 0;

  // 依類別分組
  const grouped = items.reduce((acc, i) => {
    if (!acc[i.category]) acc[i.category] = [];
    acc[i.category].push(i); return acc;
  }, {} as Record<string, RequirementItem[]>);

  return (
    <div className="space-y-4">

      {/* ── 統計列 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "功能總項數", val: total,        color: "#374151", bg: "#f9fafb", icon: "📋" },
          { label: "確認需要",   val: yesCount,     color: "#059669", bg: "#f0fdf4", icon: "✅" },
          { label: "確認不需要", val: noCount,       color: "#dc2626", bg: "#fef2f2", icon: "❌" },
          { label: "確認進度",   val: `${confirmedPct}%`, color: "#2563eb", bg: "#eff6ff", icon: "📊" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="text-2xl">{s.icon}</div>
            <div>
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 進度條 */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>確認進度</span>
          <span>{yesCount + noCount} / {total} 項已確認</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: "#e5e7eb" }}>
          <div style={{ width: `${total > 0 ? (yesCount / total) * 100 : 0}%`, background: "#059669", transition: "width 0.4s" }} />
          <div style={{ width: `${total > 0 ? (noCount  / total) * 100 : 0}%`, background: "#dc2626", transition: "width 0.4s" }} />
        </div>
        <div className="flex gap-4 text-xs text-gray-400 mt-1">
          <span style={{ color: "#059669" }}>■ 需要</span>
          <span style={{ color: "#dc2626" }}>■ 不需要</span>
          <span style={{ color: "#d1d5db" }}>■ 待確認 ({pendingCount})</span>
        </div>
      </div>

      {/* ── 工具列 ── */}
      <div className="flex gap-2 flex-wrap justify-end">
        <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-red-500 border-red-200" onClick={reset}>
          <RotateCcw className="w-3.5 h-3.5 mr-1" />重設全部
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}>
          <Download className="w-3.5 h-3.5 mr-1" />匯出 CSV
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={print}>
          <Printer className="w-3.5 h-3.5 mr-1" />列印確認書
        </Button>
      </div>

      {/* ── 功能清單（依類別分組）── */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">載入中…</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => {
          const meta      = catMeta(cat);
          const catYes    = catItems.filter(i => i.is_needed === "yes").length;
          const catTotal  = catItems.length;
          return (
            <div key={cat}>
              {/* 類別標題 */}
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-bold" style={{ color: meta.color }}>
                  {meta.emoji} {cat}
                </div>
                <div className="h-px flex-1" style={{ background: `${meta.color}30` }} />
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: meta.bg, color: meta.color }}>
                  {catYes}/{catTotal} 確認需要
                </span>
              </div>

              {/* 功能卡片 */}
              <div className="space-y-2 mb-4">
                {catItems.map(item => {
                  const sm = STATUS_META[item.is_needed];
                  const isSaving = saving === item.id;
                  return (
                    <Card key={item.id} className="hover:shadow-sm transition-shadow"
                      style={{ borderLeft: `4px solid ${item.is_needed === "yes" ? "#059669" : item.is_needed === "no" ? "#dc2626" : "#d1d5db"}` }}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          {/* 序號 */}
                          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: meta.bg, color: meta.color }}>
                            {item.seq}
                          </div>

                          {/* 功能資訊 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-800">{item.feature}</span>
                              <span className="text-xs text-gray-500 flex-1">{item.description}</span>
                            </div>

                            {/* 備注輸入 */}
                            <input
                              className="mt-1.5 w-full text-xs border rounded px-2 py-1 text-gray-700 bg-white"
                              placeholder="備注（選填）…"
                              value={notes[item.id] ?? ""}
                              onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                              onBlur={() => saveNotes(item)}
                              style={{ borderColor: "#e5e7eb" }}
                            />
                          </div>

                          {/* 狀態按鈕組 */}
                          <div className="shrink-0 flex gap-1">
                            {(["yes", "pending", "no"] as const).map(status => {
                              const s = STATUS_META[status];
                              const active = item.is_needed === status;
                              return (
                                <button
                                  key={status}
                                  onClick={() => update(item, status)}
                                  disabled={isSaving}
                                  title={s.label}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                                  style={{
                                    background: active ? s.bg : "#f9fafb",
                                    color:      active ? s.color : "#d1d5db",
                                    border:     `2px solid ${active ? s.color : "#e5e7eb"}`,
                                    cursor:     isSaving ? "not-allowed" : "pointer",
                                  }}
                                >
                                  {isSaving && active
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : s.icon}
                                </button>
                              );
                            })}
                          </div>

                          {/* 目前狀態 badge */}
                          <div className="shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                            style={{ background: sm.bg, color: sm.color, minWidth: 56, textAlign: "center" }}>
                            {sm.label}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {/* 底部說明 */}
      <div className="text-center text-xs text-gray-400 py-2 border-t">
        ✅ 需要 = 確認納入開發 · ❌ 不需要 = 本期不開發 · ⬜ 待確認 = 尚未決定
      </div>
    </div>
  );
}
