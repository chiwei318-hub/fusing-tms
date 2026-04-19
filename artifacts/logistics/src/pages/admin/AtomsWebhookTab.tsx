import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Send, CheckCircle2, AlertCircle, Copy, Zap } from "lucide-react";
import { toast } from "sonner";

interface DiagnosticsData {
  config: {
    atoms_webhook_url: string;
    atoms_callback_base_url: string;
    app_base_url: string;
    current_callback_url: string;
    atoms_callback_secret: string;
  };
  atoms_order_stats: {
    total_sent_to_atoms: number;
    total_accepted_by_atoms: number;
    total_completed: number;
  };
  recent_incoming_logs: WebhookLog[];
}

interface WebhookLog {
  id: number;
  received_at: string;
  path: string;
  method: string;
  source_ip: string | null;
  status_code: number;
  note: string | null;
  body_preview?: string;
  body?: any;
}

export default function AtomsWebhookTab() {
  const [diag, setDiag] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/v1/webhook/atoms-diagnostics"));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDiag(await r.json());
    } catch (e: any) {
      toast.error("載入診斷資料失敗：" + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleBroadcast = async () => {
    setBroadcasting(true);
    try {
      const r = await fetch(apiUrl("/api/v1/webhook/atoms-broadcast"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: ["pending", "assigned"] }),
      });
      const data = await r.json();
      toast.success(`已重新發送 ${data.success}/${data.total} 筆訂單給 Atoms`);
      setTimeout(load, 1500);
    } catch (e: any) {
      toast.error("發送失敗：" + e.message);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleTestCallback = async () => {
    setTesting(true);
    try {
      const r = await fetch(apiUrl("/api/v1/webhook/atoms-accept"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "order.accepted",
          data: {
            order_id: 1,
            driver_name: "測試司機",
            driver_phone: "0900000000",
            atoms_driver_id: "test-driver",
          },
        }),
      });
      const data = await r.json();
      if (data.ok) {
        toast.success("✅ Callback 端點回應正常，已記錄到日誌");
        setTimeout(load, 800);
      } else {
        toast.error("端點回應異常：" + JSON.stringify(data));
      }
    } catch (e: any) {
      toast.error("測試失敗：" + e.message);
    } finally {
      setTesting(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("已複製到剪貼簿");
  };

  const stats = diag?.atoms_order_stats;
  const cfg = diag?.config;
  const logs = diag?.recent_incoming_logs ?? [];

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Atoms 派車整合診斷</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            監控 Atoms ↔ 系統雙向 webhook 狀態，找出回傳未收到的原因
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          重新整理
        </Button>
      </div>

      {/* ── 統計卡片 ── */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <p className="text-xs text-blue-600 font-medium mb-1">已送出給 Atoms</p>
              <p className="text-3xl font-bold text-blue-700">{stats.total_sent_to_atoms}</p>
              <p className="text-xs text-muted-foreground mt-0.5">訂單筆數</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4">
              <p className="text-xs text-amber-600 font-medium mb-1">Atoms 已接單回傳</p>
              <p className="text-3xl font-bold text-amber-700">{stats.total_accepted_by_atoms}</p>
              <p className="text-xs text-muted-foreground mt-0.5">有收到回傳的訂單</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <p className="text-xs text-green-600 font-medium mb-1">已完成配送</p>
              <p className="text-3xl font-bold text-green-700">{stats.total_completed}</p>
              <p className="text-xs text-muted-foreground mt-0.5">完成+結算</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Callback URL 設定 ── */}
      {cfg && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Callback URL 設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">目前 Atoms 回傳 URL（我方接收端）</p>
              <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                <code className="text-sm flex-1 break-all">{cfg.current_callback_url}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyUrl(cfg.current_callback_url)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                ⚠️ 請確認此 URL 已在 Atoms 後台設定為 Webhook 回傳地址，或在每筆訂單送出時自動帶入（callback_url）
              </p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Atoms 推單地址</p>
                <p className="font-mono text-xs mt-0.5 break-all">{cfg.atoms_webhook_url}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Callback Secret</p>
                <p className="text-xs mt-0.5">{cfg.atoms_callback_secret}</p>
              </div>
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                若 Atoms 不支援 payload 內的 callback_url，請手動到 Atoms 後台設定以下兩個 Webhook URL：
              </p>
              <div className="bg-slate-50 rounded-md p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-slate-700 flex-1 break-all">{cfg.current_callback_url}</code>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyUrl(cfg.current_callback_url)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-slate-700 flex-1 break-all">{cfg.app_base_url}/api/v1/webhook/atoms-callback</code>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyUrl(`${cfg.app_base_url}/api/v1/webhook/atoms-callback`)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 操作按鈕 ── */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleBroadcast} disabled={broadcasting} className="bg-blue-600 hover:bg-blue-700">
          <Send className={`w-4 h-4 mr-2 ${broadcasting ? "animate-pulse" : ""}`} />
          {broadcasting ? "發送中..." : "重新推送未完成訂單給 Atoms"}
        </Button>
        <Button variant="outline" onClick={handleTestCallback} disabled={testing}>
          <Zap className="w-4 h-4 mr-2" />
          {testing ? "測試中..." : "測試 Callback 端點"}
        </Button>
      </div>

      {/* ── Webhook 接收日誌 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Webhook 接收日誌（近 20 筆）</CardTitle>
            <Badge variant="outline" className="text-xs">{logs.length} 筆</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            記錄所有打進來的 webhook 請求。若 Atoms 有回傳，這裡會顯示記錄；若空白代表 Atoms 完全沒有呼叫到我們。
          </p>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">尚未收到任何 Atoms 回傳</p>
              <p className="text-xs mt-1">Atoms 完成配送後應自動呼叫 callback URL。若持續無記錄，請確認 Atoms 後台的 webhook 設定。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-md overflow-hidden cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    {log.status_code < 400 ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground w-36 shrink-0">
                      {new Date(log.received_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">{log.method}</Badge>
                    <code className="text-xs flex-1 truncate text-slate-700">{log.path}</code>
                    <Badge
                      className={`text-xs shrink-0 ${log.status_code < 400 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                      variant="outline"
                    >
                      {log.status_code}
                    </Badge>
                    {log.source_ip && (
                      <span className="text-xs text-muted-foreground shrink-0">{log.source_ip}</span>
                    )}
                    {log.note && (
                      <span className="text-xs text-amber-600 shrink-0">{log.note}</span>
                    )}
                  </div>
                  {expandedLog === log.id && (
                    <div className="border-t bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Body 內容（前 300 字）</p>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all">
                        {log.body_preview ?? JSON.stringify(log.body ?? {}, null, 2).slice(0, 600)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 操作說明 ── */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">若持續收不到 Atoms 回傳，請依序確認：</p>
          <ol className="text-sm text-amber-700 space-y-1.5 list-decimal list-inside">
            <li>
              <strong>到 Atoms 後台</strong>確認是否有設定 Webhook 回傳網址，或確認訂單 payload 中的 <code>callback_url</code> 欄位有被 Atoms 讀取
            </li>
            <li>
              複製上方「目前 Atoms 回傳 URL」，貼入 Atoms 後台的 Webhook 設定欄位
            </li>
            <li>
              點「重新推送未完成訂單給 Atoms」，讓新版（含頂層 callback_url）格式重新推送
            </li>
            <li>
              司機再次完成配送後，若「Webhook 接收日誌」仍為空，代表 Atoms 沒有發送回傳 —— 需聯繫 Atoms 技術支援確認其 webhook 機制
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
