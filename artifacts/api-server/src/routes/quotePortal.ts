/**
 * 模組 5：廠商查價入口 API
 * POST /api/quote-portal/verify-token
 * POST /api/quote-portal/get-quote
 * POST /api/quote-portal/create-order
 */
import { Router } from "express";
import { pool } from "@workspace/db";

export const quotePortalRouter = Router();

// ── Token 規則：btoa(JSON.stringify({ id, secret: "fuyong-"+id })) ──────────
// 前端可直接呼叫 /api/partners 取得 id 後 encode

function encodeToken(partnerId: number): string {
  return Buffer.from(JSON.stringify({ id: partnerId, s: `fy${partnerId}` })).toString("base64url");
}

function decodeToken(token: string): number | null {
  try {
    const obj = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
    if (obj?.id && obj?.s === `fy${obj.id}`) return obj.id;
    return null;
  } catch { return null; }
}

// 距離計算（共用）
async function getDistKm(origin: string, dest: string): Promise<{ distance_km: number; duration_min: number; source: string }> {
  const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&mode=driving&language=zh-TW&key=${apiKey}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const d = await r.json() as any;
      const el = d?.rows?.[0]?.elements?.[0];
      if (el?.status === "OK") {
        return { distance_km: el.distance.value / 1000, duration_min: Math.round(el.duration.value / 60), source: "google" };
      }
    } catch { /* fallback */ }
  }
  // Haversine 備援（簡化版）
  const geo: Record<string, [number, number]> = {
    "台北": [25.048, 121.517], "新北": [25.012, 121.465], "桃園": [24.993, 121.301],
    "新竹": [24.814, 120.967], "台中": [24.138, 120.686], "台南": [22.999, 120.212],
    "高雄": [22.627, 120.301], "花蓮": [23.991, 121.601], "台東": [22.755, 121.143],
  };
  const find = (a: string): [number, number] => {
    for (const [k, v] of Object.entries(geo)) if (a.includes(k)) return v;
    return [25.048, 121.517];
  };
  const [lat1, lon1] = find(origin);
  const [lat2, lon2] = find(dest);
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.35;
  return { distance_km: km, duration_min: Math.round(km * 1.5), source: "haversine" };
}

// ── POST /api/quote-portal/verify-token ──────────────────────────────────────

quotePortalRouter.post("/quote-portal/verify-token", async (req, res) => {
  try {
    const { token, partner_id } = req.body;

    let pid: number | null = null;
    if (token) pid = decodeToken(String(token));
    else if (partner_id) pid = Number(partner_id);

    if (!pid) return res.status(401).json({ ok: false, error: "無效的廠商憑證" });

    const { rows } = await pool.query(
      `SELECT id, name, contract_type, is_active FROM partners WHERE id = $1 LIMIT 1`,
      [pid]
    );
    if (!rows[0] || !rows[0].is_active) {
      return res.status(403).json({ ok: false, error: "廠商未啟用或不存在" });
    }

    res.json({
      ok: true,
      partner: rows[0],
      token: encodeToken(pid),  // 回傳標準化 token
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/quote-portal/get-quote ─────────────────────────────────────────

quotePortalRouter.post("/quote-portal/get-quote", async (req, res) => {
  try {
    const {
      token, partner_id,
      pickup, delivery,
      vehicle_type = "3.5t",
      equipment = [] as string[],
    } = req.body;

    let pid: number | null = null;
    if (token) pid = decodeToken(String(token));
    else if (partner_id) pid = Number(partner_id);
    if (!pid) return res.status(401).json({ ok: false, error: "無效的廠商憑證" });

    const partnerRow = await pool.query(
      `SELECT * FROM partners WHERE id = $1 AND is_active = true LIMIT 1`, [pid]
    );
    if (!partnerRow.rows[0]) return res.status(403).json({ ok: false, error: "廠商未啟用" });
    const p = partnerRow.rows[0];

    // 距離
    const dist = await getDistKm(pickup, delivery);
    const km = dist.distance_km;

    // 車型矩陣
    const vtRow = await pool.query(
      `SELECT weight_factor, base_surcharge FROM vehicle_type_matrix WHERE type_code = $1 LIMIT 1`,
      [vehicle_type]
    ).catch(() => ({ rows: [] }));
    const vt = vtRow.rows[0] ?? { weight_factor: 1.0, base_surcharge: 0 };

    const base = Number(p.base_price) + km * Number(p.km_rate);
    let vehiclePrice = base * Number(vt.weight_factor) + Number(vt.base_surcharge);

    // 設備
    const equipRows = equipment.length > 0
      ? (await pool.query(`SELECT * FROM vehicle_equipment WHERE code = ANY($1)`, [equipment]).catch(() => ({ rows: [] }))).rows
      : [];
    const appliedEquipment: { name: string; surcharge: number; multiplier: number }[] = [];
    for (const eq of equipRows) {
      vehiclePrice = vehiclePrice * Number(eq.multiplier) + Number(eq.surcharge);
      appliedEquipment.push({ name: eq.name, surcharge: Number(eq.surcharge), multiplier: Number(eq.multiplier) });
    }

    const totalQuote = Math.round(vehiclePrice);

    res.json({
      ok: true,
      quote_summary: {
        distance_km:     Math.round(km * 10) / 10,
        duration_min:    dist.duration_min,
        vehicle_type,
        partner_price:   totalQuote,
        equipment:       appliedEquipment,
        distance_source: dist.source,
      },
      breakdown: {
        base_price:     Math.round(Number(p.base_price)),
        km_fee:         Math.round(km * Number(p.km_rate)),
        weight_factor:  Number(vt.weight_factor),
        equipment_list: appliedEquipment,
        total:          totalQuote,
      },
    });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── POST /api/quote-portal/create-order ──────────────────────────────────────

quotePortalRouter.post("/quote-portal/create-order", async (req, res) => {
  try {
    const {
      token, partner_id,
      pickup, delivery,
      vehicle_type, total_quote,
      contact_name, contact_phone, notes,
    } = req.body;

    let pid: number | null = null;
    if (token) pid = decodeToken(String(token));
    else if (partner_id) pid = Number(partner_id);
    if (!pid) return res.status(401).json({ ok: false, error: "無效的廠商憑證" });

    const { rows: pr } = await pool.query(`SELECT name FROM partners WHERE id = $1 LIMIT 1`, [pid]);
    const partnerName = pr[0]?.name ?? "廠商";

    // 寫入 orders 表
    const { rows } = await pool.query(`
      INSERT INTO orders (
        customer_name, customer_phone,
        pickup_address, delivery_address,
        required_vehicle_type,
        total_fee, notes,
        source, status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'portal','pending',NOW())
      RETURNING id, order_no
    `, [
      contact_name ?? partnerName,
      contact_phone ?? "",
      pickup, delivery,
      vehicle_type,
      total_quote,
      notes ?? `廠商查價入口下單 — ${partnerName}`,
    ]);

    res.json({ ok: true, order: rows[0] });
  } catch (err: any) {
    console.error("[QuotePortal] create-order:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/quote-portal/token/:partnerId ────────────────────────────────────
// 後台用：取得廠商的查價連結 token

quotePortalRouter.get("/quote-portal/token/:partnerId", async (req, res) => {
  try {
    const pid = parseInt(req.params.partnerId);
    if (isNaN(pid)) return res.status(400).json({ ok: false, error: "無效 ID" });
    const { rows } = await pool.query(`SELECT id, name FROM partners WHERE id = $1`, [pid]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: "廠商不存在" });
    const token = encodeToken(pid);
    const base = process.env.FRONTEND_URL ?? "";
    res.json({ ok: true, token, url: `${base}/quote/${pid}?t=${token}` });
  } catch (err: any) { res.status(500).json({ ok: false, error: err.message }); }
});
