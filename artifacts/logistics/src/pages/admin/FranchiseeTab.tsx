import { useState, useEffect, useCallback } from "react";
import {
  Building2, Plus, RefreshCw, Edit2, Trash2, TrendingUp, Users,
  DollarSign, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  FileText, Send, MapPin, Phone, Mail, Calendar, KeyRound, Eye, EyeOff,
  Truck, UserCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Franchisee {
  id: number;
  code: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  zone_name: string | null;
  contract_type: "revenue_share" | "monthly_fixed" | "hybrid";
  commission_rate: string;
  monthly_fee: string;
  status: "active" | "pending" | "suspended" | "terminated";
  notes: string | null;
  joined_at: string | null;
  contract_end_at: string | null;
  username: string | null;
  has_password: boolean;
  last_login_at: string | null;
  affiliation_type: "affiliated" | "independent";
  settlement_count: string;
  total_gross_revenue: string;
  total_net_payout: string;
  current_month_orders: string;
}

interface FranchiseeDriver {
  id: number;
  name: string;
  phone: string;
  vehicle_type: string;
  license_plate: string;
  status: string;
  username: string | null;
  has_password: boolean;
  driver_type: string | null;
  created_at: string;
}

interface DriverForm {
  name: string;
  phone: string;
  vehicle_type: string;
  license_plate: string;
  username: string;
  password: string;
  driver_type: string;
}

const EMPTY_DRIVER: DriverForm = {
  name: "", phone: "", vehicle_type: "", license_plate: "",
  username: "", password: "", driver_type: "affiliated",
};

const DRIVER_TYPE_MAP: Record<string, string> = {
  self: "自家司機",
  affiliated: "靠行司機",
  external: "外部司機",
};

interface Settlement {
  id: number;
  franchisee_id: number;
  period_year: number;
  period_month: number;
  order_count: number;
  gross_revenue: string;
  commission_rate: string;
  commission_amount: string;
  platform_fee: string;
  monthly_fee: string;
  net_payout: string;
  status: "pending" | "confirmed" | "paid";
  settled_at: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const NT = (v: string | number) =>
  `NT$ ${Number(v).toLocaleString()}`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:     { label: "合作中", color: "bg-green-100 text-green-700" },
  pending:    { label: "審核中", color: "bg-amber-100 text-amber-700" },
  suspended:  { label: "暫停",   color: "bg-orange-100 text-orange-700" },
  terminated: { label: "終止",   color: "bg-red-100 text-red-700" },
};

const CONTRACT_LABELS: Record<string, string> = {
  revenue_share: "分潤制",
  monthly_fixed: "月費制",
  hybrid:        "混合制",
};

const SETTLE_STATUS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: "待確認", color: "bg-amber-100 text-amber-700",   icon: <Clock className="w-3 h-3" /> },
  confirmed: { label: "已確認", color: "bg-blue-100 text-blue-700",    icon: <CheckCircle2 className="w-3 h-3" /> },
  paid:      { label: "已撥款", color: "bg-green-100 text-green-700",  icon: <DollarSign className="w-3 h-3" /> },
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// ─── Extended form with credentials ──────────────────────────────────────────
interface FranchiseeForm extends Partial<Franchisee> {
  password?: string;
}

const AFFILIATION_MAP: Record<string, { label: string; color: string; border: string }> = {
  affiliated:   { label: "靠行",   color: "#1d4ed8", border: "#bfdbfe" },
  independent:  { label: "非靠行", color: "#7c3aed", border: "#ddd6fe" },
};

const EMPTY: FranchiseeForm = {
  name: "", owner_name: "", phone: "", email: "", address: "", zone_name: "",
  contract_type: "revenue_share", commission_rate: "70", monthly_fee: "0",
  status: "active", notes: "", joined_at: "", contract_end_at: "",
  username: "", password: "", affiliation_type: "affiliated",
};

function authHeaders() {
  const token = localStorage.getItem("auth-jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FranchiseeTab() {
  const { toast } = useToast();
  const [franchisees, setFranchisees]     = useState<Franchisee[]>([]);
  const [loading, setLoading]             = useState(true);
  const [stats, setStats]                 = useState<any>(null);

  const [showForm, setShowForm]           = useState(false);
  const [formData, setFormData]           = useState<FranchiseeForm>(EMPTY);
  const [editId, setEditId]               = useState<number | null>(null);
  const [saving, setSaving]               = useState(false);
  const [showPw, setShowPw]               = useState(false);

  const [expandedId, setExpandedId]       = useState<number | null>(null);
  const [settlements, setSettlements]     = useState<Record<number, Settlement[]>>({});
  const [genYear, setGenYear]             = useState(new Date().getFullYear());
  const [genMonth, setGenMonth]           = useState(new Date().getMonth() + 1);
  const [genOrderCount, setGenOrderCount] = useState("");
  const [genRevenue, setGenRevenue]       = useState("");
  const [generating, setGenerating]       = useState<number | null>(null);

  const [filterStatus, setFilterStatus]       = useState("all");
  const [filterAffiliation, setFilterAffiliation] = useState("all");
  const [search, setSearch]               = useState("");

  // ─── Driver management state ──────────────────────────────────────────
  const [franchiseeDrivers, setFranchiseeDrivers] = useState<Record<number, FranchiseeDriver[]>>({});
  const [expandedSubTab, setExpandedSubTab]       = useState<Record<number, "settlement" | "drivers">>({});
  const [driverDialog, setDriverDialog]           = useState<{ franchiseeId: number; editDriver?: FranchiseeDriver } | null>(null);
  const [driverForm, setDriverForm]               = useState<DriverForm>(EMPTY_DRIVER);
  const [savingDriver, setSavingDriver]           = useState(false);
  const [showDriverPw, setShowDriverPw]           = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(getApiUrl("/api/franchisees"), { headers: authHeaders() }),
        fetch(getApiUrl("/api/franchisees/stats/overview"), { headers: authHeaders() }),
      ]);
      setFranchisees(await listRes.json());
      setStats(await statsRes.json());
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchSettlements = async (id: number) => {
    try {
      const res = await fetch(getApiUrl(`/api/franchisees/${id}/settlements`), { headers: authHeaders() });
      const data = await res.json();
      setSettlements(prev => ({ ...prev, [id]: data }));
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!settlements[id]) fetchSettlements(id);
      if (!franchiseeDrivers[id]) fetchFranchiseeDrivers(id);
    }
  };

  const fetchFranchiseeDrivers = async (franchiseeId: number) => {
    try {
      const res = await fetch(
        getApiUrl(`/api/drivers?franchisee_id=${franchiseeId}`),
        { headers: authHeaders() }
      );
      const data = await res.json();
      setFranchiseeDrivers(prev => ({ ...prev, [franchiseeId]: Array.isArray(data) ? data : [] }));
    } catch { /* ignore */ }
  };

  const openDriverCreate = (franchiseeId: number) => {
    setDriverForm(EMPTY_DRIVER);
    setShowDriverPw(false);
    setDriverDialog({ franchiseeId });
  };

  const openDriverEdit = (franchiseeId: number, d: FranchiseeDriver) => {
    setDriverForm({
      name: d.name,
      phone: d.phone,
      vehicle_type: d.vehicle_type,
      license_plate: d.license_plate,
      username: d.username ?? "",
      password: "",
      driver_type: d.driver_type ?? "affiliated",
    });
    setShowDriverPw(false);
    setDriverDialog({ franchiseeId, editDriver: d });
  };

  const handleSaveDriver = async () => {
    if (!driverDialog) return;
    if (!driverForm.name.trim() || !driverForm.phone.trim()) {
      toast({ title: "姓名和電話為必填", variant: "destructive" }); return;
    }
    setSavingDriver(true);
    try {
      const { franchiseeId, editDriver } = driverDialog;
      const payload = {
        name: driverForm.name.trim(),
        phone: driverForm.phone.trim(),
        vehicleType: driverForm.vehicle_type.trim() || "小型車",
        licensePlate: driverForm.license_plate.trim() || "未填",
        driverType: driverForm.driver_type,
        username: driverForm.username.trim() || undefined,
        password: driverForm.password.trim() || undefined,
        franchiseeId,
      };
      if (editDriver) {
        const res = await fetch(getApiUrl(`/api/drivers/${editDriver.id}`), {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "更新失敗");
        toast({ title: "司機資料已更新", description: driverForm.name });
      } else {
        const res = await fetch(getApiUrl("/api/drivers"), {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "建立失敗");
        toast({ title: "司機已建立", description: driverForm.name });
      }
      setDriverDialog(null);
      setFranchiseeDrivers(prev => ({ ...prev, [franchiseeId]: [] })); // force refetch
      await fetchFranchiseeDrivers(franchiseeId);
    } catch (e: any) {
      toast({ title: "操作失敗", description: e.message, variant: "destructive" });
    } finally {
      setSavingDriver(false);
    }
  };

  const handleDeleteDriver = async (franchiseeId: number, driverId: number, name: string) => {
    if (!confirm(`確定要移除司機「${name}」？`)) return;
    try {
      await fetch(getApiUrl(`/api/drivers/${driverId}`), {
        method: "DELETE", headers: authHeaders(),
      });
      toast({ title: "已移除", description: name });
      setFranchiseeDrivers(prev => ({
        ...prev,
        [franchiseeId]: (prev[franchiseeId] ?? []).filter(d => d.id !== driverId),
      }));
    } catch {
      toast({ title: "移除失敗", variant: "destructive" });
    }
  };

  // ─── Form handlers ────────────────────────────────────────────────────
  const openCreate = () => { setFormData(EMPTY); setEditId(null); setShowPw(false); setShowForm(true); };
  const openEdit   = (f: Franchisee) => {
    setFormData({
      ...f,
      commission_rate: String(f.commission_rate),
      monthly_fee: String(f.monthly_fee),
      joined_at: f.joined_at ? f.joined_at.split("T")[0] : "",
      contract_end_at: f.contract_end_at ? f.contract_end_at.split("T")[0] : "",
      password: "",
    });
    setEditId(f.id);
    setShowPw(false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast({ title: "請輸入加盟商名稱", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const url    = editId ? getApiUrl(`/api/franchisees/${editId}`) : getApiUrl("/api/franchisees");
      const method = editId ? "PATCH" : "POST";
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(formData) });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: editId ? "已更新" : "加盟主已建立", description: formData.name });
      setShowForm(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "儲存失敗", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTerminate = async (f: Franchisee) => {
    if (!confirm(`確定要終止「${f.name}」的加盟合約？`)) return;
    await fetch(getApiUrl(`/api/franchisees/${f.id}`), { method: "DELETE", headers: authHeaders() });
    toast({ title: "已終止合約", description: f.name });
    fetchAll();
  };

  const handleGenerate = async (id: number) => {
    setGenerating(id);
    try {
      const body: Record<string, unknown> = { year: genYear, month: genMonth };
      if (genOrderCount) body.order_count   = Number(genOrderCount);
      if (genRevenue)    body.gross_revenue = Number(genRevenue.replace(/,/g, ""));
      const res = await fetch(getApiUrl(`/api/franchisees/${id}/settlements/generate`), {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      toast({ title: `${genYear}年${genMonth}月 結算已產出`, description: `應撥款 ${NT(data.net_payout)}` });
      fetchSettlements(id);
    } catch (e: any) {
      toast({ title: "結算失敗", description: e?.message, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const handleSettleStatus = async (sid: number, status: string, franchiseeId: number) => {
    await fetch(getApiUrl(`franchisee-settlements/${sid}/status`), {
      method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
    });
    fetchSettlements(franchiseeId);
  };

  // ─── Filter ──────────────────────────────────────────────────────────
  const filtered = franchisees.filter(f => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterAffiliation !== "all" && (f.affiliation_type ?? "affiliated") !== filterAffiliation) return false;
    if (search) {
      const q = search.toLowerCase();
      return f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q)
        || (f.zone_name ?? "").toLowerCase().includes(q)
        || (f.owner_name ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // ─── Stats cards ─────────────────────────────────────────────────────
  const statCards = stats ? [
    { label: "合作中加盟主",  value: stats.franchisees?.active_count ?? 0,   icon: <Building2 className="w-5 h-5" />,  color: "text-green-600",  bg: "bg-green-50" },
    { label: "審核中",        value: stats.franchisees?.pending_count ?? 0,   icon: <Clock className="w-5 h-5" />,      color: "text-amber-600",  bg: "bg-amber-50" },
    { label: "本月結算收益",  value: NT(stats.settlements?.this_month_revenue ?? 0), icon: <TrendingUp className="w-5 h-5" />, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "待撥款總額",    value: NT(stats.settlements?.pending_payout ?? 0),     icon: <DollarSign className="w-5 h-5" />, color: "text-violet-600", bg: "bg-violet-50" },
  ] : [];

  if (loading) return <div className="flex justify-center items-center h-40 text-muted-foreground">載入中...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            加盟主管理
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">管理各區域加盟合作夥伴及每月分潤結算</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />重新整理
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />新增加盟主
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <Card key={s.label} className={`border-0 ${s.bg}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                  </div>
                  <div className={`${s.color} opacity-60`}>{s.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Affiliation filter tabs */}
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #e5e7eb", paddingBottom: "8px" }}>
        {[
          { key: "all", label: "全部" },
          { key: "affiliated", label: "靠行" },
          { key: "independent", label: "非靠行" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterAffiliation(tab.key)}
            style={{
              padding: "4px 14px",
              fontSize: "13px",
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              fontWeight: filterAffiliation === tab.key ? 600 : 400,
              background: filterAffiliation === tab.key ? "#1d4ed8" : "transparent",
              color: filterAffiliation === tab.key ? "#fff" : "#6b7280",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            {tab.key !== "all" && (
              <span style={{ marginLeft: "5px", fontSize: "11px", opacity: 0.8 }}>
                ({franchisees.filter(f => (f.affiliation_type ?? "affiliated") === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="搜尋名稱 / 代碼 / 區域..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-sm w-56"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-sm w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部狀態</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">共 {filtered.length} 筆</span>
      </div>

      {/* Franchisee list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Building2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">尚無加盟主資料</p>
          <Button size="sm" onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-3.5 h-3.5 mr-1.5" />新增第一個加盟主
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => {
            const st = STATUS_MAP[f.status] ?? STATUS_MAP.pending;
            const isExpanded = expandedId === f.id;
            return (
              <Card key={f.id} className={`border transition-all ${f.status === "terminated" ? "opacity-60" : ""}`}>
                <CardContent className="pt-4 pb-3">
                  {/* Main row */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base">{f.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{f.code}</span>
                          <Badge className={`text-xs px-2 py-0 ${st.color}`}>{st.label}</Badge>
                          {(() => {
                            const aff = AFFILIATION_MAP[f.affiliation_type ?? "affiliated"];
                            return (
                              <span style={{
                                display: "inline-flex", alignItems: "center",
                                fontSize: "11px", padding: "1px 8px", borderRadius: "9999px",
                                background: aff.border, color: aff.color,
                                fontWeight: 600, border: `1px solid ${aff.border}`,
                              }}>
                                {aff.label}
                              </span>
                            );
                          })()}
                          <Badge variant="outline" className="text-xs px-2 py-0">
                            {CONTRACT_LABELS[f.contract_type]}・{f.commission_rate}%
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          {f.zone_name && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{f.zone_name}</span>}
                          {f.owner_name && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{f.owner_name}</span>}
                          {f.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{f.phone}</span>}
                          {f.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{f.email}</span>}
                          {f.joined_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />加盟：{f.joined_at.split("T")[0]}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
                          {f.username
                            ? <span className="flex items-center gap-1 text-blue-600 font-mono font-medium">
                                <KeyRound className="w-3 h-3" />帳號：{f.username}
                                {f.has_password
                                  ? <span className="ml-1 text-green-600">・密碼已設定</span>
                                  : <span className="ml-1 text-amber-500">・尚未設定密碼</span>}
                              </span>
                            : <span className="flex items-center gap-1 text-muted-foreground/60 italic">
                                <KeyRound className="w-3 h-3" />尚未設定登入帳號
                              </span>
                          }
                          {f.last_login_at && (
                            <span className="text-muted-foreground">最後登入：{new Date(f.last_login_at).toLocaleString("zh-TW")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side stats */}
                    <div className="flex items-center gap-4 text-right text-xs shrink-0">
                      <div>
                        <p className="text-muted-foreground">本月訂單</p>
                        <p className="font-bold text-sm text-blue-600">{f.current_month_orders} 筆</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">累計撥款</p>
                        <p className="font-bold text-sm text-green-600">{NT(f.total_net_payout)}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)} title="編輯">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {f.status !== "terminated" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleTerminate(f)} title="終止合約">
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpand(f.id)} title="結算明細">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded: sub-tab */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Sub-tab switcher */}
                      <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid #e5e7eb", paddingBottom: "8px" }}>
                        {([
                          { key: "settlement", icon: <DollarSign className="w-3.5 h-3.5" />, label: "月結帳單" },
                          { key: "drivers",    icon: <Truck className="w-3.5 h-3.5" />,     label: `司機管理（${franchiseeDrivers[f.id]?.length ?? "…"}）` },
                        ] as const).map(tab => {
                          const active = (expandedSubTab[f.id] ?? "settlement") === tab.key;
                          return (
                            <button key={tab.key} onClick={() => setExpandedSubTab(p => ({ ...p, [f.id]: tab.key }))}
                              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 12px",
                                fontSize: "12px", borderRadius: "6px", border: "none", cursor: "pointer",
                                fontWeight: active ? 600 : 400, background: active ? "#1d4ed8" : "transparent",
                                color: active ? "#fff" : "#6b7280" }}>
                              {tab.icon}{tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* ── Drivers sub-tab ── */}
                      {(expandedSubTab[f.id] ?? "settlement") === "drivers" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5" />旗下司機
                            </span>
                            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => openDriverCreate(f.id)}>
                              <Plus className="w-3 h-3 mr-1" />新增司機
                            </Button>
                          </div>

                          {!franchiseeDrivers[f.id] ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">載入中...</p>
                          ) : franchiseeDrivers[f.id].length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <Truck className="w-8 h-8 mx-auto mb-2 opacity-20" />
                              <p className="text-xs">尚未建立司機帳號</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50">
                                  <tr>
                                    {["姓名", "電話", "車牌", "車型", "類型", "Atoms帳號", ""].map(h => (
                                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {franchiseeDrivers[f.id].map(d => (
                                    <tr key={d.id} className="hover:bg-muted/25">
                                      <td className="px-3 py-2 font-medium">{d.name}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{d.phone}</td>
                                      <td className="px-3 py-2 font-mono">{d.license_plate}</td>
                                      <td className="px-3 py-2">{d.vehicle_type}</td>
                                      <td className="px-3 py-2">
                                        <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "9999px",
                                          background: "#dbeafe", color: "#1d4ed8", fontWeight: 600 }}>
                                          {DRIVER_TYPE_MAP[d.driver_type ?? "affiliated"] ?? d.driver_type}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        {d.username
                                          ? <span className="flex items-center gap-1 text-blue-600 font-mono">
                                              <KeyRound className="w-3 h-3" />{d.username}
                                              {d.has_password
                                                ? <span className="text-green-600 ml-1">・密碼已設</span>
                                                : <span className="text-amber-500 ml-1">・未設密碼</span>}
                                            </span>
                                          : <span className="text-muted-foreground/50 italic">未設帳號</span>}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="flex gap-1 justify-end">
                                          <Button variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => openDriverEdit(f.id, d)}>
                                            <Edit2 className="w-3 h-3 text-blue-500" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => handleDeleteDriver(f.id, d.id, d.name)}>
                                            <Trash2 className="w-3 h-3 text-red-400" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Settlement sub-tab ── */}
                      {(expandedSubTab[f.id] ?? "settlement") === "settlement" && (
                      <div className="space-y-4">
                      {/* Generate settlement */}
                      <div className="flex flex-wrap gap-2 items-center bg-gray-50 rounded-xl p-3 border">
                        <span className="text-xs font-semibold w-full mb-1">產出月結帳單</span>
                        <Select value={String(genYear)} onValueChange={v => setGenYear(Number(v))}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={String(genMonth)} onValueChange={v => setGenMonth(Number(v))}>
                          <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTHS.map(m => <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">訂單數</span>
                          <Input className="h-7 w-20 text-xs" placeholder="自動" value={genOrderCount}
                            onChange={e => setGenOrderCount(e.target.value)} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">業績(NT$)</span>
                          <Input className="h-7 w-28 text-xs" placeholder="自動" value={genRevenue}
                            onChange={e => setGenRevenue(e.target.value)} />
                        </div>
                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => handleGenerate(f.id)} disabled={generating === f.id}>
                          <Send className="w-3 h-3 mr-1.5" />
                          {generating === f.id ? "計算中..." : "產出結算"}
                        </Button>
                      </div>

                      {/* Settlement table */}
                      {!settlements[f.id] ? (
                        <p className="text-xs text-muted-foreground">載入中...</p>
                      ) : settlements[f.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">尚無結算記錄</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                {["期間","訂單數","業績總額","加盟主分潤","平台留存","月費","實際撥款","狀態","操作"].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {settlements[f.id].map(s => {
                                const ss = SETTLE_STATUS[s.status] ?? SETTLE_STATUS.pending;
                                return (
                                  <tr key={s.id} className="hover:bg-muted/25">
                                    <td className="px-3 py-2 font-mono whitespace-nowrap">{s.period_year}/{String(s.period_month).padStart(2,"0")}</td>
                                    <td className="px-3 py-2 text-center">{s.order_count}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{NT(s.gross_revenue)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap text-green-700 font-medium">{NT(s.commission_amount)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{NT(s.platform_fee)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap text-orange-600">{NT(s.monthly_fee)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap font-bold text-blue-700">{NT(s.net_payout)}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ss.color}`}>
                                        {ss.icon}{ss.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {s.status === "pending" && (
                                        <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                          onClick={() => handleSettleStatus(s.id, "confirmed", f.id)}>確認</Button>
                                      )}
                                      {s.status === "confirmed" && (
                                        <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                                          onClick={() => handleSettleStatus(s.id, "paid", f.id)}>撥款</Button>
                                      )}
                                      {s.status === "paid" && (
                                        <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />完成</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              {editId ? "編輯加盟主資料" : "新增加盟主"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* 基本資料 */}
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">基本資料</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">加盟商名稱 *</Label>
              <Input placeholder="富詠北區物流中心" value={formData.name ?? ""} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">負責人</Label>
              <Input placeholder="王大明" value={formData.owner_name ?? ""} onChange={e => setFormData(p => ({ ...p, owner_name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">聯絡電話</Label>
              <Input placeholder="0912-345-678" value={formData.phone ?? ""} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" placeholder="partner@example.com" value={formData.email ?? ""} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">地址</Label>
              <Input placeholder="台北市大安區..." value={formData.address ?? ""} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">服務區域</Label>
              <Input placeholder="台北市北區、中山區" value={formData.zone_name ?? ""} onChange={e => setFormData(p => ({ ...p, zone_name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">狀態</Label>
              <Select value={formData.status ?? "active"} onValueChange={v => setFormData(p => ({ ...p, status: v as any }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">靠行類型</Label>
              <Select value={formData.affiliation_type ?? "affiliated"} onValueChange={v => setFormData(p => ({ ...p, affiliation_type: v as any }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="affiliated">靠行（掛牌在本公司）</SelectItem>
                  <SelectItem value="independent">非靠行（自有執照）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 合約設定 */}
            <div className="sm:col-span-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">合約設定</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">合約類型</Label>
              <Select value={formData.contract_type ?? "revenue_share"} onValueChange={v => setFormData(p => ({ ...p, contract_type: v as any }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">加盟主分潤比例 (%)</Label>
              <Input type="number" min="0" max="100" step="1" placeholder="70"
                value={formData.commission_rate ?? "70"} onChange={e => setFormData(p => ({ ...p, commission_rate: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">月費 (NT$)</Label>
              <Input type="number" min="0" step="100" placeholder="0"
                value={formData.monthly_fee ?? "0"} onChange={e => setFormData(p => ({ ...p, monthly_fee: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">加盟日期</Label>
              <Input type="date" value={(formData.joined_at ?? "").split("T")[0]} onChange={e => setFormData(p => ({ ...p, joined_at: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">合約到期日</Label>
              <Input type="date" value={(formData.contract_end_at ?? "").split("T")[0]} onChange={e => setFormData(p => ({ ...p, contract_end_at: e.target.value }))} className="h-8 text-sm" />
            </div>

            {/* 備註 */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">備註</Label>
              <Input placeholder="合約特殊條款或附加說明..." value={formData.notes ?? ""} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
            </div>

            {/* 登入帳號 */}
            <div className="sm:col-span-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />登入帳號設定
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">登入帳號</Label>
              <Input
                placeholder="英數字，如 fleet_taipei"
                value={formData.username ?? ""}
                onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{editId ? "重設密碼（留空則不更改）" : "登入密碼 *"}</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder={editId ? "輸入新密碼..." : "設定初始密碼"}
                  value={formData.password ?? ""}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  className="h-8 text-sm pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw(v => !v)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/*分潤說明 */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-500" />分潤計算說明</p>
            <p>• <strong>分潤制</strong>：按每月訂單業績總額 × 加盟主比例撥款</p>
            <p>• <strong>月費制</strong>：固定月費收取，無分潤計算</p>
            <p>• <strong>混合制</strong>：分潤後再扣除月費</p>
            <p>• 結算後可手動確認並標記撥款完成</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "儲存中..." : editId ? "更新資料" : "建立加盟主"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Driver Create / Edit Dialog ───────────────────────────── */}
      <Dialog open={!!driverDialog} onOpenChange={o => { if (!o) setDriverDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              {driverDialog?.editDriver ? `編輯司機：${driverDialog.editDriver.name}` : "新增司機"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* 基本資料 */}
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">基本資料</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">姓名 *</Label>
              <Input placeholder="王大明" value={driverForm.name}
                onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">電話 *</Label>
              <Input placeholder="0912-345-678" value={driverForm.phone}
                onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">車牌號碼</Label>
              <Input placeholder="ABC-1234" value={driverForm.license_plate}
                onChange={e => setDriverForm(p => ({ ...p, license_plate: e.target.value }))} className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">車型</Label>
              <Input placeholder="小型貨車 / 1.5T" value={driverForm.vehicle_type}
                onChange={e => setDriverForm(p => ({ ...p, vehicle_type: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">司機類型</Label>
              <Select value={driverForm.driver_type} onValueChange={v => setDriverForm(p => ({ ...p, driver_type: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="affiliated">靠行司機</SelectItem>
                  <SelectItem value="self">自家司機</SelectItem>
                  <SelectItem value="external">外部司機</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Atoms 帳密設定 */}
            <div className="sm:col-span-2 pt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <UserCog className="w-3.5 h-3.5" />Atoms 司機登入帳密
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">
                設定後司機可用此帳號密碼登入 Atoms 司機 APP 接單
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">登入帳號</Label>
              <Input placeholder="英數字，如 driver_chen" value={driverForm.username}
                onChange={e => setDriverForm(p => ({ ...p, username: e.target.value }))}
                className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {driverDialog?.editDriver ? "重設密碼（留空不更改）" : "登入密碼"}
              </Label>
              <div className="relative">
                <Input
                  type={showDriverPw ? "text" : "password"}
                  placeholder={driverDialog?.editDriver ? "輸入新密碼..." : "設定初始密碼"}
                  value={driverForm.password}
                  onChange={e => setDriverForm(p => ({ ...p, password: e.target.value }))}
                  className="h-8 text-sm pr-9"
                />
                <button type="button" tabIndex={-1}
                  className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowDriverPw(v => !v)}>
                  {showDriverPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 說明 */}
            <div className="sm:col-span-2">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-500" />帳號說明
                </p>
                <p>• 帳號建立後司機可於 Atoms APP 直接登入</p>
                <p>• 建議帳號格式：姓名縮寫 + 手機後4碼，例如 <code className="bg-blue-100 px-1 rounded">chen1234</code></p>
                <p>• 密碼至少 6 碼</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDriverDialog(null)}>取消</Button>
            <Button onClick={handleSaveDriver} disabled={savingDriver} className="bg-blue-600 hover:bg-blue-700 text-white">
              {savingDriver ? "儲存中..." : driverDialog?.editDriver ? "更新司機" : "建立司機帳號"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
