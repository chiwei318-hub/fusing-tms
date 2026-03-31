/**
 * Route-based multi-stop order import
 *
 * POST /api/orders/route-import
 *   Body: { csvUrl?: string, rows?: ParsedRoute[] }
 *   - csvUrl: Google Sheets public CSV export URL
 *   - rows: already-parsed routes (for preview/confirm flow)
 *
 * POST /api/orders/route-import/preview
 *   Body: { csvUrl } — parse only, no DB writes
 *
 * Format:
 *   col[0] timestamp  col[2] routeId  col[3] vehicleType  col[4] driverId
 *   col[5] timeSlot   col[6] dockNo   col[7] stopSeq      col[8] storeName  col[9] storeAddress
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { applyAutoRoutingToOrder } from "./autoRouting";

export const routeImportRouter = Router();

// ── Types ────────────────────────────────────────────────────────────────
export interface RouteStop {
  seq: number;
  storeName: string;
  address: string;
  isDailyStore?: boolean;
}

export interface ParsedRoute {
  routeId: string;
  vehicleType: string;
  driverId: string;
  timeSlot: string;
  dockNo: string;
  stops: RouteStop[];
}

// ── CSV Parser ────────────────────────────────────────────────────────────
export function parseRoutesCsv(text: string): { routes: ParsedRoute[]; warnings: string[] } {
  const lines = text.split("\n").filter(l => l.trim());
  const routes: ParsedRoute[] = [];
  const warnings: string[] = [];
  let current: ParsedRoute | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Split CSV by comma (addresses don't contain commas in this format)
    const cols = raw.split(",").map(c => c.trim());

    if (cols.length < 8) continue;
    // Skip header row
    if (cols[2] === "路線編號（預排）") continue;

    const routeId = cols[2] ?? "";
    const vehicleType = cols[3] ?? "";
    const driverId = cols[4] ?? "";
    const timeSlot = cols[5] ?? "";
    const dockNo = cols[6] ?? "";
    const seqStr = cols[7] ?? "";
    const storeName = cols[8] ?? "";
    const storeAddress = cols[9] ?? "";
    const dailyStore = cols[10] ?? "";

    // New route header row (route ID present and matches pattern)
    if (routeId && routeId.match(/^F[A-Z]+-\d+-\d+/)) {
      // Clean up Excel's null date artifact "1899/12/30"
      const cleanTimeSlot = timeSlot.startsWith("1899") ? "" : timeSlot;
      current = { routeId, vehicleType, driverId, timeSlot: cleanTimeSlot, dockNo, stops: [] };
      routes.push(current);
    }

    // Stop row (has seq number and address) — same row may also have route info
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > 0 && storeAddress) {
      if (!current) {
        warnings.push(`第 ${i + 1} 行有站點資料但找不到對應路線：${storeName}`);
        continue;
      }
      current.stops.push({
        seq,
        storeName,
        address: storeAddress,
        isDailyStore: !!dailyStore.trim(),
      });
    }
  }

  // Filter routes with at least 1 stop
  const validRoutes = routes.filter(r => r.stops.length > 0);
  if (routes.length > validRoutes.length) {
    warnings.push(`${routes.length - validRoutes.length} 條路線沒有站點資料已略過`);
  }

  return { routes: validRoutes, warnings };
}

// ── Preview endpoint ──────────────────────────────────────────────────────
routeImportRouter.post("/orders/route-import/preview", async (req, res) => {
  try {
    const { csvUrl, csvText } = req.body as { csvUrl?: string; csvText?: string };

    let text = csvText ?? "";
    if (!text && csvUrl) {
      const r = await fetch(csvUrl);
      if (!r.ok) return res.status(400).json({ error: `無法取得試算表：HTTP ${r.status}` });
      text = await r.text();
      // Redirect HTML check
      if (text.trim().startsWith("<!DOCTYPE")) {
        return res.status(400).json({ error: "無法取得 CSV，請確認試算表已設為「知道連結的人可查看」，並使用 CSV 匯出連結" });
      }
    }

    if (!text) return res.status(400).json({ error: "請提供 csvUrl 或 csvText" });

    const { routes, warnings } = parseRoutesCsv(text);

    res.json({
      ok: true,
      routes,
      warnings,
      summary: {
        routeCount: routes.length,
        stopCount: routes.reduce((s, r) => s + r.stops.length, 0),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Import endpoint (actually insert orders) ──────────────────────────────
routeImportRouter.post("/orders/route-import", async (req, res) => {
  try {
    const {
      routes,
      pickupAddress = "（依路線倉庫）",
      cargoDescription = "電商門市配送",
      pickupDate = null,
      customerName = "蝦皮電商配送",
      customerPhone = "0800000000",
    } = req.body as {
      routes: ParsedRoute[];
      pickupAddress?: string;
      cargoDescription?: string;
      pickupDate?: string | null;
      customerName?: string;
      customerPhone?: string;
    };

    if (!Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({ error: "請先預覽並確認路線資料" });
    }

    const inserted: { orderId: number; routeId: string; stopCount: number }[] = [];
    const errors: { routeId: string; error: string }[] = [];

    for (const route of routes) {
      try {
        if (route.stops.length === 0) continue;

        const firstStop = route.stops[0];
        const extraStops = route.stops.slice(1);

        // Build extra_delivery_addresses JSON
        const extraDeliveryJson = extraStops.length > 0
          ? JSON.stringify(extraStops.map(s => ({
              address: s.address,
              contactPerson: s.storeName,
              note: s.isDailyStore ? "日配門市" : "",
            })))
          : null;

        // Auto-routing
        const routing = await applyAutoRoutingToOrder({
          pickup_address: pickupAddress,
          delivery_address: firstStop.address,
          required_vehicle_type: route.vehicleType || null,
          cargo_description: cargoDescription,
          region: null,
          postal_code: null,
        });

        // Determine time window from timeSlot (e.g. "13:40-14:20" → pickup 13:40)
        const pickupTime = route.timeSlot?.match(/^(\d{2}:\d{2})/)?.[1] ?? null;

        const { rows: result } = await pool.query(
          `INSERT INTO orders (
            customer_name, customer_phone,
            pickup_address, delivery_address,
            extra_delivery_addresses,
            cargo_description,
            required_vehicle_type,
            pickup_date, pickup_time,
            notes,
            status, source,
            zone_id, team_id,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending','route_import',$11,$12,NOW(),NOW()
          ) RETURNING id`,
          [
            customerName,
            customerPhone,
            pickupAddress,
            firstStop.address,
            extraDeliveryJson,
            cargoDescription,
            route.vehicleType || null,
            pickupDate || null,
            pickupTime,
            `路線：${route.routeId}｜碼頭：${route.dockNo || "—"}｜司機ID：${route.driverId || "—"}｜共 ${route.stops.length} 站（${route.stops.map(s => s.storeName).join("→")}）`,
            routing.zone_id ?? null,
            routing.team_id ?? null,
          ]
        );

        inserted.push({ orderId: result[0].id, routeId: route.routeId, stopCount: route.stops.length });
      } catch (e: any) {
        errors.push({ routeId: route.routeId, error: String(e).slice(0, 200) });
      }
    }

    res.json({
      ok: true,
      inserted: inserted.length,
      orders: inserted,
      errors,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
