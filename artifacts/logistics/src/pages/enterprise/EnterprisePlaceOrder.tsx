import { useEffect, useState, useRef } from "react";
import { ShoppingCart, Zap, MapPin, Package, Truck, Star, Trash2, Plus, X, CheckCircle, ChevronRight, RotateCcw } from "lucide-react";
import { type EnterpriseSession } from "@/components/EnterpriseLayout";
import { type EnterpriseTemplate } from "@workspace/db";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const VEHICLE_TYPES = ["箱型車", "冷藏車", "尾門車", "平板車", "小貨車"];

const CARGO_CATEGORIES = [
  "家具 / 辦公家具",
  "家電 / 3C 電器",
  "辦公設備 / 文儀",
  "建材 / 裝潢材料",
  "食品飲料 / 生鮮",
  "服飾 / 紡織品",
  "書籍 / 文件 / 紙張",
  "電子零件 / PCB",
  "機械 / 工業零件",
  "金屬材料 / 鐵件",
  "化工原料 / 危險品",
  "醫療器材 / 藥品",
  "農產品 / 水果",
  "包裹 / 快遞物品",
  "藝術品 / 骨董",
  "展覽器材 / 展示品",
  "汽機車 / 輪胎",
  "重型機械 / 工程設備",
  "廢棄物 / 回收物",
  "原物料 / 半成品",
  "其他（備註說明）",
];

type Quote = { basePrice: number; discountPercent: number; discountAmount: number; finalPrice: number; estimatedKm: number };
type OrderForm = {
  pickupAddress: string; deliveryAddress: string; cargoDescription: string; cargoNotes: string;
  vehicleType: string; specialRequirements: string; contactName: string; contactPhone: string;
  saveTemplate: boolean; templateNickname: string;
};

export default function EnterprisePlaceOrder({ session }: { session: EnterpriseSession }) {
  const [templates, setTemplates] = useState<EnterpriseTemplate[]>([]);
  const [form, setForm] = useState<OrderForm>({
    pickupAddress: "", deliveryAddress: "", cargoDescription: "", cargoNotes: "",
    vehicleType: "箱型車", specialRequirements: "",
    contactName: session.contactPerson, contactPhone: session.phone,
    saveTemplate: false, templateNickname: "",
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showTmplForm, setShowTmplForm] = useState(false);
  const [newTmpl, setNewTmpl] = useState({ nickname: "", pickupAddress: "", deliveryAddress: "", cargoDescription: "", vehicleType: "箱型車", specialRequirements: "" });
  const [savingTmpl, setSavingTmpl] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/enterprise/${session.id}/templates`)
      .then(r => r.json()).then(setTemplates).catch(() => {});
    const pickup = sessionStorage.getItem("reorder-pickup");
    if (pickup) {
      setForm(f => ({
        ...f,
        pickupAddress: pickup,
        deliveryAddress: sessionStorage.getItem("reorder-delivery") ?? "",
        cargoDescription: sessionStorage.getItem("reorder-cargo") ?? "",
        vehicleType: sessionStorage.getItem("reorder-vehicle") ?? "箱型車",
      }));
      ["reorder-pickup","reorder-delivery","reorder-cargo","reorder-vehicle"].forEach(k => sessionStorage.removeItem(k));
    }
  }, [session.id]);

  function setF<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    if (!form.pickupAddress || !form.deliveryAddress) { setQuote(null); return; }
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => {
      setQuoting(true);
      fetch(`${BASE}/api/enterprise/${session.id}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleType: form.vehicleType, estimatedKm: 15 }),
      }).then(r => r.json()).then(setQuote).catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 600);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [form.pickupAddress, form.deliveryAddress, form.vehicleType, session.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pickupAddress || !form.deliveryAddress) { setError("請填寫取貨和送貨地址"); return; }
    setSubmitting(true); setError("");
    try {
      const submitPayload = {
        ...form,
        cargoDescription: [form.cargoDescription, form.cargoNotes].filter(Boolean).join(" — ") || "",
        totalFee: quote?.finalPrice ?? null,
      };
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/place-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitPayload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "下單失敗"); return; }
      setSuccess(data.order.id);
      setForm(f => ({ ...f, pickupAddress: "", deliveryAddress: "", cargoDescription: "", cargoNotes: "", specialRequirements: "", saveTemplate: false, templateNickname: "" }));
      setQuote(null);
      fetch(`${BASE}/api/enterprise/${session.id}/templates`).then(r => r.json()).then(setTemplates).catch(() => {});
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  async function useTemplate(t: EnterpriseTemplate) {
    fetch(`${BASE}/api/enterprise/${session.id}/templates/${t.id}/use`, { method: "PATCH" }).catch(() => {});
    setForm(f => ({
      ...f,
      pickupAddress: t.pickupAddress,
      deliveryAddress: t.deliveryAddress ?? "",
      cargoDescription: t.cargoDescription ?? "",
      vehicleType: t.vehicleType ?? "箱型車",
      specialRequirements: t.specialRequirements ?? "",
    }));
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteTemplate(id: number) {
    if (!confirm("確認刪除此範本？")) return;
    await fetch(`${BASE}/api/enterprise/${session.id}/templates/${id}`, { method: "DELETE" });
    setTemplates(ts => ts.filter(t => t.id !== id));
  }

  async function saveTmpl(e: React.FormEvent) {
    e.preventDefault(); setSavingTmpl(true);
    try {
      const res = await fetch(`${BASE}/api/enterprise/${session.id}/templates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTmpl),
      });
      const tmpl = await res.json();
      setTemplates(ts => [tmpl, ...ts]);
      setShowTmplForm(false);
      setNewTmpl({ nickname: "", pickupAddress: "", deliveryAddress: "", cargoDescription: "", vehicleType: "箱型車", specialRequirements: "" });
    } finally { setSavingTmpl(false); }
  }

  const inp = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0d2d6e]/20 focus:border-[#0d2d6e]";

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
        <ShoppingCart className="w-5 h-5 text-[#0d2d6e]" />
        快速下單
      </h1>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
          <div>
            <p className="font-bold text-emerald-800">訂單 #{success} 已成功建立！</p>
            <p className="text-emerald-600 text-xs mt-0.5">我們將盡快安排司機，您可在訂單記錄中追蹤狀態。</p>
          </div>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── Order Form ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 bg-[#0d2d6e]/10 rounded-xl flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#0d2d6e]" />
          </div>
          <h2 className="font-bold text-gray-900">新增訂單</h2>
          {session.discountPercent > 0 && (
            <span className="ml-auto text-xs font-bold bg-green-100 text-green-700 px-2.5 py-1 rounded-full">
              享有 {session.discountPercent}% 企業折扣
            </span>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">取貨地址 *</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                <input required value={form.pickupAddress} onChange={e => setF("pickupAddress", e.target.value)}
                  placeholder="請輸入完整取貨地址" className={inp.replace("px-3.5", "pl-9 pr-3.5")} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">送貨地址 *</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                <input required value={form.deliveryAddress} onChange={e => setF("deliveryAddress", e.target.value)}
                  placeholder="請輸入完整送貨地址" className={inp.replace("px-3.5", "pl-9 pr-3.5")} />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">貨物類型</label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
                <select value={form.cargoDescription} onChange={e => setF("cargoDescription", e.target.value)}
                  className={inp.replace("px-3.5", "pl-9 pr-3.5") + " bg-white"}>
                  <option value="">請選擇貨物類型…</option>
                  {CARGO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">車型需求</label>
              <div className="relative">
                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select value={form.vehicleType} onChange={e => setF("vehicleType", e.target.value)}
                  className={inp.replace("px-3.5", "pl-9 pr-3.5") + " bg-white"}>
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">貨物補充說明（選填）</label>
            <input value={form.cargoNotes} onChange={e => setF("cargoNotes", e.target.value)}
              placeholder="例：紙箱 20 箱、易碎品、請輕放" className={inp} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">特殊需求（選填）</label>
            <input value={form.specialRequirements} onChange={e => setF("specialRequirements", e.target.value)}
              placeholder="例：需搬運服務、溫控要求、到府服務" className={inp} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">聯絡人</label>
              <input value={form.contactName} onChange={e => setF("contactName", e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">聯絡電話</label>
              <input value={form.contactPhone} onChange={e => setF("contactPhone", e.target.value)} className={inp} />
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer py-1">
            <input type="checkbox" checked={form.saveTemplate} onChange={e => setF("saveTemplate", e.target.checked)}
              className="w-4 h-4 rounded accent-[#0d2d6e]" />
            <span className="text-sm text-gray-700 font-medium">儲存此設定為常用範本</span>
          </label>

          {form.saveTemplate && (
            <input value={form.templateNickname} onChange={e => setF("templateNickname", e.target.value)}
              placeholder="範本名稱（例：台北倉庫→客戶）"
              className={inp} />
          )}

          {/* Live Quote */}
          {(form.pickupAddress && form.deliveryAddress) && (
            <div className={`rounded-2xl border p-4 transition-all ${quote ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
              {quoting ? (
                <p className="text-sm text-gray-500 text-center">報價計算中...</p>
              ) : quote ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-700">即時報價（預估）</span>
                    {session.discountPercent > 0 && (
                      <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                        省 NT${quote.discountAmount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      {session.discountPercent > 0 && (
                        <p className="text-xs text-gray-500 line-through">原價 NT${quote.basePrice.toLocaleString()}</p>
                      )}
                      <p className="text-xs text-gray-500">{quote.vehicleType}・約 {quote.estimatedKm} km</p>
                    </div>
                    <p className="text-2xl font-black text-[#0d2d6e]">NT${quote.finalPrice.toLocaleString()}</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !form.pickupAddress || !form.deliveryAddress}
            className="w-full py-3.5 bg-[#0d2d6e] hover:bg-[#1a3a8f] text-white font-black text-sm rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? "建立訂單中..." : (
              <>
                <ShoppingCart className="w-4 h-4" />
                確認下單
                {quote && <span className="ml-1 opacity-80">· NT${quote.finalPrice.toLocaleString()}</span>}
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── Templates ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-orange-500" />
            常用範本
            <span className="text-gray-400 text-xs font-normal ml-1">（點選一鍵帶入表單）</span>
          </h2>
          <button onClick={() => setShowTmplForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#0d2d6e] hover:text-[#1a3a8f] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" />
            新增範本
          </button>
        </div>

        {showTmplForm && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-sm">新增常用範本</h3>
              <button onClick={() => setShowTmplForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={saveTmpl} className="space-y-3">
              <input required value={newTmpl.nickname} onChange={e => setNewTmpl(v => ({ ...v, nickname: e.target.value }))}
                placeholder="範本名稱 *" className={inp} />
              <input required value={newTmpl.pickupAddress} onChange={e => setNewTmpl(v => ({ ...v, pickupAddress: e.target.value }))}
                placeholder="取貨地址 *" className={inp} />
              <input value={newTmpl.deliveryAddress} onChange={e => setNewTmpl(v => ({ ...v, deliveryAddress: e.target.value }))}
                placeholder="送貨地址" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <input value={newTmpl.cargoDescription} onChange={e => setNewTmpl(v => ({ ...v, cargoDescription: e.target.value }))}
                  placeholder="貨品說明" className={inp} />
                <select value={newTmpl.vehicleType} onChange={e => setNewTmpl(v => ({ ...v, vehicleType: e.target.value }))}
                  className={inp + " bg-white"}>
                  {VEHICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowTmplForm(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50">取消</button>
                <button type="submit" disabled={savingTmpl}
                  className="flex-1 py-2.5 bg-[#0d2d6e] text-white text-sm font-bold rounded-xl hover:bg-[#1a3a8f] disabled:opacity-60">
                  {savingTmpl ? "儲存中..." : "儲存範本"}
                </button>
              </div>
            </form>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 text-center">
            <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-500 text-sm font-semibold">尚無常用範本</p>
            <p className="text-gray-400 text-xs mt-1">下單時可勾選「儲存為範本」，下次一鍵套用</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                      <Star className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-tight">{t.nickname}</p>
                      <p className="text-gray-400 text-xs mt-0.5">使用 {t.useCount} 次</p>
                    </div>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <MapPin className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                    <span className="truncate">{t.pickupAddress}</span>
                  </div>
                  {t.deliveryAddress && (
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <MapPin className="w-3 h-3 text-orange-400 mt-0.5 shrink-0" />
                      <span className="truncate">{t.deliveryAddress}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {t.cargoDescription && <span className="text-xs text-gray-500 flex items-center gap-1"><Package className="w-3 h-3" />{t.cargoDescription}</span>}
                    {t.vehicleType && <span className="text-xs text-gray-500 flex items-center gap-1"><Truck className="w-3 h-3" />{t.vehicleType}</span>}
                  </div>
                </div>
                <button onClick={() => useTemplate(t)}
                  className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.97] text-white font-bold text-sm py-2 rounded-xl shadow-sm shadow-orange-500/20 transition-all">
                  <RotateCcw className="w-3.5 h-3.5" />
                  帶入表單
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
