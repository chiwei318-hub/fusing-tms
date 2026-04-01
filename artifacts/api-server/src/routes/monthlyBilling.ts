/**
 * monthlyBilling.ts — 月結帳單管理
 *
 * 流程：
 *   1. POST /monthly-bills/generate → 掃描當月完成的月結訂單，產出帳單
 *   2. PATCH /monthly-bills/:id/confirm → 客戶確認帳單
 *   3. POST /monthly-bills/:id/invoice → 批次開立電子發票
 *   4. POST /ar-ledger/payment → 收款（由 arLedger 路由處理）
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendInvoiceEmail } from "../lib/email";
import { sendInvoiceNotification } from "../lib/line";

export const monthlyBillingRouter = Router();

function generateInvoiceNumber(): string {
  const now = new Date();
  return `FY${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${
    String(Math.floor(Math.random() * 900000) + 100000)
  }`;
}

// ── 列出月結帳單 ──────────────────────────────────────────────────────────
monthlyBillingRouter.get("/monthly-bills", async (req, res) => {
  const status = req.query.status as string | undefined;
  const statusClause = status ? sql`AND mb.status = ${status}` : sql``;

  const rows = await db.execute(sql`
    SELECT
      mb.*,
      ea.company_name AS enterprise_name, ea.email AS enterprise_email,
      c.name AS customer_name_db, c.email AS customer_email_db,
      i.invoice_number
    FROM monthly_bills mb
    LEFT JOIN enterprise_accounts ea ON ea.id = mb.enterprise_id
    LEFT JOIN customers c            ON c.id  = mb.customer_id
    LEFT JOIN invoices  i            ON i.id  = mb.invoice_id
    WHERE 1=1 ${statusClause}
    ORDER BY mb.period_year DESC, mb.period_month DESC, mb.created_at DESC
  `);
  res.json(rows.rows);
});

// ── 帳單明細（含訂單列表）─────────────────────────────────────────────────
monthlyBillingRouter.get("/monthly-bills/:id", async (req, res) => {
  const id = Number(req.params.id);

  const bill = await db.execute(sql`
    SELECT mb.*, ea.company_name AS enterprise_name, ea.email AS enterprise_email,
           c.name AS customer_name_db,
           i.invoice_number
    FROM monthly_bills mb
    LEFT JOIN enterprise_accounts ea ON ea.id = mb.enterprise_id
    LEFT JOIN customers c            ON c.id  = mb.customer_id
    LEFT JOIN invoices  i            ON i.id  = mb.invoice_id
    WHERE mb.id = ${id} LIMIT 1
  `);
  if (!bill.rows.length) return res.status(404).json({ error: "找不到帳單" });

  const orders = await db.execute(sql`
    SELECT id, order_no, customer_name, pickup_address, delivery_address,
           total_fee, status, fee_status, completed_at, cargo_description
    FROM orders
    WHERE monthly_bill_id = ${id}
    ORDER BY completed_at ASC
  `);

  res.json({ bill: bill.rows[0], orders: orders.rows });
});

// ── 產出月結帳單 ─────────────────────────────────────────────────────────
monthlyBillingRouter.post("/monthly-bills/generate", async (req, res) => {
  const {
    year  = new Date().getFullYear(),
    month = new Date().getMonth() + 1,
    enterprise_id,
    customer_id,
  } = req.body ?? {};

  if (!enterprise_id && !customer_id) {
    return res.status(400).json({ error: "需指定 enterprise_id 或 customer_id" });
  }

  // 找當月已完成且 fee_status=monthly_pending 的訂單
  const entityFilter = enterprise_id
    ? sql`AND o.enterprise_id = ${enterprise_id}`
    : sql`AND c.id = ${customer_id}`;

  const orders = await db.execute(sql`
    SELECT o.id, o.order_no, o.total_fee, o.base_price, o.customer_name,
           o.cargo_description, o.completed_at
    FROM orders o
    LEFT JOIN customers c ON c.phone = o.customer_phone
    WHERE o.fee_status = 'monthly_pending'
      AND o.status = 'delivered'
      AND EXTRACT(YEAR  FROM COALESCE(o.completed_at, o.created_at)) = ${year}
      AND EXTRACT(MONTH FROM COALESCE(o.completed_at, o.created_at)) = ${month}
      ${entityFilter}
  `);

  if (!orders.rows.length) {
    return res.json({ ok: true, message: "本月無待開帳月結訂單", order_count: 0 });
  }

  const total = (orders.rows as any[]).reduce(
    (sum, o) => sum + Number(o.total_fee ?? o.base_price ?? 0), 0
  );
  const taxAmount = Math.round(total * 0.05);
  const totalWithTax = total + taxAmount;

  // Upsert monthly_bill
  const bill = await db.execute(sql`
    INSERT INTO monthly_bills
      (enterprise_id, customer_id, period_year, period_month, total_amount, order_count)
    VALUES
      (${enterprise_id ?? null}, ${customer_id ?? null},
       ${year}, ${month}, ${totalWithTax}, ${orders.rows.length})
    ON CONFLICT (enterprise_id, period_year, period_month)
      DO UPDATE SET
        total_amount = EXCLUDED.total_amount,
        order_count  = EXCLUDED.order_count,
        status       = CASE WHEN monthly_bills.status = 'draft' THEN 'draft'
                            ELSE monthly_bills.status END
    RETURNING *
  `).catch(() =>
    db.execute(sql`
      INSERT INTO monthly_bills
        (customer_id, period_year, period_month, total_amount, order_count)
      VALUES (${customer_id ?? null}, ${year}, ${month}, ${totalWithTax}, ${orders.rows.length})
      ON CONFLICT (customer_id, period_year, period_month) DO UPDATE SET
        total_amount = EXCLUDED.total_amount, order_count = EXCLUDED.order_count
      RETURNING *
    `)
  );

  const billId = Number((bill.rows[0] as any).id);

  // Link orders → monthly_bill
  await Promise.all((orders.rows as any[]).map(o =>
    db.execute(sql`UPDATE orders SET monthly_bill_id = ${billId} WHERE id = ${o.id}`)
  ));

  res.status(201).json({
    ok: true,
    bill: bill.rows[0],
    order_count:   orders.rows.length,
    total_amount:  total,
    tax_amount:    taxAmount,
    total_with_tax: totalWithTax,
  });
});

// ── 客戶確認帳單 ─────────────────────────────────────────────────────────
monthlyBillingRouter.patch("/monthly-bills/:id/confirm", async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`
    UPDATE monthly_bills
    SET status = 'confirmed', confirmed_at = NOW()
    WHERE id = ${id} AND status = 'draft'
  `);
  res.json({ ok: true });
});

// ── 批次開立電子發票 ──────────────────────────────────────────────────────
monthlyBillingRouter.post("/monthly-bills/:id/invoice", async (req, res) => {
  const billId = Number(req.params.id);

  // 取帳單 + 企業/客戶資訊
  const billRows = await db.execute(sql`
    SELECT mb.*,
           ea.company_name AS enterprise_name, ea.tax_id AS enterprise_tax_id,
           ea.email AS enterprise_email,
           c.name AS customer_name_db, c.invoice_title, c.tax_id AS customer_tax_id,
           c.email AS customer_email_db
    FROM monthly_bills mb
    LEFT JOIN enterprise_accounts ea ON ea.id = mb.enterprise_id
    LEFT JOIN customers c            ON c.id  = mb.customer_id
    WHERE mb.id = ${billId} LIMIT 1
  `);
  if (!billRows.rows.length) return res.status(404).json({ error: "找不到帳單" });

  const bill = billRows.rows[0] as any;
  if (bill.status !== "confirmed") {
    return res.status(400).json({ error: "帳單需先確認後才能開票（status=confirmed）" });
  }
  if (bill.invoice_id) {
    return res.json({ ok: true, message: "已開票", invoice_id: bill.invoice_id });
  }

  // 取該帳單所屬訂單明細
  const orders = await db.execute(sql`
    SELECT id, order_no, total_fee, base_price, cargo_description
    FROM orders WHERE monthly_bill_id = ${billId}
  `);
  const orderList = orders.rows as any[];

  const totalAmount  = Number(bill.total_amount);
  const taxAmount    = Math.round(totalAmount / 1.05 * 0.05);
  const amount       = totalAmount - taxAmount;
  const invoiceNumber = generateInvoiceNumber();
  const buyerName    = bill.enterprise_name ?? bill.customer_name_db ?? "客戶";
  const buyerTaxId   = bill.enterprise_tax_id ?? bill.customer_tax_id ?? null;

  const items = orderList.map(o => ({
    description: `${o.order_no ?? `#${o.id}`} ${o.cargo_description ?? "物流服務"}`,
    qty: 1,
    unitPrice: Number(o.total_fee ?? o.base_price ?? 0),
    total:     Number(o.total_fee ?? o.base_price ?? 0),
  }));

  // 開立發票
  const inv = await db.execute(sql`
    INSERT INTO invoices (
      invoice_number, enterprise_id, customer_id,
      invoice_type, buyer_name, buyer_tax_id,
      amount, tax_amount, total_amount,
      items, notes
    ) VALUES (
      ${invoiceNumber},
      ${bill.enterprise_id ?? null},
      ${bill.customer_id ?? null},
      ${"b2b"},
      ${buyerName}, ${buyerTaxId},
      ${amount}, ${taxAmount}, ${totalAmount},
      ${JSON.stringify(items)},
      ${`${bill.period_year}年${bill.period_month}月月結帳單（${orderList.length} 筆訂單）`}
    ) RETURNING id, invoice_number, total_amount
  `);
  const invoiceId = Number((inv.rows[0] as any).id);
  const invoiceNum = (inv.rows[0] as any).invoice_number;

  // 更新帳單
  await db.execute(sql`
    UPDATE monthly_bills
    SET status = 'invoiced', invoice_id = ${invoiceId}, invoiced_at = NOW()
    WHERE id = ${billId}
  `);

  // 更新訂單 fee_status
  await db.execute(sql`
    UPDATE orders SET fee_status = 'invoiced', invoice_id = ${invoiceId}
    WHERE monthly_bill_id = ${billId}
  `);

  // 更新 AR 分錄加上 ref_invoice_id
  await db.execute(sql`
    UPDATE ar_ledger SET ref_invoice_id = ${invoiceId}
    WHERE order_id = ANY(
      SELECT id FROM orders WHERE monthly_bill_id = ${billId}
    ) AND entry_type = 'receivable' AND ref_invoice_id IS NULL
  `);

  // 非同步寄信/LINE
  const toEmail = bill.enterprise_email ?? bill.customer_email_db ?? null;
  if (toEmail) {
    setImmediate(() => {
      sendInvoiceEmail({
        to: toEmail,
        invoiceNumber: invoiceNum,
        orderId: billId,
        buyerName,
        totalAmount,
        taxAmount,
        amount,
        invoiceType: "b2b",
        itemDesc: `${bill.period_year}年${bill.period_month}月月結（${orderList.length} 筆）`,
      }).catch(() => {});
    });
  }

  res.json({
    ok: true,
    invoice_id: invoiceId,
    invoice_number: invoiceNum,
    total_amount: totalAmount,
    order_count: orderList.length,
  });
});

// ── 標記帳單已收款 ────────────────────────────────────────────────────────
monthlyBillingRouter.patch("/monthly-bills/:id/pay", async (req, res) => {
  const id = Number(req.params.id);
  const { payment_method, note } = req.body ?? {};

  const billRow = await db.execute(sql`
    SELECT * FROM monthly_bills WHERE id = ${id} LIMIT 1
  `);
  if (!billRow.rows.length) return res.status(404).json({ error: "找不到帳單" });
  const bill = billRow.rows[0] as any;

  if (bill.status !== "invoiced") {
    return res.status(400).json({ error: "需先開票才能收款" });
  }

  // 收款分錄
  await db.execute(sql`
    INSERT INTO ar_ledger
      (enterprise_id, customer_id, entry_type, amount, note, ref_invoice_id, reconciled, reconciled_at)
    VALUES
      (${bill.enterprise_id ?? null}, ${bill.customer_id ?? null},
       'payment', ${-Math.abs(Number(bill.total_amount))},
       ${note ?? `月結收款 ${bill.period_year}年${bill.period_month}月（${payment_method ?? ""}）`},
       ${bill.invoice_id ?? null}, TRUE, NOW())
  `);

  // 對帳所有應收分錄
  const entityFilter = bill.enterprise_id
    ? sql`enterprise_id = ${bill.enterprise_id}`
    : sql`customer_id = ${bill.customer_id}`;

  await db.execute(sql`
    UPDATE ar_ledger
    SET reconciled = TRUE, reconciled_at = NOW()
    WHERE ${entityFilter}
      AND order_id IN (SELECT id FROM orders WHERE monthly_bill_id = ${id})
      AND entry_type = 'receivable'
  `);

  // 更新帳單 + 訂單
  await db.execute(sql`UPDATE monthly_bills SET status = 'paid', paid_at = NOW() WHERE id = ${id}`);
  await db.execute(sql`UPDATE orders SET fee_status = 'paid' WHERE monthly_bill_id = ${id}`);

  res.json({ ok: true });
});
