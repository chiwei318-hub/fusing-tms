/**
 * SmartDatePicker
 * -----------------
 * Replaces <input type="date"> with a logistics-optimised date selector:
 *   • Quick-pick buttons: 今天 / 明天 / 後天 / 大後天
 *   • Full calendar popup via react-day-picker
 *   • Friendly Chinese display with weekday label
 *   • Optional minDate to block past dates (defaults to today)
 *   • value / onChange use "YYYY-MM-DD" strings (compatible with existing forms)
 */

import { useState, useRef, useEffect } from "react";
import { format, addDays, parseISO, isValid } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CalendarIcon, ChevronDown, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseDateStr(s: string): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

function friendlyLabel(dateStr: string): string {
  const d = parseDateStr(dateStr);
  if (!d) return "";
  const today = toDateStr(new Date());
  const tmrw  = toDateStr(addDays(new Date(), 1));
  const d2    = toDateStr(addDays(new Date(), 2));
  const d3    = toDateStr(addDays(new Date(), 3));
  if (dateStr === today) return `今天（${format(d, "M/d")} 週${WEEKDAYS[d.getDay()]}）`;
  if (dateStr === tmrw)  return `明天（${format(d, "M/d")} 週${WEEKDAYS[d.getDay()]}）`;
  if (dateStr === d2)    return `後天（${format(d, "M/d")} 週${WEEKDAYS[d.getDay()]}）`;
  if (dateStr === d3)    return `大後天（${format(d, "M/d")} 週${WEEKDAYS[d.getDay()]}）`;
  return `${format(d, "M月d日")} 週${WEEKDAYS[d.getDay()]}`;
}

interface QuickOption {
  label: string;
  sub: string;
  dateStr: string;
}

function buildQuickOptions(minDate?: Date): QuickOption[] {
  const base = minDate ?? new Date();
  const baseStr = toDateStr(base);
  const today = toDateStr(new Date());

  return [0, 1, 2, 3].map(offset => {
    const d = addDays(new Date(), offset);
    const str = toDateStr(d);
    const labels = ["今天", "明天", "後天", "大後天"];
    return {
      label: labels[offset],
      sub: `${format(d, "M/d")} 週${WEEKDAYS[d.getDay()]}`,
      dateStr: str,
      disabled: str < baseStr || str < today,
    };
  }).filter(o => !o.disabled) as QuickOption[];
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;
  placeholder?: string;
  className?: string;
  onBlur?: () => void;
  disabled?: boolean;
  error?: string;
}

export function SmartDatePicker({
  value,
  onChange,
  minDate,
  placeholder = "選擇日期",
  className,
  onBlur,
  disabled,
  error,
}: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = parseDateStr(value);
  const min = minDate ?? new Date(new Date().setHours(0, 0, 0, 0));
  const quickOptions = buildQuickOptions(min);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const handleQuick = (dateStr: string) => {
    onChange(dateStr);
    setCalOpen(false);
  };

  const handleCalSelect = (day: Date | undefined) => {
    if (!day) return;
    onChange(toDateStr(day));
    setCalOpen(false);
    onBlur?.();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setCalOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>

      {/* Quick-pick buttons row */}
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {quickOptions.map(opt => (
          <button
            key={opt.dateStr}
            type="button"
            disabled={disabled}
            onClick={() => handleQuick(opt.dateStr)}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[52px] transition-all text-center cursor-pointer",
              "hover:border-primary hover:bg-primary/5",
              value === opt.dateStr
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-input bg-background text-foreground",
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
            <span className={cn(
              "text-[9px] leading-tight mt-0.5",
              value === opt.dateStr ? "text-primary-foreground/80" : "text-muted-foreground",
            )}>{opt.sub}</span>
          </button>
        ))}

        {/* Custom date button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCalOpen(v => !v)}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[52px] transition-all cursor-pointer",
            "hover:border-primary hover:bg-primary/5",
            calOpen
              ? "border-primary bg-primary/10 text-primary"
              : value && !quickOptions.find(o => o.dateStr === value)
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-input bg-background text-foreground",
            disabled && "opacity-40 cursor-not-allowed",
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span className="text-[9px] leading-tight mt-0.5 text-muted-foreground">其他</span>
        </button>
      </div>

      {/* Selected date display */}
      <div
        className={cn(
          "flex items-center h-10 rounded-lg border px-3 gap-2 text-sm transition-colors bg-background",
          error ? "border-destructive ring-1 ring-destructive/20"
            : value ? "border-primary/60 bg-primary/5 text-foreground"
            : "border-input text-muted-foreground",
          disabled && "opacity-40 cursor-not-allowed",
        )}
      >
        <CalendarIcon className={cn("w-4 h-4 shrink-0", value ? "text-primary" : "text-muted-foreground")} />
        <span className="flex-1 text-sm font-medium truncate">
          {value ? friendlyLabel(value) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCalOpen(v => !v)}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", calOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* Calendar popover */}
      {calOpen && (
        <div className="absolute z-50 left-0 top-full mt-1.5 bg-background border rounded-xl shadow-2xl p-2 w-fit">
          <Calendar
            mode="single"
            selected={selected ?? undefined}
            onSelect={handleCalSelect}
            disabled={{ before: min }}
            locale={zhTW}
            captionLayout="label"
            className="scale-95 origin-top-left"
          />
        </div>
      )}
    </div>
  );
}
