/**
 * autoInvoice.ts
 * 訂單完成後根據客戶類型分流：
 *   現結 → issueInvoice()（mock/ECPay） → 寫回 DB → AR receivable → LINE/Email 通知
 *   月結 → 掛入 AR receivable → fee_status = monthly_pending（等月底批次開票）
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendInvoiceNotification } from "./line";
import { sendInvoiceEmail } from "./email";
import { issueInvoice } from "./invoiceProvider";

export interface AutoInvoiceResult {
  invoiceId?:     number;
  invoiceNumber?: string;
  totalAmount:    number;
  flow:           "cash" | "monthly";
  arEntryId?:     number;
}

/** 寫入 AR 分類帳 */
async function writeArEntry(params: {
  enterpriseId: number | null;
  customerId:   number | null;
  orderId:      number;
  entryType:    string;
  amount:       number;
  note:         string;
  refInvoiceId?: number;
}): Promise<number> {
  const r = await db.execute(sql`
    INSERT INTO ar_ledger
      (enterprise_id, customer_id, order_id, entry_type, amount, note, ref_invoice_id)
    VALUES
      (${params.enterpriseId}, ${params.customerId}, ${params.orderId},
       ${params.entryType}, ${params.amount}, ${params.note},
       ${params.refInvoiceId ?? null})
    RETURNING id
  `);
  return Number((r.rows[0] as any).id);
}

/**
 * 根據訂單 ID 自動決定開票或掛帳（idempotent）
 */
export async function autoIssueInvoice(
  orderId: number,
  triggeredBy = "system"
): Promise<AutoInvoiceResult | null> {
  // ── 取訂單 + 企業帳號 + 散客資料 ──────────────────────────────────────
  const orderRows = await db.execute(sql`
    SELECT
      o.id, o.order_no, o.total_fee, o.base_price,
      o.customer_name, o.customer_phone, o.customer_email,
      o.pickup_address, o.delivery_address, o.cargo_description,
      o.enterprise_id,
      c.id              AS customer_db_id,
      c.tax_id          AS customer_tax_id,
      c.invoice_title   AS customer_invoice_title,
      c.email           AS customer_email_db,
      c.line_user_id    AS customer_line_user_id,
      c.billing_type    AS customer_billing_type,
      ea.tax_id         AS enterprise_tax_id,
      ea.company_name   AS enterprise_name,
      ea.billing_type   AS enterprise_billing_type,
      ea.email          AS enterprise_email
    FROM orders o
    LEFT JOIN customers c ON c.phone = o.customer_phone
    LEFT JOIN enterprise_accounts ea ON ea.id = o.enterprise_id
    WHERE o.id = ${orderId}
    LIMIT 1
  `);
  if (!(orderRows.rows as any[]).length) return null;

  const order = (orderRows.rows as any[])[0];
  const rawAmount = Number(order.total_fee ?? order.base_price ?? 0);
  if (rawAmount <= 0) return null;

  // ── 判斷計費方式 ───────────────────────────────────────────────────────
  const isEnterprise = !!order.enterprise_id;
  const billingType: string = isEnterprise
    ? (order.enterprise_billing_type ?? "prepaid")
    : (order.customer_billing_type ?? "cash");
  const isMonthly = billingType === "monthly";

  // ── 買方資訊 ──────────────────────────────────────────────────────────
  const buyerName  = isEnterprise
    ? order.enterprise_name
    : order.customer_invoice_title || order.customer_name;
  const buyerTaxId = isEnterprise
    ? order.enterprise_tax_id
    : order.customer_tax_id;
  const toEmail: string | null =
    order.customer_email ?? order.customer_email_db ??
    (isEnterprise ? order.enterprise_email : null) ?? null;

  const taxRate    = 5;
  const taxAmount  = Math.round(rawAmount * (taxRate / 100));
  const totalAmount = rawAmount + taxAmount;
  const itemDesc   = order.cargo_description
    ? `物流服務（${order.cargo_description}）`
    : "物流運送服務";
  const orderLabel = order.order_no ?? `#${orderId}`;

  // ══════════════════════════════════════════════════════════════════════
  //  月結路徑：掛應收，不開票
  // ══════════════════════════════════════════════════════════════════════
  if (isMonthly) {
    const existAr = await db.execute(sql`
      SELECT id FROM ar_ledger
      WHERE order_id = ${orderId} AND entry_type = 'receivable' LIMIT 1
    `);
    if ((existAr.rows as any[]).length > 0) {
      return { totalAmount, flow: "monthly", arEntryId: Number((existAr.rows[0] as any).id) };
    }
    const arId = await writeArEntry({
      enterpriseId: order.enterprise_id ?? null,
      customerId:   order.customer_db_id ?? null,
      orderId,
      entryType:    "receivable",
      amount:       totalAmount,
      note:         `月結應收 ${orderLabel}（${triggeredBy}）`,
    });
    await db.execute(sql`
      UPDATE orders SET fee_status = 'monthly_pending' WHERE id = ${orderId}
    `);
    return { totalAmount, flow: "monthly", arEntryId: arId };
  }

  // ══════════════════════════════════════════════════════════════════════
  //  現結路徑：透過 invoiceProvider 開票 → 寫 DB → AR → 通知
  // ══════════════════════════════════════════════════════════════════════
  const existingInv = await db.execute(sql`
    SELECT id, invoice_number, total_amount FROM invoices
    WHERE order_id = ${orderId} LIMIT 1
  `);
  if ((existingInv.rows as any[]).length > 0) {
    const row = (existingInv.rows as any[])[0];
    return { invoiceId: row.id, invoiceNumber: row.invoice_number, totalAmount: row.total_amount, flow: "cash" };
  }

  // ── 呼叫電子發票供應商（mock 或 ECPay）────────────────────────────────
  const invoiceResult = await issueInvoice({
    relateNumber: `TMS-${orderId}-${Date.now()}`,
    buyerName:    buyerName ?? order.customer_name ?? "客戶",
    buyerTaxId:   buyerTaxId ?? undefined,
    buyerEmail:   toEmail ?? undefined,
    amount:       rawAmount,
    taxAmount,
    totalAmount,
    items: [{
      description: itemDesc,
      qty:         1,
      unitPrice:   rawAmount,
      total:       rawAmount,
    }],
    remark: `訂單 ${orderLabel}（${triggeredBy}）`,
  });

  const invoiceType = isEnterprise ? "b2b" : buyerTaxId ? "b2b" : "receipt";

  // ── 寫回 invoices 資料表 ──────────────────────────────────────────────
  const result = await db.execute(sql`
    INSERT INTO invoices (
      invoice_number, random_number, invoice_date, provider,
      order_id, enterprise_id, customer_id,
      invoice_type, buyer_name, buyer_tax_id,
      amount, tax_amount, total_amount,
      items, notes,
      qr_code_left, qr_code_right, provider_raw
    ) VALUES (
      ${invoiceResult.invoiceNo},
      ${invoiceResult.randomNo},
      ${invoiceResult.invoiceDate},
      ${invoiceResult.provider},
      ${orderId},
      ${order.enterprise_id ?? null},
      ${order.customer_db_id ?? null},
      ${invoiceType},
      ${buyerName ?? order.customer_name},
      ${buyerTaxId ?? null},
      ${rawAmount}, ${taxAmount}, ${totalAmount},
      ${JSON.stringify([{ description: itemDesc, qty: 1, unitPrice: rawAmount, total: rawAmount }])},
      ${`訂單 ${orderLabel} 自動開立（${triggeredBy}）`},
      ${invoiceResult.qrCodeLeft  ?? null},
      ${invoiceResult.qrCodeRight ?? null},
      ${JSON.stringify(invoiceResult.raw ?? null)}
    ) RETURNING id, invoice_number, total_amount
  `);

  const inv = (result.rows as any[])[0];

  // ── 寫 AR 應收分錄 ────────────────────────────────────────────────────
  const arId = await writeArEntry({
    enterpriseId: order.enterprise_id ?? null,
    customerId:   order.customer_db_id ?? null,
    orderId,
    entryType:    "receivable",
    amount:       totalAmount,
    note:         `現結應收 ${orderLabel}`,
    refInvoiceId: Number(inv.id),
  });

  // ── 更新訂單狀態 ──────────────────────────────────────────────────────
  await db.execute(sql`
    UPDATE orders SET fee_status = 'invoiced', invoice_id = ${Number(inv.id)}
    WHERE id = ${orderId}
  `);

  // ── 非同步通知 ────────────────────────────────────────────────────────
  setImmediate(() => {
    if (order.customer_line_user_id) {
      sendInvoiceNotification(order.customer_line_user_id, {
        invoiceNumber: invoiceResult.invoiceNo,
        orderId,
        buyerName:   buyerName ?? order.customer_name,
        totalAmount,
        taxAmount,
      }).catch(() => {});
    }
    if (toEmail) {
      sendInvoiceEmail({
        to:            toEmail,
        invoiceNumber: invoiceResult.invoiceNo,
        orderId,
        buyerName:     buyerName ?? order.customer_name,
        totalAmount,
        taxAmount,
        amount:        rawAmount,
        invoiceType,
        itemDesc,
        pickupAddress:   order.pickup_address   ?? undefined,
        deliveryAddress: order.delivery_address ?? undefined,
      }).catch(() => {});
    }
  });

  return {
    invoiceId:     Number(inv.id),
    invoiceNumber: inv.invoice_number,
    totalAmount:   inv.total_amount,
    flow:          "cash",
    arEntryId:     arId,
  };
}
