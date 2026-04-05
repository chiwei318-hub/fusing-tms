/**
 * Route-based multi-stop order import
 *
 * POST /api/orders/route-import/preview
 *   Body: { csvUrl?, csvText? } — parse only, no DB writes
 *   Returns: { ok, routes, warnings, summary }
 *
 * POST /api/orders/route-import
 *   Body: { routes, pickupAddress?, cargoDescription?, pickupDate?, customerName?, customerPhone? }
 *   Returns: { ok, inserted, orders, errors, duplicates }
 *
 * CSV format (dynamic column detection via header keywords):
 *   Supports both: standalone sheets (no timestamp prefix)
 *                  and Google Forms exports (timestamp in col[0])
 *   Route ID formats: FN-01-395-1, A3-41-1, B2-12, etc.
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

// ── CSV Parser (dynamic column detection) ────────────────────────────────
export function parseRoutesCsv(text: string): { routes: ParsedRoute[]; warnings: string[] } {
  const lines = text.split("\n").filter(l => l.trim());
  const routes: ParsedRoute[] = [];
  const warnings: string[] = [];
  let current: ParsedRoute | null = null;

  // Column index map — detected from header row
  let colMap: Record<string, number> = {};
  let headerFound = false;

  // Known header names for each field (handles slight variations)
  const HEADER_ALIASES: Record<string, string[]> = {
    routeId:    ["路線編號", "路線編號（預排）", "路线编号"],
    vehicle:    ["車型", "车型"],
    driverId:   ["司機ID", "司機id", "司机ID", "司机id"],
    timeSlot:   ["出車時段", "出车时段"],
    dockNo:     ["碼頭編號", "码头编号"],
    seq:        ["路線順序", "路线顺序"],
    storeName:  ["門市名稱", "门市名称"],
    address:    ["門市地址", "门市地址"],
    dailyStore: ["日配門市", "日配门市"],
  };

  function findColIdx(headers: string[], aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.includes(alias));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const cols = raw.split(",").map(c => c.trim());

    // Detect header row — look for a row containing 路線 or routeId keyword
    if (!headerFound) {
      const joined = cols.join(",");
      if (joined.includes("路線") && joined.includes("門市") && joined.includes("地址")) {
        for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
          colMap[field] = findColIdx(cols, aliases);
        }
        headerFound = true;
      }
      continue; // skip the header row itself
    }

    if (cols.length < 3) continue;

    const get = (field: string): string => {
      const idx = colMap[field];
      if (idx === undefined || idx < 0 || idx >= cols.length) return "";
      return cols[idx]?.trim() ?? "";
    };

    const routeId   = get("routeId");
    const vehicleType = get("vehicle");
    const driverId  = get("driverId");
    const timeSlot  = get("timeSlot");
    const dockNo    = get("dockNo");
    const seqStr    = get("seq");
    const storeName = get("storeName");
    const storeAddress = get("address");
    const dailyStore = get("dailyStore");

    // Detect new route row: routeId is non-empty and looks like a route code
    // Accepts formats: FN-01-395-1, A3-41-1, B2-12, etc. (alphanumeric + dash)
    const isRouteRow = routeId && /^[A-Za-z0-9][\w-]+-\d+$/.test(routeId);
    if (isRouteRow) {
      const cleanTimeSlot = timeSlot.startsWith("1899") || timeSlot.startsWith("0000") ? "" : timeSlot;
      current = { routeId, vehicleType, driverId, timeSlot: cleanTimeSlot, dockNo, stops: [] };
      routes.push(current);
    }

    // Stop row — use seq from 路線順序, fall back to 日配門市 number
    const seq = parseInt(seqStr, 10);
    const dailySeq = parseInt(dailyStore, 10);
    const effectiveSeq = (!isNaN(seq) && seq > 0) ? seq : (!isNaN(dailySeq) && dailySeq > 0 ? dailySeq : NaN);

    // Address: prefer dedicated address col; fall back to extracting from storeName
    // e.g. "高安 - 貨取到 台北市中山區農安街166號1樓" → address after last "市|縣" start
    let effectiveAddress = storeAddress;
    if (!effectiveAddress && storeName) {
      // Try to extract Taiwanese address from storeName (starts with 台北市, 新北市, etc.)
      const addrMatch = storeName.match(/(台[北南中東西]市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|嘉義[市縣]|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣).+/);
      if (addrMatch) effectiveAddress = addrMatch[0];
    }

    if (!isNaN(effectiveSeq) && effectiveSeq > 0 && (effectiveAddress || storeName)) {
      if (!current) {
        warnings.push(`第 ${i + 1} 行有站點資料但找不到對應路線：${storeName}`);
        continue;
      }
      current.stops.push({
        seq: effectiveSeq,
        storeName,
        address: effectiveAddress || storeName,
        isDailyStore: !isNaN(dailySeq) && dailySeq > 0,
      });
    }
  }

  if (!headerFound) {
    return { routes: [], warnings: ["找不到表頭列，請確認試算表包含「路線編號」、「門市名稱」、「門市地址」欄位"] };
  }

  // Filter routes with at least 1 stop
  const validRoutes = routes.filter(r => r.stops.length > 0);
  if (routes.length > validRoutes.length) {
    warnings.push(`${routes.length - validRoutes.length} 條路線無站點資料已略過`);
  }

  if (validRoutes.length === 0 && headerFound) {
    warnings.push("找到表頭列但未解析到任何路線，請確認路線編號格式正確（例：A3-41-1、FN-01-395-1）");
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
    const fetchedUrl = csvUrl ?? "(csvText)";

    res.json({
      ok: true,
      routes,
      warnings,
      fetchedUrl,
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
    const duplicates: { routeId: string; existingOrderId: number }[] = [];

    for (const route of routes) {
      try {
        if (route.stops.length === 0) continue;

        // Duplicate check: same route ID + same pickup date already imported?
        const dupCheck = await pool.query(
          `SELECT id FROM orders
           WHERE route_id = $1
             AND ($2::text IS NULL OR pickup_date = $2::text)
           LIMIT 1`,
          [route.routeId, pickupDate || null]
        );
        if (dupCheck.rows.length > 0) {
          duplicates.push({ routeId: route.routeId, existingOrderId: dupCheck.rows[0].id });
          continue;
        }

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

        // Extract route prefix (e.g. "FN" from "FN-01-395-1")
        const prefixMatch = route.routeId.match(/^([A-Z0-9]+)-/i);
        const routePrefix = prefixMatch?.[1]?.toUpperCase() ?? null;

        const { rows: result } = await pool.query(
          `INSERT INTO orders (
            customer_name, customer_phone,
            pickup_address, delivery_address,
            extra_delivery_addresses,
            cargo_description,
            required_vehicle_type,
            pickup_date, pickup_time,
            notes,
            route_id, route_prefix, station_count,
            shopee_driver_id, dispatch_dock,
            source_channel,
            status, source,
            zone_id, team_id,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,
            'route_import',
            'pending','route_import',
            $16,$17,
            NOW(),NOW()
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
            route.routeId,
            routePrefix,
            route.stops.length,
            route.driverId || null,
            route.dockNo || null,
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
      duplicates,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
