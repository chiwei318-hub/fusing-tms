import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, RefreshCw, DollarSign, CheckCircle2, XCircle,
  FileWarning, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

interface PenaltyRecord {
  id: number;
  incident_date: string | null;
  soc: string | null;
  store_name: string | null;
  violation_type: string | null;
  fleet_name: string | null;
  driver_code: string | null;
  fine_amount: number;
  fine_month: string | null;
  deduction_month: string | null;
  scan_rate: string | null;
  vendor: string | null;
  appeal_status: string | null;
  appeal_fail_reason: string | null;
  notes: string | null;
  source: string;
}

interface PenaltySummary {
  ok: boolean;
  items: PenaltyRecord[];
  total: number;
  totalFine: number;
  appealPassed: number;
  appealFailed: number;
  nddCount: number;
  penaltyCount: number;
}

type SortField = "incident_date" | "fine_amount" | "store_name" | "driver_code";

export default function PenaltiesTab() {
  const { toast } = useToast();
  const [data, setData] = useState<PenaltySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [appealFilter, setAppealFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("incident_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (appealFilter !== "all") params.set("appeal_status", appealFilter);
      const r = await fetch(getApiUrl(`/penalties?${params}`));
      const d = await r.json();
      setData(d);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, appealFilter, page, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
    ) : null;

  const filtered = (data?.items ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.store_name?.toLowerCase().includes(q) ||
      r.driver_code?.toLowerCase().includes(q) ||
      r.violation_type?.toLowerCase().includes(q) ||
      r.soc?.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = a[sortField] ?? "";
    let vb: string | number = b[sortField] ?? "";
    if (sortField === "fine_amount") { va = a.fine_amount; vb = b.fine_amount; }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const appealBadge = (status: string | null) => {
    if (status === "V") return <Badge className="bg-green-100 text-green-800 text-xs">申訴通過</Badge>;
    if (status === "X") return <Badge className="bg-red-100 text-red-800 text-xs">申訴失敗</Badge>;
    if (status === "Y") return <Badge className="bg-green-100 text-green-800 text-xs">通過</Badge>;
    if (status === "N") return <Badge className="bg-red-100 text-red-800 text-xs">未通過</Badge>;
    return <Badge variant="outline" className="text-xs text-gray-500">未申訴</Badge>;
  };

  const sourceBadge = (source: string) => {
    if (source === "NDD過刷異常") return <Badge className="bg-orange-100 text-orange-800 text-xs">NDD異常</Badge>;
    return <Badge className="bg-blue-100 text-blue-800 text-xs">罰款統計</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">總罰款筆數</p>
                <p className="text-xl font-bold">{data?.total ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">NDD罰款總額</p>
                <p className="text-xl font-bold text-red-600">
                  NT$ {(data?.totalFine ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">申訴通過</p>
                <p className="text-xl font-bold text-green-600">{data?.appealPassed ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-xs text-gray-500">申訴失敗</p>
                <p className="text-xl font-bold text-red-400">{data?.appealFailed ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Shopee 罰款記錄
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                className="pl-7 h-8 text-sm"
                placeholder="搜尋門市、司機、違規類型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[130px] text-sm">
                <SelectValue placeholder="資料來源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                <SelectItem value="NDD過刷異常">NDD異常</SelectItem>
                <SelectItem value="罰款統計">罰款統計</SelectItem>
              </SelectContent>
            </Select>
            <Select value={appealFilter} onValueChange={(v) => { setAppealFilter(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[120px] text-sm">
                <SelectValue placeholder="申訴狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="V">申訴通過(V)</SelectItem>
                <SelectItem value="X">申訴失敗(X)</SelectItem>
                <SelectItem value="Y">通過(Y)</SelectItem>
                <SelectItem value="N">未通過(N)</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              重新整理
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 bg-gray-50">
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("incident_date")}
                  >
                    <span className="flex items-center gap-1">日期 <SortIcon field="incident_date" /></span>
                  </th>
                  <th className="text-left p-2">來源</th>
                  <th className="text-left p-2">SOC</th>
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("store_name")}
                  >
                    <span className="flex items-center gap-1">門市 <SortIcon field="store_name" /></span>
                  </th>
                  <th className="text-left p-2 hidden md:table-cell">違規類型</th>
                  <th
                    className="text-left p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("driver_code")}
                  >
                    <span className="flex items-center gap-1">司機 <SortIcon field="driver_code" /></span>
                  </th>
                  <th
                    className="text-right p-2 cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort("fine_amount")}
                  >
                    <span className="flex items-center justify-end gap-1">罰款 <SortIcon field="fine_amount" /></span>
                  </th>
                  <th className="text-left p-2 hidden lg:table-cell">掃描率</th>
                  <th className="text-left p-2">申訴</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      {loading ? "載入中..." : "無資料"}
                    </td>
                  </tr>
                )}
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-2 text-xs text-gray-600 whitespace-nowrap">{r.incident_date || "—"}</td>
                    <td className="p-2">{sourceBadge(r.source)}</td>
                    <td className="p-2 text-xs text-gray-500">{r.soc || "—"}</td>
                    <td className="p-2 text-xs max-w-[160px] truncate" title={r.store_name ?? ""}>
                      {r.store_name || "—"}
                    </td>
                    <td className="p-2 text-xs text-gray-600 hidden md:table-cell max-w-[180px] truncate" title={r.violation_type ?? ""}>
                      {r.violation_type || "—"}
                    </td>
                    <td className="p-2 text-xs font-medium">{r.driver_code || r.vendor || "—"}</td>
                    <td className="p-2 text-right">
                      {r.fine_amount > 0 ? (
                        <span className="font-medium text-red-600">
                          NT$ {r.fine_amount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-gray-500 hidden lg:table-cell">
                      {r.scan_rate || "—"}
                    </td>
                    <td className="p-2">{appealBadge(r.appeal_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {(data?.total ?? 0) > pageSize && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>共 {data?.total} 筆</span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >上一頁</Button>
                <span className="px-2 py-1">第 {page + 1} 頁</span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= (data?.total ?? 0)}
                >下一頁</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
