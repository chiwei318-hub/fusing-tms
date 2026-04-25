import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Mail, Trash2, RefreshCw, Copy, Send, Clock, CheckCircle2,
  XCircle, ShieldCheck, UserPlus, AlertCircle,
} from "lucide-react";

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

interface OAuthAccount {
  id: number;
  email: string;
  provider: string;
  role: string;
  fleet_id: number | null;
  driver_id: number | null;
  fleet_name: string | null;
  driver_name: string | null;
  status: "pending" | "active" | "disabled";
  invite_token: string | null;
  expires_at: string;
  invited_at: string;
  activated_at: string | null;
  oauth_sub: string | null;
  display_name: string | null;
  avatar_url: string | null;
  invited_by: string | null;
}

interface FleetOption { id: number; fleet_name: string; username: string }
interface DriverOption { id: number; name: string; username?: string }

const ROLE_LABELS: Record<string, string> = {
  admin:       "系統管理員",
  fleet:       "福興高司機",
  driver:      "司機",
  customer:    "客戶",
  fleet_owner: "加盟車行業主",
};

const PROVIDER_ICON: Record<string, React.ReactNode> = {
  google: (
    <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  ),
};

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: "待啟用", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
  active:   { label: "已啟用", cls: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  disabled: { label: "已停用", cls: "bg-gray-100 text-gray-500 border-gray-200",   icon: <XCircle className="w-3 h-3" /> },
};

export default function OAuthAccountsTab() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<OAuthAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [fleets, setFleets]   = useState<FleetOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [form, setForm] = useState({
    email: "", role: "customer", fleet_id: "", driver_id: "",
  });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(apiUrl("/auth/oauth/accounts")).then(r => r.json());
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  const fetchOptions = useCallback(async () => {
    try {
      const [fl, dr] = await Promise.all([
        fetch(apiUrl("/fusingao/fleets")).then(r => r.json()).catch(() => []),
        fetch(apiUrl("/drivers")).then(r => r.json()).catch(() => []),
      ]);
      setFleets(Array.isArray(fl) ? fl : (fl.fleets ?? []));
      setDrivers(Array.isArray(dr) ? dr : (dr.drivers ?? []));
    } catch {}
  }, []);

  useEffect(() => { fetchAccounts(); fetchOptions(); }, [fetchAccounts, fetchOptions]);

  const sendInvite = async () => {
    if (!form.email.trim()) return toast({ title: "請輸入 Email", variant: "destructive" });
    if (form.role === "fleet" && !form.fleet_id) return toast({ title: "請選擇車隊帳號", variant: "destructive" });
    if (form.role === "driver" && !form.driver_id) return toast({ title: "請選擇司機", variant: "destructive" });
    setSending(true);
    try {
      const body: any = { email: form.email.trim(), role: form.role, invited_by: "admin" };
      if (form.fleet_id)  body.fleet_id  = Number(form.fleet_id);
      if (form.driver_id) body.driver_id = Number(form.driver_id);
      const res = await fetch(apiUrl("/auth/oauth/invite"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "發送失敗");
      toast({ title: "邀請已寄出", description: `已發送邀請信至 ${form.email}` });
      setForm({ email: "", role: "customer", fleet_id: "", driver_id: "" });
      fetchAccounts();
    } catch (e: any) {
      toast({ title: "發送失敗", description: e.message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const disable  = async (id: number) => {
    if (!confirm("確定要停用此帳號？")) return;
    await fetch(apiUrl(`/auth/oauth/accounts/${id}/disable`), { method: "PATCH" });
    fetchAccounts();
    toast({ title: "帳號已停用" });
  };
  const enable   = async (id: number) => {
    await fetch(apiUrl(`/auth/oauth/accounts/${id}/enable`), { method: "PATCH" });
    fetchAccounts();
    toast({ title: "帳號已重新啟用" });
  };
  const remove   = async (id: number) => {
    if (!confirm("確定要刪除此帳號紀錄？")) return;
    await fetch(apiUrl(`/auth/oauth/accounts/${id}`), { method: "DELETE" });
    fetchAccounts();
    toast({ title: "已刪除" });
  };
  const resend   = async (id: number, email: string) => {
    await fetch(apiUrl(`/auth/oauth/accounts/${id}/resend`), { method: "POST" });
    toast({ title: "邀請信已重新寄出", description: email });
    fetchAccounts();
  };
  const copyLink = (token: string | null) => {
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    navigator.clipboard.writeText(`${window.location.origin}${base}/invite/${token}`);
    toast({ title: "連結已複製" });
  };
  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  const needsFleet  = form.role === "fleet";
  const needsDriver = form.role === "driver";

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4">
      {/* ── 新增邀請 ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-500" />
            新增帳號邀請
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            輸入對方 Email 並選擇角色，系統自動寄出邀請信。對方點連結後用 Google 帳號登入，首次登入即自動綁定。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Email 地址</Label>
              <Input
                placeholder="example@gmail.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && sendInvite()}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">身份角色</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v, fleet_id: "", driver_id: "" }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsFleet && (
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block">綁定車隊帳號</Label>
                <Select value={form.fleet_id} onValueChange={v => setForm(f => ({ ...f, fleet_id: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="選擇車隊帳號…" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleets.map(fl => (
                      <SelectItem key={fl.id} value={String(fl.id)}>{fl.fleet_name}（{fl.username}）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsDriver && (
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block">綁定司機</Label>
                <Select value={form.driver_id} onValueChange={v => setForm(f => ({ ...f, driver_id: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="選擇司機…" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={sendInvite} disabled={sending} className="gap-2 h-9">
              <Send className="w-3.5 h-3.5" />
              {sending ? "寄送中…" : "寄送邀請信"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 帳號列表 ── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            OAuth 帳號列表
            <span className="text-xs font-normal text-muted-foreground ml-1">({accounts.length})</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchAccounts} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {accounts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {loading ? "載入中…" : "尚無帳號紀錄"}
            </div>
          ) : (
            <div className="divide-y">
              {accounts.map(acc => {
                const sm = STATUS_META[acc.status] ?? STATUS_META.pending;
                return (
                  <div key={acc.id} className="flex flex-col sm:flex-row sm:items-start gap-2 px-4 py-3">
                    {/* Avatar / provider icon */}
                    <div className="flex items-center gap-2 shrink-0 sm:pt-0.5">
                      {acc.avatar_url ? (
                        <img src={acc.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
                          {acc.email[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{acc.display_name ?? acc.email}</span>
                        {acc.display_name && <span className="text-xs text-muted-foreground truncate">{acc.email}</span>}
                        <Badge variant="outline" className={`text-[11px] flex items-center gap-1 ${sm.cls}`}>
                          {sm.icon}{sm.label}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] text-slate-500">
                          {ROLE_LABELS[acc.role] ?? acc.role}
                        </Badge>
                        {acc.provider && (
                          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            {PROVIDER_ICON[acc.provider] ?? null}
                            {acc.provider}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        {acc.fleet_name && <span>車隊：{acc.fleet_name}</span>}
                        {acc.driver_name && <span>司機：{acc.driver_name}</span>}
                        <span>邀請：{fmtDate(acc.invited_at)}</span>
                        {acc.activated_at && <span>啟用：{fmtDate(acc.activated_at)}</span>}
                        {!acc.activated_at && acc.status === "pending" && <span className="text-amber-600">到期：{fmtDate(acc.expires_at)}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 flex-wrap">
                      {acc.status === "pending" && acc.invite_token && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyLink(acc.invite_token)}>
                            <Copy className="w-3 h-3" /> 連結
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => resend(acc.id, acc.email)}>
                            <RefreshCw className="w-3 h-3" /> 重寄
                          </Button>
                        </>
                      )}
                      {acc.status === "active" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => disable(acc.id)}>
                          <XCircle className="w-3 h-3 mr-1" />停用
                        </Button>
                      )}
                      {acc.status === "disabled" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => enable(acc.id)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" />啟用
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => remove(acc.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 說明 ── */}
      <Card className="border border-blue-100 bg-blue-50/50 shadow-none">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 leading-relaxed space-y-1">
              <p><strong>支援登入方式：</strong>Google（已啟用）．Yahoo、Apple ID（後續加入）</p>
              <p><strong>邀請流程：</strong>寄出邀請信 → 使用者點連結 → 用 Google 帳號完成綁定 → 之後直接 Google 一鍵登入</p>
              <p><strong>舊帳號：</strong>帳密登入（admin/fleet）繼續正常使用，無需遷移</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
