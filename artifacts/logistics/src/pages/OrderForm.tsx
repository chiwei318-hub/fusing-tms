import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, User, Package as PackageIcon, FileText, CheckCircle2, Truck, Calendar, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import HistoryInput from "@/components/HistoryInput";
import { Button } from "@/components/ui/button";
import { TaiwanAddressInput } from "@/components/TaiwanAddressInput";
import { SmartDatePicker } from "@/components/SmartDatePicker";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion } from "framer-motion";

const orderFormSchema = z.object({
  customerName: z.string().min(2, "請輸入完整的客戶名稱"),
  customerPhone: z.string().min(8, "請輸入有效的聯絡電話"),
  customerEmail: z.string().email("請輸入有效的 Email").optional().or(z.literal("")),
  pickupAddress: z.string().min(5, "請輸入詳細的取貨地址"),
  pickupDate: z.string().optional(),
  pickupTime: z.string().optional(),
  pickupContactPerson: z.string().optional().nullable(),
  deliveryAddress: z.string().min(5, "請輸入詳細的送貨地址"),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
  deliveryContactPerson: z.string().optional().nullable(),
  cargoDescription: z.string().min(2, "請描述貨物內容"),
  cargoWeight: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

export default function OrderForm() {
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();
  const { toast } = useToast();
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      pickupAddress: "",
      pickupDate: "",
      pickupTime: "",
      pickupContactPerson: "",
      deliveryAddress: "",
      deliveryDate: "",
      deliveryTime: "",
      deliveryContactPerson: "",
      cargoDescription: "",
      cargoWeight: undefined,
      notes: "",
    },
  });

  const onSubmit = async (data: OrderFormValues) => {
    try {
      const result = await createOrder({
        data: {
          ...data,
          pickupDate: data.pickupDate || null,
          pickupTime: data.pickupTime || null,
          deliveryDate: data.deliveryDate || null,
          deliveryTime: data.deliveryTime || null,
          pickupContactPerson: data.pickupContactPerson || null,
          deliveryContactPerson: data.deliveryContactPerson || null,
          customerEmail: data.customerEmail || null,
        } as any,
      });
      setSuccessOrderId(result.id);
      form.reset();
    } catch {
      toast({
        title: "建立失敗",
        description: "無法送出訂單，請稍後再試。",
        variant: "destructive",
      });
    }
  };

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
          <p className="text-muted-foreground mb-2">
            感謝您的委託，您的訂單編號為
          </p>
          <div className="text-3xl font-mono font-bold text-primary mb-6">#{successOrderId}</div>
          <p className="text-sm text-muted-foreground mb-8">
            我們將盡快為您安排專屬司機，請保持電話暢通。
          </p>
          <Button
            size="lg"
            onClick={() => setSuccessOrderId(null)}
            className="w-full rounded-xl"
          >
            建立新訂單
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-primary">富詠運輸</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">客戶下單</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">填寫以下資訊以建立新的物流託運需求</p>
      </div>

      <Card className="shadow-sm border overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-primary to-accent"></div>
        <CardHeader className="bg-muted/30 border-b pb-5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            託運單填寫
          </CardTitle>
          <CardDescription>請確保聯絡電話與地址資訊正確無誤</CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-7">

              {/* ─ 聯絡 + 貨物資訊 ─ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider pb-2 border-b">
                    <PackageIcon className="w-3.5 h-3.5 text-primary" />
                    貨物資訊
                  </div>
                  <FormField control={form.control} name="cargoDescription" render={({ field }) => (
                    <FormItem>
                      <FormLabel>貨物內容 <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="例如：辦公設備 3箱" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cargoWeight" render={({ field }) => (
                    <FormItem>
                      <FormLabel>預估重量 (公斤)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" placeholder="選填" min="0" step="0.1" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

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
                      <TaiwanAddressInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        historyKey="orderform-pickup"
                      />
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
                      <HistoryInput fieldKey="order-pickupContact" placeholder="姓名 + 電話，例：王先生 0912-345-678" {...field} value={field.value ?? ""} />
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
                      <TaiwanAddressInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        historyKey="orderform-delivery"
                      />
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
                      <HistoryInput fieldKey="order-deliveryContact" placeholder="姓名 + 電話，例：李小姐 0988-765-432" {...field} value={field.value ?? ""} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>

              {/* ─ 備註 ─ */}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>備註說明</FormLabel>
                  <FormControl>
                    <Textarea placeholder="其他需要司機注意的事項（選填）" className="resize-none h-20" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-end">
                <Button
                  type="submit"
                  size="lg"
                  disabled={isPending}
                  className="w-full sm:w-auto px-8 rounded-xl"
                >
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
