import { useState, useMemo } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, MapPin, User, CheckCircle, Copy, Truck, Calendar,
  Building2, Phone, AlertTriangle, Calculator, Info,
  Plus, Trash2, ChevronDown, ChevronRight, ClipboardList, CreditCard,
} from "lucide-react";
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Order } from "@workspace/api-client-react";

// ─── Static data ──────────────────────────────────────────────────────────────
const BODY_TYPES = [
  { value: "廂型", label: "廂型車", desc: "封閉式廂型，防雨防塵" },
  { value: "平斗", label: "平斗車", desc: "開放式平板，超長超寬貨" },
  { value: "冷藏", label: "冷藏車", desc: "溫控貨艙，食品生鮮適用" },
  { value: "尾門", label: "尾門車", desc: "附液壓升降尾板，重物上下" },
];
const TONNAGE_OPTIONS = [
  { value: "1.5T", weight: "1,500 kg", volume: "7 m³",  desc: "小型家電、文件、輕貨" },
  { value: "3.5T", weight: "3,500 kg", volume: "18 m³", desc: "辦公家具、一般貨運" },
  { value: "5T",   weight: "5,000 kg", volume: "30 m³", desc: "大型設備、建材" },
  { value: "8T",   weight: "8,000 kg", volume: "40 m³", desc: "工廠貨品、大量家具" },
  { value: "11T",  weight: "11,000 kg", volume: "52 m³", desc: "重型機械、大批貨" },
  { value: "17T",  weight: "17,000 kg", volume: "65 m³", desc: "超大件、拖運" },
];
const CARGO_TYPES = [
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
const QUANTITY_OPTIONS = ["1 件", "2 件", "3 件", "4 件", "5 件", "6–10 件", "11–20 件", "21–50 件", "51 件以上"];

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 0, label: "委託方資訊", icon: User,         color: "text-primary",    dot: "bg-primary" },
  { id: 1, label: "取貨地址",   icon: MapPin,        color: "text-orange-600", dot: "bg-orange-500" },
  { id: 2, label: "送貨地址",   icon: MapPin,        color: "text-blue-600",   dot: "bg-blue-500" },
  { id: 3, label: "貨物+車輛",  icon: Package,       color: "text-emerald-700",dot: "bg-emerald-500" },
];

// ─── Schema ───────────────────────────────────────────────────────────────────
const extraStopSchema = z.object({
  address:     z.string().min(5, "請填寫地址"),
  contactName: z.string().min(1, "請填寫聯絡人"),
  phone:       z.string().min(8, "請填寫電話"),
  company:     z.string().optional(),
  notes:       z.string().optional(),
  quantity:    z.string().optional(),
  weight:      z.coerce.number().optional(),
  signStatus:  z.enum(["pending", "signed"]).optional(),
});

const schema = z.object({
  customerName:          z.string().min(2, "請填寫委託人姓名"),
  customerPhone:         z.string().min(8, "請填寫有效電話"),
  customerCompany:       z.string().optional(),
  pickupDate:            z.string().optional(),
  pickupTime:            z.string().min(1, "請填寫取貨時間"),
  pickupAddress:         z.string().min(10, "請填寫完整地址（含縣市區路段門牌）"),
  pickupContactName:     z.string().min(2, "請填寫取貨聯絡人"),
  pickupPhone:           z.string().min(8, "請填寫取貨聯絡電話"),
  pickupCompany:         z.string().optional(),
  pickupNotes:           z.string().optional(),
  extraPickupAddresses:  z.array(extraStopSchema).default([]),
  deliveryDate:          z.string().optional(),
  deliveryTime:          z.string().min(1, "請填寫送達時間"),
  deliveryAddress:       z.string().min(10, "請填寫完整地址（含縣市區路段門牌）"),
  deliveryContactName:   z.string().min(2, "請填寫送達聯絡人"),
  deliveryPhone:         z.string().min(8, "請填寫送達聯絡電話"),
  deliveryCompany:       z.string().optional(),
  deliveryNotes:         z.string().optional(),
  extraDeliveryAddresses:z.array(extraStopSchema).default([]),
  cargoType:             z.string().min(1, "請選擇貨物類型"),
  cargoQuantity:         z.string().min(1, "請選擇件數"),
  cargoWeightKg:         z.coerce.number().positive("請輸入毛重（需大於 0）"),
  cargoLengthCm:         z.string().optional(),
  cargoWidthCm:          z.string().optional(),
  cargoHeightCm:         z.string().optional(),
  cargoNotes:            z.string().optional(),
  bodyType:              z.string().optional(),
  tonnage:               z.string().optional(),
  specialRequirements:   z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function useVolume(control: any) {
  const l = useWatch({ control, name: "cargoLengthCm" });
  const w = useWatch({ control, name: "cargoWidthCm" });
  const h = useWatch({ control, name: "cargoHeightCm" });
  const lN = parseFloat(l ?? ""), wN = parseFloat(w ?? ""), hN = parseFloat(h ?? "");
  if (!isNaN(lN) && !isNaN(wN) && !isNaN(hN) && lN > 0 && wN > 0 && hN > 0)
    return ((lN * wN * hN) / 1_000_000).toFixed(3);
  return null;
}

function Collapsible({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        {icon}
        <span className="flex-1 text-left font-medium">{title}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t bg-muted/10">{children}</div>}
    </div>
  );
}

// ─── Extra stop card ──────────────────────────────────────────────────────────
function ExtraStopCard({ index, prefix, control, onRemove, isOrange, label }: {
  index: number; prefix: string; control: any; onRemove: () => void; isOrange: boolean; label: string;
}) {
  const base = `${prefix}.${index}` as any;
  return (
    <Card className={`border-2 ${isOrange ? "border-orange-200" : "border-blue-200"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-bold flex items-center gap-1.5 ${isOrange ? "text-orange-600" : "text-blue-600"}`}>
            <MapPin className="w-3.5 h-3.5" /> {label}
          </span>
          <button type="button" onClick={onRemove}
            className="w-6 h-6 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-full transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <FormField control={control} name={`${base}.address`} render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className="text-sm">完整地址 <span className="text-destructive">*</span></FormLabel>
            <FormControl>
              <TaiwanAddressInput value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                historyKey={`extra-${isOrange ? "pickup" : "delivery"}`} error={fieldState.error?.message} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-2 gap-3">
          <FormField control={control} name={`${base}.contactName`} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">聯絡人 <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input className="h-10" placeholder="王先生" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={control} name={`${base}.phone`} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm">電話 <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input type="tel" className="h-10" placeholder="0912-345-678" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FormField control={control} name={`${base}.company`} render={({ field }) => (
            <FormItem><FormLabel className="text-xs text-muted-foreground">公司</FormLabel>
              <FormControl><Input className="h-9" placeholder="選填" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={control} name={`${base}.quantity`} render={({ field }) => (
            <FormItem><FormLabel className="text-xs text-muted-foreground">件數</FormLabel>
              <FormControl><Input className="h-9" placeholder="3件" {...field} /></FormControl></FormItem>
          )} />
          <FormField control={control} name={`${base}.weight`} render={({ field }) => (
            <FormItem><FormLabel className="text-xs text-muted-foreground">重量 kg</FormLabel>
              <FormControl>
                <Input type="number" min={0.1} step={0.1} className="h-9" placeholder="0.0"
                  {...field} value={field.value ?? ""}
                  onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
              </FormControl></FormItem>
          )} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Order Summary Panel ──────────────────────────────────────────────────────
function OrderSummary({ values, step }: { values: Partial<FormValues>; step: number }) {
  const rows: [string, string | undefined][] = [
    ["委託人", values.customerName ? `${values.customerName} ${values.customerPhone ?? ""}` : undefined],
    ["公司",   values.customerCompany || undefined],
    ["取貨地址", values.pickupAddress ? values.pickupAddress.slice(0, 20) + (values.pickupAddress.length > 20 ? "…" : "") : undefined],
    ["取貨時間", values.pickupDate ? `${values.pickupDate}${values.pickupTime ? " " + values.pickupTime : ""}` : undefined],
    ["取貨聯絡", values.pickupContactName ? `${values.pickupContactName} ${values.pickupPhone ?? ""}` : undefined],
    ["送貨地址", values.deliveryAddress ? values.deliveryAddress.slice(0, 20) + (values.deliveryAddress.length > 20 ? "…" : "") : undefined],
    ["送貨時間", values.deliveryDate ? `${values.deliveryDate}${values.deliveryTime ? " " + values.deliveryTime : ""}` : undefined],
    ["送貨聯絡", values.deliveryContactName ? `${values.deliveryContactName} ${values.deliveryPhone ?? ""}` : undefined],
    ["貨物",   values.cargoType ? `${values.cargoType}${values.cargoQuantity ? " · " + values.cargoQuantity : ""}` : undefined],
    ["重量",   values.cargoWeightKg ? `${values.cargoWeightKg} kg` : undefined],
    ["車輛",   [values.bodyType, values.tonnage].filter(Boolean).join(" ") || undefined],
  ];

  const filled = rows.filter(([, v]) => v).length;
  const total  = 8;
  const pct    = Math.min(100, Math.round((filled / total) * 100));

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>填寫進度</span><span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-1">
        {rows.map(([label, val]) => (
          <div key={label} className={`flex gap-2 text-xs py-1 border-b border-dashed border-border/50 last:border-0 ${val ? "" : "opacity-30"}`}>
            <span className="text-muted-foreground w-16 shrink-0">{label}</span>
            <span className="font-medium text-foreground flex-1 break-all">{val ?? "—"}</span>
          </div>
        ))}
      </div>

      {step === STEPS.length - 1 && (
        <p className="text-xs text-center text-muted-foreground pt-1">
          確認資訊後點擊「確認下單」
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CustomerOrder() {
  const { toast } = useToast();
  const [created, setCreated] = useState<Order | null>(null);
  const [step, setStep]       = useState(0);
  const [selectedBody, setSelectedBody]       = useState("");
  const [selectedTonnage, setSelectedTonnage] = useState("");
  const [paymentType, setPaymentType]         = useState<"instant" | "cash" | "monthly">("instant");
  const [instantMethod, setInstantMethod]     = useState<"line_pay" | "credit_card" | "bank_transfer">("line_pay");
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      customerName: "", customerPhone: "", customerCompany: "",
      pickupDate: "", pickupTime: "", pickupAddress: "", pickupContactName: "",
      pickupPhone: "", pickupCompany: "", pickupNotes: "",
      extraPickupAddresses: [],
      deliveryDate: "", deliveryTime: "", deliveryAddress: "", deliveryContactName: "",
      deliveryPhone: "", deliveryCompany: "", deliveryNotes: "",
      extraDeliveryAddresses: [],
      cargoType: "", cargoQuantity: "", cargoLengthCm: "", cargoWidthCm: "", cargoHeightCm: "",
      cargoNotes: "", bodyType: "", tonnage: "", specialRequirements: "",
    },
  });

  const values = useWatch({ control: form.control }) as Partial<FormValues>;
  const pickupFields   = useFieldArray({ control: form.control, name: "extraPickupAddresses" });
  const deliveryFields = useFieldArray({ control: form.control, name: "extraDeliveryAddresses" });
  const volume         = useVolume(form.control);
  const tonnageInfo    = TONNAGE_OPTIONS.find(t => t.value === selectedTonnage);

  const weightWarning = useMemo(() => {
    const kg = values.cargoWeightKg;
    if (!kg || !tonnageInfo) return null;
    const limit = parseInt(tonnageInfo.weight.replace(/[^0-9]/g, ""));
    if (Number(kg) > limit) return `所選噸數（${selectedTonnage}）最大載重 ${tonnageInfo.weight}，建議升級`;
    return null;
  }, [values.cargoWeightKg, tonnageInfo, selectedTonnage]);

  // Validate current step fields before advancing
  const stepFields: (keyof FormValues)[][] = [
    ["customerName", "customerPhone"],
    ["pickupAddress", "pickupContactName", "pickupPhone"],
    ["deliveryAddress", "deliveryContactName", "deliveryPhone"],
    ["cargoType", "cargoQuantity", "cargoWeightKg"],
  ];

  const goNext = async () => {
    const valid = await form.trigger(stepFields[step]);
    if (valid) setStep(s => Math.min(STEPS.length - 1, s + 1));
  };
  const goPrev = () => setStep(s => Math.max(0, s - 1));

  const onSubmit = async (data: FormValues) => {
    const vehicleType = [data.bodyType, data.tonnage].filter(Boolean).join("") || null;
    try {
      const order = await createOrder({
        data: {
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          pickupDate: data.pickupDate || null,
          pickupTime: data.pickupTime || null,
          pickupAddress: data.pickupAddress,
          pickupContactName: data.pickupCompany || null,
          pickupContactPerson: `${data.pickupContactName} ${data.pickupPhone}`,
          deliveryDate: data.deliveryDate || null,
          deliveryTime: data.deliveryTime || null,
          deliveryAddress: data.deliveryAddress,
          deliveryContactName: data.deliveryCompany || null,
          deliveryContactPerson: `${data.deliveryContactName} ${data.deliveryPhone}`,
          cargoDescription: data.cargoType,
          cargoQuantity: data.cargoQuantity,
          cargoWeight: data.cargoWeightKg,
          cargoLengthM: data.cargoLengthCm ? parseFloat(data.cargoLengthCm) / 100 : null,
          cargoWidthM: data.cargoWidthCm  ? parseFloat(data.cargoWidthCm)  / 100 : null,
          cargoHeightM: data.cargoHeightCm ? parseFloat(data.cargoHeightCm) / 100 : null,
          requiredVehicleType: vehicleType,
          extraPickupAddresses:  data.extraPickupAddresses?.length  ? JSON.stringify(data.extraPickupAddresses)  : null,
          extraDeliveryAddresses:data.extraDeliveryAddresses?.length ? JSON.stringify(data.extraDeliveryAddresses) : null,
          payment_method: paymentType === "instant" ? instantMethod : paymentType,
          specialRequirements: [
            data.pickupNotes   ? `取貨備註：${data.pickupNotes}`   : "",
            data.deliveryNotes ? `送貨備註：${data.deliveryNotes}` : "",
            data.cargoNotes    ? `貨物備註：${data.cargoNotes}`    : "",
            data.customerCompany ? `委託公司：${data.customerCompany}` : "",
            data.specialRequirements ?? "",
          ].filter(Boolean).join("\n") || null,
        } as any,
      });
      setCreated(order);
      localStorage.setItem("last-pickup-addr",   data.pickupAddress);
      localStorage.setItem("last-delivery-addr", data.deliveryAddress);
    } catch {
      toast({ title: "下單失敗", description: "請稍後再試或聯絡客服", variant: "destructive" });
    }
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (created) {
    return (
      <div className="max-w-lg mx-auto space-y-5 py-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-11 h-11 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black">下單成功！</h1>
          <p className="text-muted-foreground text-sm mt-1">富詠運輸已收到您的委託，即將安排派車</p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">您的訂單編號</p>
            <p className="text-5xl font-mono font-black text-primary">#{created.id}</p>
            <Button variant="outline" size="sm"
              onClick={() => { navigator.clipboard.writeText(String(created.id)); toast({ title: "已複製" }); }}
              className="mt-4 gap-2">
              <Copy className="w-3.5 h-3.5" /> 複製編號
            </Button>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full h-12"><Link href="/customer/track">查詢訂單狀態</Link></Button>
          <Button variant="outline" className="w-full h-12"
            onClick={() => { setCreated(null); form.reset(); setStep(0); setSelectedBody(""); setSelectedTonnage(""); }}>
            再下一筆訂單
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const currentStep = STEPS[step];

  return (
    <div className="flex flex-col h-full">

      {/* ── Sticky top toolbar ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b shrink-0">
        <div className="flex items-center gap-2 px-4 py-2">
          {/* Steps — icon+label on desktop, just dot on mobile */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0
                    ${active ? "bg-primary text-primary-foreground shadow"
                      : done  ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                              : "bg-muted text-muted-foreground cursor-default"}`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${active ? "bg-white/30" : done ? "bg-primary/30" : "bg-muted-foreground/20"}`}>
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            className="shrink-0 gap-1.5 font-bold"
            onClick={step === STEPS.length - 1 ? form.handleSubmit(onSubmit) : goNext}
          >
            <Package className="w-3.5 h-3.5" />
            {isPending ? "送出中…" : step === STEPS.length - 1 ? "確認下單" : "下一步"}
          </Button>
        </div>
      </div>

      {/* ── Three-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: step nav (desktop only) */}
        <aside className="hidden lg:flex flex-col w-44 xl:w-52 shrink-0 border-r bg-muted/20 py-4 gap-1 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 mb-2">填寫步驟</p>
          {STEPS.map((s, i) => {
            const done   = i < step;
            const active = i === step;
            const Icon   = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-2.5 px-4 py-2.5 mx-2 rounded-xl text-sm font-medium text-left transition-all
                  ${active ? "bg-white shadow-sm text-primary border border-primary/20"
                    : done  ? "text-primary/70 hover:bg-white/60 cursor-pointer"
                            : "text-muted-foreground cursor-default"}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                  ${active ? "bg-primary text-white" : done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Center: form content */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5"
          >
            {/* ─ Step 0: 委託方資訊 ─ */}
            {step === 0 && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black flex items-center gap-2 text-primary">
                    <User className="w-5 h-5" /> 委託方資訊
                  </h2>
                  <p className="text-muted-foreground text-sm mt-0.5">填寫下單人基本資料</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>姓名 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input className="h-11" placeholder="王小明" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>聯絡電話 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="tel" className="h-11" placeholder="0912-345-678" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Collapsible title="公司資訊（選填）" icon={<Building2 className="w-3.5 h-3.5" />}>
                  <div className="pt-3">
                    <FormField control={form.control} name="customerCompany" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">公司名稱</FormLabel>
                        <FormControl><Input className="h-10" placeholder="○○股份有限公司" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </Collapsible>
              </div>
            )}

            {/* ─ Step 1: 取貨地址 ─ */}
            {step === 1 && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black flex items-center gap-2 text-orange-600">
                    <MapPin className="w-5 h-5" /> 取貨地址
                  </h2>
                  <p className="text-muted-foreground text-sm mt-0.5">填寫取貨地點與聯絡資訊</p>
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pickupDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 期望日期</FormLabel>
                      <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pickupTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>取貨時間 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="time" className="h-11" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Address */}
                <FormField control={form.control} name="pickupAddress" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>完整地址 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <TaiwanAddressInput value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                        historyKey="pickup" error={fieldState.error?.message} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="pickupContactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> 聯絡人 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input className="h-11" placeholder="王先生" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pickupPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> 電話 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="tel" className="h-11" placeholder="0912-345-678" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Optional: company + notes */}
                <Collapsible title="備註與公司（選填）" icon={<Building2 className="w-3.5 h-3.5" />}>
                  <div className="pt-3 space-y-3">
                    <FormField control={form.control} name="pickupCompany" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">公司名稱</FormLabel>
                        <FormControl><Input className="h-10" placeholder="○○股份有限公司" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="pickupNotes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">備註</FormLabel>
                        <FormControl>
                          <Textarea className="resize-none text-sm" rows={2}
                            placeholder="例：3樓無電梯、需卸貨至室內" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </Collapsible>

                {/* Extra stops */}
                {pickupFields.fields.length > 0 && (
                  <div className="space-y-3">
                    {pickupFields.fields.map((f, idx) => (
                      <ExtraStopCard key={f.id} index={idx} prefix="extraPickupAddresses"
                        control={form.control} onRemove={() => pickupFields.remove(idx)}
                        isOrange label={`取貨地址 第${idx + 2}站`} />
                    ))}
                  </div>
                )}
                {pickupFields.fields.length < 3 && (
                  <button type="button"
                    onClick={() => pickupFields.append({ address: "", contactName: "", phone: "", company: "", notes: "", quantity: "", weight: undefined, signStatus: "pending" })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-300 text-orange-600 text-sm font-semibold hover:bg-orange-50 transition-colors">
                    <Plus className="w-4 h-4" />
                    新增取貨地址（多站取貨）
                  </button>
                )}
              </div>
            )}

            {/* ─ Step 2: 送貨地址 ─ */}
            {step === 2 && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black flex items-center gap-2 text-blue-600">
                    <MapPin className="w-5 h-5" /> 送貨地址
                  </h2>
                  <p className="text-muted-foreground text-sm mt-0.5">填寫送達地點與聯絡資訊</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 期望日期</FormLabel>
                      <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="deliveryTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>送達時間 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="time" className="h-11" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="deliveryAddress" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>完整地址 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <TaiwanAddressInput value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                        historyKey="delivery" error={fieldState.error?.message} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="deliveryContactName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> 聯絡人 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input className="h-11" placeholder="李先生" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="deliveryPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> 電話 <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="tel" className="h-11" placeholder="0923-456-789" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Collapsible title="備註與公司（選填）" icon={<Building2 className="w-3.5 h-3.5" />}>
                  <div className="pt-3 space-y-3">
                    <FormField control={form.control} name="deliveryCompany" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">公司名稱</FormLabel>
                        <FormControl><Input className="h-10" placeholder="○○股份有限公司" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="deliveryNotes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">備註</FormLabel>
                        <FormControl>
                          <Textarea className="resize-none text-sm" rows={2}
                            placeholder="例：需送至2樓、收貨時間限制8–12點" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </Collapsible>

                {deliveryFields.fields.length > 0 && (
                  <div className="space-y-3">
                    {deliveryFields.fields.map((f, idx) => (
                      <ExtraStopCard key={f.id} index={idx} prefix="extraDeliveryAddresses"
                        control={form.control} onRemove={() => deliveryFields.remove(idx)}
                        isOrange={false} label={`送貨地址 第${idx + 2}站`} />
                    ))}
                  </div>
                )}
                {deliveryFields.fields.length < 5 && (
                  <button type="button"
                    onClick={() => deliveryFields.append({ address: "", contactName: "", phone: "", company: "", notes: "", quantity: "", weight: undefined, signStatus: "pending" })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors">
                    <Plus className="w-4 h-4" />
                    新增送貨地址（多站送貨）
                  </button>
                )}
              </div>
            )}

            {/* ─ Step 3: 貨物 + 車輛 ─ */}
            {step === 3 && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h2 className="text-lg font-black flex items-center gap-2 text-emerald-700">
                    <Package className="w-5 h-5" /> 貨物與車輛需求
                  </h2>
                  <p className="text-muted-foreground text-sm mt-0.5">填寫貨物資訊，選填車輛需求</p>
                </div>

                {/* Cargo core fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField control={form.control} name="cargoType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>貨物類型 <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="選擇類型" /></SelectTrigger></FormControl>
                        <SelectContent>{CARGO_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cargoQuantity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>件數 <span className="text-destructive">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="選擇件數" /></SelectTrigger></FormControl>
                        <SelectContent>{QUANTITY_OPTIONS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cargoWeightKg" render={({ field }) => (
                    <FormItem>
                      <FormLabel>毛重 (kg) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input type="number" min={0.1} step={0.1} className="h-11" placeholder="例：250.5"
                          {...field} value={field.value ?? ""}
                          onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {weightWarning && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">{weightWarning}</p>
                  </div>
                )}

                {/* Vehicle */}
                <Collapsible title="車輛需求（選填）" icon={<Truck className="w-3.5 h-3.5" />}>
                  <div className="pt-3 space-y-4">
                    <div>
                      <p className="text-sm font-medium mb-2">車體類型</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BODY_TYPES.map(bt => (
                          <button key={bt.value} type="button"
                            onClick={() => setSelectedBody(p => p === bt.value ? "" : bt.value)}
                            className={`text-left p-3 rounded-xl border-2 transition-all
                              ${selectedBody === bt.value ? "border-primary bg-primary/5" : "border-gray-100 hover:border-gray-200"}`}>
                            <p className="font-bold text-sm">{bt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{bt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">噸數需求</p>
                      <Select value={selectedTonnage} onValueChange={setSelectedTonnage}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="選擇噸數" /></SelectTrigger>
                        <SelectContent>
                          {TONNAGE_OPTIONS.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="font-bold">{t.value}</span>
                              <span className="text-xs text-muted-foreground ml-2">{t.weight} · {t.volume}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {tonnageInfo && (
                        <div className="mt-2 flex gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span><b>{selectedTonnage}</b>：最大載重 {tonnageInfo.weight}，材積 {tonnageInfo.volume}　{tonnageInfo.desc}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Collapsible>

                {/* Dimensions + notes */}
                <Collapsible title="材積與備註（選填）" icon={<Calculator className="w-3.5 h-3.5" />}>
                  <div className="pt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">材積計算（公分）</p>
                    <div className="grid grid-cols-3 gap-3">
                      {(["cargoLengthCm", "cargoWidthCm", "cargoHeightCm"] as const).map((name, i) => (
                        <FormField key={name} control={form.control} name={name} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">{["長", "寬", "高"][i]} (cm)</FormLabel>
                            <FormControl><Input type="number" min="1" className="h-10 text-center" placeholder="0" {...field} /></FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                    {volume && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs text-emerald-800 font-semibold">材積 = {volume} m³</span>
                      </div>
                    )}
                    <FormField control={form.control} name="cargoNotes" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">貨物備註</FormLabel>
                        <FormControl>
                          <Textarea className="resize-none text-sm" rows={2}
                            placeholder="例：玻璃易碎品、請勿堆疊" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="specialRequirements" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">特殊需求</FormLabel>
                        <FormControl>
                          <Textarea className="resize-none text-sm" rows={2}
                            placeholder="例：需冷藏溫控、配合時段限制" {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                </Collapsible>

                {/* ── 付款方式 ── */}
                <div className="border rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" /> 付款方式
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "instant", label: "即時付款", icon: "⚡", desc: "LINE Pay · 信用卡 · 轉帳", badge: "推薦" },
                      { id: "cash",    label: "現金付款", icon: "💵", desc: "司機到達時收款", badge: "" },
                      { id: "monthly", label: "月結帳款", icon: "📋", desc: "企業客戶對帳付款", badge: "企業" },
                    ].map(pt => (
                      <button key={pt.id} type="button"
                        onClick={() => setPaymentType(pt.id as any)}
                        className={`relative flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all
                          ${paymentType === pt.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-gray-300"}`}>
                        {pt.badge && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                            {pt.badge}
                          </span>
                        )}
                        <span className="text-xl mt-0.5">{pt.icon}</span>
                        <span className="text-xs font-bold">{pt.label}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{pt.desc}</span>
                      </button>
                    ))}
                  </div>
                  {/* 即時付款子選項 */}
                  {paymentType === "instant" && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "line_pay",      label: "LINE Pay",  icon: "💚" },
                        { id: "credit_card",   label: "信用卡",    icon: "💳" },
                        { id: "bank_transfer", label: "銀行轉帳",  icon: "🏦" },
                      ].map(sm => (
                        <button key={sm.id} type="button"
                          onClick={() => setInstantMethod(sm.id as any)}
                          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-semibold transition-all
                            ${instantMethod === sm.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-gray-300 text-muted-foreground"}`}>
                          <span>{sm.icon}</span>{sm.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className={`text-xs rounded-lg px-2 py-1.5 ${
                    paymentType === "instant" ? "bg-blue-50 text-blue-700" :
                    paymentType === "cash"    ? "bg-amber-50 text-amber-700" :
                                               "bg-violet-50 text-violet-700"
                  }`}>
                    {paymentType === "instant" ? "⚡ 付款確認後才派車" :
                     paymentType === "cash"    ? "💵 司機到達時收款，系統自動回報" :
                                                "📋 需事先申請月結資格，對帳後統一付款"}
                  </p>
                </div>
              </div>
            )}

            {/* Navigation buttons (bottom of form) */}
            <div className="flex gap-3 mt-8 max-w-2xl">
              {step > 0 && (
                <Button type="button" variant="outline" className="flex-1 h-11" onClick={goPrev}>
                  ← 上一步
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" className="flex-1 h-11 font-bold" onClick={goNext}>
                  下一步 →
                </Button>
              ) : (
                <Button type="submit" disabled={isPending} className="flex-1 h-11 font-black gap-2 shadow-lg shadow-primary/30">
                  <Package className="w-4 h-4" />
                  {isPending ? "送出中…" : "確認下單"}
                </Button>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground mt-3 pb-4 max-w-2xl">
              下單後將由富詠運輸專人確認並安排派車
            </p>
          </form>
        </Form>

        {/* Right: order summary (desktop only) */}
        <aside className="hidden xl:flex flex-col w-64 shrink-0 border-l bg-muted/10 overflow-y-auto">
          <div className="px-4 py-4 border-b sticky top-0 bg-white/80 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> 訂單摘要
            </p>
          </div>
          <div className="px-4 py-4">
            <OrderSummary values={values} step={step} />
          </div>
          {step === STEPS.length - 1 && (
            <div className="px-4 pb-4 mt-auto">
              <Button
                type="button"
                className="w-full h-11 font-black gap-2"
                disabled={isPending}
                onClick={form.handleSubmit(onSubmit)}
              >
                <Package className="w-4 h-4" />
                {isPending ? "送出中…" : "確認下單"}
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
