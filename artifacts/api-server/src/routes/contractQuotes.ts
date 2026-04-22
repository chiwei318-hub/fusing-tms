import { Router } from "express";
import { pool } from "@workspace/db";
import { z } from "zod";

const router = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────

const QuoteLineSchema = z.object({
  routeFrom:   z.string().optional().default(""),
  routeTo:     z.string().optional().default(""),
  vehicleType: z.string().optional().default(""),
  cargoType:   z.string().optional().default(""),
  unit:        z.enum(["per_trip","per_km","per_ton","per_cbm","per_day","per_hour"]).default("per_trip"),
  unitPrice:   z.coerce.number().min(0),
  minCharge:   z.coerce.number().min(0).default(0),
  notes:       z.string().optional().default(""),
  sortOrder:   z.coerce.number().default(0),
});

const CreateQuoteSchema = z.object({
  customerId:    z.coerce.number().optional(),
  customerName:  z.string().optional().default(""),
  title:         z.string().min(1),
  status:        z.enum(["draft","confirmed","expired","cancelled"]).default("draft"),
  quoteDate:     z.string().optional(),
  validFrom:     z.string().optional(),
  validTo:       z.string().optional(),
  contactPerson: z.string().optional().default(""),
  contactPhone:  z.string().optional().default(""),
  notes:         z.string().optional().default(""),
  createdBy:     z.string().optional().default(""),
  updatedBy:     z.string().optional().default(""),
  items:         z.array(QuoteLineSchema).default([]),
});

// ─── Auto-generate quote number ───────────────────────────────────────────────

async function nextQuoteNo(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = await pool.query(
    `SELECT COUNT(*) AS cnt FROM customer_contract_quotes WHERE quote_no LIKE $1`,
    [`QT-${today}-%`]
  );
  const seq = String(Number(r.rows[0].cnt) + 1).padStart(3, "0");
  return `QT-${today}-${seq}`;
}

// ─── GET /api/contract-quotes ─────────────────────────────────────────────────

router.get("/contract-quotes", async (req, res) => {
  try {
    const { search, status, customerId, validOnly } = req.query as Record<string,string>;
    let q = `
      SELECT q.*, c.name AS customer_name_resolved, c.short_name AS customer_short_name,
             COUNT(qi.id) AS item_count
      FROM customer_contract_quotes q
      LEFT JOIN customers c ON q.customer_id = c.id
      LEFT JOIN customer_contract_quote_items qi ON qi.quote_id = q.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (q.title ILIKE $${params.length} OR q.quote_no ILIKE $${params.length} OR q.customer_name ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }
    if (status && status !== "all") {
      params.push(status);
      q += ` AND q.status = $${params.length}`;
    }
    if (customerId) {
      params.push(Number(customerId));
      q += ` AND q.customer_id = $${params.length}`;
    }
    if (validOnly === "1") {
      q += ` AND q.valid_from <= CURRENT_DATE AND (q.valid_to IS NULL OR q.valid_to >= CURRENT_DATE) AND q.status = 'confirmed'`;
    }
    q += ` GROUP BY q.id, c.name, c.short_name ORDER BY q.created_at DESC`;
    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/contract-quotes/lookup ─────────────────────────────────────────
// Must be before /:id route so "lookup" is not parsed as an ID

router.get("/contract-quotes/lookup", async (req, res) => {
  try {
    const { customerName, vehicleType, fromAddress, toAddress } = req.query as Record<string, string>;
    if (!customerName) return res.status(400).json({ error: "customerName required" });

    const params: any[] = [`%${customerName}%`];
    let q = `
      SELECT qi.id, qi.route_from, qi.route_to, qi.vehicle_type, qi.cargo_type,
             qi.unit, qi.unit_price, qi.min_charge, qi.notes,
             cq.id AS quote_id, cq.quote_no, cq.title,
             cq.valid_from, cq.valid_to,
             COALESCE(c.short_name, c.name, cq.customer_name) AS customer_label
      FROM customer_contract_quote_items qi
      JOIN customer_contract_quotes cq ON qi.quote_id = cq.id
      LEFT JOIN customers c ON cq.customer_id = c.id
      WHERE cq.status = 'confirmed'
        AND (cq.valid_to IS NULL OR cq.valid_to >= CURRENT_DATE)
        AND (
          c.name ILIKE $1
          OR c.short_name ILIKE $1
          OR cq.customer_name ILIKE $1
        )
    `;
    if (vehicleType && vehicleType !== "all") {
      params.push(`%${vehicleType}%`);
      q += ` AND (qi.vehicle_type = '' OR qi.vehicle_type IS NULL OR qi.vehicle_type ILIKE $${params.length})`;
    }
    if (fromAddress) {
      params.push(`%${fromAddress}%`);
      q += ` AND (qi.route_from = '' OR qi.route_from IS NULL OR qi.route_from ILIKE $${params.length})`;
    }
    if (toAddress) {
      params.push(`%${toAddress}%`);
      q += ` AND (qi.route_to = '' OR qi.route_to IS NULL OR qi.route_to ILIKE $${params.length})`;
    }
    q += ` ORDER BY cq.valid_to DESC NULLS LAST, qi.sort_order LIMIT 20`;
    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/contract-quotes/:id ─────────────────────────────────────────────

router.get("/contract-quotes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const qr = await pool.query(
      `SELECT q.*, c.name AS customer_name_resolved FROM customer_contract_quotes q
       LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1`, [id]
    );
    if (!qr.rows.length) return res.status(404).json({ error: "Not found" });
    const items = await pool.query(
      `SELECT * FROM customer_contract_quote_items WHERE quote_id = $1 ORDER BY sort_order, id`, [id]
    );
    return res.json({ ...qr.rows[0], items: items.rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/contract-quotes ────────────────────────────────────────────────

router.post("/contract-quotes", async (req, res) => {
  try {
    const data = CreateQuoteSchema.parse(req.body);
    const quoteNo = await nextQuoteNo();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `INSERT INTO customer_contract_quotes
           (quote_no, customer_id, customer_name, title, status, quote_date, valid_from, valid_to,
            contact_person, contact_phone, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [quoteNo, data.customerId || null, data.customerName || null, data.title,
         data.status, data.quoteDate || null, data.validFrom || null, data.validTo || null,
         data.contactPerson || null, data.contactPhone || null, data.notes || null,
         data.createdBy || null, data.updatedBy || null]
      );
      const quote = r.rows[0];
      for (const item of data.items) {
        await client.query(
          `INSERT INTO customer_contract_quote_items
             (quote_id, route_from, route_to, vehicle_type, cargo_type, unit, unit_price, min_charge, notes, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [quote.id, item.routeFrom, item.routeTo, item.vehicleType, item.cargoType,
           item.unit, item.unitPrice, item.minCharge, item.notes, item.sortOrder]
        );
      }
      await client.query("COMMIT");
      return res.status(201).json(quote);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/contract-quotes/:id ────────────────────────────────────────────

router.put("/contract-quotes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = CreateQuoteSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `UPDATE customer_contract_quotes SET
           customer_id=$1, customer_name=$2, title=$3, status=$4, quote_date=$5,
           valid_from=$6, valid_to=$7, contact_person=$8, contact_phone=$9,
           notes=$10, updated_by=$11, updated_at=NOW()
         WHERE id=$12 RETURNING *`,
        [data.customerId || null, data.customerName || null, data.title, data.status,
         data.quoteDate || null, data.validFrom || null, data.validTo || null,
         data.contactPerson || null, data.contactPhone || null,
         data.notes || null, data.updatedBy || null, id]
      );
      if (!r.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Not found" }); }
      // Replace all items
      await client.query(`DELETE FROM customer_contract_quote_items WHERE quote_id = $1`, [id]);
      for (const item of data.items) {
        await client.query(
          `INSERT INTO customer_contract_quote_items
             (quote_id, route_from, route_to, vehicle_type, cargo_type, unit, unit_price, min_charge, notes, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, item.routeFrom, item.routeTo, item.vehicleType, item.cargoType,
           item.unit, item.unitPrice, item.minCharge, item.notes, item.sortOrder]
        );
      }
      await client.query("COMMIT");
      return res.json(r.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PATCH /api/contract-quotes/:id/status ────────────────────────────────────

router.patch("/contract-quotes/:id/status", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, confirmedBy } = z.object({
      status: z.enum(["draft","confirmed","expired","cancelled"]),
      confirmedBy: z.string().optional(),
    }).parse(req.body);
    const isConfirming = status === "confirmed";
    const r = await pool.query(
      `UPDATE customer_contract_quotes SET status=$1, updated_at=NOW()
        ${isConfirming ? ", confirmed_by=COALESCE($3,confirmed_by), confirmed_at=NOW()" : ""}
       WHERE id=$2 RETURNING *`,
      isConfirming ? [status, id, confirmedBy || null] : [status, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── DELETE /api/contract-quotes/:id ─────────────────────────────────────────

router.delete("/contract-quotes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM customer_contract_quote_items WHERE quote_id = $1`, [id]);
    await pool.query(`DELETE FROM customer_contract_quotes WHERE id = $1`, [id]);
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/contract-quotes/:id/clone ─────────────────────────────────────

router.post("/contract-quotes/:id/clone", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const orig = await pool.query(`SELECT * FROM customer_contract_quotes WHERE id = $1`, [id]);
    if (!orig.rows.length) return res.status(404).json({ error: "Not found" });
    const items = await pool.query(`SELECT * FROM customer_contract_quote_items WHERE quote_id = $1 ORDER BY sort_order`, [id]);
    const newNo = await nextQuoteNo();
    const o = orig.rows[0] as any;
    const r = await pool.query(
      `INSERT INTO customer_contract_quotes
         (quote_no, customer_id, customer_name, title, status, valid_from, valid_to, contact_person, contact_phone, notes)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9) RETURNING *`,
      [newNo, o.customer_id, o.customer_name, `${o.title}（複本）`,
       o.valid_from, o.valid_to, o.contact_person, o.contact_phone, o.notes]
    );
    const newId = r.rows[0].id;
    for (const item of items.rows as any[]) {
      await pool.query(
        `INSERT INTO customer_contract_quote_items
           (quote_id, route_from, route_to, vehicle_type, cargo_type, unit, unit_price, min_charge, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [newId, item.route_from, item.route_to, item.vehicle_type, item.cargo_type,
         item.unit, item.unit_price, item.min_charge, item.notes, item.sort_order]
      );
    }
    return res.status(201).json(r.rows[0]);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/contract-quotes/bulk-import ───────────────────────────────────
// Accept array of rows from Excel import and create quotes grouped by quoteTitle

router.post("/contract-quotes/bulk-import", async (req, res) => {
  const { rows } = req.body as { rows: any[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: "rows required" });

  // Group rows by quote identity (quoteNo if provided, else customerName+title combination)
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = row.quoteNo || `${row.customerName || ""}__${row.title || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let inserted = 0;
  const errors: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [, groupRows] of groups) {
      const first = groupRows[0];
      const customerName = (first.customerName || "").trim();
      const title = (first.title || "").trim() || customerName || "匯入報價單";
      if (!customerName) { errors.push(`略過無客戶名稱列`); continue; }

      // Resolve customer_id by name or short_name
      let customerId: number | null = null;
      const cr = await client.query(
        `SELECT id FROM customers WHERE name ILIKE $1 OR short_name ILIKE $1 LIMIT 1`,
        [customerName]
      );
      if (cr.rows.length) customerId = cr.rows[0].id;

      const quoteNo = await nextQuoteNo();
      const validFrom = first.validFrom || null;
      const validTo = first.validTo || null;
      try {
        const qr = await client.query(
          `INSERT INTO customer_contract_quotes
             (quote_no, customer_id, customer_name, title, status, valid_from, valid_to, notes, created_by)
           VALUES ($1,$2,$3,$4,'confirmed',$5,$6,$7,$8) RETURNING id`,
          [quoteNo, customerId, customerName, title, validFrom, validTo,
           first.notes || null, "Excel匯入"]
        );
        const quoteId = qr.rows[0].id;
        let sortOrder = 1;
        for (const row of groupRows) {
          await client.query(
            `INSERT INTO customer_contract_quote_items
               (quote_id, route_from, route_to, vehicle_type, cargo_type, unit, unit_price, min_charge, notes, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [quoteId,
             row.routeFrom || null, row.routeTo || null,
             row.vehicleType || null, row.cargoType || null,
             row.unit || "趟", parseFloat(row.unitPrice) || 0,
             parseFloat(row.minCharge) || 0, row.itemNotes || null, sortOrder++]
          );
        }
        inserted++;
      } catch (e: any) {
        errors.push(`${customerName}: ${e.message}`);
      }
    }
    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
  return res.json({ inserted, errors });
});

// ─── GET /api/suppliers ───────────────────────────────────────────────────────

router.get("/suppliers", async (req, res) => {
  try {
    const { search, status } = req.query as Record<string,string>;
    let q = `SELECT * FROM suppliers WHERE 1=1`;
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (name ILIKE $${params.length} OR short_name ILIKE $${params.length} OR tax_id ILIKE $${params.length} OR contact_person ILIKE $${params.length})`;
    }
    if (status && status !== "all") {
      params.push(status);
      q += ` AND status = $${params.length}`;
    }
    q += ` ORDER BY name`;
    const r = await pool.query(q, params);
    return res.json(r.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get("/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(`SELECT * FROM suppliers WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

const SupplierSchema = z.object({
  name:          z.string().min(1),
  shortName:     z.string().optional().default(""),
  taxId:         z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contactPhone:  z.string().optional().default(""),
  contactEmail:  z.string().optional().default(""),
  address:       z.string().optional().default(""),
  vehicleTypes:  z.string().optional().default(""),
  serviceRegions:z.string().optional().default(""),
  paymentTerms:  z.string().optional().default(""),
  bankName:      z.string().optional().default(""),
  bankAccount:   z.string().optional().default(""),
  status:        z.enum(["active","inactive","suspended"]).default("active"),
  notes:         z.string().optional().default(""),
  category:      z.string().optional().default(""),
  commissionRate:z.coerce.number().min(0).max(100).default(0),
});

router.post("/suppliers", async (req, res) => {
  try {
    const d = SupplierSchema.parse(req.body);
    const r = await pool.query(
      `INSERT INTO suppliers (name, short_name, tax_id, contact_person, contact_phone, contact_email,
         address, vehicle_types, service_regions, payment_terms, bank_name, bank_account,
         status, notes, category, commission_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [d.name, d.shortName||null, d.taxId||null, d.contactPerson||null, d.contactPhone||null,
       d.contactEmail||null, d.address||null, d.vehicleTypes||null, d.serviceRegions||null,
       d.paymentTerms||null, d.bankName||null, d.bankAccount||null, d.status,
       d.notes||null, d.category||null, d.commissionRate]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.put("/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const d = SupplierSchema.parse(req.body);
    const r = await pool.query(
      `UPDATE suppliers SET name=$1, short_name=$2, tax_id=$3, contact_person=$4,
         contact_phone=$5, contact_email=$6, address=$7, vehicle_types=$8,
         service_regions=$9, payment_terms=$10, bank_name=$11, bank_account=$12,
         status=$13, notes=$14, category=$15, commission_rate=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [d.name, d.shortName||null, d.taxId||null, d.contactPerson||null, d.contactPhone||null,
       d.contactEmail||null, d.address||null, d.vehicleTypes||null, d.serviceRegions||null,
       d.paymentTerms||null, d.bankName||null, d.bankAccount||null, d.status,
       d.notes||null, d.category||null, d.commissionRate, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

router.post("/suppliers/bulk", async (req, res) => {
  const { rows } = req.body as { rows: any[] };
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: "rows required" });
  let inserted = 0;
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.name) { errors.push(`略過空名稱列`); continue; }
    try {
      await pool.query(
        `INSERT INTO suppliers (name,short_name,tax_id,contact_person,contact_phone,address,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.name, r.shortName||null, r.taxId||null, r.contactPerson||null,
         r.contactPhone||null, r.address||null, "active"]
      );
      inserted++;
    } catch (e: any) { errors.push(`${r.name}: ${e.message}`); }
  }
  res.json({ inserted, errors });
});

router.delete("/suppliers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM suppliers WHERE id = $1`, [id]);
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export { router as contractQuotesRouter };
