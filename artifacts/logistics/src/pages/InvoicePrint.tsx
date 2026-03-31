import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Printer, ArrowLeft } from "lucide-react";

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_type: string;
  buyer_name: string;
  buyer_tax_id: string | null;
  seller_name: string;
  seller_tax_id: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  items: Array<{ description: string; qty: number; unitPrice: number; total: number }> | null;
  notes: string | null;
  status: string;
  issued_at: string;
  order_id: number | null;
  pickup_address: string | null;
  delivery_address: string | null;
  cargo_description: string | null;
  customer_name: string | null;
}

export default function InvoicePrint() {
  const [location] = useLocation();
  const id = location.split("/invoice-print/")[1]?.split("/")[0];

  const { data: inv, isLoading, error } = useQuery<Invoice>({
    queryKey: ["invoice", id],
    queryFn: () => fetch(apiUrl(`/invoices/${id}`)).then(r => r.json()),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">載入發票中…</div>
      </div>
    );
  }

  if (error || !inv || (inv as any).error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">發票不存在或已刪除</div>
      </div>
    );
  }

  const isVoided = inv.status === "voided";
  const typeLabel: Record<string, string> = {
    receipt: "收　　據",
    b2b: "統一發票",
    monthly: "月結帳單",
  };

  const items = inv.items ?? [
    {
      description: inv.cargo_description
        ? `物流運送服務（${inv.cargo_description}）`
        : "物流運送服務",
      qty: 1,
      unitPrice: inv.amount,
      total: inv.amount,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Action bar (hidden when printing) */}
      <div className="no-print bg-white border-b px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <div className="flex items-center gap-3">
          {isVoided && (
            <span className="text-red-600 font-bold text-sm border border-red-400 px-3 py-1 rounded-full">已作廢</span>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-4 h-4" /> 列印 / 儲存 PDF
          </button>
        </div>
      </div>

      {/* A4 page */}
      <div className="mx-auto my-8 bg-white shadow-xl print:shadow-none print:my-0"
        style={{ width: "210mm", minHeight: "297mm", padding: "18mm 20mm" }}>

        {isVoided && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 rotate-[-30deg]">
            <span className="text-red-600 font-black text-[100px] tracking-widest border-[6px] border-red-600 px-8 py-4 rounded-2xl">已作廢</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-gray-900">富詠運輸有限公司</h1>
            <p className="text-sm text-gray-500 mt-0.5">FUYI TRANSPORT CO., LTD.</p>
            <p className="text-xs text-gray-400 mt-1">統一編號：{inv.seller_tax_id}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-blue-700 tracking-wider">{typeLabel[inv.invoice_type] ?? "發票"}</div>
            <div className="text-lg font-mono font-bold text-gray-700 mt-1">{inv.invoice_number}</div>
            <div className="text-xs text-gray-400 mt-1">
              開立日期：{format(new Date(inv.issued_at), "yyyy 年 M 月 d 日", { locale: zhTW })}
            </div>
            {inv.order_id && (
              <div className="text-xs text-blue-600 mt-0.5">關聯訂單：#{inv.order_id}</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-gray-900 mb-4" />

        {/* Buyer / Seller info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">買　方</div>
            <div className="font-bold text-base text-gray-900">{inv.buyer_name}</div>
            {inv.buyer_tax_id && (
              <div className="text-sm text-gray-600 mt-1">統一編號：{inv.buyer_tax_id}</div>
            )}
          </div>
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">賣　方</div>
            <div className="font-bold text-base text-gray-900">{inv.seller_name}</div>
            <div className="text-sm text-gray-600 mt-1">統一編號：{inv.seller_tax_id}</div>
          </div>
        </div>

        {/* Order info (if any) */}
        {(inv.pickup_address || inv.delivery_address) && (
          <div className="border rounded-lg p-4 mb-5 bg-blue-50/40">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">服務資訊</div>
            {inv.pickup_address && (
              <div className="text-sm text-gray-700"><span className="font-semibold">取貨：</span>{inv.pickup_address}</div>
            )}
            {inv.delivery_address && (
              <div className="text-sm text-gray-700 mt-1"><span className="font-semibold">送達：</span>{inv.delivery_address}</div>
            )}
          </div>
        )}

        {/* Items table */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-2 pr-3 font-bold text-gray-700">品項說明</th>
              <th className="text-right py-2 px-3 font-bold text-gray-700 w-12">數量</th>
              <th className="text-right py-2 px-3 font-bold text-gray-700 w-28">單價</th>
              <th className="text-right py-2 pl-3 font-bold text-gray-700 w-28">小計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-3 pr-3 text-gray-800">{item.description}</td>
                <td className="py-3 px-3 text-right text-gray-700">{item.qty}</td>
                <td className="py-3 px-3 text-right text-gray-700">NT${item.unitPrice.toLocaleString()}</td>
                <td className="py-3 pl-3 text-right text-gray-800 font-medium">NT${item.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>未稅金額</span>
              <span>NT${inv.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>營業稅（5%）</span>
              <span>NT${inv.tax_amount.toLocaleString()}</span>
            </div>
            <div className="border-t-2 border-gray-900 pt-2 flex justify-between font-black text-lg">
              <span>合計金額</span>
              <span className="text-blue-700">NT${inv.total_amount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="border rounded-lg p-4 mb-6 bg-amber-50/40">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">備　注</div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{inv.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-8 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-6 text-sm text-gray-500">
            <div>
              <div className="font-semibold text-gray-700 mb-3">付款方式</div>
              <p>銀行轉帳 / 支票</p>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700 mb-3">出具人簽章</div>
              <div className="border border-gray-300 rounded h-12 mt-1" />
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700 mb-3">收款人簽章</div>
              <div className="border border-gray-300 rounded h-12 mt-1" />
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-6">
            本發票由系統自動產生 · {inv.invoice_number} · 富詠運輸有限公司
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </div>
  );
}
