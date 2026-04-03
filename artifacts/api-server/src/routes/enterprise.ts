import { Router } from "express";
import multer from "multer";
import {
  db,
  enterpriseAccountsTable,
  enterpriseSavedTemplatesTable,
  enterpriseSubAccountsTable,
  enterpriseNotificationsTable,
  ordersTable,
  vehicleCostsTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql, ne } from "drizzle-orm";
import { createHash } from "crypto";
import ExcelJS from "exceljs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

function hashPassword(pw: string) {
  return createHash("sha256").update(pw + "fuyi_salt_2024").digest("hex");
}

async function createNotification(enterpriseId: number, orderId: number | null, type: string, title: string, body: string) {
  try {
    await db.insert(enterpriseNotificationsTable).values({ enterpriseId, orderId, type, title, body });
  } catch {}
}

/* ─── Auth: Main Login ─────────────────────────── */
router.post("/enterprise/login", async (req, res) => {
  try {
    const { accountCode, password } = req.body as { accountCode: string; password: string };
    if (!accountCode || !password) return res.status(400).json({ error: "帳號和密碼必填" });

    const accountCodeClean = String(accountCode).trim().toUpperCase();

    const [account] = await db
      .select()
      .from(enterpriseAccountsTable)
      .where(sql`UPPER(TRIM(${enterpriseAccountsTable.accountCode})) = ${accountCodeClean}`);

    if (!account) return res.status(401).json({ error: "帳號不存在" });
    if (account.status !== "active") return res.status(403).json({ error: "帳號已停用" });

    const hash = hashPassword(password);
    if (hash !== account.passwordHash) return res.status(401).json({ error: "密碼錯誤" });

    const { passwordHash: _, ...safe } = account;
    res.json({ ok: true, account: safe, subAccount: null });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Auth: Sub-account Login ──────────────────── */
router.post("/enterprise/sub-login", async (req, res) => {
  try {
    const { subCode, password } = req.body as { subCode: string; password: string };
    if (!subCode || !password) return res.status(400).json({ error: "帳號和密碼必填" });

    const [sub] = await db
      .select()
      .from(enterpriseSubAccountsTable)
      .where(eq(enterpriseSubAccountsTable.subCode, subCode));

    if (!sub) return res.status(401).json({ error: "子帳號不存在" });
    if (!sub.isActive) return res.status(403).json({ error: "帳號已停用" });

    const hash = hashPassword(password);
    if (hash !== sub.passwordHash) return res.status(401).json({ error: "密碼錯誤" });

    const [account] = await db
      .select()
      .from(enterpriseAccountsTable)
      .where(eq(enterpriseAccountsTable.id, sub.enterpriseId));

    if (!account || account.status !== "active") return res.status(403).json({ error: "主帳號已停用" });

    const { passwordHash: _, ...safe } = account;
    const { passwordHash: __, ...safeSub } = sub;
    res.json({ ok: true, account: safe, subAccount: safeSub });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Admin: List all enterprise accounts ──────── */
router.get("/enterprise/accounts", async (req, res) => {
  try {
    const accounts = await db.select({
      id: enterpriseAccountsTable.id,
      accountCode: enterpriseAccountsTable.accountCode,
      companyName: enterpriseAccountsTable.companyName,
      contactPerson: enterpriseAccountsTable.contactPerson,
      phone: enterpriseAccountsTable.phone,
      status: enterpriseAccountsTable.status,
      billingType: enterpriseAccountsTable.billingType,
      discountPercent: enterpriseAccountsTable.discountPercent,
      createdAt: enterpriseAccountsTable.createdAt,
    }).from(enterpriseAccountsTable).orderBy(enterpriseAccountsTable.companyName);
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Get account info ─────────────────────────── */
router.get("/enterprise/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [account] = await db
      .select()
      .from(enterpriseAccountsTable)
      .where(eq(enterpriseAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "不存在" });
    const { passwordHash: _, ...safe } = account;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Live Quote ───────────────────────────────── */
router.post("/enterprise/:id/quote", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { vehicleType, estimatedKm } = req.body as { vehicleType?: string; estimatedKm?: number };

    const [account] = await db.select().from(enterpriseAccountsTable).where(eq(enterpriseAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "帳號不存在" });

    const configRows = await db.execute(sql`SELECT key, value FROM pricing_config`);
    const cfg = Object.fromEntries((configRows.rows as { key: string; value: string }[]).map(c => [c.key, parseFloat(c.value ?? "0")]));

    const baseFee = cfg["base_fee"] ?? 500;
    const perKmFee = cfg["per_km_fee"] ?? 25;
    const km = Math.max(1, estimatedKm ?? 10);

    let vehicleSurcharge = 0;
    if (vehicleType) {
      const [vc] = await db.select().from(vehicleCostsTable).where(eq(vehicleCostsTable.vehicleType, vehicleType));
      vehicleSurcharge = vc ? (vc.fuelCost + vc.maintenanceCost) * 0.01 : 0;
    }

    const baseTotal = baseFee + perKmFee * km + vehicleSurcharge;
    const discount = account.discountPercent ?? 0;
    const discountAmount = Math.round(baseTotal * (discount / 100));
    const finalPrice = Math.round(baseTotal - discountAmount);

    res.json({
      basePrice: Math.round(baseTotal),
      discountPercent: discount,
      discountAmount,
      finalPrice,
      estimatedKm: km,
      vehicleType: vehicleType ?? "箱型車",
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Place Order ──────────────────────────────── */
router.post("/enterprise/:id/place-order", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      pickupAddress, deliveryAddress, cargoDescription,
      vehicleType, specialRequirements, totalFee,
      contactName, contactPhone, saveTemplate, templateNickname,
      pickupDate, pickupTime, deliveryDate, deliveryTime,
    } = req.body;

    if (!pickupAddress || !deliveryAddress) return res.status(400).json({ error: "取貨和送貨地址必填" });
    if (!pickupTime) return res.status(400).json({ error: "請填寫取貨時間" });
    if (!deliveryTime) return res.status(400).json({ error: "請填寫下貨時間" });

    const [account] = await db.select().from(enterpriseAccountsTable).where(eq(enterpriseAccountsTable.id, id));
    if (!account) return res.status(404).json({ error: "帳號不存在" });

    const [order] = await db.insert(ordersTable).values({
      pickupAddress,
      pickupDate: pickupDate ?? null,
      pickupTime: pickupTime ?? null,
      deliveryAddress,
      deliveryDate: deliveryDate ?? null,
      deliveryTime: deliveryTime ?? null,
      cargoDescription: cargoDescription ?? "",
      requiredVehicleType: vehicleType,
      specialRequirements,
      customerName: contactName ?? account.contactPerson,
      customerPhone: contactPhone ?? account.phone,
      totalFee: totalFee ?? null,
      enterpriseId: id,
      status: "pending",
    }).returning();

    if (saveTemplate && templateNickname) {
      await db.insert(enterpriseSavedTemplatesTable).values({
        enterpriseId: id,
        nickname: templateNickname,
        pickupAddress,
        deliveryAddress,
        cargoDescription,
        vehicleType,
        specialRequirements,
      }).catch(() => {});
    }

    await createNotification(id, order.id, "order_confirmed",
      "訂單已建立",
      `訂單 #${order.id} 已成功建立，取貨地址：${pickupAddress}，我們將盡快安排司機。`
    );

    res.json({ ok: true, order });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Monthly orders ───────────────────────────── */
router.get("/enterprise/:id/orders", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { year, month, status } = req.query as { year?: string; month?: string; status?: string };

    const now = new Date();
    const y = Number(year ?? now.getFullYear());
    const m = Number(month ?? now.getMonth() + 1);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 1);

    const conditions = [
      eq(ordersTable.enterpriseId, id),
      gte(ordersTable.createdAt, startDate),
      lte(ordersTable.createdAt, endDate),
    ];

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt));

    const filtered = status && status !== "all" ? orders.filter(o => o.status === status) : orders;
    const totalFee = filtered.reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const paid = filtered.filter(o => o.status === "delivered").reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const unpaid = totalFee - paid;

    res.json({ orders: filtered, totalFee, paid, unpaid, orderCount: filtered.length, year: y, month: m });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Cancel Order ─────────────────────────────── */
router.patch("/enterprise/:id/orders/:orderId/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orderId = Number(req.params.orderId);

    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.enterpriseId, id)));

    if (!order) return res.status(404).json({ error: "訂單不存在" });
    if (!["pending"].includes(order.status)) return res.status(400).json({ error: "此訂單已派車，無法取消" });

    await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId));
    await createNotification(id, orderId, "order_cancelled", "訂單已取消", `訂單 #${orderId} 已取消。`);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Monthly summary ──────────────────────────── */
router.get("/enterprise/:id/monthly-summary", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${ordersTable.createdAt})::int`,
        month: sql<number>`EXTRACT(MONTH FROM ${ordersTable.createdAt})::int`,
        count: sql<number>`COUNT(*)::int`,
        total: sql<number>`COALESCE(SUM(${ordersTable.totalFee}),0)::real`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.enterpriseId, id), ne(ordersTable.status, "cancelled")))
      .groupBy(sql`EXTRACT(YEAR FROM ${ordersTable.createdAt})`, sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`)
      .orderBy(desc(sql`EXTRACT(YEAR FROM ${ordersTable.createdAt})`), desc(sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Excel Export ─────────────────────────────── */
router.get("/enterprise/:id/orders/export-excel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { year, month } = req.query as { year?: string; month?: string };
    const now = new Date();
    const y = Number(year ?? now.getFullYear());
    const m = Number(month ?? now.getMonth() + 1);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 1);

    const [account] = await db.select().from(enterpriseAccountsTable).where(eq(enterpriseAccountsTable.id, id));

    const orders = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.enterpriseId, id), gte(ordersTable.createdAt, startDate), lte(ordersTable.createdAt, endDate)))
      .orderBy(desc(ordersTable.createdAt));

    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸";
    const ws = wb.addWorksheet(`${y}年${m}月對帳單`);

    ws.mergeCells("A1:H1");
    ws.getCell("A1").value = `${account?.companyName ?? ""} — ${y}年${m}月對帳單`;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A1").alignment = { horizontal: "center" };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2D6E" } };
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };

    ws.addRow([]);

    const infoRow = ws.addRow([`統一編號：${account?.taxId ?? ""}`, "", `聯絡人：${account?.contactPerson ?? ""}`, "", `電話：${account?.phone ?? ""}`, "", `付款方式：${account?.billingType === "monthly" ? "月結" : "預付"}`, ""]);
    ws.mergeCells(`A${infoRow.number}:B${infoRow.number}`);
    ws.mergeCells(`C${infoRow.number}:D${infoRow.number}`);
    ws.mergeCells(`E${infoRow.number}:F${infoRow.number}`);
    ws.mergeCells(`G${infoRow.number}:H${infoRow.number}`);

    ws.addRow([]);

    const headerRow = ws.addRow(["訂單編號", "日期", "取貨地址", "送貨地址", "貨品說明", "車型", "狀態", "費用(NTD)"]);
    headerRow.eachCell(cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      cell.font = { bold: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FF0D2D6E" } } };
    });

    const STATUS_ZH: Record<string, string> = {
      pending: "待派車", assigned: "已派車", in_transit: "運送中", delivered: "已完成", cancelled: "已取消",
    };

    orders.forEach(o => {
      const row = ws.addRow([
        `#${o.id}`,
        o.createdAt ? new Date(o.createdAt).toLocaleDateString("zh-TW") : "",
        o.pickupAddress,
        o.deliveryAddress,
        o.cargoDescription ?? "",
        o.requiredVehicleType ?? "",
        STATUS_ZH[o.status] ?? o.status,
        o.totalFee ?? 0,
      ]);
      if (o.status === "cancelled") row.eachCell(c => { c.font = { color: { argb: "FF9CA3AF" } }; });
    });

    ws.addRow([]);
    const totalFee = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const paid = orders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const unpaid = totalFee - paid;

    const summaryRow = ws.addRow(["", "", "", "", "", "", "小計", totalFee]);
    summaryRow.getCell(7).font = { bold: true };
    summaryRow.getCell(8).font = { bold: true, color: { argb: "FF0D2D6E" } };
    const paidRow = ws.addRow(["", "", "", "", "", "", "已收款", paid]);
    paidRow.getCell(7).font = { bold: true };
    paidRow.getCell(8).font = { bold: true, color: { argb: "FF059669" } };
    const unpaidRow = ws.addRow(["", "", "", "", "", "", "未收款", unpaid]);
    unpaidRow.getCell(7).font = { bold: true };
    unpaidRow.getCell(8).font = { bold: true, color: { argb: "FFF97316" } };

    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 28;
    ws.getColumn(4).width = 28;
    ws.getColumn(5).width = 20;
    ws.getColumn(6).width = 10;
    ws.getColumn(7).width = 10;
    ws.getColumn(8).width = 14;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="statement_${y}_${m}.xlsx"`);
    await wb.xlsx.write(res);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Saved Templates ──────────────────────────── */
router.get("/enterprise/:id/templates", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const templates = await db.select().from(enterpriseSavedTemplatesTable)
      .where(eq(enterpriseSavedTemplatesTable.enterpriseId, id))
      .orderBy(desc(enterpriseSavedTemplatesTable.useCount));
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/enterprise/:id/templates", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [tmpl] = await db.insert(enterpriseSavedTemplatesTable)
      .values({ ...req.body, enterpriseId: id })
      .returning();
    res.json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/enterprise/:id/templates/:tmplId/use", async (req, res) => {
  try {
    const tmplId = Number(req.params.tmplId);
    await db.update(enterpriseSavedTemplatesTable)
      .set({ useCount: sql`${enterpriseSavedTemplatesTable.useCount} + 1` })
      .where(eq(enterpriseSavedTemplatesTable.id, tmplId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/enterprise/:id/templates/:tmplId", async (req, res) => {
  try {
    const tmplId = Number(req.params.tmplId);
    await db.delete(enterpriseSavedTemplatesTable).where(eq(enterpriseSavedTemplatesTable.id, tmplId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Sub-accounts ─────────────────────────────── */
router.get("/enterprise/:id/sub-accounts", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const subs = await db.select({
      id: enterpriseSubAccountsTable.id,
      enterpriseId: enterpriseSubAccountsTable.enterpriseId,
      name: enterpriseSubAccountsTable.name,
      subCode: enterpriseSubAccountsTable.subCode,
      role: enterpriseSubAccountsTable.role,
      email: enterpriseSubAccountsTable.email,
      phone: enterpriseSubAccountsTable.phone,
      isActive: enterpriseSubAccountsTable.isActive,
      createdAt: enterpriseSubAccountsTable.createdAt,
    }).from(enterpriseSubAccountsTable)
      .where(eq(enterpriseSubAccountsTable.enterpriseId, id))
      .orderBy(desc(enterpriseSubAccountsTable.createdAt));
    res.json(subs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/enterprise/:id/sub-accounts", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, subCode, password, role, email, phone } = req.body;
    if (!name || !subCode || !password) return res.status(400).json({ error: "姓名、帳號、密碼必填" });

    const passwordHash = hashPassword(password);
    const [sub] = await db.insert(enterpriseSubAccountsTable)
      .values({ enterpriseId: id, name, subCode, passwordHash, role: role ?? "purchaser", email, phone })
      .returning();

    const { passwordHash: _, ...safe } = sub;
    res.json(safe);
  } catch (e: any) {
    if (e?.code === "23505") return res.status(409).json({ error: "帳號已被使用" });
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/enterprise/:id/sub-accounts/:subId", async (req, res) => {
  try {
    const subId = Number(req.params.subId);
    const { name, role, email, phone, isActive, password } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = hashPassword(password);

    const [sub] = await db.update(enterpriseSubAccountsTable).set(updates)
      .where(eq(enterpriseSubAccountsTable.id, subId)).returning();
    const { passwordHash: _, ...safe } = sub;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/enterprise/:id/sub-accounts/:subId", async (req, res) => {
  try {
    const subId = Number(req.params.subId);
    await db.delete(enterpriseSubAccountsTable).where(eq(enterpriseSubAccountsTable.id, subId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Notifications ────────────────────────────── */
router.get("/enterprise/:id/notifications", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const notifs = await db.select().from(enterpriseNotificationsTable)
      .where(eq(enterpriseNotificationsTable.enterpriseId, id))
      .orderBy(desc(enterpriseNotificationsTable.createdAt))
      .limit(50);
    const unread = notifs.filter(n => !n.isRead).length;
    res.json({ notifications: notifs, unread });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/enterprise/:id/notifications/:nId/read", async (req, res) => {
  try {
    const nId = Number(req.params.nId);
    await db.update(enterpriseNotificationsTable).set({ isRead: true })
      .where(eq(enterpriseNotificationsTable.id, nId));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/enterprise/:id/notifications/read-all", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(enterpriseNotificationsTable).set({ isRead: true })
      .where(and(eq(enterpriseNotificationsTable.enterpriseId, id), eq(enterpriseNotificationsTable.isRead, false)));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Admin: Create enterprise account ────────── */
router.post("/enterprise", async (req, res) => {
  try {
    const { password, ...rest } = req.body as { password: string; [k: string]: unknown };
    const passwordHash = hashPassword(password);
    const [acc] = await db.insert(enterpriseAccountsTable)
      .values({ ...rest, passwordHash } as any).returning();
    const { passwordHash: _, ...safe } = acc;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Admin: Update settings ───────────────────── */
router.patch("/enterprise/:id/settings", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      creditLimit, discountPercent, billingType, priorityDispatch, status, exclusiveNote, password,
      companyName, shortName, contactPerson, phone, email, taxId, invoiceTitle, address, postalCode, industry,
      paymentType, creditDays, monthlyStatementDay, priceLevel, unitPriceFixed, minMonthlySpend,
      contractType, contractStart, contractEnd, isVip, notes,
    } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (companyName !== undefined) updates.companyName = companyName;
    if (shortName !== undefined) updates.shortName = shortName;
    if (contactPerson !== undefined) updates.contactPerson = contactPerson;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (taxId !== undefined) updates.taxId = taxId;
    if (invoiceTitle !== undefined) updates.invoiceTitle = invoiceTitle;
    if (address !== undefined) updates.address = address;
    if (postalCode !== undefined) updates.postalCode = postalCode;
    if (industry !== undefined) updates.industry = industry;
    if (creditLimit !== undefined) updates.creditLimit = creditLimit;
    if (discountPercent !== undefined) updates.discountPercent = discountPercent;
    if (billingType !== undefined) updates.billingType = billingType;
    if (paymentType !== undefined) updates.paymentType = paymentType;
    if (creditDays !== undefined) updates.creditDays = creditDays;
    if (monthlyStatementDay !== undefined) updates.monthlyStatementDay = monthlyStatementDay;
    if (priceLevel !== undefined) updates.priceLevel = priceLevel;
    if (unitPriceFixed !== undefined) updates.unitPriceFixed = unitPriceFixed;
    if (minMonthlySpend !== undefined) updates.minMonthlySpend = minMonthlySpend;
    if (contractType !== undefined) updates.contractType = contractType;
    if (contractStart !== undefined) updates.contractStart = contractStart;
    if (contractEnd !== undefined) updates.contractEnd = contractEnd;
    if (isVip !== undefined) updates.isVip = isVip;
    if (priorityDispatch !== undefined) updates.priorityDispatch = priorityDispatch;
    if (exclusiveNote !== undefined) updates.exclusiveNote = exclusiveNote;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    if (password) updates.passwordHash = hashPassword(password);
    const [acc] = await db.update(enterpriseAccountsTable)
      .set(updates as any)
      .where(eq(enterpriseAccountsTable.id, id)).returning();
    const { passwordHash: _, ...safe } = acc;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Enterprise Bulk Import: Template Download ─────────────────────────── */
const ENT_REQUIRED_COLS = ["取貨地址", "送貨地址"];
const ENT_OPTIONAL_COLS = [
  "貨物描述", "件數", "重量(kg)", "車型",
  "取貨日期(YYYY-MM-DD)", "取貨時間(HH:MM)", "送貨日期(YYYY-MM-DD)", "送貨時間(HH:MM)",
  "收件人姓名", "收件人電話", "取貨聯絡人", "取貨電話",
  "備註",
];
const ENT_ALL_COLS = [...ENT_REQUIRED_COLS, ...ENT_OPTIONAL_COLS];
const ENT_SAMPLE_ROWS = [
  {
    取貨地址: "台北市松山區南京東路五段（倉庫）",
    送貨地址: "新北市板橋區文化路1段100號",
    貨物描述: "蝦皮包裹 #SH20260401-001", 件數: 5, "重量(kg)": 8, 車型: "小貨車",
    "取貨日期(YYYY-MM-DD)": "2026-04-05", "取貨時間(HH:MM)": "09:00",
    "送貨日期(YYYY-MM-DD)": "2026-04-05", "送貨時間(HH:MM)": "14:00",
    收件人姓名: "王小明", 收件人電話: "0912345678",
    取貨聯絡人: "陳倉管", 取貨電話: "02-12345678", 備註: "",
  },
  {
    取貨地址: "台北市松山區南京東路五段（倉庫）",
    送貨地址: "桃園市中壢區中山路200號",
    貨物描述: "蝦皮包裹 #SH20260401-002", 件數: 3, "重量(kg)": 5, 車型: "小貨車",
    "取貨日期(YYYY-MM-DD)": "2026-04-05", "取貨時間(HH:MM)": "09:00",
    "送貨日期(YYYY-MM-DD)": "2026-04-05", "送貨時間(HH:MM)": "16:00",
    收件人姓名: "李美華", 收件人電話: "0923456789",
    取貨聯絡人: "陳倉管", 取貨電話: "02-12345678", 備註: "請先電聯",
  },
];

router.get("/enterprise/orders/import-template", async (_req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "富詠運輸 - 企業版";
    wb.created = new Date();

    const ws = wb.addWorksheet("訂單批量匯入", {
      views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
    });

    ws.columns = ENT_ALL_COLS.map(h => ({ header: h, key: h, width: Math.max(16, h.length * 2) }));

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNum) => {
      const isRequired = colNum <= ENT_REQUIRED_COLS.length;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isRequired ? "FF1A56DB" : "FF4B83D2" } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF1A56DB" } }, right: { style: "thin", color: { argb: "FFAAAAAA" } } };
    });
    headerRow.height = 30;

    const noteRow = ws.addRow(["★ 深藍欄位必填（取貨地址、送貨地址），其餘選填。日期格式：2026-04-05，時間格式：09:00"]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF555555" }, size: 10 };
    ws.mergeCells(`A2:${String.fromCharCode(64 + ENT_ALL_COLS.length)}2`);
    noteRow.height = 18;

    for (const row of ENT_SAMPLE_ROWS) {
      const r = ws.addRow(ENT_ALL_COLS.map(col => (row as any)[col] ?? ""));
      r.eachCell(cell => {
        cell.alignment = { vertical: "middle" };
        cell.border = { bottom: { style: "hair", color: { argb: "FFDDDDDD" } }, right: { style: "hair", color: { argb: "FFDDDDDD" } } };
      });
      r.height = 18;
    }

    const googleSheetNote = ws.addRow([]);
    const gsRow = ws.addRow([
      "💡 Google 試算表用戶：在 Google Sheets 以同樣欄位填寫後，點「檔案 → 下載 → CSV 格式」或「Excel(.xlsx)」，再上傳本系統即可。"
    ]);
    gsRow.getCell(1).font = { italic: true, color: { argb: "FF1A7F37" }, size: 10 };
    ws.mergeCells(`A${gsRow.number}:${String.fromCharCode(64 + ENT_ALL_COLS.length)}${gsRow.number}`);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename*=UTF-8\'\'%E4%BC%81%E6%A5%AD%E8%A8%82%E5%96%AE%E6%89%B9%E9%87%8F%E5%8C%AF%E5%85%A5%E7%AF%84%E6%9C%AC.xlsx');
    const buf = await wb.xlsx.writeBuffer();
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Enterprise Bulk Import: Upload & Process ───────────────────────────── */
router.post("/enterprise/:id/orders/bulk-import", upload.single("file"), async (req, res) => {
  try {
    const enterpriseId = Number(req.params.id);
    const dryRun = req.query.dry_run === "1";
    if (!req.file) return res.status(400).json({ error: "未收到檔案" });

    const [acc] = await db.select().from(enterpriseAccountsTable).where(eq(enterpriseAccountsTable.id, enterpriseId));
    if (!acc) return res.status(404).json({ error: "企業帳號不存在" });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    let ws = wb.getWorksheet(1);
    if (!ws) return res.status(400).json({ error: "找不到工作表" });

    // Try CSV fallback if xlsx fails
    const rows: any[] = [];
    let headers: string[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        headers = (row.values as any[]).slice(1).map((v: any) => String(v ?? "").trim());
        return;
      }
      if (rowNum === 2) {
        // Skip the note row if it starts with "★"
        const firstCell = String((row.values as any[])[1] ?? "").trim();
        if (firstCell.startsWith("★") || firstCell.startsWith("💡") || firstCell === "") return;
      }
      const vals = (row.values as any[]).slice(1);
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      rows.push({ rowNum, obj });
    });

    const results: any[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (const { rowNum, obj } of rows) {
      const errors: string[] = [];
      const pickupAddr = String(obj["取貨地址"] ?? "").trim();
      const deliveryAddr = String(obj["送貨地址"] ?? "").trim();
      if (!pickupAddr) errors.push("取貨地址必填");
      if (!deliveryAddr) errors.push("送貨地址必填");

      const valid = errors.length === 0;
      if (valid) validCount++; else errorCount++;

      results.push({
        rowNum,
        valid,
        errors,
        preview: {
          pickup_address: pickupAddr,
          delivery_address: deliveryAddr,
          cargo_description: String(obj["貨物描述"] ?? "").trim(),
          quantity: obj["件數"] || "",
          weight: obj["重量(kg)"] || "",
          pickup_date: String(obj["取貨日期(YYYY-MM-DD)"] ?? "").trim(),
          pickup_time: String(obj["取貨時間(HH:MM)"] ?? "").trim(),
          delivery_date: String(obj["送貨日期(YYYY-MM-DD)"] ?? "").trim(),
          delivery_time: String(obj["送貨時間(HH:MM)"] ?? "").trim(),
          receiver_name: String(obj["收件人姓名"] ?? "").trim(),
          receiver_phone: String(obj["收件人電話"] ?? "").trim(),
          notes: String(obj["備註"] ?? "").trim(),
          vehicle_type: String(obj["車型"] ?? "").trim(),
        },
      });
    }

    if (dryRun) {
      return res.json({ total: rows.length, valid: validCount, errors: errorCount, rows: results });
    }

    // Commit valid rows
    let inserted = 0;
    const now = new Date();
    for (const r of results) {
      if (!r.valid) continue;
      const p = r.preview;
      const pickupDt = p.pickup_date
        ? new Date(`${p.pickup_date}T${p.pickup_time || "09:00"}:00`)
        : new Date(now.getTime() + 86400000);
      const deliveryDt = p.delivery_date
        ? new Date(`${p.delivery_date}T${p.delivery_time || "18:00"}:00`)
        : new Date(pickupDt.getTime() + 28800000);

      await db.insert(ordersTable).values({
        customerName: acc.companyName,
        customerPhone: acc.phone ?? "",
        pickupAddress: p.pickup_address,
        deliveryAddress: p.delivery_address,
        cargoDescription: p.cargo_description || null,
        pickupTime: pickupDt,
        deliveryTime: deliveryDt,
        requiredVehicleType: p.vehicle_type || null,
        notes: [
          p.receiver_name ? `收件人：${p.receiver_name}` : "",
          p.receiver_phone ? `電話：${p.receiver_phone}` : "",
          p.notes,
        ].filter(Boolean).join("；") || null,
        status: "pending",
        source: "enterprise",
        enterpriseId,
      } as any);
      inserted++;
    }

    await createNotification(enterpriseId, null, "import", "批量匯入完成",
      `已成功匯入 ${inserted} 筆訂單${errorCount > 0 ? `，${errorCount} 筆因格式問題跳過` : ""}`);

    res.json({ inserted, skipped_errors: errorCount });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
