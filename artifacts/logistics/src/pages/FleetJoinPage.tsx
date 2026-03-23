import { useState } from "react";
import { Link } from "wouter";
import {
  Truck, Building2, Phone, Mail, MapPin, FileText,
  CheckCircle, ChevronRight, ChevronLeft, Shield,
  Users, DollarSign, Star, Zap, ClipboardCheck, AlertCircle
} from "lucide-react";

const VEHICLE_TYPES = ["機車", "轎車", "廂型車", "箱型車", "小貨車", "一噸半", "3.5噸", "大貨車", "冷凍車", "拖板車"];
const REGIONS = ["台北市", "新北市", "桃園市", "新竹縣市", "台中市", "彰化縣", "台南市", "高雄市", "其他縣市", "全台服務"];
const ORDER_MODES = [
  { value: "assigned", label: "指派接單", desc: "由平台根據演算法自動指派，穩定出車", icon: Zap },
  { value: "grab", label: "搶單模式", desc: "司機主動搶單，彈性靈活，適合高周轉", icon: Truck },
  { value: "bidding", label: "競標比價", desc: "參與訂單競標，透過報價爭取訂單", icon: DollarSign },
];

interface FormData {
  companyName: string;
  taxId: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  yearsInBusiness: string;
  fleetSize: string;
  vehicleTypes: string[];
  serviceRegions: string[];
  orderMode: string;
  businessLicense: string;
  insuranceDoc: string;
  notes: string;
  agreeTerms: boolean;
}

export default function FleetJoinPage() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [regId, setRegId] = useState<number | null>(null);

  const [form, setForm] = useState<FormData>({
    companyName: "", taxId: "", contactPerson: "", contactPhone: "",
    contactEmail: "", address: "", yearsInBusiness: "", fleetSize: "1",
    vehicleTypes: [], serviceRegions: [], orderMode: "grab",
    businessLicense: "", insuranceDoc: "", notes: "", agreeTerms: false,
  });

  const setF = (k: keyof FormData, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleArr = (key: "vehicleTypes" | "serviceRegions", val: string) => {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val],
    }));
  };

  const validateStep = () => {
    if (step === 1) {
      if (!form.companyName || !form.contactPerson || !form.contactPhone)
        return setError("請填寫公司名稱、聯絡人姓名與電話"), false;
      if (form.contactPhone.length < 8)
        return setError("請輸入有效的電話號碼"), false;
    }
    if (step === 2) {
      if (form.vehicleTypes.length === 0) return setError("請至少選擇一種車型"), false;
      if (form.serviceRegions.length === 0) return setError("請至少選擇一個服務地區"), false;
    }
    if (step === 4) {
      if (!form.agreeTerms) return setError("請同意服務條款"), false;
    }
    setError("");
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const prev = () => { setError(""); setStep(s => s - 1); };

  const submit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/fleet/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          taxId: form.taxId || undefined,
          contactPerson: form.contactPerson,
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail || undefined,
          address: form.address || undefined,
          yearsInBusiness: form.yearsInBusiness || undefined,
          fleetSize: Number(form.fleetSize),
          vehicleTypes: form.vehicleTypes.join(","),
          serviceRegions: form.serviceRegions.join(","),
          orderMode: form.orderMode,
          businessLicense: form.businessLicense || undefined,
          insuranceDoc: form.insuranceDoc || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "申請失敗，請稍後再試");
      setRegId(data.registration?.id ?? null);
      setSubmitted(true);
    } catch {
      setError("網路錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-black text-foreground mb-2">申請已送出！</h2>
          <p className="text-muted-foreground mb-2">我們已收到您的入駐申請</p>
          {regId && (
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-600 font-bold">申請編號</p>
              <p className="font-mono font-black text-blue-800 text-lg">FR-{String(regId).padStart(6, "0")}</p>
              <p className="text-xs text-muted-foreground mt-1">請妥善保存此編號以便查詢進度</p>
            </div>
          )}
          <div className="space-y-2 text-sm text-left mb-6">
            {[
              "平台人員將在 1-3 個工作天內與您聯繫",
              "請準備好公司設立登記證明、車輛行照",
              "審核通過後即可開始接單",
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{t}</span>
              </div>
            ))}
          </div>
          <Link href="/">
            <button className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
              回到首頁
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
      {/* Hero header */}
      <div className="pt-12 pb-8 px-4 text-center text-white">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <span className="font-black text-xl">富詠運輸</span>
        </div>
        <h1 className="text-3xl font-black mb-2">車隊/貨運公司入駐</h1>
        <p className="text-blue-200 text-base mb-6">加入全台最大物流平台，穩定訂單 · 透明收益 · 智慧派車</p>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
          {[
            { icon: DollarSign, title: "穩定收益", desc: "月結/即付" },
            { icon: Zap, title: "智慧調度", desc: "AI 最佳化" },
            { icon: Shield, title: "風險保障", desc: "投保保障" },
          ].map((b, i) => (
            <div key={i} className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
              <b.icon className="w-6 h-6 text-yellow-300 mx-auto mb-1" />
              <p className="font-bold text-sm text-white">{b.title}</p>
              <p className="text-blue-200 text-xs">{b.desc}</p>
            </div>
          ))}
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
          {["基本資料", "車隊資訊", "接單設定", "確認送出"].map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                step > i + 1 ? "bg-green-400 text-white" : step === i + 1 ? "bg-white text-blue-800" : "bg-white/20 text-white/50"
              }`}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              {i < 3 && <div className={`w-5 h-0.5 ${step > i + 1 ? "bg-green-400" : "bg-white/20"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Form card */}
      <div className="max-w-lg mx-auto px-4 pb-12">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6">

            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" /> 公司基本資料
                </h2>
                <div>
                  <label className="text-sm font-bold mb-1 block">公司名稱 *</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="例：台灣快運有限公司"
                    value={form.companyName}
                    onChange={e => setF("companyName", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">統一編號</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="12345678（可選填）"
                    value={form.taxId}
                    onChange={e => setF("taxId", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-bold mb-1 block">聯絡人姓名 *</label>
                    <input
                      className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="王大明"
                      value={form.contactPerson}
                      onChange={e => setF("contactPerson", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold mb-1 block">聯絡電話 *</label>
                    <input
                      className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0912-345-678"
                      value={form.contactPhone}
                      onChange={e => setF("contactPhone", e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">Email</label>
                  <input
                    type="email"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="info@company.com"
                    value={form.contactEmail}
                    onChange={e => setF("contactEmail", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">公司地址</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="台北市中正區忠孝東路..."
                    value={form.address}
                    onChange={e => setF("address", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold mb-1 block">營業年數</label>
                  <select
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={form.yearsInBusiness}
                    onChange={e => setF("yearsInBusiness", e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {["未滿1年", "1-3年", "3-5年", "5-10年", "10年以上"].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Fleet Info */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" /> 車隊資訊
                </h2>
                <div>
                  <label className="text-sm font-bold mb-1 block">車輛數量</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="5"
                    value={form.fleetSize}
                    onChange={e => setF("fleetSize", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold mb-2 block">車輛類型 * <span className="font-normal text-muted-foreground">（可複選）</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {VEHICLE_TYPES.map(t => (
                      <label key={t} className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-all ${
                        form.vehicleTypes.includes(t) ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.vehicleTypes.includes(t)}
                          onChange={() => toggleArr("vehicleTypes", t)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm font-medium">{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold mb-2 block">服務地區 * <span className="font-normal text-muted-foreground">（可複選）</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {REGIONS.map(r => (
                      <label key={r} className={`flex items-center gap-2 p-2.5 border rounded-xl cursor-pointer transition-all ${
                        form.serviceRegions.includes(r) ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.serviceRegions.includes(r)}
                          onChange={() => toggleArr("serviceRegions", r)}
                          className="accent-blue-600"
                        />
                        <span className="text-sm font-medium">{r}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Order Mode */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-blue-600" /> 接單模式設定
                </h2>
                <p className="text-sm text-muted-foreground">選擇最適合您車隊的接單方式</p>

                <div className="space-y-3">
                  {ORDER_MODES.map(mode => (
                    <label key={mode.value} className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      form.orderMode === mode.value ? "border-blue-500 bg-blue-50" : "border-border hover:bg-muted/30"
                    }`}>
                      <input
                        type="radio"
                        name="orderMode"
                        value={mode.value}
                        checked={form.orderMode === mode.value}
                        onChange={e => setF("orderMode", e.target.value)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <mode.icon className="w-4 h-4 text-blue-600" />
                          <span className="font-bold text-sm">{mode.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{mode.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-bold text-sm mb-3 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-muted-foreground" /> 相關文件（選填）
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block text-muted-foreground">營業登記證號 / 文件連結</label>
                      <input
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="文件號碼或 Google Drive 分享連結"
                        value={form.businessLicense}
                        onChange={e => setF("businessLicense", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block text-muted-foreground">車輛保險文件連結</label>
                      <input
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="保險文件連結"
                        value={form.insuranceDoc}
                        onChange={e => setF("insuranceDoc", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block text-muted-foreground">補充說明</label>
                      <textarea
                        className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                        rows={3}
                        placeholder="特殊服務、冷凍車輛、特定航線等補充資訊..."
                        value={form.notes}
                        onChange={e => setF("notes", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Confirm */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-xl font-black flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" /> 確認申請資料
                </h2>

                <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
                  {[
                    ["公司名稱", form.companyName],
                    ["統一編號", form.taxId || "（未填）"],
                    ["聯絡人", form.contactPerson],
                    ["聯絡電話", form.contactPhone],
                    ["Email", form.contactEmail || "（未填）"],
                    ["車輛數量", `${form.fleetSize} 輛`],
                    ["車輛類型", form.vehicleTypes.join("、") || "（未選）"],
                    ["服務地區", form.serviceRegions.join("、") || "（未選）"],
                    ["接單模式", ORDER_MODES.find(m => m.value === form.orderMode)?.label ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
                      <span className="font-medium break-all">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Terms */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="font-bold text-sm text-amber-800 mb-2 flex items-center gap-1.5">
                    <Shield className="w-4 h-4" /> 服務條款重點
                  </h3>
                  <ul className="text-xs text-amber-700 space-y-1 list-disc ml-3">
                    <li>平台依完成訂單金額收取 {20}% 服務抽成（正式合約可協商）</li>
                    <li>司機/車輛需通過平台審核始可出車</li>
                    <li>每月結算，次月10日前撥款</li>
                    <li>違規出車或服務品質不符標準，平台有權暫停接單資格</li>
                    <li>客訴問題需於 48 小時內配合處理</li>
                  </ul>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agreeTerms}
                    onChange={e => setF("agreeTerms", e.target.checked)}
                    className="mt-0.5 accent-blue-600 w-4 h-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    我已閱讀並同意富詠運輸平台的{" "}
                    <span className="text-blue-600 font-bold">服務條款</span>
                    {" "}與{" "}
                    <span className="text-blue-600 font-bold">隱私政策</span>
                  </span>
                </label>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-600 bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="border-t bg-muted/20 px-6 py-4 flex gap-3">
            {step > 1 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 px-4 py-2.5 border rounded-xl text-sm font-bold hover:bg-muted transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> 上一步
              </button>
            )}
            <button
              onClick={step < 4 ? next : submit}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? "送出中..." : step < 4 ? "下一步" : "送出申請"}
              {!loading && step < 4 && <ChevronRight className="w-4 h-4" />}
              {!loading && step === 4 && <CheckCircle className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Benefits footer */}
        <div className="mt-6 grid grid-cols-2 gap-3 text-white/80 text-xs text-center">
          {[
            { icon: Users, text: "5,000+ 合作司機" },
            { icon: Star, text: "4.8 平均評分" },
            { icon: DollarSign, text: "月結準時撥款" },
            { icon: Shield, text: "全程投保保障" },
          ].map((b, i) => (
            <div key={i} className="flex items-center justify-center gap-1.5">
              <b.icon className="w-3.5 h-3.5" /> {b.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
