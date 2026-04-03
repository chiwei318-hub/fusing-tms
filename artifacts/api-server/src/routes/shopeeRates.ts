import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const shopeeRatesRouter = Router();

shopeeRatesRouter.get("/", async (req, res) => {
  try {
    const { service_type, vehicle_type, route } = req.query as Record<string, string>;

    let conditions: string[] = [];
    if (service_type) conditions.push(`service_type = '${service_type.replace(/'/g, "''")}'`);
    if (vehicle_type) conditions.push(`vehicle_type = '${vehicle_type.replace(/'/g, "''")}'`);
    if (route) conditions.push(`route ILIKE '%${route.replace(/'/g, "''")}%'`);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.execute(sql`
      SELECT * FROM shopee_rate_cards
      ${sql.raw(where)}
      ORDER BY service_type, route, vehicle_type
    `);

    const summaryRows = await db.execute(sql`
      SELECT service_type, COUNT(*) as count
      FROM shopee_rate_cards
      GROUP BY service_type
      ORDER BY service_type
    `);

    res.json({ ok: true, items: rows.rows, summary: summaryRows.rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

shopeeRatesRouter.get("/lookup", async (req, res) => {
  try {
    const { service_type, route, vehicle_type } = req.query as Record<string, string>;
    if (!service_type || !route || !vehicle_type) {
      return res.status(400).json({ ok: false, error: "需要 service_type, route, vehicle_type" });
    }

    const rows = await db.execute(sql`
      SELECT * FROM shopee_rate_cards
      WHERE service_type = ${service_type}
        AND route = ${route}
        AND vehicle_type = ${vehicle_type}
      LIMIT 1
    `);

    if ((rows.rows as any[]).length === 0) {
      return res.json({ ok: false, error: "找不到對應費率" });
    }
    res.json({ ok: true, item: (rows.rows as any[])[0] });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /import ──────────────────────────────────────────────────────────────
// body: { rows: RateRow[], mode: "replace" | "merge" }
// mode "replace" → truncate then insert
// mode "merge"   → upsert per (service_type, route, vehicle_type)
interface RateRow {
  service_type: string;
  route: string;
  vehicle_type: string;
  unit_price: number;
  price_unit: string;
  notes: string | null;
  effective_month?: string | null;
}

shopeeRatesRouter.post("/import", async (req, res) => {
  try {
    const { rows, mode, effective_month = null } = req.body as {
      rows: RateRow[];
      mode: "replace" | "merge";
      effective_month?: string | null;
    };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ ok: false, error: "rows 不得為空" });
    }

    if (mode === "replace") {
      if (effective_month) {
        await db.execute(sql`DELETE FROM shopee_rate_cards WHERE effective_month = ${effective_month}`);
      } else {
        await db.execute(sql`TRUNCATE TABLE shopee_rate_cards RESTART IDENTITY`);
      }
    }

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const { service_type, route, vehicle_type, unit_price, price_unit, notes } = row;
      if (!service_type || !route || !vehicle_type) continue;
      const effMonth = row.effective_month ?? effective_month ?? null;

      if (mode === "merge") {
        const existing = await db.execute(sql`
          SELECT id FROM shopee_rate_cards
          WHERE service_type = ${service_type}
            AND route = ${route}
            AND vehicle_type = ${vehicle_type}
            AND (effective_month = ${effMonth} OR (effective_month IS NULL AND ${effMonth} IS NULL))
          LIMIT 1
        `);
        if ((existing.rows as any[]).length > 0) {
          const existingId = (existing.rows as any[])[0].id;
          await db.execute(sql`
            UPDATE shopee_rate_cards
            SET unit_price = ${unit_price ?? null},
                price_unit = ${price_unit ?? "趟"},
                notes      = ${notes ?? null},
                effective_month = ${effMonth}
            WHERE id = ${existingId}
          `);
          updated++;
          continue;
        }
      }

      await db.execute(sql`
        INSERT INTO shopee_rate_cards (service_type, route, vehicle_type, unit_price, price_unit, notes, effective_month)
        VALUES (${service_type}, ${route}, ${vehicle_type}, ${unit_price ?? null}, ${price_unit ?? "趟"}, ${notes ?? null}, ${effective_month})
      `);
      inserted++;
    }

    res.json({ ok: true, inserted, updated, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
