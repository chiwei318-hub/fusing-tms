import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Package, MapPin, User, CheckCircle, Copy } from "lucide-react";
import { useCreateOrderMutation } from "@/hooks/use-orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Order } from "@workspace/api-client-react/src/generated/api.schemas";

const schema = z.object({
  customerName: z.string().min(1, "請填寫姓名"),
  customerPhone: z.string().min(8, "請填寫有效電話"),
  pickupAddress: z.string().min(5, "請填寫完整取貨地址"),
  deliveryAddress: z.string().min(5, "請填寫完整送貨地址"),
  cargoDescription: z.string().min(2, "請描述貨物內容"),
  cargoWeight: z.number().positive().nullable().optional(),
  notes: z.string().optional(),
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

export default function CustomerOrder() {
  const { toast } = useToast();
  const [created, setCreated] = useState<Order | null>(null);
  const { mutateAsync: createOrder, isPending } = useCreateOrderMutation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      pickupAddress: "",
      deliveryAddress: "",
      cargoDescription: "",
      notes: "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const order = await createOrder({
        data: {
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          pickupAddress: data.pickupAddress,
          deliveryAddress: data.deliveryAddress,
          cargoDescription: data.cargoDescription,
          cargoWeight: data.cargoWeight ?? null,
          notes: data.notes || null,
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
              <span className="text-muted-foreground">客戶姓名</span>
              <span className="font-medium">{created.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">貨物</span>
              <span className="font-medium">{created.cargoDescription}</span>
            </div>
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
          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> 聯絡資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <FormField control={form.control} name="customerName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">姓名 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="王小明" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="customerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">電話 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="0912-345-678" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card className="border bg-white">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> 運送地址
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <FormField control={form.control} name="pickupAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">取貨地址 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="台北市信義區市府路45號" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">送貨地址 <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="新北市板橋區文化路100號" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

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
                  <FormControl>
                    <Input placeholder="辦公設備 3箱" className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cargoWeight" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">預估重量</FormLabel>
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
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">備註說明</FormLabel>
                  <FormControl>
                    <Textarea placeholder="請小心輕放、需搬運至3樓..." rows={3} className="resize-none" {...field} />
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
