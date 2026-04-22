import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MapPin, User, Package as PackageIcon, FileText, CheckCircle2,
  Truck, Calendar, Clock, Weight, Ruler, Info, Tag, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HistoryInput from "@/components/HistoryInput";
import { Button } from "@/components/ui/button";
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";
import { SmartDatePicker } from "@/components/SmartDatePicker";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const API = import.meta.env.BASE_URL + "api";

// ─── Static data ──────────────────────────────────────────────────────────────
const BODY_TYPES = [
  { value: "廂型", label: "廂型車", icon: "🚚", desc: "封閉式廂型，防雨防塵，一般貨運首選" },
  { value: "平斗", label: "平斗車", icon: "🛻", desc: "開放式平板，可載超長超寬貨物" },
  { value: "冷藏", label: "冷藏車", icon: "❄️", desc: "溫控貨艙，食品生鮮、醫藥適用" },
  { value: "尾門", label: "尾門車", icon: "🏗️", desc: "附液壓升降尾板，重物輕鬆上下車" },
];

const TONNAGE_OPTIONS = [
  { value: "1.5T", label: "1.5 噸", maxKg: 1500, volume: "7 m³",  desc: "輕貨、小家電、文件" },
  { value: "3.5T", label: "3.5 噸", maxKg: 3500, volume: "18 m³", desc: "辦公家具、一般貨運" },
  { value: "5T",   label: "5 噸",   maxKg: 5000, volume: "30 m³", desc: "大型設備、建材" },
  { value: "8T",   label: "8 噸",   maxKg: 8000, volume: "40 m³", desc: "工廠貨品、大量家具" },
  { value: "11T",  label: "11 噸",  maxKg: 11000, volume: "52 m³",desc: "重型機械、大批貨" },
  { value: "17T",  label: "17 噸",  maxKg: 17000, volume: "65 m³",desc: "超大件、拖運" },
];

const CARGO_TYPES = [
  "家具 / 辦公家具",
  "家電 / 3C 電器",
  "辦公設備 / 文儀",
  "建材 / 裝潢材料",
  "食品飲料 / 生鮮",
  "服飾 / 紡織品",
  "書籍 / 文件 / 紙張",
  "電子零件 / 半導體",
  "機械 / 工業零件",
  "金屬材料 / 鐵件",
  "化工原料",
  "醫療器材 / 藥品",
  "農產品 / 水果",
  "包裹 / 快遞物品",
  "藝術品 / 骨董",
  "展覽器材",
  "汽機車 / 輪胎",
  "重型機械 / 工程設備",
  "廢棄物 / 回收物",
  "其他（備註說明）",
];

const QUANTITY_OPTIONS = [
  "1 件", "2 件", "3 件", "4 件", "5 件",
  "6–10 件", "11–20 件", "21–50 件", "51 件以上",
];

// ─── Schema ───────────────────────────────────────────────────────────────────
const orderFormSchema = z.object({
  customerName:         z.string().min(2, "請輸入完整的客戶名稱"),
  customerPhone:        z.string().min(8, "請輸入有效的聯絡電話"),
  customerEmail:        z.string().email("請輸入有效的 Email").optional().or(z.literal("")),
  pickupAddress:        z.string().min(5, "請輸入詳細的取貨地址"),
  pickupDate:           z.string().optional(),
  pickupTime:           z.string().optional(),
  pickupContactPerson:  z.string().optional().nullable(),
  deliveryAddress:      z.string().min(5, "請輸入詳細的送貨地址"),
  deliveryDate:         z.string().optional(),
  deliveryTime:         z.string().optional(),
  deliveryContactPerson:z.string().optional().nullable(),
  cargoDescription:     z.string().min(2, "請描述貨物內容"),
  cargoType:            z.string().optional(),
  cargoQuantity:        z.string().optional(),
  cargoWeight:          z.coerce.number().optional().nullable(),
  cargoLengthCm:        z.string().optional(),
  cargoWidthCm:         z.string().optional(),
  cargoHeightCm:        z.string().optional(),
  vehicleBodyType:      z.string().optional(),
  vehicleTonnage:       z.string().optional(),
  needTailgate:         z.boolean().optional(),
  needHydraulicPallet:  z.boolean().optional(),
  needPorters:          z.boolean().optional(),
  isColdChain:          z.boolean().optional(),
  notes:                z.string().optional().nullable(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

// ─── Tonnage recommendation ───────────────────────────────────────────────────
function useRecommendedTonnage(weightKg: number | null | undefined) {
  return useMemo(() => {
    if (!weightKg || weightKg <= 0) return null;
    const rec = TONNAGE_OPTIONS.find(t => t.maxKg >= weightKg);
    return rec ?? TONNAGE_OPTIONS[TONNAGE_OPTIONS.length - 1];
  }, [weightKg]);
}

// ─── Checkbox toggle ──────────────────────────────────────────────────────────
function CheckToggle({ checked, onChange, label, desc }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all w-full
        ${checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
    >
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors
        ${checked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
        {checked && <span className="text-white text-xs font-bold">✓</span>}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
    </button>
  );
}

interface ContractRate {
  id: number; route_from: string; route_to: string; vehicle_type: string;
  unit: string; unit_price: number; min_charge: number; notes: string;
  quote_no: string; title: string; valid_to: string | null; customer_label: string;
}

const UNIT_LABEL: Record<string, string> = {
  per_trip:"趟", per_km:"公里/趟", per_ton:"噸", per_cbm:"立方米",
  per_day:"天", per_hour:"小時",
};

export default function OrderForm() {
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();
  const { toast } = useToast();
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);
  const [showDimensions, setShowDimensions] = useState(false);
  const [contractRates, setContractRates] = useState<ContractRate[]>([]);
  const [showRates, setShowRates] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerName: "", customerPhone: "", customerEmail: "",
      pickupAddress: "", pickupDate: "", pickupTime: "", pickupContactPerson: "",
      deliveryAddress: "", deliveryDate: "", deliveryTime: "", deliveryContactPerson: "",
      cargoDescription: "", cargoType: "", cargoQuantity: "",
      cargoWeight: undefined, cargoLengthCm: "", cargoWidthCm: "", cargoHeightCm: "",
      vehicleBodyType: "", vehicleTonnage: "",
      needTailgate: false, needHydraulicPallet: false, needPorters: false, isColdChain: false,
      notes: "",
    },
  });

  const watchWeight       = useWatch({ control: form.control, name: "cargoWeight" });
  const watchTonnage      = useWatch({ control: form.control, name: "vehicleTonnage" });
  const watchBodyType     = useWatch({ control: form.control, name: "vehicleBodyType" });
  const watchCustomerName = useWatch({ control: form.control, name: "customerName" });
  const watchPickupAddr   = useWatch({ control: form.control, name: "pickupAddress" });
  const watchDeliveryAddr = useWatch({ control: form.control, name: "deliveryAddress" });
  const recommended    = useRecommendedTonnage(watchWeight);

  useEffect(() => {
    if (!watchCustomerName || watchCustomerName.length < 2) {
      setContractRates([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const vehicleType = [watchBodyType, watchTonnage].filter(Boolean).join("") || "";
        const params = new URLSearchParams({ customerName: watchCustomerName });
        if (vehicleType) params.set("vehicleType", vehicleType);
        if (watchPickupAddr) params.set("fromAddress", watchPickupAddr.slice(0, 30));
        if (watchDeliveryAddr) params.set("toAddress", watchDeliveryAddr.slice(0, 30));
        const res = await fetch(`${API}/contract-quotes/lookup?${params}`);
        if (res.ok) {
          const data = await res.json();
          setContractRates(Array.isArray(data) ? data : []);
        }
      } catch { setContractRates([]); }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [watchCustomerName, watchBodyType, watchTonnage, watchPickupAddr, watchDeliveryAddr]);
  const selectedTonnageInfo = TONNAGE_OPTIONS.find(t => t.value === watchTonnage);
  const weightWarning = useMemo(() => {
    if (!watchWeight || !selectedTonnageInfo) return null;
    if (Number(watchWeight) > selectedTonnageInfo.maxKg)
      return `所選噸位最大載重 ${selectedTonnageInfo.maxKg.toLocaleString()} kg，建議升級噸位`;
    return null;
  }, [watchWeight, selectedTonnageInfo]);

  const onSubmit = async (data: OrderFormValues) => {
    const vehicleType = [data.vehicleBodyType, data.vehicleTonnage].filter(Boolean).join("") || null;
    const cargoDesc   = [data.cargoType, data.cargoDescription].filter(Boolean).join(" · ");
    try {
      const result = await createOrder({
        data: {
          customerName:          data.customerName,
          customerPhone:         data.customerPhone,
          pickupDate:            data.pickupDate  || null,
          pickupTime:            data.pickupTime  || null,
          pickupAddress:         data.pickupAddress,
          pickupContactPerson:   data.pickupContactPerson  || null,
          deliveryDate:          data.deliveryDate || null,
          deliveryTime:          data.deliveryTime || null,
          deliveryAddress:       data.deliveryAddress,
          deliveryContactPerson: data.deliveryContactPerson || null,
          cargoDescription:      cargoDesc,
          cargoQuantity:         data.cargoQuantity || null,
          cargoWeight:           data.cargoWeight   ?? null,
          cargoLengthM:          data.cargoLengthCm ? parseFloat(data.cargoLengthCm) / 100 : null,
          cargoWidthM:           data.cargoWidthCm  ? parseFloat(data.cargoWidthCm)  / 100 : null,
          cargoHeightM:          data.cargoHeightCm ? parseFloat(data.cargoHeightCm) / 100 : null,
          requiredVehicleType:   vehicleType,
          needTailgate:          data.needTailgate          || false,
          needHydraulicPallet:   data.needHydraulicPallet   || false,
          customerEmail:         data.customerEmail || null,
          notes:                 data.notes || null,
          specialRequirements: [
            data.needPorters     ? "需要搬運工" : "",
            data.isColdChain     ? "冷鏈運輸" : "",
          ].filter(Boolean).join("、") || null,
        } as any,
      });
      setSuccessOrderId(result.id);
      form.reset();
    } catch {
      toast({ title: "下單失敗", description: "無法送出訂單，請稍後再試。", variant: "destructive" });
    }
  };

  // ── Success ─────────────────────────────────────────────────────────────────
  if (successOrderId) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto mt-8 md:mt-16"
      >
        <Card className="text-center p-8 border shadow-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <div className="inline-flex items-center gap-1.5 bg-primary/5 px-3 py-1 rounded-full mb-4">
            <Truck className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">富詠運輸</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">訂單已成功送出！</h2>
          <p className="text-muted-foreground mb-2">感謝您的委託，您的訂單編號為</p>
          <div className="text-3xl font-mono font-bold text-primary mb-6">#{successOrderId}</div>
          <p className="text-sm text-muted-foreground mb-8">我們將盡快安排專屬司機，請保持電話暢通。</p>
          <Button size="lg" onClick={() => setSuccessOrderId(null)} className="w-full rounded-xl">
            建立新訂單
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-primary">富詠運輸</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">客戶下單</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">填寫以下資訊以建立新的物流託運需求</p>
      </div>

      <Card className="shadow-sm border overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
        <CardHeader className="bg-muted/30 border-b pb-5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            託運單填寫
          </CardTitle>
          <CardDescription>請確保聯絡電話與地址資訊正確無誤</CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* ─ 聯絡 + 貨物基本資訊 ─ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 聯絡資訊 */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider pb-2 border-b">
                    <User className="w-3.5 h-3.5 text-primary" />
                    聯絡資訊
                  </div>
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>客戶名稱 <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <HistoryInput fieldKey="order-customerName" placeholder="例如：王小明 或 某某科技公司" autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>聯絡電話 <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <HistoryInput fieldKey="order-customerPhone" placeholder="0912-345-678" inputMode="tel" autoComplete="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="customerEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        客戶 Email
                        <span className="text-xs text-muted-foreground font-normal">（完單後自動寄送發票）</span>
                      </FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="customer@example.com（選填）" autoComplete="email" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* 貨物基本資訊 */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider pb-2 border-b">
                    <PackageIcon className="w-3.5 h-3.5 text-primary" />
                    貨物資訊
                  </div>
                  <FormField control={form.control} name="cargoType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>貨物類型</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="選擇貨物類型（選填）" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARGO_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cargoDescription" render={({ field }) => (
                    <FormItem>
                      <FormLabel>貨物內容 <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="例如：辦公設備 3箱" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="cargoQuantity" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <PackageIcon className="w-3.5 h-3.5 text-muted-foreground" /> 件數
                        </FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-10">
                              <SelectValue placeholder="選填" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {QUANTITY_OPTIONS.map(q => (
                              <SelectItem key={q} value={q}>{q}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cargoWeight" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Weight className="w-3.5 h-3.5 text-muted-foreground" /> 重量（kg）
                        </FormLabel>
                        <FormControl>
                          <Input type="number" inputMode="decimal" placeholder="選填" min="0" step="0.1"
                            {...field} value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
                        </FormControl>
                        {recommended && !watchTonnage && (
                          <p className="text-xs text-primary mt-1">
                            💡 建議噸位：{recommended.label}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* 尺寸展開 */}
                  <button
                    type="button"
                    onClick={() => setShowDimensions(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    {showDimensions ? "收起貨物尺寸" : "填寫貨物尺寸（選填）"}
                  </button>
                  {showDimensions && (
                    <div className="grid grid-cols-3 gap-2">
                      {(["cargoLengthCm", "cargoWidthCm", "cargoHeightCm"] as const).map((name, idx) => (
                        <FormField key={name} control={form.control} name={name} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              {["長", "寬", "高"][idx]}（cm）
                            </FormLabel>
                            <FormControl>
                              <Input type="number" min={1} step={1} className="h-9" placeholder="0"
                                {...field} value={field.value ?? ""} />
                            </FormControl>
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ─ 需求車輛 ─ */}
              <div className="space-y-5 bg-slate-50/80 border border-slate-200 rounded-xl p-5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Truck className="w-3.5 h-3.5" />
                  需求車輛
                  <span className="text-muted-foreground font-normal normal-case tracking-normal">（未填寫將由系統自動推薦）</span>
                </div>

                {/* 車身類型 */}
                <FormField control={form.control} name="vehicleBodyType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>車身類型</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BODY_TYPES.map(bt => (
                        <button
                          key={bt.value}
                          type="button"
                          onClick={() => {
                            field.onChange(field.value === bt.value ? "" : bt.value);
                            if (bt.value === "尾門") form.setValue("needTailgate", true);
                            if (bt.value === "冷藏") form.setValue("isColdChain", true);
                          }}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all
                            ${field.value === bt.value
                              ? "border-primary bg-primary/8 shadow-sm"
                              : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                        >
                          <span className="text-2xl">{bt.icon}</span>
                          <span className={`text-xs font-bold ${field.value === bt.value ? "text-primary" : "text-foreground"}`}>
                            {bt.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{bt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </FormItem>
                )} />

                {/* 噸位選擇 */}
                <FormField control={form.control} name="vehicleTonnage" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      噸位需求
                      {recommended && (
                        <span className="text-xs text-primary font-normal bg-primary/10 px-2 py-0.5 rounded-full">
                          依重量建議：{recommended.label}
                        </span>
                      )}
                    </FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="選擇噸位（選填）" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TONNAGE_OPTIONS.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            <div className="flex items-baseline gap-2">
                              <span className="font-semibold">{t.label}</span>
                              <span className="text-xs text-muted-foreground">最重 {t.maxKg.toLocaleString()} kg · {t.volume} · {t.desc}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watchTonnage && selectedTonnageInfo && (
                      <div className="flex items-center gap-3 mt-1.5 px-3 py-2 rounded-lg bg-blue-50 text-xs text-blue-700">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          <strong>{selectedTonnageInfo.label}</strong> —
                          最大載重 {selectedTonnageInfo.maxKg.toLocaleString()} kg，
                          容積約 {selectedTonnageInfo.volume}
                          {weightWarning && <span className="ml-2 text-amber-600 font-medium">⚠️ {weightWarning}</span>}
                        </span>
                      </div>
                    )}
                  </FormItem>
                )} />

                {/* 特殊設備需求 */}
                <div className="space-y-2">
                  <p className="text-sm font-medium leading-none">特殊設備需求（可複選）</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormField control={form.control} name="needTailgate" render={({ field }) => (
                      <CheckToggle
                        checked={!!field.value}
                        onChange={field.onChange}
                        label="液壓升降尾板"
                        desc="重物、棧板貨物上下車"
                      />
                    )} />
                    <FormField control={form.control} name="needHydraulicPallet" render={({ field }) => (
                      <CheckToggle
                        checked={!!field.value}
                        onChange={field.onChange}
                        label="油壓托板車"
                        desc="倉庫收貨、棧板移位"
                      />
                    )} />
                    <FormField control={form.control} name="needPorters" render={({ field }) => (
                      <CheckToggle
                        checked={!!field.value}
                        onChange={field.onChange}
                        label="需要搬運工"
                        desc="人工搬抬、搬入室內"
                      />
                    )} />
                    <FormField control={form.control} name="isColdChain" render={({ field }) => (
                      <CheckToggle
                        checked={!!field.value}
                        onChange={field.onChange}
                        label="冷鏈運輸"
                        desc="全程溫控，生鮮食品專用"
                      />
                    )} />
                  </div>
                </div>
              </div>

              {/* ─ 客戶合約報價參考 ─ */}
              {contractRates.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowRates(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                      <Tag className="w-3.5 h-3.5" />
                      客戶合約報價參考
                      <span className="bg-emerald-200 text-emerald-800 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                        {contractRates.length} 筆符合
                      </span>
                    </div>
                    {showRates
                      ? <ChevronUp className="w-3.5 h-3.5 text-emerald-600" />
                      : <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  {showRates && (
                    <div className="px-4 pb-3 space-y-2">
                      <p className="text-[11px] text-emerald-600">以下為此客戶已確認的合約報價，可作為報價參考：</p>
                      {contractRates.map(r => (
                        <div key={r.id} className="bg-white border border-emerald-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r.route_from && <span className="text-xs font-medium text-gray-700">{r.route_from}</span>}
                              {r.route_from && r.route_to && <span className="text-gray-400 text-xs">→</span>}
                              {r.route_to && <span className="text-xs font-medium text-gray-700">{r.route_to}</span>}
                              {!r.route_from && !r.route_to && <span className="text-xs text-gray-400">全路線適用</span>}
                              {r.vehicle_type && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                                  {r.vehicle_type}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400 font-mono">{r.quote_no}</span>
                              {r.valid_to && (
                                <span className="text-[10px] text-gray-400">效期至 {r.valid_to.slice(0,10)}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-emerald-700">
                              ${Number(r.unit_price).toLocaleString()}
                              <span className="text-[10px] font-normal text-gray-500 ml-0.5">/{UNIT_LABEL[r.unit] ?? r.unit}</span>
                            </div>
                            {r.min_charge > 0 && (
                              <div className="text-[10px] text-gray-400">最低 ${Number(r.min_charge).toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─ 取貨資訊 ─ */}
              <div className="space-y-4 bg-orange-50/60 border border-orange-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-orange-700 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5" />
                  取貨資訊
                </div>
                <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>取貨地址 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <TaiwanAddressInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} historyKey="orderform-pickup" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="pickupDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-orange-500" /> 取貨日期
                      </FormLabel>
                      <FormControl>
                        <SmartDatePicker value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pickupTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-orange-500" /> 取貨時間
                      </FormLabel>
                      <FormControl>
                        <input type="time" {...field} value={field.value ?? ""}
                          className="w-full h-10 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="pickupContactPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-muted-foreground" /> 取貨聯絡人
                    </FormLabel>
                    <FormControl>
                      <HistoryInput fieldKey="order-pickupContact" placeholder="姓名 + 電話，例：王先生 0912-345-678"
                        {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              {/* ─ 送達資訊 ─ */}
              <div className="space-y-4 bg-blue-50/60 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5" />
                  送達資訊
                </div>
                <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>送貨地址 <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <TaiwanAddressInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} historyKey="orderform-delivery" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" /> 送達日期
                      </FormLabel>
                      <FormControl>
                        <SmartDatePicker value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="deliveryTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-blue-500" /> 送達時間
                      </FormLabel>
                      <FormControl>
                        <input type="time" {...field} value={field.value ?? ""}
                          className="w-full h-10 px-3 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="deliveryContactPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-muted-foreground" /> 送貨聯絡人
                    </FormLabel>
                    <FormControl>
                      <HistoryInput fieldKey="order-deliveryContact" placeholder="姓名 + 電話，例：李小姐 0988-765-432"
                        {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              {/* ─ 備註 ─ */}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>備註說明</FormLabel>
                  <FormControl>
                    <Textarea placeholder="其他需要司機注意的事項（選填），例如：需提前電話確認、貨物易碎、限時送達…" className="resize-none h-20" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-end">
                <Button type="submit" size="lg" disabled={isPending} className="w-full sm:w-auto px-8 rounded-xl">
                  {isPending ? "送出中..." : "確認送出訂單"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
