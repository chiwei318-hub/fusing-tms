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
