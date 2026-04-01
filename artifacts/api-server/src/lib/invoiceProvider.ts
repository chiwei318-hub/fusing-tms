/**
 * invoiceProvider.ts
 * 電子發票供應商介接層
 *
 * 環境變數：
 *   INVOICE_PROVIDER=mock           → 使用 mock（不呼叫外部 API）
 *   INVOICE_PROVIDER=ecpay          → 綠界科技電子發票 API
 *
 *   INVOICE_API_BASE                → 綠界 API 基底 URL
 *                                      測試: https://einvoice-stage.ecpay.com.tw
 *                                      正式: https://einvoice.ecpay.com.tw
 *   INVOICE_MERCHANT_ID             → 廠商編號
 *   INVOICE_HASH_KEY                → 加密金鑰（32 chars）
 *   INVOICE_HASH_IV                 → 加密向量（16 chars）
 */

import crypto from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  description: string;
  qty:         number;
  unitPrice:   number;
  total:       number;
}

export interface IssueInvoiceParams {
  /** 訂單流水號（關聯用，不對外顯示） */
  relateNumber:    string;
  /** 買方名稱 */
  buyerName:       string;
  /** 買方統一編號（B2B 填，B2C 留空） */
  buyerTaxId?:     string;
  /** 買方 Email */
  buyerEmail?:     string;
  /** 買方手機（手機條碼載具用） */
  buyerPhone?:     string;
  /** 未稅金額 */
  amount:          number;
  /** 稅額 */
  taxAmount:       number;
  /** 含稅總額 */
  totalAmount:     number;
  /** 品項明細 */
  items:           InvoiceItem[];
  /** 備註 */
  remark?:         string;
}

export interface InvoiceResult {
  /** 供應商 ID */
  provider:      "mock" | "ecpay";
  /** 發票號碼，例如 AB12345678 */
  invoiceNo:     string;
  /** 隨機碼（4碼） */
  randomNo:      string;
  /** 發票日期 YYYYMMDD */
  invoiceDate:   string;
  /** QRCode 左欄（如有） */
  qrCodeLeft?:   string;
  /** QRCode 右欄（如有） */
  qrCodeRight?:  string;
  /** 含稅總額（確認數字） */
  totalAmount:   number;
  /** 供應商原始回應（debug 用） */
  raw?:          unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function randomCode(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 10).toString()
  ).join("");
}

/** AES-256-CBC encrypt（綠界格式） */
function aesEncrypt(text: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("base64");
}

/** AES-256-CBC decrypt（綠界格式） */
function aesDecrypt(base64: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  return Buffer.concat([
    decipher.update(Buffer.from(base64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// ── Mock Provider ─────────────────────────────────────────────────────────────

async function issueMock(params: IssueInvoiceParams): Promise<InvoiceResult> {
  // 模擬真實格式的發票號碼：2 英文 + 8 數字
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const prefix =
    alpha[Math.floor(Math.random() * alpha.length)] +
    alpha[Math.floor(Math.random() * alpha.length)];
  const invoiceNo  = `${prefix}${randomCode(8)}`;
  const randomNo   = randomCode(4);
  const invoiceDate = today();

  return {
    provider:     "mock",
    invoiceNo,
    randomNo,
    invoiceDate,
    totalAmount:  params.totalAmount,
    raw: {
      _note:   "mock mode — no real API call",
      params,
    },
  };
}

// ── ECPay Provider ────────────────────────────────────────────────────────────
// 綠界電子發票 B2C/B2B 開立
// Docs: https://developers.ecpay.com.tw/?p=8160

async function issueEcpay(params: IssueInvoiceParams): Promise<InvoiceResult> {
  const apiBase    = process.env.INVOICE_API_BASE    ?? "";
  const merchantId = process.env.INVOICE_MERCHANT_ID ?? "";
  const hashKey    = process.env.INVOICE_HASH_KEY    ?? "";
  const hashIv     = process.env.INVOICE_HASH_IV     ?? "";

  if (!apiBase || !merchantId || !hashKey || !hashIv) {
    throw new Error(
      "[invoiceProvider] ECPay 設定不完整，請確認 INVOICE_API_BASE / INVOICE_MERCHANT_ID / INVOICE_HASH_KEY / INVOICE_HASH_IV"
    );
  }

  const isB2B  = !!params.buyerTaxId;
  const endpoint = isB2B ? "/B2BInvoice/Issue" : "/B2CInvoice/Issue";

  // ── 組請求資料 ──────────────────────────────────────────────────────────────
  const dataObj: Record<string, unknown> = {
    MerchantID:          merchantId,
    RelateNumber:        params.relateNumber,
    CustomerID:          "",
    CustomerIdentifier:  params.buyerTaxId ?? "",
    CustomerName:        params.buyerName,
    CustomerAddr:        "",
    CustomerPhone:       params.buyerPhone ?? "",
    CustomerEmail:       params.buyerEmail ?? "",
    Print:               "0",
    Donation:            "0",
    LoveCode:            "",
    CarruerType:         "",
    CarruerNum:          "",
    TaxType:             "1",      // 1 = 應稅
    SalesAmount:         params.totalAmount,
    InvoiceRemark:       params.remark ?? "",
    InvType:             "07",     // 一般稅額
    vat:                 "1",
    Items: params.items.map((item, idx) => ({
      ItemSeq:    idx + 1,
      ItemName:   item.description.slice(0, 50),
      ItemCount:  item.qty,
      ItemWord:   "式",
      ItemPrice:  item.unitPrice,
      ItemAmount: item.total,
    })),
  };

  const dataJson = JSON.stringify(dataObj);
  const encryptedData = encodeURIComponent(aesEncrypt(dataJson, hashKey, hashIv));

  const timestamp = Math.floor(Date.now() / 1000);
  const rqHeader = JSON.stringify({ Timestamp: timestamp, Revision: "0.1" });

  // ── 呼叫 API ─────────────────────────────────────────────────────────────
  const body = new URLSearchParams({
    MerchantID: merchantId,
    RqHeader:   rqHeader,
    Data:       encryptedData,
  });

  const response = await fetch(`${apiBase}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!response.ok) {
    throw new Error(`[invoiceProvider] ECPay HTTP ${response.status}: ${await response.text()}`);
  }

  const respJson = await response.json() as {
    TransCode: number;
    TransMsg:  string;
    Data?:     string;
  };

  if (respJson.TransCode !== 1) {
    throw new Error(`[invoiceProvider] ECPay TransCode ${respJson.TransCode}: ${respJson.TransMsg}`);
  }

  // ── 解密回應 ─────────────────────────────────────────────────────────────
  const decrypted   = aesDecrypt(decodeURIComponent(respJson.Data ?? ""), hashKey, hashIv);
  const result      = JSON.parse(decrypted) as {
    RtnCode:       number;
    RtnMsg:        string;
    InvoiceNo:     string;
    InvoiceDate:   string;
    RandomNumber:  string;
    QRCode_Left?:  string;
    QRCode_Right?: string;
  };

  if (result.RtnCode !== 1) {
    throw new Error(`[invoiceProvider] ECPay RtnCode ${result.RtnCode}: ${result.RtnMsg}`);
  }

  return {
    provider:     "ecpay",
    invoiceNo:    result.InvoiceNo,
    randomNo:     result.RandomNumber,
    invoiceDate:  result.InvoiceDate?.replace(/\//g, "") ?? today(),
    qrCodeLeft:   result.QRCode_Left,
    qrCodeRight:  result.QRCode_Right,
    totalAmount:  params.totalAmount,
    raw:          result,
  };
}

// ── Public Entry Point ────────────────────────────────────────────────────────

/**
 * 開立電子發票（自動根據 INVOICE_PROVIDER 決定走 mock 或真實 API）
 */
export async function issueInvoice(params: IssueInvoiceParams): Promise<InvoiceResult> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "ecpay":
      return issueEcpay(params);

    case "mock":
    default:
      return issueMock(params);
  }
}

/**
 * 作廢電子發票（ECPay 作廢）
 * mock 模式下不做任何事
 */
export async function voidInvoice(params: {
  invoiceNo:   string;
  invoiceDate: string;
  reason:      string;
}): Promise<{ ok: boolean; raw?: unknown }> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();

  if (provider !== "ecpay") {
    console.log(`[invoiceProvider] mock void: ${params.invoiceNo}`);
    return { ok: true };
  }

  const apiBase    = process.env.INVOICE_API_BASE    ?? "";
  const merchantId = process.env.INVOICE_MERCHANT_ID ?? "";
  const hashKey    = process.env.INVOICE_HASH_KEY    ?? "";
  const hashIv     = process.env.INVOICE_HASH_IV     ?? "";

  const dataJson = JSON.stringify({
    MerchantID:  merchantId,
    InvoiceNo:   params.invoiceNo,
    InvoiceDate: params.invoiceDate,
    Reason:      params.reason,
  });

  const encData  = encodeURIComponent(aesEncrypt(dataJson, hashKey, hashIv));
  const timestamp = Math.floor(Date.now() / 1000);

  const body = new URLSearchParams({
    MerchantID: merchantId,
    RqHeader:   JSON.stringify({ Timestamp: timestamp, Revision: "0.1" }),
    Data:       encData,
  });

  const resp = await fetch(`${apiBase}/Invoice/Invalid`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  const json = await resp.json() as { TransCode: number; TransMsg: string; Data?: string };

  if (json.TransCode !== 1) {
    return { ok: false, raw: json };
  }

  const dec    = aesDecrypt(decodeURIComponent(json.Data ?? ""), hashKey, hashIv);
  const result = JSON.parse(dec) as { RtnCode: number };

  return { ok: result.RtnCode === 1, raw: result };
}
