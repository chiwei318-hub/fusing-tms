import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { autoIssueInvoice } from "../lib/autoInvoice.js";
import { sendTestEmail, invalidateSmtpCache } from "../lib/email.js";

export const invoicesRouter = Router();

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900000) + 100000);
  return `FY${y}${m}-${seq}`;
}

// GET /api/invoices - list all invoices
invoicesRouter.get("/invoices", async (req, res) => {
  const { customerId, enterpriseId, orderId, status, limit = "100" } = req.query as Record<string, string>;
  const rows = await db.execute(sql`
    SELECT i.*, 
           o.pickup_address, o.delivery_address,
           o.cargo_description
    FROM invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE 1=1
      ${customerId ? sql`AND i.customer_id = ${Number(customerId)}` : sql``}
      ${enterpriseId ? sql`AND i.enterprise_id = ${Number(enterpriseId)}` : sql``}
      ${orderId ? sql`AND i.order_id = ${Number(orderId)}` : sql``}
      ${status ? sql`AND i.status = ${status}` : sql``}
    ORDER BY i.created_at DESC
    LIMIT ${Number(limit)}
  `);
  res.json(rows.rows);
});

// GET /api/invoices/:id - get single invoice
invoicesRouter.get("/invoices/:id", async (req, res) => {
  const rows = await db.execute(sql`
    SELECT i.*, o.pickup_address, o.delivery_address, o.cargo_description,
           o.customer_name, o.customer_phone
    FROM invoices i
    LEFT JOIN orders o ON o.id = i.order_id
    WHERE i.id = ${Number(req.params.id)}
  `);
  if (!rows.rows.length) return res.status(404).json({ error: "發票不存在" });
  res.json(rows.rows[0]);
});

// POST /api/invoices - create invoice
invoicesRouter.post("/invoices", async (req, res) => {
  const {
    orderId, enterpriseId, customerId, invoiceType = "receipt",
    buyerName, buyerTaxId, amount, taxRate = 5, items, notes,
  } = req.body;

  if (!buyerName || !amount) {
    return res.status(400).json({ error: "缺少必要欄位：buyerName, amount" });
  }

  const taxAmount = Math.round(Number(amount) * (Number(taxRate) / 100));
  const totalAmount = Number(amount) + taxAmount;
  const invoiceNumber = generateInvoiceNumber();

  const result = await db.execute(sql`
    INSERT INTO invoices (
      invoice_number, order_id, enterprise_id, customer_id, invoice_type,
      buyer_name, buyer_tax_id, amount, tax_amount, total_amount, items, notes
    ) VALUES (
      ${invoiceNumber}, ${orderId ?? null}, ${enterpriseId ?? null}, ${customerId ?? null},
      ${invoiceType}, ${buyerName}, ${buyerTaxId ?? null},
      ${Number(amount)}, ${taxAmount}, ${totalAmount},
      ${items ? JSON.stringify(items) : null}, ${notes ?? null}
    ) RETURNING *
  `);

  res.status(201).json({ ok: true, invoice: result.rows[0] });
});

// POST /api/invoices/bulk-monthly - generate monthly invoices for enterprise accounts
invoicesRouter.post("/invoices/bulk-monthly", async (req, res) => {
  const { month, year } = req.body;
  const targetMonth = month ? Number(month) : new Date().getMonth() + 1;
  const targetYear = year ? Number(year) : new Date().getFullYear();

  // Get all enterprise accounts with unpaid orders this month
  const rows = await db.execute(sql`
    SELECT 
      ea.id AS enterprise_id, ea.company_name, ea.tax_id,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(o.total_fee), 0) AS total_amount,
      array_agg(o.id ORDER BY o.created_at) AS order_ids
    FROM enterprise_accounts ea
    JOIN orders o ON o.enterprise_id = ea.id
    WHERE EXTRACT(YEAR FROM o.created_at) = ${targetYear}
      AND EXTRACT(MONTH FROM o.created_at) = ${targetMonth}
      AND o.status = 'delivered'
      AND (o.fee_status = 'unpaid' OR o.fee_status = 'invoiced')
      AND ea.billing_type = 'monthly'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i 
        WHERE i.enterprise_id = ea.id 
          AND EXTRACT(YEAR FROM i.issued_at) = ${targetYear}
          AND EXTRACT(MONTH FROM i.issued_at) = ${targetMonth}
      )
    GROUP BY ea.id, ea.company_name, ea.tax_id
    HAVING COUNT(o.id) > 0
  `);

  const created = [];
  for (const row of rows.rows as any[]) {
    const invoiceNumber = generateInvoiceNumber();
    const amount = Number(row.total_amount);
    const taxAmount = Math.round(amount * 0.05);
    await db.execute(sql`
      INSERT INTO invoices (
        invoice_number, enterprise_id, invoice_type, buyer_name, buyer_tax_id,
        amount, tax_amount, total_amount, notes
      ) VALUES (
        ${invoiceNumber}, ${row.enterprise_id}, 'monthly',
        ${row.company_name}, ${row.tax_id ?? null},
        ${amount}, ${taxAmount}, ${amount + taxAmount},
        ${`${targetYear}年${targetMonth}月月結帳單，共 ${row.order_count} 筆訂單`}
      )
    `);
    created.push({ enterpriseId: row.enterprise_id, companyName: row.company_name, invoiceNumber, total: amount + taxAmount });
  }

  res.json({ ok: true, created: created.length, invoices: created });
});

// PATCH /api/invoices/:id/void - void an invoice
invoicesRouter.patch("/invoices/:id/void", async (req, res) => {
  await db.execute(sql`
    UPDATE invoices SET status = 'voided', voided_at = NOW() WHERE id = ${Number(req.params.id)}
  `);
  res.json({ ok: true });
});

// POST /api/invoices/order/:orderId/auto - manually trigger auto-invoice for an order
invoicesRouter.post("/invoices/order/:orderId/auto", async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const result = await autoIssueInvoice(orderId, "admin_manual");
    if (!result) return res.status(422).json({ error: "無法開立發票（訂單不存在或金額為0）" });
    res.json({ ok: true, invoice: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/stats/monthly - monthly invoice stats
invoicesRouter.get("/invoices/stats/monthly", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT 
      TO_CHAR(issued_at, 'YYYY-MM') AS month,
      COUNT(*) AS invoice_count,
      SUM(total_amount) AS total_revenue,
      COUNT(*) FILTER (WHERE status = 'issued') AS active_count,
      COUNT(*) FILTER (WHERE status = 'voided') AS voided_count
    FROM invoices
    WHERE issued_at >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(issued_at, 'YYYY-MM')
    ORDER BY month DESC
  `);
  res.json(rows.rows);
});

// POST /api/invoices/smtp-test — 傳送測試信件驗證 SMTP 設定
invoicesRouter.post("/invoices/smtp-test", async (req, res) => {
  const { to } = req.body ?? {};
  if (!to) return res.status(400).json({ error: "缺少 to Email" });
  invalidateSmtpCache();
  const result = await sendTestEmail(to);
  return res.json(result);
});

// PUT /api/invoices/smtp-config — 儲存 SMTP 設定並清除快取
invoicesRouter.put("/invoices/smtp-config", async (req, res) => {
  try {
    const fields = req.body as Record<string, string>;
    const smtpKeys = ["smtp_host","smtp_port","smtp_secure","smtp_user","smtp_pass","smtp_from","smtp_from_name"];
    for (const key of smtpKeys) {
      if (fields[key] !== undefined) {
        await db.execute(sql`
          INSERT INTO pricing_config (key, value, label, updated_at)
          VALUES (${key}, ${fields[key]}, ${key}, NOW())
          ON CONFLICT (key) DO UPDATE SET value = ${fields[key]}, updated_at = NOW()
        `);
      }
    }
    invalidateSmtpCache();
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "儲存失敗" });
  }
});
