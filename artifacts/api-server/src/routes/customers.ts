import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/customers", async (req, res) => {
  try {
    const customers = await db
      .select()
      .from(customersTable)
      .orderBy(customersTable.createdAt);
    res.json(customers);
  } catch (err) {
    req.log.error({ err }, "Failed to list customers");
    res.status(500).json({ error: "Failed to list customers" });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.name || !b.phone) {
      return res.status(400).json({ error: "名稱與電話為必填" });
    }
    const { rows } = await pool.query(
      `INSERT INTO customers (
        name, short_name, phone, username, password,
        contact_person, tax_id,
        address, postal_code, email,
        company_type, industry,
        payment_type, credit_limit, price_level, discount_pct,
        is_vip, monthly_statement_day, notes,
        invoice_title, company_address, factory_address
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,
        $8,$9,$10,
        $11,$12,
        $13,$14,$15,$16,
        $17,$18,$19,
        $20,$21,$22
      ) RETURNING *`,
      [
        String(b.name).trim(),
        b.shortName ? String(b.shortName).trim() : null,
        String(b.phone).trim(),
        b.username ?? null,
        b.password ?? null,
        b.contactPerson ?? null,
        b.taxId ?? null,
        b.address ?? null,
        b.postalCode ?? null,
        b.email ?? null,
        b.companyType ?? "company",
        b.industry ?? null,
        b.paymentType ?? "cash",
        parseFloat(b.creditLimit) || 0,
        b.priceLevel ?? "standard",
        parseFloat(b.discountPct) || 0,
        b.isVip ?? false,
        parseInt(b.monthlyStatementDay) || 5,
        b.notes ?? null,
        b.invoiceTitle ?? null,
        b.companyAddress ?? null,
        b.factoryAddress ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to create customer");
    res.status(400).json({ error: "Failed to create customer" });
  }
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const { id } = UpdateCustomerParams.parse(req.params);
    const b = req.body as Record<string, any>;

    const { rows: existing } = await pool.query("SELECT id FROM customers WHERE id = $1", [id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const addField = (col: string, val: any) => { setClauses.push(`${col} = $${idx++}`); values.push(val); };

    if (b.name !== undefined) addField("name", b.name);
    if (b.shortName !== undefined) addField("short_name", b.shortName || null);
    if (b.phone !== undefined) addField("phone", b.phone);
    if (b.email !== undefined) addField("email", b.email || null);
    if (b.username !== undefined) addField("username", b.username || null);
    if (b.password !== undefined) addField("password", b.password || null);
    if (b.address !== undefined) addField("address", b.address || null);
    if (b.postalCode !== undefined) addField("postal_code", b.postalCode || null);
    if (b.contactPerson !== undefined) addField("contact_person", b.contactPerson || null);
    if (b.taxId !== undefined) addField("tax_id", b.taxId || null);
    if (b.industry !== undefined) addField("industry", b.industry || null);
    if (b.paymentType !== undefined) addField("payment_type", b.paymentType || null);
    if (b.monthlyStatementDay !== undefined) addField("monthly_statement_day", parseInt(b.monthlyStatementDay) || 5);
    if (b.companyType !== undefined) addField("company_type", b.companyType || null);
    if (b.isActive !== undefined) addField("is_active", Boolean(b.isActive));

    if (setClauses.length === 0) {
      const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
      return res.json(rows[0]);
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE customers SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to update customer");
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.post("/customers/login", async (req, res) => {
  try {
    const { phone, password } = req.body as { phone: string; password: string };
    if (!phone || !password) {
      return res.status(400).json({ error: "請提供電話與密碼" });
    }
    const results = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, phone));
    const customer = results[0];
    if (!customer || customer.password !== password) {
      return res.status(401).json({ error: "電話或密碼不正確" });
    }
    res.json({ id: customer.id, name: customer.name, phone: customer.phone, username: customer.username });
  } catch (err) {
    req.log.error({ err }, "Failed customer login");
    res.status(500).json({ error: "登入失敗" });
  }
});

router.post("/customers/bulk", async (req, res) => {
  try {
    const { rows } = req.body as { rows: { name: string; phone: string; address?: string; contactPerson?: string; taxId?: string; username?: string; password?: string }[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }
    const values = rows.map(r => ({
      name: String(r.name ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
      address: r.address ? String(r.address).trim() : null,
      contactPerson: r.contactPerson ? String(r.contactPerson).trim() : null,
      taxId: r.taxId ? String(r.taxId).trim() : null,
      username: r.username ? String(r.username).trim() : null,
      password: r.password ? String(r.password).trim() : null,
    })).filter(r => r.name && r.phone);

    if (values.length === 0) {
      return res.status(400).json({ error: "No valid rows (name and phone required)" });
    }
    const inserted = await db.insert(customersTable).values(values).returning();
    return res.status(201).json({ inserted: inserted.length, rows: inserted });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk import customers");
    return res.status(500).json({ error: "Failed to bulk import customers" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const { id } = DeleteCustomerParams.parse(req.params);
    const existing = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete customer");
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
