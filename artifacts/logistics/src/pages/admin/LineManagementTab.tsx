import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  Users,
  Truck,
  Bell,
  CheckCircle,
  XCircle,
  Settings,
  Unlink,
  Send,
  RefreshCw,
  AlertCircle,
  Copy,
  Link2,
  BellRing,
  Zap,
  Radio,
  Package,
  MapPin,
  Clock,
} from "lucide-react";

interface LineStatus {
  configured: boolean;
  hasCompanyUserId: boolean;
  hasAppBaseUrl: boolean;
}

interface Customer {
  id: number;
  name: string;
  phone: string;
  lineUserId: string | null;
  lineLinkedAt: string | null;
}

interface Driver {
  id: number;
  name: string;
  phone: string;
  licensePlate: string;
  lineUserId: string | null;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {label}
    </div>
  );
}

function SetupCard({ status }: { status: LineStatus }) {
  const { toast } = useToast();
  const webhookUrl = `${window.location.origin}/api/line/webhook`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      toast({ title: "✅ Webhook URL 已複製" });
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="w-4 h-4 text-green-500" />
          LINE 官方帳號設定狀態
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <StatusBadge ok={status.configured} label="API Token 已設定" />
          <StatusBadge ok={status.hasCompanyUserId} label="公司 LINE ID 已設定" />
          <StatusBadge ok={status.hasAppBaseUrl} label="App 網址已設定" />
        </div>

        {/* Webhook URL */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700">
            <Link2 className="w-4 h-4" />
            LINE Developers Console Webhook URL
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-700 break-all">
              {webhookUrl}
            </code>
            <Button variant="outline" size="sm" className="shrink-0 h-7 px-2" onClick={copyWebhook}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            將此 URL 填入 LINE Developers Console → Messaging API → Webhook URL，並啟用「Use webhook」
          </p>
        </div>

        {!status.configured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <div className="font-semibold flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4" /> 尚未完成 LINE 設定
            </div>
            <p className="mb-3">需要在環境變數中設定以下 3 個值才能啟用 LINE 通知：</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>
                <strong>LINE_CHANNEL_ACCESS_TOKEN</strong>
                <span className="text-amber-700">— 至 LINE Developers Console 取得</span>
              </li>
              <li>
                <strong>LINE_CHANNEL_SECRET</strong>
                <span className="text-amber-700">— 同上</span>
              </li>
              <li>
                <strong>LINE_COMPANY_USER_ID</strong>
                <span className="text-amber-700">— 公司管理者的 LINE User ID（接收新訂單提醒）</span>
              </li>
            </ol>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <div className="font-semibold mb-2">📌 客戶/司機如何綁定 LINE？</div>
          <ol className="space-y-1 list-decimal list-inside text-blue-700">
            <li>加入本公司 LINE 官方帳號為好友</li>
            <li>傳送文字：<code className="bg-blue-100 px-1 rounded">綁定 [電話號碼]</code></li>
            <li>例如：<code className="bg-blue-100 px-1 rounded">綁定 0912345678</code></li>
            <li>系統自動確認並完成綁定</li>
          </ol>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <div className="font-semibold mb-1">📋 其他指令</div>
            <ul className="space-y-1 text-blue-700">
              <li><code className="bg-blue-100 px-1 rounded">查詢 [訂單號碼]</code> — 查詢訂單狀態</li>
              <li><code className="bg-blue-100 px-1 rounded">說明</code> — 顯示所有指令</li>
            </ul>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 text-sm">
          <div className="font-semibold text-slate-700 mb-2">🔔 自動通知觸發時機</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: "📦", label: "客戶下單", desc: "→ LINE 通知公司" },
              { icon: "🚚", label: "派車成功", desc: "→ LINE 通知客戶（司機/車牌）" },
              { icon: "📍", label: "司機到達", desc: "→ 自動推播客戶" },
              { icon: "🎉", label: "訂單完成", desc: "→ 自動推播客戶" },
              { icon: "💳", label: "付款提醒", desc: "→ 手動發送給客戶" },
              { icon: "✅", label: "司機接單", desc: "→ 可在 LINE 直接接單/拒單" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2 text-slate-600">
                <span>{item.icon}</span>
                <span><strong>{item.label}</strong> {item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerBindings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["line-customer-bindings"],
    queryFn: () => fetch("/api/line/bindings/customers").then((r) => r.json()),
  });

  const unbindMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/line/bindings/customers/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["line-customer-bindings"] });
      toast({ title: "已解除綁定" });
    },
  });

  const reminderMutation = useMutation({
    mutationFn: (orderId: number) =>
      fetch(`/api/line/send-payment-reminder/${orderId}`, { method: "POST" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => toast({ title: "✅ 已發送付款提醒" }),
    onError: (e) => toast({ title: `發送失敗：${e.message}`, variant: "destructive" }),
  });

  const bound = customers.filter((c) => c.lineUserId);
  const unbound = customers.filter((c) => !c.lineUserId);

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          已綁定 <strong className="text-emerald-600">{bound.length}</strong> 位 ／ 未綁定 <strong className="text-orange-500">{unbound.length}</strong> 位
        </div>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["line-customer-bindings"] })}>
          <RefreshCw className="w-3 h-3 mr-1" /> 重新整理
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 font-medium text-slate-600">姓名</th>
              <th className="text-left p-3 font-medium text-slate-600">電話</th>
              <th className="text-left p-3 font-medium text-slate-600">LINE 狀態</th>
              <th className="text-left p-3 font-medium text-slate-600">綁定時間</th>
              <th className="text-right p-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">尚無客戶資料</td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-slate-600">{c.phone}</td>
                <td className="p-3">
                  {c.lineUserId ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0">
                      <CheckCircle className="w-3 h-3 mr-1" /> 已綁定
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-500 border-orange-200">
                      未綁定
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-slate-500 text-xs">
                  {c.lineLinkedAt ? new Date(c.lineLinkedAt).toLocaleString("zh-TW") : "—"}
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    {c.lineUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
                        onClick={() => unbindMutation.mutate(c.id)}
                        disabled={unbindMutation.isPending}
                      >
                        <Unlink className="w-3 h-3 mr-1" /> 解除
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriverBindings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [manualId, setManualId] = useState("");

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["line-driver-bindings"],
    queryFn: () => fetch("/api/line/bindings/drivers").then((r) => r.json()),
  });

  const unbindMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/line/bindings/drivers/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["line-driver-bindings"] });
      toast({ title: "已解除司機 LINE 綁定" });
    },
  });

  const manualBindMutation = useMutation({
    mutationFn: ({ id, lineUserId }: { id: number; lineUserId: string }) =>
      fetch(`/api/line/bindings/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["line-driver-bindings"] });
      toast({ title: "✅ LINE ID 設定成功" });
      setExpandedId(null);
      setManualId("");
    },
    onError: (e: Error) => toast({ title: `設定失敗：${e.message}`, variant: "destructive" }),
  });

  const bound = drivers.filter((d) => d.lineUserId);

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          已綁定 <strong className="text-emerald-600">{bound.length}</strong> 位司機 ／ 共 {drivers.length} 位
        </div>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["line-driver-bindings"] })}>
          <RefreshCw className="w-3 h-3 mr-1" /> 重新整理
        </Button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        <strong>司機自助綁定：</strong>加入 LINE 官方帳號後，傳送「<code className="bg-amber-100 px-1 rounded">綁定 {"{電話號碼}"}</code>」即可自動綁定。
        若 webhook 無法使用，可使用下方「手動設定」輸入司機的 LINE User ID。
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 font-medium text-slate-600">司機</th>
              <th className="text-left p-3 font-medium text-slate-600">電話</th>
              <th className="text-left p-3 font-medium text-slate-600">車牌</th>
              <th className="text-left p-3 font-medium text-slate-600">LINE 狀態</th>
              <th className="text-right p-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {drivers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground">尚無司機資料</td>
              </tr>
            )}
            {drivers.map((d) => (
              <>
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3 text-slate-600">{d.phone}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="font-mono text-xs">{d.licensePlate}</Badge>
                  </td>
                  <td className="p-3">
                    {d.lineUserId ? (
                      <div className="space-y-0.5">
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">
                          <CheckCircle className="w-3 h-3 mr-1" /> 已綁定
                        </Badge>
                        <div className="text-xs text-slate-400 font-mono truncate max-w-[120px]" title={d.lineUserId}>
                          {d.lineUserId.slice(0, 8)}…
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-orange-500 border-orange-200">
                        未綁定
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      {!d.lineUserId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={() => {
                            setExpandedId(expandedId === d.id ? null : d.id);
                            setManualId("");
                          }}
                        >
                          手動設定
                        </Button>
                      )}
                      {d.lineUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
                          onClick={() => unbindMutation.mutate(d.id)}
                          disabled={unbindMutation.isPending}
                        >
                          <Unlink className="w-3 h-3 mr-1" /> 解除
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === d.id && (
                  <tr key={`${d.id}-input`} className="bg-blue-50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-blue-700 font-medium mb-1">
                            輸入 {d.name} 的 LINE User ID
                          </label>
                          <input
                            type="text"
                            placeholder="例：U1234abcd5678efgh..."
                            value={manualId}
                            onChange={(e) => setManualId(e.target.value)}
                            className="w-full border border-blue-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                          />
                          <p className="text-xs text-blue-500 mt-1">
                            可在 LINE OA Manager → 用戶管理 中查詢司機的 User ID
                          </p>
                        </div>
                        <div className="flex gap-1 self-end">
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                            onClick={() => manualBindMutation.mutate({ id: d.id, lineUserId: manualId })}
                            disabled={!manualId.trim() || manualBindMutation.isPending}
                          >
                            {manualBindMutation.isPending ? "儲存中..." : "儲存"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => { setExpandedId(null); setManualId(""); }}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentReminderPanel() {
  const { toast } = useToast();
  const [orderId, setOrderId] = useState("");

  const reminderMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/line/send-payment-reminder/${id}`, { method: "POST" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "✅ 付款提醒已透過 LINE 發送" });
      setOrderId("");
    },
    onError: (e: Error) => toast({ title: `發送失敗：${e.message}`, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-red-500" />
            手動發送付款提醒
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            輸入訂單編號，系統將向該訂單客戶發送付款提醒 LINE 訊息（客戶須已綁定 LINE）。
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="訂單編號（如：42）"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <Button
              onClick={() => reminderMutation.mutate(parseInt(orderId, 10))}
              disabled={!orderId || reminderMutation.isPending}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              <Send className="w-4 h-4 mr-1" />
              {reminderMutation.isPending ? "發送中..." : "發送提醒"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">自動付款提醒說明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600 space-y-2">
            <p>目前付款提醒需手動觸發，未來可設定自動提醒條件：</p>
            <ul className="list-disc list-inside space-y-1 text-slate-500 text-xs">
              <li>訂單完成後 N 天未付款</li>
              <li>月底自動對帳提醒</li>
              <li>逾期金額達到閾值</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── 新訂單通知接收者管理 ─── */
const BASE_URL = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
const api = (p: string) => `${BASE_URL}${p}`;
const authHdr = () => { const t = localStorage.getItem("auth-jwt"); return t ? { Authorization: `Bearer ${t}` } : {}; };

interface LineAccount {
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  userType: string;
  isReceiver: boolean;
}

function NotifyReceiversPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ accounts: LineAccount[]; receivers: string[] }>({
    queryKey: ["line-receivers"],
    queryFn: () => fetch(api("/api/line/receivers"), { headers: authHdr() }).then(r => r.json()),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ lineUserId, enable }: { lineUserId: string; enable: boolean }) => {
      if (enable) {
        const r = await fetch(api("/api/line/receivers"), {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHdr() },
          body: JSON.stringify({ lineUserId }),
        });
        if (!r.ok) throw new Error("新增失敗");
      } else {
        const r = await fetch(api(`/api/line/receivers/${encodeURIComponent(lineUserId)}`), {
          method: "DELETE",
          headers: authHdr(),
        });
        if (!r.ok) throw new Error("移除失敗");
      }
    },
    onSuccess: (_d, vars) => {
      toast({ title: vars.enable ? "✅ 已加入訂單通知接收者" : "已移除訂單通知接收者" });
      qc.invalidateQueries({ queryKey: ["line-receivers"] });
    },
    onError: (e: any) => toast({ title: "操作失敗", description: e.message, variant: "destructive" }),
  });

  const userTypeLabel: Record<string, string> = {
    customer: "客戶", driver: "司機", admin: "管理員",
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入中…</div>;

  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
        <div className="font-semibold flex items-center gap-1.5 mb-1"><BellRing className="w-3.5 h-3.5" /> 訂單通知接收者</div>
        <p>開啟後，每有新訂單進來，該 LINE 帳號會同時收到訂單提醒通知。</p>
        <p className="mt-1 text-blue-600">📌 需要對方先傳過訊息給官方帳號（例如綁定電話），才會出現在此列表。</p>
      </div>

      {accounts.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm">
          <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          尚無綁定的 LINE 帳號<br />
          <span className="text-xs">客戶或司機傳送「綁定 電話」後才會出現</span>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <div key={acc.lineUserId} className="flex items-center gap-3 p-3 bg-card border rounded-lg">
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarImage src={acc.pictureUrl ?? undefined} />
                <AvatarFallback className="text-xs bg-green-100 text-green-700">
                  {(acc.displayName ?? "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{acc.displayName ?? "（未知）"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {userTypeLabel[acc.userType] ?? acc.userType}
                  </Badge>
                  <span className="font-mono text-[10px] truncate max-w-[160px]">{acc.lineUserId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {acc.isReceiver && (
                  <span className="text-[10px] text-green-600 font-semibold flex items-center gap-1">
                    <BellRing className="w-3 h-3" /> 接收中
                  </span>
                )}
                <Switch
                  checked={acc.isReceiver}
                  disabled={toggleMut.isPending}
                  onCheckedChange={enabled => toggleMut.mutate({ lineUserId: acc.lineUserId, enable: enabled })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => refetch()}>
        <RefreshCw className="w-3 h-3" /> 重新整理
      </Button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   搶單廣播面板
─────────────────────────────────────────────────────────────── */
interface BroadcastOrder {
  id: number;
  pickup_address: string;
  delivery_address: string;
  cargo_description: string | null;
  customer_name: string | null;
  total_fee: number | null;
  suggested_price: number | null;
  pickup_time: string | null;
  required_vehicle_type: string | null;
  distance_km: number | null;
  notes: string | null;
}

function GrabOrderPanel() {
  const { toast } = useToast();
  const [broadcasting, setBroadcasting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, { sent: number; failed: number; total: number }>>({});

  const { data, isLoading, refetch } = useQuery<{ orders: BroadcastOrder[]; boundDriverCount: number }>({
    queryKey: ["line-broadcast-candidates"],
    queryFn: () => fetch("/api/line/broadcast-candidates").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const broadcast = async (orderId: number) => {
    setBroadcasting(orderId);
    try {
      const res = await fetch(`/api/line/broadcast-order/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (d.ok) {
        setResults(prev => ({ ...prev, [orderId]: d }));
        toast({
          title: `✅ 廣播成功`,
          description: `訂單 #${orderId} 已推送給 ${d.sent} 位司機，等待搶單`,
        });
        refetch();
      } else {
        toast({ title: "廣播失敗", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "廣播失敗", description: "網路錯誤", variant: "destructive" });
    } finally {
      setBroadcasting(null);
    }
  };

  const alreadyBroadcast = (order: BroadcastOrder) =>
    order.notes?.includes("[搶單廣播]") ?? false;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" /> 載入中…
      </div>
    );
  }

  const orders = data?.orders ?? [];
  const driverCount = data?.boundDriverCount ?? 0;

  return (
    <div className="space-y-4">

      {/* 說明卡 */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-green-100">
            <Radio className="w-4 h-4 text-green-700" />
          </div>
          <div>
            <div className="font-semibold text-sm text-green-800">搶單廣播機制</div>
            <div className="text-xs text-green-700 mt-1 space-y-1">
              <div>📡 點「廣播搶單」→ 推送 Flex 訊息給 <strong>{driverCount}</strong> 位已綁定 LINE 司機</div>
              <div>✅ 司機點訊息中的按鈕（或回覆「接單:訂單號」）→ DB 層競態保護，先搶先得</div>
              <div>🚫 若已被搶走 → 其他司機收到「手速太慢」回覆，不重複指派</div>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 bg-white/70 rounded-lg border border-green-100">
          <div className="text-xs text-muted-foreground mb-1">司機搶單指令格式（Python 等效）：</div>
          <code className="text-xs font-mono text-green-800">接單:123　接單：123　接單 123</code>
        </div>
      </div>

      {/* 可廣播訂單清單 */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">待派訂單（{orders.length}）</div>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1 text-xs">
          <RefreshCw className="w-3 h-3" /> 重整
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border rounded-xl bg-muted/20">
          目前沒有待派訂單
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const price = order.total_fee ?? order.suggested_price;
            const nt = (n: number) => `NT$${n.toLocaleString()}`;
            const isBroadcasting = broadcasting === order.id;
            const sentResult = results[order.id];
            const wasBroadcast = alreadyBroadcast(order);

            return (
              <div key={order.id} className={`border rounded-xl overflow-hidden shadow-sm ${wasBroadcast ? "border-green-200 bg-green-50/30" : "bg-white"}`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-semibold text-sm">訂單 #{order.id}</span>
                    {wasBroadcast && (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-0 gap-1">
                        <Radio className="w-2.5 h-2.5" /> 已廣播
                      </Badge>
                    )}
                  </div>
                  {sentResult && (
                    <span className="text-xs text-green-700 font-medium">
                      已推送 {sentResult.sent}/{sentResult.total} 位
                    </span>
                  )}
                </div>

                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <div className="text-muted-foreground">取貨</div>
                      <div>{order.pickup_address}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <div className="text-muted-foreground">送達</div>
                      <div>{order.delivery_address}</div>
                    </div>
                  </div>
                  {order.cargo_description && (
                    <div className="text-xs text-muted-foreground col-span-2">
                      📦 {order.cargo_description}
                      {order.distance_km && ` ・ ${order.distance_km} km`}
                      {order.required_vehicle_type && ` ・ ${order.required_vehicle_type}`}
                    </div>
                  )}
                  {order.pickup_time && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground col-span-2">
                      <Clock className="w-3 h-3" />
                      {new Date(order.pickup_time).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/10">
                  <div className="text-sm font-bold text-emerald-700">
                    {price ? nt(price) : "報酬待定"}
                  </div>
                  <Button
                    size="sm"
                    disabled={isBroadcasting || driverCount === 0}
                    onClick={() => broadcast(order.id)}
                    className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isBroadcasting
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> 廣播中…</>
                      : <><Zap className="w-3 h-3" /> {wasBroadcast ? "再次廣播" : "廣播搶單"}</>
                    }
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {driverCount === 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          ⚠️ 目前沒有已綁定 LINE 的司機，請先到「司機綁定」分頁完成綁定。
        </div>
      )}
    </div>
  );
}

export default function LineManagementTab() {
  const { data: status, isLoading } = useQuery<LineStatus>({
    queryKey: ["line-status"],
    queryFn: () => fetch("/api/line/status").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground text-sm">載入中...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">LINE 接單整合</h2>
          <p className="text-xs text-muted-foreground">自動推播通知 · 客戶/司機 LINE 綁定</p>
        </div>
        <div className="ml-auto">
          {status?.configured ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-0">
              <CheckCircle className="w-3 h-3 mr-1" /> LINE 已啟用
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-500 border-orange-200">
              <AlertCircle className="w-3 h-3 mr-1" /> 未設定
            </Badge>
          )}
        </div>
      </div>

      {/* Setup card */}
      {status && <SetupCard status={status} />}

      {/* Tabs */}
      <Tabs defaultValue="grab">
        <TabsList className="w-full flex flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="grab" className="flex-1 gap-1 text-xs py-1.5">
            <Zap className="w-3.5 h-3.5 text-green-600" /> 搶單廣播
          </TabsTrigger>
          <TabsTrigger value="notify" className="flex-1 gap-1 text-xs py-1.5">
            <BellRing className="w-3.5 h-3.5 text-green-600" /> 通知設定
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex-1 gap-1 text-xs py-1.5">
            <Users className="w-3.5 h-3.5" /> 客戶綁定
          </TabsTrigger>
          <TabsTrigger value="drivers" className="flex-1 gap-1 text-xs py-1.5">
            <Truck className="w-3.5 h-3.5" /> 司機綁定
          </TabsTrigger>
          <TabsTrigger value="reminder" className="flex-1 gap-1 text-xs py-1.5">
            <Bell className="w-3.5 h-3.5" /> 付款提醒
          </TabsTrigger>
        </TabsList>
        <TabsContent value="grab" className="mt-4">
          <GrabOrderPanel />
        </TabsContent>
        <TabsContent value="notify" className="mt-4">
          <NotifyReceiversPanel />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <CustomerBindings />
        </TabsContent>
        <TabsContent value="drivers" className="mt-4">
          <DriverBindings />
        </TabsContent>
        <TabsContent value="reminder" className="mt-4">
          <PaymentReminderPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
