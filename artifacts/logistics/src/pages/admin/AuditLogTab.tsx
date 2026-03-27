import { useState, useCallback } from "react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  Shield, RefreshCw, Search, ChevronDown, ChevronRight,
  CheckCircle, XCircle, DollarSign, Truck, Tag, RotateCcw, FileText,
  Eye, User, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: number;
  action_type: string;
  actor: string;
  target_type: string | null;
  target_id: number | null;
  order_id: number | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  note: string | null;
  ip_address: string | null;
  created_at: string;
}

// ── Action metadata ────────────────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  approve_price_change:    { label: "核准改價",    icon: DollarSign,  color: "text-emerald-600 bg-emerald-50" },
  reject_price_change:     { label: "退回改價",    icon: DollarSign,  color: "text-red-600 bg-red-50" },
  approve_cancel_order:    { label: "核准取消",    icon: XCircle,     color: "text-emerald-600 bg-emerald-50" },
  reject_cancel_order:     { label: "退回取消",    icon: XCircle,     color: "text-red-600 bg-red-50" },
  approve_reassign_driver: { label: "核准重派",    icon: Truck,       color: "text-emerald-600 bg-emerald-50" },
  reject_reassign_driver:  { label: "退回重派",    icon: Truck,       color: "text-red-600 bg-red-50" },
  approve_apply_discount:  { label: "核准折扣",    icon: Tag,         color: "text-emerald-600 bg-emerald-50" },
  reject_apply_discount:   { label: "退回折扣",    icon: Tag,         color: "text-red-600 bg-red-50" },
  approve_outsource_order: { label: "核准外包",    icon: ChevronRight, color: "text-emerald-600 bg-emerald-50" },
  reject_outsource_order:  { label: "退回外包",    icon: ChevronRight, color: "text-red-600 bg-red-50" },
  approve_refund:          { label: "核准退款",    icon: RotateCcw,   color: "text-emerald-600 bg-emerald-50" },
  reject_refund:           { label: "退回退款",    icon: RotateCcw,   color: "text-red-600 bg-red-50" },
  order_created:           { label: "建立訂單",    icon: FileText,    color: "text-blue-600 bg-blue-50" },
  order_updated:           { label: "更新訂單",    icon: FileText,    color: "text-blue-600 bg-blue-50" },
  order_status_changed:    { label: "訂單狀態變更", icon: FileText,   color: "text-amber-600 bg-amber-50" },
  driver_assigned:         { label: "派車",        icon: Truck,       color: "text-blue-600 bg-blue-50" },
  price_modified:          { label: "改價",        icon: DollarSign,  color: "text-orange-600 bg-orange-50" },
};

function getActionMeta(type: string) {
  const key = type.toLowerCase();
  return ACTION_META[key] ?? { label: type, icon: Shield, color: "text-gray-600 bg-gray-50" };
}

const ACTION_TYPES = [
  "approve_price_change", "reject_price_change",
  "approve_cancel_order", "reject_cancel_order",
  "approve_reassign_driver", "reject_reassign_driver",
  "approve_apply_discount", "reject_apply_discount",
  "approve_outsource_order", "approve_refund", "reject_refund",
  "order_created", "order_updated", "order_status_changed",
  "driver_assigned", "price_modified",
];

// ── Entry row ─────────────────────────────────────────────────────────────
function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getActionMeta(entry.action_type);
  const Icon = meta.icon;
  const isApprove = entry.action_type.startsWith("approve_");
  const isReject  = entry.action_type.startsWith("reject_");

  return (
    <div className={`border rounded-lg overflow-hidden mb-2 ${isApprove ? "border-emerald-100" : isReject ? "border-red-100" : "border-gray-100"}`}>
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        <div className={`rounded-full p-1.5 flex-shrink-0 ${meta.color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Action label */}
        <span className="text-sm font-medium w-32 flex-shrink-0">{meta.label}</span>

        {/* Order ref */}
        {entry.order_id && (
          <span className="text-xs text-muted-foreground font-mono">#{entry.order_id}</span>
        )}

        {/* Note preview */}
        {entry.note && (
          <span className="text-xs text-muted-foreground truncate flex-1 hidden sm:block">{entry.note}</span>
        )}

        {/* Actor */}
        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0 flex items-center gap-1">
          <User className="w-3 h-3" />{entry.actor}
        </span>

        {/* Time */}
        <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1 hidden md:flex">
          <Clock className="w-3 h-3" />
          {format(new Date(entry.created_at), "MM/dd HH:mm", { locale: zhTW })}
        </span>

        {/* Expand */}
        <span className="flex-shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-muted/20 border-t text-xs space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-muted-foreground mb-0.5">操作時間</p>
              <p className="font-mono">{format(new Date(entry.created_at), "yyyy/MM/dd HH:mm:ss")}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">操作人員</p>
              <p className="font-medium">{entry.actor}</p>
            </div>
            {entry.target_id && (
              <div>
                <p className="text-muted-foreground mb-0.5">目標記錄</p>
                <p>{entry.target_type} #{entry.target_id}</p>
              </div>
            )}
            {entry.ip_address && (
              <div>
                <p className="text-muted-foreground mb-0.5">IP 位址</p>
                <p className="font-mono">{entry.ip_address}</p>
              </div>
            )}
          </div>

          {entry.note && (
            <div>
              <p className="text-muted-foreground mb-0.5">備註說明</p>
              <p className="bg-white border rounded px-2 py-1">{entry.note}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entry.before_data && (
              <div>
                <p className="text-muted-foreground mb-0.5">操作前資料</p>
                <pre className="bg-red-50 border border-red-100 rounded p-2 text-[10px] overflow-auto max-h-24">
                  {JSON.stringify(entry.before_data, null, 2)}
                </pre>
              </div>
            )}
            {entry.after_data && (
              <div>
                <p className="text-muted-foreground mb-0.5">操作後資料</p>
                <pre className="bg-emerald-50 border border-emerald-100 rounded p-2 text-[10px] overflow-auto max-h-24">
                  {JSON.stringify(entry.after_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function AuditLogTab() {
  const [entries, setEntries]       = useState<AuditEntry[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(0);
  const [filters, setFilters]       = useState({
    action_type: "", actor: "", order_id: "", date_from: "", date_to: "",
  });
  const [summary, setSummary]       = useState<{ action_type: string; count: number; today_count: number }[]>([]);
  const PAGE_SIZE = 30;

  const load = useCallback(async (pg = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pg * PAGE_SIZE),
        ...(filters.action_type && { action_type: filters.action_type }),
        ...(filters.actor       && { actor:       filters.actor }),
        ...(filters.order_id    && { order_id:    filters.order_id }),
        ...(filters.date_from   && { date_from:   filters.date_from }),
        ...(filters.date_to     && { date_to:     filters.date_to }),
      });
      const [logRes, sumRes] = await Promise.all([
        fetch(apiUrl(`/api/audit-log?${params}`)).then(r => r.json()),
        fetch(apiUrl("/api/audit-log/summary")).then(r => r.json()),
      ]);
      setEntries(Array.isArray(logRes.rows) ? logRes.rows : []);
      setTotal(logRes.total ?? 0);
      setSummary(Array.isArray(sumRes.byType) ? sumRes.byType : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filters, page]);

  useState(() => { load(0); });

  const search = () => { setPage(0); load(0); };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">操作日誌（Audit Log）</h2>
          <p className="text-xs text-muted-foreground">
            所有改價、取消、重派、折扣、外包、審批動作完整留存，不可刪除
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">共 {total.toLocaleString()} 筆</Badge>
          <Button variant="outline" size="sm" onClick={() => load(0)} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary mini-cards */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summary.slice(0, 8).map(s => {
            const meta = getActionMeta(s.action_type);
            return (
              <button
                key={s.action_type}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors
                  ${filters.action_type === s.action_type ? "bg-primary text-white border-primary" : "bg-white hover:bg-muted/50"}`}
                onClick={() => setFilters(f => ({
                  ...f,
                  action_type: f.action_type === s.action_type ? "" : s.action_type,
                }))}
              >
                <span>{meta.label}</span>
                <span className="font-bold">{s.count}</span>
                {s.today_count > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-bold rounded-full px-1 leading-4">+{s.today_count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-xl border">
        <div>
          <Label className="text-xs mb-1 block">操作類型</Label>
          <Select value={filters.action_type || "all"} onValueChange={v => setFilters(f => ({ ...f, action_type: v === "all" ? "" : v }))}>
            <SelectTrigger className="text-xs h-8">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部類型</SelectItem>
              {ACTION_TYPES.map(t => (
                <SelectItem key={t} value={t}>{getActionMeta(t).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">操作人員</Label>
          <Input placeholder="搜尋人員…" value={filters.actor}
            onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))}
            className="text-xs h-8" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">訂單編號</Label>
          <Input placeholder="#" value={filters.order_id} type="number"
            onChange={e => setFilters(f => ({ ...f, order_id: e.target.value }))}
            className="text-xs h-8 font-mono" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">日期範圍</Label>
          <div className="flex gap-1">
            <Input type="date" value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="text-xs h-8 w-full" />
            <Input type="date" value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="text-xs h-8 w-full" />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-4 flex justify-end">
          <Button size="sm" onClick={search} className="gap-1.5">
            <Search className="w-3.5 h-3.5" /> 搜尋
          </Button>
        </div>
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> 載入中…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <Eye className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">尚無符合條件的操作紀錄</p>
        </div>
      ) : (
        <div>
          {entries.map(e => <AuditRow key={e.id} entry={e} />)}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            顯示第 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} 筆，共 {total} 筆
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0}
              onClick={() => { setPage(p => p - 1); load(page - 1); }}>
              上一頁
            </Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => { setPage(p => p + 1); load(page + 1); }}>
              下一頁
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-1">
        所有紀錄按 FIFO 保存，禁止刪除或覆蓋，符合稽核追責要求
      </p>
    </div>
  );
}
