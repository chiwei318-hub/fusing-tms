import { useState, useEffect, useCallback } from "react";
import {
  Download, RefreshCw, TrendingUp, TrendingDown, DollarSign, BarChart3,
  Loader2, CheckCircle2, Clock, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ArApRecord {
  id: number;
  order_id: number;
  order_no: string;
  customer_name: string;
  vehicle_type: string;
  ar_amount: number;
  ap_driver: number;
  ap_equipment: number;
  ap_total: number;
  net_profit: number;
  profit_margin_pct: number;
  status: string;
  date: string;
}

interface Summary {
  order_count: number;
  total_ar: number;
  total_ap: number;
  total_profit: number;
  profit_margin_pct: number;
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
  }
  return opts;
}

function StatCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-bold ${trend === "down" ? "text-red-600" : trend === "up" ? "text-green-600" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function ArApDashboard() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState<ArApRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recR, sumR] = await Promise.all([
        fetch(`${API}/api/ar-ap/records?month=${month}`),
        fetch(`${API}/api/ar-ap/monthly-summary?month=${month}`),
      ]);
      const recD = await recR.json();
      const sumD = await sumR.json();
      if (recD.ok) setRecords(recD.records);
      if (sumD.ok) setSummary(sumD.summary);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API}/api/ar-ap/monthly-export?month=${month}`);
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ARAP_${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${month} 財務結算總表已下載` });
    } catch (e: any) {
      toast({ title: "導出失敗", description: e.message, variant: "destructive" });
    } finally { setExporting(false); }
  };

  const batchGenerate = async () => {
    setBatchRunning(true);
    try {
      const r = await fetch(`${API}/api/ar-ap/batch-generate`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        toast({ title: `補跑完成：成功產生 ${d.success} 筆 AR/AP 紀錄` });
        load();
      }
    } catch {
      toast({ title: "補跑失敗", variant: "destructive" });
    } finally { setBatchRunning(false); }
  };

  const settle = async (id: number) => {
    await fetch(`${API}/api/ar-ap/records/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "settled" }),
    });
    load();
  };

  const months = monthOptions();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">AR/AP 財務清算</h1>
            <p className="text-sm text-muted-foreground">應收帳款（AR）× 應付帳款（AP）一條龍清算</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={batchGenerate} disabled={batchRunning}>
            {batchRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            補跑未清算
          </Button>
          <Button size="sm" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            導出 Excel
          </Button>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="訂單數" value={String(summary.order_count)} icon={BarChart3} />
          <StatCard
            label="AR 總收入" value={`$${Number(summary.total_ar).toLocaleString()}`}
            sub="應收廠商金額" icon={TrendingUp} trend="up"
          />
          <StatCard
            label="AP 總支出" value={`$${Number(summary.total_ap).toLocaleString()}`}
            sub="付司機+設備" icon={TrendingDown} trend="down"
          />
          <StatCard
            label="平台淨利" value={`$${Number(summary.total_profit).toLocaleString()}`}
            sub="AR - AP" icon={DollarSign}
            trend={Number(summary.total_profit) >= 0 ? "up" : "down"}
          />
          <StatCard
            label="利潤率" value={`${summary.profit_margin_pct}%`}
            icon={TrendingUp}
            trend={Number(summary.profit_margin_pct) >= 15 ? "up" : "down"}
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm">{month} 訂單清算明細</h2>
          <span className="text-xs text-muted-foreground">{records.length} 筆</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead>日期</TableHead>
                <TableHead>訂單</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>車型</TableHead>
                <TableHead className="text-right">AR 收入</TableHead>
                <TableHead className="text-right">AP 司機</TableHead>
                <TableHead className="text-right">AP 設備</TableHead>
                <TableHead className="text-right">淨利</TableHead>
                <TableHead className="text-right">利潤率</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell></TableRow>
              ) : records.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                  {month} 尚無 AR/AP 清算記錄。點擊「補跑未清算」可批次產生。
                </TableCell></TableRow>
              ) : records.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/10">
                  <TableCell className="text-xs text-muted-foreground">{r.date}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{r.order_no ?? `#${r.order_id}`}</span>
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-sm">{r.customer_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.vehicle_type ?? "-"}</Badge></TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-700 font-semibold">
                    ${Number(r.ar_amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-red-600">
                    ${Number(r.ap_driver).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-orange-600">
                    ${Number(r.ap_equipment).toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-bold ${Number(r.net_profit) < 0 ? "text-red-600" : "text-blue-700"}`}>
                    ${Number(r.net_profit).toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right text-sm ${Number(r.profit_margin_pct) < 10 ? "text-red-500" : "text-green-600"}`}>
                    {r.profit_margin_pct ?? 0}%
                  </TableCell>
                  <TableCell>
                    {r.status === "settled"
                      ? <Badge variant="default" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />已結清</Badge>
                      : <Badge variant="secondary" className="text-xs gap-1"><Clock className="w-3 h-3" />待結清</Badge>}
                  </TableCell>
                  <TableCell>
                    {r.status !== "settled" && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => settle(r.id)}>
                        標為結清
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
