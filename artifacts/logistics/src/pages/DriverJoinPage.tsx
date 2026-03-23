import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, Upload, FileText, Truck, User, Shield,
  ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, Pen,
  Phone, MapPin, Car, Package, Star,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const API = import.meta.env.BASE_URL + "api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1
  name: string; phone: string; idNumber: string; address: string; email: string;
  // Step 2
  vehicleType: string; vehicleTonnage: string; maxLoadKg: string;
  licensePlate: string; vehicleYear: string; vehicleBodyType: string;
  hasTailgate: boolean; hasRefrigeration: boolean; hasHydraulicPallet: boolean;
  // Step 3 (docs)
  docs: Record<string, { filename: string; fileData: string; fileSize: number; mimeType: string; expiryDate: string }>;
  // Step 4
  agreedToTerms: boolean; signedName: string;
}

const STEPS = [
  { id: 1, label: "個人資料", icon: <User className="w-4 h-4" /> },
  { id: 2, label: "車輛資料", icon: <Truck className="w-4 h-4" /> },
  { id: 3, label: "文件上傳", icon: <FileText className="w-4 h-4" /> },
  { id: 4, label: "合約簽署", icon: <Pen className="w-4 h-4" /> },
  { id: 5, label: "完成送出", icon: <CheckCircle2 className="w-4 h-4" /> },
];

const DOC_TYPES = [
  { key: "driver_license", label: "駕照正本", required: true, hint: "請上傳清晰正面照片" },
  { key: "id_card", label: "身分證正反面", required: true, hint: "正反面合一照片" },
  { key: "vehicle_reg", label: "行車執照", required: true, hint: "車輛行照" },
  { key: "insurance", label: "汽車強制險", required: true, hint: "需在有效期內" },
  { key: "vehicle_photo_front", label: "車輛正面照", required: true, hint: "清晰顯示車牌" },
  { key: "vehicle_photo_side", label: "車輛側面照", required: false, hint: "可選填" },
];

const CONTRACT_TEXT = `富詠運輸司機合作條款 v1.0

一、合作性質
本合作為非僱傭關係，加盟司機以獨立承攬方式合作。

二、接單規範
1. 接單後須於 5 分鐘內確認，未確認視同放棄。
2. 不得無故取消已確認訂單。取消率超過 10% 將限制接單。
3. 必須遵守取送貨時間承諾。

三、服務品質
1. 須穿著整潔，態度良好對待客戶。
2. 貨物搬運須謹慎，若因疏失造成損壞須負賠償責任。
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

七、終止合作
雙方均可提前 7 天書面通知終止合作。平台有權因違規立即終止合作。

八、爭議處理
以中華民國法律為準，以台灣台北地方法院為第一審管轄法院。`;

// ─── File Upload Component ─────────────────────────────────────────────────────

function DocUpload({ docKey, label, required, hint, value, onChange }: {
  docKey: string; label: string; required: boolean; hint: string;
  value?: { filename: string; fileData: string; mimeType: string; expiryDate: string };
  onChange: (data: { filename: string; fileData: string; fileSize: number; mimeType: string; expiryDate: string }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("檔案大小不能超過 5MB");
      return;
    }
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
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        {value?.filename && <span className="text-[11px] text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{value.filename}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div
        onClick={() => ref.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${value?.filename ? "border-green-400 bg-green-50" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"}`}>
        {preview ? (
          <img src={preview} alt={label} className="max-h-32 mx-auto rounded object-contain" />
        ) : value?.filename && !preview ? (
          <div className="flex items-center justify-center gap-2 text-green-600">
            <FileText className="w-6 h-6" />
            <span className="text-sm">{value.filename}</span>
          </div>
        ) : (
          <div className="space-y-1">
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">點擊上傳或拍照</p>
            <p className="text-[10px] text-muted-foreground">JPG / PNG / PDF，最大 5MB</p>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
      {(docKey === "driver_license" || docKey === "vehicle_reg" || docKey === "insurance") && (
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

// ─── Status Check ─────────────────────────────────────────────────────────────

function StatusCheck() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/driver-applications/status/${phone}`);
      const data = await r.json();
      setResult(data);
    } finally { setLoading(false); }
  }

  const statusMap: Record<string, { label: string; color: string }> = {
    pending: { label: "審核中", color: "text-orange-500" },
    approved: { label: "已通過", color: "text-green-600" },
    rejected: { label: "已退件", color: "text-red-500" },
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm">查詢申請進度</Label>
      <div className="flex gap-2">
        <Input placeholder="輸入申請時的手機號碼" value={phone} onChange={e => setPhone(e.target.value)} className="h-9" />
        <Button size="sm" onClick={check} disabled={loading || !phone}>查詢</Button>
      </div>
      {result && (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
          <div className="font-semibold">{result.name}</div>
          <div>狀態：<span className={`font-bold ${statusMap[result.status]?.color}`}>{statusMap[result.status]?.label ?? result.status}</span></div>
          {result.rejection_reason && <div className="text-red-500 text-xs">退件原因：{result.rejection_reason}</div>}
          {result.contract_signed && <div className="text-green-600 text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />合約已簽署</div>}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DriverJoinPage() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [appId, setAppId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [form, setForm] = useState<FormData>({
    name: "", phone: "", idNumber: "", address: "", email: "",
    vehicleType: "", vehicleTonnage: "", maxLoadKg: "", licensePlate: "",
    vehicleYear: "", vehicleBodyType: "", hasTailgate: false, hasRefrigeration: false, hasHydraulicPallet: false,
    docs: {},
    agreedToTerms: false, signedName: "",
  });

  function set(k: keyof FormData, v: any) { setForm(f => ({ ...f, [k]: v })); }
  function setDoc(key: string, data: any) { setForm(f => ({ ...f, docs: { ...f.docs, [key]: data } })); }

  // Validations per step
  function canProceed(): boolean {
    if (step === 1) return !!(form.name && form.phone && form.idNumber && form.address);
    if (step === 2) return !!(form.vehicleType && form.licensePlate);
    if (step === 3) {
      const requiredDocs = DOC_TYPES.filter(d => d.required).map(d => d.key);
      return requiredDocs.every(k => !!form.docs[k]?.fileData);
    }
    if (step === 4) return !!(form.agreedToTerms && form.signedName);
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Step 1: Create application
      const appRes = await fetch(`${API}/driver-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, phone: form.phone, idNumber: form.idNumber,
          address: form.address, email: form.email,
          vehicleType: form.vehicleType, vehicleTonnage: form.vehicleTonnage,
          maxLoadKg: parseFloat(form.maxLoadKg) || undefined,
          licensePlate: form.licensePlate, vehicleYear: parseInt(form.vehicleYear) || undefined,
          vehicleBodyType: form.vehicleBodyType,
          hasTailgate: form.hasTailgate, hasRefrigeration: form.hasRefrigeration,
          hasHydraulicPallet: form.hasHydraulicPallet,
        }),
      });
      const appData = await appRes.json();
      if (!appRes.ok) {
        toast({ title: "申請失敗", description: appData.error, variant: "destructive" });
        return;
      }
      const newAppId = appData.applicationId;
      setAppId(newAppId);

      // Step 2: Upload documents
      for (const [docKey, docData] of Object.entries(form.docs)) {
        await fetch(`${API}/driver-applications/${newAppId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docType: docKey, docLabel: DOC_TYPES.find(d => d.key === docKey)?.label, ...docData }),
        });
      }

      // Step 3: Sign contract
      await fetch(`${API}/driver-applications/${newAppId}/sign-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreedToTerms: true, signedName: form.signedName }),
      });

      setStep(5);
    } finally { setSubmitting(false); }
  }

  function Step1() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>姓名 <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder="王大明" value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div>
            <Label>手機號碼 <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder="09XX-XXX-XXX" value={form.phone} onChange={e => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>身分證號 <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder="A123456789" value={form.idNumber} onChange={e => set("idNumber", e.target.value)} />
          </div>
          <div>
            <Label>電子信箱</Label>
            <Input className="mt-1" type="email" placeholder="driver@example.com" value={form.email} onChange={e => set("email", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>通訊地址 <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder="台北市信義區..." value={form.address} onChange={e => set("address", e.target.value)} />
          </div>
        </div>
      </div>
    );
  }

  function Step2() {
    const tonnages = ["1.75T","3.5T","5T","8.8T","10.5T","15T","17T","26T","35T","43T"];
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>車輛類型 <span className="text-red-500">*</span></Label>
            <Select value={form.vehicleType} onValueChange={v => set("vehicleType", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="選擇車型" /></SelectTrigger>
              <SelectContent>
                {["箱型車","平板車","冷藏車","貨車","小貨車","重型機車"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>噸數</Label>
            <Select value={form.vehicleTonnage} onValueChange={v => set("vehicleTonnage", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="選擇噸數" /></SelectTrigger>
              <SelectContent>
                {tonnages.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>車牌號碼 <span className="text-red-500">*</span></Label>
            <Input className="mt-1" placeholder="ABC-1234" value={form.licensePlate} onChange={e => set("licensePlate", e.target.value)} />
          </div>
          <div>
            <Label>出廠年份</Label>
            <Input className="mt-1" placeholder="2018" value={form.vehicleYear} onChange={e => set("vehicleYear", e.target.value)} />
          </div>
          <div>
            <Label>最大載重 (公斤)</Label>
            <Input className="mt-1" placeholder="3500" value={form.maxLoadKg} onChange={e => set("maxLoadKg", e.target.value)} />
          </div>
          <div>
            <Label>車廂類型</Label>
            <Select value={form.vehicleBodyType} onValueChange={v => set("vehicleBodyType", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="選擇車廂" /></SelectTrigger>
              <SelectContent>
                {["密閉式","開放式","冷藏","冷凍","特殊"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="mb-2 block">特殊設備</Label>
          <div className="flex flex-wrap gap-3">
            {[
              { key: "hasTailgate", label: "🚚 尾門" },
              { key: "hasRefrigeration", label: "🌡️ 冷藏/冷凍" },
              { key: "hasHydraulicPallet", label: "🔧 油壓板" },
            ].map(eq => (
              <label key={eq.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all
                ${(form as any)[eq.key] ? "border-primary bg-primary/5 font-semibold" : "hover:bg-muted/50"}`}>
                <input type="checkbox" checked={(form as any)[eq.key]}
                  onChange={e => set(eq.key as keyof FormData, e.target.checked)} className="rounded" />
                {eq.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function Step3() {
    return (
      <div className="space-y-5">
        <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>請上傳清晰、完整的文件照片。模糊或不完整的文件可能導致審核退件。每個檔案最大 5MB。</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {DOC_TYPES.map(doc => (
            <DocUpload key={doc.key} docKey={doc.key} label={doc.label}
              required={doc.required} hint={doc.hint}
              value={form.docs[doc.key]}
              onChange={data => setDoc(doc.key, data)}
            />
          ))}
        </div>
      </div>
    );
  }

  function Step4() {
    const [showFull, setShowFull] = useState(false);
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">合作條款</Label>
            <button onClick={() => setShowFull(v => !v)} className="text-xs text-primary underline">
              {showFull ? "收起" : "展開全文"}
            </button>
          </div>
          <div className={`border rounded-lg p-3 text-xs text-muted-foreground leading-relaxed overflow-y-auto transition-all ${showFull ? "max-h-96" : "max-h-28"}`}>
            <pre className="whitespace-pre-wrap font-sans">{CONTRACT_TEXT}</pre>
          </div>
        </div>
        <div>
          <Label>簽名（請輸入您的全名確認同意）<span className="text-red-500"> *</span></Label>
          <Input className="mt-1" placeholder="王大明" value={form.signedName} onChange={e => set("signedName", e.target.value)} />
        </div>
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
          ${form.agreedToTerms ? "border-green-400 bg-green-50" : "hover:bg-muted/30"}`}>
          <input type="checkbox" checked={form.agreedToTerms}
            onChange={e => set("agreedToTerms", e.target.checked)} className="mt-0.5 rounded" />
          <span className="text-sm">
            我已詳細閱讀並同意上述合作條款，且確認所填資料及上傳文件均屬實。
          </span>
        </label>
        <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3 space-y-1">
          <div>✅ 您的 IP 及時間將被記錄為電子簽名佐證</div>
          <div>✅ 審核通過後即可開始接單</div>
          <div>✅ 申請結果將以簡訊通知</div>
        </div>
      </div>
    );
  }

  function Step5() {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9 text-green-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold">申請已送出！</h3>
          <p className="text-muted-foreground text-sm mt-1">申請編號：#{appId}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2 max-w-sm mx-auto">
          <div className="flex gap-2"><span className="text-orange-500">●</span> 審核時間約 1-3 個工作天</div>
          <div className="flex gap-2"><span className="text-blue-500">●</span> 審核結果將以 SMS 通知</div>
          <div className="flex gap-2"><span className="text-green-500">●</span> 通過後需完成線上簽約才可接單</div>
        </div>
        <Separator />
        <StatusCheck />
      </div>
    );
  }

  const stepComponents = [null, <Step1 />, <Step2 />, <Step3 />, <Step4 />, <Step5 />];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="bg-black/30 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm">富詠運輸</div>
            <div className="text-white/60 text-xs">司機加盟入口</div>
          </div>
        </div>
        <button onClick={() => setShowStatus(v => !v)} className="text-white/70 hover:text-white text-xs underline">
          查詢申請進度
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {showStatus && (
          <Card className="border shadow-sm">
            <CardContent className="pt-4"><StatusCheck /></CardContent>
          </Card>
        )}

        {step < 5 && (
          <>
            {/* Benefits banner */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { icon: "💰", label: "月收 5-10 萬", sub: "高收益保障" },
                { icon: "⏰", label: "彈性接單", sub: "自由安排時間" },
                { icon: "🎯", label: "自動派單", sub: "智能配對貨源" },
              ].map(item => (
                <div key={item.label} className="bg-white/10 rounded-lg p-2.5 text-white">
                  <div className="text-lg">{item.icon}</div>
                  <div className="text-xs font-bold mt-0.5">{item.label}</div>
                  <div className="text-[10px] text-white/60">{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1">
              {STEPS.filter(s => s.id < 5).map((s, i) => (
                <div key={s.id} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 transition-all
                    ${step === s.id ? "bg-primary text-primary-foreground font-bold" :
                      step > s.id ? "bg-green-500 text-white" : "bg-white/20 text-white/50"}`}>
                    {step > s.id ? <CheckCircle2 className="w-3 h-3" /> : s.icon}
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {i < STEPS.length - 2 && <div className={`h-0.5 flex-1 ${step > s.id ? "bg-green-500" : "bg-white/20"}`} />}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Form card */}
        <Card className="border shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {STEPS[step - 1]?.icon}
              步驟 {step}：{STEPS[step - 1]?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stepComponents[step]}
          </CardContent>
        </Card>

        {/* Navigation */}
        {step < 5 && (
          <div className="flex gap-3">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(s => s - 1)} className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20">
                <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
              </Button>
            )}
            {step < 4 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="flex-1">
                下一步 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canProceed() || submitting} className="flex-1 bg-green-600 hover:bg-green-700">
                {submitting ? "送出中..." : "確認送出申請"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
