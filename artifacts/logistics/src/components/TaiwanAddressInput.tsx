/**
 * TaiwanAddressInput — All-in-one Taiwan address panel
 *
 * Input flow (zero-type first approach):
 *   1. Quick-search (top): one-shot type → pick → all fields filled
 *      - Google Maps if VITE_GOOGLE_MAPS_API_KEY is set
 *      - Nominatim OSM (free, no key) otherwise
 *   2. Structured fields (fallback):
 *      - 縣市 dropdown
 *      - 區域 dropdown (filtered by city, auto-loads road list)
 *      - 路/街 → Nominatim typeahead suggestions, no typing needed for known roads
 *      - 門牌 → numeric input with auto "號" append
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
        places: { AutocompleteService: new () => GmAutoSvc; PlacesServiceStatus: { OK: string } };
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
  getPlacePredictions(req: { input: string; componentRestrictions: { country: string }; types: string[] }, cb: (r: GmPrediction[] | null, s: string) => void): void;
}
interface GmGeocoder {
  geocode(req: { placeId: string }, cb: (r: { formatted_address: string; geometry: { location: { lat(): number; lng(): number } } }[] | null, s: string) => void): void;
}

function loadGoogleMaps(): Promise<void> {
  if (window.__gmapsReady) return Promise.resolve();
  if (window.__gmapsLoading) {
    return new Promise(res => { const iv = setInterval(() => { if (window.__gmapsReady) { clearInterval(iv); res(); } }, 100); });
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

let nomAbort: AbortController | null = null;
let nomRoadAbort: AbortController | null = null;

async function nominatimSearch(query: string, extra = ""): Promise<NominatimResult[]> {
  if (nomAbort) nomAbort.abort();
  nomAbort = new AbortController();
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&countrycodes=tw&addressdetails=1&accept-language=zh-TW${extra}`;
    const res = await fetch(url, { signal: nomAbort.signal, headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
    return (await res.json()) as NominatimResult[];
  } catch { return []; }
}

// Road suggestions: search for roads in a given city+district
const roadCache = new Map<string, string[]>();

async function fetchRoadsForDistrict(city: string, district: string): Promise<string[]> {
  const key = `${city}-${district}`;
  if (roadCache.has(key)) return roadCache.get(key)!;

  if (nomRoadAbort) nomRoadAbort.abort();
  nomRoadAbort = new AbortController();
  try {
    const q = encodeURIComponent(`${district} ${city}`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=30&countrycodes=tw&addressdetails=1&accept-language=zh-TW`;
    const res = await fetch(url, { signal: nomRoadAbort.signal, headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
    const data = (await res.json()) as NominatimResult[];
    const roads = [...new Set(data.map(r => r.address.road).filter(Boolean) as string[])];
    roadCache.set(key, roads);
    return roads;
  } catch { return []; }
}

async function searchRoadInDistrict(road: string, city: string, district: string): Promise<string[]> {
  if (nomRoadAbort) nomRoadAbort.abort();
  nomRoadAbort = new AbortController();
  try {
    const q = encodeURIComponent(`${road} ${district} ${city}`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=12&countrycodes=tw&addressdetails=1&accept-language=zh-TW`;
    const res = await fetch(url, { signal: nomRoadAbort.signal, headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
    const data = (await res.json()) as NominatimResult[];
    return [...new Set(data.map(r => r.address.road).filter(Boolean) as string[])];
  } catch { return []; }
}

function formatNominatim(r: NominatimResult): string {
  const a = r.address;
  const parts = [
    (a.state ?? "").replace("台灣省", "").replace("臺灣省", ""),
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
  let city = ""; let district = "";
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

export function TaiwanAddressInput({ value, onChange, onLocationChange, historyKey = "default", className, error, onBlur }: Props) {
  const gmReady = useGoogleMapsReady();
  const useNominatim = !GMAPS_KEY;

  const initial = useMemo(() => parseAddress(value), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [city, setCity]         = useState(initial.city);
  const [district, setDistrict] = useState(initial.district);
  const [road, setRoad]         = useState(initial.road);
  const [num, setNum]           = useState(initial.num);

  // GM quick-search
  const [gmQuery, setGmQuery]             = useState("");
  const [gmSuggestions, setGmSuggestions] = useState<GmPrediction[]>([]);
  const [gmLoading, setGmLoading]         = useState(false);
  const [gmOpen, setGmOpen]               = useState(false);

  // GM road-field suggestions
  const [roadGmSugs, setRoadGmSugs]       = useState<GmPrediction[]>([]);
  const [roadGmOpen, setRoadGmOpen]       = useState(false);
  const [roadGmLoading, setRoadGmLoading] = useState(false);

  // Nominatim quick-search
  const [nomQuery, setNomQuery]             = useState("");
  const [nomSuggestions, setNomSuggestions] = useState<NominatimResult[]>([]);
  const [nomLoading, setNomLoading]         = useState(false);
  const [nomOpen, setNomOpen]               = useState(false);

  // Nominatim road-field
  const [nomRoads, setNomRoads]           = useState<string[]>([]);     // pre-loaded for district
  const [nomRoadQuery, setNomRoadQuery]   = useState<string[]>([]);     // search results
  const [nomRoadLoading, setNomRoadLoading] = useState(false);
  const [nomRoadOpen, setNomRoadOpen]     = useState(false);

  // History
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory]         = useState<string[]>([]);

  const autoSvc    = useRef<GmAutoSvc | null>(null);
  const geocoder   = useRef<GmGeocoder | null>(null);
  const gmTimer    = useRef<ReturnType<typeof setTimeout>>();
  const roadTimer  = useRef<ReturnType<typeof setTimeout>>();
  const nomTimer   = useRef<ReturnType<typeof setTimeout>>();
  const roadNomTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const numInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (gmReady && window.google) {
      autoSvc.current  = new window.google.maps.places.AutocompleteService();
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, [gmReady]);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setGmOpen(false); setRoadGmOpen(false); setHistoryOpen(false);
        setNomOpen(false); setNomRoadOpen(false);
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

  // Pre-load roads when district selected (Nominatim mode)
  useEffect(() => {
    if (!useNominatim || !city || !district) { setNomRoads([]); return; }
    setNomRoadLoading(true);
    fetchRoadsForDistrict(city, district).then(roads => {
      setNomRoads(roads);
      setNomRoadLoading(false);
    });
  }, [city, district, useNominatim]);

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
    setCity(c); setDistrict(""); setRoad(""); setNum(""); setNomRoads([]);
    emit(c, "", "", "");
  };
  const handleDistrictChange = (d: string) => {
    setDistrict(d); setRoad(""); setNum("");
    emit(city, d, "", "");
  };

  // Road field handlers
  const handleRoadChange = (r: string) => {
    setRoad(r); emit(city, district, r, num);

    if (useNominatim) {
      clearTimeout(roadNomTimer.current);
      if (!r.trim()) {
        setNomRoadQuery(nomRoads); // fall back to district roads
        return;
      }
      // Filter pre-loaded roads first (instant)
      const filtered = nomRoads.filter(rd => rd.includes(r));
      if (filtered.length > 0) { setNomRoadQuery(filtered); setNomRoadOpen(true); return; }
      // Otherwise search Nominatim
      if (r.length >= 2) {
        setNomRoadLoading(true);
        roadNomTimer.current = setTimeout(async () => {
          const results = await searchRoadInDistrict(r, city, district);
          setNomRoadQuery(results);
          setNomRoadLoading(false);
          if (results.length > 0) setNomRoadOpen(true);
        }, 350);
      }
    } else if (autoSvc.current) {
      // Google Maps road suggestions
      clearTimeout(roadTimer.current);
      if (!r.trim()) { setRoadGmSugs([]); return; }
      setRoadGmLoading(true);
      roadTimer.current = setTimeout(() => {
        autoSvc.current!.getPlacePredictions(
          { input: `${city}${district}${r}`, componentRestrictions: { country: "tw" }, types: ["address"] },
          (results, status) => {
            setRoadGmLoading(false);
            setRoadGmSugs(status === "OK" ? (results ?? []).slice(0, 5) : []);
            setRoadGmOpen(true);
          },
        );
      }, 350);
    }
  };

  const selectRoad = (r: string) => {
    setRoad(r);
    emit(city, district, r, num);
    setNomRoadOpen(false);
    setRoadGmOpen(false);
    // Auto-focus num input after road selected
    setTimeout(() => numInputRef.current?.focus(), 50);
  };

  const applyGmRoadSuggestion = (pred: GmPrediction) => {
    setRoadGmSugs([]); setRoadGmOpen(false);
    if (!geocoder.current) return;
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣，?/, "").trim();
        const p = parseAddress(full);
        if (p.city) setCity(p.city);
        if (p.district) setDistrict(p.district);
        if (p.road) { setRoad(p.road); emit(p.city||city, p.district||district, p.road, num); }
        onLocationChange?.({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng(), formattedAddress: full });
        setTimeout(() => numInputRef.current?.focus(), 50);
      }
    });
  };

  const handleNumChange = (n: string) => {
    setNum(n); emit(city, district, road, n);
  };

  // Smart num: auto-append 號 when just digits entered
  const handleNumBlur = () => {
    if (/^\d+$/.test(num.trim())) {
      const withHao = `${num.trim()}號`;
      setNum(withHao); emit(city, district, road, withHao);
    }
    onBlur?.();
  };

  // ─── Google Maps quick-search ────────────────────────────────────────────────
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
    setGmOpen(false);
    setGmQuery(pred.structured_formatting.main_text);
    geocoder.current.geocode({ placeId: pred.place_id }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const full = results[0].formatted_address.replace(/^台灣，?/, "").trim();
        const p = parseAddress(full);
        setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
        prevExternal.current = full; onChange(full); saveHistory(historyKey, full);
        setGmQuery("");
        onLocationChange?.({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng(), formattedAddress: full });
      }
    });
  };

  // ─── Nominatim quick-search ───────────────────────────────────────────────────
  const handleNomQueryChange = (q: string) => {
    setNomQuery(q);
    clearTimeout(nomTimer.current);
    if (!q.trim()) { setNomSuggestions([]); setNomOpen(false); return; }
    setNomLoading(true);
    nomTimer.current = setTimeout(async () => {
      const results = await nominatimSearch(q);
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
    prevExternal.current = formatted; onChange(formatted); saveHistory(historyKey, formatted);
    onLocationChange?.({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), formattedAddress: formatted });
  };

  // ─── Shared ───────────────────────────────────────────────────────────────────
  const clearAll = () => {
    setCity(""); setDistrict(""); setRoad(""); setNum("");
    setGmQuery(""); setGmSuggestions([]); setRoadGmSugs([]);
    setNomQuery(""); setNomSuggestions([]); setNomRoads([]); setNomRoadQuery([]);
    prevExternal.current = ""; onChange("");
  };

  const selectHistory = (addr: string) => {
    const p = parseAddress(addr);
    setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    prevExternal.current = addr; onChange(addr); setHistoryOpen(false);
  };

  const openHistory = () => {
    const h = loadHistory(historyKey); setHistory(h);
    if (h.length > 0) setHistoryOpen(true);
  };

  // Road list to show in dropdown (merged: pre-loaded + search results)
  const visibleRoads = nomRoadQuery.length > 0 ? nomRoadQuery : nomRoads;
  const filteredRoads = road.trim()
    ? visibleRoads.filter(r => r.includes(road)).slice(0, 8)
    : visibleRoads.slice(0, 8);

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

        {/* ── Google Maps quick-search ── */}
        {gmReady && (
          <div className="relative border-b px-3 pt-2.5 pb-2.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Navigation2 className="w-3 h-3" /> 快速搜尋（打關鍵字即可，例：忠孝東路4段）
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={gmQuery} onChange={e => handleGmQueryChange(e.target.value)}
                onFocus={() => { if (gmSuggestions.length > 0) setGmOpen(true); openHistory(); }}
                placeholder="搜尋地址 → 選取 → 自動帶入全部欄位"
                className="w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-muted/30 focus:bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" />
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

            {historyOpen && !gmOpen && history.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 最近使用
                </p>
                {history.map((addr, i) => (
                  <button key={i} type="button"
                    onPointerDown={e => { e.preventDefault(); selectHistory(addr); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 text-left border-t first:border-0">
                    <Clock className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-xs text-foreground truncate">{addr}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Nominatim quick-search (free fallback) ── */}
        {useNominatim && (
          <div className="relative border-b px-3 pt-2.5 pb-2.5">
            <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Search className="w-3 h-3" /> 快速搜尋（建議從此輸入，自動帶入全部欄位）
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input type="text" value={nomQuery} onChange={e => handleNomQueryChange(e.target.value)}
                onFocus={() => { if (nomSuggestions.length > 0) setNomOpen(true); openHistory(); }}
                placeholder="例：台北市信義路五段7號、桃園中正路100號…"
                className="w-full h-9 pl-8 pr-8 text-sm border rounded-lg bg-muted/30 focus:bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" />
              {nomLoading && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-primary animate-spin" />}
              {nomQuery && !nomLoading && (
                <button type="button" onPointerDown={e => { e.preventDefault(); setNomQuery(""); setNomSuggestions([]); setNomOpen(false); }}
                  className="absolute right-2 top-2 w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

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

            {historyOpen && !nomOpen && history.length > 0 && (
              <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-3 pt-2 pb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 最近使用（點選立即帶入）
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

        {/* ── Divider label ── */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">或逐欄填寫</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* ── Structured fields ── */}
        <div className="px-3 pb-3 space-y-2.5">

          {/* Row 1: City + District */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">縣市</label>
              <div className="relative">
                <select value={city} onChange={e => handleCityChange(e.target.value)} onBlur={onBlur}
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors">
                  <option value="">選擇縣市</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">
                區域
                {zip && <span className="ml-1.5 font-mono text-primary">{zip}</span>}
              </label>
              <div className="relative">
                <select value={district} onChange={e => handleDistrictChange(e.target.value)}
                  disabled={!city} onBlur={onBlur}
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background appearance-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-40 transition-colors">
                  <option value="">{city ? "選擇區域" : "—"}</option>
                  {districts.map(d => <option key={d.zip} value={d.district}>{d.district}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Row 2: Road (with Nominatim typeahead) + Number */}
          <div className="grid grid-cols-5 gap-2">
            {/* Road */}
            <div className="col-span-3 relative">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1 flex items-center gap-1">
                路 / 街 / 巷
                {useNominatim && district && nomRoadLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                {useNominatim && district && !nomRoadLoading && nomRoads.length > 0 && (
                  <span className="text-primary font-bold">（可下拉選擇）</span>
                )}
              </label>
              <div className="relative">
                <input type="text" value={road}
                  onChange={e => handleRoadChange(e.target.value)}
                  onFocus={() => {
                    if (useNominatim && district) {
                      const list = road.trim()
                        ? (nomRoads.filter(r => r.includes(road)).length > 0 ? nomRoads.filter(r => r.includes(road)) : nomRoads)
                        : nomRoads;
                      if (list.length > 0) { setNomRoadQuery([]); setNomRoadOpen(true); }
                    }
                    if (!useNominatim && roadGmSugs.length > 0) setRoadGmOpen(true);
                  }}
                  onBlur={() => { setTimeout(() => { setRoadGmOpen(false); setNomRoadOpen(false); }, 200); }}
                  placeholder={district && nomRoads.length > 0 ? "點選可直接選路名" : "例：中正路一段"}
                  className="w-full h-9 pl-2.5 pr-7 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" />
                {(useNominatim ? nomRoadLoading : roadGmLoading) && (
                  <Loader2 className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground animate-spin" />
                )}
                {!useNominatim && !roadGmLoading && district && (
                  <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                )}
                {useNominatim && !nomRoadLoading && district && (
                  <ChevronDown className="absolute right-2 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                )}
              </div>

              {/* Nominatim road suggestions dropdown */}
              {useNominatim && nomRoadOpen && filteredRoads.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground px-3 pt-2 pb-1">
                    {district} 路段列表
                  </p>
                  {filteredRoads.map((r, i) => (
                    <button key={i} type="button"
                      onPointerDown={e => { e.preventDefault(); selectRoad(r); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/10 text-left border-t first:border-0 transition-colors",
                        road === r && "bg-primary/10 text-primary font-semibold",
                      )}>
                      <MapPin className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-sm">{r}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Google Maps road suggestions */}
              {!useNominatim && roadGmOpen && roadGmSugs.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
                  {roadGmSugs.map(pred => (
                    <button key={pred.place_id} type="button"
                      onPointerDown={e => { e.preventDefault(); applyGmRoadSuggestion(pred); }}
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

            {/* Building number */}
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide block mb-1">門牌號碼</label>
              <input ref={numInputRef} type="text" inputMode="numeric" value={num}
                onChange={e => handleNumChange(e.target.value)}
                onBlur={handleNumBlur}
                placeholder="12號 / 12號3樓"
                className="w-full h-9 pl-2.5 pr-2 text-sm border rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors" />
            </div>
          </div>

          {/* ── Address preview ── */}
          <div className={cn(
            "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
            !combined ? "bg-muted/30 text-muted-foreground"
              : validated ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-amber-50 border border-amber-200 text-amber-800",
          )}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {combined
                ? validated ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            : <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                : <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />}
              <span className={cn("text-xs truncate", !combined && "italic")}>
                {combined || "選擇縣市區域，再選/輸入路段門牌"}
              </span>
            </div>
            {combined && (
              <button type="button" onPointerDown={e => { e.preventDefault(); clearAll(); }}
                title="清除" className="ml-2 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {combined && !validated && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" /> 請填寫門牌號碼（例：12號3樓）以完成地址
            </p>
          )}
          {validated && (
            <p className="text-[11px] text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" /> 地址格式正確
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
