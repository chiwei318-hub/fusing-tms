/**
 * TaiwanAddressInput — Smart Taiwan address selector
 *
 * Modes:
 *   1. Smart Search  — keyword / postal-code / Google Maps Autocomplete
 *   2. Structured    — City ▸ District ▸ Road/Lane ▸ Number cascading
 *
 * Google Maps requires VITE_GOOGLE_MAPS_API_KEY in env.
 * If absent the component degrades gracefully (postal search only).
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MapPin, Clock, Search, X, CheckCircle2, AlertCircle,
  SlidersHorizontal, Navigation2, ChevronDown, Loader2,
} from "lucide-react";
import { searchPostal, isAddressComplete, TAIWAN_POSTAL, type PostalEntry } from "@/lib/taiwan-postal";
import { cn } from "@/lib/utils";

// ─── Google Maps ──────────────────────────────────────────────────────────────

const GMAPS_KEY = (import.meta as Record<string, Record<string, string>>).env?.VITE_GOOGLE_MAPS_API_KEY ?? "";

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          AutocompleteService: new () => GmAutoSvc;
          PlacesServiceStatus: { OK: string };
        };
        Geocoder: new () => GmGeocoder;
      };
    };
    __gmapsLoading?: boolean;
    __gmapsReady?: boolean;
  }
}

interface GmPrediction {
  place_id: string;
  description: string;
  structured_formatting: { main_text: string; secondary_text: string };
}
interface GmAutoSvc {
  getPlacePredictions(
    req: { input: string; componentRestrictions: { country: string }; types: string[] },
    cb: (r: GmPrediction[] | null, s: string) => void,
  ): void;
}
interface GmGeocoder {
  geocode(
    req: { placeId: string },
    cb: (r: { formatted_address: string; geometry: { location: { lat(): number; lng(): number } } }[] | null, s: string) => void,
  ): void;
}

function loadGoogleMaps(): Promise<void> {
  if (window.__gmapsReady) return Promise.resolve();
  if (window.__gmapsLoading) {
    return new Promise(res => {
      const iv = setInterval(() => { if (window.__gmapsReady) { clearInterval(iv); res(); } }, 100);
    });
  }
  window.__gmapsLoading = true;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=zh-TW`;
    s.onload = () => { window.__gmapsReady = true; res(); };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

function useGoogleMapsReady() {
  const [ready, setReady] = useState(!!window.__gmapsReady);
  useEffect(() => {
    if (!GMAPS_KEY || ready) return;
    loadGoogleMaps().then(() => setReady(true)).catch(() => {});
  }, [ready]);
  return ready;
}

// ─── Taiwan postal helpers ────────────────────────────────────────────────────

const CITIES = [...new Set(TAIWAN_POSTAL.map(e => e.city))];

function getDistricts(city: string) {
  return TAIWAN_POSTAL.filter(e => e.city === city);
}

function getZip(city: string, district: string) {
  return TAIWAN_POSTAL.find(e => e.city === city && e.district === district)?.zip ?? "";
}

/** Try to parse "台北市中正區中正路一段12號" into parts */
function parseAddress(full: string): { city: string; district: string; road: string; num: string } {
  let remaining = full.trim();
  let city = "";
  let district = "";
  for (const c of CITIES) {
    if (remaining.startsWith(c)) { city = c; remaining = remaining.slice(c.length); break; }
  }
  if (city) {
    for (const e of getDistricts(city)) {
      if (remaining.startsWith(e.district)) { district = e.district; remaining = remaining.slice(e.district.length); break; }
    }
  }
  // Split road from number at first digit followed by 號
  const numMatch = remaining.match(/^(.*?)(\d+[號樓]?.*)$/);
  const road = numMatch ? numMatch[1].trim() : remaining.trim();
  const num = numMatch ? numMatch[2].trim() : "";
  return { city, district, road, num };
}

// ─── History ──────────────────────────────────────────────────────────────────

const MAX_HISTORY = 8;
function loadHistory(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(`addr-history-${key}`) ?? "[]"); } catch { return []; }
}
function saveHistory(key: string, addr: string) {
  const h = loadHistory(key).filter(a => a !== addr);
  h.unshift(addr);
  localStorage.setItem(`addr-history-${key}`, JSON.stringify(h.slice(0, MAX_HISTORY)));
}

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Structured Mode ──────────────────────────────────────────────────────────

interface StructuredProps {
  initial: { city: string; district: string; road: string; num: string };
  gmReady: boolean;
  onConfirm: (addr: string) => void;
  onGmSelect?: (loc: AddressLocation) => void;
  onCancel: () => void;
}

function StructuredMode({ initial, gmReady, onConfirm, onGmSelect, onCancel }: StructuredProps) {
  const [city, setCity] = useState(initial.city);
  const [district, setDistrict] = useState(initial.district);
  const [road, setRoad] = useState(initial.road);
  const [num, setNum] = useState(initial.num);
  const [gmSuggestions, setGmSuggestions] = useState<GmPrediction[]>([]);
  const [roadFocused, setRoadFocused] = useState(false);
  const [loadingGm, setLoadingGm] = useState(false);
  const autoSvc = useRef<GmAutoSvc | null>(null);
  const geocoder = useRef<GmGeocoder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (gmReady && window.google) {
      autoSvc.current = new window.google.maps.places.AutocompleteService();
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, [gmReady]);

  const districts = city ? getDistricts(city) : [];
  const zip = city && district ? getZip(city, district) : "";
  const combined = [city, district, road, num].filter(Boolean).join("");

  const handleCityChange = (c: string) => { setCity(c); setDistrict(""); setRoad(""); setNum(""); };

  const handleRoadChange = (val: string) => {
    setRoad(val);
    clearTimeout(timerRef.current);
    if (!val.trim() || !autoSvc.current) { setGmSuggestions([]); return; }
    const query = `${city}${district}${val}`;
    setLoadingGm(true);
    timerRef.current = setTimeout(() => {
      autoSvc.current!.getPlacePredictions(
        { input: query, componentRestrictions: { country: "tw" }, types: ["address"] },
        (results, status) => {
          setLoadingGm(false);
          setGmSuggestions(status === "OK" ? (results ?? []).slice(0, 5) : []);
        },
      );
    }, 350);
  };

  const handleGmSelect = (pred: GmPrediction) => {
    setGmSuggestions([]);
    if (!geocoder.current) return;
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣/, "").trim();
        const { city: c, district: d, road: r, num: n } = parseAddress(full);
        if (c) setCity(c);
        if (d) setDistrict(d);
        if (r) setRoad(r);
        if (n) setNum(n);
        const loc: AddressLocation = {
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
          formattedAddress: full,
        };
        onGmSelect?.(loc);
        onConfirm(full);
      }
    });
  };

  const handleConfirm = () => {
    if (!city) return;
    onConfirm(combined);
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-background shadow-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" />結構式選址
        </span>
        {zip && <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{zip}</span>}
      </div>

      {/* Row 1: City + District */}
      <div className="grid grid-cols-2 gap-2 p-3 border-b">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold block mb-1">縣市</label>
          <div className="relative">
            <select
              value={city}
              onChange={e => handleCityChange(e.target.value)}
              className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              <option value="">選擇縣市</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold block mb-1">區域</label>
          <div className="relative">
            <select
              value={district}
              onChange={e => setDistrict(e.target.value)}
              disabled={!city}
              className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-40"
            >
              <option value="">{city ? "選擇區域" : "—"}</option>
              {districts.map(d => (
                <option key={d.zip} value={d.district}>{d.district}（{d.zip}）</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Row 2: Road + Number */}
      <div className="grid grid-cols-5 gap-2 p-3 border-b relative">
        <div className="col-span-3 relative">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold block mb-1">
            路 / 街 / 巷 / 弄
            {gmReady && <span className="ml-1 text-primary">（Google 智慧搜尋）</span>}
          </label>
          <div className="relative">
            <input
              type="text"
              value={road}
              onChange={e => handleRoadChange(e.target.value)}
              onFocus={() => setRoadFocused(true)}
              onBlur={() => setTimeout(() => setRoadFocused(false), 200)}
              placeholder="例：中正路一段"
              className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            {loadingGm && <Loader2 className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          </div>

          {/* Google Maps suggestions for road */}
          {roadFocused && gmSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-lg shadow-xl overflow-hidden">
              {gmSuggestions.map(pred => (
                <button
                  key={pred.place_id}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); handleGmSelect(pred); }}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/60 text-left"
                >
                  <Navigation2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pred.structured_formatting.main_text}</p>
                    <p className="text-xs text-muted-foreground truncate">{pred.structured_formatting.secondary_text}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold block mb-1">門牌號碼</label>
          <input
            type="text"
            value={num}
            onChange={e => setNum(e.target.value)}
            placeholder="例：12號5樓"
            className="w-full h-9 pl-2.5 pr-2 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Preview + actions */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          {combined ? (
            <p className="text-sm font-medium text-foreground truncate">
              <MapPin className="inline w-3.5 h-3.5 text-primary mr-1 -mt-0.5" />
              {combined}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">請選擇縣市、區域並填寫路段門牌</p>
          )}
        </div>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted">
          取消
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!city}
          className="text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          確認地址
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TaiwanAddressInput({
  value,
  onChange,
  onLocationChange,
  historyKey = "default",
  placeholder = "輸入縣市、郵遞區號或地址關鍵字",
  className,
  error,
  onBlur,
}: Props) {
  const gmReady = useGoogleMapsReady();
  const [mode, setMode] = useState<"search" | "structured">("search");
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(value);
  const [zipSuggestions, setZipSuggestions] = useState<PostalEntry[]>([]);
  const [gmSuggestions, setGmSuggestions] = useState<GmPrediction[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [pendingDistrict, setPendingDistrict] = useState<PostalEntry | null>(null);
  const [streetInput, setStreetInput] = useState("");
  const [phase, setPhase] = useState<"search" | "street">("search");
  const [loadingGm, setLoadingGm] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);
  const autoSvc = useRef<GmAutoSvc | null>(null);
  const geocoder = useRef<GmGeocoder | null>(null);
  const gmTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value
  useEffect(() => { setInputVal(value); }, [value]);

  // Init Google Maps services
  useEffect(() => {
    if (gmReady && window.google) {
      autoSvc.current = new window.google.maps.places.AutocompleteService();
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, [gmReady]);

  // Outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPhase("search");
        setPendingDistrict(null);
        setGmSuggestions([]);
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
    setPhase("search");
    setPendingDistrict(null);
    setOpen(true);

    if (val.trim()) {
      setZipSuggestions(searchPostal(val));

      // Google Maps suggestions
      clearTimeout(gmTimer.current);
      if (autoSvc.current) {
        setLoadingGm(true);
        gmTimer.current = setTimeout(() => {
          autoSvc.current!.getPlacePredictions(
            { input: val, componentRestrictions: { country: "tw" }, types: ["address"] },
            (results, status) => {
              setLoadingGm(false);
              setGmSuggestions(status === "OK" ? (results ?? []).slice(0, 4) : []);
            },
          );
        }, 350);
      }
    } else {
      setZipSuggestions([]);
      setGmSuggestions([]);
    }
  }, [onChange]);

  const selectDistrict = useCallback((entry: PostalEntry) => {
    setPendingDistrict(entry);
    setStreetInput("");
    setPhase("street");
    setGmSuggestions([]);
    setTimeout(() => streetRef.current?.focus(), 50);
  }, []);

  const confirmAddress = useCallback(() => {
    if (!pendingDistrict) return;
    const full = `${pendingDistrict.city}${pendingDistrict.district}${streetInput ? streetInput.trim() : ""}`;
    setInputVal(full);
    onChange(full);
    saveHistory(historyKey, full);
    setOpen(false);
    setPhase("search");
    setPendingDistrict(null);
    setStreetInput("");
    setZipSuggestions([]);
    setGmSuggestions([]);
  }, [pendingDistrict, streetInput, onChange, historyKey]);

  const handleGmSelect = useCallback((pred: GmPrediction) => {
    if (!geocoder.current) return;
    setOpen(false);
    setGmSuggestions([]);
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣，?/, "").trim();
        setInputVal(full);
        onChange(full);
        saveHistory(historyKey, full);
        onLocationChange?.({
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
          formattedAddress: full,
        });
      }
    });
  }, [onChange, historyKey, onLocationChange]);

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
    setGmSuggestions([]);
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
    if (inputVal && isAddressComplete(inputVal)) saveHistory(historyKey, inputVal);
    onBlur?.();
  }, [inputVal, historyKey, onBlur]);

  const switchToStructured = () => {
    setOpen(false);
    setMode("structured");
  };

  const handleStructuredConfirm = (addr: string) => {
    setInputVal(addr);
    onChange(addr);
    saveHistory(historyKey, addr);
    setMode("search");
  };

  const handleStructuredLocation = (loc: AddressLocation) => {
    onLocationChange?.(loc);
  };

  const validated = inputVal ? isAddressComplete(inputVal) : null;
  const showDropdown = open && mode === "search" && (
    phase === "street" ||
    zipSuggestions.length > 0 ||
    gmSuggestions.length > 0 ||
    (!inputVal.trim() && history.length > 0)
  );
  const initialParsed = useMemo(() => parseAddress(value), [value]);

  if (mode === "structured") {
    return (
      <div ref={containerRef} className={cn("relative w-full", className)}>
        <StructuredMode
          initial={initialParsed}
          gmReady={gmReady}
          onConfirm={handleStructuredConfirm}
          onGmSelect={handleStructuredLocation}
          onCancel={() => setMode("search")}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Main input */}
      <div className={cn(
        "relative flex items-center rounded-lg border bg-background transition-all",
        error ? "border-destructive ring-1 ring-destructive/30"
          : validated ? "border-emerald-400 ring-1 ring-emerald-200"
          : "border-input focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
      )}>
        <MapPin className={cn(
          "w-4 h-4 shrink-0 ml-3",
          error ? "text-destructive" : validated ? "text-emerald-500" : "text-muted-foreground",
        )} />
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
        {loadingGm && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0 mr-1.5" />}
        {validated && !loadingGm && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mr-1.5" />}
        {error && !inputVal && <AlertCircle className="w-4 h-4 text-destructive shrink-0 mr-1.5" />}
        {inputVal && (
          <button
            type="button"
            onPointerDown={e => { e.preventDefault(); clearInput(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Mode toggle */}
        <button
          type="button"
          onPointerDown={e => { e.preventDefault(); switchToStructured(); }}
          title="切換結構式選址"
          className="w-8 h-8 flex items-center justify-center mr-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors border-l ml-1"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Validation hints */}
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
      {gmReady && (
        <p className="text-[10px] text-primary/70 mt-0.5 flex items-center gap-1">
          <Navigation2 className="w-2.5 h-2.5" />
          Google Maps 智慧搜尋已啟用
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-background border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">

          {/* Street phase */}
          {phase === "street" && pendingDistrict && (
            <div className="p-3 border-b bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{pendingDistrict.zip}</span>
                <span className="text-sm font-bold text-primary">{pendingDistrict.city}{pendingDistrict.district}</span>
              </div>
              <div className="flex gap-2">
                <input
                  ref={streetRef}
                  type="text"
                  value={streetInput}
                  onChange={e => setStreetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmAddress(); } }}
                  placeholder="輸入路段與門牌，例：中正路一段12號3樓"
                  className="flex-1 h-10 px-3 text-sm border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-background"
                />
                <button type="button" onClick={confirmAddress}
                  className="px-3 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shrink-0">
                  確認
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">按 Enter 或點「確認」完成</p>
            </div>
          )}

          {/* Google Maps suggestions */}
          {phase === "search" && gmSuggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-primary px-3 pt-2 pb-1 flex items-center gap-1">
                <Navigation2 className="w-3 h-3" /> Google Maps 地址建議
              </p>
              {gmSuggestions.map(pred => (
                <button
                  key={pred.place_id}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); handleGmSelect(pred); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                >
                  <Navigation2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pred.structured_formatting.main_text}</p>
                    <p className="text-xs text-muted-foreground truncate">{pred.structured_formatting.secondary_text}</p>
                  </div>
                </button>
              ))}
              {zipSuggestions.length > 0 && <div className="border-t mx-3" />}
            </div>
          )}

          {/* Postal suggestions */}
          {phase === "search" && zipSuggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1">
                郵遞區號 / 縣市區域
              </p>
              {zipSuggestions.map((entry, i) => (
                <button
                  key={`${entry.zip}-${i}`}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); selectDistrict(entry); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 transition-colors text-left"
                >
                  <span className="font-mono text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">{entry.zip}</span>
                  <span className="text-sm">
                    <span className="font-semibold">{entry.city}</span>
                    <span className="text-muted-foreground">{entry.district}</span>
                  </span>
                  <Search className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* History */}
          {phase === "search" && !inputVal.trim() && history.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 最近使用地址
              </p>
              {history.map((addr, i) => (
                <div key={i} className="flex items-center gap-2 px-2 hover:bg-muted/50 transition-colors group">
                  <button type="button" onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                    className="flex-1 flex items-center gap-2 py-2.5 text-left min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{addr}</span>
                  </button>
                  <button type="button" onPointerDown={e => removeHistory(addr, e)}
                    className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Structured mode hint */}
          <div className="border-t px-3 py-2 flex items-center justify-between bg-muted/30">
            <span className="text-xs text-muted-foreground">找不到？試試結構式選址</span>
            <button type="button" onPointerDown={e => { e.preventDefault(); switchToStructured(); }}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />縣市區域選取
            </button>
          </div>

          {/* Empty */}
          {phase === "search" && zipSuggestions.length === 0 && gmSuggestions.length === 0 && inputVal.trim() && (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground border-t">
              <p>找不到符合的地址，請嘗試其他關鍵字</p>
              <p className="text-xs mt-1">或使用右側 <SlidersHorizontal className="inline w-3 h-3" /> 按鈕進行結構式選取</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
