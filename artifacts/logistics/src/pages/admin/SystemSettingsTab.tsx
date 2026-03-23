import { useState, useEffect } from "react";
import { Save, RefreshCw, Settings, Truck, Clock, Zap, BarChart2, AlertTriangle, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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

export default function SystemSettingsTab() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system-config");
      const data = await res.json();
      setConfigs(data);
      const initial: Record<string, string> = {};
      for (const c of data) initial[c.key] = c.value;
      setEdits(initial);
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
      await fetch("/api/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  const isDirty = configs.some(c => edits[c.key] !== c.value);

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground">載入設定中...</div>;
  }

  return (
    <div className="space-y-6">
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
                      <button
                        onClick={() => toggleBoolean(c.key)}
                        className="flex items-center gap-2 text-sm"
                      >
                        {edits[c.key] === "true" ? (
                          <>
                            <ToggleRight className="w-7 h-7 text-blue-600" />
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">啟用</Badge>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-7 h-7 text-gray-400" />
                            <Badge variant="secondary">停用</Badge>
                          </>
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
