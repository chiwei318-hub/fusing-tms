import { Router } from "express";
import { db } from "@workspace/db";
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
        COUNT(r.assigned_driver_id)::int AS assigned_count
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

function parseSheetRoutes(text: string): SheetRoute[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const splitCsv = (line: string) =>
    line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));

  const headers = splitCsv(lines[0]);

  // ── Strategy 1: Horizontal (routes as rows, dates as column headers) ──
  // Detect if column headers look like dates: "4/1", "2026-04-01", "04-01" etc.
  const DATE_RE = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?)$/;
  const dateColIndices: { idx: number; date: string }[] = [];
  headers.forEach((h, i) => {
    if (DATE_RE.test(h.replace(/\s/g, ""))) {
      // Normalise to YYYY-MM-DD
      let d = h.replace(/\s/g, "");
      const parts = d.split(/[-/]/);
      if (parts.length === 2) {
        const year = new Date().getFullYear();
        d = `${year}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      } else if (parts.length === 3 && parts[0].length <= 2) {
        // M/D/YY or M/D/YYYY
        const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        d = `${yr}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      } else if (parts.length === 3 && parts[0].length === 4) {
        d = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
      dateColIndices.push({ idx: i, date: d });
    }
  });

  const routeColIdx = headers.findIndex(h =>
    /路線|route|route_id|route_no/i.test(h)
  );

  if (dateColIndices.length > 0 && routeColIdx >= 0) {
    // Horizontal mode
    const routes: SheetRoute[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsv(lines[i]);
      const routeLabel = cols[routeColIdx]?.trim();
      if (!routeLabel) continue;
      const prefix = routeLabel.match(/^([A-Z]{2})/)?.[1] ?? null;
      for (const { idx, date } of dateColIndices) {
        const cell = cols[idx]?.trim();
        if (!cell || cell === "0" || cell.toLowerCase() === "n" || cell === "-") continue;
        routes.push({ route_label: routeLabel, route_date: date, prefix });
      }
    }
    if (routes.length > 0) return routes;
  }

  // ── Strategy 2: Vertical (one row per route per date) ──
  const colIdx = (names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex(h => h.toLowerCase().includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const routeCol = colIdx(["路線號碼", "路線", "route", "route_id"]);
  const dateCol  = colIdx(["日期", "出車日期", "date", "trip_date"]);

  if (routeCol < 0 || dateCol < 0) return [];

  const routes: SheetRoute[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]);
    const routeLabel = cols[routeCol]?.trim();
    const dateRaw    = cols[dateCol]?.trim();
    if (!routeLabel || !dateRaw) continue;
    // Try to normalise date
    let date = dateRaw;
    const parts = dateRaw.split(/[-/]/);
    if (parts.length === 2) {
      date = `${new Date().getFullYear()}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
    }
    const prefix = routeLabel.match(/^([A-Z]{2})/)?.[1] ?? null;
    routes.push({ route_label: routeLabel, route_date: date, prefix });
  }
  return routes;
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
        error: "找不到可解析的路線資料。請確認試算表包含「路線」欄位（垂直格式）或日期欄位（橫向格式）",
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
