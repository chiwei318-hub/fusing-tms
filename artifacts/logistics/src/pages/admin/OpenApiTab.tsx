import { useState, useEffect, useCallback } from "react";
import {
  Key, Webhook, Globe, RefreshCw, Plus, Trash2, Copy,
  Eye, EyeOff, CheckCircle2, XCircle, Pause, PlayCircle,
  AlertCircle, ChevronDown, ChevronUp, Code2, Zap, ShieldCheck,
  BarChart3, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────
interface ApiKey {
  id: number; name: string; key_prefix: string; scope: string[];
  status: string; rate_limit: number; note: string | null;
  expires_at: string | null; last_used_at: string | null;
  request_count: number; created_at: string;
}
interface Webhook {
  id: number; name: string; url: string; events: string[];
  status: string; note: string | null; failure_count: number;
  delivery_count: number; success_count: number; created_at: string;
}
interface WebhookDelivery {
  id: number; event: string; status: string; response_code: number;
  response_body: string; created_at: string;
}

const ALL_SCOPES = [
  { value: "orders:read",   label: "訂單查詢", desc: "GET /open/v1/orders" },
  { value: "orders:create", label: "訂單建立", desc: "POST /open/v1/orders" },
  { value: "quote",         label: "報價試算", desc: "POST /open/v1/quote" },
];

const ALL_EVENTS = [
  { value: "order.created",        label: "訂單建立" },
  { value: "order.status_changed", label: "訂單狀態變更" },
  { value: "order.delivered",      label: "訂單完成" },
];

function authHdr() {
  const t = localStorage.getItem("auth-jwt");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

function copyText(text: string, toast: any) {
  navigator.clipboard.writeText(text).then(() => toast({ title: "已複製" }));
}

const timeAgo = (iso: string) => {
  if (!iso) return "從未";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 天前`;
};

// ─── API Key Card ─────────────────────────────────────────────────────────
function ApiKeyCard({ k, onRevoke, onRefresh }: {
  k: ApiKey; onRevoke: () => void; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const doRevoke = async () => {
    setRevoking(true);
    await fetch(getApiUrl(`api-keys/${k.id}`), { method: "DELETE", headers: authHdr() });
    toast({ title: "已刪除 API Key" });
    onRevoke();
  };

  const toggleStatus = async () => {
    const next = k.status === "active" ? "revoked" : "active";
    await fetch(getApiUrl(`api-keys/${k.id}`), {
      method: "PATCH", headers: authHdr(),
      body: JSON.stringify({ status: next }),
    });
    onRefresh();
  };

  return (
    <Card className={`border ${k.status !== "active" ? "opacity-60" : ""}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{k.name}</span>
              <Badge className={k.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                {k.status === "active" ? "啟用" : "停用"}
              </Badge>
              {k.expires_at && new Date(k.expires_at) < new Date() && (
                <Badge className="bg-red-100 text-red-600">已過期</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{k.key_prefix}_{"*".repeat(16)}…</code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(`${k.key_prefix}_***`, toast)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {k.scope.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleStatus} title={k.status === "active" ? "停用" : "啟用"}>
              {k.status === "active" ? <Pause className="w-3.5 h-3.5 text-amber-500" /> : <PlayCircle className="w-3.5 h-3.5 text-green-500" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={doRevoke} disabled={revoking}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
            <div><div className="font-semibold text-foreground text-base">{k.request_count.toLocaleString()}</div><div>累計呼叫</div></div>
            <div><div className="font-semibold text-foreground">{k.rate_limit.toLocaleString()}</div><div>限速 / 日</div></div>
            <div><div className="font-semibold text-foreground">{k.last_used_at ? timeAgo(k.last_used_at) : "從未"}</div><div>最後使用</div></div>
            <div><div className="font-semibold text-foreground">{k.expires_at ? new Date(k.expires_at).toLocaleDateString("zh-TW") : "永不過期"}</div><div>到期日</div></div>
            {k.note && <div className="col-span-2 sm:col-span-4 text-muted-foreground">{k.note}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Webhook Card ─────────────────────────────────────────────────────────
function WebhookCard({ wh, onDelete, onRefresh }: {
  wh: Webhook; onDelete: () => void; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded]   = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [testing, setTesting]     = useState(false);

  const loadDeliveries = async () => {
    const r = await fetch(getApiUrl(`webhooks/${wh.id}/deliveries`), { headers: authHdr() });
    setDeliveries(await r.json());
  };

  const handleExpand = () => {
    setExpanded(e => !e);
    if (!expanded) loadDeliveries();
  };

  const testFire = async () => {
    setTesting(true);
    const r = await fetch(getApiUrl(`webhooks/${wh.id}/test`), {
      method: "POST", headers: authHdr(),
      body: JSON.stringify({ event: "order.status_changed" }),
    });
    const data = await r.json();
    toast({ title: data.ok ? "測試成功" : "測試失敗", description: `HTTP ${data.statusCode ?? "-"}`, variant: data.ok ? "default" : "destructive" });
    setTesting(false);
    loadDeliveries();
  };

  const toggleStatus = async () => {
    const next = wh.status === "active" ? "paused" : "active";
    await fetch(getApiUrl(`webhooks/${wh.id}`), {
      method: "PATCH", headers: authHdr(), body: JSON.stringify({ status: next }),
    });
    onRefresh();
  };

  const successRate = wh.delivery_count > 0
    ? Math.round((Number(wh.success_count) / Number(wh.delivery_count)) * 100)
    : 100;

  return (
    <Card className={`border ${wh.status !== "active" ? "opacity-60" : ""}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{wh.name}</span>
              <Badge className={wh.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                {wh.status === "active" ? "啟用" : "暫停"}
              </Badge>
              {wh.failure_count > 5 && <Badge className="bg-red-100 text-red-600">失敗 {wh.failure_count} 次</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[280px]">{wh.url}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {wh.events.map(e => <Badge key={e} variant="outline" className="text-xs">{e}</Badge>)}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={testFire} disabled={testing}>
              <Zap className="w-3 h-3" />{testing ? "送出中…" : "測試"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleStatus}>
              {wh.status === "active" ? <Pause className="w-3.5 h-3.5 text-amber-500" /> : <PlayCircle className="w-3.5 h-3.5 text-green-500" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
              await fetch(getApiUrl(`webhooks/${wh.id}`), { method: "DELETE", headers: authHdr() });
              onDelete();
            }}>
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExpand}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
          <span>送達 {wh.delivery_count} 次</span>
          <span className={successRate < 80 ? "text-red-500" : "text-green-600"}>成功率 {successRate}%</span>
          {wh.note && <span>{wh.note}</span>}
        </div>

        {/* Deliveries */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">最近送達記錄</p>
            {deliveries.length === 0 && <p className="text-xs text-muted-foreground">尚無記錄</p>}
            {deliveries.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                {d.status === "success"
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className="text-muted-foreground min-w-[90px]">{timeAgo(d.created_at)}</span>
                <Badge variant="outline" className="text-xs">{d.event}</Badge>
                <span className="text-muted-foreground">HTTP {d.response_code || "—"}</span>
                {d.response_body && (
                  <span className="truncate text-muted-foreground max-w-[200px]">{d.response_body}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────
export default function OpenApiTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState("apikeys");
  const [apiKeys, setApiKeys]   = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading]   = useState(true);

  // Dialogs
  const [showNewKey, setShowNewKey]     = useState(false);
  const [showNewWH, setShowNewWH]       = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);

  const [newKey, setNewKey]   = useState({ name: "", note: "", rate_limit: 1000, scope: ["orders:read","orders:create","quote"] as string[] });
  const [newWH,  setNewWH]    = useState({ name: "", url: "", note: "", events: ["order.created","order.status_changed","order.delivered"] as string[] });

  const fetchKeys = useCallback(async () => {
    const r = await fetch(getApiUrl("/api/api-keys"), { headers: authHdr() });
    setApiKeys(await r.json());
  }, []);

  const fetchWH = useCallback(async () => {
    const r = await fetch(getApiUrl("/api/webhooks"), { headers: authHdr() });
    setWebhooks(await r.json());
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchKeys(), fetchWH()]);
    setLoading(false);
  }, [fetchKeys, fetchWH]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createKey = async () => {
    if (!newKey.name) return;
    const r = await fetch(getApiUrl("/api/api-keys"), {
      method: "POST", headers: authHdr(),
      body: JSON.stringify(newKey),
    });
    const data = await r.json();
    setNewKeyResult(data.key);
    fetchKeys();
  };

  const createWH = async () => {
    if (!newWH.name || !newWH.url) return;
    await fetch(getApiUrl("/api/webhooks"), {
      method: "POST", headers: authHdr(),
      body: JSON.stringify(newWH),
    });
    toast({ title: "Webhook 已建立" });
    setShowNewWH(false);
    setNewWH({ name: "", url: "", note: "", events: ["order.created","order.status_changed","order.delivered"] });
    fetchWH();
  };

  const toggleScope = (s: string) => {
    setNewKey(k => ({
      ...k, scope: k.scope.includes(s) ? k.scope.filter(x => x !== s) : [...k.scope, s],
    }));
  };
  const toggleEvent = (e: string) => {
    setNewWH(w => ({
      ...w, events: w.events.includes(e) ? w.events.filter(x => x !== e) : [...w.events, e],
    }));
  };

  const BASE_URL = `${window.location.protocol}//${window.location.host}/api/open/v1`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            API 開放接口
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">提供第三方系統串接：訂單建立・狀態查詢・報價試算・Webhook 通知</p>
        </div>
        <Button variant="outline" size="sm" className="h-8" onClick={fetchAll}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />重新整理
        </Button>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "API Key 數量", value: apiKeys.length, icon: Key, color: "text-blue-600" },
          { label: "啟用中 Key", value: apiKeys.filter(k => k.status === "active").length, icon: ShieldCheck, color: "text-green-600" },
          { label: "Webhook 數量", value: webhooks.length, icon: Webhook, color: "text-purple-600" },
          { label: "總呼叫次數", value: apiKeys.reduce((a, k) => a + k.request_count, 0).toLocaleString(), icon: BarChart3, color: "text-indigo-600" },
        ].map(s => (
          <Card key={s.label} className="border-0 bg-muted/40">
            <CardContent className="pt-3 pb-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
                <s.icon className={`w-5 h-5 ${s.color} opacity-40 mt-0.5`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="h-8 gap-1">
          <TabsTrigger value="apikeys"  className="h-7 text-xs px-3 gap-1.5"><Key className="w-3.5 h-3.5" />API Keys</TabsTrigger>
          <TabsTrigger value="webhooks" className="h-7 text-xs px-3 gap-1.5"><Webhook className="w-3.5 h-3.5" />Webhooks</TabsTrigger>
          <TabsTrigger value="docs"     className="h-7 text-xs px-3 gap-1.5"><Code2 className="w-3.5 h-3.5" />API 文件</TabsTrigger>
        </TabsList>

        {/* ─── API Keys ─── */}
        <TabsContent value="apikeys" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setShowNewKey(true); setNewKeyResult(null); }}>
              <Plus className="w-3.5 h-3.5" />新增 API Key
            </Button>
          </div>
          {loading && <p className="text-sm text-muted-foreground">載入中…</p>}
          {!loading && apiKeys.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                <Key className="w-8 h-8 opacity-30" />
                <p className="text-sm">尚未建立任何 API Key</p>
                <Button size="sm" onClick={() => { setShowNewKey(true); setNewKeyResult(null); }}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />建立第一個 Key
                </Button>
              </CardContent>
            </Card>
          )}
          {apiKeys.map(k => (
            <ApiKeyCard key={k.id} k={k} onRevoke={fetchKeys} onRefresh={fetchKeys} />
          ))}
        </TabsContent>

        {/* ─── Webhooks ─── */}
        <TabsContent value="webhooks" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowNewWH(true)}>
              <Plus className="w-3.5 h-3.5" />新增 Webhook
            </Button>
          </div>
          {!loading && webhooks.length === 0 && (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                <Webhook className="w-8 h-8 opacity-30" />
                <p className="text-sm">尚未設定任何 Webhook</p>
                <Button size="sm" onClick={() => setShowNewWH(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />建立第一個 Webhook
                </Button>
              </CardContent>
            </Card>
          )}
          {webhooks.map(wh => (
            <WebhookCard key={wh.id} wh={wh} onDelete={fetchWH} onRefresh={fetchWH} />
          ))}
        </TabsContent>

        {/* ─── API Docs ─── */}
        <TabsContent value="docs" className="mt-4 space-y-4">
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                認證方式
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">所有 Open API 請求皆需在 Header 帶入 API Key：</p>
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
{`X-API-Key: fv1_your_api_key_here`}
              </pre>
              <p className="text-xs text-muted-foreground">Base URL：<code className="bg-muted px-1.5 py-0.5 rounded text-xs">{BASE_URL}</code></p>
            </CardContent>
          </Card>

          {[
            {
              method: "POST", path: "/quote", scope: "quote",
              title: "報價試算",
              desc: "依車型、距離、重量計算預估報價",
              body: `{
  "vehicle_type": "箱型車",
  "distance_km": 20,
  "weight_kg": 50
}`,
              resp: `{
  "vehicle_type": "箱型車",
  "breakdown": { "base": 1000, "distance_fee": 400, "weight_fee": 0 },
  "total": 1400,
  "currency": "TWD"
}`,
            },
            {
              method: "POST", path: "/orders", scope: "orders:create",
              title: "建立訂單",
              desc: "第三方系統直接開立訂單，自動進入派車流程",
              body: `{
  "customer_name": "王大明",
  "customer_phone": "0912-345-678",
  "pickup_address": "台北市中正區忠孝東路一段1號",
  "delivery_address": "新北市板橋區文化路二段100號",
  "vehicle_type": "箱型車",
  "pickup_date": "2026-04-15",
  "note": "易碎品請小心搬運"
}`,
              resp: `{
  "id": 1234,
  "customer_name": "王大明",
  "status": "pending",
  "created_at": "2026-04-01T10:00:00Z"
}`,
            },
            {
              method: "GET", path: "/orders/:id", scope: "orders:read",
              title: "查詢訂單狀態",
              desc: "即時查詢指定訂單的配送狀態與司機資訊",
              body: null,
              resp: `{
  "id": 1234,
  "status": "in_transit",
  "driver_name": "王大明",
  "driver_phone": "0912-000-000",
  "license_plate": "ABC-1234",
  "total_fee": 1400
}`,
            },
            {
              method: "GET", path: "/orders", scope: "orders:read",
              title: "查詢訂單列表",
              desc: "查詢由本 Key 建立的所有訂單",
              body: null,
              resp: `{
  "data": [...],
  "total": 42,
  "page": 1,
  "limit": 20
}`,
            },
          ].map(ep => (
            <Card key={ep.path} className="border">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`text-xs font-mono ${ep.method === "GET" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {ep.method}
                  </Badge>
                  <code className="text-sm font-mono">{BASE_URL}{ep.path}</code>
                  <Badge variant="outline" className="text-xs ml-auto">{ep.scope}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{ep.desc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ep.body && (
                    <div>
                      <p className="text-xs font-semibold mb-1 text-muted-foreground">Request Body</p>
                      <pre className="bg-muted rounded-lg p-2.5 text-xs overflow-x-auto">{ep.body}</pre>
                    </div>
                  )}
                  <div className={ep.body ? "" : "md:col-span-2"}>
                    <p className="text-xs font-semibold mb-1 text-muted-foreground">Response (200)</p>
                    <pre className="bg-muted rounded-lg p-2.5 text-xs overflow-x-auto">{ep.resp}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Webhook doc */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Webhook className="w-4 h-4 text-purple-500" />
                Webhook 事件格式
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">訂閱事件發生時，系統以 POST 推送至您設定的 URL：</p>
              <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto">
{`POST https://your-server.com/webhook
Headers:
  Content-Type: application/json
  X-FV-Event: order.status_changed
  X-FV-Signature-256: sha256=<hmac-hex>

Body:
{
  "event": "order.status_changed",
  "timestamp": "2026-04-01T10:30:00Z",
  "data": {
    "id": 1234,
    "status": "delivered",
    "customer_name": "王大明",
    "total_fee": 1400
  }
}`}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── New API Key Dialog ─── */}
      <Dialog open={showNewKey} onOpenChange={v => { setShowNewKey(v); if (!v) setNewKeyResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4" />新增 API Key</DialogTitle>
          </DialogHeader>
          {!newKeyResult ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">名稱 *</Label>
                <Input placeholder="例：ERP 系統串接" value={newKey.name} onChange={e => setNewKey(k => ({ ...k, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">權限範圍</Label>
                <div className="space-y-2">
                  {ALL_SCOPES.map(s => (
                    <label key={s.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" className="rounded" checked={newKey.scope.includes(s.value)}
                        onChange={() => toggleScope(s.value)} />
                      <div>
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{s.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">限速（次/日）</Label>
                  <Input type="number" min={100} max={100000} value={newKey.rate_limit}
                    onChange={e => setNewKey(k => ({ ...k, rate_limit: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">備註</Label>
                <Input placeholder="使用說明或系統名稱" value={newKey.note}
                  onChange={e => setNewKey(k => ({ ...k, note: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewKey(false)}>取消</Button>
                <Button disabled={!newKey.name} onClick={createKey}>產生 Key</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 mb-2" />
                <p className="font-semibold text-amber-800">請立即複製並妥善保存，此 Key 只顯示一次</p>
              </div>
              <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all">{newKeyResult}</div>
              <Button className="w-full" onClick={() => { copyText(newKeyResult!, toast); }}>
                <Copy className="w-3.5 h-3.5 mr-1.5" />複製 API Key
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setShowNewKey(false); setNewKeyResult(null); }}>
                完成
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── New Webhook Dialog ─── */}
      <Dialog open={showNewWH} onOpenChange={setShowNewWH}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Webhook className="w-4 h-4" />新增 Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">名稱 *</Label>
              <Input placeholder="例：ERP 訂單同步" value={newWH.name} onChange={e => setNewWH(w => ({ ...w, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">接收 URL *</Label>
              <Input placeholder="https://your-server.com/webhook" value={newWH.url}
                onChange={e => setNewWH(w => ({ ...w, url: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">訂閱事件</Label>
              {ALL_EVENTS.map(ev => (
                <label key={ev.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={newWH.events.includes(ev.value)}
                    onChange={() => toggleEvent(ev.value)} />
                  <span className="text-sm">{ev.label}</span>
                  <code className="text-xs text-muted-foreground">{ev.value}</code>
                </label>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">備註</Label>
              <Input placeholder="用途說明" value={newWH.note} onChange={e => setNewWH(w => ({ ...w, note: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewWH(false)}>取消</Button>
              <Button disabled={!newWH.name || !newWH.url} onClick={createWH}>建立</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
