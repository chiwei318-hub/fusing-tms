/**
 * TaiwanAddressInput — All-in-one Taiwan address panel
 *
 * Always shows all fields:
 *   1. Quick-search bar: Google Maps (if VITE_GOOGLE_MAPS_API_KEY set) OR Nominatim OSM (free fallback)
 *   2. 縣市 dropdown
 *   3. 區域 dropdown (filtered by city)
 *   4. 路/街/巷/弄 text input
 *   5. 門牌 text input
 *   6. Auto-combined address preview + validation + history recall
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MapPin, Search, X, CheckCircle2, AlertCircle,
  Navigation2, ChevronDown, Loader2, Clock,
} from "lucide-react";
import { isAddressComplete, TAIWAN_POSTAL, type PostalEntry } from "@/lib/taiwan-postal";
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

// ─── Nominatim (OpenStreetMap) free geocoding ─────────────────────────────────

interface NominatimResult {
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
    postcode?: string;
  };
}

let nominatimAbort: AbortController | null = null;

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  if (nominatimAbort) nominatimAbort.abort();
  nominatimAbort = new AbortController();
  try {
    const q = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=6&countrycodes=tw&addressdetails=1&accept-language=zh-TW`;
    const res = await fetch(url, {
      signal: nominatimAbort.signal,
      headers: { "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5" },
    });
    return (await res.json()) as NominatimResult[];
  } catch {
    return [];
  }
}

function formatNominatim(r: NominatimResult): string {
  const a = r.address;
  const parts = [
    a.state?.replace("台灣省", "").replace("臺灣省", "") ?? "",
    a.county ?? a.city ?? "",
    a.city_district ?? a.suburb ?? "",
    a.road ?? "",
    a.house_number ? `${a.house_number}號` : "",
  ].filter(Boolean);
  return parts.join("") || r.display_name;
}

// ─── Taiwan postal helpers ────────────────────────────────────────────────────

const CITIES = [...new Set(TAIWAN_POSTAL.map(e => e.city))];

function getDistricts(city: string): PostalEntry[] {
  return TAIWAN_POSTAL.filter(e => e.city === city);
}

function getZip(city: string, district: string) {
  return TAIWAN_POSTAL.find(e => e.city === city && e.district === district)?.zip ?? "";
}

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
  const numMatch = remaining.match(/^(.*?)(\d+[號樓].*)$/);
  const road = numMatch ? numMatch[1].trim() : remaining.trim();
  const num  = numMatch ? numMatch[2].trim() : "";
  return { city, district, road, num };
}

// ─── History ──────────────────────────────────────────────────────────────────

const MAX_HISTORY = 6;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TaiwanAddressInput({
  value,
  onChange,
  onLocationChange,
  historyKey = "default",
  className,
  error,
  onBlur,
}: Props) {
  const gmReady = useGoogleMapsReady();
  const useNominatim = !GMAPS_KEY;

  const initial = useMemo(() => parseAddress(value), []);  // eslint-disable-line react-hooks/exhaustive-deps

  const [city, setCity]         = useState(initial.city);
  const [district, setDistrict] = useState(initial.district);
  const [road, setRoad]         = useState(initial.road);
  const [num, setNum]           = useState(initial.num);

  // Google Maps quick-search
  const [gmQuery, setGmQuery]           = useState("");
  const [gmSuggestions, setGmSuggestions] = useState<GmPrediction[]>([]);
  const [gmLoading, setGmLoading]       = useState(false);
  const [gmOpen, setGmOpen]             = useState(false);

  // Road-field GM suggestions
  const [roadSuggestions, setRoadSuggestions] = useState<GmPrediction[]>([]);
  const [roadSugOpen, setRoadSugOpen]   = useState(false);
  const [roadLoading, setRoadLoading]   = useState(false);

  // Nominatim quick-search
  const [nomQuery, setNomQuery]             = useState("");
  const [nomSuggestions, setNomSuggestions] = useState<NominatimResult[]>([]);
  const [nomLoading, setNomLoading]         = useState(false);
  const [nomOpen, setNomOpen]               = useState(false);
  const nomTimer = useRef<ReturnType<typeof setTimeout>>();

  // History dropdown (shared by both search bars)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory]         = useState<string[]>([]);

  const autoSvc   = useRef<GmAutoSvc | null>(null);
  const geocoder  = useRef<GmGeocoder | null>(null);
  const gmTimer   = useRef<ReturnType<typeof setTimeout>>();
  const roadTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gmReady && window.google) {
      autoSvc.current  = new window.google.maps.places.AutocompleteService();
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, [gmReady]);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setGmOpen(false);
        setRoadSugOpen(false);
        setHistoryOpen(false);
        setNomOpen(false);
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  const prevExternal = useRef(value);
  useEffect(() => {
    if (value !== prevExternal.current && value !== buildAddress(city, district, road, num)) {
      const p = parseAddress(value);
      setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    }
    prevExternal.current = value;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildAddress(c: string, d: string, r: string, n: string) {
    return [c, d, r, n].filter(Boolean).join("");
  }

  const emit = useCallback((c: string, d: string, r: string, n: string) => {
    const full = buildAddress(c, d, r, n);
    prevExternal.current = full;
    onChange(full);
    if (full && isAddressComplete(full)) saveHistory(historyKey, full);
  }, [onChange, historyKey]);

  const handleCityChange = (c: string) => {
    setCity(c); setDistrict(""); emit(c, "", road, num);
  };
  const handleDistrictChange = (d: string) => {
    setDistrict(d); emit(city, d, road, num);
  };
  const handleRoadChange = (r: string) => {
    setRoad(r); emit(city, district, r, num);
    clearTimeout(roadTimer.current);
    if (!r.trim() || !autoSvc.current) { setRoadSuggestions([]); return; }
    const q = `${city}${district}${r}`;
    setRoadLoading(true);
    roadTimer.current = setTimeout(() => {
      autoSvc.current!.getPlacePredictions(
        { input: q, componentRestrictions: { country: "tw" }, types: ["address"] },
        (results, status) => {
          setRoadLoading(false);
          setRoadSuggestions(status === "OK" ? (results ?? []).slice(0, 5) : []);
          setRoadSugOpen(true);
        },
      );
    }, 350);
  };
  const handleNumChange = (n: string) => {
    setNum(n); emit(city, district, road, n);
  };

  // ─── Google Maps quick-search ───────────────────────────────────────────────
  const handleGmQueryChange = (q: string) => {
    setGmQuery(q);
    clearTimeout(gmTimer.current);
    if (!q.trim() || !autoSvc.current) { setGmSuggestions([]); setGmOpen(false); return; }
    setGmLoading(true);
    gmTimer.current = setTimeout(() => {
      autoSvc.current!.getPlacePredictions(
        { input: q, componentRestrictions: { country: "tw" }, types: ["address"] },
        (results, status) => {
          setGmLoading(false);
          setGmSuggestions(status === "OK" ? (results ?? []).slice(0, 6) : []);
          setGmOpen(true);
        },
      );
    }, 300);
  };

  const applyGmResult = (pred: GmPrediction) => {
    if (!geocoder.current) return;
    setGmOpen(false); setRoadSugOpen(false);
    setGmQuery(pred.structured_formatting.main_text);
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣，?/, "").trim();
        const p = parseAddress(full);
        setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
        prevExternal.current = full;
        onChange(full);
        saveHistory(historyKey, full);
        setGmQuery("");
        onLocationChange?.({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng(), formattedAddress: full });
      }
    });
  };

  const applyRoadSuggestion = (pred: GmPrediction) => {
    setRoadSuggestions([]); setRoadSugOpen(false);
    if (!geocoder.current) return;
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣，?/, "").trim();
        const p = parseAddress(full);
        if (p.city) setCity(p.city);
        if (p.district) setDistrict(p.district);
        if (p.road) setRoad(p.road);
        if (p.num) setNum(p.num);
        prevExternal.current = full;
        onChange(full);
        saveHistory(historyKey, full);
        onLocationChange?.({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng(), formattedAddress: full });
      }
    });
  };

  // ─── Nominatim quick-search ─────────────────────────────────────────────────
  const handleNomQueryChange = (q: string) => {
    setNomQuery(q);
    clearTimeout(nomTimer.current);
    if (!q.trim()) { setNomSuggestions([]); setNomOpen(false); return; }
    setNomLoading(true);
    nomTimer.current = setTimeout(async () => {
      const results = await searchNominatim(q);
      setNomLoading(false);
      setNomSuggestions(results.slice(0, 6));
      setNomOpen(results.length > 0);
    }, 400);
  };

  const applyNominatim = (r: NominatimResult) => {
    setNomOpen(false); setNomQuery("");
    const formatted = formatNominatim(r);
    const p = parseAddress(formatted);
    setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    prevExternal.current = formatted;
    onChange(formatted);
    saveHistory(historyKey, formatted);
    onLocationChange?.({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), formattedAddress: formatted });
  };

  // ─── Shared helpers ─────────────────────────────────────────────────────────
  const clearAll = () => {
    setCity(""); setDistrict(""); setRoad(""); setNum("");
    setGmQuery(""); setGmSuggestions([]); setRoadSuggestions([]);
    setNomQuery(""); setNomSuggestions([]);
    prevExternal.current = "";
    onChange("");
  };

  const selectHistory = (addr: string) => {
    const p = parseAddress(addr);
    setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    prevExternal.current = addr;
    onChange(addr);
    setHistoryOpen(false);
  };

  const openHistory = () => {
    const h = loadHistory(historyKey);
    setHistory(h);
    if (h.length > 0) setHistoryOpen(true);
  };

  const combined  = buildAddress(city, district, road, num);
  const zip       = city && district ? getZip(city, district) : "";
  const districts = city ? getDistricts(city) : [];
  const validated = combined ? isAddressComplete(combined) : null;

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <div className={cn(
        "rounded-xl border bg-background overflow-visible shadow-sm transition-all",
        error ? "border-destructive ring-1 ring-destructive/20"
          : validated ? "border-emerald-400 ring-1 ring-emerald-100"
          : "border-input",
      )}>

        {/* ── Google Maps quick-search (if API key set) ── */}
        {gmReady && (
          <div className="relative border-b px-3 pt-2.5 pb-2.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Navigation2 className="w-3 h-3" /> Google Maps 快速搜尋地址
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={gmQuery}
                onChange={e => handleGmQueryChange(e.target.value)}
                onFocus={() => {
                  if (gmSuggestions.length > 0) setGmOpen(true);
                  openHistory();
                }}
                placeholder="輸入地址關鍵字，自動填入所有欄位…"
                className="w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-muted/30 focus:bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              {gmLoading && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-primary animate-spin" />}
              {gmQuery && !gmLoading && (
                <button type="button" onPointerDown={e => { e.preventDefault(); setGmQuery(""); setGmSuggestions([]); setGmOpen(false); }}
                  className="absolute right-2 top-2 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {gmOpen && gmSuggestions.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                {gmSuggestions.map(pred => (
                  <button key={pred.place_id} type="button"
                    onPointerDown={e => { e.preventDefault(); applyGmResult(pred); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 text-left border-b last:border-0">
                    <Navigation2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{pred.structured_formatting.main_text}</p>
                      <p className="text-xs text-muted-foreground truncate">{pred.structured_formatting.secondary_text}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* History inline under GM search */}
            {historyOpen && !gmOpen && history.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 最近使用地址
                </p>
                {history.map((addr, i) => (
                  <button key={i} type="button"
                    onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 text-left border-t first:border-0">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground truncate">{addr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Nominatim quick-search (free fallback when no Google Maps key) ── */}
        {useNominatim && (
          <div className="relative border-b px-3 pt-2.5 pb-2.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Search className="w-3 h-3" /> 快速搜尋地址（輸入後自動填入）
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={nomQuery}
                onChange={e => handleNomQueryChange(e.target.value)}
                onFocus={() => {
                  if (nomSuggestions.length > 0) setNomOpen(true);
                  openHistory();
                }}
                placeholder="例：台北市信義區松仁路、新竹縣竹北市…"
                className="w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-muted/30 focus:bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              {nomLoading && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-primary animate-spin" />}
              {nomQuery && !nomLoading && (
                <button type="button" onPointerDown={e => { e.preventDefault(); setNomQuery(""); setNomSuggestions([]); setNomOpen(false); }}
                  className="absolute right-2 top-2 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Nominatim suggestions */}
            {nomOpen && nomSuggestions.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                {nomSuggestions.map(r => (
                  <button key={r.place_id} type="button"
                    onPointerDown={e => { e.preventDefault(); applyNominatim(r); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 text-left border-b last:border-0">
                    <Navigation2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{formatNominatim(r)}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.display_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* History inline under Nominatim search */}
            {historyOpen && !nomOpen && history.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 最近使用地址（點選直接填入）
                </p>
                {history.map((addr, i) => (
                  <button key={i} type="button"
                    onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/60 text-left border-t first:border-0">
                    <Clock className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{addr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Structured fields ── */}
        <div className="p-3 space-y-2.5">

          {/* Row 1: City + District */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">縣市 *</label>
              <div className="relative">
                <select
                  value={city}
                  onChange={e => handleCityChange(e.target.value)}
                  onBlur={onBlur}
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                >
                  <option value="">請選擇縣市</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">
                區域 *
                {zip && <span className="ml-1.5 font-mono text-primary">{zip}</span>}
              </label>
              <div className="relative">
                <select
                  value={district}
                  onChange={e => handleDistrictChange(e.target.value)}
                  disabled={!city}
                  onBlur={onBlur}
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <option value="">{city ? "請選擇區域" : "—"}</option>
                  {districts.map(d => (
                    <option key={d.zip} value={d.district}>{d.district}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 2: Road + Number */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3 relative">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">
                路 / 街 / 巷 / 弄 *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={road}
                  onChange={e => handleRoadChange(e.target.value)}
                  onFocus={() => roadSuggestions.length > 0 && setRoadSugOpen(true)}
                  onBlur={() => { setTimeout(() => setRoadSugOpen(false), 200); onBlur?.(); }}
                  placeholder="例：中正路一段"
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                {roadLoading && <Loader2 className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
              </div>

              {roadSugOpen && roadSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                  {roadSuggestions.map(pred => (
                    <button key={pred.place_id} type="button"
                      onPointerDown={e => { e.preventDefault(); applyRoadSuggestion(pred); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 text-left border-b last:border-0">
                      <Navigation2 className="w-3 h-3 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{pred.structured_formatting.main_text}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{pred.structured_formatting.secondary_text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">門牌號碼 *</label>
              <input
                type="text"
                value={num}
                onChange={e => handleNumChange(e.target.value)}
                onBlur={onBlur}
                placeholder="例：12號5樓"
                className="w-full h-9 pl-2.5 pr-2 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
              />
            </div>
          </div>

          {/* ── Address preview & validation ── */}
          <div className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
            !combined ? "bg-muted/30 text-muted-foreground"
              : validated ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-amber-50 border border-amber-200 text-amber-800",
          )}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {combined
                ? validated
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                : <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />}
              <span className={cn("text-xs truncate", !combined && "italic")}>
                {combined
                  ? combined
                  : "選擇縣市區域並填寫路段門牌，地址將在此顯示"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {/* History button (shown when no inline search bar) */}
              {!gmReady && !useNominatim && (
                <div className="relative">
                  <button
                    type="button"
                    onPointerDown={e => {
                      e.preventDefault();
                      const h = loadHistory(historyKey);
                      setHistory(h);
                      setHistoryOpen(h.length > 0 ? !historyOpen : false);
                    }}
                    title="最近使用地址"
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                  </button>

                  {historyOpen && history.length > 0 && (
                    <div className="absolute z-50 right-0 bottom-full mb-1 w-72 bg-background border rounded-xl shadow-xl overflow-hidden">
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 最近使用地址
                      </p>
                      {history.map((addr, i) => (
                        <button key={i} type="button"
                          onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 text-left border-t first:border-0">
                          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-foreground truncate">{addr}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {combined && (
                <button type="button" onPointerDown={e => { e.preventDefault(); clearAll(); }}
                  title="清除" className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Validation hint */}
          {combined && !validated && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              請填寫門牌號碼（例：12號3樓）以完成地址
            </p>
          )}
          {validated && (
            <p className="text-[11px] text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              地址格式正確
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
