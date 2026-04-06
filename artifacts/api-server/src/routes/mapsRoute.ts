import { Router } from "express";
import { getDistanceKm, isGoogleMapsConfigured } from "../lib/distanceService";

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
