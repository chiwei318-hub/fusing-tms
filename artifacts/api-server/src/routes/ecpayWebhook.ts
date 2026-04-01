/**
 * ecpayWebhook.ts — 綠界電子發票 Webhook 狀態回寫
 *
 * 綠界在以下事件後通知本系統：
 *   - 發票開立成功
 *   - 發票作廢成功
 *   - 折讓開立成功
 *
 * POST /api/webhooks/ecpay-invoice
 *   Body: application/x-www-form-urlencoded
 *         MerchantID, RqHeader, Data (AES-256-CBC encrypted JSON)
 */
import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const ecpayWebhookRouter = Router();

function aesDecrypt(base64: string, key: string, iv: string): string {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "utf8"),
      Buffer.from(iv, "utf8")
    );
    return Buffer.concat([
      decipher.update(Buffer.from(base64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

ecpayWebhookRouter.post("/webhooks/ecpay-invoice", async (req, res) => {
  // ECPay sends form-urlencoded
  const { MerchantID, Data } = req.body ?? {};

  const hashKey = process.env.INVOICE_HASH_KEY ?? "";
  const hashIv  = process.env.INVOICE_HASH_IV  ?? "";

  // In mock mode, accept test pings
  if (process.env.INVOICE_PROVIDER !== "ecpay" || !hashKey) {
    console.log("[ecpayWebhook] mock mode — ignoring webhook");
    return res.json({ ok: true, mode: "mock" });
  }

  if (!MerchantID || !Data) {
    return res.status(400).json({ error: "Missing MerchantID or Data" });
  }

  // Decrypt and parse the notification payload
  const decrypted = aesDecrypt(decodeURIComponent(Data), hashKey, hashIv);
  if (!decrypted) {
    console.error("[ecpayWebhook] Failed to decrypt payload");
    return res.status(400).json({ error: "Decryption failed" });
  }

  let payload: Record<string, string>;
  try {
    payload = JSON.parse(decrypted);
  } catch {
    console.error("[ecpayWebhook] Invalid JSON:", decrypted.slice(0, 200));
    return res.status(400).json({ error: "Invalid payload JSON" });
  }

  const { RtnCode, InvoiceNo, InvoiceDate, RandomNumber, InvoiceType } = payload;

  console.log(`[ecpayWebhook] Event: InvoiceNo=${InvoiceNo} RtnCode=${RtnCode} Type=${InvoiceType}`);

  // Log the webhook event
  await db.execute(sql`
    INSERT INTO audit_log (action, entity_type, entity_id, new_data, performed_by)
    VALUES ('ecpay_webhook', 'invoice', ${InvoiceNo ?? "unknown"},
            ${JSON.stringify(payload)}, 'ecpay_system')
  `).catch(() => {});

  if (RtnCode !== "1") {
    console.warn(`[ecpayWebhook] Non-success RtnCode: ${RtnCode}`);
    return res.json({ ok: false, rtnCode: RtnCode });
  }

  // Update invoice status based on event type
  if (InvoiceType === "Invoice") {
    // 發票開立確認
    await db.execute(sql`
      UPDATE invoices
      SET status = 'issued',
          invoice_date = ${InvoiceDate ?? null},
          random_number = ${RandomNumber ?? null}
      WHERE invoice_number = ${InvoiceNo}
        AND status != 'voided'
    `).catch(console.error);
  } else if (InvoiceType === "InvoiceInvalid") {
    // 發票作廢確認
    await db.execute(sql`
      UPDATE invoices
      SET status = 'voided', voided_at = NOW()
      WHERE invoice_number = ${InvoiceNo}
    `).catch(console.error);
    // Update linked order fee_status back to unpaid
    await db.execute(sql`
      UPDATE orders SET fee_status = 'unpaid'
      WHERE invoice_id = (
        SELECT id FROM invoices WHERE invoice_number = ${InvoiceNo} LIMIT 1
      )
    `).catch(console.error);
  } else if (InvoiceType === "InvoiceAllowance") {
    // 折讓確認
    await db.execute(sql`
      UPDATE invoices
      SET status = 'allowanced',
          notes = COALESCE(notes, '') || ' [折讓確認 ' || NOW()::date || ']'
      WHERE invoice_number = ${InvoiceNo}
    `).catch(console.error);
  }

  res.json({ ok: true });
});
