/**
 * invoiceProvider.ts — 綠界電子發票正式串接層
 *
 * 環境變數：
 *   INVOICE_PROVIDER    = mock | ecpay（預設 mock）
 *   INVOICE_API_BASE    = https://einvoice-stage.ecpay.com.tw （測試）
 *                         https://einvoice.ecpay.com.tw        （正式）
 *   INVOICE_MERCHANT_ID = 廠商編號
 *   INVOICE_HASH_KEY    = AES 金鑰（32 chars）
 *   INVOICE_HASH_IV     = AES 向量（16 chars）
 *
 * 涵蓋端點：
 *   POST /B2CInvoice/Issue         開立 B2C 發票
 *   POST /B2BInvoice/Issue         開立 B2B 發票（三聯式）
 *   POST /Invoice/Invalid          作廢發票
 *   POST /B2CInvoice/Allowance     B2C 折讓發票
 *   POST /B2BInvoice/Allowance     B2B 折讓發票
 *   POST /B2CInvoice/GetIssue      查詢 B2C 發票（by RelateNumber）
 *   POST /B2BInvoice/GetIssue      查詢 B2B 發票（by RelateNumber）
 *
 * Webhook 回調欄位對照：見 EcpayInvoiceWebhookPayload（底部）
 */

import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
//  共用 Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

/** YYYYMMDD */
function todayYMD(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/** YYYY-MM-DD HH:mm:ss（綠界發票日期格式） */
function nowDatetime(): string {
  return new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).replace(/\//g, "-");
}

function randomDigits(len: number): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");
}

/** AES-256-CBC 加密 → Base64（綠界格式） */
function aesEncrypt(plain: string, key: string, iv: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
}

/** AES-256-CBC 解密（Base64 輸入） */
function aesDecrypt(base64: string, key: string, iv: string): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  return Buffer.concat([
    decipher.update(Buffer.from(base64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** 取得 ECPay 設定，若不完整則拋錯 */
function getEcpayConfig() {
  const apiBase    = process.env.INVOICE_API_BASE    ?? "";
  const merchantId = process.env.INVOICE_MERCHANT_ID ?? "";
  const hashKey    = process.env.INVOICE_HASH_KEY    ?? "";
  const hashIv     = process.env.INVOICE_HASH_IV     ?? "";
  if (!apiBase || !merchantId || !hashKey || !hashIv) {
    throw new Error(
      "[invoiceProvider] ECPay 設定不完整，請確認環境變數：" +
      "INVOICE_API_BASE / INVOICE_MERCHANT_ID / INVOICE_HASH_KEY / INVOICE_HASH_IV"
    );
  }
  return { apiBase, merchantId, hashKey, hashIv };
}

/** 送出綠界 API 並解密回應 Data */
async function ecpayCall<T>(
  endpoint: string,
  dataObj: Record<string, unknown>,
  cfg: ReturnType<typeof getEcpayConfig>
): Promise<{ transCode: number; transMsg: string; result: T }> {
  const { apiBase, merchantId, hashKey, hashIv } = cfg;

  const dataJson  = JSON.stringify(dataObj);
  const encData   = encodeURIComponent(aesEncrypt(dataJson, hashKey, hashIv));
  const rqHeader  = JSON.stringify({ Timestamp: nowTs(), Revision: "3.0.0" });

  const body = new URLSearchParams({ MerchantID: merchantId, RqHeader: rqHeader, Data: encData });

  const resp = await fetch(`${apiBase}${endpoint}`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });
  if (!resp.ok) throw new Error(`[invoiceProvider] HTTP ${resp.status}: ${await resp.text()}`);

  const outer = await resp.json() as { TransCode: number; TransMsg: string; Data?: string };

  if (outer.TransCode !== 1) {
    throw new Error(`[invoiceProvider] TransCode ${outer.TransCode}: ${outer.TransMsg}`);
  }

  const decrypted = aesDecrypt(decodeURIComponent(outer.Data ?? ""), hashKey, hashIv);
  const result    = JSON.parse(decrypted) as T;
  return { transCode: outer.TransCode, transMsg: outer.TransMsg, result };
}

// ─────────────────────────────────────────────────────────────────────────────
//  型別定義
// ─────────────────────────────────────────────────────────────────────────────

/** 發票品項 */
export interface InvoiceItem {
  /** 品項名稱（最長50字） */
  name:       string;
  /** 數量 */
  qty:        number;
  /** 單位（如：件/箱/式/次） */
  unit?:      string;
  /** 單價（含稅） */
  unitPrice:  number;
  /** 小計（= qty × unitPrice） */
  amount:     number;
  /** 課稅類型：1=應稅 2=零稅 3=免稅（預設 1） */
  taxType?:   "1" | "2" | "3";
}

/** 開立發票入參 */
export interface IssueInvoiceParams {
  /**
   * 廠商自訂訂單流水號（英文大小寫+數字，最長 30 碼，不可重複）
   * 通常帶入 order.order_no，用於查詢比對
   */
  relateNumber:     string;
  /** 客戶編號（可空，最長 20 碼） */
  customerId?:      string;
  /**
   * 買方統一編號（7碼數字）
   * 有填 → B2B 三聯式（/B2BInvoice/Issue）
   * 不填 → B2C 二聯式（/B2CInvoice/Issue）
   */
  buyerTaxId?:      string;
  /** 買方名稱（最長 60 字；B2B 必填，B2C 可填客戶名） */
  buyerName:        string;
  /** 買方地址（B2B 列印時必填） */
  buyerAddr?:       string;
  /** 買方手機（CarruerType=3 或擇一必填） */
  buyerPhone?:      string;
  /** 買方 Email（最長 200 字，擇一必填；寄送發票通知用） */
  buyerEmail?:      string;
  /**
   * 載具類型
   * ""  = 無載具（預設）
   * "1" = 平台會員載具（需 customerId）
   * "2" = 自然人憑證條碼（carruerNum 需填 /+16碼）
   * "3" = 手機條碼（carruerNum 需填 /+8碼大寫英數）
   */
  carruerType?:     "" | "1" | "2" | "3";
  /** 載具隱碼（carruerType 非空時必填） */
  carruerNum?:      string;
  /**
   * 是否捐贈：
   * "0" = 不捐贈（預設）
   * "1" = 捐贈（需填 loveCode）
   */
  donation?:        "0" | "1";
  /** 愛心碼（donation="1" 時必填） */
  loveCode?:        string;
  /**
   * 課稅類型：
   * "1" = 應稅（預設）
   * "2" = 零稅率
   * "3" = 免稅
   * "9" = 混合（含不同稅率品項時使用）
   */
  taxType?:         "1" | "2" | "3" | "9";
  /** 未稅金額 */
  amount:           number;
  /** 稅額 */
  taxAmount:        number;
  /** 含稅總金額（= amount + taxAmount） */
  totalAmount:      number;
  /** 是否含稅（預設 1=含稅） */
  vat?:             "1" | "0";
  /** 發票種類：07=一般稅額（預設），08=特種稅額 */
  invType?:         "07" | "08";
  /** 品項明細（至少一項） */
  items:            InvoiceItem[];
  /** 發票備註（最長 200 字） */
  remark?:          string;
  /**
   * 是否列印：
   * "0" = 不列印（B2C 預設）
   * "1" = 列印（B2B 必填為 "1"）
   */
  print?:           "0" | "1";
}

/** 開立發票結果 */
export interface InvoiceResult {
  provider:       "mock" | "ecpay";
  /** 發票號碼（AB12345678 格式） */
  invoiceNo:      string;
  /** 隨機碼（4碼數字） */
  randomNo:       string;
  /**
   * 發票開立時間（綠界回傳格式：YYYY-MM-DD HH:mm:ss）
   * mock 模式為 YYYYMMDD
   */
  invoiceDate:    string;
  /** 左側 QRCode 內容（B2C 才有） */
  qrCodeLeft?:    string;
  /** 右側 QRCode 內容（B2C 才有） */
  qrCodeRight?:   string;
  /** 含稅總金額 */
  totalAmount:    number;
  /** 廠商自訂訂單號（echo back） */
  relateNumber:   string;
  /** 綠界原始回應（debug） */
  raw?:           unknown;
}

/** 作廢發票入參 */
export interface VoidInvoiceParams {
  /** 發票號碼 */
  invoiceNo:    string;
  /**
   * 發票開立時間（格式：YYYY-MM-DD HH:mm:ss）
   * 對應 invoices.invoice_date 欄位，若不存在則帶今日
   */
  invoiceDate:  string;
  /** 作廢原因（最長 20 字，必填） */
  reason:       string;
}

/** 折讓品項 */
export interface AllowanceItem {
  /** 品項名稱（最長 50 字） */
  name:     string;
  /** 數量 */
  qty:      number;
  /** 單位（預設「式」） */
  unit?:    string;
  /** 單價（含稅） */
  price:    number;
  /** 小計（含稅） */
  amount:   number;
  /** 課稅類型（預設 "1" 應稅） */
  taxType?: "1" | "2" | "3";
  /** 備註（可空） */
  remark?:  string;
}

/** 折讓發票入參 */
export interface AllowanceParams {
  /** 原始發票號碼 */
  invoiceNo:        string;
  /** 原始發票開立時間（YYYY-MM-DD HH:mm:ss） */
  invoiceDate:      string;
  /**
   * 通知方式：
   * "E" = Email 通知
   * "S" = 簡訊通知
   * "N" = 不通知
   */
  allNotify?:       "E" | "S" | "N";
  /** 客戶名稱（B2B 必填） */
  customerName?:    string;
  /** 通知 Email（allNotify="E" 時必填） */
  notifyEmail?:     string;
  /** 通知手機（allNotify="S" 時必填） */
  notifyPhone?:     string;
  /** 折讓含稅總金額 */
  allowanceAmount:  number;
  /** 買方統一編號（B2B 時填，走 /B2BInvoice/Allowance） */
  buyerIdentifier?: string;
  /** 折讓品項（最少一項） */
  items:            AllowanceItem[];
}

/** 折讓結果 */
export interface AllowanceResult {
  ok:             boolean;
  /** 折讓單號（IA_No） */
  allowanceNo?:   string;
  /** 折讓日期（IA_Date） */
  allowanceDate?: string;
  /** 剩餘可折讓金額 */
  remainAmount?:  number;
  raw?:           unknown;
}

/** 查詢發票入參 */
export interface QueryInvoiceParams {
  /** 廠商自訂訂單號（RelateNumber） */
  relateNumber:  string;
  /** B2B 查詢時設 true */
  isB2B?:        boolean;
}

/** 查詢發票結果 */
export interface QueryInvoiceResult {
  found:          boolean;
  invoiceNo?:     string;     // IIS_Number
  invoiceDate?:   string;     // IIS_Create_Date
  randomNumber?:  string;     // IIS_Random_Number
  salesAmount?:   number;     // IIS_Sales_Amount（含稅）
  taxAmount?:     number;     // IIS_Tax_Amount
  taxType?:       string;     // IIS_Tax_Type
  taxRate?:       number;     // IIS_Tax_Rate
  checkNumber?:   string;     // IIS_Check_Number（查驗碼）
  carruerType?:   string;     // IIS_Carrier_Type
  carruerNum?:    string;     // IIS_Carrier_Num
  isInvalid?:     boolean;    // IIS_Invalid_Status
  customerName?:  string;     // IIS_Customer_Name
  customerEmail?: string;     // IIS_Customer_Email
  buyerTaxId?:    string;     // IIS_Customer_Identifier
  raw?:           unknown;
}

/**
 * ECPay 發票 Webhook 回調 Payload（Data 解密後）
 * 發生時機：綠界開立/作廢/折讓確認後 POST 到你的 Webhook URL
 */
export interface EcpayInvoiceWebhookPayload {
  /** 廠商編號 */
  MerchantID:     string;
  /**
   * 回傳狀態：
   * 1 = 成功
   */
  RtnCode:        number;
  /** 回傳訊息 */
  RtnMsg:         string;
  /**
   * 事件類型：
   * "Invoice"           → 開立成功
   * "InvoiceInvalid"    → 作廢成功
   * "InvoiceAllowance"  → 折讓成功
   */
  InvoiceType:    "Invoice" | "InvoiceInvalid" | "InvoiceAllowance";
  /** 發票號碼（10碼，AB12345678） */
  InvoiceNo:      string;
  /** 發票開立日期（YYYY-MM-DD HH:mm:ss） */
  InvoiceDate:    string;
  /** 隨機碼（4碼數字） */
  RandomNumber:   string;
  /** 查驗碼（CheckCode = HMAC-SHA256，開立時才有） */
  CheckCode?:     string;
  /**
   * 發票防偽碼（IIS_Check_Number）
   * 與 QRCode 左側第一行比對用
   */
  IIS_Check_Number?: string;
  /** 含稅金額（IIS_Sales_Amount） */
  IIS_Sales_Amount?: number;
  /** 廠商自訂訂單號（IIS_Relate_Number） */
  IIS_Relate_Number?: string;
  /** 折讓單號（InvoiceType=InvoiceAllowance 時才有） */
  IA_No?:         string;
  /** 折讓日期 */
  IA_Date?:       string;
  /** 剩餘可折讓金額 */
  IA_Remain_Allowance_Amount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mock Provider
// ─────────────────────────────────────────────────────────────────────────────

async function issueMock(p: IssueInvoiceParams): Promise<InvoiceResult> {
  const alpha   = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const prefix  = alpha[Math.floor(Math.random() * alpha.length)] + alpha[Math.floor(Math.random() * alpha.length)];
  const invoiceNo   = `${prefix}${randomDigits(8)}`;
  const randomNo    = randomDigits(4);
  const invoiceDate = todayYMD();

  console.log(`[invoiceProvider] mock issue: ${invoiceNo} relateNumber=${p.relateNumber}`);
  return {
    provider:     "mock",
    invoiceNo,
    randomNo,
    invoiceDate,
    totalAmount:  p.totalAmount,
    relateNumber: p.relateNumber,
    raw:          { _note: "mock mode", params: p },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ECPay B2C/B2B Issue
// ─────────────────────────────────────────────────────────────────────────────

async function issueEcpay(p: IssueInvoiceParams): Promise<InvoiceResult> {
  const cfg    = getEcpayConfig();
  const isB2B  = !!p.buyerTaxId;
  const endpoint = isB2B ? "/B2BInvoice/Issue" : "/B2CInvoice/Issue";

  // 品項陣列（兩端點格式相同）
  const items = p.items.map((item, idx) => ({
    ItemSeq:     idx + 1,
    ItemName:    item.name.slice(0, 50),
    ItemCount:   item.qty,
    ItemWord:    item.unit ?? "式",
    ItemPrice:   item.unitPrice,
    ItemTaxType: item.taxType ?? "1",
    ItemAmount:  item.amount,
  }));

  // ── 共用欄位 ───────────────────────────────────────────────────────────────
  const common: Record<string, unknown> = {
    MerchantID:          cfg.merchantId,
    RelateNumber:        p.relateNumber,
    CustomerID:          p.customerId ?? "",
    CustomerName:        p.buyerName.slice(0, 60),
    CustomerAddr:        p.buyerAddr ?? "",
    CustomerPhone:       p.buyerPhone ?? "",
    CustomerEmail:       (p.buyerEmail ?? "").slice(0, 200),
    TaxType:             p.taxType ?? "1",
    SalesAmount:         p.totalAmount,
    InvoiceRemark:       (p.remark ?? "").slice(0, 200),
    InvType:             p.invType ?? "07",
    vat:                 p.vat ?? "1",
    Items:               items,
  };

  let dataObj: Record<string, unknown>;

  if (isB2B) {
    // ── B2B 三聯式發票 ──────────────────────────────────────────────────────
    // CustomerIdentifier 必填（7碼統一編號）
    // Print 固定 "1"（三聯式紙本印刷）
    // Donation 固定 "0"（不捐贈）
    // CarruerType 固定 ""（無載具）
    dataObj = {
      ...common,
      CustomerIdentifier: p.buyerTaxId!,
      Print:              "1",
      Donation:           "0",
      LoveCode:           "",
      CarruerType:        "",
      CarruerNum:         "",
    };
  } else {
    // ── B2C 二聯式發票 ──────────────────────────────────────────────────────
    // CustomerIdentifier 固定空字串
    const hasDonation  = p.donation === "1" && !!p.loveCode;
    const hasCarruer   = !!p.carruerType;
    dataObj = {
      ...common,
      CustomerIdentifier: "",
      Print:              hasCarruer || hasDonation ? "0" : (p.print ?? "0"),
      Donation:           hasDonation ? "1" : "0",
      LoveCode:           hasDonation ? (p.loveCode ?? "") : "",
      CarruerType:        hasDonation ? "" : (p.carruerType ?? ""),
      CarruerNum:         hasDonation ? "" : (p.carruerNum  ?? ""),
    };
  }

  // ── 呼叫 API ───────────────────────────────────────────────────────────────
  const { result } = await ecpayCall<{
    RtnCode:       number;
    RtnMsg:        string;
    InvoiceNo:     string;
    InvoiceDate:   string;
    RandomNumber:  string;
    QRCode_Left?:  string;
    QRCode_Right?: string;
  }>(endpoint, dataObj, cfg);

  if (result.RtnCode !== 1) {
    throw new Error(`[invoiceProvider] ECPay RtnCode ${result.RtnCode}: ${result.RtnMsg}`);
  }

  return {
    provider:     "ecpay",
    invoiceNo:    result.InvoiceNo,
    randomNo:     result.RandomNumber,
    invoiceDate:  result.InvoiceDate,
    qrCodeLeft:   result.QRCode_Left,
    qrCodeRight:  result.QRCode_Right,
    totalAmount:  p.totalAmount,
    relateNumber: p.relateNumber,
    raw:          result,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: 開立發票
// ─────────────────────────────────────────────────────────────────────────────
export async function issueInvoice(params: IssueInvoiceParams): Promise<InvoiceResult> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();
  return provider === "ecpay" ? issueEcpay(params) : issueMock(params);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: 作廢發票（POST /Invoice/Invalid）
// ─────────────────────────────────────────────────────────────────────────────
export async function voidInvoice(params: VoidInvoiceParams): Promise<{ ok: boolean; invoiceNo?: string; raw?: unknown }> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();

  if (provider !== "ecpay") {
    console.log(`[invoiceProvider] mock void: ${params.invoiceNo}`);
    return { ok: true, invoiceNo: params.invoiceNo };
  }

  const cfg = getEcpayConfig();
  const dataObj = {
    MerchantID:  cfg.merchantId,
    InvoiceNo:   params.invoiceNo,
    InvoiceDate: params.invoiceDate,          // YYYY-MM-DD HH:mm:ss
    Reason:      params.reason.slice(0, 20),  // 最長 20 字
  };

  const { result } = await ecpayCall<{
    RtnCode:   number;
    RtnMsg:    string;
    InvoiceNo: string;
  }>("/Invoice/Invalid", dataObj, cfg);

  if (result.RtnCode !== 1) {
    return { ok: false, invoiceNo: result.InvoiceNo, raw: result };
  }
  return { ok: true, invoiceNo: result.InvoiceNo, raw: result };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: 折讓發票（POST /B2CInvoice/Allowance 或 /B2BInvoice/Allowance）
// ─────────────────────────────────────────────────────────────────────────────
export async function allowanceInvoice(params: AllowanceParams): Promise<AllowanceResult> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();

  if (provider !== "ecpay") {
    const mockNo = `IA${Date.now().toString().slice(-8)}`;
    console.log(`[invoiceProvider] mock allowance: ${params.invoiceNo} → ${mockNo} amt=${params.allowanceAmount}`);
    return { ok: true, allowanceNo: mockNo, allowanceDate: todayYMD() };
  }

  const cfg     = getEcpayConfig();
  const isB2B   = !!params.buyerIdentifier;
  const endpoint = isB2B ? "/B2BInvoice/Allowance" : "/B2CInvoice/Allowance";

  const allNotify = params.allNotify ?? (params.notifyEmail ? "E" : "N");

  // 品項陣列（至少一項必填）
  const items = params.items.map((item, idx) => ({
    ItemSeq:     idx + 1,
    ItemName:    item.name.slice(0, 50),
    ItemCount:   item.qty,
    ItemWord:    item.unit ?? "式",
    ItemPrice:   item.price,
    ItemTaxType: item.taxType ?? "1",
    ItemAmount:  item.amount,
    ItemRemark:  item.remark ?? "",
  }));

  const dataObj: Record<string, unknown> = {
    MerchantID:      cfg.merchantId,
    InvoiceNo:       params.invoiceNo,
    InvoiceDate:     params.invoiceDate,    // YYYY-MM-DD HH:mm:ss
    AllowanceNotify: allNotify,             // E / S / N
    CustomerName:    (params.customerName ?? "").slice(0, 60),
    NotifyMail:      allNotify === "E" ? (params.notifyEmail ?? "") : "",
    NotifyPhone:     allNotify === "S" ? (params.notifyPhone ?? "") : "",
    AllowanceAmount: params.allowanceAmount,
    Items:           items,
    ...(isB2B && { BuyerIdentifier: params.buyerIdentifier }),
  };

  const { result } = await ecpayCall<{
    RtnCode:                      number;
    RtnMsg:                       string;
    IA_No:                        string;
    IA_Date:                      string;
    IA_Remain_Allowance_Amount:   number;
  }>(endpoint, dataObj, cfg);

  if (result.RtnCode !== 1) {
    return { ok: false, raw: result };
  }
  return {
    ok:            true,
    allowanceNo:   result.IA_No,
    allowanceDate: result.IA_Date,
    remainAmount:  result.IA_Remain_Allowance_Amount,
    raw:           result,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: 查詢發票（POST /B2CInvoice/GetIssue 或 /B2BInvoice/GetIssue）
// ─────────────────────────────────────────────────────────────────────────────
export async function queryInvoice(params: QueryInvoiceParams): Promise<QueryInvoiceResult> {
  const provider = (process.env.INVOICE_PROVIDER ?? "mock").toLowerCase();

  if (provider !== "ecpay") {
    // mock 模式：回傳不存在（查詢由 DB 負責）
    return { found: false };
  }

  const cfg      = getEcpayConfig();
  const endpoint = params.isB2B ? "/B2BInvoice/GetIssue" : "/B2CInvoice/GetIssue";
  const dataObj  = {
    MerchantID:   cfg.merchantId,
    RelateNumber: params.relateNumber,
  };

  const { result } = await ecpayCall<{
    RtnCode:               number;
    RtnMsg:                string;
    IIS_Number:            string;
    IIS_Create_Date:       string;
    IIS_Random_Number:     string;
    IIS_Sales_Amount:      number;
    IIS_Tax_Amount:        number;
    IIS_Tax_Type:          string;
    IIS_Tax_Rate:          number;
    IIS_Check_Number:      string;
    IIS_Carrier_Type:      string;
    IIS_Carrier_Num:       string;
    IIS_Invalid_Status:    string;   // "0"=有效 "1"=已作廢
    IIS_Customer_Name:     string;
    IIS_Customer_Email:    string;
    IIS_Customer_Identifier: string;
  }>(endpoint, dataObj, cfg);

  if (result.RtnCode !== 1) {
    return { found: false, raw: result };
  }

  return {
    found:         true,
    invoiceNo:     result.IIS_Number,
    invoiceDate:   result.IIS_Create_Date,
    randomNumber:  result.IIS_Random_Number,
    salesAmount:   result.IIS_Sales_Amount,
    taxAmount:     result.IIS_Tax_Amount,
    taxType:       result.IIS_Tax_Type,
    taxRate:       result.IIS_Tax_Rate,
    checkNumber:   result.IIS_Check_Number,
    carruerType:   result.IIS_Carrier_Type,
    carruerNum:    result.IIS_Carrier_Num,
    isInvalid:     result.IIS_Invalid_Status === "1",
    customerName:  result.IIS_Customer_Name,
    customerEmail: result.IIS_Customer_Email,
    buyerTaxId:    result.IIS_Customer_Identifier,
    raw:           result,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public: 驗證 Webhook 回調簽章（CheckCode）
//
//  綠界 CheckCode 計算（開立/作廢 事件）：
//    1. 組合字串：HashKey=xxx&IIS_Mer_ID=xxx&IIS_Number=xxx&IIS_Random_Number=xxx&IIS_Sales_Amount=xxx&HashIV=xxx
//    2. 轉大寫 → SHA256 → 轉大寫
//    3. 與 payload.CheckCode 比對
// ─────────────────────────────────────────────────────────────────────────────
export function verifyWebhookCheckCode(payload: {
  IIS_Mer_ID:       string;
  IIS_Number:       string;
  IIS_Random_Number: string;
  IIS_Sales_Amount: number | string;
  CheckCode:        string;
}): boolean {
  const hashKey = process.env.INVOICE_HASH_KEY ?? "";
  const hashIv  = process.env.INVOICE_HASH_IV  ?? "";

  const raw = [
    `HashKey=${hashKey}`,
    `IIS_Mer_ID=${payload.IIS_Mer_ID}`,
    `IIS_Number=${payload.IIS_Number}`,
    `IIS_Random_Number=${payload.IIS_Random_Number}`,
    `IIS_Sales_Amount=${payload.IIS_Sales_Amount}`,
    `HashIV=${hashIv}`,
  ].join("&").toUpperCase();

  const computed = crypto.createHash("sha256").update(raw, "utf8").digest("hex").toUpperCase();
  return computed === payload.CheckCode?.toUpperCase();
}

/**
 * Decrypt ECPay webhook Data field
 * 用於 ecpayWebhook.ts 解密 POST body 中的 Data 欄位
 */
export function decryptWebhookData(encodedData: string): EcpayInvoiceWebhookPayload | null {
  const hashKey = process.env.INVOICE_HASH_KEY ?? "";
  const hashIv  = process.env.INVOICE_HASH_IV  ?? "";
  if (!hashKey || !hashIv) return null;
  try {
    const decrypted = aesDecrypt(decodeURIComponent(encodedData), hashKey, hashIv);
    return JSON.parse(decrypted) as EcpayInvoiceWebhookPayload;
  } catch {
    return null;
  }
}
