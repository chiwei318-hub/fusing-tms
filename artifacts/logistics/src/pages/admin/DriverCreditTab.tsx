import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Star, TrendingUp, TrendingDown, ChevronRight,
  Award, AlertTriangle, History, Plus, Minus, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DriverCredit = {
  id: number; name: string; phone: string; vehicle_type: string;
  license_plate: string; status: string; credit_score: number;
  rating: number; rating_count: number; completed_orders: number; total_assigned: number;
};

type CreditHistory = {
  id: number; change: number; reason: string; score_after: number;
  created_at: string; pickup_address: string; delivery_address: string;
};

function ScoreBadge({ score }: { score: number }) {
  const tier = score >= 120 ? { label: "⭐ 精英", color: "bg-purple-100 text-purple-800 border-purple-200" }
    : score >= 100 ? { label: "優良", color: "bg-green-100 text-green-800 border-green-200" }
    : score >= 80 ? { label: "良好", color: "bg-blue-100 text-blue-800 border-blue-200" }
    : score >= 60 ? { label: "普通", color: "bg-yellow-100 text-yellow-800 border-yellow-200" }
    : { label: "⚠️ 低分", color: "bg-red-100 text-red-800 border-red-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${tier.color}`}>
      {tier.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, (score / 150) * 100);
  const color = score >= 120 ? "bg-purple-500" : score >= 100 ? "bg-green-500"
    : score >= 80 ? "bg-blue-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-800 w-8 text-right">{score}</span>
    </div>
  );
}

function AdjustDialog({
  driver, open, onClose, onSaved,
}: { driver: DriverCredit | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [change, setChange] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!driver || !change) return;
    setSaving(true);
    try {
      const num = parseInt(change, 10);
      if (isNaN(num)) return;
      await fetch(`${BASE}/api/drivers/${driver.id}/credit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change: num, reason: reason || undefined }),
      });
      onSaved();
      onClose();
      setChange("");
      setReason("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>手動調整積分 — {driver?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-sm text-gray-500">目前積分</p>
            <p className="text-3xl font-black text-gray-900">{driver?.credit_score ?? 100}</p>
          </div>
          <div className="space-y-2">
            <Label>調整值（正數加分，負數扣分）</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setChange(v => String((parseInt(v || "0") - 5)))}>
                <Minus className="w-3 h-3" />
              </Button>
              <Input
                type="number"
                placeholder="例：+5 或 -10"
                value={change}
                onChange={e => setChange(e.target.value)}
                className="text-center font-bold"
              />
              <Button size="sm" variant="outline" onClick={() => setChange(v => String((parseInt(v || "0") + 5)))}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>原因說明</Label>
            <Input
              placeholder="例：客訴扣分、特別表揚加分"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving || !change}>
            {saving ? "儲存中..." : "確認調整"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  driver, open, onClose,
}: { driver: DriverCredit | null; open: boolean; onClose: () => void }) {
  const [history, setHistory] = useState<CreditHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !driver) return;
    setLoading(true);
    fetch(`${BASE}/api/drivers/${driver.id}/credit-history`)
      .then(r => r.json()).then(setHistory).catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [open, driver]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>積分歷史 — {driver?.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">載入中...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">尚無積分記錄</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                  ${h.change >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {h.change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{h.reason}</p>
                    <span className={`text-sm font-bold flex-shrink-0 ${h.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {h.change >= 0 ? "+" : ""}{h.change}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(h.created_at).toLocaleString("zh-TW")} · 共 {h.score_after} 分
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DriverCreditTab() {
  const [drivers, setDrivers] = useState<DriverCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustTarget, setAdjustTarget] = useState<DriverCredit | null>(null);
  const [histTarget, setHistTarget] = useState<DriverCredit | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${BASE}/api/drivers/credit`)
      .then(r => r.json()).then(setDrivers).catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const avgScore = drivers.length
    ? Math.round(drivers.reduce((s, d) => s + d.credit_score, 0) / drivers.length)
    : 0;
  const eliteCount = drivers.filter(d => d.credit_score >= 120).length;
  const lowCount = drivers.filter(d => d.credit_score < 60).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Award className="w-8 h-8 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-black">司機信用積分系統</h2>
              <p className="text-purple-200 text-sm mt-1">
                積分高者優先獲得高單價急單。滿分 150 分，起始 100 分。
              </p>
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            onClick={load}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            重整
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "平均積分", value: avgScore, icon: Star, color: "text-blue-600" },
          { label: "精英司機", value: `${eliteCount} 人`, icon: Award, color: "text-purple-600" },
          { label: "低分預警", value: `${lowCount} 人`, icon: AlertTriangle, color: "text-red-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-gray-500 text-xs mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scoring Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-gray-600 uppercase tracking-wide">積分規則</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { event: "按時完成配送", change: "+5", color: "text-green-600" },
            { event: "上傳 POD 照片", change: "+2", color: "text-green-600" },
            { event: "客訴記錄", change: "−15", color: "text-red-600" },
            { event: "遲到 > 1 小時", change: "−10", color: "text-orange-600" },
          ].map(r => (
            <div key={r.event} className="text-center bg-gray-50 rounded-xl p-3">
              <p className={`text-xl font-black ${r.color}`}>{r.change}</p>
              <p className="text-xs text-gray-500 mt-1">{r.event}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Rankings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-gray-700">
            排行榜（共 {drivers.length} 名司機）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-gray-400 text-sm">載入中...</p>
          ) : drivers.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">目前無司機資料</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {drivers.map((d, idx) => (
                <div key={d.id} className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                  <span className={`w-7 text-center font-black text-sm flex-shrink-0
                    ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-gray-300"}`}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{d.name}</span>
                      <ScoreBadge score={d.credit_score} />
                      <Badge variant="outline" className="text-xs hidden sm:inline-flex">{d.vehicle_type || "—"}</Badge>
                    </div>
                    <div className="mt-1.5">
                      <ScoreBar score={d.credit_score} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      完成 {d.completed_orders ?? 0} 單 ·
                      評分 {d.rating?.toFixed(1) ?? "—"} ({d.rating_count ?? 0} 評)
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm" variant="ghost"
                      className="text-gray-400 hover:text-blue-600"
                      onClick={() => setHistTarget(d)}
                    >
                      <History className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="text-gray-400 hover:text-purple-600"
                      onClick={() => setAdjustTarget(d)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AdjustDialog
        driver={adjustTarget}
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={load}
      />
      <HistoryDialog
        driver={histTarget}
        open={!!histTarget}
        onClose={() => setHistTarget(null)}
      />
    </div>
  );
}
