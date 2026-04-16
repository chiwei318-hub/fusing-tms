import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Calculator, Phone, Mail, Building2, CheckCircle2,
  XCircle, Clock, RefreshCw, ExternalLink,
} from "lucide-react";

interface QuoteRow {
  id: number;
  token: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  companyName: string | null;
  vehicleType: string;
  cargoName: string | null;
  cargoWeight: number | null;
  volumeCbm: number | null;
  distanceKm: number | null;
  fromAddress: string | null;
  toAddress: string | null;
  pickupDate: string | null;
  needColdChain: boolean;
  coldChainTemp: string | null;
  specialCargoes: string | null;
  totalAmount: number | null;
  status: string;
  expiresAt: string | null;
  source: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
  pending: { label: "待確認", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  confirmed: { label: "已確認", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  converted: { label: "已轉訂單", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  expired: { label: "已過期", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  cancelled: { label: "已取消", color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

function fmt(n: number | null | undefined) {
  if (n == null) return "-";
  return `NT$${n.toLocaleString()}`;
}

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小時前`;
  return `${Math.floor(h / 24)}天前`;
}

export default function QuotesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<QuoteRow | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const token = localStorage.getItem("auth-jwt");
      const res = await fetch(getApiUrl("/api/quotes"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await res.json();
      return d.quotes as QuoteRow[];
    },
    refetchInterval: 30000,
  });

  const updateMut = useMutation({
    mutationFn: async ({ token, status }: { token: string; status: string }) => {
      const jwt = localStorage.getItem("auth-jwt");
      const res = await fetch(getApiUrl(`quotes/${token}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "狀態已更新" });
      setSelected(null);
    },
  });

  const filtered = (data ?? []).filter((q) => {
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    const matchSearch =
      !search ||
      q.customerName?.includes(search) ||
      q.customerPhone?.includes(search) ||
      q.companyName?.includes(search) ||
      q.token.includes(search) ||
      q.vehicleType.includes(search);
    return matchStatus && matchSearch;
  });

  const stats = {
    pending: (data ?? []).filter((q) => q.status === "pending").length,
    confirmed: (data ?? []).filter((q) => q.status === "confirmed").length,
    converted: (data ?? []).filter((q) => q.status === "converted").length,
    total: (data ?? []).length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "待確認", val: stats.pending, color: "text-yellow-400" },
          { label: "已確認", val: stats.confirmed, color: "text-blue-400" },
          { label: "已轉訂單", val: stats.converted, color: "text-green-400" },
          { label: "全部報價", val: stats.total, color: "text-white" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="text-white/50 text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="搜尋姓名、電話、公司..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 bg-slate-800 border-slate-700 text-white text-sm"
        />
        <div className="flex gap-1 flex-wrap">
          {["all", "pending", "confirmed", "converted", "expired", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-800 border-slate-700 text-white/60 hover:text-white"
              }`}
            >
              {s === "all" ? "全部" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} className="text-white/50 hover:text-white ml-auto">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-white font-bold">{selected.customerName ?? "匿名報價"}</h3>
              <code className="text-blue-400 text-xs">{selected.token}</code>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)} className="text-white/40">✕</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              { label: "車型", val: selected.vehicleType },
              { label: "報價金額", val: fmt(selected.totalAmount) },
              { label: "距離", val: selected.distanceKm ? `${selected.distanceKm}km` : "-" },
              { label: "貨重", val: selected.cargoWeight ? `${selected.cargoWeight}kg` : "-" },
              { label: "體積", val: selected.volumeCbm ? `${selected.volumeCbm}m³` : "-" },
              { label: "取貨日期", val: selected.pickupDate ?? "-" },
              { label: "起點", val: selected.fromAddress ?? "-" },
              { label: "終點", val: selected.toAddress ?? "-" },
              ...(selected.needColdChain ? [{ label: "冷鏈溫控", val: selected.coldChainTemp ?? "是" }] : []),
              ...(selected.specialCargoes ? [{ label: "特殊貨物", val: selected.specialCargoes }] : []),
              { label: "聯絡電話", val: selected.customerPhone ?? "-" },
              { label: "Email", val: selected.customerEmail ?? "-" },
              { label: "公司", val: selected.companyName ?? "-" },
              { label: "來源", val: selected.source ?? "-" },
              { label: "建立時間", val: timeAgo(selected.createdAt) },
            ].map((row, i) => (
              <div key={i} className="space-y-0.5">
                <div className="text-white/40 text-xs">{row.label}</div>
                <div className="text-white text-sm">{row.val}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
            {selected.status === "pending" && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                onClick={() => updateMut.mutate({ token: selected.token, status: "confirmed" })}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />確認報價
              </Button>
            )}
            {(selected.status === "pending" || selected.status === "confirmed") && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs"
                onClick={() => updateMut.mutate({ token: selected.token, status: "converted" })}
              >
                <ExternalLink className="w-3 h-3 mr-1" />轉為訂單
              </Button>
            )}
            {selected.status !== "cancelled" && selected.status !== "converted" && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                onClick={() => updateMut.mutate({ token: selected.token, status: "cancelled" })}
              >
                <XCircle className="w-3 h-3 mr-1" />取消
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center text-white/40 py-12">載入中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Calculator className="w-10 h-10 text-white/20 mx-auto" />
          <p className="text-white/40">尚無報價記錄</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-white/10">
                {["建立時間", "聯絡人", "車型", "路線", "金額", "狀態", "操作"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-white/60 text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => {
                const cfg = STATUS_CONFIG[q.status] ?? { label: q.status, color: "bg-gray-500/20 text-gray-300 border-gray-500/30" };
                const isExpired = q.expiresAt && new Date(q.expiresAt) < new Date() && q.status === "pending";
                return (
                  <tr
                    key={q.id}
                    className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${selected?.id === q.id ? "bg-blue-900/20" : ""}`}
                    onClick={() => setSelected(selected?.id === q.id ? null : q)}
                  >
                    <td className="px-3 py-2 text-white/50 whitespace-nowrap">{timeAgo(q.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="text-white text-sm">{q.customerName ?? "匿名"}</div>
                      {q.customerPhone && (
                        <div className="text-white/40 text-xs flex items-center gap-1">
                          <Phone className="w-3 h-3" />{q.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-white">{q.vehicleType}</td>
                    <td className="px-3 py-2 text-white/60 text-xs max-w-32 truncate">
                      {[q.fromAddress, q.toAddress].filter(Boolean).join(" → ") || `${q.distanceKm ? q.distanceKm + "km" : "-"}`}
                    </td>
                    <td className="px-3 py-2 text-green-400 font-semibold whitespace-nowrap">{fmt(q.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <Badge className={`${cfg.color} border text-xs`}>
                        {isExpired ? "已過期" : cfg.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {q.customerPhone && (
                        <a
                          href={`tel:${q.customerPhone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
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
  );
}
