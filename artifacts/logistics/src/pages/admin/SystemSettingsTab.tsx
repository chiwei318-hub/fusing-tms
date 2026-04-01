import { useState, useEffect } from "react";
import { Save, RefreshCw, Settings, Truck, Clock, Zap, BarChart2, AlertTriangle, ToggleLeft, ToggleRight, Mail, CheckCircle2, XCircle, Send, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";

interface ConfigItem {
  id: number;
  key: string;
  value: string;
  label: string;
  updated_at: string;
}

const CONFIG_GROUPS = [
  {
    title: "全自動派車設定",
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    keys: ["auto_dispatch", "payment_required", "max_dispatch_km"],
  },
  {
    title: "報價與付款時效",
    icon: Clock,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
    keys: ["quote_expires_minutes", "payment_expires_minutes"],
  },
  {
    title: "派單評分權重",
    icon: BarChart2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    keys: ["w_distance", "w_vehicle", "w_profit", "w_time", "carpool_bonus", "return_bonus", "carpool_radius_km"],
  },
  {
    title: "費率與毛利設定",
    icon: Truck,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    keys: ["base_profit_rate", "min_profit_rate"],
  },
  {
    title: "尖峰與夜間時段",
    icon: Clock,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    keys: ["peak_multiplier", "peak_hours", "night_multiplier", "night_hours"],
  },
];

const BOOLEAN_KEYS = ["auto_dispatch", "payment_required"];

const SMTP_FIELDS = [
  { key: "smtp_host",      label: "SMTP 伺服器",        placeholder: "smtp.gmail.com" },
  { key: "smtp_port",      label: "SMTP 埠號",           placeholder: "587" },
  { key: "smtp_user",      label: "帳號 (Email)",         placeholder: "your@gmail.com" },
  { key: "smtp_pass",      label: "密碼 / App Password", placeholder: "••••••••", secret: true },
  { key: "smtp_from",      label: "寄件人 Email",         placeholder: "noreply@furyong.com" },
  { key: "smtp_from_name", label: "寄件人名稱",           placeholder: "富詠運輸" },
];

const SMTP_HINTS: Record<string, { host: string; port: string }> = {
  gmail:   { host: "smtp.gmail.com", port: "587" },
  outlook: { host: "smtp-mail.outlook.com", port: "587" },
  yahoo:   { host: "smtp.mail.yahoo.com", port: "465" },
  sendgrid:{ host: "smtp.sendgrid.net", port: "587" },
};

export default function SystemSettingsTab() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // SMTP state
  const [smtpEdits, setSmtpEdits] = useState<Record<string, string>>({});
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(getApiUrl("system-config"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setConfigs(data);
      const initial: Record<string, string> = {};
      const smtpInit: Record<string, string> = {};
      for (const c of data) {
        if (c.key.startsWith("smtp_")) {
          smtpInit[c.key] = c.value;
        } else {
          initial[c.key] = c.value;
        }
      }
      setEdits(initial);
      setSmtpEdits(smtpInit);
    } catch {
      toast({ title: "載入失敗", description: "無法取得系統設定", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleChange = (key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const toggleBoolean = (key: string) => {
    const current = edits[key] === "true";
    setEdits(prev => ({ ...prev, [key]: current ? "false" : "true" }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("auth-jwt");
      await fetch(getApiUrl("system-config"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(edits),
      });
      toast({ title: "設定已儲存", description: "所有系統參數已更新" });
      await fetchConfigs();
    } catch {
      toast({ title: "儲存失敗", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    try {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(getApiUrl("invoices/smtp-config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(smtpEdits),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "SMTP 設定已儲存", description: "下次開票將使用新設定寄送 Email" });
        setTestResult(null);
      } else {
        toast({ title: "儲存失敗", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "儲存失敗", variant: "destructive" });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) { toast({ title: "請輸入測試 Email", variant: "destructive" }); return; }
    setTestSending(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(getApiUrl("invoices/smtp-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) toast({ title: "測試信已發送！", description: `請查看 ${testEmail} 的收件匣` });
      else toast({ title: "發送失敗", description: data.error, variant: "destructive" });
    } catch {
      toast({ title: "連線失敗", variant: "destructive" });
    } finally {
      setTestSending(false);
    }
  };

  const applyHint = (provider: string) => {
    const hint = SMTP_HINTS[provider];
    if (hint) setSmtpEdits(p => ({ ...p, smtp_host: hint.host, smtp_port: hint.port }));
  };

  const isDirty = configs.filter(c => !c.key.startsWith("smtp_")).some(c => edits[c.key] !== c.value);

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground">載入設定中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            系統設定中心
          </h2>
          <p className="text-sm text-muted-foreground mt-1">調整平台核心參數、自動派車規則與費率設定</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchConfigs}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            重新載入
          </Button>
          <Button size="sm" onClick={handleSaveAll} disabled={!isDirty || saving}
            className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "儲存中..." : "儲存所有變更"}
          </Button>
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>有未儲存的變更，請記得點「儲存所有變更」</span>
        </div>
      )}

      {/* Standard config groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {CONFIG_GROUPS.map(group => {
          const groupConfigs = configs.filter(c => group.keys.includes(c.key));
          if (!groupConfigs.length) return null;
          const Icon = group.icon;

          return (
            <Card key={group.title} className={`border ${group.bg}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${group.color}`} />
                  {group.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {groupConfigs.map(c => (
                  <div key={c.key} className="flex items-center gap-3">
                    <Label className="w-40 shrink-0 text-xs text-foreground font-medium">{c.label}</Label>
                    {BOOLEAN_KEYS.includes(c.key) ? (
                      <button onClick={() => toggleBoolean(c.key)} className="flex items-center gap-2 text-sm">
                        {edits[c.key] === "true" ? (
                          <><ToggleRight className="w-7 h-7 text-blue-600" /><Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">啟用</Badge></>
                        ) : (
                          <><ToggleLeft className="w-7 h-7 text-gray-400" /><Badge variant="secondary">停用</Badge></>
                        )}
                      </button>
                    ) : (
                      <Input
                        value={edits[c.key] ?? ""}
                        onChange={e => handleChange(c.key, e.target.value)}
                        className={`h-8 text-sm ${edits[c.key] !== c.value ? "border-amber-400 bg-amber-50/50" : ""}`}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── SMTP Email 設定 ─── */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Email 發送設定（SMTP）
            <Badge className="bg-blue-100 text-blue-700 ml-1 text-xs">自動開票寄信</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            設定後，系統在「司機完單 → 自動開票」時，將同時寄送 HTML 電子發票至客戶 Email
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">快速套用：</span>
            {Object.entries({ Gmail: "gmail", Outlook: "outlook", Yahoo: "yahoo", SendGrid: "sendgrid" }).map(([label, key]) => (
              <Button key={key} variant="outline" size="sm" className="h-7 text-xs px-3"
                onClick={() => applyHint(key)}>
                {label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SMTP_FIELDS.map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs font-medium">{f.label}</Label>
                <div className="relative">
                  <Input
                    type={f.secret && !showSecret ? "password" : "text"}
                    value={smtpEdits[f.key] ?? ""}
                    onChange={e => setSmtpEdits(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-8 text-sm pr-9"
                  />
                  {f.secret && (
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Gmail 特別說明 */}
          {(smtpEdits.smtp_host ?? "").includes("gmail") && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>使用 Gmail 時，密碼欄請填入「應用程式密碼」（非 Google 帳號密碼）。需先至 Google 帳號開啟「兩步驟驗證」後才能產生。</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSaveSmtp} disabled={smtpSaving} size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {smtpSaving ? "儲存中..." : "儲存 SMTP 設定"}
            </Button>
          </div>

          {/* Test email */}
          <div className="border-t border-blue-200 pt-4 space-y-3">
            <Label className="text-xs font-semibold">發送測試信件</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="測試收件 Email"
                className="h-8 text-sm flex-1"
                onKeyDown={e => e.key === "Enter" && handleTestEmail()}
              />
              <Button onClick={handleTestEmail} disabled={testSending} size="sm" variant="outline">
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {testSending ? "發送中..." : "發送測試"}
              </Button>
            </div>
            {testResult && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${testResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {testResult.ok ? "測試信發送成功！請檢查收件匣（含垃圾郵件）" : `發送失敗：${testResult.error}`}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-white border border-blue-100 rounded-xl p-4 text-xs text-muted-foreground space-y-1.5">
            <div className="font-semibold text-foreground text-sm mb-2 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-blue-500" />自動化發票流程
            </div>
            {[
              ["①", "司機點擊「完成配送」"],
              ["②", "系統自動開立電子發票（idempotent，不重複）"],
              ["③", "若訂單有 Email → 自動寄出 HTML 發票通知"],
              ["④", "若客戶有 LINE → 同時推播 LINE 通知"],
              ["⑤", "發票號碼格式：FYyyyymm-xxxxxx"],
            ].map(([step, desc]) => (
              <div key={step} className="flex gap-2">
                <span className="font-bold text-blue-500 w-5 shrink-0">{step}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-4">
          <p className="text-xs text-muted-foreground">
            <strong>說明</strong>：派單評分權重（距離/車型/收益/時效）合計建議 = 100%。尖峰時段格式為 <code>7-9,17-19</code>（24小時制，逗號分隔多時段）。
            自動派車啟用後，每筆新建訂單將自動指派負載最低的可用司機。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
