import { Router } from "express";
import { getDistanceKm, getRouteDistanceKm, isGoogleMapsConfigured } from "../lib/distanceService";

export const mapsRouter = Router();

/**
 * GET /maps/distance?from=ADDRESS&to=ADDRESS
 * 計算兩地距離（Google Maps 優先，無 key 則 Haversine 回退）
 */
mapsRouter.get("/maps/distance", async (req, res) => {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();

  if (!from || !to) {
    res.status(400).json({ error: "需要 from 和 to 參數" });
    return;
  }

  try {
    const result = await getDistanceKm(from, to);
    res.json(result);
  } catch (err) {
    console.error("[mapsRoute] distance error:", err);
    res.status(500).json({ error: "距離計算失敗" });
  }
});

/**
 * POST /maps/route-distance
 * 計算多點路線總距離（最多 5 個地址）
 * body: { addresses: string[] }
 */
mapsRouter.post("/maps/route-distance", async (req, res) => {
  const { addresses } = req.body as { addresses?: string[] };
  if (!Array.isArray(addresses) || addresses.length < 2) {
    res.status(400).json({ error: "至少需要 2 個地址" });
    return;
  }
  const cleaned = addresses.map((a: string) => String(a).trim()).filter(Boolean).slice(0, 5);
  if (cleaned.length < 2) {
    res.status(400).json({ error: "有效地址不足 2 個" });
    return;
  }
  try {
    const result = await getRouteDistanceKm(cleaned);
    res.json(result);
  } catch (err) {
    console.error("[mapsRoute] route-distance error:", err);
    res.status(500).json({ error: "路線距離計算失敗" });
  }
});

/**
 * GET /maps/config
 * 確認 Google Maps API Key 是否已設定
 */
mapsRouter.get("/maps/config", (_req, res) => {
  res.json({
    hasGoogleMapsKey: isGoogleMapsConfigured(),
    message: isGoogleMapsConfigured()
      ? "✅ Google Maps API 已啟用，使用真實路線距離"
      : "⚠️ 未設定 GOOGLE_MAPS_API_KEY，使用 Haversine 直線距離估算",
  });
});
