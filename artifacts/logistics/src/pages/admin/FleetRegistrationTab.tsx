import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Truck, Shield, Star, AlertTriangle, CheckCircle,
  XCircle, Clock, Search, ChevronDown, ChevronRight, Plus,
  Trash2, Phone, Mail, MapPin, DollarSign, Zap, Gavel,
  Ban, RefreshCw, FileText, Users, TrendingDown, Eye
} from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

async function fetchRegs(status?: string) {
  const q = status ? `?status=${status}` : "";
  return fetch(`/api/fleet/registrations${q}`).then(r => r.json());
}
async function fetchStats() {
  return fetch("/api/fleet/stats").then(r => r.json());
}
async function fetchRegDetail(id: number) {
  return fetch(`/api/fleet/registrations/${id}`).then(r => r.json());
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:   { label: "待審核", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  reviewing: { label: "審核中", color: "bg-blue-100 text-blue-700", icon: Eye },
  approved:  { label: "已通過", color: "bg-green-100 text-green-700", icon: CheckCircle },
  rejected:  { label: "已拒絕", color: "bg-red-100 text-red-700", icon: XCircle },
  suspended: { label: "已暫停", color: "bg-gray-100 text-gray-600", icon: Ban },
};

const ORDER_MODE_LABELS: Record<string, string> = {
  assigned: "指派接單", grab: "搶單模式", bidding: "競標比價",
};

function RiskBadge({ score }: { score: number }) {
  const level = score >= 80 ? "low" : score >= 60 ? "medium" : score >= 40 ? "high" : "critical";
  const cfg = {
    low:      { label: "低風險", cls: "bg-green-100 text-green-700" },
    medium:   { label: "中風險", cls: "bg-yellow-100 text-yellow-700" },
    high:     { label: "高風險", cls: "bg-orange-100 text-orange-700" },
    critical: { label: "危險", cls: "bg-red-100 text-red-700" },
  }[level];
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cfg.cls}`}>
      {cfg.label} {score}分
    </span>
  );
}

export default function FleetRegistrationTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState<{ id: number; action: string } | null>(null);

  const { data: stats } = useQuery({ queryKey: ["fleet-stats"], queryFn: fetchStats });
  const { data: regs = [], isLoading } = useQuery({
    queryKey: ["fleet-regs", statusFilter],
    queryFn: () => fetchRegs(statusFilter || undefined),
    refetchInterval: 30000,
  });
  const { data: detail } = useQuery({
    queryKey: ["fleet-reg-detail", selectedId],
    queryFn: () => fetchRegDetail(selectedId!),
    enabled: !!selectedId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, reviewNotes, rejectionReason, commissionRate }: any) =>
      fetch(`/api/fleet/registrations/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes, rejectionReason, commissionRate }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-regs"] });
      qc.invalidateQueries({ queryKey: ["fleet-stats"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["fleet-reg-detail", selectedId] });
    },
  });

  const displayRegs = regs.filter((r: any) =>
    !search || r.company_name?.includes(search) || r.contact_person?.includes(search) || r.contact_phone?.includes(search)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            車隊入駐審核
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">車隊/貨運公司入駐申請管理、審核與風險控管</p>
        </div>
        <a href="/fleet-join" target="_blank" rel="noopener noreferrer"
          className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 申請頁面
        </a>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: "待審核", value: stats.pending, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
            { label: "審核中", value: stats.reviewing, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
            { label: "已通過", value: stats.approved, color: "text-green-600", bg: "bg-green-50 border-green-200" },
            { label: "已拒絕", value: stats.rejected, color: "text-red-600", bg: "bg-red-50 border-red-200" },
            { label: "已暫停", value: stats.suspended, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
            { label: "平均風險分", value: stats.avg_risk_score ? `${stats.avg_risk_score}分` : "—", color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 border text-center ${s.bg}`}>
              <p className={`text-xl font-black ${s.color}`}>{s.value ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <input
            className="pl-8 pr-3 py-2 rounded-xl border bg-background text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="搜尋公司/聯絡人"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[{ v: "", l: "全部" }, ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ v, l: c.label }))].map(opt => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                statusFilter === opt.v ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        {/* List */}
        <div className="md:col-span-2 space-y-2">
          {isLoading ? (
            [1,2,3].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)
          ) : displayRegs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">尚無申請記錄</p>
            </div>
          ) : (
            displayRegs.map((reg: any) => {
              const sc = STATUS_CONFIG[reg.status] ?? STATUS_CONFIG.pending;
              const isSelected = selectedId === reg.id;
              return (
                <div
                  key={reg.id}
                  onClick={() => setSelectedId(isSelected ? null : reg.id)}
                  className={`bg-card rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "border-blue-500 ring-1 ring-blue-400 shadow-md" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{reg.company_name}</p>
                      <p className="text-xs text-muted-foreground">{reg.contact_person} · {reg.contact_phone}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${sc.color}`}>
                      {sc.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {reg.fleet_size}輛</span>
                    <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {reg.risk_score ?? 100}分</span>
                    {reg.avg_rating && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400" /> {Number(reg.avg_rating).toFixed(1)}</span>}
                    {reg.open_complaints > 0 && <span className="text-red-500 font-bold">{reg.open_complaints}件投訴</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(reg.created_at), "M/d HH:mm 申請")}
                    {reg.vehicle_types && <span className="ml-2 text-blue-600">{reg.vehicle_types}</span>}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        <div className="md:col-span-3">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
              <Building2 className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">點選左側申請記錄查看詳情</p>
            </div>
          ) : detail ? (
            <FleetDetail
              detail={detail}
              onStatusChange={(status, opts) => updateStatus.mutate({ id: detail.id, status, ...opts })}
              onAddVehicle={() => setShowAddVehicle(true)}
              qc={qc}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Add vehicle dialog */}
      {showAddVehicle && selectedId && (
        <AddVehicleDialog
          fleetRegId={selectedId}
          onClose={() => setShowAddVehicle(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["fleet-reg-detail", selectedId] });
            setShowAddVehicle(false);
          }}
        />
      )}
    </div>
  );
}

function FleetDetail({ detail, onStatusChange, onAddVehicle, qc }: {
  detail: any;
  onStatusChange: (status: string, opts?: any) => void;
  onAddVehicle: () => void;
  qc: any;
}) {
  const [reviewNote, setReviewNote] = useState("");
  const [commission, setCommission] = useState(String(detail.commission_rate ?? 20));
  const [orderMode, setOrderMode] = useState(detail.order_mode ?? "grab");
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ type: "service", description: "", severity: "medium" });

  const sc = STATUS_CONFIG[detail.status] ?? STATUS_CONFIG.pending;

  const submitComplaint = async () => {
    if (!complaintForm.description) return;
    await fetch("/api/fleet/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fleetRegId: detail.id,
        complaintType: complaintForm.type,
        description: complaintForm.description,
        severity: complaintForm.severity,
      }),
    });
    qc.invalidateQueries({ queryKey: ["fleet-reg-detail", detail.id] });
    setShowComplaint(false);
    setComplaintForm({ type: "service", description: "", severity: "medium" });
  };

  const saveCommission = async () => {
    await fetch(`/api/fleet/registrations/${detail.id}/commission`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionRate: Number(commission), orderMode }),
    });
    qc.invalidateQueries({ queryKey: ["fleet-reg-detail", detail.id] });
    qc.invalidateQueries({ queryKey: ["fleet-regs"] });
  };

  const deleteVehicle = async (vehicleId: number) => {
    if (!confirm("確認刪除此車輛？")) return;
    await fetch(`/api/fleet/vehicles/${vehicleId}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["fleet-reg-detail", detail.id] });
  };

  return (
    <div className="space-y-4">
      {/* Company header */}
      <div className="bg-card rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-black text-lg">{detail.company_name}</h3>
            <p className="text-sm text-muted-foreground">申請編號：FR-{String(detail.id).padStart(6, "0")}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <span className={`text-xs px-2 py-1 rounded-full font-bold ${sc.color}`}>{sc.label}</span>
            <RiskBadge score={detail.risk_score ?? 100} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          {[
            [Phone, detail.contact_person + " · " + detail.contact_phone],
            [Mail, detail.contact_email || "（未填）"],
            [MapPin, detail.address || "（未填）"],
            [Truck, `${detail.fleet_size} 輛 · ${detail.vehicle_types || "未指定"}`],
            [MapPin, detail.service_regions || "（未填）"],
            [FileText, `統編：${detail.tax_id || "未填"} · 年資：${detail.years_in_business || "未填"}`],
          ].map(([Icon, text], i) => (
            <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
              {/* @ts-ignore */}
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span className="text-xs break-all">{String(text)}</span>
            </div>
          ))}
        </div>

        {detail.notes && (
          <div className="bg-muted/40 rounded-lg p-2 text-xs text-muted-foreground">{detail.notes}</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="bg-card rounded-xl border p-4">
        <h4 className="font-bold text-sm mb-3">審核操作</h4>
        <div className="mb-3">
          <textarea
            className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="審核備注（可選）..."
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {detail.status === "pending" && (
            <button
              onClick={() => onStatusChange("reviewing", { reviewNotes: reviewNote })}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" /> 開始審核
            </button>
          )}
          {["pending", "reviewing", "rejected", "suspended"].includes(detail.status) && (
            <button
              onClick={() => {
                if (confirm(`確認通過 ${detail.company_name} 的入駐申請？`)) {
                  onStatusChange("approved", { reviewNotes: reviewNote, commissionRate: Number(commission) });
                }
              }}
              className="px-3 py-2 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 flex items-center gap-1"
            >
              <CheckCircle className="w-3.5 h-3.5" /> 批准通過
            </button>
          )}
          {["pending", "reviewing", "approved"].includes(detail.status) && (
            <button
              onClick={() => {
                const reason = prompt("請輸入拒絕/暫停原因：");
                if (reason !== null) onStatusChange("rejected", { rejectionReason: reason, reviewNotes: reviewNote });
              }}
              className="px-3 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" /> 拒絕
            </button>
          )}
          {detail.status === "approved" && (
            <button
              onClick={() => {
                const reason = prompt("請輸入暫停原因：");
                if (reason !== null) onStatusChange("suspended", { rejectionReason: reason });
              }}
              className="px-3 py-2 bg-orange-600 text-white text-sm font-bold rounded-xl hover:bg-orange-700 flex items-center gap-1"
            >
              <Ban className="w-3.5 h-3.5" /> 暫停
            </button>
          )}
          {detail.status === "suspended" && (
            <button
              onClick={() => onStatusChange("approved")}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 恢復接單
            </button>
          )}
        </div>
        {detail.rejection_reason && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-2">
            拒絕/暫停原因：{detail.rejection_reason}
          </p>
        )}
      </div>

      {/* Commission settings */}
      <div className="bg-card rounded-xl border p-4">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" /> 抽成與接單設定
        </h4>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-bold mb-1 block text-muted-foreground">平台抽成 (%)</label>
            <input
              type="number"
              min={0}
              max={50}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={commission}
              onChange={e => setCommission(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block text-muted-foreground">接單模式</label>
            <select
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={orderMode}
              onChange={e => setOrderMode(e.target.value)}
            >
              <option value="assigned">指派接單</option>
              <option value="grab">搶單模式</option>
              <option value="bidding">競標比價</option>
            </select>
          </div>
        </div>
        {commission && (
          <div className="bg-emerald-50 rounded-lg p-2 text-xs text-emerald-700 mb-3">
            <p>假設訂單金額 NT$2,000：</p>
            <p>平台收取 {commission}% = <strong>NT${Math.round(2000 * Number(commission) / 100).toLocaleString()}</strong></p>
            <p>車隊實得：<strong>NT${Math.round(2000 * (1 - Number(commission) / 100)).toLocaleString()}</strong></p>
          </div>
        )}
        <button
          onClick={saveCommission}
          className="w-full py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700"
        >
          儲存設定
        </button>
      </div>

      {/* Vehicle list */}
      <div className="bg-card rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" /> 旗下車輛（{detail.vehicles?.length ?? 0} 輛）
          </h4>
          <button
            onClick={onAddVehicle}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 新增
          </button>
        </div>
        {detail.vehicles?.length > 0 ? (
          <div className="space-y-2">
            {detail.vehicles.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{v.plate}</p>
                  <p className="text-xs text-muted-foreground">{v.vehicle_type}{v.brand_model ? ` · ${v.brand_model}` : ""}{v.year ? ` · ${v.year}年` : ""}</p>
                  {v.inspection_expires && (
                    <p className="text-xs text-muted-foreground">驗車到期：{v.inspection_expires}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${v.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {v.status === "active" ? "正常" : "停用"}
                </span>
                <button onClick={() => deleteVehicle(v.id)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">尚未登記車輛</p>
        )}
      </div>

      {/* Ratings */}
      <div className="bg-card rounded-xl border p-4">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" /> 評分紀錄（{detail.rating_count ?? 0} 筆）
          {detail.avg_rating && <span className="text-yellow-600 font-black">{Number(detail.avg_rating).toFixed(1)} ⭐</span>}
        </h4>
        {detail.ratings?.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {detail.ratings.map((r: any) => (
              <div key={r.id} className="text-xs py-1 border-b last:border-0 flex items-start gap-2">
                <span className="text-yellow-500">{"★".repeat(r.stars)}</span>
                <span className="text-muted-foreground">{r.comment || "（無評語）"}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">尚無評分</p>}
      </div>

      {/* Complaints */}
      <div className="bg-card rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> 投訴紀錄（{detail.complaints?.length ?? 0} 筆）
          </h4>
          <button
            onClick={() => setShowComplaint(!showComplaint)}
            className="text-xs px-2 py-1 border rounded-lg hover:bg-muted flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> 新增投訴
          </button>
        </div>
        {showComplaint && (
          <div className="bg-orange-50 rounded-xl p-3 mb-3 space-y-2">
            <select
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              value={complaintForm.type}
              onChange={e => setComplaintForm(f => ({ ...f, type: e.target.value }))}
            >
              <option value="service">服務品質</option>
              <option value="delay">延誤</option>
              <option value="damage">貨物損毀</option>
              <option value="safety">安全問題</option>
              <option value="other">其他</option>
            </select>
            <select
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              value={complaintForm.severity}
              onChange={e => setComplaintForm(f => ({ ...f, severity: e.target.value }))}
            >
              <option value="low">輕微</option>
              <option value="medium">一般</option>
              <option value="high">嚴重</option>
              <option value="critical">危急</option>
            </select>
            <textarea
              className="w-full border rounded-lg px-2 py-1.5 text-sm resize-none"
              rows={2}
              placeholder="投訴詳情..."
              value={complaintForm.description}
              onChange={e => setComplaintForm(f => ({ ...f, description: e.target.value }))}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowComplaint(false)} className="flex-1 py-1.5 border rounded-lg text-xs font-bold hover:bg-muted">取消</button>
              <button onClick={submitComplaint} className="flex-1 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700">送出</button>
            </div>
          </div>
        )}
        {detail.complaints?.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {detail.complaints.map((c: any) => (
              <div key={c.id} className={`text-xs py-2 border-b last:border-0 ${c.status === "open" ? "text-orange-700" : "text-muted-foreground"}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${
                    c.severity === "critical" ? "bg-red-100 text-red-700"
                    : c.severity === "high" ? "bg-orange-100 text-orange-700"
                    : "bg-yellow-100 text-yellow-700"
                  }`}>{c.severity === "critical" ? "危急" : c.severity === "high" ? "嚴重" : "一般"}</span>
                  <span className="font-bold">{c.complaint_type}</span>
                  <span className={c.status === "resolved" ? "text-green-600" : "text-orange-600"}>
                    {c.status === "resolved" ? "✓ 已處理" : "待處理"}
                  </span>
                </div>
                <p>{c.description}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">無投訴紀錄</p>}
      </div>
    </div>
  );
}

function AddVehicleDialog({ fleetRegId, onClose, onAdded }: { fleetRegId: number; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ plate: "", vehicleType: "箱型車", brandModel: "", year: "", capacityKg: "", inspectionExpires: "", insuranceExpires: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.plate) return alert("請輸入車牌號碼");
    setLoading(true);
    try {
      await fetch(`/api/fleet/registrations/${fleetRegId}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: form.plate, vehicleType: form.vehicleType, brandModel: form.brandModel || undefined,
          year: form.year || undefined, capacityKg: form.capacityKg || undefined,
          inspectionExpires: form.inspectionExpires || undefined, insuranceExpires: form.insuranceExpires || undefined,
        }),
      });
      onAdded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-background rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-black text-lg flex items-center gap-2"><Truck className="w-4 h-4" /> 新增車輛</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">車牌號碼 *</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm bg-background" placeholder="ABC-1234" value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">車種 *</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm bg-background" value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}>
                {["機車", "轎車", "廂型車", "箱型車", "小貨車", "一噸半", "3.5噸", "大貨車", "冷凍車"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">廠牌型號</label>
              <input className="w-full border rounded-xl px-3 py-2 text-sm bg-background" placeholder="Toyota Hiace" value={form.brandModel} onChange={e => setForm(f => ({ ...f, brandModel: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">年份</label>
              <input type="number" className="w-full border rounded-xl px-3 py-2 text-sm bg-background" placeholder="2020" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold mb-1 block">載重量 (kg)</label>
            <input type="number" className="w-full border rounded-xl px-3 py-2 text-sm bg-background" placeholder="1000" value={form.capacityKg} onChange={e => setForm(f => ({ ...f, capacityKg: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold mb-1 block">驗車到期日</label>
              <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm bg-background" value={form.inspectionExpires} onChange={e => setForm(f => ({ ...f, inspectionExpires: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-bold mb-1 block">保險到期日</label>
              <input type="date" className="w-full border rounded-xl px-3 py-2 text-sm bg-background" value={form.insuranceExpires} onChange={e => setForm(f => ({ ...f, insuranceExpires: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border rounded-xl font-bold hover:bg-muted">取消</button>
          <button onClick={submit} disabled={loading} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
            {loading ? "新增中..." : "確認新增"}
          </button>
        </div>
      </div>
    </div>
  );
}
