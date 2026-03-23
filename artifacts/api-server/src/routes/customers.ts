import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateCustomerBody,
  UpdateCustomerBody,
  UpdateCustomerParams,
  DeleteCustomerParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── In-memory OTP store ──────────────────────────────────────────────────────
interface OtpEntry {
  otp: string;
  expiresAt: number;
  sentAt: number;
}
const otpStore = new Map<string, OtpEntry>();

const OTP_TTL_MS = 5 * 60 * 1000;    // 5 minutes
const OTP_RATE_MS = 60 * 1000;        // 1 SMS per 60 s per phone

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

function isValidTaiwanPhone(phone: string): boolean {
  return /^09\d{8}$/.test(phone);
}

async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  const user = process.env.EVERY8D_USER;
  const pass = process.env.EVERY8D_PASS;

  if (!user || !pass) {
    console.log(`[OTP DEV] phone=${phone}  otp=${otp}`);
    return;
  }

  const msg = `【富詠運輸】您的驗證碼為 ${otp}，5分鐘內有效，請勿外洩。`;
  const params = new URLSearchParams({ UID: user, PWD: pass, SB: "富詠運輸", MSG: msg, DEST: phone, ST: "" });

  const resp = await fetch("https://api.every8d.com/API21/HTTP/sendSMS.ashx", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error(`SMS send failed: HTTP ${resp.status}`);
  }
  const text = await resp.text();
  if (text.startsWith("-")) {
    throw new Error(`SMS API error: ${text}`);
  }
}

// ── OTP routes ───────────────────────────────────────────────────────────────

router.post("/customers/send-otp", async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone ?? "").trim();
    const phone = normalizePhone(rawPhone);

    if (!isValidTaiwanPhone(phone)) {
      return res.status(400).json({ error: "請輸入有效的台灣手機號碼（09開頭，共10位）" });
    }

    const existing = otpStore.get(phone);
    if (existing && Date.now() - existing.sentAt < OTP_RATE_MS) {
      const waitSec = Math.ceil((OTP_RATE_MS - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ error: `請等待 ${waitSec} 秒後再重新發送` });
    }

    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, phone));

    if (!customers.length) {
      return res.status(404).json({ error: "此手機號碼尚未建立客戶帳號，請聯絡客服申請" });
    }

    const otp = generateOtp();
    otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_TTL_MS, sentAt: Date.now() });

    await sendSmsOtp(phone, otp);

    const isDev = process.env.NODE_ENV !== "production";
    return res.json({ ok: true, ...(isDev ? { devOtp: otp } : {}) });
  } catch (err) {
    req.log.error({ err }, "Failed to send OTP");
    res.status(500).json({ error: "簡訊發送失敗，請稍後再試" });
  }
});

router.post("/customers/verify-otp", async (req, res) => {
  try {
    const rawPhone = String(req.body?.phone ?? "").trim();
    const phone = normalizePhone(rawPhone);
    const otp = String(req.body?.otp ?? "").trim();

    if (!isValidTaiwanPhone(phone) || !otp) {
      return res.status(400).json({ error: "請提供手機號碼與驗證碼" });
    }

    const entry = otpStore.get(phone);
    if (!entry) {
      return res.status(400).json({ error: "驗證碼不存在，請重新發送" });
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ error: "驗證碼已過期，請重新發送" });
    }
    if (entry.otp !== otp) {
      return res.status(400).json({ error: "驗證碼不正確，請重新輸入" });
    }

    otpStore.delete(phone);

    const customers = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, phone));

    const customer = customers[0];
    if (!customer) {
      return res.status(404).json({ error: "找不到此客戶帳號" });
    }

    return res.json({ id: customer.id, name: customer.name, phone: customer.phone, username: customer.username });
  } catch (err) {
    req.log.error({ err }, "Failed to verify OTP");
    res.status(500).json({ error: "驗證失敗，請稍後再試" });
  }
});

// ── Keep legacy password login for backward compat (admin tools etc.) ────────
router.post("/customers/login", async (req, res) => {
  try {
    const { phone, password } = req.body as { phone: string; password: string };
    if (!phone || !password) {
      return res.status(400).json({ error: "請提供電話與密碼" });
    }
    const results = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phone, phone));
    const customer = results[0];
    if (!customer || customer.password !== password) {
      return res.status(401).json({ error: "電話或密碼不正確" });
    }
    res.json({ id: customer.id, name: customer.name, phone: customer.phone, username: customer.username });
  } catch (err) {
    req.log.error({ err }, "Failed customer login");
    res.status(500).json({ error: "登入失敗" });
  }
});

// ── CRUD ─────────────────────────────────────────────────────────────────────

router.get("/customers", async (req, res) => {
  try {
    const customers = await db
      .select()
      .from(customersTable)
      .orderBy(customersTable.createdAt);
    res.json(customers);
  } catch (err) {
    req.log.error({ err }, "Failed to list customers");
    res.status(500).json({ error: "Failed to list customers" });
  }
});

router.post("/customers", async (req, res) => {
  try {
    const body = CreateCustomerBody.parse(req.body);
    const [customer] = await db
      .insert(customersTable)
      .values({
        name: body.name,
        phone: body.phone,
        username: body.username ?? null,
        password: body.password ?? null,
        address: body.address ?? null,
        contactPerson: body.contactPerson ?? null,
        taxId: body.taxId ?? null,
      })
      .returning();
    res.status(201).json(customer);
  } catch (err) {
    req.log.error({ err }, "Failed to create customer");
    res.status(400).json({ error: "Failed to create customer" });
  }
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const { id } = UpdateCustomerParams.parse(req.params);
    const body = UpdateCustomerBody.parse(req.body);

    const existing = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updates: Partial<typeof customersTable.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.phone !== undefined) updates.phone = body.phone;
    if ("username" in body) updates.username = body.username ?? null;
    if ("password" in body) updates.password = body.password ?? null;
    if ("address" in body) updates.address = body.address ?? null;
    if ("contactPerson" in body) updates.contactPerson = body.contactPerson ?? null;
    if ("taxId" in body) updates.taxId = body.taxId ?? null;

    const [customer] = await db
      .update(customersTable)
      .set(updates)
      .where(eq(customersTable.id, id))
      .returning();
    res.json(customer);
  } catch (err) {
    req.log.error({ err }, "Failed to update customer");
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.post("/customers/bulk", async (req, res) => {
  try {
    const { rows } = req.body as { rows: { name: string; phone: string; address?: string; contactPerson?: string; taxId?: string; username?: string; password?: string }[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }
    const values = rows.map(r => ({
      name: String(r.name ?? "").trim(),
      phone: String(r.phone ?? "").trim(),
      address: r.address ? String(r.address).trim() : null,
      contactPerson: r.contactPerson ? String(r.contactPerson).trim() : null,
      taxId: r.taxId ? String(r.taxId).trim() : null,
      username: r.username ? String(r.username).trim() : null,
      password: r.password ? String(r.password).trim() : null,
    })).filter(r => r.name && r.phone);

    if (values.length === 0) {
      return res.status(400).json({ error: "No valid rows (name and phone required)" });
    }
    const inserted = await db.insert(customersTable).values(values).returning();
    return res.status(201).json({ inserted: inserted.length, rows: inserted });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk import customers");
    return res.status(500).json({ error: "Failed to bulk import customers" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  try {
    const { id } = DeleteCustomerParams.parse(req.params);
    const existing = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, id));
    if (!existing.length) {
      return res.status(404).json({ error: "Customer not found" });
    }
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete customer");
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

export default router;
