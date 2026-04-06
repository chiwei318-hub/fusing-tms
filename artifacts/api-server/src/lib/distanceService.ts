/**
 * 距離計算服務
 * 優先使用 Google Maps Distance Matrix API；無 API Key 時自動回退至 Haversine 直線距離
 */

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";

export interface DistanceResult {
  distance_km: number;
  duration_min?: number;
  source: "google" | "haversine";
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** 台灣城市關鍵字 → 概略座標（與 smartOrder.ts 相同的 fallback 表） */
const TAIWAN_GEOCODE: [string[], number, number][] = [
  [["台北", "信義", "中正", "大安", "松山", "內湖", "南港", "萬華", "文山", "北投", "士林", "中山"], 25.048, 121.517],
  [["新北", "板橋", "中和", "永和", "新莊", "三重", "土城", "汐止", "新店", "淡水"], 25.010, 121.466],
  [["桃園", "中壢", "楊梅", "平鎮", "大溪", "龜山", "八德"], 24.993, 121.301],
  [["新竹", "湖口", "竹北", "竹東", "竹南"], 24.803, 120.968],
  [["苗栗", "頭份", "竹南"], 24.560, 120.820],
  [["台中", "西屯", "北屯", "南屯", "豐原", "太平", "大里"], 24.148, 120.674],
  [["彰化", "員林", "鹿港", "溪湖"], 24.074, 120.536],
  [["南投", "草屯", "埔里", "竹山"], 23.910, 120.680],
  [["雲林", "斗六", "斗南", "虎尾"], 23.750, 120.540],
  [["嘉義", "朴子", "水上", "民雄"], 23.480, 120.449],
  [["台南", "永康", "東區", "南區", "安平", "仁德", "新化"], 22.999, 120.226],
  [["高雄", "三民", "苓雅", "左營", "鳳山", "楠梓", "岡山", "仁武", "大寮"], 22.627, 120.302],
  [["屏東", "潮州", "東港", "萬丹"], 22.670, 120.487],
  [["基隆", "七堵", "暖暖"], 25.128, 121.740],
  [["宜蘭", "羅東", "礁溪", "蘇澳"], 24.757, 121.753],
  [["花蓮", "吉安", "壽豐", "新城"], 23.992, 121.602],
  [["台東", "成功", "關山", "卑南"], 22.755, 121.144],
];

export function geocodeTW(addr: string): { lat: number; lng: number } | null {
  for (const [keywords, lat, lng] of TAIWAN_GEOCODE) {
    if (keywords.some(k => addr.includes(k))) return { lat, lng };
  }
  return null;
}

/** 嘗試 Google Maps，失敗則 Haversine */
export async function getDistanceKm(
  fromAddress: string,
  toAddress: string,
): Promise<DistanceResult> {
  if (GOOGLE_MAPS_KEY) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${encodeURIComponent(fromAddress)}` +
        `&destinations=${encodeURIComponent(toAddress)}` +
        `&key=${GOOGLE_MAPS_KEY}` +
        `&language=zh-TW&region=TW`;

      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        const el = data?.rows?.[0]?.elements?.[0];
        if (el?.status === "OK" && el.distance?.value) {
          return {
            distance_km: Math.round(el.distance.value / 100) / 10,
            duration_min: Math.round(el.duration.value / 60),
            source: "google",
          };
        }
      }
    } catch {
      /* fall through to haversine */
    }
  }

  const from = geocodeTW(fromAddress);
  const to = geocodeTW(toAddress);
  if (from && to) {
    return {
      distance_km: haversine(from.lat, from.lng, to.lat, to.lng),
      source: "haversine",
    };
  }

  return { distance_km: 0, source: "haversine" };
}

export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_KEY;
}
