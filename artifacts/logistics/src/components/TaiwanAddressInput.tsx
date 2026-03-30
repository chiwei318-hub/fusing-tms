/**
 * TaiwanAddressInput — 簡潔版台灣地址輸入
 *
 * 使用邏輯：
 *   - 在搜尋框直接打字，下方出現 Nominatim 建議，點選即帶入
 *   - 點選欄位時顯示最近使用記錄
 *   - 可直接手打完整地址（不強制用建議）
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, X, Clock, Loader2, CheckCircle2, Search } from "lucide-react";
import { isAddressComplete } from "@/lib/taiwan-postal";
import { cn } from "@/lib/utils";

// ── Nominatim ─────────────────────────────────────────────────────────────────
interface NomResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city_district?: string;
    city?: string;
    county?: string;
    state?: string;
  };
}

let abortCtrl: AbortController | null = null;
async function nomSearch(q: string): Promise<NomResult[]> {
  if (abortCtrl) abortCtrl.abort();
  abortCtrl = new AbortController();
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + " 台灣")}&limit=6&countrycodes=tw&addressdetails=1&accept-language=zh-TW`;
    const r = await fetch(url, { signal: abortCtrl.signal, headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
    return (await r.json()) as NomResult[];
  } catch { return []; }
}

function formatResult(r: NomResult): string {
  const a = r.address;
  const state = (a.state ?? "").replace(/台灣省|臺灣省/, "");
  const city  = a.county ?? a.city ?? "";
  const dist  = a.city_district ?? a.suburb ?? "";
  const road  = a.road ?? "";
  const num   = a.house_number ? `${a.house_number}號` : "";
  const parts = [state, city, dist, road, num].filter(Boolean);
  return parts.join("") || r.display_name.split(",")[0].trim();
}

// ── History ───────────────────────────────────────────────────────────────────
const MAX_H = 8;
function loadHist(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(`addr-h-${key}`) ?? "[]"); } catch { return []; }
}
function saveHist(key: string, v: string) {
  if (!v.trim()) return;
  const h = loadHist(key).filter(a => a !== v);
  localStorage.setItem(`addr-h-${key}`, JSON.stringify([v, ...h].slice(0, MAX_H)));
}
function delHist(key: string, v: string) {
  localStorage.setItem(`addr-h-${key}`, JSON.stringify(loadHist(key).filter(a => a !== v)));
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AddressLocation { lat: number; lng: number; formattedAddress: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  onLocationChange?: (loc: AddressLocation) => void;
  historyKey?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  onBlur?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TaiwanAddressInput({
  value, onChange, onLocationChange, historyKey = "default",
  placeholder = "縣市 + 區 + 路段 + 門牌號碼", className, error, onBlur,
}: Props) {
  const [query, setQuery]         = useState(value);
  const [sugs, setSugs]           = useState<NomResult[]>([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(false);
  const [hist, setHist]           = useState<string[]>([]);
  const [histOpen, setHistOpen]   = useState(false);

  const timer   = useRef<ReturnType<typeof setTimeout>>();
  const boxRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when parent changes value externally
  const prevVal = useRef(value);
  useEffect(() => {
    if (value !== prevVal.current && value !== query) setQuery(value);
    prevVal.current = value;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false); setHistOpen(false);
      }
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  const emit = useCallback((addr: string) => {
    prevVal.current = addr;
    onChange(addr);
    if (isAddressComplete(addr)) saveHist(historyKey, addr);
  }, [onChange, historyKey]);

  const handleChange = (v: string) => {
    setQuery(v);
    emit(v); // update parent immediately (free typing)
    clearTimeout(timer.current);
    setOpen(false);
    if (!v.trim()) { setSugs([]); return; }
    if (v.length < 3) return;
    setLoading(true);
    timer.current = setTimeout(async () => {
      const results = await nomSearch(v);
      setLoading(false);
      setSugs(results);
      if (results.length > 0) { setOpen(true); setHistOpen(false); }
    }, 400);
  };

  const pickSuggestion = (r: NomResult) => {
    const addr = formatResult(r);
    setQuery(addr); emit(addr);
    setSugs([]); setOpen(false); setHistOpen(false);
    onLocationChange?.({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), formattedAddress: addr });
  };

  const pickHistory = (addr: string) => {
    setQuery(addr); emit(addr);
    setHistOpen(false); setOpen(false);
  };

  const openHist = () => {
    const h = loadHist(historyKey);
    setHist(h);
    if (h.length > 0) { setHistOpen(true); setOpen(false); }
  };

  const clear = () => {
    setQuery(""); emit("");
    setSugs([]); setOpen(false); setHistOpen(false);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    setTimeout(() => { onBlur?.(); }, 150);
  };

  const validated = value ? isAddressComplete(value) : null;
  const showDropdown = open || histOpen;

  return (
    <div ref={boxRef} className={cn("relative w-full", className)}>
      {/* Input */}
      <div className={cn(
        "flex items-center gap-2 h-10 px-3 rounded-xl border bg-background transition-all",
        error ? "border-destructive ring-1 ring-destructive/20"
          : validated ? "border-emerald-400 ring-1 ring-emerald-100"
          : "border-input focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
      )}>
        {loading
          ? <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
          : validated
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            : <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={openHist}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
        />
        {query && (
          <button type="button" onPointerDown={e => { e.preventDefault(); clear(); }}
            className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Hint below */}
      {!value && !loading && (
        <p className="text-[10px] text-muted-foreground mt-0.5 ml-1 flex items-center gap-1">
          <Search className="w-2.5 h-2.5" />
          輸入 3 個字以上會自動搜尋建議地址
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">

          {/* Nominatim suggestions */}
          {open && sugs.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b bg-primary/5 text-[10px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                <Search className="w-3 h-3" /> 地址建議
              </div>
              {sugs.map(r => {
                const addr = formatResult(r);
                return (
                  <button key={r.place_id} type="button"
                    onPointerDown={e => { e.preventDefault(); pickSuggestion(r); }}
                    className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/60 text-left border-b last:border-0 transition-colors">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm leading-snug">{addr}</span>
                  </button>
                );
              })}
            </>
          )}

          {/* History */}
          {histOpen && hist.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" /> 最近使用
              </div>
              {hist.map((addr, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 border-b last:border-0 group">
                  <button type="button" onPointerDown={e => { e.preventDefault(); pickHistory(addr); }}
                    className="flex-1 flex items-center gap-2 text-left min-w-0">
                    <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{addr}</span>
                  </button>
                  <button type="button"
                    onPointerDown={e => {
                      e.preventDefault();
                      delHist(historyKey, addr);
                      setHist(h => h.filter(a => a !== addr));
                      if (hist.length === 1) setHistOpen(false);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}

        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1 ml-1">{error}</p>}
    </div>
  );
}
