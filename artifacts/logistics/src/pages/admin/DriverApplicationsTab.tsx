import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, XCircle, Clock, Eye, FileText, Truck, User,
  AlertTriangle, Shield, ShieldOff, Star, Search, X, RefreshCw,
  ChevronRight, ChevronDown, ChevronUp, ExternalLink, UserX,
  Bell, Download,
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Application {
  id: number; name: string; phone: string; id_number: string; address: string; email: string;
  vehicle_type: string; vehicle_tonnage: string; max_load_kg: number;
  license_plate: string; vehicle_year: number; vehicle_body_type: string;
  has_tailgate: boolean; has_refrigeration: boolean; has_hydraulic_pallet: boolean;
  status: string; rejection_reason: string | null;
  reviewed_by: string | null; reviewed_at: string | null;
  contract_signed: boolean; contract_signed_at: string | null;
  notes: string | null; created_at: string; docCount: number;
}

interface DocRow {
  id: number; doc_type: string; doc_label: string; filename: string;
  file_size: number; mime_type: string; expiry_date: string; uploaded_at: string; has_file: boolean;
}

interface DriverExtended {
  id: number; name: string; phone: string; vehicle_type: string; license_plate: string;
  status: string; rating: number; rating_count: number;
  is_blacklisted: boolean; blacklist_reason: string | null;
  is_suspended: boolean; suspend_reason: string | null;
  contract_signed: boolean; license_expiry: string | null;
  vehicle_reg_expiry: string | null; insurance_expiry: string | null;
  has_tailgate: boolean; has_refrigeration: boolean; has_hydraulic_pallet: boolean;
  lat: number | null; lng: number | null;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "待審核", color: "bg-orange-50 text-orange-700 border-orange-200", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "已通過", color: "bg-green-50 text-green-700 border-green-200",   icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: "已退件", color: "bg-red-50 text-red-700 border-red-200",         icon: <XCircle className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.pending!;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${s.color}`}>
      {s.icon}{s.label}
    </span>
  );
}

// ─── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating?.toFixed(1)}</span>
    </div>
  );
}

// ─── Document Viewer ───────────────────────────────────────────────────────────

function DocViewer({ appId }: { appId: number }) {
  const { data: docs = [] } = useQuery<DocRow[]>({
    queryKey: ["app-docs", appId],
    queryFn: () => fetch(`${API}/driver-applications/${appId}/documents`).then(r => r.json()),
  });

  const docLabels: Record<string, string> = {
    driver_license: "駕照", id_card: "身分證", vehicle_reg: "行照",
    insurance: "保險", vehicle_photo_front: "車輛正面", vehicle_photo_side: "車輛側面",
  };

  function isExpiringSoon(d: string) {
    if (!d) return false;
    const diff = (new Date(d).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  }
  function isExpired(d: string) {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  }

  if (docs.length === 0) return (
    <div className="text-center py-4 text-xs text-muted-foreground">尚未上傳任何文件</div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {docs.map(doc => (
        <div key={doc.id} className="border rounded-lg p-2.5 text-xs space-y-1.5 bg-card">
          <div className="font-semibold">{doc.doc_label ?? docLabels[doc.doc_type] ?? doc.doc_type}</div>
          <div className="text-muted-foreground truncate">{doc.filename ?? "未知檔案"}</div>
          {doc.expiry_date && (
            <div className={`flex items-center gap-1 ${isExpired(doc.expiry_date) ? "text-red-500" : isExpiringSoon(doc.expiry_date) ? "text-orange-500" : "text-muted-foreground"}`}>
              {isExpired(doc.expiry_date) ? <AlertTriangle className="w-3 h-3" /> : null}
              到期：{doc.expiry_date}
            </div>
          )}
          {doc.has_file && (
            <a href={`${API}/driver-applications/${appId}/documents/${doc.id}/file`} target="_blank"
              className="flex items-center gap-1 text-primary hover:underline">
              <Eye className="w-3 h-3" /> 查看文件
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Review Dialog ─────────────────────────────────────────────────────────────

function ReviewDialog({ app, onClose, onDone }: { app: Application | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!app) return null;

  async function submit() {
    if (!action) return;
    if (action === "reject" && !reason) { toast({ title: "請填寫退件原因", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/driver-applications/${app.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason, reviewedBy: "admin" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: action === "approve" ? "✅ 已通過審核，司機帳號已建立" : "已退件" });
        onDone();
      } else {
        toast({ title: "操作失敗", description: data.error, variant: "destructive" });
      }
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={!!app} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> 審核申請 #{app.id} · {app.name}
          </DialogTitle>
          <DialogDescription>
            申請時間：{format(new Date(app.created_at), "yyyy/MM/dd HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Personal info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[
              ["姓名", app.name], ["電話", app.phone],
              ["身分證", app.id_number], ["地址", app.address],
              ["Email", app.email], ["", ""],
            ].map(([l, v], i) => l ? (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">{l}</span>
                <span className="font-medium">{v || "—"}</span>
              </div>
            ) : null)}
          </div>

          <Separator />

          {/* Vehicle */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[
              ["車型", app.vehicle_type], ["噸數", app.vehicle_tonnage],
              ["車牌", app.license_plate], ["年份", app.vehicle_year],
              ["車廂", app.vehicle_body_type], ["載重", app.max_load_kg ? `${app.max_load_kg}kg` : "—"],
            ].map(([l, v], i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">{l}</span>
                <span className="font-medium">{v || "—"}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap text-xs">
            {app.has_tailgate && <Badge variant="outline">🚚 尾門</Badge>}
            {app.has_refrigeration && <Badge variant="outline">🌡️ 冷藏</Badge>}
            {app.has_hydraulic_pallet && <Badge variant="outline">🔧 油壓板</Badge>}
          </div>

          <Separator />

          {/* Documents */}
          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> 上傳文件（{app.docCount} 份）
            </div>
            <DocViewer appId={app.id} />
          </div>

          {/* Contract */}
          {app.contract_signed && (
            <div className="flex items-center gap-2 text-xs bg-green-50 text-green-700 p-2 rounded border border-green-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已電子簽署合約 · {app.contract_signed_at ? format(new Date(app.contract_signed_at), "yyyy/MM/dd HH:mm") : ""}
            </div>
          )}

          {app.notes && (
            <div className="text-xs bg-muted rounded p-2 text-muted-foreground">備註：{app.notes}</div>
          )}

          <Separator />

          {/* Action */}
          {app.status === "pending" ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setAction("approve")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all
                    ${action === "approve" ? "border-green-500 bg-green-50 text-green-700" : "hover:bg-muted/50"}`}>
                  ✅ 通過審核
                </button>
                <button onClick={() => setAction("reject")}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all
                    ${action === "reject" ? "border-red-400 bg-red-50 text-red-600" : "hover:bg-muted/50"}`}>
                  ❌ 退件
                </button>
              </div>
              {action === "reject" && (
                <div>
                  <Label className="text-xs">退件原因（必填，將通知申請人）</Label>
                  <Textarea className="mt-1 text-sm" rows={3} placeholder="請說明退件原因..." value={reason} onChange={e => setReason(e.target.value)} />
                </div>
              )}
              {action && (
                <Button className={`w-full ${action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                  onClick={submit} disabled={loading}>
                  {loading ? "處理中..." : action === "approve" ? "確認通過" : "確認退件"}
                </Button>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted/40 text-sm text-center text-muted-foreground">
              此申請已完成審核：<StatusBadge status={app.status} />
              {app.rejection_reason && <div className="mt-1 text-red-500 text-xs">退件原因：{app.rejection_reason}</div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Suspend / Blacklist Dialog ────────────────────────────────────────────────

function ActionDialog({ driver, actionType, onClose, onDone }: {
  driver: DriverExtended | null; actionType: "suspend" | "blacklist" | "unsuspend" | "unblacklist";
  onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!driver) return null;
  const isLift = actionType === "unsuspend" || actionType === "unblacklist";
  const endpoint = (actionType === "suspend" || actionType === "unsuspend") ? "suspend" : "blacklist";
  const titleMap = { suspend: "停權司機", blacklist: "加入黑名單", unsuspend: "解除停權", unblacklist: "移除黑名單" };

  async function submit() {
    if (!isLift && !reason) { toast({ title: "請填寫原因", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/drivers/${driver.id}/${endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || "解除", lift: isLift }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `已${titleMap[actionType]}` });
        onDone();
      } else {
        toast({ title: "失敗", description: data.error, variant: "destructive" });
      }
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={!!driver} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{titleMap[actionType]} · {driver.name}</DialogTitle>
        </DialogHeader>
        {!isLift && (
          <div>
            <Label className="text-sm">原因 <span className="text-red-500">*</span></Label>
            <Textarea className="mt-1" rows={3} placeholder={`請說明${titleMap[actionType]}原因...`} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        )}
        {isLift && (
          <p className="text-sm text-muted-foreground">確認要{titleMap[actionType]}嗎？操作後司機可重新接單。</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button className={isLift ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            onClick={submit} disabled={loading}>
            {loading ? "處理中..." : "確認"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Driver Row ────────────────────────────────────────────────────────────────

function DriverRow({ driver, onAction }: {
  driver: DriverExtended;
  onAction: (driver: DriverExtended, type: "suspend" | "blacklist" | "unsuspend" | "unblacklist") => void;
}) {
  const statusColor = driver.status === "available" ? "bg-green-500" :
    driver.status === "busy" ? "bg-orange-400" : "bg-slate-300";

  function isExpiringSoon(d: string | null) {
    if (!d) return false;
    const diff = (new Date(d).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 30;
  }
  function isExpired(d: string | null) {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  }

  const docWarnings = [
    driver.license_expiry && (isExpired(driver.license_expiry) ? "駕照已過期" : isExpiringSoon(driver.license_expiry) ? `駕照${driver.license_expiry}到期` : ""),
    driver.vehicle_reg_expiry && (isExpired(driver.vehicle_reg_expiry) ? "行照已過期" : isExpiringSoon(driver.vehicle_reg_expiry) ? `行照${driver.vehicle_reg_expiry}到期` : ""),
    driver.insurance_expiry && (isExpired(driver.insurance_expiry) ? "保險已過期" : isExpiringSoon(driver.insurance_expiry) ? `保險${driver.insurance_expiry}到期` : ""),
  ].filter(Boolean);

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${driver.is_blacklisted ? "border-red-300 bg-red-50/30" : driver.is_suspended ? "border-orange-300 bg-orange-50/30" : "bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
            <span className="font-semibold text-sm">{driver.name}</span>
            <span className="text-xs text-muted-foreground">{driver.phone}</span>
            {driver.is_blacklisted && <Badge variant="destructive" className="text-[10px] py-0 h-4">黑名單</Badge>}
            {driver.is_suspended && <Badge className="text-[10px] py-0 h-4 bg-orange-500">停權中</Badge>}
            {!driver.contract_signed && <Badge variant="outline" className="text-[10px] py-0 h-4 border-yellow-400 text-yellow-600">未簽約</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {driver.vehicle_type} · {driver.license_plate}
            {driver.has_tailgate && " · 尾門"}
            {driver.has_refrigeration && " · 冷藏"}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <StarRating rating={driver.rating ?? 5} />
        </div>
      </div>

      {docWarnings.length > 0 && (
        <div className="text-[11px] bg-orange-50 border border-orange-200 rounded px-2 py-1 text-orange-700 flex items-center gap-1">
          <Bell className="w-3 h-3 shrink-0" />
          {docWarnings.join("、")}
        </div>
      )}

      {(driver.blacklist_reason || driver.suspend_reason) && (
        <div className="text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">
          {driver.is_blacklisted ? `黑名單原因：${driver.blacklist_reason}` : `停權原因：${driver.suspend_reason}`}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap pt-1">
        {driver.is_suspended ? (
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 border-green-400 text-green-700"
            onClick={() => onAction(driver, "unsuspend")}>解除停權</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 border-orange-400 text-orange-700"
            onClick={() => onAction(driver, "suspend")}>停權</Button>
        )}
        {driver.is_blacklisted ? (
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 border-green-400 text-green-700"
            onClick={() => onAction(driver, "unblacklist")}>移除黑名單</Button>
        ) : (
          <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 border-red-400 text-red-700"
            onClick={() => onAction(driver, "blacklist")}>加入黑名單</Button>
        )}
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function DriverApplicationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [view, setView] = useState<"applications" | "drivers" | "expiring">("applications");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [reviewApp, setReviewApp] = useState<Application | null>(null);
  const [actionDriver, setActionDriver] = useState<DriverExtended | null>(null);
  const [actionType, setActionType] = useState<"suspend" | "blacklist" | "unsuspend" | "unblacklist">("suspend");

  const { data: apps = [], isLoading: appsLoading } = useQuery<Application[]>({
    queryKey: ["driver-applications", filterStatus],
    queryFn: () => fetch(`${API}/driver-applications${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<DriverExtended[]>({
    queryKey: ["drivers-extended"],
    queryFn: () => fetch(`${API}/drivers/extended`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: expiringDocs = [] } = useQuery<any[]>({
    queryKey: ["expiring-docs"],
    queryFn: () => fetch(`${API}/drivers/expiring-docs`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const filteredApps = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter(a =>
      a.name.toLowerCase().includes(q) || a.phone.includes(q) ||
      a.license_plate?.toLowerCase().includes(q) || a.id_number?.includes(q)
    );
  }, [apps, search]);

  const filteredDrivers = useMemo(() => {
    if (!search) return drivers;
    const q = search.toLowerCase();
    return drivers.filter(d => d.name.toLowerCase().includes(q) || d.phone.includes(q) || d.license_plate?.toLowerCase().includes(q));
  }, [drivers, search]);

  const pendingCount = apps.filter(a => a.status === "pending").length;

  function openAction(driver: DriverExtended, type: typeof actionType) {
    setActionDriver(driver);
    setActionType(type);
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "待審核", value: apps.filter(a => a.status === "pending").length, color: "text-orange-500", icon: <Clock className="w-4 h-4" /> },
          { label: "已通過", value: apps.filter(a => a.status === "approved").length, color: "text-green-600", icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: "已退件", value: apps.filter(a => a.status === "rejected").length, color: "text-red-500", icon: <XCircle className="w-4 h-4" /> },
          { label: "文件到期警示", value: expiringDocs.length, color: "text-amber-500", icon: <AlertTriangle className="w-4 h-4" /> },
        ].map(item => (
          <Card key={item.label} className="border shadow-sm">
            <CardContent className="p-3 flex items-center gap-2">
              <span className={item.color}>{item.icon}</span>
              <div>
                <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                <div className="text-[11px] text-muted-foreground">{item.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "applications", label: "加盟申請", badge: pendingCount },
          { key: "drivers", label: "司機管理" },
          { key: "expiring", label: "文件到期提醒", badge: expiringDocs.length },
        ].map(tab => (
          <button key={tab.key} onClick={() => setView(tab.key as any)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5
              ${view === tab.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50"}`}>
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 ${view === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-orange-100 text-orange-600"}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-8 gap-1.5"
          onClick={() => { qc.invalidateQueries({ queryKey: ["driver-applications"] }); qc.invalidateQueries({ queryKey: ["drivers-extended"] }); }}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋姓名、電話、車牌..."
          className="w-full h-9 pl-9 pr-8 text-sm bg-card border rounded-md outline-none focus:ring-2 focus:ring-primary/30 transition" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>}
      </div>

      {/* Applications view */}
      {view === "applications" && (
        <div className="space-y-3">
          <div className="flex gap-1 flex-wrap">
            {["all","pending","approved","rejected"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded text-xs border transition-all ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50"}`}>
                {s === "all" ? "全部" : STATUS_STYLES[s]?.label ?? s}
              </button>
            ))}
          </div>
          {appsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />)}</div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg">無申請記錄</div>
          ) : (
            <div className="space-y-2">
              {filteredApps.map(app => (
                <div key={app.id} className="border rounded-lg p-3 bg-card hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">#{app.id}</span>
                        <span className="text-sm">{app.name}</span>
                        <span className="text-xs text-muted-foreground">{app.phone}</span>
                        <StatusBadge status={app.status} />
                        {app.contract_signed && <span className="text-[10px] text-green-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />已簽約</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {app.vehicle_type}{app.vehicle_tonnage ? ` (${app.vehicle_tonnage})` : ""} · {app.license_plate ?? "—"}
                        {app.has_tailgate && " · 尾門"}{app.has_refrigeration && " · 冷藏"}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        申請：{format(new Date(app.created_at), "yyyy/MM/dd HH:mm")} · 文件：{app.docCount} 份
                        {app.reviewed_at && ` · 審核：${format(new Date(app.reviewed_at), "MM/dd")}`}
                      </div>
                      {app.rejection_reason && <div className="text-[11px] text-red-500 mt-0.5">退件：{app.rejection_reason}</div>}
                    </div>
                    <Button size="sm" variant={app.status === "pending" ? "default" : "outline"} className="h-7 text-xs gap-1 shrink-0"
                      onClick={() => setReviewApp(app)}>
                      <Eye className="w-3 h-3" /> {app.status === "pending" ? "審核" : "查看"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drivers view */}
      {view === "drivers" && (
        <div className="space-y-2">
          {driversLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/60 rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredDrivers.map(d => <DriverRow key={d.id} driver={d} onAction={openAction} />)}
            </div>
          )}
        </div>
      )}

      {/* Expiring docs view */}
      {view === "expiring" && (
        <div className="space-y-2">
          {expiringDocs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-500 opacity-60" />
              所有司機文件均在有效期內
            </div>
          ) : (
            expiringDocs.map((d: any) => (
              <div key={d.id} className="border border-orange-200 rounded-lg p-3 bg-orange-50/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="font-semibold text-sm">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.phone}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(d.warnings as string[]).map((w: string) => (
                    <span key={w} className="text-[11px] bg-orange-100 text-orange-700 rounded px-2 py-0.5 border border-orange-200">{w}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ReviewDialog app={reviewApp} onClose={() => setReviewApp(null)}
        onDone={() => { setReviewApp(null); qc.invalidateQueries({ queryKey: ["driver-applications"] }); }} />
      <ActionDialog driver={actionDriver} actionType={actionType}
        onClose={() => setActionDriver(null)}
        onDone={() => { setActionDriver(null); qc.invalidateQueries({ queryKey: ["drivers-extended"] }); }} />
    </div>
  );
}
