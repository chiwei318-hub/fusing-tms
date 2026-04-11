/**
 * email.ts
 * Email service for invoice notifications and transactional emails.
 * SMTP settings are read from pricing_config table (key prefix: smtp_*).
 * Falls back to env vars SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
 * If no SMTP is configured, emails are logged but not sent (dev-safe).
 */

import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

let _smtpCache: SmtpConfig | null = null;
let _smtpCacheTime = 0;
const SMTP_CACHE_TTL = 60_000; // 1 minute

async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  if (_smtpCache && Date.now() - _smtpCacheTime < SMTP_CACHE_TTL) return _smtpCache;

  try {
    const rows = await db.execute(sql`
      SELECT key, value FROM pricing_config
      WHERE key IN ('smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass','smtp_from','smtp_from_name')
    `);
    const cfg: Record<string, string> = {};
    for (const r of rows.rows as any[]) cfg[r.key] = r.value;

    const host = cfg.smtp_host || process.env.SMTP_HOST || "";
    const user = cfg.smtp_user || process.env.SMTP_USER || "";
    const pass = cfg.smtp_pass || process.env.SMTP_PASS || "";

    if (!host || !user || !pass) {
      _smtpCache = null;
      _smtpCacheTime = Date.now();
      return null;
    }

    _smtpCache = {
      host,
      port: parseInt(cfg.smtp_port || process.env.SMTP_PORT || "587", 10),
      secure: (cfg.smtp_secure || process.env.SMTP_SECURE || "false") === "true",
      user,
      pass,
      from: cfg.smtp_from || process.env.EMAIL_FROM || user,
      fromName: cfg.smtp_from_name || process.env.EMAIL_FROM_NAME || "富詠運輸",
    };
    _smtpCacheTime = Date.now();
    return _smtpCache;
  } catch (e) {
    console.error("[email] loadSmtpConfig error", e);
    return null;
  }
}

export function invalidateSmtpCache() {
  _smtpCache = null;
  _smtpCacheTime = 0;
}

async function getTransporter() {
  const cfg = await loadSmtpConfig();
  if (!cfg) return null;
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },
  });
}

async function getFrom() {
  const cfg = await loadSmtpConfig();
  if (!cfg) return "富詠運輸 <no-reply@furyong.com>";
  return `${cfg.fromName} <${cfg.from}>`;
}

// ─── HTML Invoice Email Template ─────────────────────────────────────────────

function buildInvoiceEmailHtml(params: {
  invoiceNumber: string;
  orderId: number;
  buyerName: string;
  totalAmount: number;
  taxAmount: number;
  amount: number;
  invoiceType: string;
  itemDesc: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  issuedAt: Date;
  appUrl: string;
}): string {
  const fmt = (n: number) => `NT$${n.toLocaleString()}`;
  const dateStr = params.issuedAt.toLocaleDateString("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit"
  });

  const typeLabel = params.invoiceType === "b2b" ? "統編發票" : params.invoiceType === "monthly" ? "月結發票" : "收據";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>電子發票 ${params.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;min-height:100vh;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">電子發票通知</div>
            <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.5px;">富詠運輸股份有限公司</div>
            <div style="margin-top:12px;display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:6px 16px;">
              <span style="color:#93c5fd;font-size:13px;">發票號碼 </span>
              <span style="color:#fff;font-size:15px;font-weight:700;font-family:monospace;">${params.invoiceNumber}</span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px 40px;">
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">親愛的 <strong>${params.buyerName}</strong>，您好：</p>
            <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">
              您的訂單 <strong style="color:#1d4ed8;">#${params.orderId}</strong> 已完成配送，以下為本次服務之電子發票明細。
            </p>

            <!-- Invoice details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f8fafc;">
                <td style="padding:14px 20px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">服務項目</td>
                <td style="padding:14px 20px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;text-align:right;">金額</td>
              </tr>
              <tr>
                <td style="padding:16px 20px;color:#111827;font-size:14px;border-bottom:1px solid #f3f4f6;">${params.itemDesc}</td>
                <td style="padding:16px 20px;color:#111827;font-size:14px;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.amount)}</td>
              </tr>
              <tr style="background:#fafafa;">
                <td style="padding:12px 20px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6;">營業稅 (5%)</td>
                <td style="padding:12px 20px;color:#6b7280;font-size:13px;text-align:right;border-bottom:1px solid #f3f4f6;">${fmt(params.taxAmount)}</td>
              </tr>
              <tr style="background:#eff6ff;">
                <td style="padding:16px 20px;color:#1d4ed8;font-size:16px;font-weight:700;">合計金額</td>
                <td style="padding:16px 20px;color:#1d4ed8;font-size:20px;font-weight:800;text-align:right;">${fmt(params.totalAmount)}</td>
              </tr>
            </table>

            <!-- Meta info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              ${[
                ["發票類型", typeLabel],
                ["開立日期", dateStr],
                ["訂單編號", `#${params.orderId}`],
                params.pickupAddress ? ["取貨地址", params.pickupAddress] : null,
                params.deliveryAddress ? ["送達地址", params.deliveryAddress] : null,
              ].filter((x): x is string[] => x !== null).map(([label, value]) => `
              <tr>
                <td style="padding:6px 0;color:#9ca3af;font-size:13px;width:90px;">${label}</td>
                <td style="padding:6px 0;color:#374151;font-size:13px;">${value}</td>
              </tr>`).join("")}
            </table>

            <!-- CTA -->
            <div style="text-align:center;margin:28px 0 8px;">
              <a href="${params.appUrl}/orders/${params.orderId}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">查看訂單詳情</a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
            <p style="margin:0 0 8px;color:#9ca3af;font-size:12px;">此為系統自動發送，請勿直接回覆此郵件</p>
            <p style="margin:0;color:#9ca3af;font-size:12px;">富詠運輸股份有限公司 · 客服：0800-000-000 · 週一至週日 7:00~22:00</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface InvoiceEmailParams {
  to: string;
  invoiceNumber: string;
  orderId?: number;
  orderNo?: string;
  buyerName: string;
  totalAmount: number;
  taxAmount: number;
  amount: number;
  invoiceType?: string;
  itemDesc?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  issuedAt?: Date | string;
  pdfAttachment?: { filename: string; content: Buffer };
}

export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<boolean> {
  const transporter = await getTransporter();
  const from = await getFrom();

  const html = buildInvoiceEmailHtml({
    ...params,
    orderId:     params.orderId ?? 0,
    invoiceType: params.invoiceType ?? "b2c",
    itemDesc:    params.itemDesc ?? "物流運送服務",
    issuedAt:    params.issuedAt ? new Date(params.issuedAt as string) : new Date(),
    appUrl: process.env.APP_BASE_URL ?? "https://app.furyong.com",
  });

  if (!transporter) {
    console.log(`[email] SMTP not configured — invoice ${params.invoiceNumber} NOT sent to ${params.to}`);
    return false;
  }

  const attachments: any[] = [];
  if (params.pdfAttachment) {
    attachments.push({
      filename:    params.pdfAttachment.filename,
      content:     params.pdfAttachment.content,
      contentType: "application/pdf",
    });
  }

  try {
    await transporter.sendMail({
      from,
      to: params.to,
      subject: `【富詠運輸】電子發票 ${params.invoiceNumber} — ${params.orderNo ? `訂單 ${params.orderNo}` : `訂單 #${params.orderId ?? ""}`} 已完成配送`,
      html,
      text: `您好 ${params.buyerName}，\n\n訂單已完成配送。\n發票號碼：${params.invoiceNumber}\n合計金額：NT$${params.totalAmount.toLocaleString()}\n\n感謝您使用富詠運輸服務！`,
      attachments,
    });
    console.log(`[email] Invoice ${params.invoiceNumber} sent to ${params.to}${params.pdfAttachment ? " (with PDF)" : ""}`);
    return true;
  } catch (e: any) {
    console.error(`[email] Failed to send invoice ${params.invoiceNumber} to ${params.to}:`, e?.message ?? e);
    return false;
  }
}

/**
 * 傳送測試信（管理員用，驗證 SMTP 設定是否正確）
 */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const transporter = await getTransporter();
  const from = await getFrom();

  if (!transporter) return { ok: false, error: "SMTP 未設定" };

  try {
    await transporter.sendMail({
      from,
      to,
      subject: "【富詠運輸】SMTP 測試信件",
      html: `<p>SMTP 設定正確！此為系統測試信件。</p><p style="color:#888;font-size:12px;">發送時間：${new Date().toLocaleString("zh-TW")}</p>`,
      text: "SMTP 設定正確！此為系統測試信件。",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
