import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import ExcelJS from "exceljs";

export const customerManagementRouter = Router();

// ─── DB Migration: add new columns if absent ──────────────────────────────────

async function ensureCustomerColumns() {
  const queries = [
    sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_title TEXT`,
    sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_address TEXT`,
    sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS factory_address TEXT`,
  ];
  for (const query of queries) {
    try {
      await db.execute(query);
    } catch { /* ignore */ }
  }
}
ensureCustomerColumns().catch(console.error);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRICE_LEVEL_LABELS: Record<string, string> = {
  standard: "標準",
  vip: "VIP",
  enterprise: "企業",
  custom: "自訂",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  cash: "現金",
  monthly: "月結",
  transfer: "銀行轉帳",
};

async function getCustomerStats(customerId: number) {
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) AS total_orders,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_orders,
      COUNT(CASE WHEN status NOT IN ('completed','cancelled') THEN 1 END) AS active_orders,
      COALESCE(SUM(CASE WHEN total_fee IS NOT NULL THEN total_fee ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN fee_status = 'unpaid' AND status = 'completed' THEN COALESCE(total_fee,0) ELSE 0 END), 0) AS outstanding_amount,
      COALESCE(SUM(CASE WHEN fee_status = 'paid' THEN COALESCE(total_fee,0) ELSE 0 END), 0) AS paid_amount,
      MAX(created_at) AS last_order_at
    FROM orders
    WHERE customer_phone = (SELECT phone FROM customers WHERE id = ${customerId})
       OR enterprise_id = ${customerId}
  `);
  return stats.rows[0] as any;
}

// ─── GET /api/customers/extended ──────────────────────────────────────────────

customerManagementRouter.get("/customers/extended", async (_req, res) => {
  try {
    const customers = await db.execute(sql`
      SELECT c.*,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(o.total_fee), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN o.fee_status = 'unpaid' AND o.status = 'completed' THEN COALESCE(o.total_fee,0) ELSE 0 END), 0) AS outstanding_amount,
        MAX(o.created_at) AS last_order_at
      FROM customers c
      LEFT JOIN orders o ON o.customer_phone = c.phone OR o.enterprise_id = c.id
      GROUP BY c.id
      ORDER BY c.is_blacklisted ASC, c.is_vip DESC, c.name ASC
    `);
    return res.json(customers.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/:id/details ───────────────────────────────────────────

customerManagementRouter.get("/customers/:id/details", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [customer] = (await db.execute(sql`SELECT * FROM customers WHERE id = ${id}`)).rows;
    if (!customer) return res.status(404).json({ error: "Not found" });

    const addresses = await db.execute(sql`SELECT * FROM customer_addresses WHERE customer_id = ${id} ORDER BY is_default DESC, created_at`);
    const stats = await getCustomerStats(id);
    const blacklistHistory = await db.execute(sql`SELECT * FROM customer_blacklist WHERE customer_id = ${id} ORDER BY created_at DESC LIMIT 5`);

    return res.json({ ...customer, addresses: addresses.rows, stats, blacklistHistory: blacklistHistory.rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/customers/:id/profile ───────────────────────────────────────────

customerManagementRouter.put("/customers/:id/profile", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      name: z.string().optional(),
      shortName: z.string().optional(),
      phone: z.string().optional(),
      taxId: z.string().optional(),
      contactPerson: z.string().optional(),
      address: z.string().optional(),
      postalCode: z.string().optional(),
      email: z.string().optional(),
      companyType: z.string().optional(),
      industry: z.string().optional(),
      paymentType: z.enum(["cash", "monthly", "transfer", "check", "cod", "credit_card", "eft"]).optional(),
      creditLimit: z.coerce.number().optional(),
      priceLevel: z.enum(["standard", "vip", "enterprise", "custom"]).optional(),
      discountPct: z.coerce.number().min(0).max(100).optional(),
      isVip: z.boolean().optional(),
      monthlyStatementDay: z.coerce.number().min(1).max(31).optional(),
      notes: z.string().optional(),
      invoiceTitle: z.string().optional(),
      companyAddress: z.string().optional(),
      factoryAddress: z.string().optional(),
      creditDays: z.coerce.number().min(0).optional(),
    });
    const data = schema.parse(req.body);
    await db.execute(sql`
      UPDATE customers SET
        name = COALESCE(${data.name ?? null}, name),
        short_name = ${data.shortName !== undefined ? (data.shortName || null) : sql`short_name`},
        phone = COALESCE(${data.phone ?? null}, phone),
        tax_id = ${data.taxId !== undefined ? (data.taxId || null) : sql`tax_id`},
        contact_person = ${data.contactPerson !== undefined ? (data.contactPerson || null) : sql`contact_person`},
        address = ${data.address !== undefined ? (data.address || null) : sql`address`},
        postal_code = ${data.postalCode !== undefined ? (data.postalCode || null) : sql`postal_code`},
        email = ${data.email !== undefined ? (data.email || null) : sql`email`},
        company_type = COALESCE(${data.companyType ?? null}, company_type),
        industry = ${data.industry !== undefined ? (data.industry || null) : sql`industry`},
        payment_type = COALESCE(${data.paymentType ?? null}, payment_type),
        credit_limit = COALESCE(${data.creditLimit ?? null}, credit_limit),
        price_level = COALESCE(${data.priceLevel ?? null}, price_level),
        discount_pct = COALESCE(${data.discountPct ?? null}, discount_pct),
        is_vip = COALESCE(${data.isVip ?? null}, is_vip),
        monthly_statement_day = COALESCE(${data.monthlyStatementDay ?? null}, monthly_statement_day),
        notes = ${data.notes !== undefined ? (data.notes || null) : sql`notes`},
        invoice_title = ${data.invoiceTitle !== undefined ? (data.invoiceTitle || null) : sql`invoice_title`},
        company_address = ${data.companyAddress !== undefined ? (data.companyAddress || null) : sql`company_address`},
        factory_address = ${data.factoryAddress !== undefined ? (data.factoryAddress || null) : sql`factory_address`},
        credit_days = ${data.creditDays !== undefined ? data.creditDays : sql`credit_days`}
      WHERE id = ${id}
    `);
    const updated = (await db.execute(sql`SELECT * FROM customers WHERE id = ${id}`)).rows[0];
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/customers/:id/blacklist ─────────────────────────────────────────

customerManagementRouter.put("/customers/:id/blacklist", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({ reason: z.string().optional(), lift: z.boolean().optional() });
    const data = schema.parse(req.body);
    if (data.lift) {
      await db.execute(sql`UPDATE customers SET is_blacklisted = FALSE, blacklist_reason = NULL WHERE id = ${id}`);
      await db.execute(sql`UPDATE customer_blacklist SET lifted_at = NOW(), lifted_by = 'admin' WHERE customer_id = ${id} AND lifted_at IS NULL`);
      return res.json({ success: true, action: "lifted" });
    }
    if (!data.reason) return res.status(400).json({ error: "原因為必填" });
    await db.execute(sql`UPDATE customers SET is_blacklisted = TRUE, blacklist_reason = ${data.reason} WHERE id = ${id}`);
    await db.execute(sql`INSERT INTO customer_blacklist (customer_id, reason) VALUES (${id}, ${data.reason})`);
    return res.json({ success: true, action: "blacklisted" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/:id/addresses ─────────────────────────────────────────

customerManagementRouter.get("/customers/:id/addresses", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const rows = await db.execute(sql`SELECT * FROM customer_addresses WHERE customer_id = ${id} ORDER BY is_default DESC, created_at`);
    return res.json(rows.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── POST /api/customers/:id/addresses ────────────────────────────────────────

customerManagementRouter.post("/customers/:id/addresses", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({
      label: z.string().min(1),
      address: z.string().min(1),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
      addressType: z.enum(["pickup", "delivery", "both"]).default("both"),
      isDefault: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    if (data.isDefault) {
      await db.execute(sql`UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = ${id}`);
    }
    const result = await db.execute(sql`
      INSERT INTO customer_addresses (customer_id, label, address, contact_name, contact_phone, address_type, is_default)
      VALUES (${id}, ${data.label}, ${data.address}, ${data.contactName ?? null}, ${data.contactPhone ?? null}, ${data.addressType}, ${data.isDefault ?? false})
      RETURNING *
    `);
    return res.status(201).json(result.rows[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── PUT /api/customers/addresses/:addressId ───────────────────────────────────

customerManagementRouter.put("/customers/addresses/:addressId", async (req, res) => {
  try {
    const addressId = parseInt(req.params.addressId, 10);
    const schema = z.object({
      label: z.string().optional(),
      address: z.string().optional(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
      addressType: z.string().optional(),
      isDefault: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    if (data.isDefault) {
      const addr = (await db.execute(sql`SELECT customer_id FROM customer_addresses WHERE id = ${addressId}`)).rows[0] as any;
      if (addr) await db.execute(sql`UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = ${addr.customer_id}`);
    }
    await db.execute(sql`
      UPDATE customer_addresses SET
        label = COALESCE(${data.label ?? null}, label),
        address = COALESCE(${data.address ?? null}, address),
        contact_name = COALESCE(${data.contactName ?? null}, contact_name),
        contact_phone = COALESCE(${data.contactPhone ?? null}, contact_phone),
        address_type = COALESCE(${data.addressType ?? null}, address_type),
        is_default = COALESCE(${data.isDefault ?? null}, is_default)
      WHERE id = ${addressId}
    `);
    const updated = (await db.execute(sql`SELECT * FROM customer_addresses WHERE id = ${addressId}`)).rows[0];
    return res.json(updated);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// ─── DELETE /api/customers/addresses/:addressId ────────────────────────────────

customerManagementRouter.delete("/customers/addresses/:addressId", async (req, res) => {
  try {
    const addressId = parseInt(req.params.addressId, 10);
    await db.execute(sql`DELETE FROM customer_addresses WHERE id = ${addressId}`);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── GET /api/customers/:id/statement ─────────────────────────────────────────

customerManagementRouter.get("/customers/:id/statement", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { startDate, endDate } = req.query as Record<string, string>;
    const customer = (await db.execute(sql`SELECT * FROM customers WHERE id = ${id}`)).rows[0] as any;
    if (!customer) return res.status(404).json({ error: "Not found" });

    let q = sql`
      SELECT o.id, o.created_at, o.pickup_address, o.delivery_address, o.pickup_date,
             o.delivery_date, o.cargo_description, o.total_fee, o.base_price, o.extra_fee,
             o.fee_status, o.status, o.payment_note,
             d.name AS driver_name
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE (o.customer_phone = ${customer.phone} OR o.enterprise_id = ${id})
    `;
    if (startDate) q = sql`${q} AND o.created_at >= ${startDate}::timestamp`;
    if (endDate) q = sql`${q} AND o.created_at <= (${endDate}::timestamp + interval '1 day')`;
    q = sql`${q} ORDER BY o.created_at DESC`;

    const orders = (await db.execute(q)).rows as any[];
    const summary = {
      totalOrders: orders.length,
      totalAmount: orders.reduce((s, o) => s + (parseFloat(o.total_fee) || 0), 0),
      paidAmount: orders.filter(o => o.fee_status === "paid").reduce((s, o) => s + (parseFloat(o.total_fee) || 0), 0),
      unpaidAmount: orders.filter(o => o.fee_status === "unpaid" && o.status === "completed").reduce((s, o) => s + (parseFloat(o.total_fee) || 0), 0),
      completedOrders: orders.filter(o => o.status === "completed").length,
    };
    return res.json({ customer, orders, summary });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/:id/statement/export ──────────────────────────────────

customerManagementRouter.get("/customers/:id/statement/export", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { startDate, endDate } = req.query as Record<string, string>;
    const customer = (await db.execute(sql`SELECT * FROM customers WHERE id = ${id}`)).rows[0] as any;
    if (!customer) return res.status(404).json({ error: "Not found" });

    let q = sql`
      SELECT o.id, o.created_at, o.pickup_address, o.delivery_address, o.pickup_date, o.delivery_date,
             o.cargo_description, o.cargo_quantity, o.total_fee, o.base_price, o.extra_fee,
             o.fee_status, o.status, d.name AS driver_name
      FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE (o.customer_phone = ${customer.phone} OR o.enterprise_id = ${id})
    `;
    if (startDate) q = sql`${q} AND o.created_at >= ${startDate}::timestamp`;
    if (endDate) q = sql`${q} AND o.created_at <= (${endDate}::timestamp + interval '1 day')`;
    q = sql`${q} ORDER BY o.created_at`;
    const orders = (await db.execute(q)).rows as any[];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "富詠運輸管理系統";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("對帳報表");

    // Title
    sheet.mergeCells("A1:L1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `${customer.name} 對帳報表`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center" };

    sheet.mergeCells("A2:L2");
    const subCell = sheet.getCell("A2");
    subCell.value = `統編：${customer.tax_id ?? "—"}　聯絡人：${customer.contact_person ?? "—"}　電話：${customer.phone}　付款方式：${PAYMENT_TYPE_LABELS[customer.payment_type] ?? customer.payment_type}`;
    subCell.font = { size: 10 };
    subCell.alignment = { horizontal: "center" };

    sheet.addRow([]);

    // Headers
    const headerRow = sheet.addRow([
      "訂單編號", "建立日期", "取貨日期", "取貨地址", "送達地址",
      "貨物說明", "數量", "司機", "基本費", "額外費", "總費用", "付款狀態",
    ]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    headerRow.alignment = { horizontal: "center" };

    // Column widths
    sheet.columns = [
      { key: "id", width: 10 }, { key: "created", width: 15 },
      { key: "pickup_date", width: 12 }, { key: "pickup", width: 25 },
      { key: "delivery", width: 25 }, { key: "cargo", width: 20 },
      { key: "qty", width: 8 }, { key: "driver", width: 10 },
      { key: "base", width: 12 }, { key: "extra", width: 12 },
      { key: "total", width: 12 }, { key: "status", width: 10 },
    ];

    let totalFee = 0, totalPaid = 0, totalUnpaid = 0;

    for (const o of orders) {
      const fee = parseFloat(o.total_fee) || 0;
      const base = parseFloat(o.base_price) || 0;
      const extra = parseFloat(o.extra_fee) || 0;
      const paid = o.fee_status === "paid";
      totalFee += fee;
      if (paid) totalPaid += fee; else totalUnpaid += fee;

      const row = sheet.addRow([
        `#${o.id}`,
        o.created_at ? new Date(o.created_at).toLocaleDateString("zh-TW") : "—",
        o.pickup_date ?? "—",
        o.pickup_address ?? "—",
        o.delivery_address ?? "—",
        o.cargo_description ?? "—",
        o.cargo_quantity ?? "—",
        o.driver_name ?? "未分配",
        base || "—", extra || "—", fee || "—",
        paid ? "已付款" : o.status === "completed" ? "待收款" : "未結",
      ]);
      if (paid) row.getCell(12).font = { color: { argb: "FF27AE60" } };
      else if (o.status === "completed") row.getCell(12).font = { color: { argb: "FFE74C3C" } };
    }

    // Summary
    sheet.addRow([]);
    const sumRow = sheet.addRow(["", "", "", "", "", "", "", "合計", "", "", totalFee, ""]);
    sumRow.font = { bold: true };
    sumRow.getCell(11).numFmt = "#,##0";
    sheet.addRow(["", "", "", "", "", "", "", "已付款", "", "", totalPaid, ""]);
    const unpaidRow = sheet.addRow(["", "", "", "", "", "", "", "未付款", "", "", totalUnpaid, ""]);
    unpaidRow.getCell(11).font = { color: { argb: "FFE74C3C" }, bold: true };

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const periodStr = startDate && endDate ? `_${startDate}_to_${endDate}` : "";
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(customer.name + "_對帳單" + periodStr + ".xlsx")}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/statement/all/export ──────────────────────────────────

customerManagementRouter.get("/customers/statement/all/export", async (req, res) => {
  try {
    const { startDate, endDate, paymentType } = req.query as Record<string, string>;

    let custQ = sql`SELECT * FROM customers WHERE is_blacklisted = FALSE`;
    if (paymentType) custQ = sql`${custQ} AND payment_type = ${paymentType}`;
    custQ = sql`${custQ} ORDER BY name`;
    const customers = (await db.execute(custQ)).rows as any[];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "富詠運輸管理系統";

    // Summary sheet
    const summarySheet = workbook.addWorksheet("總覽");
    summarySheet.mergeCells("A1:G1");
    const t = summarySheet.getCell("A1");
    t.value = "客戶對帳總覽";
    t.font = { bold: true, size: 16 };
    t.alignment = { horizontal: "center" };
    summarySheet.addRow([]);
    const hdr = summarySheet.addRow(["客戶名稱", "統編", "付款方式", "價格等級", "訂單數", "總金額", "未付款"]);
    hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    summarySheet.columns = [
      { key: "name", width: 25 }, { key: "tax", width: 12 }, { key: "pay", width: 10 },
      { key: "level", width: 10 }, { key: "count", width: 8 }, { key: "total", width: 15 }, { key: "unpaid", width: 15 },
    ];

    for (const c of customers) {
      let oQ = sql`SELECT total_fee, fee_status, status FROM orders WHERE (customer_phone = ${c.phone} OR enterprise_id = ${c.id})`;
      if (startDate) oQ = sql`${oQ} AND created_at >= ${startDate}::timestamp`;
      if (endDate) oQ = sql`${oQ} AND created_at <= (${endDate}::timestamp + interval '1 day')`;
      const orders = (await db.execute(oQ)).rows as any[];
      const total = orders.reduce((s: number, o: any) => s + (parseFloat(o.total_fee) || 0), 0);
      const unpaid = orders.filter((o: any) => o.fee_status === "unpaid" && o.status === "completed").reduce((s: number, o: any) => s + (parseFloat(o.total_fee) || 0), 0);
      const row = summarySheet.addRow([
        c.name, c.tax_id ?? "—",
        PAYMENT_TYPE_LABELS[c.payment_type] ?? c.payment_type,
        PRICE_LEVEL_LABELS[c.price_level] ?? c.price_level,
        orders.length, total, unpaid,
      ]);
      if (unpaid > 0) row.getCell(7).font = { color: { argb: "FFE74C3C" }, bold: true };
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const periodStr = startDate && endDate ? `_${startDate}_to_${endDate}` : "";
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("富詠運輸_客戶對帳總覽" + periodStr + ".xlsx")}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/addresses/search?q=keyword ────────────────────────────
// 搜尋所有客戶的常用地址（label、address、客戶名稱）

customerManagementRouter.get("/customers/addresses/search", async (req, res) => {
  try {
    const q = ((req.query as any).q ?? "").toString().trim();
    if (!q) return res.json([]);

    const like = `%${q}%`;
    const rows = await db.execute(sql`
      SELECT
        ca.id,
        ca.label,
        ca.address,
        ca.contact_name,
        ca.contact_phone,
        ca.address_type,
        ca.is_default,
        c.id   AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone
      FROM customer_addresses ca
      JOIN customers c ON c.id = ca.customer_id
      WHERE c.is_active = TRUE
        AND (
          ca.address    ILIKE ${like}
          OR ca.label   ILIKE ${like}
          OR c.name     ILIKE ${like}
          OR c.phone    ILIKE ${like}
        )
      ORDER BY ca.is_default DESC, c.name
      LIMIT 20
    `);

    return res.json(rows.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/customers/:id/orders (quick order history) ──────────────────────

customerManagementRouter.get("/customers/:id/orders", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const customer = (await db.execute(sql`SELECT phone FROM customers WHERE id = ${id}`)).rows[0] as any;
    if (!customer) return res.status(404).json({ error: "Not found" });
    const limit = parseInt((req.query as any).limit ?? "20", 10);
    const orders = await db.execute(sql`
      SELECT o.id, o.created_at, o.pickup_address, o.delivery_address, o.pickup_date,
             o.cargo_description, o.total_fee, o.fee_status, o.status, d.name AS driver_name
      FROM orders o LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.customer_phone = ${customer.phone} OR o.enterprise_id = ${id}
      ORDER BY o.created_at DESC LIMIT ${limit}
    `);
    return res.json(orders.rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
