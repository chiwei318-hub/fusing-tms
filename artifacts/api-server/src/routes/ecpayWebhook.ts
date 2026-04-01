/**
 * ecpayWebhook.ts — 綠界電子發票 Webhook 狀態回寫
 *
 * 綠界在以下事件後通知本系統：
 *   - 發票開立成功   (InvoiceType = "Invoice")
 *   - 發票作廢成功   (InvoiceType = "InvoiceInvalid")
 *   - 折讓開立成功   (InvoiceType = "InvoiceAllowance")
 *
 * POST /api/webhooks/ecpay-invoice
 *   Content-Type: application/x-www-form-urlencoded
 *   Fields: MerchantID, RqHeader (JSON), Data (AES-256-CBC encrypted JSON)
 *
 * 解密後 Data 欄位對照 → EcpayInvoiceWebhookPayload（invoiceProvider.ts）
 *
 * CheckCode 驗證（開立/作廢）：
 *   SHA256( HashKey=xxx & IIS_Mer_ID=xxx & IIS_Number=xxx
 *           & IIS_Random_Number=xxx & IIS_Sales_Amount=xxx & HashIV=xxx )
 *   轉大寫後與 payload.CheckCode 比對
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  decryptWebhookData,
  verifyWebhookCheckCode,
  type EcpayInvoiceWebhookPayload,
} from "../lib/invoiceProvider.js";

export const ecpayWebhookRouter = Router();

ecpayWebhookRouter.post("/webhooks/ecpay-invoice", async (req, res) => {
  const { MerchantID, Data } = req.body ?? {};

  // ── Mock 模式：直接回應（不做任何驗證）────────────────────────────────────
  if (process.env.INVOICE_PROVIDER !== "ecpay" || !process.env.INVOICE_HASH_KEY) {
    console.log("[ecpayWebhook] mock mode — webhook accepted without processing");
    return res.json({ ok: true, mode: "mock" });
  }

  // ── 基本欄位驗證 ─────────────────────────────────────────────────────────
  if (!MerchantID || !Data) {
    return res.status(400).json({ error: "Missing MerchantID or Data" });
  }

  // ── AES 解密 ──────────────────────────────────────────────────────────────
  const payload: EcpayInvoiceWebhookPayload | null = decryptWebhookData(Data);
  if (!payload) {
    console.error("[ecpayWebhook] Failed to decrypt payload");
    return res.status(400).json({ error: "Decryption failed" });
  }

  const { RtnCode, InvoiceNo, InvoiceDate, RandomNumber, InvoiceType } = payload;
  console.log(`[ecpayWebhook] InvoiceNo=${InvoiceNo} RtnCode=${RtnCode} Type=${InvoiceType}`);

  // ── CheckCode 驗證（開立與作廢事件才有 IIS_* 欄位）─────────────────────
  if (
    (InvoiceType === "Invoice" || InvoiceType === "InvoiceInvalid") &&
    payload.CheckCode &&
    payload.IIS_Mer_ID &&
    payload.IIS_Number &&
    payload.IIS_Random_Number &&
    payload.IIS_Sales_Amount !== undefined
  ) {
    const valid = verifyWebhookCheckCode({
      IIS_Mer_ID:        payload.IIS_Mer_ID as string,
      IIS_Number:        payload.IIS_Number as string,
      IIS_Random_Number: payload.IIS_Random_Number as string,
      IIS_Sales_Amount:  payload.IIS_Sales_Amount,
      CheckCode:         payload.CheckCode,
    });
    if (!valid) {
      console.warn("[ecpayWebhook] CheckCode verification failed");
      return res.status(400).json({ error: "CheckCode invalid" });
    }
  }

  // ── 寫入稽核 Log ──────────────────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO audit_log (action, entity_type, entity_id, new_data, performed_by)
    VALUES ('ecpay_webhook', 'invoice', ${InvoiceNo ?? "unknown"},
            ${JSON.stringify(payload)}, 'ecpay_system')
  `).catch(() => {});

  // ── 非成功回呼（RtnCode != 1）—記錄後直接回應 ────────────────────────────
  if (RtnCode !== 1) {
    console.warn(`[ecpayWebhook] Non-success RtnCode: ${RtnCode}`);
    return res.json({ ok: false, rtnCode: RtnCode });
  }

  // ── 依事件類型更新 DB ─────────────────────────────────────────────────────

  if (InvoiceType === "Invoice") {
    // 開立確認：更新發票號碼、隨機碼、開立時間
    await db.execute(sql`
      UPDATE invoices
      SET status        = 'issued',
          invoice_date  = ${InvoiceDate ?? null},
          random_number = ${RandomNumber ?? null},
          updated_at    = NOW()
      WHERE invoice_number = ${InvoiceNo}
        AND status NOT IN ('voided', 'allowanced')
    `).catch(console.error);

  } else if (InvoiceType === "InvoiceInvalid") {
    // 作廢確認：更新發票狀態，並回退關聯訂單的 fee_status
    await db.execute(sql`
      UPDATE invoices
      SET status     = 'voided',
          voided_at  = NOW(),
          updated_at = NOW()
      WHERE invoice_number = ${InvoiceNo}
    `).catch(console.error);

    // 回退關聯訂單 fee_status → unpaid（讓後台知道需要補開發票）
    await db.execute(sql`
      UPDATE orders
      SET fee_status = 'unpaid'
      WHERE invoice_id = (
        SELECT id FROM invoices WHERE invoice_number = ${InvoiceNo} LIMIT 1
      )
    `).catch(console.error);

  } else if (InvoiceType === "InvoiceAllowance") {
    // 折讓確認：記錄折讓單號和剩餘可折讓金額到 notes
    const iaNo     = payload.IA_No ?? "";
    const iaDate   = payload.IA_Date ?? "";
    const iaRemain = payload.IA_Remain_Allowance_Amount ?? 0;

    await db.execute(sql`
      UPDATE invoices
      SET status     = 'allowanced',
          notes      = COALESCE(notes, '') || ${` [折讓確認 ${iaDate} 單號:${iaNo} 剩餘:${iaRemain}]`},
          updated_at = NOW()
      WHERE invoice_number = ${InvoiceNo}
    `).catch(console.error);
  }

  // 綠界要求固定回傳 1|OK
  res.setHeader("Content-Type", "text/plain");
  res.send("1|OK");
});
