import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Zap, Plus, Trash2, Star, MapPin, Package, Truck, ChevronRight, X } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";
import { type EnterpriseTemplate } from "@workspace/db";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const VEHICLE_TYPES = ["箱型車", "冷藏車", "尾門車", "平板車", "小貨車"];

export default function EnterpriseQuickOrder({ session }: { session: EnterpriseSession }) {
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<EnterpriseTemplate[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newTmpl, setNewTmpl] = useState({
    nickname: "", pickupAddress: "", deliveryAddress: "",
    cargoDescription: "", vehicleType: "箱型車", specialRequirements: "",
  });

  useEffect(() => {
    fetch(`${BASE}/api/enterprise/${session.id}/templates`)
      .then(r => r.json()).then(setTemplates).catch(() => {});
  }, [session.id]);

  async function useTemplate(t: EnterpriseTemplate) {
    // Increment use count
    fetch(`${BASE}/api/enterprise/${session.id}/templates/${t.id}/use`, { method: "PATCH" }).catch(() => {});
    // Pre-fill sessionStorage and navigate to customer order form
    sessionStorage.setItem("quick-order-address", t.pickupAddress);
    sessionStorage.setItem("quick-order-delivery", t.deliveryAddress ?? "");
    sessionStorage.setItem("quick-order-cargo", t.cargoDescription ?? "");
    sessionStorage.setItem("quick-order-vehicle", t.vehicleType ?? "");
    sessionStorage.setItem("quick-order-phone", session.phone);
    sessionStorage.setItem("quick-order-company", session.companyName);
    navigate("/customer/order");
  }

  async function deleteTemplate(id: number) {
    if (!confirm("確認刪除此範本？")) return;
    await fetch(`${BASE}/api/enterprise/${session.id}/templates/${id}`, { method: "DELETE" });
    setTemplates(ts => ts.filter(t => t.id !== id));
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTmpl),
      });
      const tmpl = await res.json();
      setTemplates(ts => [tmpl, ...ts]);
      setShowAddForm(false);
      setNewTmpl({ nickname: "", pickupAddress: "", deliveryAddress: "", cargoDescription: "", vehicleType: "箱型車", specialRequirements: "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          快速下單
        </h1>
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-[#0d2d6e] hover:bg-[#1a3a8f] text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-[0.97]">
          <Plus className="w-4 h-4" />
          新增範本
        </button>
      </div>

      {/* Explanation */}
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-sm text-orange-700">
        <p className="font-semibold mb-1">一鍵重複下單</p>
        <p className="text-orange-600/80">儲存常用地址與貨品設定，下次直接點選即可下單，不需重複填寫。</p>
      </div>

      {/* Add template form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">新增常用範本</h2>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={saveTemplate} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">範本名稱 *</label>
              <input required value={newTmpl.nickname} onChange={e => setNewTmpl(v => ({ ...v, nickname: e.target.value }))}
                placeholder="例：倉庫到台北客戶端"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">取貨地址 *</label>
              <input required value={newTmpl.pickupAddress} onChange={e => setNewTmpl(v => ({ ...v, pickupAddress: e.target.value }))}
                placeholder="完整取貨地址"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">送貨地址</label>
              <input value={newTmpl.deliveryAddress} onChange={e => setNewTmpl(v => ({ ...v, deliveryAddress: e.target.value }))}
                placeholder="完整送貨地址"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">貨品說明</label>
                <input value={newTmpl.cargoDescription} onChange={e => setNewTmpl(v => ({ ...v, cargoDescription: e.target.value }))}
                  placeholder="貨品描述"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">車型</label>
                <select value={newTmpl.vehicleType} onChange={e => setNewTmpl(v => ({ ...v, vehicleType: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e] bg-white">
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">特殊需求</label>
              <input value={newTmpl.specialRequirements} onChange={e => setNewTmpl(v => ({ ...v, specialRequirements: e.target.value }))}
                placeholder="例：需搬運服務、冷藏"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAddForm(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-[#0d2d6e] text-white text-sm font-bold rounded-xl hover:bg-[#1a3a8f] transition-colors disabled:opacity-60">
                {saving ? "儲存中..." : "儲存範本"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 && !showAddForm ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <Zap className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-semibold text-sm">尚無常用範本</p>
          <p className="text-gray-400 text-xs mt-1">點擊「新增範本」儲存您的常用下單設定</p>
          <button onClick={() => setShowAddForm(true)}
            className="mt-4 inline-flex items-center gap-2 bg-orange-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors">
            <Plus className="w-4 h-4" /> 立即新增
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map(t => (
            <div key={t.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all group">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-tight">{t.nickname}</p>
                    <p className="text-gray-400 text-xs mt-0.5">已使用 {t.useCount} 次</p>
                  </div>
                </div>
                <button onClick={() => deleteTemplate(t.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 mb-4">
                <div className="flex items-start gap-2 text-xs text-gray-600">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                  <span className="truncate">{t.pickupAddress}</span>
                </div>
                {t.deliveryAddress && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <MapPin className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                    <span className="truncate">{t.deliveryAddress}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {t.cargoDescription && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Package className="w-3 h-3" /> {t.cargoDescription}
                    </span>
                  )}
                  {t.vehicleType && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Truck className="w-3 h-3" /> {t.vehicleType}
                    </span>
                  )}
                </div>
              </div>

              <button onClick={() => useTemplate(t)}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.97] text-white font-bold text-sm py-2.5 rounded-xl shadow-sm shadow-orange-500/20 transition-all">
                <Zap className="w-4 h-4" />
                一鍵下單
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
