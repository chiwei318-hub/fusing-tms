import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, MapPin, Package, Navigation, AlertTriangle, Image } from "lucide-react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface TimelineStep {
  status: string;
  label: string;
  time: string | null;
  icon: string;
  done: boolean;
  active: boolean;
}

interface TimelineData {
  orderId: number;
  currentStatus: string;
  steps: TimelineStep[];
  exception: {
    code: string;
    label: string;
    note: string;
    attribution: string;
    at: string;
  } | null;
  pod: {
    photo_url: string | null;
    note: string | null;
    completed_at: string | null;
  };
  history: { from_status: string; to_status: string; actor: string; note: string; occurred_at: string }[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  "clock": Clock,
  "truck": Navigation,
  "map-pin": MapPin,
  "package": Package,
  "navigation": Navigation,
  "check-circle": CheckCircle2,
};

function fmt(s: string | null) {
  if (!s) return null;
  try { return format(new Date(s), "MM/dd HH:mm", { locale: zhTW }); }
  catch { return s; }
}

export function OrderStatusTimeline({ orderId }: { orderId: number }) {
  const { data, isLoading } = useQuery<TimelineData>({
    queryKey: ["order-timeline", orderId],
    queryFn: () => fetch(`${API}/orders/${orderId}/timeline`).then(r => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-16 text-sm text-muted-foreground">讀取狀態...</div>
  );
  if (!data || data.orderId == null) return null;

  const steps = data.steps;
  const isException = data.currentStatus === "exception";

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const Icon = ICON_MAP[step.icon] ?? Circle;
          const isLast = i === steps.length - 1;
          return (
            <div key={step.status} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-0.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all shrink-0
                    ${step.active && !isException
                      ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-300"
                      : step.done
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-gray-300 text-gray-400"}`}
                >
                  {step.done && !step.active ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-[9px] font-semibold whitespace-nowrap
                  ${step.active ? "text-blue-600" : step.done ? "text-emerald-600" : "text-gray-400"}`}>
                  {step.label}
                </span>
                {step.time && (
                  <span className="text-[8px] text-muted-foreground whitespace-nowrap">{fmt(step.time)}</span>
                )}
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 mx-1 rounded-full transition-all
                  ${step.done ? "bg-emerald-400" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Exception banner */}
      {isException && data.exception && (
        <div className="rounded-xl border-2 border-orange-400 bg-orange-50 p-3 space-y-1">
          <div className="flex items-center gap-2 font-bold text-orange-700">
            <AlertTriangle className="w-4 h-4" />
            異常：{data.exception.label ?? data.exception.code}
          </div>
          {data.exception.note && (
            <p className="text-xs text-orange-600">{data.exception.note}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-orange-500">
            <span>責任方：{
              data.exception.attribution === "customer" ? "客戶"
              : data.exception.attribution === "driver" ? "司機"
              : "公司"
            }</span>
            {data.exception.at && <span>{fmt(data.exception.at)}</span>}
          </div>
        </div>
      )}

      {/* POD photo */}
      {data.pod.photo_url && (
        <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Image className="w-4 h-4 text-blue-600" /> 簽收照片（POD）
          </div>
          <img src={data.pod.photo_url} alt="POD" className="w-full rounded-lg object-cover max-h-40" />
          {data.pod.note && <p className="text-xs text-muted-foreground">{data.pod.note}</p>}
          {data.pod.completed_at && (
            <p className="text-xs text-muted-foreground">完成：{fmt(data.pod.completed_at)}</p>
          )}
        </div>
      )}

      {/* Status history (collapsed) */}
      {data.history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium py-1">
            查看狀態紀錄（{data.history.length} 筆）
          </summary>
          <div className="mt-2 space-y-1 border-l-2 border-gray-200 pl-3">
            {data.history.map((h, i) => (
              <div key={i} className="text-gray-600">
                <span className="font-medium">{h.to_status}</span>
                <span className="text-gray-400 mx-1">←</span>
                <span>{h.from_status}</span>
                <span className="ml-2 text-gray-400">{fmt(h.occurred_at)}</span>
                {h.note && <span className="ml-2 text-blue-600">備：{h.note}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
