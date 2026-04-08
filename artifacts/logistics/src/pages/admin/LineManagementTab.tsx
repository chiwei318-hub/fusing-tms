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
  AlertTriangle,
  Trash2,
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
  isActive: boolean;
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

  const { data: webhookStatus, refetch: refetchWebhook } = useQuery<{
    configured: boolean; webhookUrl: string | null;
    lastReceivedAt: string | null; isConnected: boolean;
  }>({
    queryKey: ["line-webhook-status"],
    queryFn: () => fetch("/api/line/webhook-status").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      toast({ title: "✅ Webhook URL 已複製" });
    });
  };

  const isWebhookConnected = webhookStatus?.isConnected ?? false;

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
          <StatusBadge ok={isWebhookConnected} label="Webhook 已接通" />
        </div>

        {/* Webhook 狀態 + 設定步驟 */}
        {!isWebhookConnected && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Webhook 尚未連接 — 司機傳「綁定」訊息無法自動處理
            </div>
            <div className="text-xs text-red-600 space-y-2">
              <div className="font-medium">請依照以下步驟設定：</div>
              <ol className="space-y-1.5 list-none">
                <li className="flex gap-2"><span className="font-bold text-red-700 shrink-0">①</span> 開啟 <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="underline font-medium">LINE Developers Console</a></li>
                <li className="flex gap-2"><span className="font-bold text-red-700 shrink-0">②</span> 選擇你的 Messaging API 頻道 → 點「Messaging API」頁籤</li>
                <li className="flex gap-2"><span className="font-bold text-red-700 shrink-0">③</span> 找到「Webhook URL」欄位，貼入以下網址：</li>
              </ol>
              <div className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
                <code className="flex-1 text-xs text-slate-800 break-all font-mono">{webhookUrl}</code>
                <Button variant="outline" size="sm" className="shrink-0 h-7 px-2 border-red-200" onClick={copyWebhook}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <ol className="space-y-1.5 list-none" start={4}>
                <li className="flex gap-2"><span className="font-bold text-red-700 shrink-0">④</span> 點「Update」儲存，再開啟「Use webhook」開關</li>
                <li className="flex gap-2"><span className="font-bold text-red-700 shrink-0">⑤</span> 點「Verify」按鈕確認連線成功</li>
              </ol>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-700" onClick={() => refetchWebhook()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> 重新檢查連線
                </Button>
                {webhookStatus?.lastReceivedAt && (
                  <span className="text-xs text-red-500">上次接收：{new Date(webhookStatus.lastReceivedAt).toLocaleString("zh-TW")}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {isWebhookConnected && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Webhook 連線正常</span>
            {webhookStatus?.lastReceivedAt && (
              <span className="ml-auto text-green-600">
                上次接收：{new Date(webhookStatus.lastReceivedAt).toLocaleString("zh-TW")}
              </span>
            )}
          </div>
        )}

        {/* Webhook URL（供已連線時快速複製） */}
        {isWebhookConnected && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1 text-xs font-medium text-slate-600">
              <Link2 className="w-3.5 h-3.5" /> Webhook URL
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-700 break-all">{webhookUrl}</code>
              <Button variant="outline" size="sm" className="shrink-0 h-7 px-2" onClick={copyWebhook}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <div className="font-semibold mb-2">📌 司機/客戶綁定 LINE 的方式</div>
          <ol className="space-y-1 list-decimal list-inside text-blue-700">
            <li>加入本公司 LINE 官方帳號為好友</li>
            <li>傳送：<code className="bg-blue-100 px-1 rounded">綁定 09xxxxxxxx</code>（自己的電話號碼）</li>
            <li>系統自動回覆確認並完成綁定</li>
          </ol>
          <div className="mt-2 text-xs text-blue-600 bg-blue-100/50 rounded p-2">
            ⚠ 此功能需要上方 Webhook 設定完成才能運作。
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
  const [generatedTokens, setGeneratedTokens] = useState<Record<number, string>>({});

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

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      fetch(`/api/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["line-driver-bindings"] });
      toast({ title: vars.isActive ? "✅ 已標記為在職" : "⚠️ 已標記為離職（停止推播）" });
    },
    onError: (e: Error) => toast({ title: `操作失敗：${e.message}`, variant: "destructive" }),
  });

  const deleteDriverMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/drivers/${id}`, { method: "DELETE" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["line-driver-bindings"] });
      toast({ title: "✅ 司機資料已刪除" });
    },
    onError: (e: Error) => toast({ title: `刪除失敗：${e.message}`, variant: "destructive" }),
  });

  const genTokenMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/line/bindings/drivers/${id}/gen-token`, { method: "POST" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json() as Promise<{ token: string }>;
      }),
    onSuccess: (data, id) => {
      setGeneratedTokens((prev) => ({ ...prev, [id]: data.token }));
      toast({ title: `✅ 綁定碼已產生：${data.token}（有效 48 小時）` });
    },
    onError: (e: Error) => toast({ title: `產生失敗：${e.message}`, variant: "destructive" }),
  });

  const copyToken = (id: number) => {
    const t = generatedTokens[id];
    if (!t) return;
    navigator.clipboard.writeText(`綁定碼 ${t}`).then(() =>
      toast({ title: `已複製「綁定碼 ${t}」，請傳給司機` })
    );
  };

  const bound = drivers.filter((d) => d.lineUserId);
  const activeCount = drivers.filter((d) => d.isActive !== false).length;

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">載入中...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          已綁定 <strong className="text-emerald-600">{bound.length}</strong> 位司機 ／ 在職 <strong className="text-blue-600">{activeCount}</strong> ／ 共 {drivers.length} 位
        </div>
        <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["line-driver-bindings"] })}>
          <RefreshCw className="w-3 h-3 mr-1" /> 重新整理
        </Button>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-900 space-y-1">
        <div><strong>🆕 推薦：綁定碼一鍵綁定</strong>（新方法）</div>
        <div>點擊右方「<strong>綁定碼</strong>」按鈕產生 6 位代碼 → 將代碼傳給司機 → 司機加入 LINE 官方帳號後傳送「<code className="bg-green-100 px-1 rounded">綁定碼 XXXXXX</code>」即完成，不需輸入電話。</div>
        <div className="text-green-700">或讓司機自行傳送「<code className="bg-green-100 px-1 rounded">綁定 {"{電話號碼}"}</code>」傳統方式，或使用「手動設定」輸入 LINE User ID。</div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 font-medium text-slate-600">司機</th>
              <th className="text-left p-3 font-medium text-slate-600">電話</th>
              <th className="text-left p-3 font-medium text-slate-600">車牌</th>
              <th className="text-left p-3 font-medium text-slate-600">在職狀態</th>
              <th className="text-left p-3 font-medium text-slate-600">LINE 狀態</th>
              <th className="text-right p-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {drivers.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">尚無司機資料</td>
              </tr>
            )}
            {drivers.map((d) => (
              <>
                <tr key={d.id} className={`hover:bg-slate-50 ${d.isActive === false ? "opacity-60 bg-slate-50" : ""}`}>
                  <td className="p-3 font-medium">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{d.name}</span>
                      {d.isActive === false && d.phone !== "待補填" && (
                        <span className="text-xs text-slate-400">（離職）</span>
                      )}
                      {d.phone === "待補填" && (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5 py-0">
                          LINE 自動加入・待審核
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-slate-600">
                    {d.phone === "待補填"
                      ? <span className="text-slate-400 text-xs italic">未填寫</span>
                      : d.phone}
                  </td>
                  <td className="p-3">
                    {d.licensePlate === "待補填"
                      ? <span className="text-slate-400 text-xs italic">未填寫</span>
                      : <Badge variant="outline" className="font-mono text-xs">{d.licensePlate}</Badge>}
                  </td>
                  <td className="p-3">
                    {d.phone === "待補填" ? (
                      <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">
                        ⏳ 待審核
                      </Badge>
                    ) : d.isActive !== false ? (
                      <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" /> 在職
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-300 text-xs">
                        離職
                      </Badge>
                    )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2 text-xs ${d.isActive !== false ? "text-slate-500 hover:text-red-600 hover:bg-red-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"}`}
                        onClick={() => setActiveMutation.mutate({ id: d.id, isActive: d.isActive === false })}
                        disabled={setActiveMutation.isPending}
                        title={d.isActive !== false ? "標記為離職" : "標記為在職"}
                      >
                        {d.isActive !== false ? "標記離職" : "恢復在職"}
                      </Button>
                      {!d.lineUserId && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-[#06C755] border-[#06C755]/40 hover:bg-[#06C755]/10"
                            onClick={() => genTokenMutation.mutate(d.id)}
                            disabled={genTokenMutation.isPending}
                            title="產生一次性綁定碼，傳給司機後讓他傳給 LINE Bot 即可完成綁定"
                          >
                            <Link2 className="w-3 h-3 mr-1" />
                            {generatedTokens[d.id] ? "重新產生" : "綁定碼"}
                          </Button>
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
                        </>
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
                      {d.isActive === false && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
                          onClick={() => {
                            if (!confirm(`確定要永久刪除司機「${d.name}」的所有資料？此操作無法復原。`)) return;
                            deleteDriverMutation.mutate(d.id);
                          }}
                          disabled={deleteDriverMutation.isPending}
                          title="刪除此離職司機的全部資料（不可復原）"
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> 刪除
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {generatedTokens[d.id] && !d.lineUserId && (
                  <tr key={`${d.id}-token`} className="bg-[#06C755]/5 border-t border-[#06C755]/20">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-gray-600 font-medium">📱 傳送給 {d.name}：</span>
                        <div className="flex items-center gap-2 bg-white border border-[#06C755]/30 rounded-lg px-3 py-1.5">
                          <span className="font-mono font-bold tracking-widest text-gray-800">
                            綁定碼 {generatedTokens[d.id]}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-[#06C755] border-[#06C755]/40 hover:bg-[#06C755]/10"
                          onClick={() => copyToken(d.id)}
                        >
                          <Copy className="w-3 h-3 mr-1" /> 複製
                        </Button>
                        <span className="text-xs text-gray-400">有效 48 小時 · 使用一次即失效</span>
                      </div>
                    </td>
                  </tr>
                )}
                {expandedId === d.id && (() => {
                  const isValidLineId = /^U[0-9a-f]{32}$/.test(manualId.trim());
                  const isPhoneNumber = /^09[0-9]{8}$/.test(manualId.trim());
                  return (
                  <tr key={`${d.id}-input`} className="bg-blue-50">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="space-y-2">
                        <label className="block text-xs text-blue-700 font-medium">
                          輸入 {d.name} 的 LINE User ID
                        </label>
                        <input
                          type="text"
                          placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx（U 開頭，共 33 字元）"
                          value={manualId}
                          onChange={(e) => setManualId(e.target.value)}
                          className={`w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 bg-white font-mono ${
                            manualId && !isValidLineId
                              ? "border-red-300 focus:ring-red-400"
                              : "border-blue-200 focus:ring-blue-400"
                          }`}
                        />
                        {isPhoneNumber && (
                          <p className="text-xs text-red-600 font-medium">
                            ⚠ 請勿填入電話號碼！LINE User ID 是「U」開頭的英數字串，不是電話。
                          </p>
                        )}
                        {manualId && !isValidLineId && !isPhoneNumber && (
                          <p className="text-xs text-red-500">
                            格式不對。LINE User ID 必須是「U」開頭 + 32 個小寫英數字元，共 33 字元。
                          </p>
                        )}
                        <div className="bg-blue-100/70 rounded p-2 text-xs text-blue-800 space-y-1">
                          <div className="font-medium">📋 如何取得 LINE User ID？</div>
                          <div>✅ <strong>推薦方式（自動）</strong>：請司機加入 LINE 官方帳號好友，傳送「<code className="bg-white px-1 rounded">綁定 {d.phone ?? "0912345678"}</code>」，系統自動記錄。</div>
                          <div>🔧 <strong>手動方式</strong>：登入 LINE Official Account Manager → 用戶管理 → 找到司機 → 複製「User ID」欄位（U 開頭）。</div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                            onClick={() => manualBindMutation.mutate({ id: d.id, lineUserId: manualId })}
                            disabled={!isValidLineId || manualBindMutation.isPending}
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
                  );
                })()}
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
  const [results, setResults] = useState<Record<number, { sent: number; failed: number; skipped: number; total: number }>>({});

  const { data, isLoading, refetch } = useQuery<{ orders: BroadcastOrder[]; boundDriverCount: number }>({
    queryKey: ["line-broadcast-candidates"],
    queryFn: () => fetch("/api/line/broadcast-candidates").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: queueStatus } = useQuery<{
    pending: number; running: number; completed: number; failed: number; queueLength: number; concurrency: number;
  }>({
    queryKey: ["line-queue-status"],
    queryFn: () => fetch("/api/line/queue-status").then(r => r.json()),
    refetchInterval: 3_000,
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
        setResults(prev => ({ ...prev, [orderId]: { ...d, skipped: d.skipped ?? 0 } }));
        const skippedNote = (d.skipped ?? 0) > 0 ? `（另有 ${d.skipped} 位在職司機尚未綁定 LINE）` : "";
        if (d.sent === 0 && d.failed === 0) {
          toast({
            title: "⚠️ 無人綁定 LINE",
            description: `目前沒有司機設定 LINE User ID，請至「司機綁定」頁籤新增${skippedNote ? "\n" + skippedNote : ""}`,
            variant: "destructive",
          });
        } else if (d.sent === 0 && d.failed > 0) {
          toast({
            title: "⚠️ LINE 推播全部失敗",
            description: `司機 LINE ID 已設定但 LINE API 拒絕（${d.failed} 位）。最可能原因：司機尚未加LINE官方帳號為好友${skippedNote ? "\n" + skippedNote : ""}`,
            variant: "destructive",
          });
        } else if (d.failed > 0) {
          toast({
            title: `⚠️ 部分推播失敗`,
            description: `訂單 #${orderId}：${d.sent} 位成功，${d.failed} 位失敗（可能未加好友）${skippedNote ? "\n" + skippedNote : ""}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: `✅ 廣播成功`,
            description: `訂單 #${orderId} 已推送給 ${d.sent} 位司機，等待搶單${skippedNote ? "。" + skippedNote : ""}`,
          });
        }
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

      {/* 0位綁定警告 */}
      {driverCount === 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="p-2 rounded-lg bg-red-100 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="font-semibold text-sm text-red-700">目前沒有司機綁定 LINE</div>
            <div className="text-xs text-red-600 mt-1 space-y-1">
              <div>廣播按下後訊息無法發送給任何人。請先完成以下其中一種綁定方式：</div>
              <div className="pl-2 space-y-0.5">
                <div>① 請司機加入 LINE 官方帳號，並傳送「<code className="bg-red-100 px-1 rounded">綁定 {"{電話號碼}"}</code>」</div>
                <div>② 切換到「司機綁定」頁籤，手動貼上司機的 LINE User ID</div>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* 非同步推播佇列狀態 */}
      {queueStatus && (queueStatus.pending > 0 || queueStatus.running > 0 || queueStatus.completed > 0) && (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs">
          <Zap className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span className="font-medium text-blue-800">非同步推播佇列</span>
          <div className="flex gap-3 ml-auto">
            {queueStatus.running > 0 && (
              <span className="text-blue-700 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />推送中 {queueStatus.running}
              </span>
            )}
            {queueStatus.pending > 0 && (
              <span className="text-amber-700">排隊中 {queueStatus.pending}</span>
            )}
            {queueStatus.completed > 0 && (
              <span className="text-green-700">✓ 完成 {queueStatus.completed}</span>
            )}
            {queueStatus.failed > 0 && (
              <span className="text-red-700">✗ 失敗 {queueStatus.failed}</span>
            )}
          </div>
        </div>
      )}

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
                    <span className={`text-xs font-medium ${
                      sentResult.sent === 0
                        ? "text-red-600"
                        : sentResult.failed > 0
                        ? "text-amber-600"
                        : "text-green-700"
                    }`}>
                      {sentResult.sent === 0
                        ? "⚠ 無人接收"
                        : sentResult.failed > 0
                        ? `⚠ ${sentResult.sent} 成功 / ${sentResult.failed} 失敗`
                        : `✓ 已推送 ${sentResult.sent} 位`}
                      {sentResult.skipped > 0 && (
                        <span className="text-slate-400 font-normal ml-1">（跳過未綁定 {sentResult.skipped} 位）</span>
                      )}
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
