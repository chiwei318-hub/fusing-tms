/**
 * 模組 4 + 6：財務清算總覽 + 月結 Excel 導出
 */
import { useState, useEffect, useCallback } from "react";
import {
  Download, RefreshCw, TrendingUp, TrendingDown, DollarSign,
  Loader2, BarChart3, Zap, CheckCircle2, Clock, FileSpreadsheet,
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
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Financial {
  id: number;
  order_id: number;
  order_no: string;
  partner_name: string;
  driver_name: string;
  vehicle_type: string;
  ar_total: number;
  ar_tax: number;
  ar_grand_total: number;
  ap_base: number;
  ap_tailgate: number;
  ap_frozen: number;
  ap_total: number;
  platform_profit: number;
  profit_margin_pct: number;
  ar_status: string;
  ap_status: string;
}

interface Summary {
  total_orders: number;
  total_ar: number;
  total_ap: number;
  total_platform_profit: number;
  profit_margin: string;
  total_tax: number;
}

interface MonthlyReport {
  summary: Summary;
  by_partner: { partner_name: string; orders: number; ar: number; ap: number; profit: number }[];
  by_driver: { driver_name: string; orders: number; total_pay: number }[];
  by_vehicle_type: { vehicle_type: string; orders: number; ar: number; ap: number; profit: number }[];
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

function n(v: unknown) { return Number(v ?? 0).toLocaleString(); }

function StatCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-bold ${trend === "down" ? "text-red-600" : trend === "up" ? "text-green-700" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function FinancialsDashboard() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(currentMonth);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [finR, repR] = await Promise.all([
        fetch(`${API}/api/financials?period=${month}`),
        fetch(`${API}/api/financials/monthly-report?period=${month}`),
      ]);
      const finD = await finR.json();
      const repD = await repR.json();
      if (finD.ok) setFinancials(finD.financials);
      if (repD.ok) setReport(repD);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API}/api/financials/export-excel?period=${month}`);
      if (!r.ok) throw new Error("匯出失敗");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Financials_${month}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${month} 月結總表已下載（6 工作表）` });
    } catch (e: any) {
      toast({ title: "匯出失敗", description: e.message, variant: "destructive" });
    } finally { setExporting(false); }
  };

  const batch = async () => {
    setBatchRunning(true);
    try {
      const r = await fetch(`${API}/api/financials/batch-recalculate`, { method: "POST" });
      const d = await r.json();
      if (d.ok) { toast({ title: `補跑完成：成功 ${d.success} 筆` }); load(); }
    } catch { toast({ title: "補跑失敗", variant: "destructive" }); }
    finally { setBatchRunning(false); }
  };

  const months = monthOptions();
  const s = report?.summary;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">財務清算總覽</h1>
            <p className="text-sm text-muted-foreground">AR/AP 一條龍清算 + 六工作表月結導出</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={batch} disabled={batchRunning}>
            {batchRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            補跑財務
          </Button>
          <Button size="sm" onClick={exportExcel} disabled={exporting} className="gap-1.5">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            📥 月結總表導出
          </Button>
        </div>
      </div>

      {/* Stats */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="訂單數" value={String(s.total_orders)} icon={BarChart3} />
          <StatCard label="AR 應收" value={`$${n(s.total_ar)}`} sub="廠商收款金額" icon={TrendingUp} trend="up" />
          <StatCard label="AP 應付" value={`$${n(s.total_ap)}`} sub="司機薪資支出" icon={TrendingDown} trend="down" />
          <StatCard label="平台淨利" value={`$${n(s.total_platform_profit)}`} sub="AR - AP"
            icon={DollarSign} trend={s.total_platform_profit >= 0 ? "up" : "down"} />
          <StatCard label="利潤率" value={String(s.profit_margin)} icon={TrendingUp} />
          <StatCard label="稅金(5%)" value={`$${n(s.total_tax)}`} icon={DollarSign} />
        </div>
      )}

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">訂單明細</TabsTrigger>
          <TabsTrigger value="partners">廠商統計</TabsTrigger>
          <TabsTrigger value="drivers">司機薪資</TabsTrigger>
          <TabsTrigger value="vehicles">車型統計</TabsTrigger>
        </TabsList>

        {/* 訂單明細 */}
        <TabsContent value="orders">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
              <h3 className="font-semibold text-sm">{month} 訂單財務明細</h3>
              <span className="text-xs text-muted-foreground">{financials.length} 筆</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead>訂單</TableHead>
                    <TableHead>廠商</TableHead>
                    <TableHead>車型</TableHead>
                    <TableHead className="text-right">AR</TableHead>
                    <TableHead className="text-right">含稅AR</TableHead>
                    <TableHead className="text-right">AP</TableHead>
                    <TableHead className="text-right">淨利</TableHead>
                    <TableHead className="text-right">利潤率</TableHead>
                    <TableHead>AR狀態</TableHead>
                    <TableHead>AP狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell></TableRow>
                  ) : financials.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                      {month} 無財務清算記錄。點擊「補跑財務」可批次產生。
                    </TableCell></TableRow>
                  ) : financials.map(f => (
                    <TableRow key={f.id} className="hover:bg-muted/10 text-sm">
                      <TableCell className="font-mono text-xs">{f.order_no ?? `#${f.order_id}`}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{f.partner_name ?? "-"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{f.vehicle_type ?? "-"}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-green-700">${n(f.ar_total)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-500">${n(f.ar_grand_total)}</TableCell>
                      <TableCell className="text-right font-mono text-red-600">${n(f.ap_total)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${Number(f.platform_profit) < 0 ? "text-red-600" : "text-blue-700"}`}>
                        ${n(f.platform_profit)}
                      </TableCell>
                      <TableCell className={`text-right text-xs ${Number(f.profit_margin_pct) < 10 ? "text-red-500" : "text-green-600"}`}>
                        {f.profit_margin_pct ?? 0}%
                      </TableCell>
                      <TableCell>
                        {f.ar_status === "paid"
                          ? <Badge variant="default" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />已收</Badge>
                          : <Badge variant="secondary" className="text-xs gap-1"><Clock className="w-3 h-3" />待收</Badge>}
                      </TableCell>
                      <TableCell>
                        {f.ap_status === "paid"
                          ? <Badge variant="default" className="text-xs gap-1 bg-green-600"><CheckCircle2 className="w-3 h-3" />已付</Badge>
                          : <Badge variant="secondary" className="text-xs gap-1"><Clock className="w-3 h-3" />待付</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* 廠商統計 */}
        <TabsContent value="partners">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead>廠商名稱</TableHead>
                  <TableHead className="text-center">訂單數</TableHead>
                  <TableHead className="text-right">AR 收入</TableHead>
                  <TableHead className="text-right">AP 支出</TableHead>
                  <TableHead className="text-right">平台淨利</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.by_partner ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">無資料</TableCell></TableRow>
                ) : (report?.by_partner ?? []).map((p, i) => (
                  <TableRow key={i} className="hover:bg-muted/10">
                    <TableCell className="font-medium">{p.partner_name ?? "（無廠商）"}</TableCell>
                    <TableCell className="text-center">{p.orders}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">${n(p.ar)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">${n(p.ap)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${Number(p.profit) < 0 ? "text-red-600" : "text-blue-700"}`}>
                      ${n(p.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 司機薪資 */}
        <TabsContent value="drivers">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead>司機姓名</TableHead>
                  <TableHead className="text-center">訂單數</TableHead>
                  <TableHead className="text-right">薪資合計</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.by_driver ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">無資料</TableCell></TableRow>
                ) : (report?.by_driver ?? []).map((d, i) => (
                  <TableRow key={i} className="hover:bg-muted/10">
                    <TableCell className="font-medium">{d.driver_name ?? "-"}</TableCell>
                    <TableCell className="text-center">{d.orders}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-blue-700">${n(d.total_pay)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 車型統計 */}
        <TabsContent value="vehicles">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead>車型</TableHead>
                  <TableHead className="text-center">訂單數</TableHead>
                  <TableHead className="text-right">AR 收入</TableHead>
                  <TableHead className="text-right">AP 支出</TableHead>
                  <TableHead className="text-right">淨利</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.by_vehicle_type ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">無資料</TableCell></TableRow>
                ) : (report?.by_vehicle_type ?? []).map((v, i) => (
                  <TableRow key={i} className="hover:bg-muted/10">
                    <TableCell><Badge variant="outline">{v.vehicle_type}</Badge></TableCell>
                    <TableCell className="text-center">{v.orders}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">${n(v.ar)}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">${n(v.ap)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${Number(v.profit) < 0 ? "text-red-600" : "text-blue-700"}`}>
                      ${n(v.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
