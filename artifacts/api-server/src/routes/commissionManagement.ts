import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const commissionManagementRouter = Router();

// GET /admin/commission — list all franchisees, fusingao fleets, and drivers with commission rates
commissionManagementRouter.get("/admin/commission", async (_req, res) => {
  try {
    const franchisees = await db.execute(sql`
      SELECT id, name, username, commission_rate::numeric, status
      FROM franchisees
      ORDER BY name
    `);
    const fleets = await db.execute(sql`
      SELECT id, fleet_name AS name, username, commission_rate::numeric,
             CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status
      FROM fusingao_fleets
      ORDER BY fleet_name
    `);
    const drivers = await db.execute(sql`
      SELECT id, name, license_plate, commission_rate::numeric, status
      FROM drivers
      WHERE status != 'deleted'
      ORDER BY name
    `);
    res.json({
      ok: true,
      franchisees: franchisees.rows,
      fleets: fleets.rows,
      drivers: drivers.rows,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /admin/commission/franchisee/:id
commissionManagementRouter.patch("/admin/commission/franchisee/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { commission_rate } = req.body;
    if (commission_rate === undefined || isNaN(Number(commission_rate))) {
      return res.status(400).json({ ok: false, error: "commission_rate 必填" });
    }
    await db.execute(sql`
      UPDATE franchisees SET commission_rate = ${Number(commission_rate)} WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /admin/commission/fleet/:id (fusingao_fleets)
commissionManagementRouter.patch("/admin/commission/fleet/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { commission_rate } = req.body;
    if (commission_rate === undefined || isNaN(Number(commission_rate))) {
      return res.status(400).json({ ok: false, error: "commission_rate 必填" });
    }
    await db.execute(sql`
      UPDATE fusingao_fleets SET commission_rate = ${Number(commission_rate)} WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /admin/commission/driver/:id
commissionManagementRouter.patch("/admin/commission/driver/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { commission_rate } = req.body;
    if (commission_rate === undefined || isNaN(Number(commission_rate))) {
      return res.status(400).json({ ok: false, error: "commission_rate 必填" });
    }
    await db.execute(sql`
      UPDATE drivers SET commission_rate = ${Number(commission_rate)} WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /admin/commission/batch — bulk update commission rates
commissionManagementRouter.post("/admin/commission/batch", async (req, res) => {
  try {
    const {
      type,
      commission_rate,
    } = req.body as { type: string; commission_rate: number };

    if (!type || commission_rate === undefined || isNaN(Number(commission_rate))) {
      return res.status(400).json({ ok: false, error: "type 和 commission_rate 必填" });
    }

    const rate = Number(commission_rate);
    let updated = { franchisees: 0, fleets: 0, drivers: 0 };

    if (type === "franchisee" || type === "all") {
      const r = await db.execute(sql`UPDATE franchisees SET commission_rate = ${rate}`);
      updated.franchisees = r.rowCount ?? 0;
    }
    if (type === "fleet" || type === "all") {
      const r = await db.execute(sql`UPDATE fusingao_fleets SET commission_rate = ${rate}`);
      updated.fleets = r.rowCount ?? 0;
    }
    if (type === "driver" || type === "all") {
      const r = await db.execute(sql`UPDATE drivers SET commission_rate = ${rate} WHERE status != 'deleted'`);
      updated.drivers = r.rowCount ?? 0;
    }

    const total = updated.franchisees + updated.fleets + updated.drivers;
    res.json({ ok: true, updated, total });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
