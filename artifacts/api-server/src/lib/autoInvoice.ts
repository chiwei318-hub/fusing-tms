/**
 * autoInvoice.ts
 * 訂單完成後自動開立電子發票，並回傳發票號碼
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendInvoiceNotification } from "./line";
import { sendInvoiceEmail } from "./email";

export interface AutoInvoiceResult {
  invoiceId: number;
  invoiceNumber: string;
  totalAmount: number;
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900000) + 100000);
  return `FY${y}${m}-${seq}`;
}

/**
 * 根據訂單 ID 自動開立電子發票
 * - 若訂單已有發票，則跳過（idempotent）
 * - 帶入客戶統編（tax_id）與發票抬頭（invoice_title）
 * - 開立後傳 LINE 通知給客戶
 */
export async function autoIssueInvoice(orderId: number, triggeredBy = "system"): Promise<AutoInvoiceResult | null> {
  // 避免重複開立
  const existing = await db.execute(sql`
    SELECT id, invoice_number, total_amount FROM invoices WHERE order_id = ${orderId} LIMIT 1
  `);
  if ((existing.rows as any[]).length > 0) {
    const row = (existing.rows as any[])[0];
    return { invoiceId: row.id, invoiceNumber: row.invoice_number, totalAmount: row.total_amount };
  }

  // 取得訂單資料（含客戶統編，用電話號碼關聯）
  const orderRows = await db.execute(sql`
    SELECT
      o.id, o.total_fee, o.base_price, o.customer_name, o.customer_phone,
      o.customer_email,
      o.pickup_address, o.delivery_address, o.cargo_description,
      o.enterprise_id,
      c.id            AS customer_db_id,
      c.tax_id        AS customer_tax_id,
      c.invoice_title AS customer_invoice_title,
      c.email         AS customer_email_db,
      c.line_user_id  AS customer_line_user_id,
      ea.tax_id       AS enterprise_tax_id,
      ea.company_name AS enterprise_name
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

  // 決定買方資訊（企業客戶優先）
  const isEnterprise = !!order.enterprise_id;
  const buyerName = isEnterprise
    ? order.enterprise_name
    : order.customer_invoice_title || order.customer_name;
  const buyerTaxId = isEnterprise
    ? order.enterprise_tax_id
    : order.customer_tax_id;

  const invoiceType = isEnterprise ? "monthly" : buyerTaxId ? "b2b" : "receipt";
  const taxRate = 5;
  const taxAmount = Math.round(rawAmount * (taxRate / 100));
  const totalAmount = rawAmount + taxAmount;
  const invoiceNumber = generateInvoiceNumber();

  const itemDesc = order.cargo_description
    ? `物流服務（${order.cargo_description}）`
    : "物流運送服務";

  const result = await db.execute(sql`
    INSERT INTO invoices (
      invoice_number, order_id, enterprise_id, customer_id,
      invoice_type, buyer_name, buyer_tax_id,
      amount, tax_amount, total_amount,
      items, notes
    ) VALUES (
      ${invoiceNumber},
      ${orderId},
      ${order.enterprise_id ?? null},
      ${order.customer_db_id ?? null},
      ${invoiceType},
      ${buyerName ?? order.customer_name},
      ${buyerTaxId ?? null},
      ${rawAmount},
      ${taxAmount},
      ${totalAmount},
      ${JSON.stringify([{ description: itemDesc, qty: 1, unitPrice: rawAmount, total: rawAmount }])},
      ${`訂單 #${orderId} 自動開立（${triggeredBy}）`}
    ) RETURNING id, invoice_number, total_amount
  `);

  const inv = (result.rows as any[])[0];

  // 決定 Email 收件人：訂單 > 客戶資料表
  const toEmail: string | null =
    order.customer_email ||
    order.customer_email_db ||
    null;

  // 非同步通知 — 失敗不影響主流程
  setImmediate(() => {
    // LINE 推播
    if (order.customer_line_user_id) {
      sendInvoiceNotification(order.customer_line_user_id, {
        invoiceNumber,
        orderId,
        buyerName: buyerName ?? order.customer_name,
        totalAmount,
        taxAmount,
      }).catch(() => {});
    }

    // Email 發票通知
    if (toEmail) {
      sendInvoiceEmail({
        to: toEmail,
        invoiceNumber,
        orderId,
        buyerName: buyerName ?? order.customer_name,
        totalAmount,
        taxAmount,
        amount: rawAmount,
        invoiceType,
        itemDesc,
        pickupAddress: order.pickup_address ?? undefined,
        deliveryAddress: order.delivery_address ?? undefined,
      }).catch(() => {});
    } else {
      console.log(`[autoInvoice] Order #${orderId}: no email address found, skipping email notification`);
    }
  });

  return { invoiceId: inv.id, invoiceNumber: inv.invoice_number, totalAmount: inv.total_amount };
}
