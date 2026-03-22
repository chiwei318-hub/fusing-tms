import { Router } from "express";
import {
  db,
  enterpriseAccountsTable,
  enterpriseSavedTemplatesTable,
  ordersTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { createHash } from "crypto";

const router = Router();

function hashPassword(pw: string) {
  return createHash("sha256").update(pw + "fuyi_salt_2024").digest("hex");
}

/* ─── Auth: Login ─────────────────────────────── */
router.post("/enterprise/login", async (req, res) => {
  try {
    const { accountCode, password } = req.body as { accountCode: string; password: string };
    if (!accountCode || !password) return res.status(400).json({ error: "帳號和密碼必填" });

    const [account] = await db
      .select()
      .from(enterpriseAccountsTable)
      .where(eq(enterpriseAccountsTable.accountCode, accountCode));

    if (!account) return res.status(401).json({ error: "帳號不存在" });
    if (account.status !== "active") return res.status(403).json({ error: "帳號已停用" });

    const hash = hashPassword(password);
    if (hash !== account.passwordHash) return res.status(401).json({ error: "密碼錯誤" });

    const { passwordHash: _, ...safe } = account;
    res.json({ ok: true, account: safe });
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

/* ─── Monthly orders & usage ───────────────────── */
router.get("/enterprise/:id/orders", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { year, month } = req.query as { year?: string; month?: string };

    const now = new Date();
    const y = Number(year ?? now.getFullYear());
    const m = Number(month ?? now.getMonth() + 1);

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 1);

    const orders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.enterpriseId, id),
          gte(ordersTable.createdAt, startDate),
          lte(ordersTable.createdAt, endDate),
        ),
      )
      .orderBy(desc(ordersTable.createdAt));

    const totalFee = orders.reduce((s, o) => s + (o.totalFee ?? 0), 0);
    const orderCount = orders.length;

    res.json({ orders, totalFee, orderCount, year: y, month: m });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Monthly summary by month (for report table) ─ */
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
      .where(eq(ordersTable.enterpriseId, id))
      .groupBy(
        sql`EXTRACT(YEAR FROM ${ordersTable.createdAt})`,
        sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`,
      )
      .orderBy(
        desc(sql`EXTRACT(YEAR FROM ${ordersTable.createdAt})`),
        desc(sql`EXTRACT(MONTH FROM ${ordersTable.createdAt})`),
      );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── CSV Export ───────────────────────────────── */
router.get("/enterprise/:id/orders/export", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { year, month } = req.query as { year?: string; month?: string };
    const now = new Date();
    const y = Number(year ?? now.getFullYear());
    const m = Number(month ?? now.getMonth() + 1);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 1);

    const orders = await db
      .select()
      .from(ordersTable)
      .where(and(eq(ordersTable.enterpriseId, id), gte(ordersTable.createdAt, startDate), lte(ordersTable.createdAt, endDate)))
      .orderBy(desc(ordersTable.createdAt));

    const header = ["訂單編號", "日期", "取貨地址", "送貨地址", "貨品說明", "車型", "狀態", "費用(NTD)"];
    const rows = orders.map(o => [
      `#${o.id}`,
      o.createdAt.toLocaleDateString("zh-TW"),
      o.pickupAddress,
      o.deliveryAddress,
      o.cargoDescription,
      o.requiredVehicleType ?? "",
      o.status,
      o.totalFee ?? "",
    ]);

    const bom = "\uFEFF";
    const csv = bom + [header, ...rows]
      .map(row => row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders_${y}_${m}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Saved Templates ──────────────────────────── */
router.get("/enterprise/:id/templates", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const templates = await db
      .select()
      .from(enterpriseSavedTemplatesTable)
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
    const body = req.body;
    const [tmpl] = await db
      .insert(enterpriseSavedTemplatesTable)
      .values({ ...body, enterpriseId: id })
      .returning();
    res.json(tmpl);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/enterprise/:id/templates/:tmplId/use", async (req, res) => {
  try {
    const tmplId = Number(req.params.tmplId);
    await db
      .update(enterpriseSavedTemplatesTable)
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

/* ─── Admin: Create enterprise account ────────── */
router.post("/enterprise", async (req, res) => {
  try {
    const { password, ...rest } = req.body as { password: string; [k: string]: unknown };
    const passwordHash = hashPassword(password);
    const [acc] = await db
      .insert(enterpriseAccountsTable)
      .values({ ...rest, passwordHash } as any)
      .returning();
    const { passwordHash: _, ...safe } = acc;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/* ─── Admin: Update credit/settings ───────────── */
router.patch("/enterprise/:id/settings", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { creditLimit, discountPercent, billingType, priorityDispatch, status, exclusiveNote } = req.body;
    const [acc] = await db
      .update(enterpriseAccountsTable)
      .set({ creditLimit, discountPercent, billingType, priorityDispatch, status, exclusiveNote, updatedAt: new Date() })
      .where(eq(enterpriseAccountsTable.id, id))
      .returning();
    const { passwordHash: _, ...safe } = acc;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
