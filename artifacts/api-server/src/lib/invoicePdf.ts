/**
 * invoicePdf.ts
 * 使用 pdfkit 產生電子發票 / 月結帳單 PDF
 * pdfkit 以 external 方式載入（不被 esbuild 內嵌），在 runtime 從 node_modules 讀取
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require("pdfkit");

const COMPANY_NAME = "富詠運輸有限公司";
const COMPANY_TAX  = "12345678";
const COMPANY_ADDR = "台北市中正區忠孝東路一段1號";
const COMPANY_TEL  = "02-1234-5678";
const BRAND_COLOR  = "#1a3a8f";   // 富詠深藍
const ACCENT_COLOR = "#F97316";   // 橘色強調

function fmtAmt(n: number): string {
  return `NT$ ${Number(n).toLocaleString("zh-TW")}`;
}

function fmtDate(s?: string | Date | null): string {
  if (!s) return new Date().toLocaleDateString("zh-TW");
  const d = typeof s === "string" ? new Date(s) : s;
  return d.toLocaleDateString("zh-TW");
}

// ────────────────────────────────────────────────────────────────────────────
//  電子發票 PDF
// ────────────────────────────────────────────────────────────────────────────
export interface InvoicePdfParams {
  invoiceNumber:  string;
  randomNumber?:  string;
  invoiceDate?:   string;
  provider?:      string;
  buyerName:      string;
  buyerTaxId?:    string;
  amount:         number;
  taxAmount:      number;
  totalAmount:    number;
  items?:         Array<{ description: string; qty: number; unitPrice: number; total: number }>;
  invoiceType?:   string;
  notes?:         string;
  qrCodeLeft?:    string;
  qrCodeRight?:   string;
}

export function buildInvoicePdf(params: InvoicePdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595 - 100; // usable width
    let y = 50;

    // ── 頁首：公司資訊 + 標題 ─────────────────────────────────────────────
    doc.rect(50, y, W, 60).fill(BRAND_COLOR);
    doc.fill("white").fontSize(18).font("Helvetica-Bold")
       .text(COMPANY_NAME, 60, y + 10, { width: W - 120 });
    doc.fontSize(9).font("Helvetica")
       .text(`統編: ${COMPANY_TAX}　電話: ${COMPANY_TEL}`, 60, y + 32)
       .text(COMPANY_ADDR, 60, y + 44);
    // 右上：發票標題
    doc.fontSize(20).font("Helvetica-Bold")
       .text("電子發票", W - 40, y + 12, { align: "right" });
    y += 70;

    // ── 發票號碼 + 日期 ──────────────────────────────────────────────────
    doc.fill(ACCENT_COLOR).fontSize(14).font("Helvetica-Bold")
       .text(params.invoiceNumber, 50, y);
    doc.fill("#555").fontSize(9).font("Helvetica")
       .text(`日期: ${fmtDate(params.invoiceDate)}　隨機碼: ${params.randomNumber ?? "—"}　供應商: ${params.provider ?? "mock"}`,
             50, y + 18);
    y += 40;

    // ── 買受人 ────────────────────────────────────────────────────────────
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 6;
    doc.fill(BRAND_COLOR).fontSize(10).font("Helvetica-Bold").text("買受人資訊", 50, y);
    y += 16;
    doc.fill("#222").fontSize(10).font("Helvetica")
       .text(`名稱: ${params.buyerName}`, 50, y);
    if (params.buyerTaxId) {
      doc.text(`統一編號: ${params.buyerTaxId}`, 280, y);
    }
    y += 14;
    doc.text(`發票類別: ${params.invoiceType === "b2b" ? "三聯式（B2B）" : "二聯式（收據）"}`, 50, y);
    y += 20;

    // ── 品項表格 ─────────────────────────────────────────────────────────
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 6;
    // Header
    doc.fill("white").rect(50, y, W, 20).fill(BRAND_COLOR);
    doc.fill("white").fontSize(9).font("Helvetica-Bold")
       .text("品項說明",     55, y + 5)
       .text("數量",        360, y + 5, { width: 40, align: "right" })
       .text("單價",        410, y + 5, { width: 60, align: "right" })
       .text("小計",        478, y + 5, { width: 60, align: "right" });
    y += 22;

    const items = params.items ?? [{ description: "物流運送服務", qty: 1, unitPrice: params.amount, total: params.amount }];
    items.forEach((item, i) => {
      if (i % 2 === 0) doc.rect(50, y - 2, W, 16).fill("#f8fafc");
      doc.fill("#222").fontSize(9).font("Helvetica")
         .text(item.description.slice(0, 50), 55, y)
         .text(String(item.qty),  360, y, { width: 40, align: "right" })
         .text(fmtAmt(item.unitPrice), 410, y, { width: 60, align: "right" })
         .text(fmtAmt(item.total),     478, y, { width: 60, align: "right" });
      y += 16;
    });
    y += 4;
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 8;

    // ── 金額小計 ─────────────────────────────────────────────────────────
    const labelX = 400, valueX = 478;
    doc.fill("#555").fontSize(9)
       .text("稅前金額:",  labelX, y)
       .text(fmtAmt(params.amount), valueX, y, { width: 60, align: "right" });
    y += 14;
    doc.text("稅額 (5%):", labelX, y)
       .text(fmtAmt(params.taxAmount), valueX, y, { width: 60, align: "right" });
    y += 6;
    doc.rect(400, y, 138, 1).fill("#ccc"); y += 6;
    doc.fill(BRAND_COLOR).fontSize(11).font("Helvetica-Bold")
       .text("合　計:",    labelX, y)
       .text(fmtAmt(params.totalAmount), valueX, y, { width: 60, align: "right" });
    y += 22;

    // ── QR Code 文字（實際 QR 需要 qrcode 套件，此處顯示文字） ──────────
    if (params.qrCodeLeft || params.qrCodeRight) {
      doc.rect(50, y, W, 1).fill("#dde1e7"); y += 8;
      doc.fill("#555").fontSize(8).font("Helvetica")
         .text("QR Code（左）: " + (params.qrCodeLeft  ?? "—"), 50, y);
      y += 12;
      doc.text("QR Code（右）: " + (params.qrCodeRight ?? "—"), 50, y);
      y += 16;
    }

    // ── 備註 ─────────────────────────────────────────────────────────────
    if (params.notes) {
      doc.fill("#888").fontSize(8).font("Helvetica")
         .text(`備註: ${params.notes}`, 50, y, { width: W });
      y += 14;
    }

    // ── 頁尾 ─────────────────────────────────────────────────────────────
    doc.rect(50, 780, W, 1).fill("#dde1e7");
    doc.fill("#aaa").fontSize(7)
       .text(`本發票由 ${COMPANY_NAME} 開立，如有疑問請來電 ${COMPANY_TEL}`, 50, 786, { align: "center", width: W });

    doc.end();
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  月結帳單 PDF
// ────────────────────────────────────────────────────────────────────────────
export interface MonthlyBillPdfParams {
  billId:       number;
  enterpriseName?: string;
  customerName?:   string;
  periodYear:   number;
  periodMonth:  number;
  totalAmount:  number;
  orderCount:   number;
  status:       string;
  invoiceNumber?:  string;
  orders: Array<{
    order_no?:          string;
    id:                 number;
    customer_name?:     string;
    cargo_description?: string;
    total_fee?:         number;
    base_price?:        number;
    completed_at?:      string;
  }>;
}

export function buildMonthlyBillPdf(params: MonthlyBillPdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595 - 100;
    let y = 50;

    const buyerName = params.enterpriseName ?? params.customerName ?? "客戶";
    const period    = `${params.periodYear}年${params.periodMonth}月`;

    // ── 頁首 ─────────────────────────────────────────────────────────────
    doc.rect(50, y, W, 60).fill(BRAND_COLOR);
    doc.fill("white").fontSize(16).font("Helvetica-Bold")
       .text(COMPANY_NAME, 60, y + 8, { width: W - 120 });
    doc.fontSize(9).font("Helvetica")
       .text(`統編: ${COMPANY_TAX}　電話: ${COMPANY_TEL}`, 60, y + 28)
       .text(COMPANY_ADDR, 60, y + 40);
    doc.fontSize(14).font("Helvetica-Bold")
       .text("月結帳單", W - 20, y + 16, { align: "right" });
    y += 70;

    // ── 帳單資訊 ──────────────────────────────────────────────────────────
    doc.fill(ACCENT_COLOR).fontSize(13).font("Helvetica-Bold")
       .text(`${period} 帳單　#${params.billId}`, 50, y);
    doc.fill("#555").fontSize(9).font("Helvetica")
       .text(`開立日期: ${fmtDate(new Date())}　狀態: ${params.status}　共 ${params.orderCount} 筆`, 50, y + 16);
    if (params.invoiceNumber) {
      doc.text(`發票號碼: ${params.invoiceNumber}`, 50, y + 28);
    }
    y += 44;

    // ── 買受方 ────────────────────────────────────────────────────────────
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 6;
    doc.fill(BRAND_COLOR).fontSize(10).font("Helvetica-Bold").text("帳單收件方", 50, y);
    y += 14;
    doc.fill("#222").fontSize(10).font("Helvetica")
       .text(`公司名稱: ${buyerName}`, 50, y);
    y += 20;

    // ── 訂單明細 ─────────────────────────────────────────────────────────
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 6;
    doc.fill("white").rect(50, y, W, 20).fill(BRAND_COLOR);
    doc.fill("white").fontSize(9).font("Helvetica-Bold")
       .text("訂單編號",  55, y + 5)
       .text("客戶",     200, y + 5)
       .text("品項",     310, y + 5)
       .text("完成日期", 398, y + 5)
       .text("金額",     478, y + 5, { width: 60, align: "right" });
    y += 22;

    params.orders.forEach((o, i) => {
      // Page break check
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
      if (i % 2 === 0) doc.rect(50, y - 2, W, 16).fill("#f8fafc");
      const amt = Number(o.total_fee ?? o.base_price ?? 0);
      doc.fill("#222").fontSize(8).font("Helvetica")
         .text(o.order_no ?? `#${o.id}`,    55,  y, { width: 130 })
         .text((o.customer_name ?? "—").slice(0, 18), 200, y, { width: 100 })
         .text((o.cargo_description ?? "物流服務").slice(0, 15), 310, y, { width: 80 })
         .text(o.completed_at ? fmtDate(o.completed_at) : "—", 398, y, { width: 70 })
         .text(fmtAmt(amt), 478, y, { width: 60, align: "right" });
      y += 16;
    });

    y += 4;
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 8;

    // ── 合計 ──────────────────────────────────────────────────────────────
    const taxAmt    = Math.round(params.totalAmount / 1.05 * 0.05);
    const preTaxAmt = params.totalAmount - taxAmt;
    doc.fill("#555").fontSize(9)
       .text("稅前金額:", 400, y)
       .text(fmtAmt(preTaxAmt), 478, y, { width: 60, align: "right" });
    y += 14;
    doc.text("稅額 (5%):", 400, y)
       .text(fmtAmt(taxAmt), 478, y, { width: 60, align: "right" });
    y += 6;
    doc.rect(400, y, 138, 1).fill("#ccc"); y += 6;
    doc.fill(BRAND_COLOR).fontSize(12).font("Helvetica-Bold")
       .text("應付合計:", 400, y)
       .text(fmtAmt(params.totalAmount), 478, y, { width: 60, align: "right" });
    y += 26;

    // ── 付款資訊 ─────────────────────────────────────────────────────────
    doc.rect(50, y, W, 1).fill("#dde1e7"); y += 8;
    doc.fill(BRAND_COLOR).fontSize(10).font("Helvetica-Bold").text("付款資訊", 50, y); y += 14;
    doc.fill("#444").fontSize(9).font("Helvetica")
       .text("銀行: 台灣銀行　帳號: 123-456-789　戶名: 富詠運輸有限公司", 50, y);
    y += 12;
    doc.text("請於收到帳單後 30 日內完成匯款，並回傳匯款單據。", 50, y);
    y += 20;

    // ── 頁尾 ─────────────────────────────────────────────────────────────
    doc.rect(50, 780, W, 1).fill("#dde1e7");
    doc.fill("#aaa").fontSize(7)
       .text(`${COMPANY_NAME}　${COMPANY_TEL}　${COMPANY_ADDR}`, 50, 786, { align: "center", width: W });

    doc.end();
  });
}
