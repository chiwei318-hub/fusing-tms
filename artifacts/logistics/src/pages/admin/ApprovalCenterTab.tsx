import { useState, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw,
  ChevronRight, User, FileText, DollarSign, Truck, RotateCcw, Tag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
interface ApprovalRequest {
  id: number;
  action_type: string;
  order_id: number | null;
  driver_id: number | null;
  customer_id: number | null;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  payload: Record<string, unknown>;
  reason: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  priority: "normal" | "high" | "urgent";
  customer_name?: string;
  pickup_address?: string;
  delivery_address?: string;
  total_fee?: number;
  order_status?: string;
  driver_name?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  price_change:    { label: "改價申請",    icon: DollarSign, color: "bg-orange-100 text-orange-700 border-orange-200" },
  cancel_order:    { label: "取消訂單",    icon: XCircle,    color: "bg-red-100 text-red-700 border-red-200" },
  reassign_driver: { label: "重派司機",    icon: Truck,      color: "bg-blue-100 text-blue-700 border-blue-200" },
  apply_discount:  { label: "折扣申請",    icon: Tag,        color: "bg-violet-100 text-violet-700 border-violet-200" },
  outsource_order: { label: "外包派車",    icon: ChevronRight, color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  refund:          { label: "退款申請",    icon: RotateCcw,  color: "bg-pink-100 text-pink-700 border-pink-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  normal: { label: "一般",   color: "bg-gray-100 text-gray-600" },
  high:   { label: "重要",   color: "bg-amber-100 text-amber-700" },
  urgent: { label: "緊急",   color: "bg-red-100 text-red-700" },
};

function payloadSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "price_change":
      return `原費用 NT$${payload.old_fee ?? "—"} → 調整為 NT$${payload.new_fee ?? "—"}`;
    case "apply_discount":
      return `折扣金額 NT$${payload.discount_amount ?? "—"}${payload.discount_pct ? `（${payload.discount_pct}%）` : ""}`;
    case "reassign_driver":
      return `改派至：${payload.new_driver_name ?? `司機 #${payload.new_driver_id}`}`;
    case "cancel_order":
      return payload.reason ? `原因：${payload.reason}` : "（無額外說明）";
    case "outsource_order":
      return `外包至：${payload.fleet_name ?? "—"}，外包費 NT$${payload.outsource_fee ?? "—"}`;
    case "refund":
      return `退款金額 NT$${payload.refund_amount ?? "—"}，原因：${payload.refund_reason ?? "—"}`;
    default:
      return JSON.stringify(payload);
  }
}

// ── Approval Card ─────────────────────────────────────────────────────────
function ApprovalCard({
  item, onApprove, onReject,
}: {
  item: ApprovalRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const action = ACTION_LABELS[item.action_type] ?? { label: item.action_type, icon: FileText, color: "bg-gray-100 text-gray-600 border-gray-200" };
  const ActionIcon = action.icon;
  const priority = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.normal;

  return (
    <Card className={`border-l-4 ${item.priority === "urgent" ? "border-l-red-500" : item.priority === "high" ? "border-l-amber-400" : "border-l-gray-200"}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 flex-shrink-0 border ${action.color}`}>
            <ActionIcon className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${action.color}`}>
                {action.label}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${priority.color}`}>
                {priority.label}
              </span>
              {item.order_id && (
                <span className="text-xs text-muted-foreground">訂單 #{item.order_id}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(item.requested_at), { locale: zhTW, addSuffix: true })}
              </span>
            </div>

            {/* Order context */}
            {item.customer_name && (
              <div className="text-sm mb-1">
                <span className="font-medium">{item.customer_name}</span>
                {item.total_fee != null && (
                  <span className="text-muted-foreground ml-2">NT$ {Number(item.total_fee).toLocaleString()}</span>
                )}
              </div>
            )}
            {(item.pickup_address || item.delivery_address) && (
              <div className="text-xs text-muted-foreground mb-1.5">
                {item.pickup_address && <span>📦 {item.pickup_address}</span>}
                {item.pickup_address && item.delivery_address && <span className="mx-1">→</span>}
                {item.delivery_address && <span>🏁 {item.delivery_address}</span>}
              </div>
            )}

            {/* Payload summary */}
            <div className="bg-muted/50 rounded px-2.5 py-1.5 text-xs mb-2 border border-muted">
              {payloadSummary(item.action_type, item.payload)}
            </div>

            {/* Requester + reason */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {item.requested_by}</span>
              {item.reason && <span>原因：{item.reason}</span>}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                onClick={() => onApprove(item.id)}>
                <CheckCircle className="w-3.5 h-3.5" /> 核准
              </Button>
              <Button size="sm" variant="destructive" className="gap-1"
                onClick={() => onReject(item.id)}>
                <XCircle className="w-3.5 h-3.5" /> 退回
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── History Card ─────────────────────────────────────────────────────────
function HistoryCard({ item }: { item: ApprovalRequest }) {
  const action = ACTION_LABELS[item.action_type] ?? { label: item.action_type, icon: FileText, color: "bg-gray-100 text-gray-600 border-gray-200" };
  const isApproved = item.status === "approved";
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${isApproved ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100"}`}>
      <div className={`rounded-full p-1 flex-shrink-0 ${isApproved ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"}`}>
        {isApproved ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0 text-xs">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium">{action.label}</span>
          {item.order_id && <span className="text-muted-foreground">#{item.order_id}</span>}
          {item.customer_name && <span className="text-muted-foreground">{item.customer_name}</span>}
          <span className="ml-auto text-muted-foreground">
            {item.reviewed_at ? format(new Date(item.reviewed_at), "MM/dd HH:mm") : "—"}
          </span>
        </div>
        <div className="text-muted-foreground">
          {payloadSummary(item.action_type, item.payload)}
        </div>
        {item.review_note && (
          <div className={`mt-0.5 ${isApproved ? "text-emerald-700" : "text-red-600"}`}>
            審核意見：{item.review_note}
          </div>
        )}
        <div className="text-muted-foreground mt-0.5">
          審核人：{item.reviewed_by ?? "—"} · 申請人：{item.requested_by}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function ApprovalCenterTab() {
  const { toast } = useToast();
  const [pending, setPending]     = useState<ApprovalRequest[]>([]);
  const [history, setHistory]     = useState<ApprovalRequest[]>([]);
  const [loading, setLoading]     = useState(false);
  const [reviewId, setReviewId]   = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(apiUrl("/api/approvals/pending")).then(r => r.json()),
        fetch(apiUrl("/api/approvals?status=approved&limit=30")).then(r => r.json()),
      ]);
      setPending(Array.isArray(pRes) ? pRes : []);
      setHistory(Array.isArray(hRes) ? hRes : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openApprove = (id: number) => { setReviewId(id); setReviewMode("approve"); setReviewNote(""); };
  const openReject  = (id: number) => { setReviewId(id); setReviewMode("reject");  setReviewNote(""); };

  const submit = async () => {
    if (!reviewId) return;
    setSubmitting(true);
    try {
      const url = apiUrl(`/api/approvals/${reviewId}/${reviewMode === "approve" ? "approve" : "reject"}`);
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_by: "admin", review_note: reviewNote }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: reviewMode === "approve" ? "✅ 已核准" : "❌ 已退回", duration: 2000 });
      setReviewId(null);
      await load();
    } catch (e) {
      toast({ title: "操作失敗", description: String(e), variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">審批中心</h2>
          <p className="text-xs text-muted-foreground">改價／取消／重派／折扣／外包需主管核准</p>
        </div>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pending.length} 件待審
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1 gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            待審批
            {pending.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            審核紀錄
          </TabsTrigger>
        </TabsList>

        {/* Pending tab */}
        <TabsContent value="pending" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> 載入中…
            </div>
          ) : pending.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">目前沒有待審批項目</p>
              <p className="text-sm text-muted-foreground mt-1">所有操作均已完成審核</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map(item => (
                <ApprovalCard
                  key={item.id} item={item}
                  onApprove={openApprove}
                  onReject={openReject}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">尚無審核紀錄</div>
          ) : (
            <div className="space-y-2">
              {history.map(item => <HistoryCard key={item.id} item={item} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={reviewId !== null} onOpenChange={open => { if (!open) setReviewId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={reviewMode === "approve" ? "text-emerald-700" : "text-red-600"}>
              {reviewMode === "approve" ? "✅ 確認核准" : "❌ 退回申請"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                {reviewMode === "approve" ? "核准備註（選填）" : "退回原因（建議填寫）"}
              </Label>
              <Textarea
                placeholder={reviewMode === "approve" ? "核准備註…" : "請說明退回原因…"}
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
            {reviewMode === "approve" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                核准後，系統將自動執行對應操作（改價/取消/重派等），此動作無法撤回。
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewId(null)}>取消</Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className={reviewMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
            >
              {submitting ? "處理中…" : reviewMode === "approve" ? "確認核准" : "確認退回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit note */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        所有審批紀錄均自動寫入 Audit Log，保存完整操作軌跡
      </p>
    </div>
  );
}
