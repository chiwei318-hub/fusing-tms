/**
 * arLedger.ts — 應收帳款分類帳
 * 記錄所有應收 (receivable)、收款 (payment)、折讓 (credit_note)
 * 提供帳款餘額、對帳功能
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const arLedgerRouter = Router();

// ── 帳款摘要（各企業/客戶的餘額彙總） ────────────────────────────────────
arLedgerRouter.get("/ar-ledger/summary", async (req, res) => {
  // Enterprise AR
  const entRows = await db.execute(sql`
    SELECT
      ea.id, ea.company_name AS name, ea.account_code, ea.billing_type,
      ea.email,
      COALESCE(SUM(al.amount) FILTER (WHERE al.entry_type = 'receivable'), 0) AS total_receivable,
      COALESCE(SUM(al.amount) FILTER (WHERE al.entry_type = 'payment'),   0) AS total_paid,
      COALESCE(SUM(al.amount), 0)                                             AS balance,
      COUNT(al.id) FILTER (WHERE al.entry_type = 'receivable' AND NOT al.reconciled) AS unpaid_entries,
      MAX(al.created_at)                                                      AS last_activity
    FROM enterprise_accounts ea
    LEFT JOIN ar_ledger al ON al.enterprise_id = ea.id
    WHERE ea.status = 'active'
    GROUP BY ea.id, ea.company_name, ea.account_code, ea.billing_type, ea.email
    ORDER BY balance DESC
  `);

  // Walk-in customer AR (only those with outstanding balance)
  const custRows = await db.execute(sql`
    SELECT
      c.id, c.name, c.phone, c.billing_type, c.email,
      COALESCE(SUM(al.amount) FILTER (WHERE al.entry_type = 'receivable'), 0) AS total_receivable,
      COALESCE(SUM(al.amount) FILTER (WHERE al.entry_type = 'payment'),   0) AS total_paid,
      COALESCE(SUM(al.amount), 0)                                             AS balance,
      MAX(al.created_at)                                                      AS last_activity
    FROM customers c
    LEFT JOIN ar_ledger al ON al.customer_id = c.id
    GROUP BY c.id, c.name, c.phone, c.billing_type, c.email
    HAVING COALESCE(SUM(al.amount), 0) > 0
    ORDER BY balance DESC
  `);

  res.json({
    enterprises: entRows.rows,
    customers:   custRows.rows,
    total_balance: [
      ...entRows.rows.map((r: any) => Number(r.balance)),
      ...custRows.rows.map((r: any) => Number(r.balance)),
    ].reduce((a, b) => a + b, 0),
  });
});

// ── 單一實體的 AR 明細 ────────────────────────────────────────────────────
arLedgerRouter.get("/ar-ledger/enterprise/:id", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.execute(sql`
    SELECT
      al.*,
      o.order_no, o.customer_name, o.status AS order_status,
      i.invoice_number
    FROM ar_ledger al
    LEFT JOIN orders o ON o.id = al.order_id
    LEFT JOIN invoices i ON i.id = al.ref_invoice_id
    WHERE al.enterprise_id = ${id}
    ORDER BY al.created_at DESC
    LIMIT 100
  `);

  const balance = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS balance FROM ar_ledger WHERE enterprise_id = ${id}
  `);

  res.json({
    entries: rows.rows,
    balance: Number((balance.rows[0] as any)?.balance ?? 0),
  });
});

// ── 全部 AR 明細（管理後台用） ─────────────────────────────────────────────
arLedgerRouter.get("/ar-ledger", async (req, res) => {
  const limit  = Math.min(200, Number(req.query.limit ?? 50));
  const offset = (Math.max(1, Number(req.query.page ?? 1)) - 1) * limit;
  const type   = req.query.type as string | undefined;
  const recon  = req.query.reconciled;

  const typeClause = type   ? sql`AND al.entry_type = ${type}` : sql``;
  const reconClause = recon !== undefined
    ? sql`AND al.reconciled = ${recon === "true"}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      al.*,
      o.order_no, o.customer_name AS order_customer,
      ea.company_name AS enterprise_name,
      i.invoice_number
    FROM ar_ledger al
    LEFT JOIN orders o   ON o.id  = al.order_id
    LEFT JOIN enterprise_accounts ea ON ea.id = al.enterprise_id
    LEFT JOIN invoices i ON i.id  = al.ref_invoice_id
    WHERE 1=1 ${typeClause} ${reconClause}
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const total = await db.execute(sql`SELECT COUNT(*) AS n FROM ar_ledger`);

  res.json({
    entries: rows.rows,
    total:   Number((total.rows[0] as any)?.n ?? 0),
  });
});

// ── 收款入帳（現結或月結均可使用） ────────────────────────────────────────
arLedgerRouter.post("/ar-ledger/payment", async (req, res) => {
  const { enterprise_id, customer_id, amount, note, payment_method } = req.body ?? {};
  if (!amount || amount <= 0) return res.status(400).json({ error: "金額必須大於 0" });
  if (!enterprise_id && !customer_id) return res.status(400).json({ error: "需指定企業或客戶 ID" });

  // 寫入負數分錄（收款）
  const r = await db.execute(sql`
    INSERT INTO ar_ledger
      (enterprise_id, customer_id, entry_type, amount, note)
    VALUES
      (${enterprise_id ?? null}, ${customer_id ?? null},
       'payment', ${-Math.abs(Number(amount))},
       ${note ?? `收款 NT$${amount}（${payment_method ?? ""}）`})
    RETURNING id, amount, created_at
  `);

  // 自動對帳：找未對帳應收 → 按時間順序標記 reconciled
  const entityFilter = enterprise_id
    ? sql`enterprise_id = ${enterprise_id}`
    : sql`customer_id = ${customer_id}`;

  await db.execute(sql`
    WITH to_reconcile AS (
      SELECT id FROM ar_ledger
      WHERE ${entityFilter}
        AND entry_type = 'receivable'
        AND NOT reconciled
      ORDER BY created_at ASC
      LIMIT 50
    )
    UPDATE ar_ledger
    SET reconciled = TRUE, reconciled_at = NOW()
    WHERE id IN (SELECT id FROM to_reconcile)
    AND (
      SELECT COALESCE(SUM(amount), 0) FROM ar_ledger
      WHERE ${entityFilter}
    ) <= 0
  `);

  // 計算新餘額
  const balRow = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0) AS balance
    FROM ar_ledger WHERE ${entityFilter}
  `);

  res.json({
    ok:      true,
    entry:   r.rows[0],
    balance: Number((balRow.rows[0] as any)?.balance ?? 0),
  });
});

// ── 手動對帳（標記已對帳） ────────────────────────────────────────────────
arLedgerRouter.patch("/ar-ledger/:id/reconcile", async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`
    UPDATE ar_ledger SET reconciled = TRUE, reconciled_at = NOW() WHERE id = ${id}
  `);
  res.json({ ok: true });
});
