import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Clock, Search, X, CheckCircle2, AlertCircle } from "lucide-react";
import { searchPostal, isAddressComplete, type PostalEntry } from "@/lib/taiwan-postal";
import { cn } from "@/lib/utils";

const MAX_HISTORY = 8;

function loadHistory(key: string): string[] {
  try {
    const raw = localStorage.getItem(`addr-history-${key}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, address: string) {
  const history = loadHistory(key).filter(a => a !== address);
  history.unshift(address);
  localStorage.setItem(`addr-history-${key}`, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  historyKey?: string;
  placeholder?: string;
  className?: string;
  error?: string;
  onBlur?: () => void;
}

export function TaiwanAddressInput({
  value,
  onChange,
  historyKey = "default",
  placeholder = "輸入郵遞區號或縣市區域名稱",
  className,
  error,
  onBlur,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const [zipSuggestions, setZipSuggestions] = useState<PostalEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [pendingDistrict, setPendingDistrict] = useState<PostalEntry | null>(null);
  const [streetInput, setStreetInput] = useState("");
  const [phase, setPhase] = useState<"search" | "street">("search");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);

  // Sync external value → local state
  useEffect(() => {
    setInputVal(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPhase("search");
        setPendingDistrict(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const handleFocus = useCallback(() => {
    setHistory(loadHistory(historyKey));
    setOpen(true);
  }, [historyKey]);

  const handleInputChange = useCallback((val: string) => {
    setInputVal(val);
    onChange(val);
    if (val.trim()) {
      setZipSuggestions(searchPostal(val));
    } else {
      setZipSuggestions([]);
    }
    setOpen(true);
    setPhase("search");
    setPendingDistrict(null);
  }, [onChange]);

  // User clicks a postal code suggestion → enter "street phase"
  const selectDistrict = useCallback((entry: PostalEntry) => {
    setPendingDistrict(entry);
    setStreetInput("");
    setPhase("street");
    setTimeout(() => streetRef.current?.focus(), 50);
  }, []);

  // Confirm full address after street input
  const confirmAddress = useCallback(() => {
    if (!pendingDistrict) return;
    const full = `${pendingDistrict.city}${pendingDistrict.district}${streetInput ? " " + streetInput.trim() : ""}`;
    setInputVal(full);
    onChange(full);
    saveHistory(historyKey, full);
    setOpen(false);
    setPhase("search");
    setPendingDistrict(null);
    setStreetInput("");
  }, [pendingDistrict, streetInput, onChange, historyKey]);

  // User picks a history address
  const selectHistory = useCallback((addr: string) => {
    setInputVal(addr);
    onChange(addr);
    saveHistory(historyKey, addr);
    setOpen(false);
  }, [onChange, historyKey]);

  const clearInput = useCallback(() => {
    setInputVal("");
    onChange("");
    setZipSuggestions([]);
    setPendingDistrict(null);
    setPhase("search");
    inputRef.current?.focus();
  }, [onChange]);

  const removeHistory = useCallback((addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = loadHistory(historyKey).filter(a => a !== addr);
    localStorage.setItem(`addr-history-${historyKey}`, JSON.stringify(next));
    setHistory(next);
  }, [historyKey]);

  const handleBlur = useCallback(() => {
    // Save current value to history if complete
    if (inputVal && isAddressComplete(inputVal)) {
      saveHistory(historyKey, inputVal);
    }
    onBlur?.();
  }, [inputVal, historyKey, onBlur]);

  const validated = inputVal ? isAddressComplete(inputVal) : null;
  const showDropdown = open && (phase === "street" || zipSuggestions.length > 0 || (history.length > 0 && !inputVal.trim()));

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Main input */}
      <div className={cn(
        "relative flex items-center rounded-lg border bg-white transition-all",
        error ? "border-destructive ring-1 ring-destructive/30" : validated ? "border-emerald-400 ring-1 ring-emerald-200" : "border-input focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
        className,
      )}>
        <MapPin className={cn("w-4 h-4 shrink-0 ml-3", error ? "text-destructive" : validated ? "text-emerald-500" : "text-muted-foreground")} />
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 h-12 px-2.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
        {validated && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mr-2.5" />}
        {error && !inputVal && <AlertCircle className="w-4 h-4 text-destructive shrink-0 mr-2.5" />}
        {inputVal && (
          <button
            type="button"
            onPointerDown={e => { e.preventDefault(); clearInput(); }}
            className="w-7 h-7 flex items-center justify-center mr-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Validation hint */}
      {inputVal && !validated && !error && (
        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          請確認地址包含完整路名與門牌號碼
        </p>
      )}
      {validated && (
        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          地址格式正確
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">

          {/* ── Street phase ── */}
          {phase === "street" && pendingDistrict && (
            <div className="p-3 border-b bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {pendingDistrict.zip}
                </span>
                <span className="text-sm font-bold text-primary">
                  {pendingDistrict.city}{pendingDistrict.district}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  ref={streetRef}
                  type="text"
                  value={streetInput}
                  onChange={e => setStreetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmAddress(); } }}
                  placeholder="繼續輸入路段門牌，例：中正路一段12號3樓"
                  className="flex-1 h-10 px-3 text-sm border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white"
                />
                <button
                  type="button"
                  onClick={confirmAddress}
                  className="px-3 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shrink-0"
                >
                  確認
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">按 Enter 或點「確認」完成地址</p>
            </div>
          )}

          {/* ── Postal code suggestions ── */}
          {phase === "search" && zipSuggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1">
                郵遞區號搜尋結果
              </p>
              {zipSuggestions.map((entry, i) => (
                <button
                  key={`${entry.zip}-${entry.city}-${entry.district}-${i}`}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); selectDistrict(entry); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                >
                  <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">
                    {entry.zip}
                  </span>
                  <span className="text-sm">
                    <span className="font-semibold">{entry.city}</span>
                    <span className="text-muted-foreground">{entry.district}</span>
                  </span>
                  <Search className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* ── History ── */}
          {phase === "search" && !inputVal.trim() && history.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 最近使用地址
              </p>
              {history.map((addr, i) => (
                <div key={i} className="flex items-center gap-2 px-2 hover:bg-muted/50 transition-colors group">
                  <button
                    type="button"
                    onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                    className="flex-1 flex items-center gap-2 py-2.5 text-left min-w-0"
                  >
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground truncate">{addr}</span>
                  </button>
                  <button
                    type="button"
                    onPointerDown={e => removeHistory(addr, e)}
                    className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all rounded shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state ── */}
          {phase === "search" && zipSuggestions.length === 0 && !inputVal.trim() && history.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-muted-foreground">
              <Search className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
              <p>輸入郵遞區號（如 100）或縣市名稱開始搜尋</p>
            </div>
          )}

          {phase === "search" && inputVal.trim() && zipSuggestions.length === 0 && (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">
              <p>找不到符合的區域，請嘗試其他關鍵字</p>
              <p className="text-xs mt-1">可輸入：郵遞區號、縣市名稱、行政區名稱</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
