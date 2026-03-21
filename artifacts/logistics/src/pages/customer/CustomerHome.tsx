import { Link } from "wouter";
import { Package, Search, ArrowRight, CheckCircle, Truck, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function CustomerHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">您好！</h1>
        <p className="text-muted-foreground text-sm mt-1">請選擇您需要的服務</p>
      </div>

      <div className="space-y-3">
        <Link href="/customer/order">
          <Card className="border-2 border-primary/20 hover:border-primary hover:shadow-md transition-all cursor-pointer group bg-white">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary/20 transition-colors">
                <Package className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-lg">立即下單</p>
                <p className="text-muted-foreground text-sm">填寫取送資訊建立訂單</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/customer/track">
          <Card className="border hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group bg-white">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="bg-blue-50 p-3 rounded-xl group-hover:bg-blue-100 transition-colors">
                <Search className="w-7 h-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-foreground text-lg">查詢訂單</p>
                <p className="text-muted-foreground text-sm">輸入電話或單號查看狀態</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* How it works */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">服務流程</p>
        <div className="space-y-2.5">
          {[
            { icon: Package, label: "填寫下單表單", sub: "提供取送地址與貨物資訊", color: "text-primary bg-primary/10" },
            { icon: Truck, label: "等待派車通知", sub: "系統指派司機為您服務", color: "text-blue-600 bg-blue-50" },
            { icon: Clock, label: "追蹤運送狀態", sub: "隨時查詢您的訂單進度", color: "text-amber-600 bg-amber-50" },
            { icon: CheckCircle, label: "簽收確認付款", sub: "完成配送後回報付款", color: "text-emerald-600 bg-emerald-50" },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border">
              <div className={`${step.color} p-2 rounded-lg shrink-0`}>
                <step.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
