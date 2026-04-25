import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Trash2, RefreshCw, Copy, Plus, Send, Clock, CheckCircle2, XCircle } from "lucide-react";

const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

interface Invitation {
  id: number;
  email: string;
  role: string;
  invited_by: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  token: string;
  status: "pending" | "used" | "expired";
}

const ROLE_LABELS: Record<string, string> = {
  customer:       "客戶",
  fusingao_fleet: "福興高司機",
  fleet_owner:    "加盟車行業主",
};

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  pending:  { label: "待使用", class: "bg-blue-100 text-blue-700 border-blue-200" },
  used:     { label: "已使用", class: "bg-green-100 text-green-700 border-green-200" },
  expired:  { label: "已過期", class: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function AccountInviteTab() {
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ email: "", role: "customer" });

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(apiUrl("/admin/invitations")).then(r => r.json());
      setInvitations(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "載入失敗", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchInvitations(); }, [fetchInvitations]);

  const sendInvite = async () => {
    if (!form.email.trim()) return toast({ title: "請輸入 Email", variant: "destructive" });
    setSending(true);
    try {
      const res = await fetch(apiUrl("/admin/invitations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), role: form.role, invited_by: "admin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "發送失敗");
      toast({ title: "邀請已發送", description: `已寄送邀請信至 ${form.email}` });
      setForm(f => ({ ...f, email: "" }));
      fetchInvitations();
    } catch (e: any) {
      toast({ title: "發送失敗", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const revoke = async (id: number) => {
    if (!confirm("確定要撤銷此邀請？")) return;
    await fetch(apiUrl(`/admin/invitations/${id}`), { method: "DELETE" });
    fetchInvitations();
    toast({ title: "邀請已撤銷" });
  };

  const resend = async (id: number, email: string) => {
    await fetch(apiUrl(`/admin/invitations/${id}/resend`), { method: "POST" });
    toast({ title: "邀請信已重新寄出", description: email });
  };

  const copyLink = (token: string) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "連結已複製" });
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 max-w-3xl mx-auto py-4">
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            新增帳號邀請
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            輸入對方 Email，系統寄送邀請信。對方點連結後用自己的 Google 帳號登入，首次登入即自動綁定帳號。
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label className="text-xs mb-1.5 block">Email</Label>
              <Input
                placeholder="example@gmail.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && sendInvite()}
                className="h-9 text-sm"
              />
            </div>
            <div className="w-full sm:w-44">
              <Label className="text-xs mb-1.5 block">身份角色</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">客戶</SelectItem>
                  <SelectItem value="fusingao_fleet">福興高司機</SelectItem>
                  <SelectItem value="fleet_owner">加盟車行業主</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={sendInvite} disabled={sending} className="h-9 gap-2 w-full sm:w-auto">
                <Send className="w-3.5 h-3.5" />
                {sending ? "寄送中…" : "寄送邀請"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            邀請紀錄
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchInvitations} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {invitations.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {loading ? "載入中…" : "尚無邀請紀錄"}
            </div>
          ) : (
            <div className="divide-y">
              {invitations.map(inv => {
                const s = STATUS_BADGE[inv.status] ?? STATUS_BADGE.expired;
                return (
                  <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{inv.email}</span>
                        <Badge variant="outline" className={`text-xs ${s.class}`}>{s.label}</Badge>
                        <Badge variant="outline" className="text-xs text-slate-500">
                          {ROLE_LABELS[inv.role] ?? inv.role}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        建立：{fmtDate(inv.created_at)}
                        {inv.used_at && <span className="ml-2">使用：{fmtDate(inv.used_at)}</span>}
                        {!inv.used_at && <span className="ml-2">到期：{fmtDate(inv.expires_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {inv.status === "pending" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => copyLink(inv.token)}>
                            <Copy className="w-3 h-3" /> 複製連結
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => resend(inv.id, inv.email)}>
                            <RefreshCw className="w-3 h-3" /> 重寄
                          </Button>
                        </>
                      )}
                      {inv.status !== "used" && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => revoke(inv.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      {inv.status === "used" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
