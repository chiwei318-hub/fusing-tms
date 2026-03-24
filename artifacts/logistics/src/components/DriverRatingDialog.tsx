import { useState } from "react";
import { Star, CheckCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

interface DriverRatingDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: number;
  driverId: number;
  driverName: string;
  customerId?: number | null;
}

const STAR_LABELS = ["", "非常不滿意", "不滿意", "普通", "滿意", "非常滿意！"];
const STAR_LABEL_COLOR = ["", "text-red-600", "text-orange-500", "text-yellow-600", "text-blue-600", "text-emerald-600"];

const QUICK_TAGS: Record<number, { label: string; icon?: string }[]> = {
  5: [
    { label: "準時抵達" }, { label: "態度親切" }, { label: "貨物完好" },
    { label: "操作熟練" }, { label: "溝通順暢" }, { label: "下次指定" },
  ],
  4: [
    { label: "整體不錯" }, { label: "配合度高" }, { label: "準時抵達" },
  ],
  3: [
    { label: "尚可接受" }, { label: "效率待提升" }, { label: "態度一般" },
  ],
  2: [
    { label: "延誤到達" }, { label: "態度欠佳" }, { label: "溝通不良" },
  ],
  1: [
    { label: "嚴重延誤" }, { label: "態度惡劣" }, { label: "貨物損壞" }, { label: "拒絕配合" },
  ],
};

export default function DriverRatingDialog({
  open, onClose, orderId, driverId, driverName, customerId,
}: DriverRatingDialogProps) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [rewardMsg, setRewardMsg] = useState<string | null>(null);
  const { toast } = useToast();

  const activeStars = hovered || stars;

  const toggleTag = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleStarClick = (s: number) => {
    setStars(s);
    setSelectedTags([]);
  };

  const handleSubmit = async () => {
    if (stars === 0) {
      toast({ title: "請選擇星數", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fullComment = [
        selectedTags.length ? selectedTags.join("、") : "",
        comment.trim(),
      ].filter(Boolean).join("。");

      const res = await fetch(apiUrl(`/ratings/order/${orderId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          customerId: customerId ?? null,
          stars,
          comment: fullComment || null,
        }),
      });

      if (res.status === 409) {
        toast({ title: "已完成評分", description: "此訂單先前已評分過" });
        setDone(true);
        return;
      }
      if (!res.ok) throw new Error("評分失敗");

      const data = await res.json();
      if (data.performanceEvent) {
        setRewardMsg(data.performanceEvent.title);
      }
      setDone(true);
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
    setSelectedTags([]);
    setDone(false);
    setRewardMsg(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-400" />
            為司機評分
          </DialogTitle>
          <DialogDescription>
            訂單 #{orderId}・司機 <span className="font-semibold text-foreground">{driverName}</span>
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-lg">{stars >= 4 ? "謝謝您的好評！" : "感謝您的回饋"}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {stars >= 4 ? "您的鼓勵是司機持續進步的動力" : "我們會記錄並持續改善服務品質"}
              </p>
            </div>
            {rewardMsg && (
              <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium flex items-center gap-2">
                <ThumbsUp className="w-4 h-4 shrink-0" />
                {rewardMsg}
              </div>
            )}
            <Button onClick={handleClose} className="w-full mt-1">關閉</Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Star picker */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex gap-1.5"
                onMouseLeave={() => setHovered(0)}
              >
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setHovered(s)}
                    onClick={() => handleStarClick(s)}
                    className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                  >
                    <Star
                      className={`w-10 h-10 transition-colors ${
                        s <= activeStars
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-muted-foreground/20 fill-muted"
                      }`}
                    />
                  </button>
                ))}
              </div>
              {activeStars > 0 ? (
                <span className={`text-sm font-semibold ${STAR_LABEL_COLOR[activeStars]}`}>
                  {STAR_LABELS[activeStars]}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">請選擇評分</span>
              )}
            </div>

            {/* Quick tags */}
            {stars > 0 && QUICK_TAGS[stars] && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">快速評語（可多選）</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS[stars].map(({ label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleTag(label)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                        selectedTags.includes(label)
                          ? stars >= 4
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : "bg-red-600 text-white border-red-600 shadow-sm"
                          : "bg-white border-border text-foreground hover:border-primary/50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                補充說明 <span className="text-muted-foreground text-xs">(選填)</span>
              </label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="您對本次服務有什麼看法或建議…"
                rows={3}
                className="resize-none text-sm"
                maxLength={300}
              />
              <p className="text-right text-xs text-muted-foreground">{comment.length}/300</p>
            </div>

            {/* Penalty notice */}
            {stars <= 2 && stars > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-2 text-xs text-red-700">
                <ThumbsDown className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>您的負評將列入司機績效考核，多次負評將觸發系統獎罰機制。</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={handleClose} className="flex-1">跳過</Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || stars === 0}
                className={`flex-1 ${stars >= 4 ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
              >
                {submitting ? "送出中…" : "送出評分"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
