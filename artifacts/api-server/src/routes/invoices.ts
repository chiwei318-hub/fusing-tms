import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { autoIssueInvoice } from "../lib/autoInvoice.js";
import { sendTestEmail, invalidateSmtpCache, sendInvoiceEmail } from "../lib/email.js";
import { sendInvoiceNotification, getOrderNotifyReceivers } from "../lib/line.js";
import { voidInvoice, allowanceInvoice, queryInvoice } from "../lib/invoiceProvider.js";
import { buildInvoicePdf } from "../lib/invoicePdf.js";

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

// PATCH /api/invoices/:id/void - void an invoice (calls ECPay API in ecpay mode)
invoicesRouter.patch("/invoices/:id/void", async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body ?? {};

  const invRows = await db.execute(sql`
    SELECT id, invoice_number, invoice_date, status, random_number
    FROM invoices WHERE id = ${id}
  `);
  const inv = (invRows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (inv.status === "voided") return res.status(409).json({ error: "已作廢" });

  // 轉換日期為綠界格式：YYYY-MM-DD HH:mm:ss
  const voidDateObj = inv.invoice_date ? new Date(inv.invoice_date) : new Date();
  const voidDateStr = voidDateObj.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).replace(/\//g, "-");

  // Call ECPay API (or mock)
  const voidResult = await voidInvoice({
    invoiceNo:   inv.invoice_number,
    invoiceDate: voidDateStr,
    reason:      (reason ?? "作廢").slice(0, 20),
  }).catch((err: Error) => ({ ok: false, raw: err.message }));

  if (!voidResult.ok) {
    console.warn(`[invoices] voidInvoice provider error:`, voidResult.raw);
    // In ECPay mode we reject; in mock we proceed
    if (process.env.INVOICE_PROVIDER === "ecpay") {
      return res.status(502).json({ error: "綠界作廢失敗", detail: voidResult.raw });
    }
  }

  await db.execute(sql`
    UPDATE invoices SET status = 'voided', voided_at = NOW() WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// POST /api/invoices/:id/allowance — 開立折讓（Credit Note）
invoicesRouter.post("/invoices/:id/allowance", async (req, res) => {
  const id = Number(req.params.id);
  const { allowanceAmt, buyerEmail, buyerIdentifier, customerName, reason } = req.body ?? {};

  if (!allowanceAmt || isNaN(Number(allowanceAmt))) {
    return res.status(400).json({ error: "缺少 allowanceAmt" });
  }

  const invRows = await db.execute(sql`
    SELECT inv.id, inv.invoice_number, inv.invoice_date, inv.status, inv.buyer_name, inv.buyer_tax_id,
           c.email AS buyer_email
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    WHERE inv.id = ${id}
  `);
  const inv = (invRows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  if (inv.status === "voided") return res.status(409).json({ error: "已作廢，不可折讓" });

  // 轉換日期為 YYYY-MM-DD HH:mm:ss（綠界格式）
  const rawDate = inv.invoice_date ? new Date(inv.invoice_date) : new Date();
  const invoiceDateStr = rawDate.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).replace(/\//g, "-");

  const amt = Number(allowanceAmt);
  const notifyEmail = buyerEmail ?? inv.buyer_email;

  const result = await allowanceInvoice({
    invoiceNo:        inv.invoice_number,
    invoiceDate:      invoiceDateStr,
    allNotify:        notifyEmail ? "E" : "N",
    customerName:     customerName ?? inv.buyer_name ?? "",
    notifyEmail:      notifyEmail,
    allowanceAmount:  amt,
    buyerIdentifier:  buyerIdentifier ?? inv.buyer_tax_id,
    items: [{
      name:    reason ?? "折讓",
      qty:     1,
      unit:    "式",
      price:   amt,
      amount:  amt,
      taxType: "1",
    }],
  });

  if (!result.ok && process.env.INVOICE_PROVIDER === "ecpay") {
    return res.status(502).json({ error: "綠界折讓失敗", detail: result.raw });
  }

  // Record credit note in ar_ledger
  await db.execute(sql`
    INSERT INTO ar_ledger (invoice_id, amount, entry_type, notes, created_at)
    VALUES (${id}, ${-amt}, 'credit_note',
            ${"折讓: " + (reason ?? "") + " 折讓單號: " + (result.allowanceNo ?? "mock")},
            NOW())
  `).catch(console.error);

  // Update invoice notes
  await db.execute(sql`
    UPDATE invoices
    SET notes = COALESCE(notes, '') || ' [折讓 ' || ${result.allowanceNo ?? "mock"} || ' -' || ${amt} || ']'
    WHERE id = ${id}
  `);

  res.json({ ok: true, allowanceNo: result.allowanceNo, allowanceDate: result.allowanceDate });
});

// GET /api/invoices/:id/query-ecpay — 向綠界查詢最新發票狀態（ECPay GetIssue）
invoicesRouter.get("/invoices/:id/query-ecpay", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.execute(sql`
    SELECT id, invoice_number, buyer_tax_id FROM invoices WHERE id = ${id}
  `);
  const inv = (rows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const relateNum = inv.invoice_number;
  const result = await queryInvoice({
    relateNumber: relateNum,
    isB2B:        !!inv.buyer_tax_id,
  });

  res.json(result);
});

// GET /api/invoices/:id/pdf — 下載電子發票 PDF
invoicesRouter.get("/invoices/:id/pdf", async (req, res) => {
  const id = Number(req.params.id);

  const rows = await db.execute(sql`
    SELECT inv.*, o.cargo_description, o.order_no, o.payment_method,
           c.name AS customer_name,
           ea.company_name AS enterprise_name, ea.tax_id AS enterprise_tax_id
    FROM invoices inv
    LEFT JOIN orders o        ON o.id = inv.order_id
    LEFT JOIN customers c     ON c.id = inv.customer_id
    LEFT JOIN enterprise_accounts ea ON ea.id = inv.enterprise_id
    WHERE inv.id = ${id}
  `);
  const inv = (rows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const buyerName   = inv.enterprise_name ?? inv.customer_name ?? inv.buyer_name ?? "買受人";
  const buyerTaxId  = inv.enterprise_tax_id ?? inv.buyer_tax_id;

  const pdf = await buildInvoicePdf({
    invoiceNumber:  inv.invoice_number,
    randomNumber:   inv.random_number,
    invoiceDate:    inv.invoice_date ?? inv.issued_at,
    provider:       inv.provider ?? "mock",
    buyerName,
    buyerTaxId,
    amount:         Number(inv.amount ?? 0),
    taxAmount:      Number(inv.tax_amount ?? 0),
    totalAmount:    Number(inv.total_amount ?? inv.amount ?? 0),
    invoiceType:    buyerTaxId ? "b2b" : "b2c",
    notes:          inv.notes,
    qrCodeLeft:     inv.qr_code_left,
    qrCodeRight:    inv.qr_code_right,
    items: inv.cargo_description
      ? [{ description: inv.cargo_description, qty: 1, unitPrice: Number(inv.amount ?? 0), total: Number(inv.amount ?? 0) }]
      : undefined,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${inv.invoice_number}.pdf"`);
  res.send(pdf);
});

// POST /api/invoices/:id/send-email — 寄發電子發票（含 PDF 附件）
invoicesRouter.post("/invoices/:id/send-email", async (req, res) => {
  const id = Number(req.params.id);
  const { toEmail } = req.body ?? {};

  const rows = await db.execute(sql`
    SELECT inv.*, o.cargo_description, o.order_no,
           c.name AS customer_name, c.email AS customer_email,
           ea.company_name AS enterprise_name, ea.tax_id AS enterprise_tax_id, ea.email AS enterprise_email
    FROM invoices inv
    LEFT JOIN orders o        ON o.id = inv.order_id
    LEFT JOIN customers c     ON c.id = inv.customer_id
    LEFT JOIN enterprise_accounts ea ON ea.id = inv.enterprise_id
    WHERE inv.id = ${id}
  `);
  const inv = (rows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const recipientEmail = toEmail ?? inv.enterprise_email ?? inv.customer_email;
  if (!recipientEmail) return res.status(422).json({ error: "找不到收件 Email，請手動指定 toEmail" });

  const buyerName = inv.enterprise_name ?? inv.customer_name ?? "客戶";

  const pdf = await buildInvoicePdf({
    invoiceNumber:  inv.invoice_number,
    randomNumber:   inv.random_number,
    invoiceDate:    inv.invoice_date ?? inv.issued_at,
    provider:       inv.provider ?? "mock",
    buyerName,
    buyerTaxId:     inv.enterprise_tax_id ?? inv.buyer_tax_id,
    amount:         Number(inv.amount ?? 0),
    taxAmount:      Number(inv.tax_amount ?? 0),
    totalAmount:    Number(inv.total_amount ?? inv.amount ?? 0),
    invoiceType:    (inv.enterprise_tax_id ?? inv.buyer_tax_id) ? "b2b" : "b2c",
    notes:          inv.notes,
  });

  const sent = await sendInvoiceEmail({
    to:            recipientEmail,
    invoiceNumber: inv.invoice_number,
    buyerName,
    amount:        Number(inv.amount ?? 0),
    taxAmount:     Number(inv.tax_amount ?? 0),
    totalAmount:   Number(inv.total_amount ?? inv.amount ?? 0),
    orderId:       inv.order_id,
    orderNo:       inv.order_no,
    issuedAt:      inv.issued_at,
    pdfAttachment: { filename: `invoice-${inv.invoice_number}.pdf`, content: pdf },
  });

  res.json({ ok: sent, to: recipientEmail });
});

// POST /api/invoices/:id/send-line — LINE 推播電子發票通知
invoicesRouter.post("/invoices/:id/send-line", async (req, res) => {
  const id = Number(req.params.id);
  const { lineUserId } = req.body ?? {};

  const rows = await db.execute(sql`
    SELECT inv.*, o.order_no,
           c.name AS customer_name, c.line_user_id AS customer_line_id,
           ea.company_name AS enterprise_name
    FROM invoices inv
    LEFT JOIN orders o        ON o.id = inv.order_id
    LEFT JOIN customers c     ON c.id = inv.customer_id
    LEFT JOIN enterprise_accounts ea ON ea.id = inv.enterprise_id
    WHERE inv.id = ${id}
  `);
  const inv = (rows.rows as any[])[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const targetId = lineUserId ?? inv.customer_line_id;
  const buyerName = inv.enterprise_name ?? inv.customer_name ?? "客戶";

  if (!targetId) {
    // Broadcast to all notify receivers
    const receivers = await getOrderNotifyReceivers();
    if (!receivers.length) return res.status(422).json({ error: "沒有設定 LINE 通知對象，請至系統設定填入" });
    for (const uid of receivers) {
      await sendInvoiceNotification(uid, {
        invoiceNumber: inv.invoice_number,
        orderId:       inv.order_id,
        buyerName,
        totalAmount:   Number(inv.total_amount ?? inv.amount ?? 0),
        taxAmount:     Number(inv.tax_amount ?? 0),
      }).catch(console.error);
    }
    return res.json({ ok: true, sentTo: receivers.length });
  }

  await sendInvoiceNotification(targetId, {
    invoiceNumber: inv.invoice_number,
    orderId:       inv.order_id,
    buyerName,
    totalAmount:   Number(inv.total_amount ?? inv.amount ?? 0),
    taxAmount:     Number(inv.tax_amount ?? 0),
  });

  res.json({ ok: true, lineUserId: targetId });
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

// POST /api/invoices/issue — 財務儀表板快速開立發票（簡化版）
invoicesRouter.post("/invoices/issue", async (req, res) => {
  try {
    const {
      order_no, customer_name, customer_tax_id,
      amount,
    } = req.body as {
      order_no?: string; customer_name?: string; customer_tax_id?: string;
      amount?: number;
    };
    if (!amount || amount <= 0)
      return res.status(400).json({ error: "金額必須大於 0" });
    if (!customer_name)
      return res.status(400).json({ error: "客戶名稱必填" });

    const tax_amount   = Math.round(amount * 0.05);
    const total_amount = amount + tax_amount;
    const invoice_number = generateInvoiceNumber();

    // 查 order_id（若有帶 order_no）
    let order_id: number | null = null;
    if (order_no) {
      const hit = await db.execute(sql`SELECT id FROM orders WHERE order_no = ${order_no} LIMIT 1`);
      if (hit.rows.length) order_id = (hit.rows[0] as any).id;
    }

    const r = await db.execute(sql`
      INSERT INTO invoices
        (order_id, buyer_name, buyer_tax_id, amount, tax_amount, total_amount,
         invoice_number, invoice_date, status)
      VALUES
        (${order_id}, ${customer_name}, ${customer_tax_id ?? null},
         ${Math.round(amount)}, ${tax_amount}, ${total_amount},
         ${invoice_number}, TO_CHAR(CURRENT_DATE,'YYYY-MM-DD'), 'issued')
      RETURNING id, invoice_number, amount, tax_amount, total_amount, status
    `);
    return res.json(r.rows[0]);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "開立失敗" });
  }
});

// POST /api/invoices/:id/void-post — 前端 POST 作廢（PATCH alias）
invoicesRouter.post("/invoices/:id/void-post", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await db.execute(sql`
      UPDATE invoices
         SET status = 'voided', voided_at = NOW(), notes = COALESCE(notes, '手動作廢')
       WHERE id = ${id}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "找不到發票" });
    return res.json(r.rows[0]);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "作廢失敗" });
  }
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
