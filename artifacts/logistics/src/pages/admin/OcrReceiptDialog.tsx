import { useState, useRef } from "react";
import { Scan, Upload, RefreshCw, CheckCircle2, AlertTriangle, Camera, FileText, Banknote, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface OcrExtracted {
  orderNumber?: string | null;
  driverName?: string | null;
  driverLicensePlate?: string | null;
  customerName?: string | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  amount?: number | null;
  cargoDescription?: string | null;
  cargoQuantity?: number | null;
  cargoWeightKg?: number | null;
  notes?: string | null;
  isSignedByRecipient?: boolean;
  confidence?: number;
}

interface OcrResult {
  ok: boolean;
  extracted: OcrExtracted;
  commissionCalc: {
    driverId?: number;
    driverName?: string;
    amount: number;
    platformRate: number;
    driverRate: number;
    platformFee: number;
    driverEarning: number;
  } | null;
  matchedOrder: {
    id: number;
    status: string;
    totalFee: number;
    driverId: number;
    pickupAddress: string;
    deliveryAddress: string;
    customerName: string;
  } | null;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultOrderId?: number;
}

export default function OcrReceiptDialog({ open, onClose, defaultOrderId }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "result" | "confirm">("upload");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [orderId, setOrderId] = useState(defaultOrderId ? String(defaultOrderId) : "");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setPreviewUrl(dataUrl);
      setImageBase64(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function handleOcr() {
    if (!imageBase64) {
      toast({ title: "請先上傳簽單照片", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, any> = { imageBase64 };
      if (orderId) body.orderId = parseInt(orderId);

      const data: OcrResult = await fetch(apiUrl("/receipts/ocr"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());

      if (!data.ok) throw new Error(data.error ?? "OCR 辨識失敗");
      setResult(data);
      setStep("result");
    } catch (e: any) {
      toast({ title: "OCR 失敗", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!result?.commissionCalc) return;
    setConfirming(true);
    try {
      const { commissionCalc, extracted, matchedOrder } = result;
      const body: Record<string, any> = {
        amount: commissionCalc.amount,
        platformFee: commissionCalc.platformFee,
        driverEarning: commissionCalc.driverEarning,
        podPhotoUrl: previewUrl ?? undefined,
        notes: extracted.notes ?? undefined,
      };
      if (matchedOrder) body.orderId = matchedOrder.id;
      if (commissionCalc.driverId) body.driverId = commissionCalc.driverId;
      if (extracted.deliveryDate) body.deliveryDate = extracted.deliveryDate;

      const data = await fetch(apiUrl("/receipts/confirm-settlement"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());

      if (!data.ok) throw new Error(data.error);
      setStep("confirm");
      toast({ title: "✅ 對帳完成", description: `AR 單號 ${data.arRef}，抽成 NT$${commissionCalc.platformFee.toLocaleString()} 已入帳` });
    } catch (e: any) {
      toast({ title: "結算失敗", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setStep("upload");
    setPreviewUrl(null);
    setImageBase64(null);
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scan className="w-4 h-4 text-violet-600" />
            OCR 簽單辨識 & 自動對帳
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">訂單編號（選填，可自動比對）</Label>
              <Input
                placeholder="輸入訂單 ID"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Upload area */}
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-violet-200 rounded-xl p-6 text-center cursor-pointer hover:bg-violet-50 transition-colors"
            >
              {previewUrl ? (
                <div className="space-y-2">
                  <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                  <p className="text-xs text-green-600 font-medium">已選取，點擊重新上傳</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center mx-auto">
                    <Camera className="w-6 h-6 text-violet-600" />
                  </div>
                  <p className="text-sm text-gray-600 font-medium">點擊上傳簽收單照片</p>
                  <p className="text-xs text-gray-400">支援 JPG、PNG，建議拍攝清晰正面照</p>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <Button
              onClick={handleOcr}
              disabled={loading || !imageBase64}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              {loading
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />AI 辨識中…</>
                : <><Scan className="w-4 h-4 mr-2" />開始 AI 辨識</>
              }
            </Button>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            {/* Confidence badge */}
            {result.extracted.confidence !== undefined && (
              <div className="flex items-center gap-2">
                <div className={`flex-1 h-2 rounded-full overflow-hidden bg-gray-100`}>
                  <div
                    className={`h-full rounded-full ${result.extracted.confidence >= 0.8 ? "bg-green-500" : result.extracted.confidence >= 0.6 ? "bg-amber-500" : "bg-red-400"}`}
                    style={{ width: `${Math.round(result.extracted.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-600">
                  辨識信心 {Math.round((result.extracted.confidence ?? 0) * 100)}%
                </span>
              </div>
            )}

            {/* OCR fields */}
            <Card className="border-0 bg-gray-50">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                  <FileText className="w-3 h-3" />簽單資訊
                </p>
                {[
                  { label: "訂單編號", val: result.extracted.orderNumber },
                  { label: "司機", val: result.extracted.driverName },
                  { label: "車牌", val: result.extracted.driverLicensePlate },
                  { label: "客戶", val: result.extracted.customerName },
                  { label: "送達地址", val: result.extracted.deliveryAddress },
                  { label: "送達時間", val: result.extracted.deliveryDate ? `${result.extracted.deliveryDate} ${result.extracted.deliveryTime ?? ""}` : null },
                  { label: "貨品", val: result.extracted.cargoDescription },
                  { label: "件數", val: result.extracted.cargoQuantity ? `${result.extracted.cargoQuantity} 件` : null },
                ].map(({ label, val }) => val && (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-gray-400 shrink-0 mr-2">{label}</span>
                    <span className="text-gray-700 text-right font-medium">{val}</span>
                  </div>
                ))}
                {result.extracted.isSignedByRecipient !== undefined && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {result.extracted.isSignedByRecipient
                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /><span className="text-xs text-green-600">已簽收</span></>
                      : <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /><span className="text-xs text-amber-600">未簽收/不確定</span></>
                    }
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Matched order */}
            {result.matchedOrder && (
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-blue-700">已比對到訂單 #{result.matchedOrder.id}（{result.matchedOrder.customerName}）</span>
              </div>
            )}

            {/* Commission calculation */}
            {result.commissionCalc ? (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-700 flex items-center gap-1">
                    <Percent className="w-3 h-3" />自動抽成計算
                  </p>
                  {[
                    ["運費金額", `NT$${result.commissionCalc.amount.toLocaleString()}`],
                    ["平台抽成", `${result.commissionCalc.platformRate.toFixed(1)}% → NT$${result.commissionCalc.platformFee.toLocaleString()}`],
                    ["司機應收", `${result.commissionCalc.driverRate.toFixed(1)}% → NT$${result.commissionCalc.driverEarning.toLocaleString()}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-bold text-gray-800">{val}</span>
                    </div>
                  ))}
                  {result.commissionCalc.driverName && (
                    <p className="text-[10px] text-green-600 pt-0.5">司機：{result.commissionCalc.driverName}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                ⚠️ 無法辨識運費金額，請手動輸入後再確認。
              </div>
            )}

            <DialogFooter className="flex gap-2 pt-0">
              <Button variant="outline" onClick={reset} size="sm">重新上傳</Button>
              <Button
                onClick={handleConfirm}
                disabled={confirming || !result.commissionCalc}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                {confirming
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />寫入中…</>
                  : <><Banknote className="w-3.5 h-3.5 mr-1.5" />確認寫入對帳</>
                }
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "confirm" && result?.commissionCalc && (
          <div className="text-center py-6 space-y-3">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-gray-800">對帳完成！</p>
              <p className="text-sm text-gray-500 mt-1">
                平台抽成 <strong className="text-green-700">NT${result.commissionCalc.platformFee.toLocaleString()}</strong> 已記入 AR 帳冊
              </p>
              <p className="text-sm text-gray-500">
                司機應收 <strong className="text-blue-700">NT${result.commissionCalc.driverEarning.toLocaleString()}</strong> 已建立付款紀錄
              </p>
            </div>
            <Button onClick={() => { reset(); onClose(); }} variant="outline" size="sm">關閉</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
