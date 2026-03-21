import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, User, Package as PackageIcon, FileText, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { motion } from "framer-motion";

const orderFormSchema = z.object({
  customerName: z.string().min(2, "請輸入完整的客戶名稱"),
  customerPhone: z.string().min(8, "請輸入有效的聯絡電話"),
  pickupAddress: z.string().min(5, "請輸入詳細的取貨地址"),
  deliveryAddress: z.string().min(5, "請輸入詳細的送貨地址"),
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
      pickupAddress: "",
      deliveryAddress: "",
      cargoDescription: "",
      cargoWeight: undefined,
      notes: "",
    },
  });

  const onSubmit = async (data: OrderFormValues) => {
    try {
      const result = await createOrder({ data });
      setSuccessOrderId(result.id);
      form.reset();
      toast({
        title: "訂單建立成功！",
        description: `系統已接收您的託運需求 (單號: #${result.id})`,
      });
    } catch (error) {
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto mt-12"
      >
        <Card className="text-center p-8 border-green-100 shadow-xl shadow-green-500/10">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">訂單已成功送出</h2>
          <p className="text-slate-500 mb-8">
            感謝您的託運，您的訂單編號為 <span className="font-mono font-bold text-slate-900">#{successOrderId}</span>。<br/>
            我們將盡快為您安排司機。
          </p>
          <Button 
            size="lg" 
            onClick={() => setSuccessOrderId(null)}
            className="rounded-full px-8 shadow-md"
          >
            建立新訂單
          </Button>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">客戶下單</h1>
        <p className="text-slate-500 mt-2">填寫以下資訊以建立新的物流託運需求。</p>
      </div>

      <Card className="shadow-lg shadow-slate-200/40 dark:shadow-none border-0 ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-primary to-accent"></div>
        <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 pb-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-primary" />
            託運單填寫
          </CardTitle>
          <CardDescription>請確保聯絡電話與地址資訊正確無誤</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider pb-2 border-b">
                    <User className="w-4 h-4 text-primary" />
                    聯絡資訊
                  </div>
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>客戶名稱 <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="例如：王小明 或 某某科技公司" className="bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>聯絡電話 <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="0912-345-678" className="bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider pb-2 border-b">
                    <PackageIcon className="w-4 h-4 text-primary" />
                    貨物資訊
                  </div>
                  <FormField
                    control={form.control}
                    name="cargoDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>貨物內容 <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="例如：辦公設備 3箱" className="bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cargoWeight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>預估重量 (公斤)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="選填" className="bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-6 pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider pb-2 border-b">
                  <MapPin className="w-4 h-4 text-primary" />
                  運送地址
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                  <FormField
                    control={form.control}
                    name="pickupAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>取貨地址 <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Textarea placeholder="請輸入完整的取貨地址" className="resize-none bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20 h-24" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="hidden md:flex absolute left-1/2 top-10 -translate-x-1/2 w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center border border-slate-200 dark:border-slate-700 z-10">
                    <span className="text-slate-400 text-xs font-bold">至</span>
                  </div>
                  <FormField
                    control={form.control}
                    name="deliveryAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>送貨地址 <span className="text-red-500">*</span></FormLabel>
                        <FormControl>
                          <Textarea placeholder="請輸入完整的送貨地址" className="resize-none bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20 h-24" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-6 pt-4">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>備註說明</FormLabel>
                      <FormControl>
                        <Input placeholder="其他需要司機注意的事項（選填）" className="bg-slate-50 dark:bg-slate-900 focus-visible:ring-primary/20" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-6 flex justify-end">
                <Button 
                  type="submit" 
                  size="lg" 
                  disabled={isPending}
                  className="px-8 shadow-md hover:shadow-lg transition-all rounded-xl"
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
