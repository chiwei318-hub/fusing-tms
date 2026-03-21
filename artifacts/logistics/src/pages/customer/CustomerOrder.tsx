import { useState, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Package, MapPin, User, CheckCircle, Copy, Truck, Calendar,
  Building2, Phone, AlertTriangle, Calculator, ChevronDown, Info,
} from "lucide-react";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Order } from "@workspace/api-client-react";

// ─── Vehicle data ─────────────────────────────────────────────────────────────
const BODY_TYPES = [
  { value: "廂型", label: "廂型車", desc: "封閉式廂型，防雨防塵" },
  { value: "平斗", label: "平斗車", desc: "開放式平板，超長超寬貨" },
  { value: "冷藏", label: "冷藏車", desc: "溫控貨艙，食品生鮮適用" },
  { value: "尾門", label: "尾門車", desc: "附液壓升降尾板，重物上下" },
];
const TONNAGE_OPTIONS = [
  { value: "1.5T", weight: "1,500 kg", volume: "7 m³", desc: "小型家電、文件、輕貨" },
  { value: "3.5T", weight: "3,500 kg", volume: "18 m³", desc: "辦公家具、一般搬家" },
  { value: "5T",   weight: "5,000 kg", volume: "30 m³", desc: "大型設備、建材" },
  { value: "8T",   weight: "8,000 kg", volume: "40 m³", desc: "工廠貨品、大量家具" },
  { value: "11T",  weight: "11,000 kg", volume: "52 m³", desc: "重型機械、大批貨" },
  { value: "17T",  weight: "17,000 kg", volume: "65 m³", desc: "超大件、拖運" },
];

// ─── Cargo data ───────────────────────────────────────────────────────────────
const CARGO_TYPES = [
  "家具", "辦公設備", "家電", "建材", "食品飲料", "服飾", "書籍文件",
  "機械零件", "化工原料", "醫療器材", "電子零件", "原物料", "其他",
];
const QUANTITY_OPTIONS = ["1 件", "2 件", "3 件", "4 件", "5 件", "6–10 件", "11–20 件", "21–50 件", "51 件以上"];

// ─── Schema ───────────────────────────────────────────────────────────────────
const addrRe = /^.{10,}$/; // at least 10 chars
const schema = z.object({
  // Orderer
  customerName:       z.string().min(2, "請填寫委託人姓名"),
  customerPhone:      z.string().min(8, "請填寫有效電話"),
  customerCompany:    z.string().optional(),
  // Pickup
  pickupDate:         z.string().optional(),
  pickupTime:         z.string().optional(),
  pickupAddress:      z.string().min(10, "請填寫完整地址（含縣市區路段門牌）"),
  pickupContactName:  z.string().min(2, "請填寫取貨聯絡人"),
  pickupPhone:        z.string().min(8, "請填寫取貨聯絡電話"),
  pickupCompany:      z.string().optional(),
  pickupNotes:        z.string().optional(),
  // Delivery
  deliveryDate:       z.string().optional(),
  deliveryTime:       z.string().optional(),
  deliveryAddress:    z.string().min(10, "請填寫完整地址（含縣市區路段門牌）"),
  deliveryContactName:z.string().min(2, "請填寫送達聯絡人"),
  deliveryPhone:      z.string().min(8, "請填寫送達聯絡電話"),
  deliveryCompany:    z.string().optional(),
  deliveryNotes:      z.string().optional(),
  // Cargo
  cargoType:          z.string().min(1, "請選擇貨物類型"),
  cargoQuantity:      z.string().min(1, "請選擇件數"),
  cargoWeightKg:      z.coerce.number().positive("請輸入毛重（需大於 0）"),
  cargoLengthCm:      z.string().optional(),
  cargoWidthCm:       z.string().optional(),
  cargoHeightCm:      z.string().optional(),
  cargoNotes:         z.string().optional(),
  // Vehicle
  bodyType:           z.string().optional(),
  tonnage:            z.string().optional(),
  specialRequirements:z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// ─── Volume calculator ────────────────────────────────────────────────────────
function useVolume(control: any) {
  const l = useWatch({ control, name: "cargoLengthCm" });
  const w = useWatch({ control, name: "cargoWidthCm" });
  const h = useWatch({ control, name: "cargoHeightCm" });
  const lN = parseFloat(l ?? "");
  const wN = parseFloat(w ?? "");
  const hN = parseFloat(h ?? "");
  if (!isNaN(lN) && !isNaN(wN) && !isNaN(hN) && lN > 0 && wN > 0 && hN > 0) {
    const m3 = (lN * wN * hN) / 1_000_000;
    return m3.toFixed(3);
  }
  return null;
}

// ─── Address section component ────────────────────────────────────────────────
function AddressSection({
  title, icon, prefix, control, form, colorClass,
}: {
  title: string; icon: React.ReactNode; prefix: "pickup" | "delivery";
  control: any; form: any; colorClass: string;
}) {
  const dateField = `${prefix}Date` as any;
  const timeField = `${prefix}Time` as any;
  const addrField = `${prefix}Address` as any;
  const contactNameField = `${prefix}ContactName` as any;
  const phoneField = `${prefix}Phone` as any;
  const companyField = `${prefix}Company` as any;
  const notesField = `${prefix}Notes` as any;

  return (
    <Card className="border bg-white">
      <CardHeader className="pb-3 border-b">
        <CardTitle className={`text-sm flex items-center gap-2 ${colorClass}`}>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField control={control} name={dateField} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-muted-foreground">期望日期</FormLabel>
              <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={control} name={timeField} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-muted-foreground">期望時間</FormLabel>
              <FormControl><Input type="time" className="h-11" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        <FormField control={control} name={addrField} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm">完整地址 <span className="text-destructive">*</span></FormLabel>
            <FormControl>
              <Input
                className="h-12 text-base"
                placeholder="○○縣○○區○○路○段○○號○樓"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-3">
          <FormField control={control} name={contactNameField} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm flex items-center gap-1">
                <User className="w-3 h-3" /> 聯絡人 <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl><Input className="h-11" placeholder="王先生" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={control} name={phoneField} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm flex items-center gap-1">
                <Phone className="w-3 h-3" /> 電話 <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl><Input type="tel" className="h-11" placeholder="0912-345-678" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={control} name={companyField} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" /> 公司名稱（選填）
            </FormLabel>
            <FormControl><Input className="h-10" placeholder="○○股份有限公司" {...field} /></FormControl>
          </FormItem>
        )} />

        <FormField control={control} name={notesField} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-muted-foreground">備註（樓層、電梯、搬運需求）</FormLabel>
            <FormControl>
              <Textarea
                className="resize-none text-sm"
                rows={2}
                placeholder="例：3樓無電梯、需搬運至室內、大門密碼1234"
                {...field}
              />
            </FormControl>
          </FormItem>
        )} />
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CustomerOrder() {
  const { toast } = useToast();
  const [created, setCreated] = useState<Order | null>(null);
  const [selectedBody, setSelectedBody] = useState<string>("");
  const [selectedTonnage, setSelectedTonnage] = useState<string>("");
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "", customerPhone: "", customerCompany: "",
      pickupDate: "", pickupTime: "", pickupAddress: "", pickupContactName: "",
      pickupPhone: "", pickupCompany: "", pickupNotes: "",
      deliveryDate: "", deliveryTime: "", deliveryAddress: "", deliveryContactName: "",
      deliveryPhone: "", deliveryCompany: "", deliveryNotes: "",
      cargoType: "", cargoQuantity: "", cargoLengthCm: "", cargoWidthCm: "", cargoHeightCm: "",
      cargoNotes: "", bodyType: "", tonnage: "", specialRequirements: "",
    },
  });

  const volume = useVolume(form.control);
  const weightKg = useWatch({ control: form.control, name: "cargoWeightKg" });
  const tonnageInfo = TONNAGE_OPTIONS.find(t => t.value === selectedTonnage);

  const weightWarning = useMemo(() => {
    if (!weightKg || !tonnageInfo) return null;
    const limit = parseInt(tonnageInfo.weight.replace(/[^0-9]/g, ""));
    if (weightKg > limit) return `所選噸數（${selectedTonnage}）最大載重為 ${tonnageInfo.weight}，建議升級噸數`;
    return null;
  }, [weightKg, tonnageInfo, selectedTonnage]);

  const onSubmit = async (data: FormValues) => {
    const vehicleType = [data.bodyType, data.tonnage].filter(Boolean).join("") || null;
    const extras = [
      data.customerCompany ? `委託公司：${data.customerCompany}` : "",
      data.specialRequirements ?? "",
    ].filter(Boolean).join("；");

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
          cargoWidthM: data.cargoWidthCm ? parseFloat(data.cargoWidthCm) / 100 : null,
          cargoHeightM: data.cargoHeightCm ? parseFloat(data.cargoHeightCm) / 100 : null,
          requiredVehicleType: vehicleType,
          specialRequirements: [
            data.pickupNotes ? `取貨備註：${data.pickupNotes}` : "",
            data.deliveryNotes ? `送貨備註：${data.deliveryNotes}` : "",
            data.cargoNotes ? `貨物備註：${data.cargoNotes}` : "",
            extras,
          ].filter(Boolean).join("\n") || null,
        } as any,
      });
      setCreated(order);
      // Save to localStorage for quick re-fill
      localStorage.setItem("last-pickup-addr", data.pickupAddress);
      localStorage.setItem("last-delivery-addr", data.deliveryAddress);
    } catch {
      toast({ title: "下單失敗", description: "請稍後再試或聯絡客服", variant: "destructive" });
    }
  };

  const copyOrderId = () => {
    if (created) {
      navigator.clipboard.writeText(String(created.id));
      toast({ title: "已複製", description: "訂單編號已複製" });
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (created) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-11 h-11 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-foreground">下單成功！</h1>
          <p className="text-muted-foreground text-sm mt-1">富詠運輸已收到您的委託，即將安排派車</p>
        </div>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <p className="text-xs text-muted-foreground mb-1">您的訂單編號</p>
            <p className="text-5xl font-mono font-black text-primary">#{created.id}</p>
            <Button variant="outline" size="sm" onClick={copyOrderId} className="mt-4 gap-2">
              <Copy className="w-3.5 h-3.5" /> 複製編號
            </Button>
            <p className="text-xs text-muted-foreground mt-3">請保存此編號以便日後查詢</p>
          </CardContent>
        </Card>

        <Card className="border bg-white">
          <CardContent className="p-4 text-sm space-y-2.5">
            {[
              ["委託人", created.customerName],
              ["電話", created.customerPhone],
              ["貨物", created.cargoDescription],
              ["取貨日期", created.pickupDate ? `${created.pickupDate} ${created.pickupTime ?? ""}` : null],
              ["到達日期", created.deliveryDate ? `${created.deliveryDate} ${created.deliveryTime ?? ""}` : null],
              ["狀態", "等待派車中"],
            ].map(([k, v]) => v ? (
              <div key={k as string} className="flex justify-between items-center">
                <span className="text-muted-foreground">{k}</span>
                <span className={`font-medium ${k === "狀態" ? "text-amber-600" : ""}`}>{v}</span>
              </div>
            ) : null)}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full h-12">
            <Link href="/customer/track">查詢訂單狀態</Link>
          </Button>
          <Button variant="outline" className="w-full h-12" onClick={() => { setCreated(null); form.reset(); setSelectedBody(""); setSelectedTonnage(""); }}>
            再下一筆訂單
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-foreground">立即下單</h1>
        <p className="text-muted-foreground text-sm mt-0.5">填寫完整資訊，安全快速配送</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* ── 委託方 ── */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2 text-primary">
                <User className="w-4 h-4" /> 委託方資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="customerName" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">姓名 <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input className="h-12 text-base" placeholder="王小明" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="customerPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">電話 <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="tel" className="h-12 text-base" placeholder="0912-345-678" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="customerCompany" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> 公司名稱（選填）
                  </FormLabel>
                  <FormControl><Input className="h-10" placeholder="○○股份有限公司" {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── 取貨資訊 ── */}
          <AddressSection
            title="取貨資訊" icon={<MapPin className="w-4 h-4 text-orange-500" />}
            prefix="pickup" control={form.control} form={form}
            colorClass="text-orange-600"
          />

          {/* ── 送貨資訊 ── */}
          <AddressSection
            title="送貨資訊" icon={<MapPin className="w-4 h-4 text-blue-500" />}
            prefix="delivery" control={form.control} form={form}
            colorClass="text-blue-600"
          />

          {/* ── 貨物資訊 ── */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
                <Package className="w-4 h-4" /> 貨物資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Cargo type */}
              <FormField control={form.control} name="cargoType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">貨物類型 <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="選擇貨物類型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CARGO_TYPES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Quantity + Weight */}
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="cargoQuantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">件數 <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12"><SelectValue placeholder="選擇件數" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {QUANTITY_OPTIONS.map(q => (
                          <SelectItem key={q} value={q}>{q}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cargoWeightKg" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">毛重 (kg) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.1}
                        step={0.1}
                        placeholder="輸入重量，例：250.5"
                        className="h-12"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Weight anomaly warning */}
              {weightWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{weightWarning}</p>
                </div>
              )}

              {/* Dimensions */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Calculator className="w-3 h-3" /> 材積計算（選填，單位：公分）
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["cargoLengthCm", "cargoWidthCm", "cargoHeightCm"] as const).map((name, i) => (
                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">{["長", "寬", "高"][i]} (cm)</FormLabel>
                        <FormControl><Input type="number" min="1" className="h-11 text-center" placeholder="0" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>
                {volume && (
                  <div className="mt-2 flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <Calculator className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-800 font-semibold">材積 = {volume} m³</span>
                  </div>
                )}
              </div>

              <FormField control={form.control} name="cargoNotes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">貨物備註（易碎、貴重、特殊需求）</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none text-sm" rows={2} placeholder="例：玻璃易碎品、請勿堆疊" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* ── 車輛需求 ── */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2 text-primary">
                <Truck className="w-4 h-4" /> 車輛需求（選填）
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Body type pills */}
              <div>
                <p className="text-sm font-medium mb-2">車體類型</p>
                <div className="grid grid-cols-2 gap-2">
                  {BODY_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setSelectedBody(prev => prev === bt.value ? "" : bt.value)}
                      className={`text-left p-3 rounded-xl border-2 transition-all active:scale-[0.98]
                        ${selectedBody === bt.value
                          ? "border-primary bg-primary/5"
                          : "border-gray-100 bg-white hover:border-gray-200"}`}
                    >
                      <p className="font-bold text-sm">{bt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{bt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tonnage dropdown */}
              <div>
                <p className="text-sm font-medium mb-2">噸數需求</p>
                <Select value={selectedTonnage} onValueChange={setSelectedTonnage}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="選擇噸數" />
                  </SelectTrigger>
                  <SelectContent>
                    {TONNAGE_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex flex-col py-0.5">
                          <span className="font-bold">{t.value}</span>
                          <span className="text-xs text-muted-foreground">{t.weight} · {t.volume} · {t.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Capacity hint */}
                {tonnageInfo && (
                  <div className="mt-2 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <span className="font-bold">{selectedTonnage}</span>：最大載重 {tonnageInfo.weight}，材積 {tonnageInfo.volume} — {tonnageInfo.desc}
                    </div>
                  </div>
                )}
              </div>

              <FormField control={form.control} name="specialRequirements" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">其他特殊需求</FormLabel>
                  <FormControl>
                    <Textarea className="resize-none text-sm" rows={2} placeholder="例：需冷藏溫控、配合時段限制、指定路線" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-14 text-lg font-black gap-2 shadow-lg shadow-primary/30"
          >
            <Package className="w-5 h-5" />
            {isPending ? "送出中..." : "確認下單"}
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-2">
            下單後將由富詠運輸專人確認並安排派車
          </p>
        </form>
      </Form>
    </div>
  );
}
