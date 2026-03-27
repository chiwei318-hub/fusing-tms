import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Upload, FileText, Truck, User, Shield,
  ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle,
  Phone, MapPin, Banknote, Settings, CreditCard, Award,
  Clock, Calendar,
} from "lucide-react";
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";

const API = import.meta.env.BASE_URL + "api";

// ─── Constants ─────────────────────────────────────────────────────────────────

const LICENSE_TYPES = [
  "普通小型車",
  "普通大型車",
  "職業小型車",
  "職業大型車",
  "職業聯結車",
  "普通重型機車",
];

const OTHER_LICENSES = [
  { id: "dangerous_goods_a", label: "甲種危險物品運送人員訓練證" },
  { id: "dangerous_goods_b", label: "乙種危險物品運送人員訓練證" },
  { id: "forklift", label: "堆高機（推高機）操作人員執照" },
  { id: "cold_chain", label: "低溫冷鏈食品運送認證" },
  { id: "precision", label: "精密儀器運送認證" },
  { id: "special_cargo", label: "特殊貨物運送許可" },
  { id: "adr", label: "ADR 危險品運送國際認證" },
];

const VEHICLE_TYPES = ["小貨車", "箱型車", "平板車", "冷藏車", "尾門車", "曳引車", "鋼板車", "吊車"];
const TONNAGE_OPTIONS = ["0.5噸", "1噸", "1.5噸", "2噸", "3.5噸", "5噸", "7噸", "10噸", "20噸以上"];

const SERVICE_REGIONS = [
  "台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "台東縣", "澎湖縣", "金門縣", "連江縣", "全台灣",
];

const AVAILABLE_HOURS = [
  { id: "midnight", label: "凌晨 00:00–06:00", icon: "🌙" },
  { id: "morning",  label: "早上 06:00–12:00", icon: "🌅" },
  { id: "afternoon",label: "下午 12:00–18:00", icon: "☀️" },
  { id: "evening",  label: "晚上 18:00–24:00", icon: "🌆" },
];

const DOC_TYPES = [
  { key: "driver_license",      label: "駕照正本",        required: true,  hint: "清晰正面彩色照片",         hasExpiry: true },
  { key: "id_card",             label: "身分證正反面",      required: true,  hint: "正反面合一照片，四角清晰", hasExpiry: false },
  { key: "vehicle_reg",         label: "行車執照",         required: true,  hint: "車輛行照，需顯示車牌",      hasExpiry: true },
  { key: "insurance",           label: "汽車強制責任險",   required: true,  hint: "需在有效期內",              hasExpiry: true },
  { key: "vehicle_photo_front", label: "車輛正面照",       required: true,  hint: "清晰顯示車牌號碼",          hasExpiry: false },
  { key: "vehicle_photo_side",  label: "車輛側面照",       required: false, hint: "顯示車體狀況（選填）",      hasExpiry: false },
  { key: "other_cert",          label: "其他專業證照",     required: false, hint: "如危險物品證照等（選填）",  hasExpiry: false },
];

const BANK_LIST = [
  "台灣銀行", "合作金庫", "第一銀行", "華南銀行", "彰化銀行",
  "台北富邦", "國泰世華", "玉山銀行", "中信銀行", "台新銀行",
  "永豐銀行", "遠東銀行", "郵局（劃撥）", "其他",
];

const STEPS = [
  { id: 1, label: "基本資料",   icon: User,        color: "text-blue-600"   },
  { id: 2, label: "駕駛資格",   icon: Award,       color: "text-indigo-600" },
  { id: 3, label: "車輛資料",   icon: Truck,       color: "text-emerald-600"},
  { id: 4, label: "文件上傳",   icon: FileText,    color: "text-amber-600"  },
  { id: 5, label: "接單設定",   icon: Settings,    color: "text-violet-600" },
  { id: 6, label: "金流資料",   icon: CreditCard,  color: "text-rose-600"   },
  { id: 7, label: "合約送出",   icon: Shield,      color: "text-gray-600"   },
];

const CONTRACT_TEXT = `富詠運輸 司機合作條款 v2.0

一、合作性質
本合作為非僱傭關係，加盟司機以獨立承攬方式合作。

二、接單規範
1. 接單後須於 5 分鐘內確認，未確認視同放棄。
2. 不得無故取消已確認訂單。取消率超過 10% 將限制接單。
3. 必須遵守取送貨時間承諾。

三、服務品質
1. 須穿著整潔，態度良好對待客戶。
2. 貨物裝卸須謹慎，若因疏失造成損壞須負賠償責任。
3. 客戶評分低於 3.5 分（5 分制）連續 3 個月，將暫停接單。

四、費用結算
1. 每筆訂單平台抽佣 15%。
2. 每月 5 日前結算上月款項，以銀行轉帳發放。

五、文件維護
1. 駕照、行照、保險須隨時在有效期內。
2. 文件過期須於 7 天內更新，否則暫停接單。

六、禁止行為
1. 酒後或藥物影響下不得接單。
2. 不得私下與客戶直接交易繞過平台。
3. 不得操縱評分或惡意取消。

七、隱私保護
本平台依個資法保護司機個人資料，僅於必要業務範圍內使用。

八、終止合作
雙方均可提前 7 天書面通知終止合作。平台有權因違規立即終止合作。

九、爭議處理
以中華民國法律為準，以台灣台北地方法院為第一審管轄法院。`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocData {
  filename: string; fileData: string;
  fileSize: number; mimeType: string; expiryDate: string;
}

interface FormState {
  // Step 1
  name: string; phone: string; idNumber: string; address: string; email: string;
  // Step 2
  licenseType: string; licenseNumber: string; licenseExpiry: string;
  otherLicenses: string[];
  // Step 3
  vehicleType: string; vehicleTonnage: string; maxLoadKg: string;
  licensePlate: string; vehicleYear: string; vehicleBodyType: string;
  hasTailgate: boolean; hasRefrigeration: boolean; hasHydraulicPallet: boolean;
  hasGps: boolean; hasDashcam: boolean;
  // Step 4 (docs)
  docs: Record<string, DocData>;
  // Step 5
  serviceRegions: string[]; availableHours: string[];
  earliestStartDate: string;
  // Step 6
  bankName: string; bankBranch: string;
  bankAccount: string; bankAccountName: string;
  paymentMethod: string;
  // Step 7
  agreedToTerms: boolean; signedName: string;
}

// ─── DocUpload Component ────────────────────────────────────────────────────────

function DocUpload({ docKey, label, required, hint, hasExpiry, value, onChange }: {
  docKey: string; label: string; required: boolean; hint: string; hasExpiry: boolean;
  value?: DocData; onChange: (data: DocData) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("檔案大小不能超過 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (file.type.startsWith("image/")) setPreview(base64);
      onChange({ filename: file.name, fileData: base64, fileSize: file.size, mimeType: file.type, expiryDate: value?.expiryDate ?? "" });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        {value?.filename && (
          <span className="text-[11px] text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />{value.filename}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <div
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all hover:bg-muted/20
          ${value?.filename ? "border-green-400 bg-green-50" : "border-muted-foreground/25 hover:border-primary/40"}`}
      >
        {preview ? (
          <img src={preview} alt={label} className="max-h-28 mx-auto rounded-lg object-contain" />
        ) : value?.filename && !preview ? (
          <div className="flex items-center justify-center gap-2 text-green-600 py-2">
            <FileText className="w-5 h-5" />
            <span className="text-sm font-medium">{value.filename}</span>
          </div>
        ) : (
          <div className="py-3 space-y-1">
            <Upload className="w-6 h-6 mx-auto text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">點擊上傳或拍照</p>
            <p className="text-[10px] text-muted-foreground/60">JPG · PNG · PDF，最大 5MB</p>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
      {hasExpiry && (
        <div>
          <Label className="text-xs text-muted-foreground">到期日</Label>
          <Input type="date" className="mt-1 h-8 text-xs"
            value={value?.expiryDate ?? ""}
            onChange={e => value && onChange({ ...value, expiryDate: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Checkbox Toggle ────────────────────────────────────────────────────────────

function CheckToggle({ checked, onChange, label, desc }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string;
}) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
      ${checked ? "border-primary bg-primary/5" : "border-border hover:border-gray-300"}`}>
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors
        ${checked ? "bg-primary border-primary" : "border-gray-300"}`}>
        {checked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div>
        <p className="text-sm font-medium leading-tight">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
    </label>
  );
}

// ─── Status Check ───────────────────────────────────────────────────────────────

function StatusCheck() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const statusMap: Record<string, { label: string; color: string; icon: string }> = {
    pending:  { label: "審核中", color: "text-amber-600", icon: "⏳" },
    approved: { label: "已通過", color: "text-green-600", icon: "✅" },
    rejected: { label: "已退件", color: "text-red-500",   icon: "❌" },
  };
  async function check() {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/driver-applications/status/${encodeURIComponent(phone)}`);
      setResult(r.ok ? await r.json() : { error: "找不到記錄" });
    } catch { setResult({ error: "查詢失敗" }); }
    finally { setLoading(false); }
  }
  return (
    <div className="bg-muted/30 rounded-xl p-4 space-y-3 border">
      <p className="text-sm font-semibold flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-500" /> 查詢申請進度
      </p>
      <div className="flex gap-2">
        <Input placeholder="申請時使用的手機號碼" value={phone} onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === "Enter" && check()} className="h-9 text-sm" />
        <Button size="sm" variant="outline" onClick={check} disabled={loading || !phone}>查詢</Button>
      </div>
      {result && !result.error && (
        <div className="bg-white rounded-xl border p-3 space-y-1 text-sm">
          <div className="font-bold">{result.name}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">狀態：</span>
            <span className={`font-bold ${statusMap[result.status]?.color}`}>
              {statusMap[result.status]?.icon} {statusMap[result.status]?.label ?? result.status}
            </span>
          </div>
          {result.rejection_reason && (
            <p className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">退件原因：{result.rejection_reason}</p>
          )}
          {result.contract_signed && (
            <p className="text-green-600 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />合約已簽署</p>
          )}
        </div>
      )}
      {result?.error && <p className="text-red-500 text-xs">{result.error}</p>}
    </div>
  );
}

// ─── Eye icon component ─────────────────────────────────────────────────────────

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground">
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function DriverJoinPage() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [appId, setAppId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showContractText, setShowContractText] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: "", phone: "", idNumber: "", address: "", email: "",
    licenseType: "", licenseNumber: "", licenseExpiry: "", otherLicenses: [],
    vehicleType: "", vehicleTonnage: "", maxLoadKg: "", licensePlate: "",
    vehicleYear: "", vehicleBodyType: "一般", hasTailgate: false, hasRefrigeration: false,
    hasHydraulicPallet: false, hasGps: false, hasDashcam: false,
    docs: {},
    serviceRegions: [], availableHours: [], earliestStartDate: "",
    bankName: "", bankBranch: "", bankAccount: "", bankAccountName: "", paymentMethod: "transfer",
    agreedToTerms: false, signedName: "",
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleArray(key: "otherLicenses" | "serviceRegions" | "availableHours", val: string) {
    setForm(f => {
      const arr = f[key] as string[];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }

  function setDoc(key: string, data: DocData) {
    setForm(f => ({ ...f, docs: { ...f.docs, [key]: data } }));
  }

  function canProceed(): boolean {
    if (step === 1) return !!(form.name.trim() && form.phone.trim() && form.idNumber.trim() && form.address.trim());
    if (step === 2) return !!(form.licenseType && form.licenseNumber.trim() && form.licenseExpiry);
    if (step === 3) return !!(form.vehicleType && form.licensePlate.trim());
    if (step === 4) {
      const req = DOC_TYPES.filter(d => d.required).map(d => d.key);
      return req.every(k => !!form.docs[k]?.fileData);
    }
    if (step === 5) return form.serviceRegions.length > 0 && form.availableHours.length > 0;
    if (step === 6) return !!(form.bankName && form.bankAccount.trim() && form.bankAccountName.trim());
    if (step === 7) return !!(form.agreedToTerms && form.signedName.trim());
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const appRes = await fetch(`${API}/driver-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, phone: form.phone, idNumber: form.idNumber,
          address: form.address, email: form.email,
          licenseType: form.licenseType, licenseNumber: form.licenseNumber,
          licenseExpiry: form.licenseExpiry || undefined,
          otherLicenses: form.otherLicenses,
          vehicleType: form.vehicleType, vehicleTonnage: form.vehicleTonnage,
          maxLoadKg: parseFloat(form.maxLoadKg) || undefined,
          licensePlate: form.licensePlate,
          vehicleYear: parseInt(form.vehicleYear) || undefined,
          vehicleBodyType: form.vehicleBodyType,
          hasTailgate: form.hasTailgate, hasRefrigeration: form.hasRefrigeration,
          hasHydraulicPallet: form.hasHydraulicPallet,
          hasGps: form.hasGps, hasDashcam: form.hasDashcam,
          serviceRegions: form.serviceRegions, availableHours: form.availableHours,
          earliestStartDate: form.earliestStartDate || undefined,
          bankName: form.bankName, bankBranch: form.bankBranch,
          bankAccount: form.bankAccount, bankAccountName: form.bankAccountName,
          paymentMethod: form.paymentMethod,
        }),
      });
      const appData = await appRes.json();
      if (!appRes.ok) {
        toast({ title: "申請失敗", description: appData.error, variant: "destructive" });
        return;
      }
      const newAppId = appData.applicationId;
      setAppId(newAppId);

      for (const [docKey, docData] of Object.entries(form.docs)) {
        await fetch(`${API}/driver-applications/${newAppId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docType: docKey, docLabel: DOC_TYPES.find(d => d.key === docKey)?.label, ...docData }),
        });
      }

      await fetch(`${API}/driver-applications/${newAppId}/sign-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreedToTerms: true, signedName: form.signedName }),
      });

      setStep(8);
    } finally { setSubmitting(false); }
  }

  // ── Step renderers ──────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<User className="w-5 h-5 text-blue-500" />} title="基本資料" sub="請確保所有資訊與證件一致" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">姓名 <Req /></Label>
            <Input className="mt-1" placeholder="王大明" autoComplete="name" value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">手機號碼 <Req /></Label>
            <Input className="mt-1" placeholder="09xx-xxx-xxx" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">身分證字號 <Req /></Label>
            <Input className="mt-1 uppercase font-mono" placeholder="A123456789" maxLength={10} autoComplete="off"
              value={form.idNumber} onChange={e => set("idNumber", e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label className="text-sm">電子郵件（選填）</Label>
            <Input className="mt-1" type="email" placeholder="example@mail.com" inputMode="email" autoComplete="email"
              value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-sm mb-1.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-500" /> 居住地址 <Req />
          </Label>
          <TaiwanAddressInput value={form.address} onChange={v => set("address", v)} historyKey="driver-join-addr" />
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<Award className="w-5 h-5 text-indigo-500" />} title="駕駛資格" sub="請確保駕照在有效期內" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <Label className="text-sm">駕照類型 <Req /></Label>
            <Select value={form.licenseType} onValueChange={v => set("licenseType", v)}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue placeholder="請選擇" />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label className="text-sm">駕照號碼 <Req /></Label>
            <Input className="mt-1 font-mono uppercase" placeholder="A12345678"
              value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value.toUpperCase())} />
          </div>
          <div className="sm:col-span-1">
            <Label className="text-sm">有效期限 <Req /></Label>
            <Input className="mt-1" type="date"
              value={form.licenseExpiry} onChange={e => set("licenseExpiry", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-sm mb-3 block flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-indigo-500" /> 備有其他專業證照（可多選）
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OTHER_LICENSES.map(lic => (
              <CheckToggle key={lic.id} label={lic.label}
                checked={form.otherLicenses.includes(lic.id)}
                onChange={() => toggleArray("otherLicenses", lic.id)} />
            ))}
          </div>
        </div>
        {form.otherLicenses.length > 0 && (
          <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700">
            已選 {form.otherLicenses.length} 項專業證照，請在第 4 步驟上傳相關文件。
          </div>
        )}
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<Truck className="w-5 h-5 text-emerald-500" />} title="車輛資料" sub="以主要使用車輛為準" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-sm">車型 <Req /></Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              {VEHICLE_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("vehicleType", t)}
                  className={`py-2 px-2 rounded-xl border-2 text-xs font-bold transition-all text-center
                    ${form.vehicleType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border hover:border-gray-300"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <Label className="text-sm">噸數</Label>
            <Select value={form.vehicleTonnage} onValueChange={v => set("vehicleTonnage", v)}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue placeholder="請選擇" />
              </SelectTrigger>
              <SelectContent>
                {TONNAGE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-sm">車牌號碼 <Req /></Label>
            <Input className="mt-1 font-mono uppercase" placeholder="ABC-1234"
              value={form.licensePlate} onChange={e => set("licensePlate", e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label className="text-sm">出廠年份</Label>
            <Input className="mt-1" type="number" placeholder="2020" min="1990" max={new Date().getFullYear()}
              value={form.vehicleYear} onChange={e => set("vehicleYear", e.target.value)} />
          </div>
          <div>
            <Label className="text-sm">最大載重 (kg)</Label>
            <Input className="mt-1" type="number" placeholder="2000" min="100"
              value={form.maxLoadKg} onChange={e => set("maxLoadKg", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-sm mb-3 block">車輛設備</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CheckToggle checked={form.hasTailgate}      onChange={v => set("hasTailgate", v)}      label="尾門設備"       desc="液壓尾門，便於重物裝卸" />
            <CheckToggle checked={form.hasRefrigeration} onChange={v => set("hasRefrigeration", v)} label="冷藏／冷凍設備"  desc="適合生鮮食品運送" />
            <CheckToggle checked={form.hasHydraulicPallet} onChange={v => set("hasHydraulicPallet", v)} label="液壓托板車"  desc="堆高機輔助設備" />
            <CheckToggle checked={form.hasGps}           onChange={v => set("hasGps", v)}           label="GPS 追蹤系統"    desc="即時定位追蹤功能" />
            <CheckToggle checked={form.hasDashcam}       onChange={v => set("hasDashcam", v)}       label="行車記錄器"      desc="前後雙鏡頭更佳" />
          </div>
        </div>
      </div>
    );
  }

  function renderStep4() {
    const req = DOC_TYPES.filter(d => d.required).map(d => d.key);
    const uploaded = req.filter(k => !!form.docs[k]?.fileData).length;
    return (
      <div className="space-y-5">
        <SectionTitle icon={<FileText className="w-5 h-5 text-amber-500" />} title="文件上傳" sub={`必要文件 ${uploaded}/${req.length} 份已上傳`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {DOC_TYPES.map(dt => (
            <DocUpload key={dt.key} docKey={dt.key} label={dt.label} required={dt.required}
              hint={dt.hint} hasExpiry={dt.hasExpiry}
              value={form.docs[dt.key]}
              onChange={data => setDoc(dt.key, data)} />
          ))}
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>所有文件照片須清晰、無遮擋，文字可辨讀。模糊或過期文件將導致申請退件。</p>
        </div>
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<Settings className="w-5 h-5 text-violet-500" />} title="接單設定" sub="設定您的服務範圍與可接時段" />
        <div>
          <Label className="text-sm mb-3 block flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> 服務區域 <Req /> <span className="font-normal text-muted-foreground text-xs">（可多選）</span>
          </Label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {SERVICE_REGIONS.map(r => (
              <button key={r} type="button" onClick={() => toggleArray("serviceRegions", r)}
                className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-center
                  ${form.serviceRegions.includes(r)
                    ? "border-violet-500 bg-violet-50 text-violet-700"
                    : "border-border hover:border-gray-300 text-muted-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
          {form.serviceRegions.length > 0 && (
            <p className="text-xs text-violet-600 mt-2">已選：{form.serviceRegions.join("、")}</p>
          )}
        </div>
        <div>
          <Label className="text-sm mb-3 block flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> 可接單時段 <Req /> <span className="font-normal text-muted-foreground text-xs">（可多選）</span>
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AVAILABLE_HOURS.map(h => (
              <CheckToggle key={h.id} label={`${h.icon} ${h.label}`}
                checked={form.availableHours.includes(h.id)}
                onChange={() => toggleArray("availableHours", h.id)} />
            ))}
          </div>
        </div>
        <div className="max-w-xs">
          <Label className="text-sm flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> 最快可上線日期
          </Label>
          <Input className="mt-1" type="date"
            min={new Date().toISOString().split("T")[0]}
            value={form.earliestStartDate}
            onChange={e => set("earliestStartDate", e.target.value)} />
        </div>
      </div>
    );
  }

  function renderStep6() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<CreditCard className="w-5 h-5 text-rose-500" />} title="金流資料" sub="設定收款資訊，每月 5 日結算上月款項" />
        <div>
          <Label className="text-sm mb-2 block">收款方式</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "transfer", label: "銀行轉帳", icon: "🏦", desc: "最快 1 個工作日到帳" },
              { id: "post",     label: "郵局匯款", icon: "📮", desc: "郵局帳戶收款" },
            ].map(m => (
              <button key={m.id} type="button" onClick={() => set("paymentMethod", m.id)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-center transition-all
                  ${form.paymentMethod === m.id ? "border-rose-500 bg-rose-50" : "border-border hover:border-gray-300"}`}>
                <span className="text-2xl">{m.icon}</span>
                <span className="text-xs font-bold">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <Label className="text-sm">銀行名稱 <Req /></Label>
            <Select value={form.bankName} onValueChange={v => set("bankName", v)}>
              <SelectTrigger className="mt-1 h-10">
                <SelectValue placeholder="請選擇" />
              </SelectTrigger>
              <SelectContent>
                {BANK_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-sm">分行名稱</Label>
            <Input className="mt-1" placeholder="例：台北信義分行"
              value={form.bankBranch} onChange={e => set("bankBranch", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-sm">帳號 <Req /></Label>
            <div className="relative mt-1">
              <Input className="font-mono pr-10" type={showAccount ? "text" : "password"}
                placeholder="銀行帳號" value={form.bankAccount}
                onChange={e => set("bankAccount", e.target.value)} />
              <EyeToggle show={showAccount} onToggle={() => setShowAccount(s => !s)} />
            </div>
          </div>
          <div className="col-span-2">
            <Label className="text-sm">戶名 <Req /></Label>
            <Input className="mt-1" placeholder="與存摺完全相同的戶名"
              value={form.bankAccountName} onChange={e => set("bankAccountName", e.target.value)} />
          </div>
        </div>
        <div className="bg-rose-50 rounded-xl p-3 text-xs text-rose-700 flex items-start gap-2">
          <Shield className="w-4 h-4 shrink-0 mt-0.5" />
          <p>帳戶資訊受到加密保護，僅用於薪資發放，不會用於其他用途。</p>
        </div>
      </div>
    );
  }

  function renderStep7() {
    return (
      <div className="space-y-5">
        <SectionTitle icon={<Shield className="w-5 h-5 text-gray-600" />} title="合約簽署與送出" sub="請詳閱條款後簽名確認" />
        <div className="border rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowContractText(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold bg-muted/30 hover:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> 富詠運輸司機合作條款 v2.0</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showContractText ? "rotate-90" : ""}`} />
          </button>
          {showContractText && (
            <pre className="p-4 text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto bg-background border-t">
              {CONTRACT_TEXT}
            </pre>
          )}
        </div>
        <CheckToggle checked={form.agreedToTerms} onChange={v => set("agreedToTerms", v)}
          label="我已詳細閱讀並同意上述合作條款"
          desc="包含接單規範、費用結算、服務品質要求等所有條款" />
        <div>
          <Label className="text-sm">電子簽名（本人姓名） <Req /></Label>
          <Input className="mt-1" placeholder="請輸入本人姓名以確認簽署"
            value={form.signedName} onChange={e => set("signedName", e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">電子簽名與個人資料一致即視為有效簽署</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">申請摘要</p>
          <div className="grid grid-cols-2 gap-1">
            <span>姓名：</span><span className="font-medium">{form.name}</span>
            <span>電話：</span><span className="font-medium">{form.phone}</span>
            <span>駕照：</span><span className="font-medium">{form.licenseType} {form.licenseNumber}</span>
            <span>車輛：</span><span className="font-medium">{form.vehicleType} {form.licensePlate}</span>
            <span>服務區域：</span><span className="font-medium">{form.serviceRegions.slice(0, 3).join("、")}{form.serviceRegions.length > 3 ? `…等${form.serviceRegions.length}區` : ""}</span>
            <span>收款銀行：</span><span className="font-medium">{form.bankName} {form.bankAccountName}</span>
          </div>
        </div>
      </div>
    );
  }

  function renderSuccess() {
    return (
      <div className="text-center py-8 space-y-5">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-green-700">申請成功！</h2>
          <p className="text-muted-foreground mt-1">申請編號：DA-{String(appId).padStart(6, "0")}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-sm space-y-2 text-left max-w-md mx-auto">
          <p className="font-bold text-green-800">接下來的步驟</p>
          <div className="space-y-1.5 text-green-700">
            <div className="flex items-start gap-2"><span className="font-bold shrink-0">1.</span> 我們將在 1-3 個工作天內審核您的資料</div>
            <div className="flex items-start gap-2"><span className="font-bold shrink-0">2.</span> 審核通過後，系統將透過電話或 LINE 聯繫您</div>
            <div className="flex items-start gap-2"><span className="font-bold shrink-0">3.</span> 完成帳號開通後即可開始接單</div>
          </div>
        </div>
        <div className="max-w-md mx-auto">
          <StatusCheck />
        </div>
        <Button variant="outline" onClick={() => { setStep(1); setAppId(null); setForm(f => ({ ...f, agreedToTerms: false, signedName: "", docs: {} })); }}>
          提交新申請
        </Button>
      </div>
    );
  }

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderStep7];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-black text-base leading-tight">富詠運輸 司機申請加入</p>
            <p className="text-xs text-muted-foreground">全自動物流平台 · 彈性接單 · 月結收款</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {step < 8 ? (
          <>
            {/* Step progress bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2 overflow-x-auto pb-1 gap-1">
                {STEPS.map(s => {
                  const Icon = s.icon;
                  const done = step > s.id;
                  const active = step === s.id;
                  return (
                    <div key={s.id} className={`flex flex-col items-center gap-1 min-w-[52px] cursor-default`}
                      title={s.label}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all
                        ${done ? "bg-emerald-500 border-emerald-500 text-white"
                              : active ? "bg-primary border-primary text-white"
                              : "bg-white border-gray-200 text-gray-400"}`}>
                        {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <span className={`text-[10px] font-medium whitespace-nowrap
                        ${active ? "text-primary" : done ? "text-emerald-600" : "text-gray-400"}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
              </div>
              <p className="text-right text-xs text-muted-foreground mt-1">第 {step} / {STEPS.length} 步</p>
            </div>

            {/* Form card */}
            <Card className="shadow-sm">
              <CardContent className="p-5 sm:p-6">
                {stepContent[step - 1]?.()}
              </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex gap-3 mt-4">
              {step > 1 && (
                <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(s => s - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
                </Button>
              )}
              {step < 7 ? (
                <Button className="flex-1 h-11 font-bold" disabled={!canProceed()}
                  onClick={() => setStep(s => s + 1)}>
                  下一步 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button className="flex-1 h-11 font-bold bg-emerald-600 hover:bg-emerald-700"
                  disabled={!canProceed() || submitting}
                  onClick={handleSubmit}>
                  {submitting ? "送出中…" : "確認送出申請"}
                  {!submitting && <ChevronRight className="w-4 h-4 ml-1" />}
                </Button>
              )}
            </div>

            {/* Status check (shown on step 1) */}
            {step === 1 && (
              <div className="mt-5">
                <StatusCheck />
              </div>
            )}
          </>
        ) : (
          <Card className="shadow-sm"><CardContent className="p-6">{renderSuccess()}</CardContent></Card>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Req() { return <span className="text-red-500 ml-0.5">*</span>; }

function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b">
      <div className="w-9 h-9 bg-muted rounded-xl flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="font-bold text-base">{title}</h2>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
