/**
 * AddressAutocomplete.tsx
 * 地址智慧輸入元件 — 輸入時自動從歷史訂單建議地址
 * 顯示：使用次數、平均報價、最近使用時間
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Clock, TrendingUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Suggestion {
  address: string;
  frequency: number;
  avg_price: number | null;
  last_used: string | null;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: Suggestion) => void;
  placeholder?: string;
  type?: "pickup" | "delivery" | "both";
  customerId?: number;
  customerPhone?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  id?: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "請輸入地址",
  type = "both",
  customerId,
  customerPhone,
  className,
  disabled,
  label,
  id,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [focused, setFocused]         = useState(false);
  const timerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef                  = useRef<HTMLDivElement>(null);
  const inputRef                      = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, type, limit: "8" });
      if (customerId) params.set("customer_id", String(customerId));
      const res  = await fetch(`${API_BASE}/api/locations/autocomplete?${params}`);
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
      setOpen(Array.isArray(data) && data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [type, customerId]);

  useEffect(() => {
    if (!focused) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(value), 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, focused, fetchSuggestions]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(s: Suggestion) {
    onChange(s.address);
    onSelect?.(s);
    setOpen(false);
    setFocused(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
        <input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
            else if (value.length >= 1) fetchSuggestions(value);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm transition-colors",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
        {loading && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/30 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            歷史地址建議
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="px-3 py-2.5 hover:bg-accent cursor-pointer border-b border-border/50 last:border-0 group"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{s.address}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        共 {s.frequency} 次
                      </span>
                      {s.last_used && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {relativeTime(s.last_used)}
                        </span>
                      )}
                    </div>
                  </div>
                  {s.avg_price && Number(s.avg_price) > 0 && (
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        均 ${Number(s.avg_price).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
