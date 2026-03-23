import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

export const paymentMethodsRouter = Router();

// ── 工具函數 ────────────────────────────────────────────────────
function isInstantPayment(method: string) {
  return ["line_pay", "credit_card", "bank_transfer"].includes(method);
}

function generatePaymentLink(orderId: number, method: string, amount: number): string {
  const base = method === "line_pay"
    ? "https://pay.line.me/checkout"
    : method === "credit_card"
    ? "https://payment.example.com/card"
    : "https://bank.example.com/transfer";
  const token = Buffer.from(`${orderId}-${method}-${Date.now()}`).toString("base64url").slice(0, 16);
  return `${base}?order=${orderId}&amount=${amount}&token=${token}`;
}

// ── GET /api/payments/overdue ────────────────────────────────────
// 逾期未收款訂單（超過 N 天未付款）
paymentMethodsRouter.get("/payments/overdue", async (req, res) => {
  const days = Math.max(0, parseInt(String(req.query.days ?? "3"), 10) || 0);
  const { rows } = await pool.query(`
    SELECT 
      o.id, o.customer_name, o.customer_phone, o.pickup_address, o.delivery_address,
      o.total_fee, o.fee_status, o.payment_method, o.status AS order_status,
      o.reminder_count, o.last_reminder_at, o.cash_reported_at, o.cash_confirmed_at,
      o.created_at, o.pickup_date,
      COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_voided), 0) AS paid_amount,
      (o.total_fee - COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_voided), 0)) AS outstanding
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.fee_status != 'paid'
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.total_fee > 0
      AND o.created_at < NOW() - INTERVAL '${days} days'
    GROUP BY o.id
    HAVING (o.total_fee - COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_voided), 0)) > 0
    ORDER BY o.created_at ASC
  `);
  res.json(rows);
});

// ── GET /api/payments/methods-summary ───────────────────────────
paymentMethodsRouter.get("/payments/methods-summary", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      o.payment_method,
      COUNT(*) AS total_orders,
      COUNT(*) FILTER (WHERE o.fee_status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE o.fee_status != 'paid') AS unpaid_count,
      SUM(o.total_fee) AS total_amount,
      COALESCE(SUM(p2.paid), 0) AS collected_amount
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(amount) AS paid FROM payments WHERE NOT is_voided GROUP BY order_id
    ) p2 ON p2.order_id = o.id
    WHERE o.status NOT IN ('cancelled', 'rejected')
      AND o.total_fee > 0
    GROUP BY o.payment_method
    ORDER BY total_orders DESC
  `);
  res.json(rows.rows);
});

// ── GET /api/payments/cash-pending ──────────────────────────────
// 現金待確認（司機已回報，待管理員確認）
paymentMethodsRouter.get("/payments/cash-pending", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT 
      o.id, o.customer_name, o.customer_phone, o.total_fee, o.fee_status,
      o.cash_reported_at, o.cash_reported_by, o.cash_confirmed_at,
      o.status AS order_status, o.pickup_date,
      d.name AS driver_name, d.phone AS driver_phone
    FROM orders o
    LEFT JOIN drivers d ON d.id = o.driver_id
    WHERE o.payment_method = 'cash'
      AND o.cash_reported_at IS NOT NULL
      AND o.cash_confirmed_at IS NULL
      AND o.fee_status != 'paid'
    ORDER BY o.cash_reported_at ASC
  `);
  res.json(rows.rows);
});

// ── PATCH /api/orders/:id/payment-method ────────────────────────
paymentMethodsRouter.patch("/orders/:id/payment-method", async (req, res) => {
  const id = Number(req.params.id);
  const { paymentMethod } = req.body;
  const validMethods = ["cash", "line_pay", "credit_card", "bank_transfer", "monthly"];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: "無效的付款方式" });
  }

  const [order] = (await db.execute(sql`SELECT id, total_fee, fee_status FROM orders WHERE id = ${id}`)).rows as any[];
  if (!order) return res.status(404).json({ error: "找不到訂單" });

  // 即時付款 → 自動鎖定派車
  const blockDispatch = isInstantPayment(paymentMethod) && order.fee_status !== "paid";
  let paymentLink = null;
  let linkExpires = null;

  if (isInstantPayment(paymentMethod) && order.total_fee > 0) {
    paymentLink = generatePaymentLink(id, paymentMethod, order.total_fee);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    linkExpires = expires.toISOString();
  }

  await db.execute(sql`
    UPDATE orders SET
      payment_method = ${paymentMethod},
      dispatch_blocked = ${blockDispatch},
      payment_link = ${paymentLink},
      payment_link_expires_at = ${linkExpires ? sql`${linkExpires}::timestamp` : sql`NULL`}
    WHERE id = ${id}
  `);

  res.json({ ok: true, paymentMethod, blockDispatch, paymentLink });
});

// ── POST /api/orders/:id/generate-payment-link ──────────────────
// 重新產生付款連結
paymentMethodsRouter.post("/orders/:id/generate-payment-link", async (req, res) => {
  const id = Number(req.params.id);
  const [order] = (await db.execute(sql`SELECT id, total_fee, payment_method FROM orders WHERE id = ${id}`)).rows as any[];
  if (!order) return res.status(404).json({ error: "找不到訂單" });

  if (!isInstantPayment(order.payment_method)) {
    return res.status(400).json({ error: "此付款方式不支援付款連結" });
  }

  const link = generatePaymentLink(id, order.payment_method, order.total_fee);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.execute(sql`
    UPDATE orders SET payment_link = ${link}, payment_link_expires_at = ${expires.toISOString()}::timestamp WHERE id = ${id}
  `);

  res.json({ ok: true, paymentLink: link, expiresAt: expires });
});

// ── POST /api/orders/:id/confirm-payment ────────────────────────
// 確認付款 → 解鎖派車
paymentMethodsRouter.post("/orders/:id/confirm-payment", async (req, res) => {
  const id = Number(req.params.id);
  const { transactionId, gateway } = req.body;

  await db.execute(sql`
    UPDATE orders SET
      fee_status = 'paid',
      dispatch_blocked = false,
      payment_confirmed_at = NOW(),
      payment_transaction_id = ${transactionId ?? null},
      payment_gateway = ${gateway ?? null}
    WHERE id = ${id}
  `);

  // 觸發自動派車
  try {
    const cfgRows = await db.execute(sql`SELECT value FROM pricing_config WHERE key = 'auto_dispatch'`);
    const autoCfg = (cfgRows.rows as any[])[0];
    if (autoCfg?.value === "true") {
      const [order] = (await db.execute(sql`SELECT id, status FROM orders WHERE id = ${id}`)).rows as any[];
      if (order?.status === "pending") {
        const [driver] = (await db.execute(sql`
          SELECT id FROM drivers WHERE status = 'available' AND is_busy = false ORDER BY RANDOM() LIMIT 1
        `)).rows as any[];
        if (driver) {
          await db.execute(sql`
            UPDATE orders SET driver_id = ${driver.id}, status = 'assigned' WHERE id = ${id}
          `);
          await db.execute(sql`
            UPDATE drivers SET is_busy = true WHERE id = ${driver.id}
          `);
        }
      }
    }
  } catch { /* auto-dispatch non-critical */ }

  res.json({ ok: true });
});

// ── POST /api/orders/:id/driver-cash-report ─────────────────────
// 司機回報現金收款
paymentMethodsRouter.post("/orders/:id/driver-cash-report", async (req, res) => {
  const id = Number(req.params.id);
  const { driverName, amount, note } = req.body;

  const [order] = (await db.execute(sql`SELECT id, total_fee, payment_method, status FROM orders WHERE id = ${id}`)).rows as any[];
  if (!order) return res.status(404).json({ error: "找不到訂單" });
  if (order.payment_method !== "cash") {
    return res.status(400).json({ error: "此訂單非現金付款" });
  }
  if (!["in_transit", "delivered"].includes(order.status)) {
    return res.status(400).json({ error: "訂單尚未配送，無法回報現金收款" });
  }

  await db.execute(sql`
    UPDATE orders SET
      cash_reported_at = NOW(),
      cash_reported_by = ${driverName ?? "司機"}
    WHERE id = ${id}
  `);

  // 建立收款記錄（待確認）
  await db.execute(sql`
    INSERT INTO payments (order_id, amount, method, note, collected_by)
    VALUES (${id}, ${Number(amount) || order.total_fee}, 'cash', ${note ?? "司機現場收取"}, ${driverName ?? "司機"})
  `);

  res.json({ ok: true });
});

// ── POST /api/orders/:id/confirm-cash ───────────────────────────
// 管理員確認現金
paymentMethodsRouter.post("/orders/:id/confirm-cash", async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`
    UPDATE orders SET
      cash_confirmed_at = NOW(),
      fee_status = 'paid',
      payment_confirmed_at = NOW()
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// ── POST /api/payments/send-reminder ────────────────────────────
paymentMethodsRouter.post("/payments/send-reminder", async (req, res) => {
  const { orderId, channel = "sms" } = req.body;
  const [order] = (await db.execute(sql`
    SELECT id, customer_name, customer_phone, total_fee FROM orders WHERE id = ${orderId}
  `)).rows as any[];
  if (!order) return res.status(404).json({ error: "找不到訂單" });

  const msg = `【富詠運輸】您好 ${order.customer_name}，您的訂單 #${order.id} 尚有 NT$${Math.round(order.total_fee).toLocaleString()} 待繳納，請盡快完成付款，如有疑問請致電客服。`;

  await db.execute(sql`
    INSERT INTO payment_reminders (order_id, reminder_type, sent_to, channel, message, status)
    VALUES (${orderId}, 'overdue', ${order.customer_phone ?? ""}, ${channel}, ${msg}, 'sent')
  `);

  await db.execute(sql`
    UPDATE orders SET
      reminder_count = reminder_count + 1,
      last_reminder_at = NOW()
    WHERE id = ${orderId}
  `);

  res.json({ ok: true, message: msg });
});

// ── POST /api/payments/batch-reminder ───────────────────────────
paymentMethodsRouter.post("/payments/batch-reminder", async (req, res) => {
  const daysNum = Math.max(0, parseInt(String(req.body.days ?? "3"), 10) || 0);
  const channel = req.body.channel ?? "sms";
  const { rows } = await pool.query(`
    SELECT o.id, o.customer_name, o.customer_phone, o.total_fee,
      COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_voided), 0) AS paid_amount
    FROM orders o
    LEFT JOIN payments p ON p.order_id = o.id
    WHERE o.fee_status != 'paid'
      AND o.status NOT IN ('cancelled', 'rejected')
      AND o.total_fee > 0
      AND o.created_at < NOW() - INTERVAL '${daysNum} days'
    GROUP BY o.id
    HAVING (o.total_fee - COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_voided), 0)) > 0
  `);

  const orders = rows as any[];
  let sent = 0;
  for (const order of orders) {
    const outstanding = order.total_fee - (order.paid_amount ?? 0);
    const msg = `【富詠運輸】您好 ${order.customer_name}，訂單 #${order.id} 尚有 NT$${Math.round(outstanding).toLocaleString()} 待繳納，請盡快完成付款。`;
    await db.execute(sql`
      INSERT INTO payment_reminders (order_id, reminder_type, sent_to, channel, message, status)
      VALUES (${order.id}, 'overdue', ${order.customer_phone ?? ""}, ${channel}, ${msg}, 'sent')
    `);
    await db.execute(sql`
      UPDATE orders SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = ${order.id}
    `);
    sent++;
  }

  res.json({ ok: true, sent, total: orders.length });
});

// ── GET /api/monthly-statements ─────────────────────────────────
paymentMethodsRouter.get("/monthly-statements", async (req, res) => {
  const { year, month, status } = req.query as any;
  const rows = await db.execute(sql`
    SELECT ms.*, 
      COALESCE(ea.company_name, '個人客戶') AS customer_label
    FROM monthly_statements ms
    LEFT JOIN enterprise_accounts ea ON ea.id = ms.enterprise_account_id
    WHERE 1=1
      ${year ? sql`AND ms.period_year = ${Number(year)}` : sql``}
      ${month ? sql`AND ms.period_month = ${Number(month)}` : sql``}
      ${status ? sql`AND ms.status = ${status}` : sql``}
    ORDER BY ms.period_year DESC, ms.period_month DESC, ms.created_at DESC
  `);
  res.json(rows.rows);
});

// ── POST /api/monthly-statements/generate ───────────────────────
paymentMethodsRouter.post("/monthly-statements/generate", async (req, res) => {
  const { year, month, enterpriseAccountId } = req.body;
  const y = Number(year ?? new Date().getFullYear());
  const m = Number(month ?? new Date().getMonth()); // 0-indexed default → last month
  const targetMonth = m === 0 ? 12 : m;
  const targetYear = m === 0 ? y - 1 : y;

  // Get all paid/pending orders for this enterprise in the period
  const orders = await db.execute(sql`
    SELECT o.id, o.total_fee, o.fee_status
    FROM orders o
    WHERE o.status NOT IN ('cancelled', 'rejected')
      AND o.total_fee > 0
      AND EXTRACT(YEAR FROM o.created_at) = ${targetYear}
      AND EXTRACT(MONTH FROM o.created_at) = ${targetMonth}
      ${enterpriseAccountId ? sql`AND o.enterprise_account_id = ${Number(enterpriseAccountId)}` : sql``}
      AND o.payment_method = 'monthly'
  `);

  const orderRows = orders.rows as any[];
  const subtotal = orderRows.reduce((s: number, r: any) => s + (r.total_fee ?? 0), 0);
  const taxAmount = Math.round(subtotal * 0.05);
  const totalAmount = subtotal + taxAmount;
  const dueDate = new Date(targetYear, targetMonth, 25); // due on 25th of following month

  const result = await db.execute(sql`
    INSERT INTO monthly_statements (
      enterprise_account_id, period_year, period_month,
      order_count, subtotal, tax_amount, total_amount,
      status, due_date
    ) VALUES (
      ${enterpriseAccountId ?? null}, ${targetYear}, ${targetMonth},
      ${orderRows.length}, ${subtotal}, ${taxAmount}, ${totalAmount},
      'draft', ${dueDate.toISOString().split("T")[0]}
    ) RETURNING *
  `);

  res.status(201).json({ ok: true, statement: result.rows[0], orderCount: orderRows.length });
});

// ── PATCH /api/monthly-statements/:id/status ────────────────────
paymentMethodsRouter.patch("/monthly-statements/:id/status", async (req, res) => {
  const { status, paymentNote } = req.body;
  const allowed = ["draft", "sent", "paid", "overdue", "disputed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "無效狀態" });

  await db.execute(sql`
    UPDATE monthly_statements SET
      status = ${status},
      sent_at = CASE WHEN ${status} = 'sent' THEN NOW() ELSE sent_at END,
      paid_at = CASE WHEN ${status} = 'paid' THEN NOW() ELSE paid_at END,
      payment_note = ${paymentNote ?? null},
      updated_at = NOW()
    WHERE id = ${Number(req.params.id)}
  `);
  res.json({ ok: true });
});

// ── GET /api/payments/stats-by-method ───────────────────────────
paymentMethodsRouter.get("/payments/stats-by-method", async (_req, res) => {
  const [cur] = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE payment_method = 'cash' AND fee_status != 'paid') AS cash_unpaid,
      COUNT(*) FILTER (WHERE payment_method IN ('line_pay','credit_card','bank_transfer') AND fee_status != 'paid') AS instant_unpaid,
      COUNT(*) FILTER (WHERE payment_method = 'monthly' AND fee_status != 'paid') AS monthly_unpaid,
      COUNT(*) FILTER (WHERE dispatch_blocked = true) AS dispatch_blocked,
      COUNT(*) FILTER (WHERE cash_reported_at IS NOT NULL AND cash_confirmed_at IS NULL) AS cash_pending_confirm,
      SUM(total_fee) FILTER (WHERE fee_status != 'paid' AND status NOT IN ('cancelled','rejected')) AS total_outstanding
    FROM orders
    WHERE status NOT IN ('cancelled', 'rejected')
  `)).rows as any[];
  res.json(cur ?? {});
});
