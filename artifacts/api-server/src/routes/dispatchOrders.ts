import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

export const dispatchOrdersRouter = Router();

// ── Ensure tables ─────────────────────────────────────────────────────────────
export async function ensureDispatchOrdersTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_orders (
      id             SERIAL PRIMARY KEY,
      fleet_id       INTEGER,
      fleet_name     TEXT,
      title          TEXT NOT NULL,
      week_start     TEXT NOT NULL,
      week_end       TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'sent',
      notes          TEXT,
      sent_at        TIMESTAMPTZ DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispatch_order_routes (
      id                  SERIAL PRIMARY KEY,
      dispatch_order_id   INTEGER NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
      order_id            INTEGER,
      route_label         TEXT,
      route_date          TEXT,
      prefix              TEXT,
      assigned_driver_id  INTEGER,
      assigned_driver_name TEXT,
      assigned_at         TIMESTAMPTZ
    )
  `);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS pickup_address TEXT`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS delivery_address TEXT`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION`);
  await db.execute(sql`ALTER TABLE dispatch_order_routes ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION`);
}

// ── POST /dispatch-orders — platform creates & sends a dispatch order ─────────
dispatchOrdersRouter.post("/", async (req, res) => {
  try {
    const {
      fleet_id, fleet_name, title, week_start, week_end, notes = null,
      routes = [],   // [{ order_id, route_label, route_date, prefix }]
    } = req.body;

    if (!fleet_id || !title || !week_start || !week_end) {
      return res.status(400).json({ ok: false, error: "fleet_id / title / week_start / week_end 必填" });
    }

    const [inserted] = await db.execute(sql`
      INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, notes, status)
      VALUES (${Number(fleet_id)}, ${fleet_name ?? null}, ${title}, ${week_start}, ${week_end}, ${notes}, 'sent')
      RETURNING id
    `).then(r => r.rows as any[]);

    const orderId = inserted.id;

    for (const r of routes) {
      await db.execute(sql`
        INSERT INTO dispatch_order_routes (dispatch_order_id, order_id, route_label, route_date, prefix)
        VALUES (${orderId}, ${r.order_id ?? null}, ${r.route_label ?? null}, ${r.route_date ?? null}, ${r.prefix ?? null})
      `);
    }

    res.json({ ok: true, id: orderId });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders — platform views all dispatch orders ─────────────────
dispatchOrdersRouter.get("/", async (req, res) => {
  try {
    const { fleet_id, status } = req.query as Record<string, string>;

    const conds: ReturnType<typeof sql>[] = [];
    if (fleet_id) conds.push(sql`d.fleet_id = ${Number(fleet_id)}`);
    if (status)   conds.push(sql`d.status = ${status}`);
    const whereClause = conds.length
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const orders = await db.execute(sql`
      SELECT d.*,
        COUNT(r.id)::int AS route_count,
        COUNT(r.assigned_driver_id)::int AS assigned_count,
        COALESCE(
          json_agg(json_build_object(
            'id',                   r.id,
            'dispatch_order_id',    r.dispatch_order_id,
            'order_id',             r.order_id,
            'route_label',          r.route_label,
            'route_date',           r.route_date,
            'prefix',               r.prefix,
            'assigned_driver_id',   r.assigned_driver_id,
            'assigned_driver_name', r.assigned_driver_name,
            'assigned_at',          r.assigned_at,
            'pickup_address',       r.pickup_address,
            'pickup_lat',           r.pickup_lat,
            'pickup_lng',           r.pickup_lng,
            'delivery_address',     r.delivery_address,
            'delivery_lat',         r.delivery_lat,
            'delivery_lng',         r.delivery_lng
          ) ORDER BY r.route_date, r.route_label) FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) AS routes
      FROM dispatch_orders d
      LEFT JOIN dispatch_order_routes r ON r.dispatch_order_id = d.id
      ${whereClause}
      GROUP BY d.id
      ORDER BY d.sent_at DESC
    `);

    res.json({ ok: true, orders: orders.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders/fleet/:fleetId — fleet views received orders ─────────
// NOTE: must be registered BEFORE /:id to avoid "fleet" being parsed as id
dispatchOrdersRouter.get("/fleet/:fleetId", async (req, res) => {
  try {
    const fleetId = Number(req.params.fleetId);
    const orders = await db.execute(sql`
      SELECT d.*,
        COUNT(r.id)::int AS route_count,
        COUNT(r.assigned_driver_id)::int AS assigned_count
      FROM dispatch_orders d
      LEFT JOIN dispatch_order_routes r ON r.dispatch_order_id = d.id
      WHERE d.fleet_id = ${fleetId}
      GROUP BY d.id
      ORDER BY d.sent_at DESC
      LIMIT 20
    `);
    res.json({ ok: true, orders: orders.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /dispatch-orders/:id — single order detail with routes ────────────────
dispatchOrdersRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.execute(sql`
      SELECT * FROM dispatch_orders WHERE id = ${id}
    `).then(r => r.rows as any[]);

    if (!order) return res.status(404).json({ ok: false, error: "找不到此派車單" });

    const routes = await db.execute(sql`
      SELECT r.*, fd.name AS driver_name, fd.vehicle_plate
      FROM dispatch_order_routes r
      LEFT JOIN fleet_drivers fd ON fd.id = r.assigned_driver_id
      WHERE r.dispatch_order_id = ${id}
      ORDER BY r.route_date, r.route_label
    `);

    res.json({ ok: true, order, routes: routes.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /dispatch-orders/:id/acknowledge — fleet acknowledges receipt ─────────
dispatchOrdersRouter.put("/:id/acknowledge", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`
      UPDATE dispatch_orders
      SET status = 'acknowledged', acknowledged_at = NOW()
      WHERE id = ${id} AND status = 'sent'
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /dispatch-orders/:id/routes/:routeItemId/assign — fleet assigns driver
dispatchOrdersRouter.put("/:id/routes/:routeItemId/assign", async (req, res) => {
  try {
    const orderId     = Number(req.params.id);
    const routeItemId = Number(req.params.routeItemId);
    const { driver_id, driver_name } = req.body;

    await db.execute(sql`
      UPDATE dispatch_order_routes
      SET assigned_driver_id   = ${driver_id   ?? null},
          assigned_driver_name = ${driver_name ?? null},
          assigned_at          = ${driver_id ? sql`NOW()` : sql`NULL`}
      WHERE id = ${routeItemId} AND dispatch_order_id = ${orderId}
    `);

    // If all routes assigned → auto-advance status to 'assigned'
    const [counts] = await db.execute(sql`
      SELECT COUNT(*)::int AS total, COUNT(assigned_driver_id)::int AS assigned
      FROM dispatch_order_routes
      WHERE dispatch_order_id = ${orderId}
    `).then(r => r.rows as any[]);

    if (counts && counts.total > 0 && counts.total === counts.assigned) {
      await db.execute(sql`
        UPDATE dispatch_orders SET status = 'assigned' WHERE id = ${orderId}
      `);
    } else {
      await db.execute(sql`
        UPDATE dispatch_orders SET status = 'acknowledged' WHERE id = ${orderId} AND status = 'sent'
      `);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── DELETE /dispatch-orders/:id — platform recalls/deletes an order ──────────
dispatchOrdersRouter.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM dispatch_orders WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /dispatch-orders/import-sheet — import from Google Sheet ─────────────
// Must be registered BEFORE /:id to avoid path conflict
function toSheetCsvUrl(raw: string): string {
  const m = raw.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return raw;
  const id = m[1];
  const gidM = raw.match(/gid=(\d+)/);
  const gid = gidM ? gidM[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

interface SheetRoute { route_label: string; route_date: string; prefix: string | null }

function normaliseDate(raw: string): string | null {
  const s = raw.replace(/\s/g, "");
  const year = new Date().getFullYear();

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;

  // M/D or M-D (no year) — e.g. 4/1, 04-01
  m = s.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;

  // M.D — e.g. 4.1
  m = s.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m) return `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;

  // M月D日 or M月D — e.g. 4月1日, 4月1
  m = s.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (m) return `${year}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;

  // M/D/YY or M/D/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  }

  return null;
}

/** RFC-4180 compliant CSV field splitter — handles quoted fields with commas and newlines. */
function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      fields.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseSheetRoutes(text: string): SheetRoute[] {
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, "");
  const allLines = clean.split(/\r?\n/);

  // Filter truly blank lines but keep index tracking; find first non-empty line as header
  const nonEmpty = allLines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim());
  if (nonEmpty.length < 2) return [];

  // Try each candidate header row (up to first 5 non-empty lines) in case leading rows are titles
  for (let hi = 0; hi < Math.min(5, nonEmpty.length - 1); hi++) {
    const headers = splitCsv(nonEmpty[hi].l).map(h =>
      h.replace(/\s+/g, "").toLowerCase()
    );
    const rawHeaders = splitCsv(nonEmpty[hi].l).map(h => h.trim());
    const dataLines = nonEmpty.slice(hi + 1);

    // ── Strategy 1: Horizontal (route rows × date columns) ──
    const dateColIndices: { idx: number; date: string }[] = [];
    rawHeaders.forEach((h, i) => {
      const d = normaliseDate(h);
      if (d) dateColIndices.push({ idx: i, date: d });
    });

    const routeColIdx = headers.findIndex(h =>
      /路線|路线|編號|编号|route/.test(h)
    );

    if (dateColIndices.length > 0 && routeColIdx >= 0) {
      const routes: SheetRoute[] = [];
      for (const { l } of dataLines) {
        const cols = splitCsv(l);
        const routeLabel = cols[routeColIdx]?.trim();
        if (!routeLabel) continue;
        const prefix = routeLabel.match(/^([A-Z]{2})/)?.[1] ?? null;
        for (const { idx, date } of dateColIndices) {
          const cell = cols[idx]?.trim();
          if (!cell || cell === "0" || /^[nN\-x×✗]$/.test(cell)) continue;
          routes.push({ route_label: routeLabel, route_date: date, prefix });
        }
      }
      if (routes.length > 0) return routes;
    }

    // ── Strategy 2: Vertical (one row per route per date) ──
    const colIdx = (patterns: RegExp[]) => {
      for (const pat of patterns) {
        const i = headers.findIndex(h => pat.test(h));
        if (i >= 0) return i;
      }
      return -1;
    };

    const routeCol = colIdx([/路線|路线|路号|route/]);
    const dateCol  = colIdx([/日期|date|出車|出车|trip/]);

    if (routeCol >= 0 && dateCol >= 0) {
      const routes: SheetRoute[] = [];
      for (const { l } of dataLines) {
        const cols = splitCsv(l);
        const routeLabel = cols[routeCol]?.trim();
        const dateRaw    = cols[dateCol]?.trim();
        if (!routeLabel || !dateRaw) continue;
        const date = normaliseDate(dateRaw) ?? dateRaw;
        const prefix = routeLabel.match(/^([A-Z]{2})/)?.[1] ?? null;
        routes.push({ route_label: routeLabel, route_date: date, prefix });
      }
      if (routes.length > 0) return routes;
    }
  }

  return [];
}

dispatchOrdersRouter.post("/import-sheet", async (req, res) => {
  try {
    const { sheet_url, fleet_id, fleet_name, title, week_start, week_end, notes = null } = req.body;
    if (!sheet_url || !fleet_id || !title || !week_start || !week_end) {
      return res.status(400).json({ ok: false, error: "sheet_url / fleet_id / title / week_start / week_end 為必填" });
    }

    const csvUrl = toSheetCsvUrl(sheet_url);
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error(`無法讀取試算表（HTTP ${resp.status}）`);
    const text = await resp.text();
    if (text.trim().startsWith("<!DOCTYPE")) {
      throw new Error("無法讀取試算表，請確認已設為「知道連結的人可查看」");
    }

    const routes = parseSheetRoutes(text);
    if (routes.length === 0) {
      return res.status(422).json({
        ok: false,
        error: "找不到可解析的路線資料。應確認試算表包含「路線」欄位（直向格式）或日期欄位（橫向格式），支援 4/1、4月1日、4.1 等日期格式",
      });
    }

    const [inserted] = await db.execute(sql`
      INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, notes, status)
      VALUES (${Number(fleet_id)}, ${fleet_name ?? null}, ${title}, ${week_start}, ${week_end}, ${notes}, 'sent')
      RETURNING id
    `).then(r => r.rows as any[]);

    const orderId = inserted.id;
    for (const r of routes) {
      await db.execute(sql`
        INSERT INTO dispatch_order_routes (dispatch_order_id, route_label, route_date, prefix)
        VALUES (${orderId}, ${r.route_label}, ${r.route_date}, ${r.prefix})
      `);
    }

    res.json({ ok: true, id: orderId, route_count: routes.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /dispatch-orders/from-shopee — build dispatch order from existing Shopee orders ──
// Must be registered BEFORE /:id
dispatchOrdersRouter.post("/from-shopee", async (req, res) => {
  try {
    const {
      fleet_id, fleet_name, title, week_start, week_end,
      notes = null,
      customer_names,
    } = req.body;

    if (!fleet_id || !title || !week_start || !week_end) {
      return res.status(400).json({ ok: false, error: "fleet_id / title / week_start / week_end 必填" });
    }

    const names: string[] = customer_names ?? ["蝦皮電商配送", "蝦皮電商配送（代收代付）"];

    const ordersRes = await pool.query(
      `SELECT id, order_no, pickup_date, delivery_address, cargo_description
       FROM orders
       WHERE customer_name = ANY($1)
         AND status NOT IN ('cancelled', 'delivered')
         AND (pickup_date IS NULL OR pickup_date BETWEEN $2 AND $3)
       ORDER BY pickup_date NULLS LAST, id`,
      [names, week_start, week_end],
    );

    if (ordersRes.rows.length === 0) {
      return res.status(422).json({
        ok: false,
        error: `在 ${week_start} ～ ${week_end} 期間找不到符合的訂單（${names.join("、")}）`,
      });
    }

    const [inserted] = await db.execute(sql`
      INSERT INTO dispatch_orders (fleet_id, fleet_name, title, week_start, week_end, notes, status)
      VALUES (${Number(fleet_id)}, ${fleet_name ?? null}, ${title}, ${week_start}, ${week_end}, ${notes}, 'sent')
      RETURNING id
    `).then(r => r.rows as any[]);

    const dispatchId = inserted.id;

    for (const o of ordersRes.rows) {
      const label = o.order_no || o.delivery_address?.slice(0, 40) || `訂單 #${o.id}`;
      const date  = o.pickup_date
        ? (o.pickup_date instanceof Date ? o.pickup_date.toISOString() : String(o.pickup_date)).slice(0, 10)
        : week_start;
      await db.execute(sql`
        INSERT INTO dispatch_order_routes (dispatch_order_id, order_id, route_label, route_date, prefix)
        VALUES (${dispatchId}, ${o.id}, ${label}, ${date}, ${null})
      `);
    }

    res.json({ ok: true, id: dispatchId, route_count: ordersRes.rows.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
