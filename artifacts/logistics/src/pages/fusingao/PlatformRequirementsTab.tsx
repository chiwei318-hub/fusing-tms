/**
 * PlatformRequirementsTab.tsx — 物流媒合平台需求確認 / 程式架構清單
 *
 * 兩份文件切換：
 *   📋 客戶需求確認表 (customer_req) — 5大類 × 23項
 *   🏗️ 程式架構清單  (architecture)  — 10大類 × 56項
 *
 * 每項可標記：✅需要 / ❌不需要 / ⬜待確認，即時儲存
 * 支援：進度統計列 / 重設 / 匯出CSV / 列印確認書
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
type IsNeeded = "pending" | "yes" | "no";
interface RequirementItem {
  id:          number;
  seq:         number;
  category:    string;
  feature:     string;
  description: string;
  is_needed:   IsNeeded;
  notes:       string | null;
  doc_type:    string;
}

type DocType = "customer_req" | "architecture" | "cfo_jd";

// ── 文件 meta ─────────────────────────────────────────────────────────────
interface DocMeta {
  label:    string;
  emoji:    string;
  title:    string;
  subtitle: string;
  statusLabels: { yes: string; no: string; pending: string };
}
const DOC_META: Record<DocType, DocMeta> = {
  customer_req: {
    label:"客戶需求確認", emoji:"📋",
    title:"客戶需求確認表", subtitle:"5大類 × 23項核心功能，對客確認用",
    statusLabels:{ yes:"需要", no:"不需要", pending:"待確認" },
  },
  architecture: {
    label:"程式架構清單", emoji:"🏗️",
    title:"物流平台程式架構清單", subtitle:"10大類 × 56項功能模組 + 成功KPI指標",
    statusLabels:{ yes:"需要", no:"不需要", pending:"待確認" },
  },
  cfo_jd: {
    label:"CFO 工作說明書", emoji:"📊",
    title:"運輸公司兼職財務長工作說明書", subtitle:"8大類 × 26項職責與交付成果追蹤",
    statusLabels:{ yes:"已完成", no:"暫緩", pending:"待執行" },
  },
};

// ── 分類顏色 ─────────────────────────────────────────────────────────────
const CAT_PALETTE = [
  { color:"#2563eb", bg:"#eff6ff" },
  { color:"#059669", bg:"#f0fdf4" },
  { color:"#7c3aed", bg:"#faf5ff" },
  { color:"#d97706", bg:"#fffbeb" },
  { color:"#0891b2", bg:"#ecfeff" },
  { color:"#dc2626", bg:"#fef2f2" },
  { color:"#0d9488", bg:"#f0fdfa" },
  { color:"#9333ea", bg:"#fdf4ff" },
  { color:"#16a34a", bg:"#f0fdf4" },
  { color:"#b45309", bg:"#fef3c7" },
  { color:"#1d4ed8", bg:"#dbeafe" },
];
function catMeta(cat: string, catList: string[]) {
  const idx = catList.indexOf(cat) % CAT_PALETTE.length;
  return CAT_PALETTE[Math.max(0, idx)];
}

// ── 狀態樣式（顏色/圖示不變，標籤動態由 docMeta.statusLabels 提供）────────
const STATUS_STYLE = {
  pending: { color:"#9ca3af", bg:"#f3f4f6", icon:<Circle      className="w-4 h-4" /> },
  yes:     { color:"#059669", bg:"#f0fdf4", icon:<CheckCircle2 className="w-4 h-4" /> },
  no:      { color:"#dc2626", bg:"#fef2f2", icon:<XCircle      className="w-4 h-4" /> },
};

export default function PlatformRequirementsTab() {
  const { toast } = useToast();
  const [docType, setDocType]   = useState<DocType>("customer_req");
  const [items, setItems]       = useState<RequirementItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState<number | null>(null);
  const [notes, setNotes]       = useState<Record<number, string>>({});

  // ── 載入 ────────────────────────────────────────────────────────────────
  const load = useCallback(async (dt: DocType) => {
    setLoading(true);
    try {
      const d = await fetch(apiUrl(`/platform-requirements?doc_type=${dt}`)).then(r => r.json());
      if (d.ok) {
        setItems(d.items);
        const n: Record<number, string> = {};
        d.items.forEach((i: RequirementItem) => { n[i.id] = i.notes ?? ""; });
        setNotes(n);
      }
    } catch { toast({ title:"載入失敗", variant:"destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(docType); }, [load, docType]);

  // ── 更新單項 ────────────────────────────────────────────────────────────
  async function update(item: RequirementItem, is_needed: IsNeeded) {
    setSaving(item.id);
    try {
      const d = await fetch(apiUrl(`/platform-requirements/${item.id}`), {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ is_needed, notes: notes[item.id] || null }),
      }).then(r => r.json());
      if (d.ok) setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_needed } : i));
    } catch { toast({ title:"儲存失敗", variant:"destructive" }); }
    finally { setSaving(null); }
  }

  async function saveNotes(item: RequirementItem) {
    await fetch(apiUrl(`/platform-requirements/${item.id}`), {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ is_needed: item.is_needed, notes: notes[item.id] || null }),
    });
  }

  // ── 重設 ────────────────────────────────────────────────────────────────
  async function reset() {
    const docMeta = DOC_META[docType];
    if (!confirm(`確定重設「${docMeta.label}」所有項目為「待確認」？`)) return;
    await fetch(apiUrl(`/platform-requirements/reset?doc_type=${docType}`), { method:"POST" });
    toast({ title:`已重設「${docMeta.label}」所有項目` });
    load(docType);
  }

  // ── 匯出 CSV ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["序號","類別","功能","描述","是否需要","備注"];
    const rows = items.map(i => [
      i.seq, i.category, i.feature, i.description,
      i.is_needed==="yes"?"需要":i.is_needed==="no"?"不需要":"待確認",
      i.notes ?? "",
    ]);
    const csv = [header,...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    const docMeta = DOC_META[docType];
    a.download = `物流平台_${docMeta.label}_${new Date().toLocaleDateString("zh-TW").replace(/\//g,"-")}.csv`;
    a.click();
  }

  // ── 列印確認書 ─────────────────────────────────────────────────────────
  function print() {
    const docMeta = DOC_META[docType];
    const grouped = items.reduce((acc,i) => {
      if (!acc[i.category]) acc[i.category] = [];
      acc[i.category].push(i); return acc;
    }, {} as Record<string, RequirementItem[]>);
    const yesCount = items.filter(i => i.is_needed==="yes").length;
    const noCount  = items.filter(i => i.is_needed==="no").length;

    const sl = docMeta.statusLabels;
    const catHtml = Object.entries(grouped).map(([cat, catItems]) => `
      <h3 style="margin:16px 0 6px;color:#1e40af;border-bottom:2px solid #bfdbfe;padding-bottom:4px">${cat}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:6px;text-align:left;font-size:11px;border:1px solid #e2e8f0">項目</th>
          <th style="padding:6px;text-align:left;font-size:11px;border:1px solid #e2e8f0">說明</th>
          <th style="padding:6px;text-align:center;font-size:11px;border:1px solid #e2e8f0;width:70px">狀態</th>
          <th style="padding:6px;text-align:left;font-size:11px;border:1px solid #e2e8f0">備注</th>
        </tr></thead><tbody>
        ${catItems.map(i => `
          <tr>
            <td style="padding:5px;border:1px solid #e2e8f0;font-size:11px;font-weight:600">${i.feature}</td>
            <td style="padding:5px;border:1px solid #e2e8f0;font-size:10px;color:#555">${i.description}</td>
            <td style="padding:5px;border:1px solid #e2e8f0;text-align:center;font-size:11px;
              color:${i.is_needed==="yes"?"#059669":i.is_needed==="no"?"#dc2626":"#9ca3af"}">
              ${i.is_needed==="yes"?"✅ "+sl.yes:i.is_needed==="no"?"❌ "+sl.no:"⬜ "+sl.pending}</td>
            <td style="padding:5px;border:1px solid #e2e8f0;font-size:10px">${i.notes ?? ""}</td>
          </tr>`).join("")}
        </tbody></table>`).join("");

    const sigRow = docType === "cfo_jd"
      ? `<div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">財務長確認簽名</div>
         <div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">老闆確認簽名</div>`
      : `<div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">客戶確認簽名</div>
         <div style="border-top:1px solid #ccc;padding-top:6px;width:200px;text-align:center;font-size:12px;color:#777">業務代表簽名</div>`;

    const html = `<html><head><meta charset="utf-8"><title>${docMeta.title}</title>
<style>body{font-family:sans-serif;padding:24px;max-width:950px;margin:auto}@media print{body{padding:0}}</style>
</head><body>
<h1 style="text-align:center;margin-bottom:4px">富詠運輸</h1>
<h2 style="text-align:center;margin:0 0 4px;color:#555;font-size:16px">${docMeta.title}</h2>
<p style="text-align:center;color:#888;font-size:12px;margin:0 0 16px">列印日期：${new Date().toLocaleDateString("zh-TW")}</p>
<div style="display:flex;gap:24px;justify-content:center;margin-bottom:20px;font-size:13px">
  <span style="color:#059669">✅ ${sl.yes}：${yesCount} 項</span>
  <span style="color:#dc2626">❌ ${sl.no}：${noCount} 項</span>
  <span style="color:#9ca3af">⬜ ${sl.pending}：${items.length-yesCount-noCount} 項</span>
</div>
${catHtml}
<div style="margin-top:40px;display:flex;justify-content:space-between">${sigRow}</div>
</body></html>`;
    const w = window.open("","_blank","width=1000,height=800");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // ── 統計 ────────────────────────────────────────────────────────────────
  const yesCount     = items.filter(i => i.is_needed==="yes").length;
  const noCount      = items.filter(i => i.is_needed==="no").length;
  const pendingCount = items.filter(i => i.is_needed==="pending").length;
  const total        = items.length;

  const grouped = items.reduce((acc,i) => {
    if (!acc[i.category]) acc[i.category] = [];
    acc[i.category].push(i); return acc;
  }, {} as Record<string, RequirementItem[]>);
  const catList = [...new Set(items.map(i => i.category))];

  const docMeta = DOC_META[docType];

  return (
    <div className="space-y-4">

      {/* ── 文件切換 ── */}
      <div className="flex gap-2">
        {(Object.keys(DOC_META) as DocType[]).map(dt => {
          const m = DOC_META[dt];
          const active = dt === docType;
          return (
            <button key={dt} onClick={() => setDocType(dt)}
              className="flex-1 rounded-xl px-4 py-3 text-left transition-all"
              style={{
                background: active ? "#1e40af" : "#f8fafc",
                color:      active ? "#fff"    : "#475569",
                border:     `2px solid ${active ? "#1e40af" : "#e2e8f0"}`,
              }}>
              <div className="text-lg leading-none mb-1">{m.emoji}</div>
              <div className="font-semibold text-sm">{m.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{m.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* ── 統計列 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"功能總項數", val:total,            color:"#374151", bg:"#f9fafb", icon:"📋" },
          { label:"確認需要",   val:yesCount,          color:"#059669", bg:"#f0fdf4", icon:"✅" },
          { label:"確認不需要", val:noCount,            color:"#dc2626", bg:"#fef2f2", icon:"❌" },
          { label:"確認進度",   val:total>0?`${Math.round(((yesCount+noCount)/total)*100)}%`:"—", color:"#2563eb", bg:"#eff6ff", icon:"📊" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 flex items-center gap-3"
            style={{ background:s.bg, border:`1px solid ${s.color}22` }}>
            <div className="text-2xl">{s.icon}</div>
            <div>
              <div className="text-xl font-bold" style={{ color:s.color }}>{s.val}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 進度條 */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{docMeta.label}確認進度</span>
          <span>{yesCount+noCount} / {total} 項已確認</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background:"#e5e7eb" }}>
          <div style={{ width:`${total>0?(yesCount/total)*100:0}%`, background:"#059669", transition:"width 0.4s" }} />
          <div style={{ width:`${total>0?(noCount/total)*100:0}%`,  background:"#dc2626", transition:"width 0.4s" }} />
        </div>
        <div className="flex gap-4 text-xs text-gray-400 mt-1">
          <span style={{ color:"#059669" }}>■ {docMeta.statusLabels.yes}</span>
          <span style={{ color:"#dc2626" }}>■ {docMeta.statusLabels.no}</span>
          <span style={{ color:"#d1d5db" }}>■ {docMeta.statusLabels.pending} ({pendingCount})</span>
        </div>
      </div>

      {/* ── 工具列 ── */}
      <div className="flex gap-2 flex-wrap justify-end">
        <Button variant="outline" size="sm" className="h-8" onClick={() => load(docType)} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading?"animate-spin":""}`} />
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

      {/* ── 功能清單 ── */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">載入中…</div>
      ) : (
        Object.entries(grouped).map(([cat, catItems]) => {
          const meta     = catMeta(cat, catList);
          const catYes   = catItems.filter(i => i.is_needed==="yes").length;
          const catTotal = catItems.length;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-bold" style={{ color:meta.color }}>{cat}</div>
                <div className="h-px flex-1" style={{ background:`${meta.color}30` }} />
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background:meta.bg, color:meta.color }}>
                  {catYes}/{catTotal} 確認需要
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {catItems.map(item => {
                  const sm       = { ...STATUS_STYLE[item.is_needed], label: docMeta.statusLabels[item.is_needed] };
                  const isSaving = saving === item.id;
                  return (
                    <Card key={item.id} className="hover:shadow-sm transition-shadow"
                      style={{ borderLeft:`4px solid ${item.is_needed==="yes"?"#059669":item.is_needed==="no"?"#dc2626":"#d1d5db"}` }}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          {/* 序號 */}
                          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background:meta.bg, color:meta.color }}>
                            {item.seq}
                          </div>

                          {/* 功能資訊 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-800">{item.feature}</span>
                              <span className="text-xs text-gray-500 flex-1">{item.description}</span>
                            </div>
                            <input
                              className="mt-1.5 w-full text-xs border rounded px-2 py-1 text-gray-700 bg-white"
                              placeholder="備注（選填）…"
                              value={notes[item.id] ?? ""}
                              onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                              onBlur={() => saveNotes(item)}
                              style={{ borderColor:"#e5e7eb" }}
                            />
                          </div>

                          {/* 狀態切換按鈕 */}
                          <div className="shrink-0 flex gap-1">
                            {(["yes","pending","no"] as const).map(status => {
                              const s      = { ...STATUS_STYLE[status], label: docMeta.statusLabels[status] };
                              const active = item.is_needed === status;
                              return (
                                <button key={status} onClick={() => update(item, status)}
                                  disabled={isSaving} title={s.label}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                                  style={{
                                    background: active ? s.bg    : "#f9fafb",
                                    color:      active ? s.color : "#d1d5db",
                                    border:     `2px solid ${active ? s.color : "#e5e7eb"}`,
                                    cursor:     isSaving ? "not-allowed" : "pointer",
                                  }}>
                                  {isSaving && active
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : s.icon}
                                </button>
                              );
                            })}
                          </div>

                          {/* 狀態 badge */}
                          <div className="shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                            style={{ background:sm.bg, color:sm.color, minWidth:56, textAlign:"center" }}>
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

      <div className="text-center text-xs text-gray-400 py-2 border-t">
        ✅ {docMeta.statusLabels.yes}　·　❌ {docMeta.statusLabels.no}　·　⬜ {docMeta.statusLabels.pending}
      </div>
    </div>
  );
}
