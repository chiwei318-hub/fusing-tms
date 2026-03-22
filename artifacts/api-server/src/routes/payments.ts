import { Router, type IRouter } from "express";
import { db, paymentsTable, ordersTable, driversTable } from "@workspace/db";
import { eq, desc, and, gte, lte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const BANK_ACCOUNT = {
  bank: "台灣銀行",
  branch: "中山分行",
  account: "012-123456789",
  name: "富詠運輸股份有限公司",
};

function generateReceiptNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RC${ymd}${rand}`;
}

async function getOrderPaidAmount(orderId: number): Promise<number> {
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${paymentsTable.amount}), 0)` })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.orderId, orderId), eq(paymentsTable.isVoided, false)));
  return Number(result[0]?.total ?? 0);
}

async function updateOrderFeeStatus(orderId: number) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return;
  const paid = await getOrderPaidAmount(orderId);
  const total = order.totalFee ?? 0;
  let feeStatus = "unpaid";
  if (paid >= total && total > 0) feeStatus = "paid";
  else if (paid > 0) feeStatus = "unpaid";
  await db.update(ordersTable).set({
    feeStatus,
    paymentConfirmedAt: feeStatus === "paid" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));
}

router.get("/payments/bank-info", (_req, res) => {
  res.json(BANK_ACCOUNT);
});

router.get("/payments", async (req, res) => {
  try {
    const payments = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.createdAt))
      .limit(500);
    res.json(payments);
  } catch (err) {
    req.log.error({ err }, "Failed to list payments");
    res.status(500).json({ error: "Failed to list payments" });
  }
});

router.get("/payments/unpaid", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .leftJoin(driversTable, eq(ordersTable.driverId, driversTable.id))
      .where(eq(ordersTable.feeStatus, "unpaid"))
      .orderBy(desc(ordersTable.createdAt));

    const ordersWithPaid = await Promise.all(
      rows.map(async (row) => {
        const paid = await getOrderPaidAmount(row.orders.id);
        return { ...row.orders, driver: row.drivers ?? null, paidAmount: paid };
      })
    );
    res.json(ordersWithPaid);
  } catch (err) {
    req.log.error({ err }, "Failed to list unpaid orders");
    res.status(500).json({ error: "Failed to list unpaid orders" });
  }
});

router.get("/payments/report", async (req, res) => {
  try {
    const schema = z.object({
      mode: z.enum(["daily", "monthly"]).default("daily"),
      year: z.coerce.number().optional(),
      month: z.coerce.number().optional(),
    });
    const query = schema.parse(req.query);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;

    let fromDate: Date;
    let toDate: Date;
    if (query.mode === "monthly") {
      fromDate = new Date(year, 0, 1);
      toDate = new Date(year, 11, 31, 23, 59, 59);
    } else {
      fromDate = new Date(year, month - 1, 1);
      toDate = new Date(year, month, 0, 23, 59, 59);
    }

    const payments = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.isVoided, false),
          gte(paymentsTable.createdAt, fromDate),
          lte(paymentsTable.createdAt, toDate)
        )
      )
      .orderBy(paymentsTable.createdAt);

    const byDate: Record<string, { date: string; count: number; total: number; byMethod: Record<string, number> }> = {};
    for (const p of payments) {
      const key = query.mode === "monthly"
        ? `${p.createdAt.getFullYear()}/${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`
        : `${p.createdAt.getMonth() + 1}/${String(p.createdAt.getDate()).padStart(2, "0")}`;
      if (!byDate[key]) byDate[key] = { date: key, count: 0, total: 0, byMethod: {} };
      byDate[key].count++;
      byDate[key].total += p.amount;
      byDate[key].byMethod[p.method] = (byDate[key].byMethod[p.method] ?? 0) + p.amount;
    }

    const grandTotal = payments.reduce((s, p) => s + p.amount, 0);
    const byMethod = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      rows: Object.values(byDate),
      grandTotal,
      byMethod,
      count: payments.length,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate report");
    res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/payments/order/:orderId", async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, orderId))
      .orderBy(desc(paymentsTable.createdAt));
    const paidAmount = payments.filter(p => !p.isVoided).reduce((s, p) => s + p.amount, 0);
    res.json({ payments, paidAmount });
  } catch (err) {
    req.log.error({ err }, "Failed to get order payments");
    res.status(500).json({ error: "Failed to get order payments" });
  }
});

router.post("/payments", async (req, res) => {
  try {
    const schema = z.object({
      orderId: z.number().int().positive(),
      amount: z.number().positive(),
      method: z.enum(["cash", "bank_transfer", "line_pay", "credit_card"]),
      note: z.string().optional(),
      collectedBy: z.string().optional(),
      receiptCompanyTitle: z.string().optional(),
      receiptTaxId: z.string().optional(),
      sendNotification: z.boolean().optional().default(false),
    });
    const body = schema.parse(req.body);

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, body.orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const receiptNumber = generateReceiptNumber();
    const [payment] = await db.insert(paymentsTable).values({
      orderId: body.orderId,
      amount: body.amount,
      method: body.method,
      note: body.note ?? null,
      collectedBy: body.collectedBy ?? "admin",
      receiptNumber,
      receiptCompanyTitle: body.receiptCompanyTitle ?? null,
      receiptTaxId: body.receiptTaxId ?? null,
      isVoided: false,
      notificationSentAt: body.sendNotification ? new Date() : null,
    }).returning();

    await updateOrderFeeStatus(body.orderId);

    if (body.sendNotification) {
      console.log(`[Payment Notify] Order #${body.orderId} → ${order.customerPhone}: 收款 NT$${body.amount} (${body.method})`);
    }

    return res.status(201).json({ payment, receiptNumber });
  } catch (err) {
    req.log.error({ err }, "Failed to create payment");
    return res.status(500).json({ error: "Failed to create payment" });
  }
});

router.post("/payments/:id/void", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const schema = z.object({ reason: z.string().optional() });
    const body = schema.parse(req.body);

    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id)).limit(1);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.isVoided) return res.status(400).json({ error: "Payment already voided" });

    await db.update(paymentsTable).set({
      isVoided: true,
      voidReason: body.reason ?? "管理員作廢",
    }).where(eq(paymentsTable.id, id));

    await updateOrderFeeStatus(payment.orderId);

    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to void payment");
    return res.status(500).json({ error: "Failed to void payment" });
  }
});

router.post("/payments/notify-unpaid", async (req, res) => {
  try {
    const schema = z.object({ orderId: z.number().int().positive() });
    const body = schema.parse(req.body);
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, body.orderId)).limit(1);
    if (!order) return res.status(404).json({ error: "Order not found" });
    console.log(`[Unpaid Reminder] Order #${body.orderId} → ${order.customerPhone}: 訂單尚有未付款項，請盡快付款`);
    return res.json({ success: true, message: `已發送提醒至 ${order.customerPhone}` });
  } catch (err) {
    req.log.error({ err }, "Failed to send reminder");
    return res.status(500).json({ error: "Failed to send reminder" });
  }
});

export default router;
