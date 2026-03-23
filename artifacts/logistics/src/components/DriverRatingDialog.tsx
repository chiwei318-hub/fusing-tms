import { useState } from "react";
import { Star, Send, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface DriverRatingDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: number;
  driverId: number;
  driverName: string;
  customerId?: number;
}

export default function DriverRatingDialog({
  open, onClose, orderId, driverId, driverName, customerId,
}: DriverRatingDialogProps) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  const STAR_LABELS = ["", "非常不滿意", "不滿意", "普通", "滿意", "非常滿意"];

  const handleSubmit = async () => {
    if (stars === 0) {
      toast({ title: "請選擇星數", description: "請為司機選擇 1 到 5 顆星", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ratings/order/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, customerId: customerId ?? null, stars, comment }),
      });
      if (res.status === 409) {
        toast({ title: "已完成評分", description: "此訂單先前已評分過" });
        setDone(true);
        return;
      }
      if (!res.ok) throw new Error("評分失敗");
      setDone(true);
      toast({ title: "感謝您的評分！", description: `已給予 ${driverName} ${stars} 顆星評分` });
    } catch {
      toast({ title: "評分失敗", description: "請稍後再試", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStars(0);
    setHovered(0);
    setComment("");
    setDone(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            為司機評分
          </DialogTitle>
          <DialogDescription>訂單 #{orderId} · 司機：{driverName}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle className="w-12 h-12 text-emerald-500" />
            <p className="font-semibold text-lg">感謝您的評分！</p>
            <p className="text-sm text-muted-foreground">您的評價幫助我們持續改善服務品質</p>
            <Button onClick={handleClose} className="mt-2 w-full">關閉</Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Star selector */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setStars(s)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-10 h-10 transition-colors ${
                        s <= (hovered || stars)
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {(hovered || stars) > 0 && (
                <p className="text-sm font-medium text-yellow-600">
                  {STAR_LABELS[hovered || stars]}
                </p>
              )}
            </div>

            {/* Comment */}
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                留下評語（選填）
              </label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="您對本次服務有什麼看法？"
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">取消</Button>
              <Button onClick={handleSubmit} disabled={submitting || stars === 0} className="flex-1">
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {submitting ? "送出中..." : "送出評分"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
