/**
 * TaiwanAddressInput — 結構化台灣地址輸入
 *
 * 欄位：縣市 ▼ | 區域 ▼ | 路/街 (輸入+建議) | 門牌號
 * - 縣市、區域：下拉選單，零打字
 * - 路名：只需打路名（短），Nominatim 以 city+district 為範圍搜尋
 * - 門牌號：打數字，失焦自動補「號」
 * - 歷史記錄：點第一個欄位時顯示
 * - 可直接貼入完整地址（自動解析）
 * - 常用地址搜尋：點搜尋圖示，輸入關鍵字找客戶常用地址
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MapPin, X, Clock, Loader2, CheckCircle2, ChevronDown, Search, User, Tag } from "lucide-react";
import { isAddressComplete, TAIWAN_POSTAL, type PostalEntry } from "@/lib/taiwan-postal";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/api";

// ── Nominatim ─────────────────────────────────────────────────────────────────
interface NomResult {
  place_id: number;
  display_name: string;
  address: { house_number?: string; road?: string; suburb?: string; city_district?: string; city?: string; county?: string; state?: string };
}

let roadAbort: AbortController | null = null;
const roadCache = new Map<string, string[]>();

async function fetchRoads(city: string, district: string, q = ""): Promise<string[]> {
  const key = `${city}-${district}-${q}`;
  if (roadCache.has(key)) return roadCache.get(key)!;
  if (roadAbort) roadAbort.abort();
  roadAbort = new AbortController();
  try {
    const query = q ? `${q} ${district} ${city}` : `${district} ${city}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=20&countrycodes=tw&addressdetails=1&accept-language=zh-TW`;
    const r = await fetch(url, { signal: roadAbort.signal, headers: { "Accept-Language": "zh-TW,zh;q=0.9" } });
    const data = (await r.json()) as NomResult[];
    const roads = [...new Set(data.map(d => d.address.road).filter(Boolean) as string[])];
    if (roads.length > 0) roadCache.set(key, roads);
    return roads;
  } catch { return []; }
}

// ── Order history suggestions ─────────────────────────────────────────────────
interface OrderSuggestion {
  address: string;
  frequency: number;
  avg_price: number | null;
  last_used: string | null;
}

let orderSugAbort: AbortController | null = null;

async function fetchOrderSuggestions(type: "pickup" | "delivery" | "both"): Promise<OrderSuggestion[]> {
  if (orderSugAbort) orderSugAbort.abort();
  orderSugAbort = new AbortController();
  try {
    const res = await fetch(
      getApiUrl(`/api/locations/autocomplete?q=&type=${type}&limit=6`),
      { signal: orderSugAbort.signal },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── Saved address search ───────────────────────────────────────────────────────
interface SavedAddress {
  id: number;
  label: string;
  address: string;
  contact_name: string | null;
  contact_phone: string | null;
  address_type: string;
  is_default: boolean;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
}

let searchAbort: AbortController | null = null;

async function searchSavedAddresses(q: string): Promise<SavedAddress[]> {
  if (!q.trim()) return [];
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  try {
    const res = await fetch(getApiUrl(`/api/customers/addresses/search?q=${encodeURIComponent(q)}`), {
      signal: searchAbort.signal,
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

// ── Taiwan postal helpers ─────────────────────────────────────────────────────
const CITIES = [...new Set(TAIWAN_POSTAL.map(e => e.city))];

function getDistricts(city: string): PostalEntry[] {
  return TAIWAN_POSTAL.filter(e => e.city === city);
}

function parseAddress(full: string) {
  let s = full.trim();
  let city = ""; let district = "";
  for (const c of CITIES) {
    if (s.startsWith(c)) { city = c; s = s.slice(c.length); break; }
  }
  if (city) {
    for (const e of getDistricts(city)) {
      if (s.startsWith(e.district)) { district = e.district; s = s.slice(e.district.length); break; }
    }
  }
  const m = s.match(/^(.*?)(\d+.*)$/);
  const road = m ? m[1].trim() : s.trim();
  const num  = m ? m[2].trim() : "";
  return { city, district, road, num };
}

function buildAddr(city: string, district: string, road: string, num: string) {
  return [city, district, road, num].filter(Boolean).join("");
}

// ── History ───────────────────────────────────────────────────────────────────
const MAX_H = 8;
function loadHist(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(`addr-h-${key}`) ?? "[]"); } catch { return []; }
}
function saveHist(key: string, v: string) {
  const h = loadHist(key).filter(a => a !== v);
  localStorage.setItem(`addr-h-${key}`, JSON.stringify([v, ...h].slice(0, MAX_H)));
}
function delHist(key: string, v: string) {
  localStorage.setItem(`addr-h-${key}`, JSON.stringify(loadHist(key).filter(a => a !== v)));
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface AddressLocation { lat: number; lng: number; formattedAddress: string }
interface Props {
  value: string;
  onChange: (value: string) => void;
  onLocationChange?: (loc: AddressLocation) => void;
  historyKey?: string;
  addressType?: "pickup" | "delivery" | "both";
  className?: string;
  error?: string;
  onBlur?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TaiwanAddressInput({ value, onChange, historyKey = "default", addressType = "both", className, error, onBlur }: Props) {
  const init = useMemo(() => parseAddress(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [city, setCity]         = useState(init.city);
  const [district, setDistrict] = useState(init.district);
  const [road, setRoad]         = useState(init.road);
  const [num, setNum]           = useState(init.num);

  // Road autocomplete
  const [roadSugs, setRoadSugs]       = useState<string[]>([]);
  const [roadLoading, setRoadLoading] = useState(false);
  const [roadOpen, setRoadOpen]       = useState(false);
  const [preloaded, setPreloaded]     = useState<string[]>([]);

  // History
  const [hist, setHist]         = useState<string[]>([]);
  const [histOpen, setHistOpen] = useState(false);
  const [orderSugs, setOrderSugs] = useState<OrderSuggestion[]>([]);

  // Saved address search
  const [searchOpen, setSearchOpen]   = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SavedAddress[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const roadTimer = useRef<ReturnType<typeof setTimeout>>();
  const boxRef    = useRef<HTMLDivElement>(null);
  const numRef    = useRef<HTMLInputElement>(null);
  const roadRef   = useRef<HTMLInputElement>(null);
  const prevVal   = useRef(value);

  // Close dropdowns on outside click
  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setRoadOpen(false); setHistOpen(false); setSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  // Sync when parent resets value externally
  useEffect(() => {
    if (value !== prevVal.current && value !== buildAddr(city, district, road, num)) {
      const p = parseAddress(value);
      setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    }
    prevVal.current = value;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-load roads when district is selected
  useEffect(() => {
    if (!city || !district) { setPreloaded([]); return; }
    fetchRoads(city, district).then(roads => setPreloaded(roads));
  }, [city, district]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  const emit = useCallback((c: string, d: string, r: string, n: string) => {
    const full = buildAddr(c, d, r, n);
    prevVal.current = full;
    onChange(full);
    if (isAddressComplete(full)) saveHist(historyKey, full);
  }, [onChange, historyKey]);

  // ── City change ──
  const handleCity = (c: string) => {
    setCity(c); setDistrict(""); setRoad(""); setNum("");
    setPreloaded([]); setRoadSugs([]);
    emit(c, "", "", "");
  };

  // ── District change ──
  const handleDistrict = (d: string) => {
    setDistrict(d); setRoad(""); setNum("");
    setRoadSugs([]);
    emit(city, d, "", "");
    setTimeout(() => roadRef.current?.focus(), 50);
  };

  // ── Road input ──
  const handleRoad = (r: string) => {
    setRoad(r);
    emit(city, district, r, num);
    clearTimeout(roadTimer.current);

    if (!r.trim()) {
      if (preloaded.length > 0) { setRoadSugs(preloaded.slice(0, 8)); setRoadOpen(true); }
      return;
    }

    const filtered = preloaded.filter(rd => rd.includes(r));
    if (filtered.length > 0) {
      setRoadSugs(filtered.slice(0, 8)); setRoadOpen(true); return;
    }

    if (r.length >= 2 && city && district) {
      setRoadLoading(true);
      roadTimer.current = setTimeout(async () => {
        const results = await fetchRoads(city, district, r);
        setRoadSugs(results.slice(0, 8));
        setRoadLoading(false);
        if (results.length > 0) setRoadOpen(true);
      }, 400);
    }
  };

  const pickRoad = (r: string) => {
    setRoad(r); emit(city, district, r, num);
    setRoadOpen(false);
    setTimeout(() => numRef.current?.focus(), 50);
  };

  // ── Number field ──
  const handleNum = (n: string) => { setNum(n); emit(city, district, road, n); };
  const handleNumBlur = () => {
    if (/^\d+$/.test(num.trim())) {
      const n = `${num.trim()}號`;
      setNum(n); emit(city, district, road, n);
    }
    onBlur?.();
  };

  // ── History ──
  const openHist = () => {
    const h = loadHist(historyKey); setHist(h);
    fetchOrderSuggestions(addressType).then(sug => {
      setOrderSugs(sug);
      if (h.length > 0 || sug.length > 0) { setHistOpen(true); setRoadOpen(false); }
    });
    if (h.length > 0) { setHistOpen(true); setRoadOpen(false); }
  };

  const pickHist = (addr: string) => {
    const p = parseAddress(addr);
    setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    prevVal.current = addr; onChange(addr); setHistOpen(false);
  };

  // ── Saved address search ──
  const handleSearchQuery = (q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchSavedAddresses(q);
      setSearchResults(results);
      setSearchLoading(false);
    }, 300);
  };

  const pickSavedAddress = (addr: SavedAddress) => {
    const p = parseAddress(addr.address);
    setCity(p.city); setDistrict(p.district); setRoad(p.road); setNum(p.num);
    prevVal.current = addr.address;
    onChange(addr.address);
    if (isAddressComplete(addr.address)) saveHist(historyKey, addr.address);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearAll = () => {
    setCity(""); setDistrict(""); setRoad(""); setNum("");
    setRoadSugs([]); setPreloaded([]);
    prevVal.current = ""; onChange("");
  };

  const toggleSearch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSearchOpen(o => !o);
    setHistOpen(false);
    setRoadOpen(false);
    if (searchOpen) { setSearchQuery(""); setSearchResults([]); }
  };

  const full      = buildAddr(city, district, road, num);
  const districts = city ? getDistricts(city) : [];
  const validated = full ? isAddressComplete(full) : null;

  const visibleRoads = road.trim()
    ? roadSugs.filter(r => r.includes(road)).slice(0, 8)
    : preloaded.slice(0, 8);

  return (
    <div ref={boxRef} className={cn("relative w-full", className)}>
      <div className={cn(
        "rounded-xl border bg-background shadow-sm overflow-visible transition-all",
        error ? "border-destructive ring-1 ring-destructive/20"
          : validated ? "border-emerald-400 ring-1 ring-emerald-100"
          : "border-input",
      )}>

        {/* ── Search bar (when open) ──────────────── */}
        {searchOpen && (
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5">
            <Search className="w-3.5 h-3.5 text-primary shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearchQuery(e.target.value)}
              placeholder="輸入客戶名稱、地址標籤或地址關鍵字…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
            {searchLoading && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
            {searchQuery && !searchLoading && (
              <button type="button" onPointerDown={e => { e.preventDefault(); setSearchQuery(""); setSearchResults([]); }}
                className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ── Row 1: 縣市 + 區域 + search icon ────── */}
        <div className="flex gap-0 border-b">
          {/* 縣市 */}
          <div className="relative flex-1 border-r">
            <select
              value={city}
              onChange={e => handleCity(e.target.value)}
              onFocus={openHist}
              className="w-full h-10 pl-3 pr-6 text-sm bg-transparent appearance-none outline-none cursor-pointer"
            >
              <option value="">縣市</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {/* 區域 */}
          <div className="relative flex-1 border-r">
            <select
              value={district}
              onChange={e => handleDistrict(e.target.value)}
              disabled={!city}
              className="w-full h-10 pl-3 pr-6 text-sm bg-transparent appearance-none outline-none cursor-pointer disabled:text-muted-foreground"
            >
              <option value="">區域</option>
              {districts.map(d => <option key={d.district} value={d.district}>{d.district}</option>)}
            </select>
            <ChevronDown className="absolute right-1.5 top-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {/* 搜尋常用地址按鈕 */}
          <button
            type="button"
            onClick={toggleSearch}
            title="搜尋常用地址"
            className={cn(
              "px-3 flex items-center justify-center transition-colors shrink-0",
              searchOpen
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-primary hover:bg-muted/40"
            )}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* ── Row 2: 路街 + 門牌 ─────────────────── */}
        <div className="flex gap-0">
          {/* 路/街 */}
          <div className="relative flex-[3] border-r">
            <input
              ref={roadRef}
              type="text"
              value={road}
              onChange={e => handleRoad(e.target.value)}
              onFocus={() => {
                if (preloaded.length > 0 && !road) { setRoadSugs(preloaded.slice(0, 8)); setRoadOpen(true); }
                else if (road && visibleRoads.length > 0) setRoadOpen(true);
              }}
              placeholder={district ? "路/街名（輸入 2 字有建議）" : "先選縣市和區域"}
              disabled={!district}
              className="w-full h-10 pl-3 pr-7 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50 disabled:text-muted-foreground"
            />
            {roadLoading && <Loader2 className="absolute right-2 top-3 w-3.5 h-3.5 text-primary animate-spin" />}
          </div>

          {/* 門牌號 */}
          <div className="relative flex-[1.2] flex items-center">
            <input
              ref={numRef}
              type="text"
              inputMode="numeric"
              value={num}
              onChange={e => handleNum(e.target.value)}
              onBlur={handleNumBlur}
              placeholder="號碼"
              disabled={!road}
              className="w-full h-10 pl-3 pr-7 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50 disabled:text-muted-foreground"
            />
            {full && (
              <button type="button" onPointerDown={e => { e.preventDefault(); clearAll(); }}
                className="absolute right-2 text-muted-foreground hover:text-foreground">
                {validated ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <X className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Validated full address preview ─────── */}
        {full && (
          <div className="px-3 py-1 border-t bg-muted/30 flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{full}</span>
          </div>
        )}
      </div>

      {/* ── Saved address search results ────────── */}
      {searchOpen && searchQuery && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
          {searchLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 搜尋中…
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">找不到符合的常用地址</div>
          ) : (
            <>
              <div className="px-3 py-1.5 border-b bg-primary/5 text-[10px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                <Search className="w-3 h-3" /> 常用地址搜尋結果
              </div>
              {searchResults.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onPointerDown={e => { e.preventDefault(); pickSavedAddress(addr); }}
                  className="w-full flex flex-col gap-0.5 px-3 py-2.5 hover:bg-muted/60 text-left border-b last:border-0 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <User className="w-3 h-3 shrink-0" />
                      {addr.customer_name}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Tag className="w-3 h-3 shrink-0" />
                      {addr.label}
                    </span>
                    {addr.is_default && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">預設</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                    <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{addr.address}</span>
                  </div>
                  {(addr.contact_name || addr.contact_phone) && (
                    <div className="text-xs text-muted-foreground ml-4.5">
                      {[addr.contact_name, addr.contact_phone].filter(Boolean).join("　")}
                    </div>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Road suggestions dropdown ───────────── */}
      {roadOpen && visibleRoads.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-1.5 border-b bg-primary/5 text-[10px] font-semibold text-primary uppercase tracking-wide">
            路/街 建議
          </div>
          {visibleRoads.map((r, i) => (
            <button key={i} type="button"
              onPointerDown={e => { e.preventDefault(); pickRoad(r); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 text-left border-b last:border-0 text-sm transition-colors">
              <MapPin className="w-3 h-3 text-primary shrink-0" />
              {r}
            </button>
          ))}
        </div>
      )}

      {/* ── History dropdown ────────────────────── */}
      {histOpen && (hist.length > 0 || orderSugs.length > 0) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {hist.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" /> 最近使用
              </div>
              {hist.map((addr, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 border-b last:border-0 group">
                  <button type="button" onPointerDown={e => { e.preventDefault(); pickHist(addr); }}
                    className="flex-1 flex items-center gap-2 text-left min-w-0">
                    <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{addr}</span>
                  </button>
                  <button type="button"
                    onPointerDown={e => {
                      e.preventDefault();
                      delHist(historyKey, addr);
                      setHist(h => h.filter(a => a !== addr));
                      if (hist.length === 1 && orderSugs.length === 0) setHistOpen(false);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </>
          )}
          {orderSugs.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b bg-primary/5 text-[10px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
                <MapPin className="w-3 h-3" /> 歷史訂單常用地點
              </div>
              {orderSugs.map((s, i) => (
                <button key={i} type="button"
                  onPointerDown={e => { e.preventDefault(); pickHist(s.address); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left border-b last:border-0 group">
                  <MapPin className="w-3 h-3 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{s.address}</p>
                    <p className="text-[11px] text-muted-foreground">共 {s.frequency} 次</p>
                  </div>
                  {s.avg_price && Number(s.avg_price) > 0 && (
                    <span className="text-[11px] text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                      均 ${Number(s.avg_price).toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive mt-1 ml-1">{error}</p>}
    </div>
  );
}
