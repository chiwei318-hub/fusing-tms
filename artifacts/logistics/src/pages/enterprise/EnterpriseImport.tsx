import { useRef, useState } from "react";
import { Link } from "wouter";
import {
  FileSpreadsheet, Download, Upload, CheckCircle, XCircle,
  AlertCircle, RotateCcw, ArrowRight, FileText, Info, BarChart2,
} from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PreviewRow {
  rowNum: number;
  valid: boolean;
  errors: string[];
  preview: {
    pickup_address: string;
    delivery_address: string;
    cargo_description: string;
    quantity: string | number;
    weight: string | number;
    pickup_date: string;
    pickup_time: string;
    delivery_date: string;
    delivery_time: string;
    receiver_name: string;
    notes: string;
  };
}

interface DryResult {
  total: number;
  valid: number;
  errors: number;
  rows: PreviewRow[];
}

export default function EnterpriseImport({ session }: { session: EnterpriseSession }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dryResult, setDryResult] = useState<DryResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ inserted: number; errors: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function downloadTemplate() {
    const a = document.createElement("a");
    a.href = `${BASE}/api/enterprise/orders/import-template`;
    a.download = "企業訂單批量匯入範本.xlsx";
    a.click();
  }

  async function handleFile(f: File) {
    setFile(f);
    setDryResult(null);
    setDone(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/orders/bulk-import?dry_run=1`, {
        method: "POST", body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失敗");
      setDryResult(data as DryResult);
    } catch (e: any) {
      showToast(e.message ?? "解析失敗", false);
      setFile(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!file || !dryResult) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/orders/bulk-import`, {
        method: "POST", body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "匯入失敗");
      setDone({ inserted: data.inserted, errors: data.skipped_errors ?? 0 });
      showToast(`成功建立 ${data.inserted} 筆訂單！`);
    } catch (e: any) {
      showToast(e.message ?? "匯入失敗", false);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setDryResult(null);
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-[#0d2d6e]" />
        Excel / Google Sheet 批量匯入
      </h1>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2 transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Shopee billing hint */}
      <Link href="/enterprise/shopee-billing">
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-orange-100 transition-colors">
          <BarChart2 className="w-5 h-5 text-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">要匯入蝦皮月結對帳 Excel？</p>
            <p className="text-xs text-orange-600 mt-0.5">請改用「蝦皮對帳」功能，支援店配車 / NDD / WHNDD / 罰款明細自動解析</p>
          </div>
          <ArrowRight className="w-4 h-4 text-orange-400 shrink-0" />
        </div>
      </Link>

      {/* Step 1: Guide */}
      {!file && !loading && (
        <>
          {/* How-to card */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
            <p className="text-sm font-bold text-[#0d2d6e] flex items-center gap-2">
              <Info className="w-4 h-4" />使用說明
            </p>
            <div className="space-y-2">
              {[
                { step: "1", text: "下載範本 Excel，依欄位填入送貨資料（取貨地址、送貨地址必填）" },
                { step: "2", text: "如使用 Google 試算表，填完後點「檔案 → 下載 → Microsoft Excel (.xlsx)」或「CSV」" },
                { step: "3", text: "上傳檔案，系統預覽並驗證每一筆資料" },
                { step: "4", text: "確認無誤後點「確認匯入」，系統自動建立訂單並通知派車" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#0d2d6e] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
                  <p className="text-sm text-gray-700">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Download + Upload */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={downloadTemplate}
              className="flex flex-col items-center gap-2 p-5 bg-white border-2 border-[#0d2d6e]/20 rounded-2xl hover:bg-blue-50 hover:border-[#0d2d6e]/40 transition-all">
              <div className="w-10 h-10 bg-[#0d2d6e]/10 rounded-xl flex items-center justify-center">
                <Download className="w-5 h-5 text-[#0d2d6e]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-800">下載 Excel 範本</p>
                <p className="text-xs text-gray-500 mt-0.5">含欄位說明和範例</p>
              </div>
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 bg-white border-2 border-dashed border-emerald-400 rounded-2xl hover:bg-emerald-50 transition-all">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-800">上傳檔案</p>
                <p className="text-xs text-gray-500 mt-0.5">.xlsx 或 .csv</p>
              </div>
            </button>
          </div>

          {/* Drag & Drop zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-[#0d2d6e]/40 hover:bg-gray-50 transition-all cursor-pointer"
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => e.preventDefault()}>
            <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-600">拖曳檔案到這裡，或點擊選擇</p>
            <p className="text-xs text-gray-400 mt-1">支援 .xlsx、.csv，最大 10MB</p>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="w-10 h-10 border-3 border-[#0d2d6e] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">正在解析檔案...</p>
        </div>
      )}

      {/* Preview */}
      {dryResult && !done && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-gray-900">{dryResult.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">總筆數</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-emerald-700">{dryResult.valid}</p>
              <p className="text-xs text-emerald-600 mt-0.5">✓ 可匯入</p>
            </div>
            <div className={`rounded-2xl p-4 text-center border ${dryResult.errors > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
              <p className={`text-2xl font-black ${dryResult.errors > 0 ? "text-red-600" : "text-gray-400"}`}>{dryResult.errors}</p>
              <p className={`text-xs mt-0.5 ${dryResult.errors > 0 ? "text-red-500" : "text-gray-400"}`}>✗ 有錯誤</p>
            </div>
          </div>

          {/* Smart diagnostic banner – when ALL rows have same column-missing error */}
          {dryResult.errors > 0 && (() => {
            const allSameColError = dryResult.rows.every(r =>
              !r.valid && r.errors.some(e => e.includes("取貨地址") || e.includes("送貨地址"))
            );
            if (!allSameColError) return null;
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">可能欄位標題不符合範本格式</p>
                  <p className="text-xs text-amber-700 mt-1">
                    系統找不到「<strong>取貨地址</strong>」或「<strong>送貨地址</strong>」欄位。<br />
                    請確認第一列（標題列）的欄位名稱與範本完全一致，或重新下載範本填寫。
                  </p>
                  <button onClick={downloadTemplate}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-semibold transition-colors">
                    <Download className="w-3.5 h-3.5" /> 重新下載範本
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Row preview */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-700">預覽資料（前 {Math.min(dryResult.rows.length, 20)} 筆）</p>
              <p className="text-xs text-gray-400">{file?.name}</p>
            </div>
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {dryResult.rows.slice(0, 20).map(row => (
                <div key={row.rowNum} className={`px-4 py-3 ${row.valid ? "" : "bg-red-50/60"}`}>
                  <div className="flex items-start gap-2">
                    {row.valid
                      ? <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">列 #{row.rowNum}</span>
                        {row.preview.cargo_description && (
                          <span className="text-xs text-gray-500 truncate">{row.preview.cargo_description}</span>
                        )}
                      </div>
                      {/* Address lines – only show when not empty */}
                      {row.preview.pickup_address ? (
                        <p className="text-xs text-gray-800 truncate">
                          <span className="text-[#0d2d6e] font-bold">取</span>{" "}{row.preview.pickup_address}
                        </p>
                      ) : row.errors.some(e => e.includes("取貨地址")) ? (
                        <p className="text-xs text-red-400 italic">（取貨地址未填）</p>
                      ) : null}
                      {row.preview.delivery_address ? (
                        <p className="text-xs text-gray-800 truncate">
                          <span className="text-emerald-600 font-bold">送</span>{" "}{row.preview.delivery_address}
                        </p>
                      ) : row.errors.some(e => e.includes("送貨地址")) ? (
                        <p className="text-xs text-red-400 italic">（送貨地址未填）</p>
                      ) : null}
                      {row.preview.pickup_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {row.preview.pickup_date}{row.preview.pickup_time ? ` ${row.preview.pickup_time}` : ""}
                          {row.preview.receiver_name ? ` → ${row.preview.receiver_name}` : ""}
                        </p>
                      )}
                      {/* Errors – one per line */}
                      {row.errors.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {row.errors.map((e, i) => (
                            <li key={i} className="text-xs text-red-600 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {dryResult.errors > 0 && dryResult.valid === 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">所有資料均有錯誤，無法匯入</p>
                <p className="text-xs text-red-600 mt-0.5">請依照上方提示修正後重新上傳，或下載範本重新填寫。</p>
              </div>
            </div>
          )}
          {dryResult.errors > 0 && dryResult.valid > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span><strong>{dryResult.errors} 筆</strong>有錯誤將被略過，<strong>{dryResult.valid} 筆</strong>正常資料將建立訂單</span>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset}
              className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              <RotateCcw className="w-4 h-4" /> 重新上傳
            </button>
            {dryResult.valid > 0 && (
              <button onClick={confirmImport} disabled={importing}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0d2d6e] text-white rounded-xl text-sm font-bold hover:bg-[#1a3a8f] disabled:opacity-60">
                {importing ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 匯入中...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> 確認匯入 {dryResult.valid} 筆訂單</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Success */}
      {done && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-xl font-black text-gray-900">匯入完成！</p>
            <p className="text-3xl font-black text-emerald-600 mt-1">{done.inserted} <span className="text-base font-semibold text-gray-600">筆訂單已建立</span></p>
            {done.errors > 0 && (
              <p className="text-sm text-amber-600 mt-2">{done.errors} 筆因格式問題跳過</p>
            )}
            <p className="text-xs text-gray-500 mt-2">訂單已進入派車系統，可在「訂單記錄」查看狀態</p>
          </div>
          <div className="flex gap-3">
            <button onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600">
              <Upload className="w-4 h-4" /> 再次匯入
            </button>
            <a href="./orders"
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#0d2d6e] text-white rounded-xl text-sm font-bold">
              <FileText className="w-4 h-4" /> 查看訂單 <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
