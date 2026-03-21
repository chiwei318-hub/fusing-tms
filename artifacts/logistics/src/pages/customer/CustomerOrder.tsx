import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, MapPin, User, CheckCircle, Copy, Truck, Calendar } from "lucide-react";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Order } from "@workspace/api-client-react";

const schema = z.object({
  customerName: z.string().min(1, "請填寫姓名"),
  customerPhone: z.string().min(8, "請填寫有效電話"),
  // 收貨
  pickupDate: z.string().optional(),
  pickupTime: z.string().optional(),
  requiredLicense: z.string().optional(),
  pickupContactName: z.string().optional(),
  pickupAddress: z.string().min(5, "請填寫完整收貨地址"),
  pickupContactPerson: z.string().optional(),
  // 到貨
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
  deliveryContactName: z.string().optional(),
  deliveryAddress: z.string().min(5, "請填寫完整到貨地址"),
  deliveryContactPerson: z.string().optional(),
  // 貨物
  cargoDescription: z.string().min(2, "請描述貨物內容"),
  cargoQuantity: z.string().optional(),
  cargoWeight: z.number().positive().nullable().optional(),
  requiredVehicleType: z.string().optional(),
  needTailgate: z.string().optional(),
  needHydraulicPallet: z.string().optional(),
  specialRequirements: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const WEIGHT_OPTIONS = [
  { value: "none", label: "不確定" },
  { value: "10", label: "10 kg 以下" },
  { value: "50", label: "10–50 kg" },
  { value: "100", label: "50–100 kg" },
  { value: "300", label: "100–300 kg" },
  { value: "500", label: "300 kg 以上" },
];

const VEHICLE_TYPE_OPTIONS = [
  { value: "小貨車", label: "小貨車" },
  { value: "中型貨車", label: "中型貨車" },
  { value: "大貨車", label: "大貨車" },
  { value: "曳引車", label: "曳引車" },
  { value: "冷藏車", label: "冷藏車" },
  { value: "不限", label: "不限" },
];

export default function CustomerOrder() {
  const { toast } = useToast();
  const [created, setCreated] = useState<Order | null>(null);
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      pickupDate: "",
      pickupTime: "",
      requiredLicense: "",
      pickupContactName: "",
      pickupAddress: "",
      pickupContactPerson: "",
      deliveryDate: "",
      deliveryTime: "",
      deliveryContactName: "",
      deliveryAddress: "",
      deliveryContactPerson: "",
      cargoDescription: "",
      cargoQuantity: "",
      specialRequirements: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const order = await createOrder({
        data: {
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          pickupDate: data.pickupDate || null,
          pickupTime: data.pickupTime || null,
          requiredLicense: data.requiredLicense || null,
          pickupContactName: data.pickupContactName || null,
          pickupAddress: data.pickupAddress,
          pickupContactPerson: data.pickupContactPerson || null,
          deliveryDate: data.deliveryDate || null,
          deliveryTime: data.deliveryTime || null,
          deliveryContactName: data.deliveryContactName || null,
          deliveryAddress: data.deliveryAddress,
          deliveryContactPerson: data.deliveryContactPerson || null,
          cargoDescription: data.cargoDescription,
          cargoQuantity: data.cargoQuantity || null,
          cargoWeight: data.cargoWeight ?? null,
          requiredVehicleType: data.requiredVehicleType || null,
          needTailgate: data.needTailgate || null,
          needHydraulicPallet: data.needHydraulicPallet || null,
          specialRequirements: data.specialRequirements || null,
        },
      });
      setCreated(order);
    } catch {
      toast({ title: "下單失敗", description: "請稍後再試", variant: "destructive" });
    }
  };

  const copyOrderId = () => {
    if (created) {
      navigator.clipboard.writeText(String(created.id));
      toast({ title: "已複製", description: "訂單編號已複製到剪貼板" });
    }
  };

  if (created) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-foreground">下單成功！</h1>
          <p className="text-muted-foreground text-sm mt-1">富詠運輸已收到您的委託</p>
        </div>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="p-5 text-center">
            <p className="text-xs text-muted-foreground mb-1">您的訂單編號</p>
            <p className="text-4xl font-mono font-bold text-primary">#{created.id}</p>
            <Button variant="outline" size="sm" onClick={copyOrderId} className="mt-3 gap-2">
              <Copy className="w-3.5 h-3.5" /> 複製編號
            </Button>
            <p className="text-xs text-muted-foreground mt-3">請保存此編號以便日後查詢</p>
          </CardContent>
        </Card>

        <Card className="border bg-white">
          <CardContent className="p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">委託人</span>
              <span className="font-medium">{created.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">貨物</span>
              <span className="font-medium">{created.cargoDescription}</span>
            </div>
            {created.pickupDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">收貨日期</span>
                <span className="font-medium">{created.pickupDate} {created.pickupTime}</span>
              </div>
            )}
            {created.deliveryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">到貨日期</span>
                <span className="font-medium">{created.deliveryDate} {created.deliveryTime}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">狀態</span>
              <span className="font-medium text-amber-600">等待派車中</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button asChild variant="default" className="w-full">
            <Link href="/customer/track">查詢訂單狀態</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={() => { setCreated(null); form.reset(); }}>
            再下一筆訂單
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">立即下單</h1>
        <p className="text-muted-foreground text-sm mt-1">填寫以下資訊，我們將儘快安排派車</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* 委託方 */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> 委託方資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <FormField control={form.control} name="customerName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">姓名 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="王小明" className="h-11" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">電話 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="tel" placeholder="0912-345-678" className="h-11" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* 收貨資訊 */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> 收貨資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="pickupDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">收貨日期</FormLabel>
                    <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="pickupTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">收貨時間</FormLabel>
                    <FormControl><Input type="time" className="h-11" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="requiredLicense" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">所需證照</FormLabel>
                  <FormControl><Input placeholder="例：甲類大貨車、無" className="h-11" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="pickupContactName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">收貨客戶名稱</FormLabel>
                  <FormControl><Input placeholder="公司或個人名稱" className="h-11" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">收貨客戶地址 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="台北市信義區市府路45號" className="h-11" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="pickupContactPerson" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">收貨聯絡人及電話</FormLabel>
                  <FormControl><Input placeholder="張先生 0912-345-678" className="h-11" {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* 到貨資訊 */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> 到貨資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">到貨日期</FormLabel>
                    <FormControl><Input type="date" className="h-11" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="deliveryTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">到貨時間</FormLabel>
                    <FormControl><Input type="time" className="h-11" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="deliveryContactName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">到貨客戶名稱</FormLabel>
                  <FormControl><Input placeholder="公司或個人名稱" className="h-11" {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">到貨客戶地址 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="新北市板橋區文化路100號" className="h-11" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="deliveryContactPerson" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">到貨聯絡人及電話</FormLabel>
                  <FormControl><Input placeholder="李小姐 0988-765-432" className="h-11" {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* 貨物資訊 */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> 貨物資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <FormField control={form.control} name="cargoDescription" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">貨物描述 <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="辦公設備、家電、建材..." className="h-11" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="cargoQuantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">貨物數量</FormLabel>
                    <FormControl><Input placeholder="3箱 / 10件" className="h-11" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="cargoWeight" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">貨物重量</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}>
                      <FormControl>
                        <SelectTrigger className="h-11"><SelectValue placeholder="請選擇" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WEIGHT_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* 車輛需求 */}
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" /> 車輛需求
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <FormField control={form.control} name="requiredVehicleType" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">車型</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger className="h-11"><SelectValue placeholder="請選擇車型" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VEHICLE_TYPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="needTailgate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">是否需尾門</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="h-11"><SelectValue placeholder="請選擇" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="yes">需要</SelectItem>
                        <SelectItem value="no">不需要</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="needHydraulicPallet" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">是否需油壓板車</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="h-11"><SelectValue placeholder="請選擇" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="yes">需要</SelectItem>
                        <SelectItem value="no">不需要</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="specialRequirements" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">有什麼要求</FormLabel>
                  <FormControl>
                    <Textarea placeholder="請小心輕放、需搬運至3樓、冷藏運送..." rows={3} className="resize-none" {...field} />
                  </FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Button type="submit" disabled={isPending} className="w-full h-12 text-base gap-2">
            <Package className="w-4 h-4" />
            {isPending ? "送出中..." : "確認下單"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
