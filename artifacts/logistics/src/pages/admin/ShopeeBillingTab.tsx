import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { PrintSaveBar } from "@/components/PrintSaveBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2,
  ChevronDown, ChevronRight, BarChart3, Users, TruckIcon, ArrowDownCircle,
  ArrowUpCircle, RefreshCw, Eye
} from "lucide-react";
import { apiUrl } from "@/lib/api";

interface DriverSummary {
  driver_id: string;
  routes: number;
  trips: number;
  amount: number;
  types: string[];
}

interface PenaltyRow {
  date: string; soc: string; shop_name: string; reason: string;
  fleet: string; driver_id: string; amount: number;
  penalty_month: string; deduct_month: string; note: string;
}

interface SubsidyRow {
  date: string; fleet: string; business_date: string; shop_name: string;
  location: string; reason: string; amount: number; plate: string;
}

interface SummaryItem {
  name: string; gross: number; commission: number; net: number;
}

interface Preview {
  sheetNames: string[];
  period: { year: number; month: number };
  summary: {
    fleet_name: string; period_start: string; period_end: string;
    tax_free_total: number; tax_amount: number; billing_total: number;
    commission_rate: number; items: SummaryItem[];
  };
  grossTotal: number;
  penaltyTotal: number;
  subsidyTotal: number;
  driverCount: number;
  totalTrips: number;
  drivers: DriverSummary[];
  storeRouteCount: number;
  nddRouteCount: number;
  whnddRouteCount: number;
  penaltyCount: number;
  subsidyCount: number;
  penalties: PenaltyRow[];
  subsidies: SubsidyRow[];
}

interface Settlement {
  id: number;
  period_year: number;
  period_month: number;
  fleet_name: string;
  gross_total: string;
  commission: string;
  net_total: string;
  billing_total: string;
  penalty_total: string;
  subsidy_total: string;
  imported_at: string;
}

function fmt(n: number | string | undefined) {
  const v = Number(n ?? 0);
  return isNaN(v) ? "0" : v.toLocaleString("zh-TW");
}

function fmtDate(d: string) {
  if (!d) return "";
  return d.substring(0, 10);
}

export default function ShopeeBillingTab() {
  const [stage, setStage] = useState<"upload" | "preview" | "saved">("upload");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("drivers");
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      alert("請上傳 .xlsx 或 .xls 格式的 Excel 檔案");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action", "preview");
      const resp = await fetch(apiUrl("/shopee/billing-import"), { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "解析失敗");
      setPreview(data.preview);
      setStage("preview");
    } catch (err: any) {
      alert("解析失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleConfirmImport = async () => {
    if (!fileRef.current?.files?.[0]) {
      alert("請重新選擇檔案");
      setStage("upload");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", fileRef.current.files[0]);
      fd.append("action", "save");
      const resp = await fetch(apiUrl("/shopee/billing-import"), { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "匯入失敗");
      setSavedId(data.settlementId);
      setStage("saved");
      fetchHistory();
    } catch (err: any) {
      alert("匯入失敗：" + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const resp = await fetch(apiUrl("/shopee/settlements"));
      const data = await resp.json();
      setSettlements(data);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteSettlement = async (id: number) => {
    if (!confirm("確定要刪除此對帳紀錄？")) return;
    await fetch(apiUrl(`/shopee/settlements/${id}`), { method: "DELETE" });
    fetchHistory();
  };

  const typeColor: Record<string, string> = {
    "店配車": "bg-blue-100 text-blue-700",
    "NDD":    "bg-purple-100 text-purple-700",
    "WHNDD":  "bg-indigo-100 text-indigo-700",
  };

  // ── Upload Stage ─────────────────────────────────────────────────────────
  if (stage === "upload") {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">蝦皮月結對帳匯入</h2>
            <p className="text-sm text-gray-500 mt-0.5">上傳福星高每月對帳明細 Excel，自動解析路線趟次、罰款與金額</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}>
            <BarChart3 className="w-4 h-4 mr-1" /> 歷史紀錄
          </Button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all
            ${dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"}`}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
            <FileSpreadsheet className="w-8 h-8 text-blue-500" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-700">{dragging ? "放開以上傳" : "拖放 Excel 檔案至此"}</p>
            <p className="text-sm text-gray-400 mt-1">或點擊選擇檔案 · 支援 .xlsx 格式</p>
          </div>
          {loading && <div className="text-sm text-blue-600 animate-pulse">解析中…</div>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); }} />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800">支援工作表格式</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-amber-700">
            {["03.店配車", "03.NDD", "03.WHNDD", "03.(-)作業運輸罰款", "03.(+)交通罰單補助", "01.請款總表"].map(s => (
              <div key={s} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{s}</div>
            ))}
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">已匯入對帳紀錄</CardTitle>
              <Button variant="ghost" size="icon" onClick={fetchHistory} disabled={historyLoading}>
                <RefreshCw className={`w-4 h-4 ${historyLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {settlements.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">尚無匯入紀錄</p>
              ) : (
                <div className="space-y-2">
                  {settlements.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-semibold text-sm">{s.period_year} 年 {s.period_month} 月</span>
                        <span className="text-gray-500 text-xs ml-2">{s.fleet_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs">
                          <div className="font-medium text-green-700">含稅 NT${fmt(s.billing_total)}</div>
                          <div className="text-red-500">罰款 -{fmt(s.penalty_total)}</div>
                        </div>
                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600"
                          onClick={() => deleteSettlement(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Saved Stage ───────────────────────────────────────────────────────────
  if (stage === "saved") {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">匯入成功！</h3>
          <p className="text-gray-500 text-sm mt-1">對帳資料已儲存，編號 #{savedId}</p>
        </div>
        {preview && (
          <Card className="text-left">
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">期間</span>
                <span className="font-medium">{preview.period.year} 年 {preview.period.month} 月</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">總趟次</span>
                <span className="font-medium">{fmt(preview.totalTrips)} 趟</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">含稅請款</span>
                <span className="font-bold text-green-700">NT$ {fmt(preview.summary.billing_total || preview.grossTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">罰款扣款</span>
                <span className="font-medium text-red-600">-NT$ {fmt(preview.penaltyTotal)}</span>
              </div>
            </CardContent>
          </Card>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => { setStage("upload"); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>
            再次匯入
          </Button>
          <Button className="flex-1" onClick={() => { setShowHistory(true); fetchHistory(); setStage("upload"); }}>
            查看歷史
          </Button>
        </div>
      </div>
    );
  }

  // ── Preview Stage ─────────────────────────────────────────────────────────
  if (!preview) return null;
  const { period, summary, drivers, penalties, subsidies } = preview;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {period.year} 年 {period.month} 月 對帳預覽
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{summary.fleet_name || "富詠運輸有限公司"}</p>
        </div>
        <div className="flex gap-2 items-center">
          <PrintSaveBar title={`對帳預覽 ${period.year}年${period.month}月`} subtitle={summary.fleet_name || "富詠運輸有限公司"} />
          <Button variant="outline" onClick={() => { setStage("upload"); setPreview(null); }}>
            重新上傳
          </Button>
          <Button onClick={handleConfirmImport} disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white">
            {loading ? "匯入中…" : "確認匯入"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">含稅請款金額</div>
            <div className="text-xl font-bold text-green-700 mt-1">
              NT$ {fmt(summary.billing_total || preview.grossTotal)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              未稅 {fmt(summary.tax_free_total || preview.grossTotal)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">總趟次 / 司機</div>
            <div className="text-xl font-bold text-blue-700 mt-1">{fmt(preview.totalTrips)} 趟</div>
            <div className="text-xs text-gray-400 mt-1">{preview.driverCount} 位司機</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ArrowDownCircle className="w-3 h-3 text-red-500" /> 罰款扣款
            </div>
            <div className="text-xl font-bold text-red-600 mt-1">-NT$ {fmt(preview.penaltyTotal)}</div>
            <div className="text-xs text-gray-400 mt-1">{preview.penaltyCount} 筆</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ArrowUpCircle className="w-3 h-3 text-green-500" /> 交通罰單補助
            </div>
            <div className="text-xl font-bold text-green-600 mt-1">+NT$ {fmt(preview.subsidyTotal)}</div>
            <div className="text-xs text-gray-400 mt-1">{preview.subsidyCount} 筆</div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Items Table */}
      {summary.items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">請款項目明細</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">項目</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">趟次總金額</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">福星高抽成 7%</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 bg-green-50">實際金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => (
                  <tr key={item.name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{item.name}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{fmt(item.gross)}</td>
                    <td className="px-4 py-2 text-right text-red-500">-{fmt(item.commission)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700 bg-green-50">{fmt(item.net)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold text-sm">
                  <td className="px-4 py-2">合計（未稅）</td>
                  <td className="px-4 py-2 text-right">{fmt(summary.tax_free_total)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">+稅 {fmt(summary.tax_amount)}</td>
                  <td className="px-4 py-2 text-right text-green-800 bg-green-50">{fmt(summary.billing_total)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Detail Tabs */}
      <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
        <TabsList className="bg-gray-100">
          <TabsTrigger value="drivers" className="text-xs">
            <Users className="w-3.5 h-3.5 mr-1" /> 司機明細 ({preview.driverCount})
          </TabsTrigger>
          <TabsTrigger value="routes" className="text-xs">
            <TruckIcon className="w-3.5 h-3.5 mr-1" />
            路線 ({preview.storeRouteCount + preview.nddRouteCount + preview.whnddRouteCount})
          </TabsTrigger>
          <TabsTrigger value="penalties" className="text-xs">
            <AlertTriangle className="w-3.5 h-3.5 mr-1 text-red-500" /> 罰款 ({preview.penaltyCount})
          </TabsTrigger>
          <TabsTrigger value="subsidies" className="text-xs">
            <ArrowUpCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> 補助 ({preview.subsidyCount})
          </TabsTrigger>
          <TabsTrigger value="sheets" className="text-xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> 工作表
          </TabsTrigger>
        </TabsList>

        {/* Drivers tab */}
        <TabsContent value="drivers">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-8"></th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">司機工號</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">服務類型</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">路線數</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">趟次</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">金額 (未稅)</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.driver_id} className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        const s = new Set(expandedDrivers);
                        s.has(d.driver_id) ? s.delete(d.driver_id) : s.add(d.driver_id);
                        setExpandedDrivers(s);
                      }}>
                      <td className="px-4 py-2 text-gray-400">
                        {expandedDrivers.has(d.driver_id)
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="px-4 py-2 font-medium font-mono">{d.driver_id}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {d.types.map((t) => (
                            <span key={t} className={`px-1.5 py-0.5 rounded text-xs font-medium ${typeColor[t] ?? "bg-gray-100 text-gray-600"}`}>{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">{d.routes}</td>
                      <td className="px-4 py-2 text-right text-blue-700 font-medium">{d.trips}</td>
                      <td className="px-4 py-2 text-right font-semibold text-green-700">NT$ {fmt(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2">
                    <td colSpan={4} className="px-4 py-2 text-right text-gray-600">合計</td>
                    <td className="px-4 py-2 text-right text-blue-700">{fmt(preview.totalTrips)}</td>
                    <td className="px-4 py-2 text-right text-green-700">NT$ {fmt(preview.grossTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Routes tab */}
        <TabsContent value="routes">
          <Card>
            <CardContent className="p-0">
              <div className="flex gap-3 p-4 border-b bg-gray-50 text-sm text-gray-600">
                <span className={`px-2 py-0.5 rounded ${typeColor["店配車"]}`}>店配車 {preview.storeRouteCount} 條</span>
                <span className={`px-2 py-0.5 rounded ${typeColor["NDD"]}`}>NDD {preview.nddRouteCount} 條</span>
                <span className={`px-2 py-0.5 rounded ${typeColor["WHNDD"]}`}>WHNDD {preview.whnddRouteCount} 條</span>
              </div>
              <div className="p-4 text-sm text-gray-500">
                確認匯入後可在系統查看各路線每日趟次詳細資料
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Penalties tab */}
        <TabsContent value="penalties">
          <Card>
            <CardContent className="p-0">
              {penalties.length === 0 ? (
                <div className="p-6 text-center text-gray-400">無罰款紀錄</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">日期</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">司機工號</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">門市</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">違規類型</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">罰款金額</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">扣款月份</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penalties.map((p, i) => (
                      <tr key={i} className="border-b hover:bg-red-50">
                        <td className="px-3 py-2 text-gray-600">{fmtDate(p.date)}</td>
                        <td className="px-3 py-2 font-mono">{p.driver_id || "-"}</td>
                        <td className="px-3 py-2 text-gray-600">{p.shop_name}</td>
                        <td className="px-3 py-2 text-orange-700 text-xs">{p.reason}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600">-{fmt(p.amount)}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{p.deduct_month}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50 font-bold border-t-2">
                      <td colSpan={4} className="px-3 py-2 text-right text-gray-600">罰款合計</td>
                      <td className="px-3 py-2 text-right text-red-700">-NT$ {fmt(preview.penaltyTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subsidies tab */}
        <TabsContent value="subsidies">
          <Card>
            <CardContent className="p-0">
              {subsidies.length === 0 ? (
                <div className="p-6 text-center text-gray-400">無交通罰單補助</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">申請日期</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">業務日期</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">門市</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">違規事由</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">補助金額</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">車牌</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subsidies.map((s, i) => (
                      <tr key={i} className="border-b hover:bg-green-50">
                        <td className="px-3 py-2 text-gray-600">{fmtDate(s.date)}</td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(s.business_date)}</td>
                        <td className="px-3 py-2">{s.shop_name}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{s.reason}</td>
                        <td className="px-3 py-2 text-right font-semibold text-green-600">+{fmt(s.amount)}</td>
                        <td className="px-3 py-2 text-gray-500 font-mono text-xs">{s.plate}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50 font-bold border-t-2">
                      <td colSpan={4} className="px-3 py-2 text-right text-gray-600">補助合計</td>
                      <td className="px-3 py-2 text-right text-green-700">+NT$ {fmt(preview.subsidyTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sheets tab */}
        <TabsContent value="sheets">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-gray-500 mb-3">已偵測到以下工作表：</p>
              <div className="flex flex-wrap gap-2">
                {preview.sheetNames.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
